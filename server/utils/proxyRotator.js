/**
 * Proxy Rotator
 * -------------
 * Manages a list of HTTP proxies (from Webshare or any provider).
 * Hands out a working proxy; blacklists failing ones temporarily.
 *
 * Config (.env):
 *   PROXY_USER=<username>
 *   PROXY_PASS=<password>
 *   PROXY_LIST=host1:port1,host2:port2,...
 *
 * Usage:
 *   const { getProxy, markFailed } = require('./proxyRotator');
 *   const proxy = getProxy();  // { host, port, username, password } or null
 *   ... use it ...
 *   markFailed(proxy); // if it fails, blacklist and rotate
 */

const BLACKLIST_MS = 5 * 60 * 1000; // 5 minutes — after this, try again

/**
 * Parse proxy list from env.
 * Returns array of { host, port, username, password } objects.
 */
function loadProxies() {
  const list = (process.env.PROXY_LIST || '').trim();
  const user = process.env.PROXY_USER || '';
  const pass = process.env.PROXY_PASS || '';
  if (!list) return [];

  return list.split(',').map(entry => {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    // Support both "host:port" (uses PROXY_USER/PROXY_PASS) and "host:port:user:pass"
    const parts = trimmed.split(':');
    if (parts.length >= 4) {
      return { host: parts[0], port: parts[1], username: parts[2], password: parts.slice(3).join(':') };
    }
    if (parts.length === 2 && user && pass) {
      return { host: parts[0], port: parts[1], username: user, password: pass };
    }
    return null;
  }).filter(Boolean);
}

let proxies = loadProxies();
let currentIdx = 0;
const blacklistedAt = new Map();  // key: host:port → timestamp

function keyOf(p) { return `${p.host}:${p.port}`; }

function isBlacklisted(p) {
  const ts = blacklistedAt.get(keyOf(p));
  if (!ts) return false;
  if (Date.now() - ts > BLACKLIST_MS) {
    blacklistedAt.delete(keyOf(p));
    return false;
  }
  return true;
}

/**
 * Get the next available (non-blacklisted) proxy, or null if none available.
 */
function getProxy() {
  if (proxies.length === 0) return null;

  // Try each proxy starting from current index
  for (let i = 0; i < proxies.length; i++) {
    const p = proxies[currentIdx % proxies.length];
    currentIdx++;
    if (!isBlacklisted(p)) return p;
  }

  // All blacklisted — clear blacklist and start over
  blacklistedAt.clear();
  if (proxies.length > 0) {
    return proxies[0];
  }
  return null;
}

/**
 * Mark a proxy as failed. Blacklists it for 5 minutes.
 */
function markFailed(proxy) {
  if (!proxy) return;
  blacklistedAt.set(keyOf(proxy), Date.now());
  console.log(`🚫 [Proxy] Blacklisted ${keyOf(proxy)} for ${BLACKLIST_MS / 1000}s`);
}

/**
 * How many working (non-blacklisted) proxies remain.
 */
function available() {
  return proxies.filter(p => !isBlacklisted(p)).length;
}

/**
 * Reload proxies from env (e.g., after .env update).
 */
function reload() {
  proxies = loadProxies();
  currentIdx = 0;
  blacklistedAt.clear();
}

module.exports = { getProxy, markFailed, available, reload, total: () => proxies.length };
