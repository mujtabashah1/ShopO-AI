/**
 * Auth Routes
 * -----------
 * Handles user authentication endpoints:
 *   POST /api/auth/register - Create new account
 *   POST /api/auth/login    - Login to existing account
 *   GET  /api/auth/me       - Get current user profile (protected)
 * 
 * Input validation is done using express-validator before
 * the request reaches the controller.
 */

const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe } = require('../controllers/authController');
const auth = require('../middleware/auth');

const { authLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

/**
 * POST /api/auth/register
 * Body: { name, email, password }
 * Returns: { message, token, user }
 */
router.post('/register', authLimiter, [
  // Validation rules
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email')
    .isString().bail()
    .trim().toLowerCase()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email'),
  body('password')
    .isString().bail()
    .custom(value => Buffer.byteLength(value, 'utf8') <= 72).withMessage('Password must fit within 72 UTF-8 bytes')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], register);

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { message, token, user }
 */
router.post('/login', authLimiter, [
  body('email')
    .isString().bail()
    .trim().toLowerCase()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email'),
  body('password')
    .isString().bail()
    .custom(value => Buffer.byteLength(value, 'utf8') <= 72).withMessage('Password must fit within 72 UTF-8 bytes')
    .notEmpty().withMessage('Password is required')
], login);

/**
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 * Returns: { user }
 */
router.get('/me', auth, getMe);

module.exports = router;
