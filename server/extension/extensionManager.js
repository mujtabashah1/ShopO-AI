/**
 * Extension Manager
 * -----------------
 * Manages Chrome extension connections and scraping tasks.
 * Tracks which users have connected extensions and queues
 * scraping tasks for them.
 *
 * All state is in-memory (extensions are ephemeral connections).
 */

const crypto = require('crypto');

// Connected extensions: userId -> { extensionId, lastHeartbeat, registeredAt }
const connectedExtensions = new Map();

// Pending tasks: taskId -> { type, userId, query, platforms, results, resolve, reject, timer, createdAt }
const pendingTasks = new Map();

// Pending tasks per user (for polling): userId -> [task objects]
const userTaskQueues = new Map();

const TASK_TIMEOUT = 180000; // 180s (extra time for CAPTCHA solving)
const HEARTBEAT_TIMEOUT = 60000; // 60s — extension dead if no heartbeat for this long

/**
 * Register an extension for a user.
 */
function registerExtension(userId, extensionId) {
  const uid = String(userId);
  connectedExtensions.set(uid, {
    extensionId,
    lastHeartbeat: Date.now(),
    registeredAt: Date.now()
  });
  console.log(`🔌 Extension registered for user ${uid} (ext: ${extensionId})`);
}

/**
 * Update heartbeat timestamp.
 */
function heartbeat(userId) {
  const ext = connectedExtensions.get(String(userId));
  if (ext) {
    ext.lastHeartbeat = Date.now();
  }
}

/**
 * Remove extension for a user.
 */
function unregisterExtension(userId) {
  const uid = String(userId);
  connectedExtensions.delete(uid);
  userTaskQueues.delete(uid);
  console.log(`🔌 Extension unregistered for user ${uid}`);
}

/**
 * Check if a user has an active extension connection.
 */
function isExtensionConnected(userId) {
  const uid = String(userId);
  const ext = connectedExtensions.get(uid);
  if (!ext) return false;

  // Check heartbeat freshness
  if (Date.now() - ext.lastHeartbeat > HEARTBEAT_TIMEOUT) {
    console.log(`🔌 Extension for user ${uid} timed out (no heartbeat)`);
    connectedExtensions.delete(uid);
    return false;
  }

  return true;
}

/**
 * Create a search scraping task.
 * Returns a Promise that resolves with parsed products when all platforms are done.
 */
function createSearchTask(userId, query, platforms) {
  const uid = String(userId);
  return new Promise((resolve, reject) => {
    const taskId = 'task_' + crypto.randomBytes(8).toString('hex');

    const task = {
      taskId,
      type: 'search',
      userId: uid,
      query,
      platforms: [...platforms],
      results: {}, // platform -> { html, products, error }
      completedPlatforms: 0,
      createdAt: Date.now(),
      resolve,
      reject
    };

    // Set timeout
    task.timer = setTimeout(() => {
      console.log(`⏰ Search task ${taskId} timed out`);
      // Resolve with whatever we have
      const partialResults = {};
      for (const [platform, result] of Object.entries(task.results)) {
        if (result.products) partialResults[platform] = result.products;
      }
      pendingTasks.delete(taskId);
      resolve({ products: partialResults, timedOut: true });
    }, TASK_TIMEOUT);

    pendingTasks.set(taskId, task);

    // Queue the task for the user's extension to pick up
    if (!userTaskQueues.has(uid)) {
      userTaskQueues.set(uid, []);
    }
    userTaskQueues.get(uid).push({
      taskId,
      type: 'search',
      query,
      platforms
    });

    console.log(`📋 Search task ${taskId} created for "${query}" on [${platforms.join(', ')}]`);
  });
}

/**
 * Create a review scraping task.
 * Returns a Promise that resolves with review texts.
 */
function createReviewTask(userId, productUrl, platform) {
  const uid = String(userId);
  return new Promise((resolve, reject) => {
    const taskId = 'rev_' + crypto.randomBytes(8).toString('hex');

    const task = {
      taskId,
      type: 'reviews',
      userId: uid,
      productUrl,
      platform,
      createdAt: Date.now(),
      resolve,
      reject
    };

    task.timer = setTimeout(() => {
      console.log(`⏰ Review task ${taskId} timed out`);
      pendingTasks.delete(taskId);
      resolve({ reviews: [], timedOut: true });
    }, TASK_TIMEOUT);

    pendingTasks.set(taskId, task);

    if (!userTaskQueues.has(uid)) {
      userTaskQueues.set(uid, []);
    }
    userTaskQueues.get(uid).push({
      taskId,
      type: 'reviews',
      productUrl,
      platform
    });

    console.log(`📋 Review task ${taskId} created for ${platform}`);
  });
}

/**
 * Get and clear pending tasks for a user (for HTTP polling).
 */
function getAndClearTasks(userId) {
  const uid = String(userId);
  const tasks = userTaskQueues.get(uid) || [];
  userTaskQueues.set(uid, []);
  return tasks;
}

/**
 * Handle search result from extension (HTML for one platform).
 * The HTML will be parsed by htmlParser.js on the caller side.
 */
function handleSearchResult(taskId, platform, html, error = null) {
  const task = pendingTasks.get(taskId);
  if (!task) {
    console.log(`⚠️ Result for unknown task ${taskId}`);
    return null;
  }

  if (error) {
    task.results[platform] = { error };
  } else {
    task.results[platform] = { html };
  }
  task.completedPlatforms++;

  console.log(`📦 Received ${platform} result for task ${taskId} (${task.completedPlatforms}/${task.platforms.length})`);

  // Check if all platforms are done
  if (task.completedPlatforms >= task.platforms.length) {
    clearTimeout(task.timer);
    pendingTasks.delete(taskId);

    // Return the raw HTML results — caller will parse them
    task.resolve({ results: task.results, timedOut: false });
  }

  return task;
}

/**
 * Handle review result from extension.
 */
function handleReviewResult(taskId, reviews, error = null) {
  const task = pendingTasks.get(taskId);
  if (!task) {
    console.log(`⚠️ Review result for unknown task ${taskId}`);
    return null;
  }

  clearTimeout(task.timer);
  pendingTasks.delete(taskId);

  if (error) {
    task.resolve({ reviews: [], error });
  } else {
    task.resolve({ reviews: reviews || [] });
  }

  return task;
}

/**
 * Get extension connection info.
 */
function getStatus(userId) {
  const uid = String(userId);
  const ext = connectedExtensions.get(uid);
  if (!ext) return { connected: false };

  const isAlive = Date.now() - ext.lastHeartbeat < HEARTBEAT_TIMEOUT;
  if (!isAlive) {
    connectedExtensions.delete(uid);
    return { connected: false };
  }

  return {
    connected: true,
    extensionId: ext.extensionId,
    registeredAt: ext.registeredAt,
    lastHeartbeat: ext.lastHeartbeat,
    pendingTasks: (userTaskQueues.get(uid) || []).length
  };
}

module.exports = {
  registerExtension,
  unregisterExtension,
  heartbeat,
  isExtensionConnected,
  createSearchTask,
  createReviewTask,
  getAndClearTasks,
  handleSearchResult,
  handleReviewResult,
  getStatus
};
