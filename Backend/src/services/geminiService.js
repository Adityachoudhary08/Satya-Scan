const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY, GEMINI_API_KEY_2 } = require('../config/env');
const logger = require('../config/logger');
const { parseGeminiJSON, resolveLanguage } = require('../utils/helpers');

// Use stable model identifiers.
const PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

const apiKeys = [GEMINI_API_KEY, GEMINI_API_KEY_2].filter((k) => k && k.trim());
logger.info('Gemini model and key configuration loaded', {
  primaryModel: PRIMARY_MODEL,
  fallbackModel: FALLBACK_MODEL,
  totalApiKeysConfigured: apiKeys.length,
});

class GeminiProviderError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'GeminiProviderError';
    this.cause = cause;
    this.statusCode = 503;
    this.provider = 'gemini';
    this.retryable = isRetryableGeminiError(cause);
    this.serviceBlocked = isServiceBlockedError(cause);
  }
}
function getErrorMessage(error) {
  return error?.message || String(error);
}

function isServiceBlockedError(error) {
  const message = getErrorMessage(error);
  return (
    message.includes('API_KEY_SERVICE_BLOCKED') ||
    message.includes('Requests to this API') ||
    message.includes('403 Forbidden') ||
    message.includes('429') ||
    message.includes('quota')
  );
}

function isRetryableGeminiError(error) {
  const message = getErrorMessage(error);
  return (
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    /timeout|ECONNRESET|ETIMEDOUT/i.test(message)
  );
}

async function withRetry(operation, label, maxAttempts = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (isServiceBlockedError(error) || !isRetryableGeminiError(error) || attempt === maxAttempts) {
        break;
      }

      const delayMs = 400 * attempt;
      logger.warn(`${label} failed; retrying`, {
        attempt,
        delayMs,
        error: getErrorMessage(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new GeminiProviderError(`${label} unavailable`, lastError);
}

function getGeminiConfigurationIssue() {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.trim()) return 'GEMINI_API_KEY is missing.';
  return null;
}

async function validateGeminiConfiguration() {
  const issue = getGeminiConfigurationIssue();
  if (issue) {
    logger.error('[GEMINI] startup validation failed', { issue });
    return { valid: false, issue };
  }
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`);
    if (!response.ok) {
      const detail = await response.text();
      const issue = response.status === 401 ? 'Gemini rejected the credential.' : `Gemini model discovery failed (${response.status}).`;
      logger.error('[GEMINI] startup validation failed', { issue, status: response.status, detail: detail.slice(0, 300) });
      return { valid: false, issue };
    }
    const payload = await response.json();
    const available = new Set((payload.models || []).map(item => String(item.name || '').replace(/^models\//, '')));
    const primaryAvailable = available.has(PRIMARY_MODEL);
    const fallbackAvailable = available.has(FALLBACK_MODEL);
    logger.info('[GEMINI] startup model availability checked', { primaryModel: PRIMARY_MODEL, primaryAvailable, fallbackModel: FALLBACK_MODEL, fallbackAvailable });
    return { valid: primaryAvailable || fallbackAvailable, primaryAvailable, fallbackAvailable };
  } catch (error) {
    logger.warn('[GEMINI] startup model discovery unavailable; runtime fallback remains enabled', { message: error.message });
    return { valid: false, issue: 'Could not reach Gemini model discovery endpoint.' };
  }
}

async function generateWithModelFallback(parts, label, generationConfig) {
  const models = [...new Set([PRIMARY_MODEL, FALLBACK_MODEL])];
  const keysToTry = apiKeys.length > 0 ? apiKeys : [GEMINI_API_KEY];
  let lastError;

  for (let keyIdx = 0; keyIdx < keysToTry.length; keyIdx += 1) {
    const apiKey = keysToTry[keyIdx];
    const keyLabel = keyIdx === 0 ? 'Primary Key' : `Fallback Key #${keyIdx + 1}`;
    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
        const result = await withRetry(() => model.generateContent(parts), `${label} (${modelName} via ${keyLabel})`);
        return { result, modelName };
      } catch (error) {
        lastError = error;
        logger.warn(`Gemini model ${modelName} failed on ${keyLabel}; trying fallback`, { label, modelName, keyLabel, reason: getErrorMessage(error) });
      }
    }
    if (keyIdx < keysToTry.length - 1) {
      logger.warn(`Switching to backup Gemini API key: ${keyLabel} -> Fallback Key #${keyIdx + 2}`);
    }
  }

  throw new GeminiProviderError(`${label} unavailable across configured models and API keys`, lastError);
}

function hasDevanagari(str) {
  return /[\u0900-\u097F]/.test(str);
}

function detectOutputLanguage(obj) {
  if (!obj) return 'en';
  if (typeof obj === 'string') {
    return hasDevanagari(obj) ? 'hi' : 'en';
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (detectOutputLanguage(item) === 'hi') {
        return 'hi';
      }
    }
  } else if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (['url', 'publishedAt', 'date', 'index', 'confidence', 'trustScore', 'aiProbability', 'deepfakeProbability', 'manipulationProbability'].includes(key)) {
        continue;
      }
      if (detectOutputLanguage(obj[key]) === 'hi') {
        return 'hi';
      }
    }
  }
  return 'en';
}

async function analyzeText(prompt, selectedLanguage) {
  const responseLanguage = resolveLanguage(selectedLanguage);
  logger.info('Gemini language request', {
    selectedLanguage,
    promptLanguage: responseLanguage
  });
  logger.info('Sending text analysis request to Gemini');
  logger.debug('Prompt length:', prompt.length);

  const generationConfig = {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
  };

  try {
    const { result } = await generateWithModelFallback(prompt, 'Gemini text analysis', generationConfig);
    const response = result.response;
    const text = response.text();

    logger.info('Gemini text analysis response received');
    logger.debug('Response length:', text.length);

    const parsed = parseGeminiJSON(text);
    const detectedOutputLanguage = detectOutputLanguage(parsed);

    logger.info('Gemini language response', {
      selectedLanguage,
      detectedOutputLanguage
    });
    if (responseLanguage === 'hi' && detectedOutputLanguage !== 'hi') {
      logger.warn('Gemini returned non-Hindi output for Hindi request');
    }

    return parsed;
  } catch (error) {
    console.log("========== GEMINI ERROR ==========");
    console.dir(error, { depth: null });
    console.log("==================================");

    logger.error("Gemini text analysis failed:", getErrorMessage(error));

    throw error instanceof GeminiProviderError
      ? error
      : new GeminiProviderError("Gemini text analysis unavailable", error);
  }
}

async function analyzeImage(imageBuffer, mimeType, prompt, selectedLanguage) {
  const responseLanguage = resolveLanguage(selectedLanguage);
  logger.info('Gemini language request', {
    selectedLanguage,
    promptLanguage: responseLanguage
  });
  logger.info('Sending image analysis request to Gemini Vision');

  const generationConfig = {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
  };

  try {
    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType || 'image/jpeg',
      },
    };

    const { result, modelName } = await generateWithModelFallback([prompt, imagePart], 'Gemini image analysis', generationConfig);
    const response = result.response;
    const text = response.text();

    logger.info('Gemini image analysis response received');
    logger.debug('Response length:', text.length);

    const parsed = parseGeminiJSON(text);
    const detectedOutputLanguage = detectOutputLanguage(parsed);

    logger.info('Gemini language response', {
      selectedLanguage,
      detectedOutputLanguage
    });
    if (responseLanguage === 'hi' && detectedOutputLanguage !== 'hi') {
      logger.warn('Gemini returned non-Hindi output for Hindi request');
    }

    return { ...parsed, _model: modelName };
  } catch (error) {
    console.error("========== GEMINI IMAGE ANALYSIS ERROR ==========");
    console.error(error);
    console.error("================================================");
    logger.error('Gemini image analysis failed:', getErrorMessage(error));
    throw error instanceof GeminiProviderError
      ? error
      : new GeminiProviderError('Gemini image analysis unavailable', error);
  }
}

async function generateSearchQueries(prompt) {
  logger.info('Generating search queries via Gemini');

  const generationConfig = {
      temperature: 0.7,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
  };

  try {
    const { result } = await generateWithModelFallback(prompt, 'Gemini query generation', generationConfig);
    const text = result.response.text();
    const queries = parseGeminiJSON(text);

    if (!Array.isArray(queries)) {
      logger.warn('Gemini returned non-array for queries, wrapping');
      return [queries.toString()];
    }

    logger.info(`Generated ${queries.length} search queries`);
    return queries;
  } catch (error) {
    logger.warn('Failed to generate search queries:', getErrorMessage(error));
    return [];
  }
}

function formatGeminiError(error, evidenceCollected = false, responseLanguage = 'en') {
  const isHi = responseLanguage === 'hi';
  const message = (error?.message || String(error)).toLowerCase();
  const cause = error?.cause ? String(error.cause).toLowerCase() : '';
  const combined = `${message} ${cause}`;

  let errorType = 'unavailable';
  let userMessage = isHi ? 'जेमिनी सेवा अस्थायी रूप से अनुपलब्ध है।' : 'Gemini is temporarily unavailable.';
  let statusCode = 503;

  if (combined.includes('404') || combined.includes('not found') || combined.includes('no longer available')) {
    errorType = 'model_unavailable';
    userMessage = isHi ? 'चयनित एआई मॉडल अनुपलब्ध है।' : 'Selected AI model is unavailable or not found.';
    statusCode = 404;
  } else if (combined.includes('429') || combined.includes('quota') || combined.includes('limit')) {
    errorType = 'quota';
    userMessage = isHi ? 'जेमिनी एपीआई कोटा समाप्त हो गया है।' : 'Gemini API quota exceeded.';
    statusCode = 429;
  } else if (/timeout|etimedout/i.test(combined)) {
    errorType = 'timeout';
    userMessage = isHi ? 'एआई सत्यापन सेवा का समय समाप्त हो गया।' : 'AI verification service timed out.';
    statusCode = 504;
  } else if (/econnreset|econnrefused|fetch failed|failed to fetch/i.test(combined)) {
    errorType = 'network';
    userMessage = isHi ? 'जेमिनी के साथ नेटवर्क कनेक्शन की समस्या।' : 'Network connection issue with Gemini.';
    statusCode = 503;
  } else if (combined.includes('json') || combined.includes('parse') || combined.includes('invalid response')) {
    errorType = 'invalid_response';
    userMessage = isHi ? 'जेमिनी से अमान्य प्रतिक्रिया प्रारूप।' : 'Invalid response format from Gemini.';
    statusCode = 502;
  }

  return {
    success: false,
    errorType,
    message: userMessage,
    evidenceCollected: !!evidenceCollected,
    statusCode
  };
}

module.exports = {
  analyzeText,
  analyzeImage,
  generateSearchQueries,
  GeminiProviderError,
  formatGeminiError,
  validateGeminiConfiguration,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
};
