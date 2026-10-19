/**
 * Analysis Routes
 * ---------------
 * API endpoints for AI product analysis, history, and image verification.
 * All routes require authentication.
 * 
 * Endpoints:
 *   POST /api/analysis/analyze       - Run AI analysis on a product
 *   POST /api/analysis/verify-image  - Verify product image authenticity (upload)
 *   POST /api/analysis/verify-url    - Verify product image from URL
 *   GET  /api/analysis/history       - Get user's past analyses
 *   GET  /api/analysis/:id           - Get a specific analysis by ID
 */

const express = require('express');
const multer = require('multer');
const { analyzeProduct, getHistory, getAnalysisById, verifyImage, verifyImageUrl } = require('../controllers/analysisController');
const auth = require('../middleware/auth');

const validate = require('../middleware/validateRequest');
const { analysisLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

// Configure multer for image uploads (memory storage — no files saved to disk)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(Object.assign(new Error('Only JPG, PNG, and WEBP images are allowed.'), { status: 400 }), false);
        }
    }
});

// POST /api/analysis/analyze — Run AI analysis
router.post('/analyze', auth, analysisLimiter, validate.analysis, analyzeProduct);

// POST /api/analysis/verify-image — Verify product image authenticity (file upload)
router.post('/verify-image', auth, analysisLimiter, upload.single('image'), verifyImage);

// POST /api/analysis/verify-url — Verify product image from URL (used by ProductDetail)
router.post('/verify-url', auth, analysisLimiter, validate.imageUrl, verifyImageUrl);

// GET /api/analysis/history — Get past analyses (paginated)
router.get('/history', auth, validate.history, getHistory);

// GET /api/analysis/:id — Get single analysis detail
router.get('/:id', auth, (req, res, next) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid analysis ID.' });
  next();
}, getAnalysisById);

module.exports = router;
