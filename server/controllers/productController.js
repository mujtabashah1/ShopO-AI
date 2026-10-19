/**
 * Product Controller
 * ------------------
 * Handles product search requests.
 *
 * Flow:
 *   1. Check if forceRefresh is requested — if so, skip cache
 *   2. Check MongoDB cache for recent identical search
 *   3. If cache hit → return cached products (with cachedAt timestamp)
 *   4. If cache miss or forceRefresh → check extension or run scrapers
 *
 * Scraping priority:
 *   1. Chrome Extension (if connected) — uses real browser sessions, no bot detection
 *   2. Puppeteer scrapers (fallback) — headless browser with stealth plugin
 */

const Search = require('../models/Search');
const { scrapeAll, normalizeQuery, isRelevant, calculateTrustScore, checkCaution } = require('../scrapers');
const extensionManager = require('../extension/extensionManager');
const { parseHTML } = require('../extension/htmlParser');

/**
 * Process raw HTML results from extension into products array.
 * Applies same filtering/scoring as scrapeAll().
 */
function processExtensionResults(htmlResults, query, platforms) {
  let allProducts = [];
  const platformResults = {};

  for (const platform of platforms) {
    const result = htmlResults[platform];
    if (!result || result.error || !result.html) {
      platformResults[platform] = {
        status: 'failed',
        count: 0,
        error: result?.error || 'No HTML received',
        source: 'extension'
      };
      continue;
    }

    try {
      const products = parseHTML(result.html, platform, query);
      if (products.length > 0) {
        platformResults[platform] = { status: 'success', count: products.length, source: 'extension' };
        allProducts = allProducts.concat(products);
      } else {
        platformResults[platform] = { status: 'failed', count: 0, error: 'No products parsed', source: 'extension' };
      }
    } catch (err) {
      console.error(`  ❌ Error parsing ${platform} HTML:`, err.message);
      platformResults[platform] = { status: 'failed', count: 0, error: err.message, source: 'extension' };
    }
  }

  // Deduplication
  const seen = new Set();
  allProducts = allProducts.filter(p => {
    const key = p.link && p.link !== '#' ? p.link.split('?')[0] : `${p.platform}::${p.name.toLowerCase().substring(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Relevance filtering
  allProducts = allProducts.filter(p => isRelevant(p.name, query));

  // Price outlier detection
  if (allProducts.length >= 3) {
    const sortedPrices = allProducts.map(p => p.price).sort((a, b) => a - b);
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
    if (medianPrice > 0) {
      allProducts = allProducts.filter(p => (p.price / medianPrice) >= 0.05);
    }
  }

  // Trust scores + caution flags
  const avgPrice = allProducts.length > 0
    ? allProducts.reduce((sum, p) => sum + p.price, 0) / allProducts.length
    : 0;

  allProducts.forEach(product => {
    product.trustScore = calculateTrustScore(product, avgPrice);
    const caution = checkCaution(product, avgPrice);
    product.isCaution = caution.isCaution;
    product.cautionReason = caution.reason;
    if (product.originalPrice && product.originalPrice > product.price) {
      product.discount = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    }
  });

  // Sort by price ascending
  allProducts.sort((a, b) => a.price - b.price);

  // Tag best deal
  const safeCandidates = allProducts.filter(p => !p.isCaution);
  const candidates = safeCandidates.length > 0 ? safeCandidates : allProducts;
  if (candidates.length > 0) {
    let bestIdx = 0, bestRatio = 0;
    candidates.forEach((p, i) => {
      const ratio = p.price > 0 ? p.trustScore / p.price : 0;
      if (ratio > bestRatio) { bestRatio = ratio; bestIdx = i; }
    });
    candidates[bestIdx].isBestDeal = true;
  }

  return { products: allProducts, platformResults };
}

/**
 * GET /api/products/search?q=iPhone+15&platforms=ebay,amazon&forceRefresh=true
 */
const searchProducts = async (req, res) => {
  try {
    const { q, platforms, forceRefresh } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ message: 'Search query is required.' });
    }

    const query = normalizeQuery(q.trim().toLowerCase()) || q.trim().toLowerCase();
    const shouldRefresh = forceRefresh === 'true';

    const platformList = platforms
      ? platforms.split(',').map(p => p.trim().toLowerCase())
      : ['aliexpress', 'ebay', 'amazon', 'daraz'];

    const validPlatforms = ['aliexpress', 'ebay', 'amazon', 'daraz'];
    const filteredPlatforms = platformList.filter(p => validPlatforms.includes(p));

    if (filteredPlatforms.length === 0) {
      return res.status(400).json({ message: 'No valid platforms selected.' });
    }

    // Step 1: Check cache
    if (!shouldRefresh) {
      const cachedSearch = await Search.findOne({
        query,
        platforms: { $all: filteredPlatforms, $size: filteredPlatforms.length }
      }).sort({ createdAt: -1 });

      if (cachedSearch) {
        console.log(`📦 Cache hit for "${query}" — returning cached results`);
        return res.json({
          products: cachedSearch.products,
          cached: true,
          cachedAt: cachedSearch.createdAt,
          platformResults: {},
          totalProducts: cachedSearch.products.length,
          scrapeMethod: 'cache'
        });
      }
    } else {
      console.log(`🔄 Force refresh for "${query}" — bypassing cache`);
    }

    // Step 2: Scrape products
    // HYBRID APPROACH:
    //   - AliExpress → use Chrome Extension if connected (avoids CAPTCHA)
    //   - eBay, Amazon, Daraz → always use Puppeteer (more reliable, multi-page)
    let products = [];
    let platformResults = {};
    let scrapeMethod = 'puppeteer';
    const hasExtension = extensionManager.isExtensionConnected(req.user.userId);

    // Split platforms: AliExpress via extension, rest via Puppeteer
    const puppeteerPlatforms = filteredPlatforms.filter(p => p !== 'aliexpress');
    const aliexpressRequested = filteredPlatforms.includes('aliexpress');

    // Run Puppeteer scrapers for non-AliExpress platforms
    const puppeteerPromise = puppeteerPlatforms.length > 0
      ? scrapeAll(query, puppeteerPlatforms)
      : Promise.resolve({ products: [], platformResults: {} });

    // Run AliExpress via extension if connected, otherwise via Puppeteer
    let aliexpressPromise;
    if (aliexpressRequested && hasExtension) {
      console.log(`🔌 Using Chrome Extension for AliExpress, Puppeteer for [${puppeteerPlatforms.join(', ')}]`);
      scrapeMethod = 'hybrid';
      aliexpressPromise = extensionManager.createSearchTask(
        req.user.userId, query, ['aliexpress']
      ).then(extResult => {
        if (extResult.timedOut) console.log(`⚠️ Extension timed out for AliExpress`);
        return processExtensionResults(extResult.results || {}, query, ['aliexpress']);
      }).catch(err => {
        console.error(`❌ Extension error for AliExpress:`, err.message, `— falling back to Puppeteer`);
        return scrapeAll(query, ['aliexpress']);
      });
    } else if (aliexpressRequested) {
      // No extension — AliExpress via Puppeteer too
      console.log(`🔄 ${shouldRefresh ? 'Force refreshing' : 'Cache miss for'} "${query}" — running all scrapers...`);
      aliexpressPromise = scrapeAll(query, ['aliexpress']);
    } else {
      aliexpressPromise = Promise.resolve({ products: [], platformResults: {} });
    }

    // Run both in parallel
    const [puppeteerResult, aliResult] = await Promise.all([puppeteerPromise, aliexpressPromise]);

    products = [...puppeteerResult.products, ...aliResult.products];
    platformResults = { ...puppeteerResult.platformResults, ...aliResult.platformResults };

    // Step 3: Cache results
    if (products.length > 0) {
      await Search.deleteMany({
        query,
        platforms: { $all: filteredPlatforms, $size: filteredPlatforms.length }
      });

      const searchDoc = new Search({
        user: req.user.userId,
        query,
        platforms: filteredPlatforms,
        products
      });
      await searchDoc.save();
    }

    res.json({
      products,
      cached: false,
      platformResults,
      totalProducts: products.length,
      scrapeMethod
    });

  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({
      message: 'An error occurred while searching. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/products/search/stream?q=iPhone+15&platforms=ebay,amazon
 *
 * Server-Sent Events endpoint — streams results as each platform finishes.
 * Events:
 *   - platform_start: { platform }
 *   - platform_done:  { platform, products[], count, status }
 *   - search_complete: { totalProducts, platformResults }
 *   - error: { message }
 *   - cached: full cached response (sent immediately, then close)
 */
const { scraperMap } = require('../scrapers');
const { filterByAIRelevance } = require('../utils/aiRelevance');

const streamSearchProducts = async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // disable nginx buffering
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { q, platforms, forceRefresh } = req.query;

    if (!q || q.trim().length === 0) {
      sendEvent('error', { message: 'Search query is required.' });
      res.end();
      return;
    }

    const query = normalizeQuery(q.trim().toLowerCase()) || q.trim().toLowerCase();
    const shouldRefresh = forceRefresh === 'true';

    const platformList = platforms
      ? platforms.split(',').map(p => p.trim().toLowerCase())
      : ['aliexpress', 'ebay', 'amazon', 'daraz'];

    const validPlatforms = ['aliexpress', 'ebay', 'amazon', 'daraz'];
    const filteredPlatforms = platformList.filter(p => validPlatforms.includes(p));

    if (filteredPlatforms.length === 0) {
      sendEvent('error', { message: 'No valid platforms selected.' });
      res.end();
      return;
    }

    // Check cache first
    if (!shouldRefresh) {
      const cachedSearch = await Search.findOne({
        query,
        platforms: { $all: filteredPlatforms, $size: filteredPlatforms.length }
      }).sort({ createdAt: -1 });

      if (cachedSearch) {
        sendEvent('cached', {
          products: cachedSearch.products,
          cached: true,
          cachedAt: cachedSearch.createdAt,
          totalProducts: cachedSearch.products.length,
          scrapeMethod: 'cache'
        });
        res.end();
        return;
      }
    }

    // Signal: starting each platform
    sendEvent('search_start', { query, platforms: filteredPlatforms });

    const hasExtension = extensionManager.isExtensionConnected(req.user.userId);
    // LLM filtering is OPT-IN now — the strict heuristic in isRelevant() does
    // most of the work. Set USE_LLM_FILTER=true in .env to re-enable AI filtering.
    const hasLlmKey = !!(process.env.LLM_API_KEY || process.env.XAI_API_KEY)
                   && process.env.USE_LLM_FILTER === 'true';
    let allProducts = [];
    const platformResults = {};
    const scrapeMethod = hasExtension ? 'hybrid' : 'puppeteer';

    // Launch each platform scraper independently and stream results
    const platformPromises = filteredPlatforms.map(async (platform) => {
      sendEvent('platform_start', { platform });

      try {
        let products = [];

        // AliExpress: use extension if available
        if (platform === 'aliexpress' && hasExtension) {
          const extResult = await extensionManager.createSearchTask(
            req.user.userId, query, ['aliexpress']
          );
          const processed = processExtensionResults(extResult.results || {}, query, ['aliexpress']);
          products = processed.products;

          // Fallback to Puppeteer if extension got nothing
          if (products.length === 0 && scraperMap[platform]) {
            products = await scraperMap[platform](query);
          }
        } else if (scraperMap[platform]) {
          products = await scraperMap[platform](query);
        }

        // Tag platform on each product (some scrapers already do this)
        products.forEach(p => {
          if (!p.platform) p.platform = platform.charAt(0).toUpperCase() + platform.slice(1);
        });

        // Apply heuristic relevance filter (fast pre-filter)
        const rawCount = products.length;
        const rejectedSamples = [];
        products = products.filter(p => {
          const keep = isRelevant(p.name, query);
          if (!keep && rejectedSamples.length < 3) {
            rejectedSamples.push({
              name: p.name.substring(0, 80),
              price: p.displayPrice || p.price
            });
          }
          return keep;
        });
        const afterHeuristic = products.length;
        const heuristicRejected = rawCount - afterHeuristic;

        if (heuristicRejected > 0) {
          console.log(`🚫 [${platform}] Rejected ${heuristicRejected}/${rawCount} as accessories/irrelevant. Samples:`);
          rejectedSamples.forEach(s => console.log(`  ❌ "${s.name}" (${s.price})`));
        }

        // Dedup by link
        const seen = new Set();
        products = products.filter(p => {
          const key = p.link && p.link !== '#' ? p.link.split('?')[0] : `${p.platform}::${p.name.toLowerCase().substring(0, 60)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // === Price outlier filter (per platform) ===
        // Accessories are typically 1-10% of the real product price. Use P90
        // (90th percentile) as reference — even when accessories dominate the
        // results, the top 10% of prices represent real products.
        // Applies only when we have enough samples (>=4) AND the reference is substantial (>=$30).
        if (products.length >= 4) {
          const sortedPrices = products.map(p => p.price).filter(p => p > 0).sort((a, b) => a - b);
          if (sortedPrices.length >= 4) {
            // Use P90 — item at 90th percentile is almost always a real product
            // (unlike median, which gets pulled down when accessories dominate)
            const p90Idx = Math.min(sortedPrices.length - 1, Math.floor(sortedPrices.length * 0.9));
            const referencePrice = sortedPrices[p90Idx];

            if (referencePrice >= 30) {
              const threshold = referencePrice * 0.10;
              const beforeOutlier = products.length;
              const outlierSamples = [];
              products = products.filter(p => {
                if (p.price > 0 && p.price < threshold) {
                  if (outlierSamples.length < 3) {
                    outlierSamples.push({ name: p.name.substring(0, 70), price: p.displayPrice || p.price });
                  }
                  return false;
                }
                return true;
              });
              const removedOutliers = beforeOutlier - products.length;
              if (removedOutliers > 0) {
                console.log(`💰 [${platform}] Removed ${removedOutliers} price-outlier accessories (P90=$${referencePrice.toFixed(0)}, threshold=$${threshold.toFixed(2)}):`);
                outlierSamples.forEach(s => console.log(`  ❌ "${s.name}" (${s.price})`));
              }
            }
          }
        }

        // === AI Relevance Filter (per-platform, before sending to client) ===
        // This ensures the user NEVER sees irrelevant products, even briefly.
        let aiRejected = 0;
        if (hasLlmKey && products.length > 0) {
          sendEvent('platform_ai_start', { platform, count: products.length });
          try {
            const aiResult = await filterByAIRelevance(products, query);
            if (aiResult.used) {
              aiRejected = aiResult.rejected.length;
              if (aiRejected > 0) {
                console.log(`🤖 [${platform}] AI rejected ${aiRejected} of ${products.length}:`);
                aiResult.rejected.slice(0, 5).forEach(p => {
                  console.log(`  ❌ "${p.name.substring(0, 70)}" — ${p._rejectReason}`);
                });
              }
              products = aiResult.kept;
            }
          } catch (aiErr) {
            console.warn(`⚠️ [${platform}] AI filter failed: ${aiErr.message} — keeping heuristic results`);
          }
        }

        platformResults[platform] = {
          status: products.length > 0 ? 'success' : 'failed',
          count: products.length,
          rawCount,
          heuristicRejected,
          error: products.length === 0
            ? (rawCount > 0 ? `${rawCount} scraped, all filtered as accessories/irrelevant` : 'No products found')
            : undefined
        };

        allProducts = allProducts.concat(products);

        // Stream ONLY the AI-filtered products (user never sees junk)
        sendEvent('platform_done', {
          platform,
          products,
          count: products.length,
          status: platformResults[platform].status,
          error: platformResults[platform].error,
          rawCount,
          heuristicRejected,
          heuristicFiltered: rawCount - afterHeuristic,
          aiFiltered: aiRejected
        });

      } catch (err) {
        console.error(`❌ [${platform}] Stream error:`, err.message);
        platformResults[platform] = { status: 'failed', count: 0, error: err.message };
        sendEvent('platform_done', {
          platform,
          products: [],
          count: 0,
          status: 'failed',
          error: err.message
        });
      }
    });

    // Wait for ALL platforms to finish (each already ran AI filter individually)
    await Promise.allSettled(platformPromises);

    // === Combined price outlier filter across ALL platforms ===
    // Per-platform filter can fail when one platform is dominated by accessories
    // (its local P90 is still cheap). By combining all platforms, we use the
    // globally most-expensive products as reference — real phones on eBay/Amazon
    // raise the threshold, catching cheap cases that slipped through.
    allProducts = allProducts.filter(p => p.price >= 0.5);

    if (allProducts.length >= 6) {
      const sortedPrices = allProducts.map(p => p.price).filter(p => p > 0).sort((a, b) => a - b);
      if (sortedPrices.length >= 6) {
        // P90 across all platforms — real products dominate the top 10%
        const p90Idx = Math.min(sortedPrices.length - 1, Math.floor(sortedPrices.length * 0.9));
        const reference = sortedPrices[p90Idx];
        if (reference >= 30) {
          const threshold = reference * 0.10;
          const before = allProducts.length;
          const removedByPlatform = {};
          allProducts = allProducts.filter(p => {
            if (p.price > 0 && p.price < threshold) {
              const plat = (p.platform || 'unknown').toLowerCase();
              removedByPlatform[plat] = (removedByPlatform[plat] || 0) + 1;
              return false;
            }
            return true;
          });
          const removed = before - allProducts.length;
          if (removed > 0) {
            console.log(`💰 Global price outlier filter: removed ${removed} products (P90=$${reference.toFixed(0)}, threshold=$${threshold.toFixed(2)})`);
            Object.entries(removedByPlatform).forEach(([plat, n]) => {
              console.log(`  ❌ [${plat}] -${n} products`);
            });
          }
        }
      }
    }

    // Sync platformResults to reflect the FINAL counts (after all filtering).
    // Without this the sidebar shows pre-filter counts which can mislead the user.
    for (const platform of Object.keys(platformResults)) {
      const finalCount = allProducts.filter(p =>
        p.platform && p.platform.toLowerCase() === platform.toLowerCase()
      ).length;
      platformResults[platform].count = finalCount;
      if (finalCount > 0) platformResults[platform].status = 'success';
    }

    // Trust scores + caution flags
    const avgPrice = allProducts.length > 0
      ? allProducts.reduce((sum, p) => sum + p.price, 0) / allProducts.length
      : 0;

    allProducts.forEach(product => {
      product.trustScore = calculateTrustScore(product, avgPrice);
      const caution = checkCaution(product, avgPrice);
      product.isCaution = caution.isCaution;
      product.cautionReason = caution.reason;
    });

    // Sort by price
    allProducts.sort((a, b) => a.price - b.price);

    // Tag best deal
    const safeCandidates = allProducts.filter(p => !p.isCaution);
    const candidates = safeCandidates.length > 0 ? safeCandidates : allProducts;
    if (candidates.length > 0) {
      let bestIdx = 0, bestRatio = 0;
      candidates.forEach((p, i) => {
        const ratio = p.price > 0 ? p.trustScore / p.price : 0;
        if (ratio > bestRatio) { bestRatio = ratio; bestIdx = i; }
      });
      candidates[bestIdx].isBestDeal = true;
    }

    // Send final complete event with scored products (AI-filtered + scored)
    sendEvent('search_complete', {
      products: allProducts,
      platformResults,
      totalProducts: allProducts.length,
      scrapeMethod,
      aiFiltered: hasLlmKey
    });

    // Cache results
    if (allProducts.length > 0) {
      await Search.deleteMany({
        query,
        platforms: { $all: filteredPlatforms, $size: filteredPlatforms.length }
      });
      const searchDoc = new Search({
        user: req.user.userId,
        query,
        platforms: filteredPlatforms,
        products: allProducts
      });
      await searchDoc.save().catch(err => console.error('Cache save error:', err.message));
    }

    res.end();

  } catch (error) {
    console.error('Stream search error:', error.message);
    try {
      sendEvent('error', { message: 'An error occurred while searching.' });
    } catch (e) { /* response already closed */ }
    res.end();
  }
};

/**
 * POST /api/products/identify-image
 *
 * Accepts an uploaded image, uses Gemini Vision to identify the product,
 * and returns a search query the frontend can use to trigger /search/stream.
 */
const identifyProductFromImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image.' });
    }

    const gemini = require('../utils/geminiVision');
    if (!gemini.isAvailable()) {
      return res.status(503).json({
        message: 'Image identification unavailable — GEMINI_API_KEY not configured on server.'
      });
    }

    console.log(`📸 [identify-image] Analyzing ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    const result = await gemini.identifyProduct(req.file.buffer, req.file.mimetype);

    console.log(`📸 [identify-image] Detected: "${result.query}" (${result.confidence} confidence)`);

    res.json({
      query: result.query,
      brand: result.brand,
      model: result.model,
      productType: result.productType,
      confidence: result.confidence,
    });
  } catch (error) {
    console.error('Image identification error:', error.message);
    const status = error.rateLimited ? 429 : 500;
    res.status(status).json({
      message: error.rateLimited
        ? 'Gemini AI is rate-limited (free tier: 15 requests/min). Please wait 30 seconds and try again.'
        : 'Could not identify product from image. Please try again or search by text.',
      rateLimited: !!error.rateLimited,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { searchProducts, streamSearchProducts, identifyProductFromImage };
