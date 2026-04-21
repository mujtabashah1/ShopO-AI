/**
 * Extension Routes
 * ----------------
 * HTTP endpoints for Chrome extension communication.
 * All routes require JWT authentication.
 */

const express = require('express');
const auth = require('../middleware/auth');
const {
  getStatus,
  register,
  heartbeat,
  getTasks,
  receiveResults,
  receiveReviewResults
} = require('../controllers/extensionController');

const router = express.Router();

// GET /api/extension/status — Check extension connection
router.get('/status', auth, getStatus);

// POST /api/extension/register — Register extension
router.post('/register', auth, register);

// POST /api/extension/heartbeat — Keep-alive heartbeat
router.post('/heartbeat', auth, heartbeat);

// GET /api/extension/tasks — Poll for pending tasks
router.get('/tasks', auth, getTasks);

// POST /api/extension/results — Receive scraped HTML
router.post('/results', auth, receiveResults);

// POST /api/extension/review-results — Receive scraped reviews
router.post('/review-results', auth, receiveReviewResults);

module.exports = router;
