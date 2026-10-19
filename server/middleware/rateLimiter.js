/**
 * Rate Limiter Middleware
 * ----------------------
 * Prevents abuse by limiting the number of requests per IP address.
 * Two limiters are configured:
 *   1. General API limiter: 100 requests per 15 minutes
 *   2. Search limiter: 10 search requests per minute (scraping is expensive)
 */

const rateLimit = require('express-rate-limit');

// General API rate limiter - applies to all routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,                  // Max 1000 requests per window
  message: {
    message: 'Too many requests. Please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter limiter for search/scraping endpoints
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 30,                    // Max 30 searches per minute
  message: {
    message: 'Too many search requests. Please wait a minute before searching again.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please try again in 15 minutes.' }
});

const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many analysis requests. Please try again in a minute.' }
});

module.exports = { apiLimiter, searchLimiter, authLimiter, analysisLimiter };
