/**
 * src/services/verifyService.js
 *
 * Calls the SatyaScan backend to verify a piece of selected text.
 *
 * Responsibilities:
 *  - Build the correct request payload for the /api/analyze endpoint
 *  - Handle HTTP-level errors (non-2xx responses)
 *  - Return a normalized result object to the caller
 *
 * Does NOT interact with Chrome APIs — stays pure and testable.
 */

import { ANALYZE_ENDPOINT, MAX_TEXT_LENGTH } from '../lib/config';

/**
 * Verify a piece of user-selected text against the SatyaScan backend.
 *
 * @param {string} text - The highlighted text to verify (max 10,000 chars)
 * @returns {Promise<VerifyResult>} Normalized result object
 * @throws {Error} If the network request fails or the backend returns an error
 */
export async function verifySelectedText(text, responseLanguage = 'en', token = null) {
  if (!text || typeof text !== 'string') {
    throw new Error('No text provided for verification.');
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    throw new Error('Selected text is empty.');
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `Selected text is too long (${trimmed.length} chars). Max allowed: ${MAX_TEXT_LENGTH}.`
    );
  }

  const payload = {
    type: 'text',
    content: trimmed,
    responseLanguage: responseLanguage,
  };

  const requestUrl = ANALYZE_ENDPOINT;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  console.log('[VerifyService] POST /api/analyze');
  console.log('[VerifyService] Fetch URL:', requestUrl);
  console.log('[VerifyService] Request body:', JSON.stringify(payload));
  console.log('[VerifyService] Request headers:', JSON.stringify(headers));

  const startTime = Date.now();
  let response;
  try {
    console.log('[VerifyService] Fetch started...');
    response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    const duration = Date.now() - startTime;
    console.error('[VerifyService] Fetch failed:', networkError);
    console.error('[VerifyService] Response time (failed):', duration + 'ms');
    if (networkError.stack) {
      console.error('[VerifyService] Fetch error stack trace:', networkError.stack);
    }
    console.log('[VerifyService] Thrown exception during fetch:', networkError.message);
    return {
      success: false,
      errorType: 'network',
      message: 'Could not reach SatyaScan servers. Please check your internet connection.',
      evidenceCollected: false,
    };
  }

  const duration = Date.now() - startTime;
  console.log('[VerifyService] Response status:', response.status);
  console.log('[VerifyService] Response time:', duration + 'ms');
  console.log('[VerifyService] HTTP status code:', response.status);

  const rawText = await response.text();
  console.log('[VerifyService] Raw response text length:', rawText.length);

  let data = null;
  try {
    data = JSON.parse(rawText);
    console.log('[VerifyService] JSON parsed successfully');
    console.log('[VerifyService] Parsed JSON:', JSON.stringify(data, null, 2));
  } catch (parseError) {
    console.error('[VerifyService] JSON parse error stack trace:', parseError.stack);
    console.log('[VerifyService] Thrown exception parsing JSON:', parseError.message);
  }

  if (data && data.success === false) {
    console.log('[VerifyService] Response indicates success is false');
    return data;
  }

  if (!response.ok) {
    console.log('[VerifyService] Response status not ok:', response.status);
    return {
      success: false,
      errorType: response.status === 429 ? 'quota' : response.status === 504 ? 'timeout' : 'backend',
      message: data?.message || `Server error (${response.status})`,
      evidenceCollected: data?.evidenceCollected || false
    };
  }

  if (!data) {
    console.log('[VerifyService] No parsed data available');
    return {
      success: false,
      errorType: 'invalid_response',
      message: 'Invalid JSON response from server.',
      evidenceCollected: false
    };
  }

  // Normalize the response into a stable shape the popup always relies on.
  // The backend returns many fields; we extract only what the popup needs.
  console.log('[VerifyService] Normalizing result');
  const normalized = normalizeResult(data, trimmed);
  console.log('[VerifyService] Normalized result:', JSON.stringify(normalized));
  return normalized;
}

/**
 * Map the raw backend response to a clean, stable shape.
 * If the backend schema changes, only this function needs updating.
 *
 * @param {object} data - Raw backend response
 * @param {string} originalText - The text that was verified
 * @returns {VerifyResult}
 */
function normalizeResult(data, originalText) {
  // Pull the first claim's verdict/confidence if claims exist
  const firstClaim = Array.isArray(data.claims) && data.claims.length > 0
    ? data.claims[0]
    : null;

  return {
    ...data,
    /** Top-level verdict string e.g. "Likely False", "Likely True" */
    verdict: data.pageVerdict
      || firstClaim?.verdict
      || data.verdict
      || 'Unverified',

    /** Trust score 0–100 */
    trustScore: typeof data.trustScore === 'number' ? data.trustScore : null,

    /** Confidence 0–1 from the first claim */
    confidence: typeof firstClaim?.confidence === 'number'
      ? firstClaim.confidence
      : null,

    /** Human-readable explanation */
    explanation: firstClaim?.reasoning
      || (Array.isArray(data.aiReasoning) ? data.aiReasoning.join(' ') : data.aiReasoning)
      || 'No explanation available.',

    /** The text that was verified (truncated for display) */
    originalText: originalText,

    /** All raw claims for potential future use */
    claims: data.claims || [],

    /** ISO timestamp */
    verifiedAt: data.verifiedAt || new Date().toISOString(),

    /** Response language from backend */
    responseLanguage: data.responseLanguage || 'en',
  };
}



/**
 * @typedef {object} VerifyResult
 * @property {string}      verdict       - Verdict label
 * @property {number|null} trustScore    - 0–100 trust score
 * @property {number|null} confidence    - 0–1 confidence from first claim
 * @property {string}      explanation   - Human-readable reasoning
 * @property {string}      originalText  - Truncated input text
 * @property {Array}       claims        - All raw claims
 * @property {string}      verifiedAt    - ISO timestamp
 */
