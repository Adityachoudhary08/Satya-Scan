console.log("Node version running:", process.version);
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const { PORT } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const analyzeRoutes = require('./routes/analyze');
const historyRoutes = require('./routes/history');
const reportRoutes = require('./routes/report');
const healthRoutes = require('./routes/health');

const app = express();

app.set("trust proxy", 1);

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(cors({ origin: '*' })); // Accept all for now, restrict in prod
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(generalLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/health', healthRoutes);

// Error Handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`✅ Server is running on port ${PORT}`);
});
