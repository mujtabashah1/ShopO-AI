/**
 * AliExpress Scraper (Browser-based)
 * -----------------------------------
 * Scrapes product listings from AliExpress using a real browser.
 * 
 * Strategy: Open browser → Navigate to search URL → Wait → Extract from DOM
 * 
 * AliExpress heavily uses JavaScript rendering so browser-based
 * scraping is the only reliable method.
 * 
 * IMPORTANT: AliExpress search cards often display coupon amounts,
 * deposit prices, or accessory variant prices alongside the real price.
 * This scraper carefully filters out non-product prices to avoid
 * misidentifying a "$15 off" coupon as a "$15" product price.
 * 
 * Prices are converted to USD when possible.
 */

const { extractPriceFromUrl, convertToUSD } = require('./priceScraper');
const proxyRotator = require('../utils/proxyRotator');

// AliExpress uses its own browser instance (not shared pool) to avoid
// CAPTCHA contamination from other scrapers. Once a browser gets flagged,
// all subsequent AliExpress requests on that browser get CAPTCHA.
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const MAX_PRODUCTS_PER_PAGE = 60;
const MAX_PAGES = 3;
const MAX_PROXY_RETRIES = 3;    // try up to N proxies if CAPTCHA hits

/**
 * Dismiss any modal/popup on AliExpress.
 */
const dismissModals = async (page) => {
  try {
    const closeSelectors = [
      'div[class*="modal"] button[class*="close"]',
      'div[class*="overlay"] [class*="close"]',
      '.comet-modal-close',
      '[class*="pop-close"]',
      '[class*="popup"] [class*="close"]',
      'button[aria-label="Close"]',
      '[class*="retain"] [class*="close"]',
      '[class*="coupon"] [class*="close"]'
    ];
    for (const sel of closeSelectors) {
      const closeBtn = await page.$(sel);
      if (closeBtn) {
        await closeBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (e) { /* no modal */ }
};

/**
 * Scrape a single AliExpress results page.
 * No in-browser relevance filtering — server-side isRelevant() handles that.
 */
const scrapeAliExpressPage = async (page, queryWords, maxProducts) => {
  // Wait for any product element
  await page.waitForSelector(
    'a[href*="/item/"], [class*="search-card-item"], [class*="product-card"], [data-product-id]',
    { timeout: 15000 }
  ).catch(() => console.log(`  [AliExpress] No product selectors found within 15s`));

  // Scroll aggressively to load all lazy content
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 1000));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 800));
  }
  await new Promise(r => setTimeout(r, 2000));

  // Diagnostic
  const diag = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    counts: {
      'a.search-card-item': document.querySelectorAll('a.search-card-item').length,
      '[class*="search-card"]': document.querySelectorAll('[class*="search-card"]').length,
      'a[href*="/item/"]': document.querySelectorAll('a[href*="/item/"]').length,
      '[class*="product-card"]': document.querySelectorAll('[class*="product-card"]').length,
    },
    isCaptcha: document.title.toLowerCase().includes('captcha') ||
               document.title.toLowerCase().includes('verify') ||
               document.body.innerText.substring(0, 200).toLowerCase().includes('captcha'),
  }));
  console.log(`  [AliExpress] Diag: title="${diag.title.substring(0, 60)}", captcha=${diag.isCaptcha}, selectors=${JSON.stringify(diag.counts)}`);

  if (diag.isCaptcha) {
    console.log(`  [AliExpress] CAPTCHA detected — returning 0`);
    return [];
  }

  const products = await page.evaluate((maxProducts) => {
    const items = [];
    const seen = new Set();

    const discountKeywords = [
      'off', 'coupon', 'save', 'deposit', 'discount', 'cashback',
      'voucher', 'bonus', 'welcome', 'new user', 'extra', 'coins',
      'reward', 'credit', 'first order', 'shipping', 'free shipping',
      'delivery', 'tax'
    ];
    const isDiscountText = (text) => {
      const lower = (text || '').toLowerCase();
      return discountKeywords.some(kw => lower.includes(kw));
    };

    // Try multiple selector strategies
    let cards = document.querySelectorAll('a.search-card-item');
    if (cards.length === 0) cards = document.querySelectorAll('[class*="search-card-item"]');
    if (cards.length === 0) cards = document.querySelectorAll('[class*="product-card"]');
    if (cards.length === 0) cards = document.querySelectorAll('[class*="SearchProductFeed"] a[href*="/item/"]');
    if (cards.length === 0) cards = document.querySelectorAll('a[href*="/item/"][href*=".html"]');
    if (cards.length === 0) cards = document.querySelectorAll('[class*="card--product"], [data-product-id]');

    for (const card of cards) {
      if (items.length >= maxProducts) break;
      try {
        // Skip ads
        const href = card.href || card.querySelector('a')?.href || '';
        if (href.includes('search_p4p_id')) continue;
        const cardText = card.innerText || '';
        if (cardText.toLowerCase().includes('\nad\n') || cardText.toLowerCase().startsWith('ad\n')) continue;

        // Name — try multiple sources
        let name = '';
        for (const sel of ['div[role="heading"]', '[class*="title"]', '[class*="Title"]', 'h1', 'h3']) {
          const el = card.querySelector(sel);
          if (el) {
            name = el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent.trim();
            if (name) break;
          }
        }
        if (!name) {
          const lines = cardText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
          for (const line of lines) {
            if (!line.match(/^\$|^US|^PKR|^Rs|^\d+%/) && line.length >= 10) { name = line; break; }
          }
        }
        if (!name || name.length < 5) continue;

        // Price — avoid coupons/discounts
        let price = 0;
        let isPKR = false;

        // Strategy 1: aria-label on elements
        const ariaEls = card.querySelectorAll('[aria-label]');
        for (const el of ariaEls) {
          const label = el.getAttribute('aria-label') || '';
          if (label.match(/PKR|USD|US\s*\$|\$|Rs|€/i) && !isDiscountText(label)) {
            const m = label.match(/([\d,]+\.?\d*)/);
            if (m) {
              const val = parseFloat(m[1].replace(/,/g, ''));
              if (val > 5) { price = val; isPKR = label.includes('PKR') || label.includes('Rs'); break; }
            }
          }
        }

        // Strategy 2: price-class elements
        if (price === 0) {
          for (const el of card.querySelectorAll('[class*="price"], [class*="Price"]')) {
            const text = el.textContent.trim();
            const cls = (el.className || '').toLowerCase();
            if (cls.includes('coupon') || cls.includes('off') || cls.includes('discount') ||
                cls.includes('original') || cls.includes('del')) continue;
            if (isDiscountText(text)) continue;
            if (text.match(/\$|PKR|Rs|€/i)) {
              const nums = text.match(/[\d,]+\.?\d*/g);
              if (nums) {
                for (const n of nums) {
                  const val = parseFloat(n.replace(/,/g, ''));
                  if (val > 5) { price = val; isPKR = text.includes('PKR') || text.includes('Rs'); break; }
                }
                if (price > 0) break;
              }
            }
          }
        }

        // Strategy 3: text scan
        if (price === 0) {
          const lines = cardText.split('\n').map(l => l.trim()).filter(l => l);
          for (const line of lines) {
            if (!line.match(/\$|PKR|Rs|€/i) || isDiscountText(line)) continue;
            const nums = line.match(/[\d,]+\.?\d*/g);
            if (nums) {
              for (const n of nums) {
                const val = parseFloat(n.replace(/,/g, ''));
                if (val > 5) { price = val; isPKR = line.includes('PKR') || line.includes('Rs'); break; }
              }
              if (price > 0) break;
            }
          }
        }
        if (price <= 0) continue;

        // Image
        const imgEl = card.querySelector('img');
        const image = imgEl ? (imgEl.src || imgEl.dataset?.src || '') : '';

        // Link
        const link = card.href || card.querySelector('a')?.href || '';
        if (seen.has(link)) continue;

        // Rating & sold count
        const ratingEl = card.querySelector('[class*="star"], [class*="rating"]');
        const ratingText = ratingEl ? ratingEl.textContent.trim() : '';
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

        const soldEl = card.querySelector('[class*="sold"], [class*="order"]');
        const soldText = soldEl ? soldEl.textContent.trim() : '';
        const soldMatch = soldText.match(/([\d,]+)/);
        const reviewCount = soldMatch ? parseInt(soldMatch[1].replace(/,/g, '')) : 0;

        seen.add(link);
        items.push({ name, price, isPKR, image, link, rating, reviewCount });
      } catch (e) { continue; }
    }

    // NUCLEAR FALLBACK: scan all /item/ links
    if (items.length === 0) {
      const allLinks = document.querySelectorAll('a[href*="/item/"]');
      for (const a of allLinks) {
        if (items.length >= maxProducts) break;
        const link = a.href || '';
        if (!link || seen.has(link) || !link.includes('.html')) continue;
        if (link.includes('search_p4p_id')) continue;

        const container = a.closest('[class*="card"], [class*="item"], li, div')
          || a.parentElement?.parentElement;
        if (!container) continue;

        const text = container.innerText || '';
        if (text.length < 20) continue;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);

        let name = '';
        for (const line of lines) {
          if (line.length >= 10 && !line.match(/^\$|^US|^PKR|^Rs|^\d+%/)) { name = line; break; }
        }
        if (!name) continue;

        let price = 0;
        let isPKR = false;
        for (const line of lines) {
          if (isDiscountText(line)) continue;
          const m = line.match(/(?:\$|Rs\.?|PKR)\s*([\d,]+\.?\d*)/);
          if (m) {
            const val = parseFloat(m[1].replace(/,/g, ''));
            if (val > 5) { price = val; isPKR = line.includes('PKR') || line.includes('Rs'); break; }
          }
        }
        if (price <= 0) continue;

        const imgEl = container.querySelector('img');
        seen.add(link);
        items.push({ name, price, isPKR, image: imgEl ? (imgEl.src || '') : '', link, rating: 0, reviewCount: 0 });
      }
    }

    return items;
  }, maxProducts);

  return products;
};

/**
 * Convert raw scraped AliExpress products to final format.
 */
const formatAliExpressProducts = (products) => {
  return products.map(p => {
    let finalPrice = p.price;
    let finalDisplayPrice;

    if (p.isPKR) {
      const usdPrice = Math.round(p.price * 0.0036 * 100) / 100;
      finalPrice = usdPrice;
      finalDisplayPrice = `$${usdPrice.toFixed(2)}`;
    } else {
      finalDisplayPrice = `$${p.price.toFixed(2)}`;
    }

    if (p.link) {
      try {
        const fullLink = p.link.startsWith('//') ? `https:${p.link}` : p.link;
        const urlPriceData = extractPriceFromUrl(fullLink);
        if (urlPriceData && urlPriceData.priceUSD > 0) {
          const urlUSD = urlPriceData.priceUSD;
          if (Math.abs(urlUSD - finalPrice) / Math.max(urlUSD, finalPrice) > 0.3) {
            finalPrice = urlUSD;
            finalDisplayPrice = `$${urlUSD.toFixed(2)}`;
          }
        }
      } catch (e) { /* URL parsing failed */ }
    }

    const { isPKR, ...rest } = p;
    return {
      ...rest,
      price: finalPrice,
      displayPrice: finalDisplayPrice,
      image: p.image.startsWith('//') ? `https:${p.image}` : p.image,
      link: p.link.startsWith('//') ? `https:${p.link}` : p.link,
      platform: 'AliExpress',
      sellerRating: 0,
      priceSource: 'search-card'
    };
  });
};

/**
 * Scrape AliExpress using browser — homepage-first approach.
 *
 * Strategy: Visit homepage first to establish a legitimate browser session
 * (cookies, fingerprint, etc.), then navigate to search URL.
 * Do NOT type in the search box — that triggers CAPTCHA.
 * Do NOT go directly to search URL without visiting homepage first — also triggers CAPTCHA.
 */
/**
 * Single-attempt AliExpress scrape. Returns:
 *   { products: [...], captcha: boolean }
 * If captcha=true, caller should retry with a different proxy.
 */
const scrapeAliExpressOnce = async (query, proxy = null) => {
  const proxyLabel = proxy ? ` via proxy ${proxy.host}:${proxy.port}` : ' direct';
  console.log(`🔍 [AliExpress] Opening browser for: "${query}" (up to ${MAX_PAGES} pages)${proxyLabel}`);

  const launchArgs = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--disable-blink-features=AutomationControlled',
    '--lang=en-US,en', '--window-size=1366,768'
  ];
  if (proxy) launchArgs.push(`--proxy-server=http://${proxy.host}:${proxy.port}`);

  // Launch a fresh dedicated browser (avoid shared pool CAPTCHA contamination)
  const browser = await puppeteer.launch({
    headless: 'new',
    args: launchArgs,
    defaultViewport: { width: 1366, height: 768 }
  });
  const page = await browser.newPage();

  try {
    // Authenticate with proxy if needed
    if (proxy && proxy.username) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    const isCaptcha = (t) => {
      const l = (t || '').toLowerCase();
      return l.includes('captcha') || l.includes('verify') || l.includes('punish');
    };

    // === STEP 1: Visit homepage to establish session cookies ===
    console.log(`  [AliExpress] Visiting homepage to establish session...`);
    await page.goto('https://www.aliexpress.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));

    await dismissModals(page);

    // Scroll a bit on homepage (human-like)
    await page.mouse.move(400 + Math.random() * 400, 300 + Math.random() * 200);
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => window.scrollBy(0, 300));
    await new Promise(r => setTimeout(r, 1500));

    const homeTitle = await page.title();
    console.log(`  [AliExpress] Homepage loaded: "${homeTitle.substring(0, 50)}"`);

    if (isCaptcha(homeTitle)) {
      console.log(`  [AliExpress] CAPTCHA on homepage — this proxy/IP is flagged`);
      return { products: [], captcha: true };
    }

    // === STEP 2: Navigate to search results ===
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    let allProducts = [];

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      console.log(`  [AliExpress] Scraping page ${pageNum}/${MAX_PAGES}...`);

      if (pageNum > 1) {
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
      }

      const url = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}${pageNum > 1 ? `&page=${pageNum}` : ''}`;

      // Navigate from within the page (looks more natural than page.goto)
      await page.evaluate((u) => { window.location.href = u; }, url);
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 7000 + Math.random() * 2000));

      const title = await page.title();
      if (isCaptcha(title)) {
        console.log(`  [AliExpress] CAPTCHA detected on page ${pageNum}: "${title}"`);
        // On page 1, signal CAPTCHA so caller can retry with different proxy
        if (pageNum === 1) {
          return { products: [], captcha: true };
        }
        break;
      }

      await dismissModals(page);

      const pageProducts = await scrapeAliExpressPage(page, queryWords, MAX_PRODUCTS_PER_PAGE);
      allProducts = allProducts.concat(pageProducts);
      console.log(`  [AliExpress] Page ${pageNum}: found ${pageProducts.length} products (total: ${allProducts.length})`);

      if (pageProducts.length === 0) break;
    }

    const result = formatAliExpressProducts(allProducts);
    console.log(`✅ [AliExpress] Found ${result.length} total products across pages`);
    return { products: result, captcha: false };

  } catch (error) {
    const msg = error.message;
    // Proxy-specific errors → signal captcha=true so caller tries another proxy
    const isProxyErr = msg.includes('ERR_PROXY') || msg.includes('ERR_TUNNEL') ||
                      msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('ERR_TIMED_OUT');
    if (msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('TIMEOUT') || msg.includes('ECONNRESET')) {
      console.error(`❌ [AliExpress] Network unreachable (site may be blocked or down)`);
    } else {
      console.error(`❌ [AliExpress] Error:`, msg);
    }
    return { products: [], captcha: isProxyErr };
  } finally {
    await page.close();
    await browser.close();
  }
};

/**
 * Main entry: scrape AliExpress with proxy rotation on CAPTCHA.
 *
 * Flow:
 *   1. Try direct connection first (no proxy) — fast path if IP isn't flagged
 *   2. If CAPTCHA → try up to MAX_PROXY_RETRIES different proxies
 *   3. If all proxies fail → return []
 */
const scrapeAliExpress = async (query) => {
  // Attempt 1: direct connection (no proxy)
  let result = await scrapeAliExpressOnce(query, null);
  if (!result.captcha && result.products.length > 0) return result.products;

  // Only try proxies if USE_PROXY=true and proxies are configured.
  // Default strategy: Chrome Extension handles CAPTCHA via mouse simulation,
  // so we don't need proxies in the normal flow.
  const proxyEnabled = (process.env.USE_PROXY || '').toLowerCase() === 'true';
  if (!proxyEnabled) {
    if (result.captcha) {
      console.log(`  [AliExpress] CAPTCHA — connect the Chrome Extension (auto-solves CAPTCHA) or set USE_PROXY=true`);
    }
    return result.products;
  }

  const totalProxies = proxyRotator.total();
  if (totalProxies === 0) {
    console.log(`  [AliExpress] USE_PROXY=true but PROXY_LIST not set in .env`);
    return result.products;
  }

  const maxTries = Math.min(MAX_PROXY_RETRIES, proxyRotator.available());
  console.log(`  [AliExpress] Direct ${result.captcha ? 'got CAPTCHA' : 'returned 0'} — rotating through up to ${maxTries} proxies`);

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const proxy = proxyRotator.getProxy();
    if (!proxy) break;

    result = await scrapeAliExpressOnce(query, proxy);

    if (!result.captcha && result.products.length > 0) {
      console.log(`  [AliExpress] ✅ Success via proxy ${proxy.host}:${proxy.port}`);
      return result.products;
    }
    if (result.captcha) proxyRotator.markFailed(proxy);
  }

  console.log(`  [AliExpress] ❌ All proxy attempts exhausted`);
  return [];
};

module.exports = scrapeAliExpress;
