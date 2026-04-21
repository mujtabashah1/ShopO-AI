/**
 * Product Routes
 * --------------
 * API endpoints for product search functionality.
 * All routes require authentication.
 * 
 * Endpoints:
 *   GET /api/products/search - Search products across platforms
 */

const express = require('express');
const multer = require('multer');
const { searchProducts, streamSearchProducts, identifyProductFromImage } = require('../controllers/productController');
const auth = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Image upload for search-by-image (10MB max, in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads allowed'));
  }
});

/**
 * GET /api/products/search?q=iPhone+15&platforms=ebay,amazon,aliexpress,daraz
 * Standard JSON response (waits for all platforms).
 */
router.get('/search', auth, searchLimiter, searchProducts);

/**
 * GET /api/products/search/stream?q=iPhone+15&platforms=ebay,amazon
 * SSE stream — sends results as each platform finishes.
 */
router.get('/search/stream', auth, searchLimiter, streamSearchProducts);

/**
 * POST /api/products/identify-image
 * Multipart upload — uses Gemini Vision to identify the product, returns a
 * search query that the frontend then runs through /search/stream.
 */
router.post('/identify-image', auth, upload.single('image'), identifyProductFromImage);

module.exports = router;
