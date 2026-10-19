const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const products = [1, 2].map(n => ({ name: `Headphones ${n}`, price: 100, platform: 'Amazon', link: `https://www.amazon.com/dp/${n}` }));
class Search {
  async save() {}
  static async deleteMany() {}
  static findOne(filter) {
    Search.lastFilter = filter;
    return { sort: async () => ({ products, platformResults: { aliexpress: { status: 'failed', count: 0 } } }) };
  }
}
Module._load = function (name, ...args) {
  if (name === '../models/Search') return Search;
  if (name === '../scrapers') return {
    normalizeQuery: q => q, isRelevant: () => true,
    calculateTrustScore: () => 75, checkCaution: () => ({ isCaution: false }),
    scraperMap: { amazon: async () => products.map(p => ({ ...p })), aliexpress: async () => [] }
  };
  if (name === '../extension/extensionManager') return { isExtensionConnected: () => false };
  if (name === '../extension/htmlParser') return {};
  if (name === '../utils/aiRelevance') return {};
  return originalLoad.call(this, name, ...args);
};
const { streamSearchProducts } = require('../controllers/productController');
Module._load = originalLoad;

test('failed marketplaces never receive invented listings or prices', async () => {
  const events = [];
  await streamSearchProducts({ query: { q: 'headphones', platforms: 'amazon,aliexpress', forceRefresh: 'true' }, user: { userId: 'user' } }, {
    writeHead() {}, end() {},
    write(chunk) {
      const match = chunk.match(/^event: (.+)\ndata: (.+)\n/);
      if (match) events.push({ event: match[1], data: JSON.parse(match[2]) });
    }
  });
  const completed = events.find(e => e.event === 'search_complete').data;
  assert.equal(completed.products.length, 2);
  assert.ok(completed.products.every(p => p.platform === 'Amazon' && p.price === 100));
  assert.equal(completed.platformResults.aliexpress.status, 'failed');
  const partial = events.find(e => e.event === 'platform_done' && e.data.platform === 'aliexpress');
  assert.equal(partial.data.status, 'failed');
});

test('cache reads enforce freshness, user isolation and the corrected data version', async () => {
  const events = [];
  await streamSearchProducts({ query: { q: 'headphones', platforms: 'amazon,aliexpress' }, user: { userId: 'user-a' } }, {
    writeHead() {}, end() {},
    write(chunk) {
      const match = chunk.match(/^event: (.+)\ndata: (.+)\n/);
      if (match) events.push({ event: match[1], data: JSON.parse(match[2]) });
    }
  });
  assert.equal(Search.lastFilter.user, 'user-a');
  assert.equal(Search.lastFilter.cacheVersion, 2);
  assert.ok(Date.now() - Search.lastFilter.createdAt.$gt.getTime() <= 3601000);
  assert.equal(events[0].event, 'cached');
  assert.equal(events[0].data.platformResults.aliexpress.status, 'failed');
});
