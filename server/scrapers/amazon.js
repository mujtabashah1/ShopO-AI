/**
 * Amazon Scraper (Browser-based)
 * --------------
 * Scrapes product listings from Amazon.com using a real browser.
 * Direct port of the Flask app's Selenium approach to Puppeteer.
 * 
 * Strategy: Open browser → Go to Amazon → Type query → Submit → Extract
 * 
 * Amazon auto-detects location (Pakistan → PKR prices).
 * We detect the currency and format accordingly.
 */

const { getBrowser } = require('./browserPool');
const { getRate } = require('../config/exchangeRate');

const MAX_PRODUCTS_PER_PAGE = 60;
const MAX_PAGES = 3;

/**
 * Scrape a single Amazon results page.
 * No in-browser relevance filtering — server-side isRelevant() handles that.
 */
const scrapeAmazonPage = async (page, queryWords, maxProducts) => {
  // Wait for any product selector
  await page.waitForSelector(
    '[data-component-type="s-search-result"], [data-asin], .s-result-item, a[href*="/dp/"]',
    { timeout: 20000 }
  ).catch(() => console.log(`  [Amazon] No product selectors found within 20s`));

  // Scroll aggressively
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise(r => setTimeout(r, 800));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1500));

  // Diagnostic
  const diag = await page.evaluate(() => ({
    title: document.title,
    counts: {
      's-search-result': document.querySelectorAll('[data-component-type="s-search-result"]').length,
      '[data-asin]': document.querySelectorAll('[data-asin]:not([data-asin=""])').length,
      'a[href*="/dp/"]': document.querySelectorAll('a[href*="/dp/"]').length,
    }
  }));
  console.log(`  [Amazon] Diag: title="${diag.title.substring(0, 60)}", selectors=${JSON.stringify(diag.counts)}`);

  const products = await page.evaluate((maxProducts) => {
    const items = [];
    const seen = new Set();

    // Try multiple card selectors
    let cards = document.querySelectorAll('[data-component-type="s-search-result"]');
    if (cards.length === 0) cards = document.querySelectorAll('[data-asin]:not([data-asin=""])');
    if (cards.length === 0) cards = document.querySelectorAll('.s-result-item');
    if (cards.length === 0) cards = document.querySelectorAll('.s-main-slot > div[data-index]');

    for (const el of cards) {
      if (items.length >= maxProducts) break;
      try {
        // Skip sponsored
        const sponsoredEl = el.querySelector('[data-component-type="sp-sponsored-result"], .puis-label-popover-default');
        if (sponsoredEl) continue;
        const adLink = el.querySelector('a[href*="/slredirect"], a[href*="aax-us-iad"]');
        if (adLink) continue;

        // Name — try multiple approaches
        let name = '';
        const h2 = el.querySelector('h2');
        if (h2) {
          const span = h2.querySelector('span');
          name = span ? span.textContent.trim() : h2.textContent.trim();
        }
        if (!name || name.split(' ').length <= 2) {
          const titleLink = el.querySelector('h2 a, a.a-link-normal[href*="/dp/"]');
          if (titleLink) {
            const ariaLabel = titleLink.getAttribute('aria-label') || '';
            const linkText = titleLink.textContent.trim();
            name = ariaLabel.length > linkText.length ? ariaLabel : linkText;
          }
        }
        if (!name || name.split(' ').length <= 2) {
          const imgEl = el.querySelector('.s-image, img');
          if (imgEl) name = imgEl.getAttribute('alt') || '';
        }
        if (!name || name.length < 5) continue;

        // Price
        let price = 0;
        let currencySymbol = '';
        const priceSymbolEl = el.querySelector('.a-price-symbol');
        currencySymbol = priceSymbolEl ? priceSymbolEl.textContent.trim() : '';
        const wholeEl = el.querySelector('.a-price-whole');
        const fractionEl = el.querySelector('.a-price-fraction');
        if (wholeEl) {
          const whole = wholeEl.textContent.replace(/[,.]/g, '');
          const fraction = fractionEl ? fractionEl.textContent : '00';
          price = parseFloat(whole + '.' + fraction) || 0;
        }
        // Fallback: scan for price pattern in text
        if (price === 0) {
          const text = el.innerText || '';
          const m = text.match(/(?:\$|Rs\.?)\s*([\d,]+\.?\d*)/);
          if (m) {
            price = parseFloat(m[1].replace(/,/g, ''));
            if (!currencySymbol) currencySymbol = text.includes('Rs') ? 'Rs' : '$';
          }
        }
        if (price <= 0) continue;

        // Image
        const imgEl = el.querySelector('.s-image, img');
        const image = imgEl ? imgEl.src : '';

        // Link
        const linkEl = el.querySelector('h2 a') || el.querySelector('a.a-link-normal[href*="/dp/"]') || el.querySelector('a[href*="/dp/"]');
        const link = linkEl ? linkEl.href : '';
        if (seen.has(link)) continue;

        // Rating
        const ratingEl = el.querySelector('.a-icon-star-small .a-icon-alt, [data-cy="reviews-ratings-count"]');
        const ratingText = ratingEl ? ratingEl.textContent : '';
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

        // Review count
        const reviewEl = el.querySelector('[aria-label*="stars"] + span, .a-size-base.s-underline-text');
        const reviewText = reviewEl ? reviewEl.textContent.trim() : '';
        const reviewMatch = reviewText.match(/([\d,]+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

        seen.add(link);
        items.push({ name, price, currencySymbol, image, link, rating, reviewCount });
      } catch (e) { continue; }
    }

    // NUCLEAR FALLBACK: scan all /dp/ links
    if (items.length === 0) {
      const dpLinks = document.querySelectorAll('a[href*="/dp/"]');
      for (const a of dpLinks) {
        if (items.length >= maxProducts) break;
        const link = a.href;
        if (!link || seen.has(link) || link.includes('#')) continue;

        const container = a.closest('[data-asin], [data-index], li, div.s-result-item')
          || a.parentElement?.parentElement?.parentElement;
        if (!container) continue;

        const text = container.innerText || '';
        if (text.length < 20) continue;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);

        // Name: first long text line that isn't a price
        let name = '';
        for (const line of lines) {
          if (line.length >= 15 && !line.match(/^\$|^Rs/) && !line.match(/^\d+%/)) { name = line; break; }
        }
        if (!name) continue;

        // Price
        let price = 0;
        let currencySymbol = '$';
        for (const line of lines) {
          const m = line.match(/(?:\$|Rs\.?)\s*([\d,]+\.?\d*)/);
          if (m) {
            price = parseFloat(m[1].replace(/,/g, ''));
            if (line.includes('Rs')) currencySymbol = 'Rs';
            break;
          }
        }
        if (price <= 0) continue;

        const imgEl = container.querySelector('img');
        seen.add(link);
        items.push({ name, price, currencySymbol, image: imgEl ? (imgEl.src || '') : '', link, rating: 0, reviewCount: 0 });
      }
    }

    return items;
  }, maxProducts);

  return products;
};

/**
 * Scrape Amazon using browser — multi-page approach.
 */
const scrapeAmazon = async (query) => {
  console.log(`🔍 [Amazon] Opening browser for: "${query}" (up to ${MAX_PAGES} pages)`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    const formattedQuery = encodeURIComponent(query);
    await page.goto(`https://www.amazon.com/s?k=${formattedQuery}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));

    // Check for CAPTCHA
    const pageTitle = await page.title();
    if (pageTitle.toLowerCase().includes('robot') || pageTitle.toLowerCase().includes('sorry')) {
      console.log(`  [Amazon] CAPTCHA detected: "${pageTitle}" — trying homepage approach...`);

      await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 3000));

      const searchInput = await page.$('#twotabsearchtextbox');
      if (searchInput) {
        await searchInput.click();
        await searchInput.type(query, { delay: 100 });
        await new Promise(r => setTimeout(r, 800));
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 5000));
      } else {
        console.log(`  [Amazon] Could not find search box after CAPTCHA fallback`);
        return [];
      }

      const title2 = await page.title();
      if (title2.toLowerCase().includes('robot') || title2.toLowerCase().includes('sorry')) {
        console.log(`  [Amazon] CAPTCHA persists — giving up`);
        return [];
      }
    }

    // Check for "Something went wrong" and refresh
    const content = await page.content();
    if (content.includes('Something went wrong')) {
      console.log(`  [Amazon] "Something went wrong" — refreshing...`);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 5000));
    }

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    let allProducts = [];

    // Scrape multiple pages
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      console.log(`  [Amazon] Scraping page ${pageNum}/${MAX_PAGES}...`);

      const pageProducts = await scrapeAmazonPage(page, queryWords, MAX_PRODUCTS_PER_PAGE);
      allProducts = allProducts.concat(pageProducts);
      console.log(`  [Amazon] Page ${pageNum}: found ${pageProducts.length} products (total: ${allProducts.length})`);

      if (pageProducts.length === 0) break;

      // Navigate to next page
      if (pageNum < MAX_PAGES) {
        const nextPageUrl = await page.evaluate(() => {
          const nextBtn = document.querySelector('a.s-pagination-next:not(.s-pagination-disabled), a[aria-label*="next page"], .s-pagination-strip a:last-child');
          return nextBtn ? nextBtn.href : null;
        });

        if (!nextPageUrl) {
          console.log(`  [Amazon] No next page found — stopping pagination`);
          break;
        }

        await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 3000));

        // Check CAPTCHA on next page
        const title = await page.title();
        if (title.toLowerCase().includes('robot') || title.toLowerCase().includes('sorry')) {
          console.log(`  [Amazon] CAPTCHA on page ${pageNum + 1} — stopping`);
          break;
        }
      }
    }

    // Get exchange rate for PKR→USD conversion
    const pkrRate = getRate('USD', 'PKR');

    const result = allProducts.map(p => {
      const isPKR = p.currencySymbol.includes('PKR') || p.currencySymbol.includes('Rs');
      let priceUSD = p.price;

      if (isPKR && pkrRate > 0) {
        priceUSD = p.price / pkrRate;
        priceUSD = Math.round(priceUSD * 100) / 100;
      }

      const displayPrice = isPKR
        ? `$${priceUSD.toFixed(2)} (Rs. ${Math.round(p.price).toLocaleString()})`
        : `$${priceUSD.toFixed(2)}`;

      return {
        name: p.name,
        price: priceUSD,
        displayPrice,
        image: p.image,
        link: p.link,
        platform: 'Amazon',
        rating: p.rating,
        reviewCount: p.reviewCount,
        sellerRating: p.rating,
        ...(isPKR ? { originalPricePKR: p.price, exchangeRate: pkrRate } : {})
      };
    });

    console.log(`✅ [Amazon] Found ${result.length} total products across pages`);
    return result;

  } catch (error) {
    console.error(`❌ [Amazon] Error:`, error.message);
    return [];
  } finally {
    await page.close();
  }
};

module.exports = scrapeAmazon;
