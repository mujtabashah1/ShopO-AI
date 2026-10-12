/**
 * SmartShop AI Extension — Background Service Worker
 * ---------------------------------------------------
 * Manages WebSocket connection to the SmartShop server and coordinates
 * scraping tasks. When the server requests product data, this worker
 * opens background tabs, waits for content scripts to extract DOM,
 * and sends results back.
 */

const DEFAULT_SERVER_URL = 'http://localhost:5000';
const HEARTBEAT_INTERVAL = 25000; // 25s (keep service worker alive)
const TAB_TIMEOUT = 90000; // 90s max per tab (includes manual challenge handling)
const TASK_TIMEOUT = 180000; // 180s max per task

// State
let serverUrl = DEFAULT_SERVER_URL;
let isConnected = false;
let extensionId = null;
let authToken = null;
let activeTasks = new Map(); // taskId -> { platforms, results, tabIds, resolve, timer }
let pollingInterval = null;

// --------------- Storage Helpers ---------------

async function loadSettings() {
  const data = await chrome.storage.local.get(['serverUrl', 'extensionId', 'authToken']);
  serverUrl = data.serverUrl || DEFAULT_SERVER_URL;
  authToken = data.authToken || null;
  if (!data.extensionId) {
    extensionId = 'ext_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    await chrome.storage.local.set({ extensionId });
  } else {
    extensionId = data.extensionId;
  }
}

async function saveSettings() {
  await chrome.storage.local.set({ serverUrl, authToken });
}

// --------------- Server Communication (HTTP Polling) ---------------

async function serverFetch(path, options = {}) {
  const url = `${serverUrl}/api/extension${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const resp = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function registerWithServer() {
  if (!authToken) {
    console.log('[SmartShop] No auth token — cannot register');
    updateConnectionState(false);
    return;
  }
  try {
    await serverFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ extensionId })
    });
    updateConnectionState(true);
    console.log('[SmartShop] Registered with server');
    startPolling();
  } catch (err) {
    console.error('[SmartShop] Registration failed:', err.message);
    updateConnectionState(false);
  }
}

function startPolling() {
  stopPolling();
  pollingInterval = setInterval(pollForTasks, 3000);
  // Also send heartbeats
  chrome.alarms.create('heartbeat', { periodInMinutes: 0.4 }); // ~24s
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  chrome.alarms.clear('heartbeat');
}

async function pollForTasks() {
  if (!isConnected || !authToken) return;
  try {
    const data = await serverFetch('/tasks');
    if (data.tasks && data.tasks.length > 0) {
      for (const task of data.tasks) {
        if (task.type === 'search') {
          handleSearchTask(task);
        } else if (task.type === 'reviews') {
          handleReviewTask(task);
        }
      }
    }
  } catch (err) {
    if (err.message.includes('401')) {
      updateConnectionState(false);
      stopPolling();
    }
  }
}

async function sendHeartbeat() {
  if (!isConnected || !authToken) return;
  try {
    await serverFetch('/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ extensionId })
    });
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('404')) {
      updateConnectionState(false);
      stopPolling();
    }
  }
}

async function sendResult(taskId, platform, products, error = null) {
  try {
    await serverFetch('/results', {
      method: 'POST',
      body: JSON.stringify({ taskId, platform, products, error })
    });
  } catch (err) {
    console.error('[SmartShop] Failed to send result:', err.message);
  }
}

async function sendReviewResult(taskId, reviews, error = null) {
  try {
    await serverFetch('/review-results', {
      method: 'POST',
      body: JSON.stringify({ taskId, reviews, error })
    });
  } catch (err) {
    console.error('[SmartShop] Failed to send review result:', err.message);
  }
}

// --------------- Connection State ---------------

function updateConnectionState(connected) {
  isConnected = connected;
  chrome.storage.local.set({ isConnected });
  // Update badge
  chrome.action.setBadgeText({ text: connected ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: connected ? '#2ecc71' : '#e74c3c' });
}

// --------------- Search Task Handler ---------------

const PLATFORM_URLS = {
  amazon: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  ebay: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  aliexpress: (q) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`,
  daraz: (q) => `https://www.daraz.pk/catalog/?q=${encodeURIComponent(q)}`
};

async function handleSearchTask(task) {
  const { taskId, query, platforms } = task;

  if (activeTasks.has(taskId)) return; // Already processing

  console.log(`[SmartShop] Search task: "${query}" on [${platforms.join(', ')}]`);

  const taskState = {
    query,
    platforms: [...platforms],
    results: {},
    tabIds: [],
    completedCount: 0
  };
  activeTasks.set(taskId, taskState);

  // Set task timeout
  const taskTimer = setTimeout(() => {
    console.log(`[SmartShop] Task ${taskId} timed out`);
    cleanupTask(taskId);
  }, TASK_TIMEOUT);
  taskState.timer = taskTimer;

  // Open a tab for each platform
  for (const platform of platforms) {
    const urlFn = PLATFORM_URLS[platform.toLowerCase()];
    if (!urlFn) {
      taskState.results[platform] = { error: 'Unknown platform' };
      taskState.completedCount++;
      continue;
    }

    const url = urlFn(query);
    try {
      const tab = await chrome.tabs.create({ url, active: false });
      taskState.tabIds.push(tab.id);

      // Store scraping metadata so content script knows what to do
      await chrome.storage.session.set({
        [`tab_${tab.id}`]: { taskId, platform, query, type: 'search' }
      });

      // Tab timeout
      setTimeout(async () => {
        const task = activeTasks.get(taskId);
        if (task && !task.results[platform]) {
          console.log(`[SmartShop] Tab timeout for ${platform}`);
          task.results[platform] = { error: 'Timeout' };
          task.completedCount++;
          await sendResult(taskId, platform, null, 'Timeout');
          try { chrome.tabs.remove(tab.id); } catch (e) {}
          checkTaskComplete(taskId);
        }
      }, TAB_TIMEOUT);

    } catch (err) {
      console.error(`[SmartShop] Failed to open ${platform} tab:`, err.message);
      taskState.results[platform] = { error: err.message };
      taskState.completedCount++;
      await sendResult(taskId, platform, null, err.message);
    }
  }

  checkTaskComplete(taskId);
}

// --------------- Review Task Handler ---------------

async function handleReviewTask(task) {
  const { taskId, productUrl, platform } = task;

  if (activeTasks.has(taskId)) return;

  console.log(`[SmartShop] Review task: ${platform} — ${productUrl.substring(0, 60)}...`);

  const taskState = {
    productUrl,
    platform,
    tabIds: [],
    completed: false
  };
  activeTasks.set(taskId, taskState);

  const taskTimer = setTimeout(() => {
    if (!taskState.completed) {
      console.log(`[SmartShop] Review task ${taskId} timed out`);
      sendReviewResult(taskId, null, 'Timeout');
      cleanupTask(taskId);
    }
  }, TAB_TIMEOUT);
  taskState.timer = taskTimer;

  try {
    const tab = await chrome.tabs.create({ url: productUrl, active: false });
    taskState.tabIds.push(tab.id);

    await chrome.storage.session.set({
      [`tab_${tab.id}`]: { taskId, platform, type: 'reviews' }
    });
  } catch (err) {
    console.error(`[SmartShop] Failed to open review tab:`, err.message);
    await sendReviewResult(taskId, null, err.message);
    cleanupTask(taskId);
  }
}

// --------------- Task Completion ---------------

function checkTaskComplete(taskId) {
  const task = activeTasks.get(taskId);
  if (!task) return;

  if (task.completedCount >= task.platforms.length) {
    console.log(`[SmartShop] Task ${taskId} complete — all platforms done`);
    cleanupTask(taskId);
  }
}

function cleanupTask(taskId) {
  const task = activeTasks.get(taskId);
  if (!task) return;

  // Clear timeout
  if (task.timer) clearTimeout(task.timer);

  // Close any remaining tabs
  for (const tabId of (task.tabIds || [])) {
    try { chrome.tabs.remove(tabId); } catch (e) {}
  }

  activeTasks.delete(taskId);
}

// --------------- Message Handler (from content scripts) ---------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOM_EXTRACTED') {
    handleDomExtracted(message, sender);
    sendResponse({ received: true });
  } else if (message.type === 'REVIEWS_EXTRACTED') {
    handleReviewsExtracted(message, sender);
    sendResponse({ received: true });
  } else if (message.type === 'CAPTCHA_DETECTED') {
    // Bring the tab to front so the user can resolve the challenge manually.
    if (sender.tab?.id) {
      console.log(`[SmartShop] CAPTCHA on ${message.platform} — bringing tab to front`);
      chrome.tabs.update(sender.tab.id, { active: true });
      chrome.windows.update(sender.tab.windowId, { focused: true });
    }
    sendResponse({ ok: true });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ isConnected, serverUrl, activeTasks: activeTasks.size });
  } else if (message.type === 'SET_AUTH') {
    authToken = message.token;
    saveSettings();
    registerWithServer();
    sendResponse({ ok: true });
  } else if (message.type === 'SET_SERVER_URL') {
    serverUrl = message.url;
    saveSettings();
    sendResponse({ ok: true });
  } else if (message.type === 'CONNECT') {
    authToken = message.token;
    serverUrl = message.serverUrl || serverUrl;
    saveSettings();
    registerWithServer();
    sendResponse({ ok: true });
  } else if (message.type === 'DISCONNECT') {
    stopPolling();
    updateConnectionState(false);
    sendResponse({ ok: true });
  }
  return true; // Keep channel open for async
});

async function handleDomExtracted(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  // Look up what task this tab belongs to
  const tabMeta = await chrome.storage.session.get(`tab_${tabId}`);
  const meta = tabMeta[`tab_${tabId}`];
  if (!meta) return;

  const { taskId, platform } = meta;
  const task = activeTasks.get(taskId);
  if (!task) return;

  console.log(`[SmartShop] Received DOM from ${platform} (${Math.round(message.html.length / 1024)}KB)`);

  // Send HTML to server for parsing
  task.results[platform] = { html: message.html };
  task.completedCount++;

  await sendResult(taskId, platform, message.html);

  // Clean up tab metadata and close tab
  await chrome.storage.session.remove(`tab_${tabId}`);
  try { chrome.tabs.remove(tabId); } catch (e) {}

  checkTaskComplete(taskId);
}

async function handleReviewsExtracted(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const tabMeta = await chrome.storage.session.get(`tab_${tabId}`);
  const meta = tabMeta[`tab_${tabId}`];
  if (!meta) return;

  const { taskId } = meta;
  const task = activeTasks.get(taskId);
  if (!task) return;

  console.log(`[SmartShop] Received ${message.reviews.length} reviews from ${meta.platform}`);

  task.completed = true;
  await sendReviewResult(taskId, message.reviews);

  await chrome.storage.session.remove(`tab_${tabId}`);
  try { chrome.tabs.remove(tabId); } catch (e) {}
  cleanupTask(taskId);
}

// --------------- Alarms (Heartbeat) ---------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') {
    sendHeartbeat();
  }
});

// --------------- Initialize ---------------

loadSettings().then(() => {
  console.log('[SmartShop] Extension loaded, ID:', extensionId);
  if (authToken) {
    registerWithServer();
  }
});
