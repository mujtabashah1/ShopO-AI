const markets = {
  amazon: ['amazon.com', 'amazon.co.uk'],
  ebay: ['ebay.com', 'ebay.co.uk'],
  daraz: ['daraz.pk'],
  aliexpress: ['aliexpress.com', 'aliexpress.us']
};
const imageHosts = ['m.media-amazon.com', 'images-na.ssl-images-amazon.com', 'i.ebayimg.com', 'img.alicdn.com', 'ae01.alicdn.com', 'ae-pic-a1.aliexpress-media.com', 'ae-pic-a2.aliexpress-media.com', 'static-01.daraz.pk', 'static-02.daraz.pk', 'img.drz.lazcdn.com', 'img.lazcdn.com'];

function permittedUrl(value, hosts, allowSubdomains = false) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      hosts.some(host => url.hostname === host || (allowSubdomains && url.hostname.endsWith(`.${host}`)));
  } catch { return false; }
}
const invalid = res => res.status(400).json({ message: 'Invalid request. Check the submitted fields.' });
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function search(req, res, next) {
  const { q, platforms, forceRefresh } = req.query;
  if (typeof q !== 'string' || !q.trim() || q.length > 200) return invalid(res);
  if (forceRefresh !== undefined && !['true', 'false'].includes(forceRefresh)) return invalid(res);
  if (platforms !== undefined) {
    if (typeof platforms !== 'string') return invalid(res);
    const list = platforms.split(',').map(p => p.trim().toLowerCase());
    if (list.length > 4 || list.some(p => !Object.hasOwn(markets, p)) || new Set(list).size !== list.length) return invalid(res);
    req.query.platforms = list.join(',');
  }
  next();
}

function analysis(req, res, next) {
  const b = req.body;
  if (!b || typeof b.productName !== 'string' || !b.productName.trim() || b.productName.length > 500 ||
      !finite(b.productPrice, 0.01, 1e9) || typeof b.platform !== 'string' || !Object.hasOwn(markets, b.platform.toLowerCase())) return invalid(res);
  for (const [key, max] of [['averagePrice', 1e9], ['sellerRating', 5], ['reviewCount', 1e9]]) {
    if (b[key] !== undefined && !finite(b[key], 0, max)) return invalid(res);
  }
  if (b.reviews !== undefined && (!Array.isArray(b.reviews) || b.reviews.length > 100 ||
      b.reviews.some(r => typeof r !== 'string' || r.length > 5000))) return invalid(res);
  if (b.productLink && b.productLink !== '#' && !permittedUrl(b.productLink, markets[b.platform.toLowerCase()], true)) return invalid(res);
  if (b.productImage && (typeof b.productImage !== 'string' || b.productImage.length > 2048 || !/^https:\/\//.test(b.productImage))) return invalid(res);
  next();
}

function history(req, res, next) {
  for (const [key, max] of [['page', 10000], ['limit', 50]]) {
    const value = req.query[key];
    if (value !== undefined && (typeof value !== 'string' || !/^\d+$/.test(value) || +value < 1 || +value > max)) return invalid(res);
  }
  next();
}

function imageUrl(req, res, next) {
  if (!req.body || !permittedUrl(req.body.imageUrl, imageHosts)) return invalid(res);
  next();
}

module.exports = { search, analysis, history, imageUrl, permittedUrl, imageHosts };
