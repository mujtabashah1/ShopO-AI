/**
 * SmartShop AI Extension — Content Script
 * ----------------------------------------
 * Injected into e-commerce pages (Amazon, eBay, AliExpress, Daraz).
 * Detects if the tab was opened by the extension for scraping,
 * waits for page content to load, auto-scrolls to trigger lazy loading,
 * then sends the full HTML back to the background service worker.
 */

(function () {
  'use strict';

  // Prevent running multiple times
  if (window.__smartshopInjected) return;
  window.__smartshopInjected = true;

  // --------------- Platform Detection ---------------

  function detectPlatform() {
    const host = location.hostname.toLowerCase();
    if (host.includes('amazon.com')) return 'amazon';
    if (host.includes('ebay.com')) return 'ebay';
    if (host.includes('aliexpress.com') || host.includes('aliexpress.us')) return 'aliexpress';
    if (host.includes('daraz.pk')) return 'daraz';
    return null;
  }

  // --------------- Platform-specific selectors to wait for ---------------

  const PLATFORM_SELECTORS = {
    amazon: [
      '[data-component-type="s-search-result"]',
      '.s-result-item',
      '#search .s-main-slot'
    ],
    ebay: [
      'li[id^="item"]',
      '.s-item',
      '.srp-results'
    ],
    aliexpress: [
      'a.search-card-item',
      'a[href*="/item/"]',
      '[class*="search-card-item"]'
    ],
    daraz: [
      '[data-qa-locator="product-item"]',
      'a[href*="/products/"]',
      '.ant-card'
    ]
  };

  // Selectors for review content on product pages
  const REVIEW_SELECTORS = {
    amazon: [
      '#cm-cr-dp-review-list .review-text-content',
      '[data-hook="review-body"]',
      '.cr-widget-FocalReviews .review-text'
    ],
    ebay: [
      '.reviews-content .review-item-content',
      '[itemprop="reviewBody"]',
      '.review-item__text'
    ],
    aliexpress: [
      '.feedback-list-wrap .buyer-feedback',
      '.list--itemReview',
      '[class*="review-content"]'
    ],
    daraz: [
      '.item-review-content',
      '.review-content-sl',
      '[class*="review"] [class*="content"]'
    ]
  };

  // --------------- Wait for content ---------------

  function waitForSelector(selectors, timeout = 30000) {
    return new Promise((resolve) => {
      const start = Date.now();

      function check() {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return resolve(sel);
        }
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(check, 500);
      }
      check();
    });
  }

  // --------------- Auto-scroll for lazy loading ---------------

  async function autoScroll(times = 5, delay = 800) {
    for (let i = 0; i < times; i++) {
      window.scrollBy(0, window.innerHeight * 0.7);
      await new Promise(r => setTimeout(r, delay));
    }
    // Scroll back to top
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
  }

  // --------------- Extract reviews from product page ---------------

  function extractReviews(platform) {
    const reviews = [];
    const selectors = REVIEW_SELECTORS[platform] || [];

    // Try platform-specific selectors
    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      elements.forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.length > 10 && text.length < 2000) {
          // Filter out seller replies
          const lower = text.toLowerCase();
          if (!lower.startsWith('dear ') && !lower.startsWith('thank you for') &&
              !lower.startsWith('hi, ') && !lower.startsWith('hello,')) {
            reviews.push(text.substring(0, 500));
          }
        }
      });
      if (reviews.length > 0) break;
    }

    // Universal fallback: look for any review-like content
    if (reviews.length === 0) {
      const allReviewEls = document.querySelectorAll(
        '[class*="review"] p, [class*="review"] span, [class*="feedback"] p, [class*="comment"] p'
      );
      allReviewEls.forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.length > 20 && text.length < 2000 && reviews.length < 15) {
          reviews.push(text.substring(0, 500));
        }
      });
    }

    return reviews.slice(0, 15);
  }

  // --------------- Dismiss popups/modals ---------------

  function dismissModals() {
    const closeSelectors = [
      '[class*="modal"] [class*="close"]',
      '[class*="popup"] [class*="close"]',
      '[aria-label="Close"]',
      '.comet-modal-close',
      'button[class*="close"]',
      '#sp-cc button', // Amazon cookie consent
      '#gdpr-banner-accept'
    ];

    for (const sel of closeSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          el.click();
        }
      } catch (e) {}
    }
  }

  // --------------- Main Logic ---------------

  async function main() {
    const platform = detectPlatform();
    if (!platform) return;

    // Check if this tab was opened by the extension for scraping
    const tabId = await getTabId();
    if (!tabId) return; // Not a scraping tab

    const metaKey = `tab_${tabId}`;
    let meta;
    try {
      const data = await chrome.storage.session.get(metaKey);
      meta = data[metaKey];
    } catch (e) {
      return; // No metadata = not a scraping tab
    }

    if (!meta) return;

    console.log(`[SmartShop] Content script active on ${platform} — task: ${meta.type}`);

    // Dismiss any popups
    dismissModals();

    if (meta.type === 'search') {
      // Wait for product content to appear
      const selectors = PLATFORM_SELECTORS[platform] || [];
      const found = await waitForSelector(selectors, 35000);

      if (found) {
        console.log(`[SmartShop] Products found via: ${found}`);
      } else {
        console.log(`[SmartShop] No product selectors found — sending HTML anyway`);
      }

      // Extra wait for Daraz CSR
      if (platform === 'daraz') {
        await new Promise(r => setTimeout(r, 5000));
      }

      // Auto-scroll to trigger lazy loading
      await autoScroll(5, 800);

      // Dismiss modals again (may appear after scroll)
      dismissModals();

      // Send full HTML to background
      const html = document.documentElement.outerHTML;
      chrome.runtime.sendMessage({
        type: 'DOM_EXTRACTED',
        platform,
        url: location.href,
        html
      });

    } else if (meta.type === 'reviews') {
      // Wait for review content
      const reviewSels = REVIEW_SELECTORS[platform] || [];
      await waitForSelector(reviewSels, 20000);

      // Scroll to load reviews
      await autoScroll(3, 1000);

      // Try clicking "show more reviews" buttons
      const moreButtons = document.querySelectorAll(
        'button[class*="more"], a[class*="more-review"], [class*="pagination"] a:last-child'
      );
      for (const btn of moreButtons) {
        try {
          btn.click();
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {}
      }

      // Extract reviews
      const reviews = extractReviews(platform);
      console.log(`[SmartShop] Extracted ${reviews.length} reviews`);

      chrome.runtime.sendMessage({
        type: 'REVIEWS_EXTRACTED',
        platform,
        url: location.href,
        reviews
      });
    }
  }

  // Helper: get current tab ID from background
  function getTabId() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
          if (chrome.runtime.lastError) {
            // If we can't communicate, try a different approach
            resolve(null);
            return;
          }
          resolve(response?.tabId);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Since content scripts can't directly get their tab ID easily,
  // we check session storage from the page side using a workaround:
  // The background script already stored metadata keyed by tab ID.
  // Content scripts receive their tab ID via sender.tab.id in the background handler.
  // So we just send a message and let background figure out our tab ID from sender.

  // --------------- CAPTCHA Detection & Auto-Solving ---------------

  function isCaptchaPage() {
    const title = document.title.toLowerCase();
    const url = location.href.toLowerCase();
    return title.includes('captcha') || title.includes('verify') ||
           url.includes('punish') || url.includes('x5secdata') ||
           document.querySelector('#nc_1_n1z, [class*="captcha"], [class*="slider"], .nc-container, #baxia-dialog-content');
  }

  // === Sleep helper ===
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /**
   * Search the entire document (including open iframes) for any matching selector.
   * Returns { el, doc } where doc is the document the element lives in.
   */
  function deepQuery(selectors) {
    const sels = Array.isArray(selectors) ? selectors : [selectors];
    // Try main document first
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) return { el, doc: document };
    }
    // Then recursively inside same-origin iframes
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) continue;
        for (const sel of sels) {
          const el = doc.querySelector(sel);
          if (el) return { el, doc };
        }
      } catch (e) { /* cross-origin */ }
    }
    return { el: null, doc: null };
  }

  /**
   * Find the two images used in a puzzle slide CAPTCHA:
   *   - bgImg: the large background image with a gap cut out
   *   - pieceImg: the small puzzle piece image that must be matched to the gap
   *
   * Returns { bgImg, pieceImg } or { bgImg: null, pieceImg: null } if not a puzzle.
   */
  function findPuzzleImages(ctx) {
    const rootDoc = ctx || document;
    // Common selectors across Geetest/baxia-style puzzles
    const bgSelectors = [
      '.gt_cut_bg_slice', '.geetest_canvas_bg',
      '[class*="bg-img"]', '[class*="bgImg"]',
      'canvas.geetest_canvas_bg', 'canvas[class*="bg"]',
      '[class*="sliderImg"] img', '.captcha-img'
    ];
    const pieceSelectors = [
      '.gt_cut_fullbg_slice', '.geetest_canvas_slice',
      '[class*="slice-img"]', '[class*="puzzle-img"]',
      'canvas.geetest_canvas_slice', 'canvas[class*="slice"]',
      '[class*="sliderBlock"] img'
    ];
    let bgImg = null, pieceImg = null;
    for (const sel of bgSelectors) { bgImg = rootDoc.querySelector(sel); if (bgImg) break; }
    for (const sel of pieceSelectors) { pieceImg = rootDoc.querySelector(sel); if (pieceImg) break; }
    return { bgImg, pieceImg };
  }

  /**
   * Analyze puzzle images with canvas to find the x-offset of the gap.
   *
   * Technique: scan each column of the background image for a bright vertical
   * edge (where the puzzle piece was removed — usually has high contrast borders).
   *
   * Returns the x-coordinate (in image pixels) where the gap starts, or null.
   */
  function findGapOffset(bgImg, pieceImg) {
    try {
      if (!bgImg) return null;
      const w = bgImg.naturalWidth || bgImg.width;
      const h = bgImg.naturalHeight || bgImg.height;
      if (w < 50 || h < 50) return null;

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      try {
        ctx.drawImage(bgImg, 0, 0, w, h);
      } catch (e) { return null; /* tainted canvas */ }

      let imgData;
      try {
        imgData = ctx.getImageData(0, 0, w, h);
      } catch (e) { return null; /* CORS-tainted */ }

      const data = imgData.data;
      // Sobel-style vertical edge detector: for each column, count how many
      // rows have a sudden brightness change between this column and the next.
      const edgeCount = new Array(w).fill(0);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 2; x++) {
          const i = (y * w + x) * 4;
          const iR = (y * w + x + 1) * 4;
          const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
          const brightnessR = (data[iR] + data[iR+1] + data[iR+2]) / 3;
          const diff = Math.abs(brightness - brightnessR);
          if (diff > 42) edgeCount[x]++;
        }
      }

      // Find the column with the highest edge count, ignoring the left 10% (slider start)
      const startCol = Math.floor(w * 0.1);
      let bestX = startCol, bestCount = 0;
      for (let x = startCol; x < w; x++) {
        if (edgeCount[x] > bestCount) { bestCount = edgeCount[x]; bestX = x; }
      }
      // Convert from image pixels to displayed pixels
      const scale = (bgImg.getBoundingClientRect?.().width || w) / w;
      return bestX * scale;
    } catch (e) {
      console.warn('[SmartShop] Gap detection failed:', e.message);
      return null;
    }
  }

  /**
   * Dispatch both MouseEvent and PointerEvent simultaneously.
   * Modern sites often use pointer events; older ones use mouse events.
   * Covering both catches most implementations.
   */
  function dispatchDrag(target, type, x, y) {
    const opts = {
      clientX: x, clientY: y, screenX: x, screenY: y,
      bubbles: true, cancelable: true, composed: true,
      view: window, button: 0, buttons: type === 'mouseup' ? 0 : 1
    };
    try { target.dispatchEvent(new MouseEvent(type, opts)); } catch (e) {}
    try {
      const ptrType = type === 'mousedown' ? 'pointerdown' : type === 'mousemove' ? 'pointermove' : 'pointerup';
      const ptrOpts = { ...opts, pointerId: 1, pointerType: 'mouse', isPrimary: true };
      target.dispatchEvent(new PointerEvent(ptrType, ptrOpts));
    } catch (e) {}
    try {
      // Also dispatch on document for listeners attached at window level
      document.dispatchEvent(new MouseEvent(type, opts));
    } catch (e) {}
  }

  /**
   * Generate human-like drag trajectory via bezier curve with micro-jitter.
   * Humans don't drag linearly — they accelerate, overshoot slightly, then correct.
   */
  function generateTrajectory(startX, endX, steps) {
    const path = [];
    const distance = endX - startX;
    // Slight overshoot (5-15%) then pull back — humans do this
    const overshoot = distance * (1.05 + Math.random() * 0.10);
    const overshootAt = Math.floor(steps * 0.85);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let x;
      if (i < overshootAt) {
        // Ease-in-out bezier approach: slow start, fast middle, slowing toward overshoot
        const p = i / overshootAt;
        const ease = p * p * (3 - 2 * p); // smoothstep
        x = startX + overshoot * ease;
      } else {
        // Pull back from overshoot to final position
        const p = (i - overshootAt) / (steps - overshootAt);
        const ease = 1 - Math.pow(1 - p, 2);
        x = startX + overshoot + (distance - overshoot) * ease;
      }
      // Micro-jitter
      x += (Math.random() - 0.5) * 1.5;
      path.push(x);
    }
    return path;
  }

  /**
   * Simulate a realistic human drag from (startX, startY) to (endX, startY).
   */
  async function humanDrag(slider, startX, startY, endX) {
    const steps = 30 + Math.floor(Math.random() * 20);
    const trajectory = generateTrajectory(startX, endX, steps);

    // Press down
    dispatchDrag(slider, 'mousedown', startX, startY);
    await sleep(80 + Math.random() * 120);

    // Move through trajectory with realistic timing
    for (let i = 1; i < trajectory.length; i++) {
      const x = trajectory[i];
      const y = startY + (Math.random() - 0.5) * 2.5; // Y jitter

      dispatchDrag(slider, 'mousemove', x, y);

      // Variable speed: slow start (human reaction), fast middle, slow at target
      const progress = i / trajectory.length;
      let delay;
      if (progress < 0.15) delay = 15 + Math.random() * 15;      // slow start
      else if (progress > 0.85) delay = 20 + Math.random() * 30;  // slow end
      else delay = 8 + Math.random() * 8;                         // fast middle
      await sleep(delay);
    }

    // Small pause before release (human hesitation)
    await sleep(80 + Math.random() * 150);

    // Release
    dispatchDrag(slider, 'mouseup', trajectory[trajectory.length - 1], startY);
  }

  /**
   * Try to auto-solve AliExpress slide CAPTCHA.
   *
   * Supports:
   *   1. Simple slider (drag all the way right)   → #nc_1_n1z style
   *   2. Puzzle slider (drag to gap position)      → geetest/baxia with two images
   *   3. Click-to-verify button                    → fallback
   *
   * Uses canvas image analysis to find puzzle gap when needed.
   */
  async function solveSlideCaptcha(maxRetries = 4) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[SmartShop] CAPTCHA solve attempt ${attempt}/${maxRetries}`);

      // Find slider and track
      const sliderSel = [
        '#nc_1_n1z', '[class*="btn_slide"]', '[class*="slider-btn"]',
        '[class*="slide-btn"]', '[id*="slider-button"]',
        '.geetest_slider_button', '[class*="slidetounlock"]',
        '[role="slider"]', '.nc_iconfont'
      ];
      const trackSel = [
        '#nc_1_n1t', '[class*="scale_text"]', '[class*="slider-track"]',
        '[class*="slide-track"]', '[id*="slider-track"]',
        '.geetest_slider_track', '.nc_scale'
      ];

      const { el: slider, doc: sliderDoc } = deepQuery(sliderSel);
      const { el: track } = deepQuery(trackSel);

      if (!slider) {
        console.log(`[SmartShop] No slider found — trying click-to-verify fallback...`);
        const verifyBtn = document.querySelector(
          '[class*="verify"]:not([class*="verified"]), [class*="check-btn"], [class*="confirm-btn"], button[type="submit"]'
        );
        if (verifyBtn) {
          verifyBtn.click();
          await sleep(3000);
          if (!isCaptchaPage()) return true;
        }
        await sleep(2000);
        continue;
      }

      const sliderRect = slider.getBoundingClientRect();
      const startX = sliderRect.left + sliderRect.width / 2;
      const startY = sliderRect.top + sliderRect.height / 2;

      // ===== Try to detect puzzle gap =====
      let targetX;
      const { bgImg, pieceImg } = findPuzzleImages(sliderDoc || document);
      const gapOffset = bgImg ? findGapOffset(bgImg, pieceImg) : null;

      if (gapOffset !== null && gapOffset > 30) {
        // Puzzle mode: slide the button so the piece aligns with the gap
        const bgRect = bgImg.getBoundingClientRect();
        // The piece typically starts at the left edge of the image; we need to
        // move it so its center aligns with the gap
        const pieceWidth = pieceImg?.getBoundingClientRect?.().width || 40;
        targetX = bgRect.left + gapOffset - pieceWidth / 2 + (sliderRect.width / 2);
        console.log(`[SmartShop] Puzzle gap detected at x=${Math.round(gapOffset)}px, targeting ${Math.round(targetX - startX)}px drag`);
      } else {
        // Simple slider mode: drag all the way right
        const trackRect = track?.getBoundingClientRect?.() || { left: sliderRect.left, width: 340 };
        targetX = trackRect.left + trackRect.width - sliderRect.width / 2 - 3;
        console.log(`[SmartShop] Simple slider — dragging to end (${Math.round(targetX - startX)}px)`);
      }

      // Add small random offset to avoid being pixel-perfect (humans aren't)
      targetX += (Math.random() - 0.5) * 4;

      // Hover first (humans don't instantly click — they move the mouse toward the target)
      dispatchDrag(slider, 'mousemove', startX - 20, startY);
      await sleep(100 + Math.random() * 200);
      dispatchDrag(slider, 'mouseover', startX, startY);
      await sleep(50 + Math.random() * 100);

      await humanDrag(slider, startX, startY, targetX);

      console.log(`[SmartShop] Drag completed, waiting for verification...`);
      await sleep(2000 + Math.random() * 1500);

      // Check if solved
      if (!isCaptchaPage()) {
        console.log(`[SmartShop] ✅ CAPTCHA solved!`);
        return true;
      }

      // Check for explicit success/failure indicators
      const successEl = document.querySelector('[class*="success"], .nc_iconfont.icon-ok, [class*="verified"]');
      if (successEl) {
        console.log(`[SmartShop] Success indicator — waiting for redirect...`);
        await sleep(3000);
        if (!isCaptchaPage()) return true;
      }

      const failEl = document.querySelector('[class*="refresh"], [class*="error"], [class*="fail"]');
      console.log(`[SmartShop] Not solved yet. Retrying${failEl ? ' after refresh' : ''}...`);

      // Click refresh button to get a new puzzle
      if (failEl) {
        try { failEl.click(); } catch (e) {}
        await sleep(2500);
      } else {
        await sleep(1500);
      }
    }

    return false;
  }

  /**
   * Wait for page to navigate away from CAPTCHA (user solved it manually or auto-solved).
   */
  async function waitForCaptchaResolution(timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!isCaptchaPage()) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  // --------------- Main Logic ---------------

  async function mainWithSenderDetection() {
    const platform = detectPlatform();
    if (!platform) return;

    await new Promise(r => setTimeout(r, 1500));

    // === CAPTCHA Handling ===
    if (isCaptchaPage()) {
      console.log(`[SmartShop] CAPTCHA detected on ${platform} — manual action required`);
      // Respect the site's access control. Bring the tab forward and wait for
      // the user; the extension does not attempt to solve or bypass CAPTCHAs.
      chrome.runtime.sendMessage({ type: 'CAPTCHA_DETECTED', platform });

      const manualSolved = await waitForCaptchaResolution(60000);
      if (!manualSolved) {
        console.log(`[SmartShop] CAPTCHA not resolved within 60s — giving up`);
        chrome.runtime.sendMessage({
          type: 'DOM_EXTRACTED', platform, url: location.href, html: ''
        });
        return;
      }

      console.log(`[SmartShop] CAPTCHA resolved — waiting for page to load...`);
      await new Promise(r => setTimeout(r, 3000));
    }

    const isSearch = isSearchUrl();
    const isProduct = isProductUrl();

    if (!isSearch && !isProduct) return;

    console.log(`[SmartShop] Content script on ${platform} (${isSearch ? 'search' : 'product'} page)`);

    dismissModals();

    if (isSearch) {
      const selectors = PLATFORM_SELECTORS[platform] || [];
      const found = await waitForSelector(selectors, 35000);
      if (found) console.log(`[SmartShop] Products found via: ${found}`);

      if (platform === 'daraz') await new Promise(r => setTimeout(r, 5000));

      await autoScroll(7, 800);
      dismissModals();

      chrome.runtime.sendMessage({
        type: 'DOM_EXTRACTED',
        platform,
        url: location.href,
        html: document.documentElement.outerHTML
      });

    } else if (isProduct) {
      const reviewSels = REVIEW_SELECTORS[platform] || [];
      await waitForSelector(reviewSels, 20000);
      await autoScroll(3, 1000);

      const reviews = extractReviews(platform);
      console.log(`[SmartShop] Extracted ${reviews.length} reviews`);

      chrome.runtime.sendMessage({
        type: 'REVIEWS_EXTRACTED',
        platform,
        url: location.href,
        reviews
      });
    }
  }

  function isSearchUrl() {
    const url = location.href.toLowerCase();
    return url.includes('/s?k=') || url.includes('/sch/i.html') ||
           url.includes('/wholesale?') || url.includes('searchtext=') ||
           url.includes('/wholesale-') || url.includes('/w/wholesale-') ||
           url.includes('/catalog/?q=') || url.includes('_nkw=');
  }

  function isProductUrl() {
    const url = location.href.toLowerCase();
    return url.includes('/dp/') || url.includes('/itm/') ||
           url.includes('/item/') || url.includes('/products/');
  }

  // Run after a brief delay
  setTimeout(mainWithSenderDetection, 2000);

})();
