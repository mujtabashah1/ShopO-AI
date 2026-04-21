/**
 * Auth Controller
 * ---------------
 * Handles user registration and login.
 * 
 * Functions:
 *   - register: Create new user account, return JWT token
 *   - login: Authenticate existing user, return JWT token
 *   - getMe: Return current user's profile (from JWT)
 */

const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

/**
 * Generate a JWT token for a user.
 * Token contains the userId and expires in 7 days.
 * @param {string} userId - MongoDB ObjectId of the user
 * @returns {string} Signed JWT token
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // Token valid for 7 days
  );
};

/**
 * POST /api/auth/register
 * Creates a new user account and returns a JWT token.
 */
const register = async (req, res) => {
  try {
    // Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'An account with this email already exists.' 
      });
    }

    // Create new user (password is auto-hashed by the pre-save hook)
    const user = new User({ name, email, password });
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Registration successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

/**
 * POST /api/auth/login
 * Authenticates user with email and password, returns JWT token.
 */
const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email (include password field for comparison)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid email or password.' 
      });
    }

    // Compare provided password with stored hash
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        message: 'Invalid email or password.' 
      });
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

/**
 * GET /api/auth/me
 * Returns the current logged-in user's profile.
 * Requires authentication (JWT token in header).
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('GetMe error:', error.message);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { register, login, getMe };
