/**
 * JWT Authentication Middleware
 * -----------------------------
 * Protects routes by verifying the JWT token sent in the
 * Authorization header. If valid, attaches the user's ID
 * to req.user so downstream handlers can identify the user.
 * 
 * Usage: Add as middleware to any route that requires login.
 *   router.get('/protected', auth, controllerFunction);
 * 
 * Expected Header Format:
 *   Authorization: Bearer <jwt_token>
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // 1. Extract token from Authorization header or query param (for SSE)
    const authHeader = req.header('Authorization');
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    } else if (req.query.token) {
      // SSE (EventSource) can't set custom headers — accept token via query param
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        message: 'Access denied. No token provided.'
      });
    }

    // 2. Verify the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Find the user in database (make sure they still exist)
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Token is valid but user no longer exists.' 
      });
    }

    // 4. Attach user info to the request object
    req.user = {
      userId: user._id,
      name: user.name,
      email: user.email
    };

    next(); // Continue to the next middleware/route handler
  } catch (error) {
    // Token is invalid or expired
    return res.status(401).json({ 
      message: 'Invalid or expired token. Please login again.' 
    });
  }
};

module.exports = auth;
