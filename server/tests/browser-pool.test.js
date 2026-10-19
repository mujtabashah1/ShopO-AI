const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let launches = 0;
let closed = false;
const fakeBrowser = { isConnected: () => true, on() {}, async close() { closed = true; } };
Module._load = function (name, ...args) {
  if (name === 'puppeteer-extra') return { use() {}, async launch() { launches++; await new Promise(resolve => setTimeout(resolve, 10)); return fakeBrowser; } };
  if (name === 'puppeteer-extra-plugin-stealth') return () => ({});
  return originalLoad.call(this, name, ...args);
};
const { getBrowser, closeBrowser } = require('../scrapers/browserPool');
Module._load = originalLoad;

test('concurrent scraper requests launch one shared browser', async () => {
  try {
    const browsers = await Promise.all([getBrowser(), getBrowser(), getBrowser()]);
    assert.equal(launches, 1);
    assert.ok(browsers.every(browser => browser === fakeBrowser));
  } finally { await closeBrowser(); }
  assert.equal(closed, true);
});
