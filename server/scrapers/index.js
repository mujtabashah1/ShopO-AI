/**
 * Scraper Orchestrator
 * --------------------
 * Central module that coordinates all 4 platform scrapers.
 * 
 * Features:
 *   - Runs selected scrapers concurrently using Promise.allSettled()
 *   - Merges results from all platforms into a single array
 *   - Sorts products by price (ascending)
 *   - Tags the cheapest product as "Best Deal"
 *   - Filters out irrelevant products (cases, covers, accessories)
 *   - Gracefully handles individual scraper failures
 * 
 * Usage:
 *   const { scrapeAll } = require('./scrapers');
 *   const products = await scrapeAll('iPhone 15', ['ebay', 'amazon']);
 */

const scrapeEbay = require('./ebay');
const scrapeAliExpress = require('./aliexpress');
const scrapeAmazon = require('./amazon');
const scrapeDaraz = require('./daraz');

// Map platform names to their scraper functions
const scraperMap = {
  ebay: scrapeEbay,
  aliexpress: scrapeAliExpress,
  amazon: scrapeAmazon,
  daraz: scrapeDaraz
};

/**
 * Normalize search query for consistent results across platforms.
 * Inspired by ShopSense's normalize_product_name() function.
 * 
 * - Strips special characters that confuse search engines
 * - Normalizes whitespace
 * - Preserves model numbers and hyphens in product names
 * 
 * @param {string} query - Raw user search query
 * @returns {string} Cleaned query
 */
const normalizeQuery = (query) => {
  if (!query) return '';
  return query
    .replace(/[^a-zA-Z0-9\s\-+.]/g, ' ')  // Remove special chars except hyphens, plus, dots
    .replace(/\s+/g, ' ')                   // Collapse multiple spaces
    .trim();
};

/**
 * Pure algorithmic relevance filter — NO hardcoded category words.
 *
 * Only three rules, all category-agnostic:
 *
 *   1. "[accessory] for [product]" pattern
 *      e.g., "Silicone Case for iPhone 15" → rejected because "iPhone 15" is AFTER
 *      "for" and the non-query words "Silicone Case" are BEFORE.
 *      This is a LINGUISTIC pattern, not a category list.
 *
 *   2. "Compatible with [product]" pattern
 *      Same linguistic convention — these are fit-specific, not the product itself.
 *
 *   3. Token overlap
 *      - Query has a digit (model-specific, e.g., "iphone 17 pro max"):
 *          ALL query tokens must appear in product name.
 *      - Query has no digit (category, e.g., "gaming headphones"):
 *          At least 50% of query tokens must appear (allows synonyms like headset/headphones).
 *
 * No blocklists. No whitelists. Works for any product category.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'at', 'to', 'from'
]);

const isRelevant = (productName, searchQuery) => {
  const nameLower = productName.toLowerCase().trim();
  const queryLower = searchQuery.toLowerCase().trim();

  const queryTokens = queryLower.split(/\s+/).filter(w => w.length >= 3);
  const hasModelNumber = /\d/.test(queryLower);

  // === Rule 1: "[accessory] for [query-product]" ===
  // Detects the English convention where accessories are titled
  //   "<accessory name> for <what it fits>"
  // Reject only when the "for" clause contains query tokens AND the prefix doesn't.
  if (/^for\s+/i.test(nameLower)) {
    const afterFor = nameLower.replace(/^for\s+/i, '');
    if (queryTokens.some(w => afterFor.includes(w))) return false;
  }

  const forMatch = nameLower.match(/^(.+?)\bfor\b\s+(.+)/i);
  if (forMatch) {
    const before = forMatch[1];
    const after = forMatch[2];
    const afterHas = queryTokens.some(w => after.includes(w));
    const beforeHas = queryTokens.some(w => before.includes(w));
    if (afterHas && !beforeHas) return false;
  }

  // === Rule 2: "Compatible with [query-product]" ===
  if (/\bcompatible\s+with\b/i.test(nameLower)) {
    const afterCompat = nameLower.replace(/^.*\bcompatible\s+with\s*/i, '');
    if (queryTokens.some(w => afterCompat.includes(w))) return false;
  }

  // === Rule 3: Token overlap ===
  const sigTokens = queryLower.split(/\s+/).filter(t => t.length >= 2 && !STOP_WORDS.has(t));
  if (sigTokens.length === 0) return true;

  let matchCount = 0;
  for (const token of sigTokens) {
    const isNum = /^\d+$/.test(token);
    let matched;
    if (isNum) {
      // Number must match as whole word (so "17" doesn't match "1700" or "172")
      matched = new RegExp(`(^|[^\\d])${token}([^\\d]|$)`).test(nameLower);
    } else if (token.length <= 2) {
      matched = new RegExp(`\\b${token}\\b`, 'i').test(nameLower);
    } else {
      matched = nameLower.includes(token);
    }
    if (matched) matchCount++;
  }

  if (hasModelNumber) {
    // Model-specific: ALL tokens must match
    if (matchCount < sigTokens.length) return false;
  } else {
    // Category: at least 50% match (allows synonyms)
    if (matchCount / sigTokens.length < 0.5) return false;
  }

  return true;
};

/**
 * Calculate a Trust Score (0-100) for a product based on:
 *   - Seller/product rating (40%)
 *   - Review count (30%)
 *   - Price deviation from average (30%)
 *
 * @param {Object} product - Product data
 * @param {number} averagePrice - Average price across all results
 * @returns {number} Trust score 0-100
 */
const calculateTrustScore = (product, averagePrice) => {
  // 1. Rating score (0-40): Higher rating = more trust
  const rating = product.rating || 0;
  const ratingScore = Math.min(40, (rating / 5) * 40);

  // 2. Review count score (0-30): More reviews = more trust
  const reviewCount = product.reviewCount || 0;
  let reviewScore;
  if (reviewCount >= 100) reviewScore = 30;
  else if (reviewCount >= 50) reviewScore = 25;
  else if (reviewCount >= 20) reviewScore = 20;
  else if (reviewCount >= 5) reviewScore = 12;
  else reviewScore = 3;

  // 3. Price deviation score (0-30): Prices too far from average are suspicious
  let priceScore = 15; // Default: neutral
  if (averagePrice > 0 && product.price > 0) {
    const deviation = (product.price - averagePrice) / averagePrice;
    if (deviation >= -0.15 && deviation <= 0.15) {
      priceScore = 30;
    } else if (deviation >= -0.30 && deviation <= 0.30) {
      priceScore = 22;
    } else if (deviation < -0.30) {
      priceScore = 5;
    } else {
      priceScore = 15;
    }
  }

  return Math.round(ratingScore + reviewScore + priceScore);
};

/**
 * Check if a product should be flagged as "Caution" (high scam probability).
 * Conditions: price >30% below average AND trust score < 40
 *
 * @param {Object} product - Product with trustScore and price
 * @param {number} averagePrice - Average price
 * @returns {{ isCaution: boolean, reason: string }}
 */
const checkCaution = (product, averagePrice) => {
  if (averagePrice <= 0 || product.price <= 0) {
    return { isCaution: false, reason: '' };
  }

  const priceDeviation = (averagePrice - product.price) / averagePrice;
  const isTooChep = priceDeviation > 0.30;
  const isLowTrust = product.trustScore < 40;

  if (isTooChep && isLowTrust) {
    return {
      isCaution: true,
      reason: `Price is ${Math.round(priceDeviation * 100)}% below average with low trust score (${product.trustScore}/100). High scam probability.`
    };
  }

  if (isTooChep) {
    return {
      isCaution: true,
      reason: `Price is ${Math.round(priceDeviation * 100)}% below average. Exercise caution.`
    };
  }

  return { isCaution: false, reason: '' };
};

/**
 * Main function: Scrape products from multiple platforms concurrently.
 * 
 * @param {string} query - Search term (e.g., "iPhone 15 Pro")
 * @param {string[]} platforms - Array of platform names to search
 * @returns {Object} { products: Array, platformResults: Object }
 */
const scrapeAll = async (query, platforms = ['ebay', 'aliexpress', 'amazon', 'daraz']) => {
  // Normalize query to prevent weird search results from special characters
  // (Inspired by ShopSense's normalize_product_name pattern)
  const normalizedQuery = normalizeQuery(query);
  const searchQuery = normalizedQuery || query; // fallback to raw if normalization blanks it
  console.log(`\n🛒 Starting search for: "${searchQuery}" on [${platforms.join(', ')}]`);

  // Create an array of scraper promises for selected platforms
  const scraperPromises = platforms
    .filter(p => scraperMap[p])
    .map(platform => ({
      platform,
      promise: scraperMap[platform](searchQuery)
    }));

  // Run all scrapers concurrently
  const results = await Promise.allSettled(
    scraperPromises.map(s => s.promise)
  );

  // Collect results and track per-platform stats
  let allProducts = [];
  const platformResults = {};

  results.forEach((result, index) => {
    const platformName = scraperPromises[index].platform;

    if (result.status === 'fulfilled' && result.value.length > 0) {
      platformResults[platformName] = {
        status: 'success',
        count: result.value.length
      };
      allProducts = allProducts.concat(result.value);
    } else if (result.status === 'rejected') {
      const errorMsg = result.reason?.message || 'Scraper error';
      console.error(`  ❌ [${platformName}] Scraper rejected: ${errorMsg}`);
      platformResults[platformName] = {
        status: 'failed',
        count: 0,
        error: errorMsg
      };
    } else {
      console.log(`  ⚠️ [${platformName}] Returned 0 products`);
      platformResults[platformName] = {
        status: 'failed',
        count: 0,
        error: 'No products found'
      };
    }
  });

  // ===== DEDUPLICATION =====
  // Remove duplicate products (same name from same platform, or same link).
  // Inspired by ebay-scrapy-scraper's data validation pipeline approach.
  {
    const seen = new Set();
    const beforeDedup = allProducts.length;
    allProducts = allProducts.filter(p => {
      // Deduplicate by link (most reliable)
      const key = p.link && p.link !== '#' ? p.link.split('?')[0] : `${p.platform}::${p.name.toLowerCase().substring(0, 60)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (allProducts.length < beforeDedup) {
      console.log(`  🔄 Removed ${beforeDedup - allProducts.length} duplicate(s)`);
    }
  }

  // ===== RELEVANCE FILTERING =====
  // Filter out irrelevant products (accessories, cases, etc.)
  const beforeFilter = allProducts.length;
  allProducts = allProducts.filter(p => {
    const relevant = isRelevant(p.name, searchQuery);
    if (!relevant) {
      console.log(`  🚫 Filtered out: "${p.name.substring(0, 60)}" ($${p.price}) [${p.platform}]`);
    }
    return relevant;
  });
  if (allProducts.length < beforeFilter) {
    console.log(`  📊 Relevance filter removed ${beforeFilter - allProducts.length} of ${beforeFilter} products`);
  }

  // ===== PRICE OUTLIER DETECTION =====
  // Remove extreme price outliers that are likely scraping errors
  // (e.g., coupon amounts scraped as product prices).
  // A product priced at <5% of the median is almost certainly wrong.
  if (allProducts.length >= 3) {
    const sortedPrices = allProducts.map(p => p.price).sort((a, b) => a - b);
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
    
    if (medianPrice > 0) {
      const beforeCount = allProducts.length;
      allProducts = allProducts.filter(p => {
        const ratio = p.price / medianPrice;
        // Flag products priced at <5% of median as likely scraping errors
        if (ratio < 0.05) {
          console.log(`  ⚠️ Removing price outlier: "${p.name.substring(0, 50)}" at $${p.price} (median: $${medianPrice.toFixed(2)}) — likely coupon/deposit amount`);
          return false;
        }
        return true;
      });
      if (allProducts.length < beforeCount) {
        console.log(`  📊 Removed ${beforeCount - allProducts.length} price outlier(s)`);
      }
    }
  }

  // Calculate average price for trust scoring
  const avgPrice = allProducts.length > 0
    ? allProducts.reduce((sum, p) => sum + p.price, 0) / allProducts.length
    : 0;

  // Add trust scores and caution flags to each product
  allProducts.forEach(product => {
    product.trustScore = calculateTrustScore(product, avgPrice);
    const caution = checkCaution(product, avgPrice);
    product.isCaution = caution.isCaution;
    product.cautionReason = caution.reason;

    // Calculate discount if originalPrice is available
    if (product.originalPrice && product.originalPrice > product.price) {
      product.discount = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    }
  });

  // Update platformResults to reflect actual counts after filtering
  // (raw counts from scrapers may differ after dedup + relevance + price outlier filters)
  for (const platform of Object.keys(platformResults)) {
    if (platformResults[platform].status === 'success') {
      const actualCount = allProducts.filter(p => p.platform.toLowerCase() === platform).length;
      platformResults[platform].count = actualCount;
      if (actualCount === 0) {
        platformResults[platform].status = 'filtered';
        platformResults[platform].error = 'All results filtered (irrelevant or duplicates)';
      }
    }
  }

  // Sort by price ascending (cheapest first)
  allProducts.sort((a, b) => a.price - b.price);

  // Tag "Best Deal" — highest trust-to-value ratio (trust / price)
  // Only consider non-cautioned products for best deal
  const safeCandidates = allProducts.filter(p => !p.isCaution);
  const candidates = safeCandidates.length > 0 ? safeCandidates : allProducts;

  if (candidates.length > 0) {
    let bestIdx = 0;
    let bestRatio = 0;
    candidates.forEach((p, i) => {
      const ratio = p.price > 0 ? p.trustScore / p.price : 0;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIdx = i;
      }
    });
    candidates[bestIdx].isBestDeal = true;
  }

  console.log(`✅ Search complete: ${allProducts.length} total products from ${Object.keys(platformResults).length} platforms\n`);

  return { products: allProducts, platformResults };
};

module.exports = { scrapeAll, scraperMap, isRelevant, calculateTrustScore, checkCaution, normalizeQuery };

