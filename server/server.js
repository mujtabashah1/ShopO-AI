/**
 * Express Server Entry Point
 * --------------------------
 * Main file that initializes and starts the Express server.
 * 
 * Responsibilities:
 *   1. Load environment variables from .env
 *   2. Connect to MongoDB
 *   3. Configure middleware (CORS, JSON parsing, rate limiting)
 *   4. Mount API routes
 *   5. Start listening on configured port
 * 
 * API Routes:
 *   /api/auth      - Authentication (register, login, me)
 *   /api/products   - Product search
 *   /api/analysis   - AI analysis and history
 */

// Load environment variables FIRST (before anything else uses them)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { initExchangeRates } = require('./config/exchangeRate');
const { apiLimiter } = require('./middleware/rateLimiter');

// Import route files
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const analysisRoutes = require('./routes/analysis');
const extensionRoutes = require('./routes/extension');

const { allowedOrigins, validateEnvironment } = require('./config/security');
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
const origins = allowedOrigins();

// ===== MIDDLEWARE =====

// Enable CORS (allow React frontend to call our API)
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (origins.has(origin)) return callback(null, true);

    // If none match, just return false instead of throwing a 500 error
    callback(null, false);
  },
  credentials: true
}));

// Bound JSON bodies; extension HTML has a separate budget.
app.use('/api/extension', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Health probes bypass user rate limits. Readiness requires a database connection.
app.get('/api/ready', (req, res) => {
  const ready = require('mongoose').connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
});

// Apply general rate limiter to all API routes
app.use('/api', apiLimiter);

// ===== API ROUTES =====

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/extension', extensionRoutes);

// ===== HEALTH CHECK =====

// Simple endpoint to verify the server is running
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SmartShop AI Server is running!',
    timestamp: new Date().toISOString()
  });
});

// ===== ERROR HANDLING =====

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use(require('./middleware/errorHandler'));

// ===== START SERVER =====

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateEnvironment();
    // Connect to MongoDB
    await connectDB();

    // Load live currency exchange rates (for Daraz PKR→USD conversion)
    await initExchangeRates();
    
    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`\n🚀 SmartShop AI Server running on port ${PORT}`);
      console.log(`📡 API: http://localhost:${PORT}/api`);
      console.log(`💊 Health: http://localhost:${PORT}/api/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });
    let stopping = false;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 15000);
      deadline.unref();
      server.close(async () => {
        try {
          await require('./scrapers/browserPool').closeBrowser();
          await require('mongoose').disconnect();
          clearTimeout(deadline);
          process.exit(0);
        } catch { process.exit(1); }
      });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

if (require.main === module) startServer();
module.exports = app;
