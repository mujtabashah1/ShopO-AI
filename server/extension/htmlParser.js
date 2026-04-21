/**
 * HTML Parser
 * -----------
 * Parses raw HTML received from the Chrome extension using Cheerio.
 * Each platform parser mirrors the extraction logic from the corresponding
 * Puppeteer scraper's page.evaluate() block, producing the same product
 * object shape: { name, price, displayPrice, image, link, platform, rating, reviewCount, sellerRating }
 */

const cheerio = require('cheerio');
const { getRate } = require('../config/exchangeRate');

const MAX_PRODUCTS = 60;
const FALLBACK_PKR_RATE = 280;

// Shared accessory keywords (same as scrapers)
const ACCESSORY_WORDS = [
  'case', 'cases', 'cover', 'covers', 'protector', 'protectors',
  'screen protector', 'tempered glass', 'cable', 'cables',
  'charger', 'chargers', 'adapter', 'adapters', 'holder', 'holders',
  'stand', 'stands', 'mount', 'mounts', 'sticker', 'stickers',
  'skin', 'skins', 'decal', 'decals', 'film', 'films', 'pouch',
  'sleeve', 'sleeves', 'earphone', 'earphones', 'headphone',
  'headphones', 'earbud', 'earbuds', 'strap', 'straps', 'band',
  'bands', 'stylus', 'pen', 'cleaner', 'cloth', 'toolkit', 'repair',
  'bumper', 'bumpers', 'wallet', 'folio', 'armor', 'shield',
  'shell', 'shells', 'holster', 'holsters', 'grip', 'grips',
  'ring', 'kickstand', 'dock', 'wrap', 'wraps', 'lanyard'
];

function isAccessory(name, queryWords) {
  const lower = name.toLowerCase();

  // "for [product]" pattern
  const forMatch = lower.match(/^(.+?)\bfor\b\s+(.+)/);
  if (forMatch) {
    const beforeFor = forMatch[1].trim();
    const afterFor = forMatch[2].trim();
    const sigWords = queryWords.filter(w => w.length >= 3);
    const afterHasQuery = sigWords.some(w => afterFor.includes(w));
    const beforeHasQuery = sigWords.some(w => beforeFor.includes(w));
    if (afterHasQuery && !beforeHasQuery) return true;
  }

  for (const kw of ACCESSORY_WORDS) {
    const regex = new RegExp('\\b' + kw + '\\b', 'i');
    if (regex.test(lower)) return true;
  }
  return false;
}

function isRelevant(name, queryWords) {
  const lower = name.toLowerCase();
  const sigWords = queryWords.filter(w => w.length >= 3 && !/^\d+$/.test(w));
  if (sigWords.length > 0) {
    const matched = sigWords.filter(w => lower.includes(w)).length;
    const minRequired = sigWords.length <= 2 ? sigWords.length : sigWords.length - 1;
    if (matched < minRequired) return false;
  }
  const nums = queryWords.filter(w => /^\d+$/.test(w));
  if (nums.length > 0 && !nums.some(n => lower.includes(n))) return false;
  return true;
}

function isDiscountText(text) {
  const lower = (text || '').toLowerCase();
  return ['off', 'coupon', 'save', 'deposit', 'discount', 'cashback',
    'voucher', 'bonus', 'welcome', 'new user', 'extra', 'coins',
    'reward', 'credit', 'first order', 'shipping', 'free shipping', 'delivery', 'tax'
  ].some(kw => lower.includes(kw));
}

// ================= Amazon Parser =================

function parseAmazonHTML(html, query) {
  const $ = cheerio.load(html);
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const products = [];
  const pkrRate = getRate('USD', 'PKR') || FALLBACK_PKR_RATE;

  $('[data-component-type="s-search-result"]').each((i, el) => {
    if (products.length >= MAX_PRODUCTS) return false;

    const $el = $(el);

    // Skip sponsored
    if ($el.find('[data-component-type="sp-sponsored-result"]').length > 0) return;
    if ($el.find('.puis-label-popover-default').length > 0) return;
    const text = $el.text().toLowerCase();
    if (text.includes('sponsored')) return;

    // Name
    let name = '';
    const titleLink = $el.find('h2 a, h2 .a-link-normal');
    if (titleLink.length) {
      const span = titleLink.find('span.a-text-normal, span.a-size-base-plus, span.a-size-medium, span');
      name = span.length ? span.first().text().trim() : titleLink.first().text().trim();
    }
    if (!name) {
      const h2 = $el.find('h2');
      name = h2.text().trim();
    }
    if (!name) return;

    // NOTE: No relevance filtering here — server-side isRelevant() in scrapers/index.js handles it

    // Price
    const symEl = $el.find('.a-price-symbol');
    const currencySymbol = symEl.length ? symEl.first().text().trim() : '';
    const wholeEl = $el.find('.a-price-whole');
    const fractionEl = $el.find('.a-price-fraction');
    let price = 0;
    if (wholeEl.length) {
      const whole = wholeEl.first().text().replace(/[,\.]/g, '');
      const fraction = fractionEl.length ? fractionEl.first().text() : '00';
      price = parseFloat(whole + '.' + fraction) || 0;
    }
    if (price <= 0) return;

    // Image
    const imgEl = $el.find('.s-image');
    const image = imgEl.length ? imgEl.attr('src') || '' : '';

    // Link
    const linkEl = $el.find('h2 a, a.a-link-normal');
    let link = linkEl.length ? linkEl.first().attr('href') || '#' : '#';
    if (link.startsWith('/')) link = 'https://www.amazon.com' + link;

    // Rating
    const ratingEl = $el.find('.a-icon-star-small .a-icon-alt, [data-cy="reviews-ratings-count"]');
    const ratingText = ratingEl.length ? ratingEl.first().text() : '';
    const ratingMatch = ratingText.match(/([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    // Review count
    const reviewEl = $el.find('[aria-label*="stars"] + span, .a-size-base.s-underline-text');
    const reviewText = reviewEl.length ? reviewEl.first().text().trim() : '';
    const reviewMatch = reviewText.match(/([\d,]+)/);
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

    // PKR conversion
    const isPKR = currencySymbol.includes('PKR') || currencySymbol.includes('Rs');
    let priceUSD = price;
    if (isPKR && pkrRate > 0) {
      priceUSD = Math.round((price / pkrRate) * 100) / 100;
    }
    const displayPrice = isPKR
      ? `$${priceUSD.toFixed(2)} (Rs. ${Math.round(price).toLocaleString()})`
      : `$${priceUSD.toFixed(2)}`;

    products.push({
      name, price: priceUSD, displayPrice, image, link,
      platform: 'Amazon', rating, reviewCount,
      sellerRating: rating,
      ...(isPKR ? { originalPricePKR: price, exchangeRate: pkrRate } : {})
    });
  });

  // Nuclear fallback: scan all /dp/ links
  if (products.length === 0) {
    const seen = new Set();
    $('a[href*="/dp/"]').each((i, el) => {
      if (products.length >= MAX_PRODUCTS) return false;
      const $a = $(el);
      let link = $a.attr('href') || '';
      if (seen.has(link)) return;
      seen.add(link);

      const container = $a.closest('[data-asin], [data-index], li, div.s-result-item');
      if (!container.length) return;

      const text = container.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      if (lines.length < 2) return;

      let name = '';
      for (const line of lines) {
        if (line.length >= 15 && !line.match(/^\$|^Rs/) && !line.match(/^\d+%/)) { name = line; break; }
      }
      if (!name) return;

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
      if (price <= 0) return;

      const isPKR = currencySymbol.includes('Rs');
      let priceUSD = price;
      if (isPKR && pkrRate > 0) priceUSD = Math.round((price / pkrRate) * 100) / 100;
      const displayPrice = isPKR
        ? `$${priceUSD.toFixed(2)} (Rs. ${Math.round(price).toLocaleString()})`
        : `$${priceUSD.toFixed(2)}`;

      if (link.startsWith('/')) link = 'https://www.amazon.com' + link;
      const imgEl = container.find('img');
      const image = imgEl.length ? (imgEl.first().attr('src') || '') : '';

      products.push({
        name, price: priceUSD, displayPrice, image, link,
        platform: 'Amazon', rating: 0, reviewCount: 0, sellerRating: 0,
        ...(isPKR ? { originalPricePKR: price, exchangeRate: pkrRate } : {})
      });
    });
  }

  return products;
}

// ================= eBay Parser =================

function parseEbayHTML(html, query) {
  const $ = cheerio.load(html);
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const products = [];

  // Strategy 1: New layout (2025+)
  $('li[id^="item"]').each((i, el) => {
    if (products.length >= MAX_PRODUCTS) return false;

    const $el = $(el);
    const cardText = $el.text().toLowerCase();
    if (cardText.includes('sponsored') && cardText.indexOf('sponsored') < 50) return;

    // Check for ad redirect links
    let isSponsored = false;
    $el.find('a').each((j, a) => {
      const href = $(a).attr('href') || '';
      if (href.includes('/slredirect/') || href.includes('ebay.com/e/') || href.includes('pulsar.ebay.')) {
        isSponsored = true;
        return false;
      }
    });
    if (isSponsored) return;

    const titleEl = $el.find('.s-card__title, [class*="card__title"]');
    let name = titleEl.length ? titleEl.first().text().trim() : '';
    name = name.replace(/Opens in a new window or tab/gi, '').replace(/^New Listing/i, '').trim();
    if (!name) return;

    const priceEl = $el.find('.s-card__price, [class*="card__price"]');
    const priceText = priceEl.length ? priceEl.first().text().trim() : '';
    if (!priceText) return;

    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
    if (price <= 0) return;

    const imgEl = $el.find('img');
    const image = imgEl.length ? imgEl.first().attr('src') || '' : '';
    const linkEl = $el.find('a');
    const link = linkEl.length ? linkEl.first().attr('href') || '' : '';

    let sellerRating = 0;
    const feedbackEl = $el.find('[class*="seller"], [class*="feedback"]');
    if (feedbackEl.length) {
      const fbMatch = feedbackEl.text().match(/(\d+\.?\d*)%/);
      if (fbMatch) sellerRating = parseFloat(fbMatch[1]);
    }

    products.push({
      name, price, displayPrice: `$${price.toFixed(2)}`, image, link,
      platform: 'eBay', rating: 0, reviewCount: 0, sellerRating
    });
  });

  // Strategy 2: Old layout fallback
  if (products.length === 0) {
    $('.s-item').each((i, el) => {
      if (products.length >= MAX_PRODUCTS) return false;
      const $el = $(el);

      let name = $el.find('.s-item__title').text().trim();
      name = name.replace(/Opens in a new window or tab/gi, '').replace(/^New Listing/i, '').trim();
      if (!name || name === 'Shop on eBay') return;

      const priceText = $el.find('.s-item__price').text().trim();
      if (!priceText) return;

      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
      if (price <= 0) return;

      const image = $el.find('.s-item__image-img').attr('src') || '';
      const link = $el.find('.s-item__link').attr('href') || '';

      products.push({
        name, price, displayPrice: `$${price.toFixed(2)}`, image, link,
        platform: 'eBay', rating: 0, reviewCount: 0, sellerRating: 0
      });
    });
  }

  // Strategy 3: Nuclear fallback — scan all /itm/ links
  if (products.length === 0) {
    const seen = new Set();
    $('a[href*="/itm/"]').each((i, el) => {
      if (products.length >= MAX_PRODUCTS) return false;
      const $a = $(el);
      const link = $a.attr('href') || '';
      if (seen.has(link)) return;
      seen.add(link);

      const container = $a.closest('li, [class*="card"], [class*="item"]');
      if (!container.length) return;

      const text = container.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
      if (lines.length < 2) return;

      let name = '';
      for (const line of lines) {
        if (line.length >= 10 && !line.match(/^\$/) && !line.match(/^\d+%/)) {
          name = line.replace(/Opens in a new window or tab/gi, '').trim();
          break;
        }
      }
      if (!name) return;

      let price = 0;
      for (const line of lines) {
        const m = line.match(/\$\s*([\d,]+\.?\d*)/);
        if (m) { price = parseFloat(m[1].replace(/,/g, '')); break; }
      }
      if (price <= 0) return;

      const imgEl = container.find('img');
      const image = imgEl.length ? (imgEl.first().attr('src') || '') : '';

      products.push({
        name, price, displayPrice: `$${price.toFixed(2)}`, image, link,
        platform: 'eBay', rating: 0, reviewCount: 0, sellerRating: 0
      });
    });
  }

  return products;
}

// ================= AliExpress Parser =================

function parseAliExpressHTML(html, query) {
  const $ = cheerio.load(html);
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const products = [];

  // Primary: a.search-card-item
  let cards = $('a.search-card-item');
  if (cards.length === 0) {
    cards = $('a[href*="/item/"], [class*="search-card-item"], [class*="product-card"]');
  }

  cards.each((i, el) => {
    if (products.length >= MAX_PRODUCTS) return false;

    const $el = $(el);
    const href = $el.attr('href') || '';
    if (href.includes('search_p4p_id')) return;

    // Name
    const headingEl = $el.find('div[role="heading"], [class*="title"], [class*="Title"], h1, h3');
    let name = '';
    if (headingEl.length) {
      name = headingEl.first().attr('title') || headingEl.first().attr('aria-label') || headingEl.first().text().trim();
    }
    if (!name) return;

    // Price
    let price = 0;
    let isPKR = false;

    // Strategy 1: aria-label with currency
    $el.find('div[aria-label], span[aria-label]').each((j, priceEl) => {
      if (price > 0) return false;
      const label = $(priceEl).attr('aria-label') || '';
      if (label.match(/PKR|USD|US\s*\$|\$|Rs|€|EUR/i)) {
        if (isDiscountText(label)) return;
        const priceMatch = label.match(/([\d,]+\.?\d*)/);
        if (priceMatch) {
          const val = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (val > 5) {
            price = val;
            isPKR = label.includes('PKR') || label.includes('Rs');
          }
        }
      }
    });

    // Strategy 2: price classes
    if (price === 0) {
      $el.find('[class*="price"], [class*="Price"]').each((j, priceEl) => {
        if (price > 0) return false;
        const cls = ($(priceEl).attr('class') || '').toLowerCase();
        if (cls.includes('coupon') || cls.includes('off') || cls.includes('discount') ||
            cls.includes('original') || cls.includes('del')) return;
        const text = $(priceEl).text().trim();
        if (isDiscountText(text)) return;
        if (text.match(/\$|PKR|Rs|€|US\s*\$/i)) {
          const allNums = text.match(/[\d,]+\.?\d*/g);
          if (allNums) {
            for (const numStr of allNums) {
              const val = parseFloat(numStr.replace(/,/g, ''));
              if (val > 5) { price = val; isPKR = text.includes('PKR') || text.includes('Rs'); break; }
            }
          }
        }
      });
    }

    if (price <= 0) return;

    // Convert PKR to USD
    let finalPrice = price;
    let displayPrice;
    if (isPKR) {
      finalPrice = Math.round(price * 0.0036 * 100) / 100;
      displayPrice = `$${finalPrice.toFixed(2)}`;
    } else {
      displayPrice = `$${price.toFixed(2)}`;
    }

    // Image
    const imgEl = $el.find('img');
    let image = imgEl.length ? (imgEl.first().attr('src') || imgEl.first().attr('data-src') || '') : '';
    if (image.startsWith('//')) image = 'https:' + image;

    // Link
    let link = href;
    if (link.startsWith('//')) link = 'https:' + link;

    // Rating
    const ratingEl = $el.find('[class*="star"], [class*="rating"]');
    const ratingText = ratingEl.length ? ratingEl.first().text().trim() : '';
    const ratingMatch = ratingText.match(/([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    // Sold count
    const soldEl = $el.find('[class*="sold"], [class*="order"]');
    const soldText = soldEl.length ? soldEl.first().text().trim() : '';
    const soldMatch = soldText.match(/([\d,]+)/);
    const reviewCount = soldMatch ? parseInt(soldMatch[1].replace(/,/g, '')) : 0;

    products.push({
      name, price: finalPrice, displayPrice, image, link,
      platform: 'AliExpress', rating, reviewCount, sellerRating: 0,
      priceSource: 'extension'
    });
  });

  // Nuclear fallback: scan all /item/ links
  if (products.length === 0) {
    const seen = new Set();
    $('a[href*="/item/"]').each((i, el) => {
      if (products.length >= MAX_PRODUCTS) return false;
      const $a = $(el);
      let link = $a.attr('href') || '';
      if (!link.includes('.html') || seen.has(link)) return;
      if (link.includes('search_p4p_id')) return;
      seen.add(link);

      const container = $a.closest('[class*="card"], [class*="item"], li, div');
      if (!container.length) return;

      const text = container.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      if (lines.length < 2) return;

      let name = '';
      for (const line of lines) {
        if (line.length >= 10 && !line.match(/^\$|^US|^PKR|^Rs|^\d+%/)) { name = line; break; }
      }
      if (!name) return;

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
      if (price <= 0) return;

      let finalPrice = price;
      if (isPKR) finalPrice = Math.round(price * 0.0036 * 100) / 100;

      if (link.startsWith('//')) link = 'https:' + link;
      const imgEl = container.find('img');
      let image = imgEl.length ? (imgEl.first().attr('src') || '') : '';
      if (image.startsWith('//')) image = 'https:' + image;

      products.push({
        name, price: finalPrice, displayPrice: `$${finalPrice.toFixed(2)}`, image, link,
        platform: 'AliExpress', rating: 0, reviewCount: 0, sellerRating: 0,
        priceSource: 'extension'
      });
    });
  }

  return products;
}

// ================= Daraz Parser =================

function parseDarazHTML(html, query) {
  const $ = cheerio.load(html);
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const products = [];
  const pkrRate = getRate('USD', 'PKR') || FALLBACK_PKR_RATE;
  const seen = new Set();

  function parsePKR(text) {
    if (!text) return 0;
    const cleaned = text.replace(/Rs\.?/gi, '').replace(/PKR/gi, '')
      .replace(/₨/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
    const m = cleaned.match(/^(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }

  // Strategy 1: data-qa-locator product cards
  $('[data-qa-locator="product-item"]').each((i, el) => {
    if (products.length >= MAX_PRODUCTS) return false;
    const $el = $(el);

    const linkEl = $el.find('a[href*="/products/"]');
    if (!linkEl.length) return;
    const link = linkEl.first().attr('href') || '';
    if (seen.has(link)) return;
    seen.add(link);

    // Get all text lines
    const allText = $el.text();
    const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 2);

    // Title
    let name = '';
    for (const line of lines) {
      if (line.match(/^Rs\.?|^₨|^\d+%|^Coins|^Free/i)) continue;
      if (line.length >= 10) { name = line; break; }
    }
    if (!name) {
      const titleEl = $el.find('[class*="title"], [class*="Title"], [class*="name"], h2, h3');
      name = titleEl.length ? titleEl.first().text().trim() : '';
    }
    if (!name || name.length < 5) return;

    // Price (PKR)
    let pricePKR = 0;
    for (const line of lines) {
      if (line.match(/Rs\.?|₨|PKR/i) && !isDiscountText(line)) {
        const v = parsePKR(line);
        if (v >= 100) { pricePKR = v; break; }
      }
    }
    if (!pricePKR) return;

    const priceUSD = Math.round((pricePKR / pkrRate) * 100) / 100;

    // Image
    const imgEl = $el.find('img');
    let image = imgEl.length ? (imgEl.first().attr('src') || imgEl.first().attr('data-src') || '') : '';
    if (image.startsWith('//')) image = 'https:' + image;

    const fullLink = link.startsWith('http') ? link : `https://www.daraz.pk${link}`;

    // Rating
    let rating = 0;
    let reviewCount = 0;
    for (const line of lines) {
      const rMatch = line.match(/^([\d.]+)$/);
      if (rMatch) {
        const v = parseFloat(rMatch[1]);
        if (v > 0 && v <= 5) { rating = v; continue; }
      }
      const rcMatch = line.match(/^\((\d+)\)$/);
      if (rcMatch) { reviewCount = parseInt(rcMatch[1]); }
    }

    products.push({
      name, price: priceUSD,
      displayPrice: `Rs. ${Math.round(pricePKR).toLocaleString()} (~$${priceUSD.toFixed(0)})`,
      originalPricePKR: pricePKR,
      exchangeRate: `1 USD = ${pkrRate} PKR`,
      image, link: fullLink,
      platform: 'Daraz', rating, reviewCount,
      sellerRating: rating,
      priceCurrency: 'PKR',
      priceSource: 'extension'
    });
  });

  // Strategy 2: link scanning fallback
  if (products.length === 0) {
    $('a[href*="/products/"]').each((i, el) => {
      if (products.length >= MAX_PRODUCTS) return false;
      const href = $(el).attr('href') || '';
      if (seen.has(href)) return;
      seen.add(href);

      const container = $(el).closest('[data-qa-locator], [data-tracking], [class*="card"], li');
      if (!container.length) return;

      const text = container.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);

      let name = '';
      for (const line of lines) {
        if (line.match(/^Rs\.?|^₨|^\d+%|^Coins|^Free/i)) continue;
        if (line.length >= 10) {
          name = line; break;
        }
      }
      if (!name) return;

      let pricePKR = 0;
      for (const line of lines) {
        if (line.match(/Rs\.?|₨|PKR/i) && !isDiscountText(line)) {
          const v = parsePKR(line);
          if (v >= 100) { pricePKR = v; break; }
        }
      }
      if (!pricePKR) return;

      const priceUSD = Math.round((pricePKR / pkrRate) * 100) / 100;
      const fullLink = href.startsWith('http') ? href : `https://www.daraz.pk${href}`;
      const imgEl = container.find('img');
      const image = imgEl.length ? (imgEl.first().attr('src') || '') : '';

      products.push({
        name, price: priceUSD,
        displayPrice: `Rs. ${Math.round(pricePKR).toLocaleString()} (~$${priceUSD.toFixed(0)})`,
        originalPricePKR: pricePKR, image, link: fullLink,
        platform: 'Daraz', rating: 0, reviewCount: 0, sellerRating: 0,
        priceCurrency: 'PKR', priceSource: 'extension'
      });
    });
  }

  return products;
}

// ================= Review Parser =================

function parseReviewsHTML(html, platform) {
  const $ = cheerio.load(html);
  const reviews = [];

  const REVIEW_SELECTORS = {
    amazon: ['.review-text-content span', '[data-hook="review-body"] span', '.cr-widget-FocalReviews .review-text'],
    ebay: ['.review-item-content p', '[itemprop="reviewBody"]', '.review-item__text'],
    aliexpress: ['.buyer-feedback span', '.list--itemReview span', '[class*="review-content"]'],
    daraz: ['.item-review-content', '.review-content-sl', '[class*="review"] [class*="content"] p']
  };

  const selectors = REVIEW_SELECTORS[platform.toLowerCase()] || [];

  for (const sel of selectors) {
    $(sel).each((i, el) => {
      if (reviews.length >= 15) return false;
      const text = $(el).text().trim();
      if (text.length > 10 && text.length < 2000) {
        const lower = text.toLowerCase();
        if (!lower.startsWith('dear ') && !lower.startsWith('thank you for') &&
            !lower.startsWith('hi, ') && !lower.startsWith('hello,')) {
          reviews.push(text.substring(0, 500));
        }
      }
    });
    if (reviews.length > 0) break;
  }

  // Universal fallback
  if (reviews.length === 0) {
    $('[class*="review"] p, [class*="review"] span, [class*="feedback"] p, [class*="comment"] p').each((i, el) => {
      if (reviews.length >= 15) return false;
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 2000) {
        reviews.push(text.substring(0, 500));
      }
    });
  }

  return reviews;
}

// ================= Main Parser Dispatcher =================

function parseHTML(html, platform, query) {
  const p = platform.toLowerCase();
  switch (p) {
    case 'amazon': return parseAmazonHTML(html, query);
    case 'ebay': return parseEbayHTML(html, query);
    case 'aliexpress': return parseAliExpressHTML(html, query);
    case 'daraz': return parseDarazHTML(html, query);
    default:
      console.warn(`Unknown platform for HTML parsing: ${platform}`);
      return [];
  }
}

module.exports = {
  parseHTML,
  parseAmazonHTML,
  parseEbayHTML,
  parseAliExpressHTML,
  parseDarazHTML,
  parseReviewsHTML
};
