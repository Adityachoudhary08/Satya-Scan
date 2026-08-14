const dotenv = require('dotenv');
const path = require('path');

// Load .env from Backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Required — server will not start without these
const REQUIRED_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
  'GEMINI_API_KEY',
  'TAVILY_API_KEY',
];

const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Optional — warn but do not exit if absent
if (!process.env.FACT_CHECK_API_KEY) {
  console.warn('⚠️  FACT_CHECK_API_KEY not set — Google Fact Check API will be skipped.');
}

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2 || null,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  FACT_CHECK_API_KEY: process.env.FACT_CHECK_API_KEY || null,
  NODE_ENV: process.env.NODE_ENV || 'development',
};
