/**
 * Logo Detector (Image Similarity Based)
 * ---------------------------------------
 * Detects whether an uploaded product image matches a genuine brand logo
 * or an AI-generated/fake logo, using perceptual image hashing (dHash).
 *
 * Reference library: logo-detection/
 *   - output/<Brand>/*.jpg       → genuine logos
 *   - genLogoOutput/<Brand>/*.jpg → fake/AI-generated logos
 *
 * How it works:
 *   1. On first call, walk both folders and compute a 64-bit dHash for every image.
 *   2. For each verification, hash the uploaded image and find the top-K
 *      closest references (by Hamming distance).
 *   3. Count how many of the top-K matches are genuine vs fake.
 *   4. Return verdict + confidence + detected brand.
 *
 * Uses sharp (already a project dep) — no heavy ML deps required.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const REFS_ROOT = path.join(__dirname, '..', '..', 'logo-detection');
const GENUINE_DIR = path.join(REFS_ROOT, 'output');
const FAKE_DIR = path.join(REFS_ROOT, 'genLogoOutput');

const HASH_WIDTH = 9;      // 9x8 dHash → 64 bits
const HASH_HEIGHT = 8;
const TOP_K = 8;           // compare against 8 closest references
const CACHE_FILE = path.join(__dirname, '.logo-hash-cache.json');

// In-memory hash database: [{ hash: bigint, path, brand, isGenuine }]
let database = null;
let dbBuildPromise = null;

/**
 * Compute a 64-bit difference hash for an image buffer.
 * dHash: resize to 9x8 grayscale, compare adjacent pixels left-to-right.
 * Each bit = 1 if left > right, else 0. Result is a 64-bit "fingerprint".
 */
async function computeHash(imageBuffer) {
  const { data } = await sharp(imageBuffer)
    .resize(HASH_WIDTH, HASH_HEIGHT, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Compare adjacent pixels in each row
  let hash = 0n;
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const left = data[y * HASH_WIDTH + x];
      const right = data[y * HASH_WIDTH + x + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

/**
 * Hamming distance between two 64-bit hashes (BigInt).
 * Returns the number of differing bits (0 = identical, 64 = completely different).
 */
function hammingDistance(a, b) {
  let xor = a ^ b;
  let dist = 0;
  while (xor !== 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return dist;
}

/**
 * Walk a directory recursively, yielding image file paths.
 */
function walkImages(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkImages(full, out);
    else if (/\.(jpe?g|png|webp|bmp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Build the reference hash database by walking output/ and genLogoOutput/.
 * Cached to disk after first build for instant startup on subsequent runs.
 */
async function buildDatabase() {
  // Try loading cache
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const db = raw.map(e => ({
        hash: BigInt(e.hash),
        path: e.path,
        brand: e.brand,
        isGenuine: e.isGenuine,
      }));
      console.log(`🏷️  [LogoDetector] Loaded ${db.length} reference hashes from cache`);
      return db;
    } catch (e) {
      console.warn('⚠️ [LogoDetector] Cache corrupt, rebuilding:', e.message);
    }
  }

  console.log('🏷️  [LogoDetector] Building reference hash database (first run)...');
  const db = [];
  const start = Date.now();

  const genuineImages = walkImages(GENUINE_DIR);
  const fakeImages = walkImages(FAKE_DIR);
  console.log(`  Scanning ${genuineImages.length} genuine + ${fakeImages.length} fake reference images...`);

  for (const [list, isGenuine] of [[genuineImages, true], [fakeImages, false]]) {
    for (const imgPath of list) {
      try {
        const buffer = fs.readFileSync(imgPath);
        const hash = await computeHash(buffer);
        // Brand is the parent folder name
        const brand = path.basename(path.dirname(imgPath));
        db.push({ hash, path: imgPath, brand, isGenuine });
      } catch (e) {
        // skip unreadable images
      }
    }
  }

  // Cache to disk (serialize BigInt as string)
  try {
    const serialized = db.map(e => ({
      hash: e.hash.toString(),
      path: e.path,
      brand: e.brand,
      isGenuine: e.isGenuine,
    }));
    fs.writeFileSync(CACHE_FILE, JSON.stringify(serialized));
  } catch (e) {
    console.warn('⚠️ [LogoDetector] Could not write cache:', e.message);
  }

  console.log(`🏷️  [LogoDetector] Built database of ${db.length} hashes in ${Date.now() - start}ms`);
  return db;
}

/**
 * Get (or lazy-build) the reference database.
 */
async function getDatabase() {
  if (database) return database;
  if (!dbBuildPromise) dbBuildPromise = buildDatabase().then(db => { database = db; return db; });
  return dbBuildPromise;
}

/**
 * Verify an uploaded logo/product image against the reference library.
 *
 * @param {Buffer} imageBuffer - raw image bytes
 * @returns {Promise<Object>} {
 *   verdict: 'Genuine' | 'Counterfeit' | 'Inconclusive',
 *   confidence: 0-100,
 *   detectedBrand: string | null,
 *   brandConfidence: 0-100,
 *   topMatches: Array<{ brand, isGenuine, distance, similarity }>,
 *   genuineMatches: number,
 *   fakeMatches: number,
 *   explanation: string,
 * }
 */
async function verifyLogo(imageBuffer) {
  const db = await getDatabase();
  if (!db || db.length === 0) {
    return {
      verdict: 'Inconclusive',
      confidence: 0,
      detectedBrand: null,
      brandConfidence: 0,
      topMatches: [],
      genuineMatches: 0,
      fakeMatches: 0,
      explanation: 'Reference logo database unavailable.',
    };
  }

  // Hash the uploaded image
  const uploadHash = await computeHash(imageBuffer);

  // Compute distance to every reference
  const distances = db.map(ref => ({
    brand: ref.brand,
    isGenuine: ref.isGenuine,
    distance: hammingDistance(uploadHash, ref.hash),
    similarity: Math.round((1 - hammingDistance(uploadHash, ref.hash) / 64) * 100),
  }));

  // Sort by distance (closest first)
  distances.sort((a, b) => a.distance - b.distance);

  // === 1. Detect brand from the CLOSEST matches (top 5) ===
  // The brand identity comes from the nearest neighbors — not the full top-K,
  // since brand-mismatched fakes can skew the count.
  const top5 = distances.slice(0, 5);
  const brandCount = {};
  top5.forEach(t => { brandCount[t.brand] = (brandCount[t.brand] || 0) + 1; });
  const brandRanking = Object.entries(brandCount).sort((a, b) => b[1] - a[1]);
  const detectedBrand = brandRanking[0]?.[0] || null;
  const brandConfidence = detectedBrand
    ? Math.round((brandRanking[0][1] / 5) * 100)
    : 0;

  // === 2. Genuine vs Fake verdict — ONLY consider references of the detected brand ===
  // This isolates the verdict from cross-brand noise in the reference library.
  const brandRefs = distances.filter(d => d.brand === detectedBrand);
  const brandTop = brandRefs.slice(0, Math.min(TOP_K, brandRefs.length));

  const genuineMatches = brandTop.filter(t => t.isGenuine).length;
  const fakeMatches = brandTop.filter(t => !t.isGenuine).length;

  // Similarity-weighted scoring — closer matches count more
  const genuineScore = brandTop
    .filter(t => t.isGenuine)
    .reduce((s, t) => s + t.similarity, 0);
  const fakeScore = brandTop
    .filter(t => !t.isGenuine)
    .reduce((s, t) => s + t.similarity, 0);

  // === 3. Account for DB imbalance ===
  // If the brand has 5 genuine + 10 fake images in the DB, we expect more fake
  // matches by chance. Normalize scores by reference counts.
  const genuineRefs = brandRefs.filter(r => r.isGenuine).length || 1;
  const fakeRefs = brandRefs.filter(r => !r.isGenuine).length || 1;
  const normGenuineScore = genuineScore / genuineRefs;
  const normFakeScore = fakeScore / fakeRefs;

  // Top match (most similar single reference)
  const topMatch = distances[0];
  const topSimilarity = topMatch.similarity;

  // === 4. Final verdict ===
  let verdict, confidence, explanation;

  if (topSimilarity < 30) {
    // Doesn't resemble any logo in the library
    verdict = 'Inconclusive';
    confidence = topSimilarity;
    explanation = `The image doesn't closely resemble any logo in our reference library (best match: ${topSimilarity}% to ${detectedBrand}). It may not be a brand logo, or the logo is obscured/modified.`;
  } else if (topSimilarity >= 90) {
    // Very strong match — trust the top match's label directly
    verdict = topMatch.isGenuine ? 'Genuine' : 'Counterfeit';
    confidence = topSimilarity;
    explanation = topMatch.isGenuine
      ? `Exact match found — this is a genuine ${detectedBrand} logo (${topSimilarity}% similarity).`
      : `Exact match to a known AI-generated fake ${detectedBrand} logo (${topSimilarity}% similarity) — this is a counterfeit.`;
  } else if (normGenuineScore > normFakeScore * 1.1) {
    // Genuine score clearly higher (with 10% margin for noise)
    verdict = 'Genuine';
    confidence = Math.round((topSimilarity + (normGenuineScore / Math.max(1, normGenuineScore + normFakeScore)) * 100) / 2);
    explanation = `Closest matches are mostly genuine ${detectedBrand} references (${genuineMatches} genuine vs ${fakeMatches} fake among brand matches).`;
  } else if (normFakeScore > normGenuineScore * 1.1) {
    verdict = 'Counterfeit';
    confidence = Math.round((topSimilarity + (normFakeScore / Math.max(1, normGenuineScore + normFakeScore)) * 100) / 2);
    explanation = `Closest matches are mostly AI-generated fake ${detectedBrand} logos (${fakeMatches} fake vs ${genuineMatches} genuine) — likely counterfeit.`;
  } else {
    verdict = 'Inconclusive';
    confidence = Math.round(topSimilarity * 0.5);
    explanation = `Similar to both genuine and fake ${detectedBrand} references — cannot determine authenticity with high confidence.`;
  }

  // Top matches for the UI (include all brands for transparency)
  const topMatches = distances.slice(0, TOP_K);

  return {
    verdict,
    confidence: Math.min(100, Math.max(0, Math.round(confidence))),
    detectedBrand,
    brandConfidence,
    topMatches,
    genuineMatches,
    fakeMatches,
    topSimilarity,
    explanation,
  };
}

module.exports = { verifyLogo, getDatabase };
