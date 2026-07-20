const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/env');
const logger = require('../config/logger');

/**
 * Generate JWT token for a user.
 */
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * POST /api/auth/signup
 */
async function signup(req, res, next) {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Create user
    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);

    logger.info('New user registered', { userId: user._id, email });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Find user with password field included
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user._id);

    logger.info('User logged in', { userId: user._id, email });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 */
async function getMe(req, res, next) {
  try {
    const Check = require('../models/Check');

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate total reports
    const totalReports = await Check.countDocuments({ userId: req.userId });

    // Calculate verified today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const verifiedToday = await Check.countDocuments({
      userId: req.userId,
      createdAt: { $gte: startOfToday }
    });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      verifiedToday,
      totalReports
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { signup, login, getMe };
