const mongoose = require('mongoose');
const logger = require('./logger');
const { MONGO_URI } = require('./env');

async function connectDB() {
  const maskedUri = MONGO_URI ? MONGO_URI.replace(/:([^@]+)@/, ':******@') : 'undefined';
  logger.info(`Attempting to connect to MongoDB URI: ${maskedUri}`);

  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info('✅ MongoDB connected successfully');
  } catch (error) {
    logger.error(`❌ MongoDB connection failed: ${error.message || error}`);
    if (error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }
  }

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}

module.exports = connectDB;
