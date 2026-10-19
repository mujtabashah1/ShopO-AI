/**
 * Browser Pool Manager
 * --------------------
 * Manages a shared Puppeteer browser instance for scraping.
 * Always runs in headless mode with anti-detection measures.
 * Uses puppeteer-extra with stealth plugin to avoid bot detection.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin (same idea as Flask's --disable-blink-features=AutomationControlled)
puppeteer.use(StealthPlugin());

let browser = null;
let launching = null;
let idleTimer = null;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Get or create a shared Puppeteer browser instance.
 * Always runs headless to avoid opening visible Chrome tabs.
 */
const getBrowser = async () => {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  if (!browser || !browser.isConnected()) {
    if (!launching) launching = (async () => {
      console.log(`🌐 Launching browser (headless)...`);
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--lang=en-US,en',
          '--window-size=1366,768'
        ],
        defaultViewport: { width: 1366, height: 768 }
      });

      // Hide webdriver property and set modern browser fingerprint
      browser.on('targetcreated', async (target) => {
        try {
          const page = await target.page();
          if (page) {
            await page.evaluateOnNewDocument(() => {
              Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
              Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
              Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
              window.chrome = { runtime: {} };
            });
          }
        } catch (e) { /* target destroyed before page() resolved — safe to ignore */ }
      });
    })().finally(() => { launching = null; });
    await launching;
  }

  // Auto-close after 5 minutes of inactivity
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await closeBrowser();
  }, IDLE_TIMEOUT);

  return browser;
};

/**
 * Close the shared browser instance.
 */
const closeBrowser = async () => {
  if (launching) await launching.catch(() => {});
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (browser) {
    try {
      await browser.close();
      console.log('🌐 Browser closed (idle timeout).');
    } catch (e) { /* already closed */ }
    browser = null;
  }
};

module.exports = { getBrowser, closeBrowser };
