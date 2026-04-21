/**
 * Extension Controller
 * --------------------
 * HTTP endpoints for Chrome extension communication.
 * Supplements WebSocket with polling fallback.
 */

const extensionManager = require('../extension/extensionManager');

/**
 * GET /api/extension/status
 * Check if the current user's extension is connected.
 */
const getStatus = (req, res) => {
  const status = extensionManager.getStatus(req.user.userId);
  res.json(status);
};

/**
 * POST /api/extension/register
 * Register an extension for the current user.
 */
const register = (req, res) => {
  const { extensionId } = req.body;
  if (!extensionId) {
    return res.status(400).json({ message: 'extensionId required' });
  }
  extensionManager.registerExtension(req.user.userId, extensionId);
  res.json({ success: true, message: 'Extension registered' });
};

/**
 * POST /api/extension/heartbeat
 * Update extension heartbeat timestamp.
 */
const heartbeat = (req, res) => {
  extensionManager.heartbeat(req.user.userId);
  res.json({ success: true });
};

/**
 * GET /api/extension/tasks
 * Get pending scraping tasks for this user's extension (polling).
 */
const getTasks = (req, res) => {
  const tasks = extensionManager.getAndClearTasks(req.user.userId);
  res.json({ tasks });
};

/**
 * POST /api/extension/results
 * Receive scraped HTML from extension for a search task.
 */
const receiveResults = (req, res) => {
  const { taskId, platform, products, error } = req.body;
  if (!taskId || !platform) {
    return res.status(400).json({ message: 'taskId and platform required' });
  }

  // The extension sends raw HTML as 'products' field
  const html = products; // It's actually HTML string from the content script
  extensionManager.handleSearchResult(taskId, platform, html, error);
  res.json({ success: true });
};

/**
 * POST /api/extension/review-results
 * Receive scraped reviews from extension.
 */
const receiveReviewResults = (req, res) => {
  const { taskId, reviews, error } = req.body;
  if (!taskId) {
    return res.status(400).json({ message: 'taskId required' });
  }

  extensionManager.handleReviewResult(taskId, reviews, error);
  res.json({ success: true });
};

module.exports = { getStatus, register, heartbeat, getTasks, receiveResults, receiveReviewResults };
