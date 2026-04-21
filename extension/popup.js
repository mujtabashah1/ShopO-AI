/**
 * SmartShop AI Extension — Popup Script
 * Manages the extension popup UI: connection status, settings, controls.
 */

const serverUrlInput = document.getElementById('serverUrl');
const authTokenInput = document.getElementById('authToken');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const activeTasksEl = document.getElementById('activeTasks');

// Load saved settings
chrome.storage.local.get(['serverUrl', 'authToken', 'isConnected'], (data) => {
  if (data.serverUrl) serverUrlInput.value = data.serverUrl;
  if (data.authToken) authTokenInput.value = data.authToken;
  updateUI(data.isConnected || false);
});

// Poll status from background
function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response) {
      updateUI(response.isConnected);
      activeTasksEl.textContent = response.activeTasks || 0;
    }
  });
}

function updateUI(connected) {
  if (connected) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected';
    statusText.className = 'status-text connected';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';
  } else {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Disconnected';
    statusText.className = 'status-text disconnected';
    connectBtn.style.display = 'block';
    disconnectBtn.style.display = 'none';
  }
}

connectBtn.addEventListener('click', () => {
  const serverUrl = serverUrlInput.value.trim();
  const token = authTokenInput.value.trim();

  if (!token) {
    statusText.textContent = 'Token required!';
    statusText.className = 'status-text error';
    return;
  }

  chrome.runtime.sendMessage({
    type: 'CONNECT',
    serverUrl,
    token
  }, (response) => {
    if (response?.ok) {
      statusText.textContent = 'Connecting...';
      setTimeout(refreshStatus, 2000);
    }
  });
});

disconnectBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'DISCONNECT' }, () => {
    updateUI(false);
  });
});

// Refresh every 3s while popup is open
setInterval(refreshStatus, 3000);
refreshStatus();
