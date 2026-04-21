/**
 * eBay Scraper (Browser-based)
 * ----------------------------
 * Scrapes product listings from eBay using a real browser.
 * 
 * Strategy: Open browser → Go to eBay homepage → Type query in search box
 *           → Press Enter → Wait for results → Extract from DOM
 * 
 * Going to the homepage first and typing the search avoids CAPTCHA
 * that eBay triggers when you hit the search URL directly.
 */

const { getBrowser } = require('./browserPool');

const MAX_PRODUCTS_PER_PAGE = 60;
const MAX_PAGES = 3;

/**
 * Scrape a single eBay results page — extracts all visible products.
 * No in-browser relevance filtering — server-side isRelevant() handles that.
 */
const scrapeEbayPage = async (page, queryWords, maxProducts) => {
  // Helper that swallows "Execution context destroyed" errors (non-fatal here)
  const safeEval = async (fn, ...args) => {
    try { return await page.evaluate(fn, ...args); }
    catch (e) {
      if (e.message.includes('Execution context was destroyed') || e.message.includes('Target closed')) {
        // Wait a bit for navigation to settle, then retry once
        await new Promise(r => setTimeout(r, 1500));
        try { return await page.evaluate(fn, ...args); } catch (e2) { return null; }
      }
      throw e;
    }
  };

  // Wait for any product selector to appear
  await page.waitForSelector(
    'li[id^="item"], .s-item, [data-viewport], a[href*="/itm/"]',
    { timeout: 15000 }
  ).catch(() => console.log(`  [eBay] No product selectors found within 15s`));

  // Scroll aggressively to trigger lazy loading (with navigation-resilient eval)
  for (let i = 0; i < 8; i++) {
    await safeEval(() => window.scrollBy(0, 600));
    await new Promise(r => setTimeout(r, 800));
  }
  await safeEval(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));
  await safeEval(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1500));

  // Diagnostic: log what selectors find
  const diag = await safeEval(() => ({
    title: document.title,
    counts: {
      'li[id^="item"]': document.querySelectorAll('li[id^="item"]').length,
      '.s-item': document.querySelectorAll('.s-item').length,
      'a[href*="/itm/"]': document.querySelectorAll('a[href*="/itm/"]').length,
    }
  }));
  if (diag) {
    console.log(`  [eBay] Diag: title="${diag.title.substring(0, 60)}", selectors=${JSON.stringify(diag.counts)}`);
  }

  const products = await safeEval((maxProducts) => {
    const items = [];
    const seen = new Set();

    const extractPrice = (text) => {
      if (!text) return 0;
      const m = text.match(/[\d,]+\.?\d*/);
      return m ? parseFloat(m[0].replace(/,/g, '')) : 0;
    };

    const cleanName = (n) => (n || '')
      .replace(/Opens in a new window or tab/gi, '')
      .replace(/^New Listing/i, '')
      .trim();

    const isSponsored = (card) => {
      const links = card.querySelectorAll('a');
      for (const a of links) {
        const href = a.href || '';
        if (href.includes('/slredirect/') || href.includes('pulsar.ebay.') || href.includes('ebay.com/e/')) return true;
      }
      const text = (card.innerText || '').toLowerCase();
      return text.startsWith('sponsored') || (text.includes('sponsored') && text.indexOf('sponsored') < 50);
    };

    // Strategy 1: New layout — li[id^="item"]
    let cards = document.querySelectorAll('li[id^="item"]');

    // Strategy 2: Old layout — .s-item
    if (cards.length === 0) cards = document.querySelectorAll('.s-item');

    // Strategy 3: data-viewport items
    if (cards.length === 0) cards = document.querySelectorAll('[data-viewport]');

    // Strategy 4: generic result list items
    if (cards.length === 0) cards = document.querySelectorAll('[class*="srp-results"] li, [class*="search-results"] li, ul.srp-results li');

    for (const card of cards) {
      if (items.length >= maxProducts) break;
      try {
        if (isSponsored(card)) continue;

        // Find product link
        const linkEl = card.querySelector('a[href*="/itm/"]') || card.querySelector('a[href*="ebay.com"]') || card.querySelector('a');
        const link = linkEl ? linkEl.href : '';
        if (!link || seen.has(link)) continue;

        // Get name — try multiple selectors
        let name = '';
        for (const sel of ['.s-card__title', '[class*="card__title"]', '.s-item__title', 'h3', '[role="heading"]', '[class*="title"]']) {
          const el = card.querySelector(sel);
          if (el) { name = cleanName(el.textContent); break; }
        }
        if (!name && linkEl) name = cleanName(linkEl.textContent);
        if (!name || name === 'Shop on eBay' || name.length < 5) continue;

        // Get price — try multiple selectors
        let price = 0;
        for (const sel of ['.s-card__price', '[class*="card__price"]', '.s-item__price', '[class*="price"]']) {
          const el = card.querySelector(sel);
          if (el) { price = extractPrice(el.textContent); if (price > 0) break; }
        }
        // Fallback: scan card text for $ amount
        if (price === 0) {
          const m = (card.innerText || '').match(/\$\s*([\d,]+\.?\d*)/);
          if (m) price = parseFloat(m[1].replace(/,/g, ''));
        }
        if (price <= 0) continue;

        // Image
        const imgEl = card.querySelector('img');
        const image = imgEl ? (imgEl.src || imgEl.dataset?.src || '') : '';

        // Condition
        let condition = 'Unknown';
        const condText = (card.innerText || '').toLowerCase();
        if (condText.includes('brand new') || condText.match(/\bnew\b/)) condition = 'New';
        else if (condText.includes('refurbished') || condText.includes('renewed')) condition = 'Refurbished';
        else if (condText.includes('pre-owned') || condText.includes('used')) condition = 'Used';
        else if (condText.includes('open box')) condition = 'Open Box';

        seen.add(link);
        items.push({ name, price, image, link, condition, sellerRating: 0 });
      } catch (e) { continue; }
    }

    // NUCLEAR FALLBACK: Scan all /itm/ links if selectors failed
    if (items.length === 0) {
      const allLinks = document.querySelectorAll('a[href*="/itm/"]');
      for (const a of allLinks) {
        if (items.length >= maxProducts) break;
        const link = a.href;
        if (!link || seen.has(link)) continue;

        const container = a.closest('li, [class*="card"], [class*="item"], div') || a.parentElement?.parentElement;
        if (!container) continue;

        const text = container.innerText || '';
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        if (lines.length < 2) continue;

        // Name: first long text line that isn't a price
        let name = '';
        for (const line of lines) {
          if (line.length >= 10 && !line.match(/^\$/) && !line.match(/^\d+%/)) { name = cleanName(line); break; }
        }
        if (!name) continue;

        // Price: find $ amount
        let price = 0;
        for (const line of lines) {
          const m = line.match(/\$\s*([\d,]+\.?\d*)/);
          if (m) { price = parseFloat(m[1].replace(/,/g, '')); break; }
        }
        if (price <= 0) continue;

        const imgEl = container.querySelector('img');
        seen.add(link);
        items.push({ name, price, image: imgEl ? (imgEl.src || '') : '', link, condition: 'Unknown', sellerRating: 0 });
      }
    }

    return items;
  }, maxProducts);

  // safeEval returns null if both attempts failed — treat as empty
  if (!products) return [];

  return products;
};

/**
 * Scrape eBay using browser — multi-page type-and-search approach.
 */
const scrapeEbay = async (query) => {
  console.log(`🔍 [eBay] Opening browser for: "${query}" (up to ${MAX_PAGES} pages)`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    // Step 1: Go to eBay homepage (avoids CAPTCHA from direct search URL)
    await page.goto('https://www.ebay.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Type search query in search box and submit
    await page.waitForSelector('#gh-ac', { timeout: 10000 });
    await page.click('#gh-ac');
    await page.type('#gh-ac', query, { delay: 80 });
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.press('Enter');

    // Step 3: Wait for search results page to load
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // Check if we got blocked
    const pageTitle = await page.title();
    if (pageTitle.toLowerCase().includes('security') || pageTitle.toLowerCase().includes('pardon')) {
      console.log(`  [eBay] Blocked: "${pageTitle}"`);
      return [];
    }

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    let allProducts = [];

    // Build programmatic URL template (more reliable than reading DOM for next-page)
    // eBay pagination uses _pgn=N parameter
    const searchUrlTemplate = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;

    // Scrape multiple pages
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      console.log(`  [eBay] Scraping page ${pageNum}/${MAX_PAGES}...`);

      // For pages 2+, navigate directly via URL instead of clicking "next"
      // This avoids "Execution context destroyed" errors from SPA navigations
      if (pageNum > 1) {
        try {
          const nextUrl = `${searchUrlTemplate}&_pgn=${pageNum}`;
          await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await new Promise(r => setTimeout(r, 2000));

          const title = await page.title();
          if (title.toLowerCase().includes('security') || title.toLowerCase().includes('pardon')) {
            console.log(`  [eBay] Blocked on page ${pageNum}`);
            break;
          }
        } catch (navErr) {
          console.warn(`  [eBay] Navigation to page ${pageNum} failed: ${navErr.message}`);
          break;  // Can't navigate — stop pagination but keep pages we already have
        }
      }

      // Scrape this page with error isolation — one page's error doesn't kill others
      let pageProducts = [];
      try {
        pageProducts = await scrapeEbayPage(page, queryWords, MAX_PRODUCTS_PER_PAGE);
      } catch (pageErr) {
        console.warn(`  [eBay] Page ${pageNum} extraction failed: ${pageErr.message}`);
        // Keep going — we still have pages we scraped
        break;
      }

      allProducts = allProducts.concat(pageProducts);
      console.log(`  [eBay] Page ${pageNum}: found ${pageProducts.length} products (total: ${allProducts.length})`);

      if (pageProducts.length === 0) break; // No more results on this page
    }

    const result = allProducts.map(p => ({
      ...p,
      displayPrice: `$${p.price.toFixed(2)}`,
      platform: 'eBay',
      rating: 0,
      reviewCount: 0,
      sellerRating: p.sellerRating || 0,
      condition: p.condition || 'Unknown'
    }));

    console.log(`✅ [eBay] Found ${result.length} total products across pages`);
    return result;

  } catch (error) {
    console.error(`❌ [eBay] Error:`, error.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
};

module.exports = scrapeEbay;
