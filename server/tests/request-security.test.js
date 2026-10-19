const test = require('node:test');
const assert = require('node:assert/strict');
const validate = require('../middleware/validateRequest');
const { allowedOrigins, validateEnvironment } = require('../config/security');
const errorHandler = require('../middleware/errorHandler');
function accepts(middleware, req) {
  let accepted = false;
  middleware(req, { status() { return this; }, json() {} }, () => { accepted = true; });
  return accepted;
}
test('CORS only allows exact configured production origins', () => {
  const origins = allowedOrigins({ NODE_ENV: 'production', CLIENT_URL: 'https://shop.example, https://preview.example' });
  assert.ok(origins.has('https://shop.example'));
  for (const value of ['https://shop.example.attacker.com', 'https://random.vercel.app', 'http://localhost:3000']) assert.ok(!origins.has(value));
});
test('startup rejects missing or placeholder secrets', () => {
  assert.throws(() => validateEnvironment({ MONGO_URI: 'mongodb://localhost/test', JWT_SECRET: 'replace-with-a-long-random-secret' }));
  assert.throws(() => validateEnvironment({ MONGO_URI: 'mongodb://localhost/test', JWT_SECRET: 'a'.repeat(40), NODE_ENV: 'production' }));
});
test('search rejects object injection, excessive queries and duplicate platforms', () => {
  for (const query of [{ q: { $ne: '' } }, { q: 'x'.repeat(201) }, { q: 'phone', platforms: 'amazon,amazon' }]) assert.equal(accepts(validate.search, { query }), false);
  assert.equal(accepts(validate.search, { query: { q: 'phone', platforms: 'amazon,daraz' } }), true);
});
test('analysis bounds expensive review input and rejects unsafe product links', () => {
  const body = { productName: 'Phone', productPrice: 100, platform: 'Amazon', reviews: ['Good'] };
  assert.ok(accepts(validate.analysis, { body }));
  for (const override of [{ reviews: 'Good' }, { reviews: Array(101).fill('Good') }, { productPrice: -1 }, { productLink: 'http://127.0.0.1/admin' }, { productLink: 'https://amazon.com.evil.example/' }]) {
    assert.equal(accepts(validate.analysis, { body: { ...body, ...override } }), false);
  }
});
test('image downloads only accept HTTPS from known marketplace image hosts', () => {
  for (const imageUrl of ['http://169.254.169.254/', 'https://localhost/', 'https://i.ebayimg.com.evil.example/a', 'https://user:pass@i.ebayimg.com/a', 'https://i.ebayimg.com:444/a']) {
    assert.equal(accepts(validate.imageUrl, { body: { imageUrl } }), false);
  }
  assert.ok(accepts(validate.imageUrl, { body: { imageUrl: 'https://i.ebayimg.com/images/example.jpg' } }));
});
test('pagination rejects negative, object and unbounded values', () => {
  for (const query of [{ page: '-1' }, { page: {} }, { limit: '51' }]) assert.equal(accepts(validate.history, { query }), false);
});
test('request errors retain client status without leaking parser details', () => {
  let status, body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; } };
  errorHandler({ type: 'entity.too.large' }, {}, res, () => {});
  assert.equal(status, 413);
  errorHandler({ type: 'entity.parse.failed', message: 'sensitive body' }, {}, res, () => {});
  assert.equal(status, 400);
  assert.ok(!body.message.includes('sensitive'));
});
