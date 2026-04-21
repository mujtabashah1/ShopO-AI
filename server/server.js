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

const app = express();

// ===== MIDDLEWARE =====

// Enable CORS (allow React frontend to call our API)
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Always allow localhost, Vercel domains, and the custom domain
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('vercel.app') || origin.includes('techskytechnical.com') || origin === process.env.CLIENT_URL) {
      return callback(null, true);
    }
    
    // If none match, just return false instead of throwing a 500 error
    callback(null, false);
  },
  credentials: true
}));

// Parse JSON request bodies (50mb to accommodate raw HTML from extension)
app.use(express.json({ limit: '50mb' }));

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

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
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== START SERVER =====

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Load live currency exchange rates (for Daraz PKR→USD conversion)
    await initExchangeRates();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 SmartShop AI Server running on port ${PORT}`);
      console.log(`📡 API: http://localhost:${PORT}/api`);
      console.log(`💊 Health: http://localhost:${PORT}/api/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
