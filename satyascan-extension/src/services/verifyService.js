/**
 * src/services/verifyService.js
 *
 * Calls the SatyaScan backend to verify text, URLs, or images.
 *
 * Responsibilities:
 *  - Build the correct request payload for /api/analyze
 *  - Handle HTTP-level errors (non-2xx responses) and timeouts
 *  - Return normalized result objects to the caller
 */

import { ANALYZE_ENDPOINT, MAX_TEXT_LENGTH } from '../lib/config';

/**
 * Get active tab URL and title safely in Chrome extension.
 */
export async function getActiveTabUrl() {
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        return {
          url: tabs[0].url || '',
          title: tabs[0].title || ''
        };
      }
    } catch (err) {
      console.warn('[VerifyService] Could not query active tab:', err);
    }
  }
  return { url: '', title: '' };
}

/**
 * Verify a piece of user-selected or typed text against the SatyaScan backend.
 *
 * @param {string} text - The text to verify (max 10,000 chars)
 * @returns {Promise<object>} Normalized result object
 */
export async function verifySelectedText(text, responseLanguage = 'en', token = null) {
  if (!text || typeof text !== 'string') {
    return {
      success: false,
      errorType: 'default',
      statusCode: 400,
      message: responseLanguage === 'hi' ? 'सत्यापन के लिए कोई टेक्स्ट नहीं दिया गया।' : 'No text provided for verification.',
      devDetails: 'Validation error: Empty or invalid text string'
    };
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return {
      success: false,
      errorType: 'default',
      statusCode: 400,
      message: responseLanguage === 'hi' ? 'चयनित टेक्स्ट खाली है।' : 'Selected text is empty.',
      devDetails: 'Validation error: Text is whitespace only'
    };
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return {
      success: false,
      errorType: 'default',
      statusCode: 400,
      message: responseLanguage === 'hi'
        ? `चयनित टेक्स्ट बहुत लंबा है (${trimmed.length} वर्ण)। अधिकतम: ${MAX_TEXT_LENGTH}।`
        : `Selected text is too long (${trimmed.length} chars). Max allowed: ${MAX_TEXT_LENGTH}.`,
      devDetails: `Validation error: Text length ${trimmed.length} > ${MAX_TEXT_LENGTH}`
    };
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 25000);

  let response;
  let rawText = '';
  let data = null;

  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (networkError) {
    const isTimeout = networkError.name === 'AbortError';
    return {
      success: false,
      errorType: isTimeout ? '504' : 'network',
      statusCode: isTimeout ? 504 : 0,
      message: isTimeout
        ? (responseLanguage === 'hi' ? 'सत्यापन अनुरोध पूरा होने में बहुत अधिक समय लगा।' : 'The verification request took too long to complete.')
        : (responseLanguage === 'hi' ? 'सत्यास्कैन सर्वर तक पहुँचने में असमर्थ। कृपया अपना इंटरनेट कनेक्शन जाँचें।' : 'Unable to reach the SatyaScan servers. Please check your internet connection.'),
      evidenceCollected: false,
      devDetails: isTimeout ? 'Request timed out after 25,000ms' : (networkError.message || 'Fetch network failure')
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const status = response.status;
  try {
    rawText = await response.text();
    if (rawText) {
      data = JSON.parse(rawText);
    }
  } catch (parseError) {
    console.warn('[VerifyService] Response parse warning:', parseError.message);
  }

  if (!response.ok || (data && data.success === false)) {
    const errorType = String(status || data?.errorType || 'default');
    const devDetails = data?.message || data?.error || rawText.slice(0, 300) || `HTTP ${status} ${response.statusText}`;

    let message = data?.message;
    if (!message) {
      if (status === 503) {
        message = responseLanguage === 'hi'
          ? 'एआई सेवा पर इस समय अत्यधिक ट्रैफ़िक है। कृपया कुछ क्षणों बाद पुनः प्रयास करें।'
          : 'The AI service is currently experiencing high demand. Please try again in a few moments.';
      } else if (status === 403) {
        message = responseLanguage === 'hi'
          ? 'एआई कुंजी अमान्य या अनुपलब्ध होने के कारण अनुरोध अस्वीकृत कर दिया गया।'
          : 'The AI service rejected the request because the API key is invalid or unavailable.';
      } else if (status === 401) {
        message = responseLanguage === 'hi'
          ? 'प्रमाणीकरण समाप्त या अमान्य है। कृपया पुनः साइन इन करें।'
          : 'Authentication expired or invalid. Please sign in again.';
      } else if (status === 429) {
        message = responseLanguage === 'hi'
          ? 'अत्यधिक अनुरोध। कृपया पुनः प्रयास करने से पहले कुछ क्षण प्रतीक्षा करें।'
          : 'Too many requests. Please wait a moment before trying again.';
      } else if (status === 504) {
        message = responseLanguage === 'hi'
          ? 'सत्यापन अनुरोध पूरा होने में बहुत अधिक समय लगा।'
          : 'The verification request took too long to complete.';
      } else if (status >= 500) {
        message = responseLanguage === 'hi'
          ? 'अनुरोध संसाधित करते समय सर्वर में आंतरिक त्रुटि हुई।'
          : 'The server encountered an internal error while processing the request.';
      } else {
        message = responseLanguage === 'hi'
          ? 'इस दावे की पुष्टि करते समय कुछ अप्रत्याशित त्रुटि हुई।'
          : 'Something unexpected happened while verifying this claim.';
      }
    }

    return {
      success: false,
      errorType,
      statusCode: status || 500,
      message,
      evidenceCollected: data?.evidenceCollected || false,
      devDetails
    };
  }

  if (!data) {
    return {
      success: false,
      errorType: '502',
      statusCode: 502,
      message: responseLanguage === 'hi'
        ? 'सर्वर से अमान्य प्रतिक्रिया प्राप्त हुई।'
        : 'Received an invalid response from the upstream server.',
      evidenceCollected: false,
      devDetails: 'Invalid JSON payload returned by backend'
    };
  }

  return normalizeResult(data, trimmed);
}

/**
 * Verify a URL against the SatyaScan backend.
 */
export async function verifyUrl(url, responseLanguage = 'en', token = null) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return {
      success: false,
      errorType: 'default',
      statusCode: 400,
      message: responseLanguage === 'hi' ? 'सत्यापन के लिए कोई URL नहीं दिया गया।' : 'No URL provided for verification.',
      devDetails: 'Validation error: Empty URL'
    };
  }

  const trimmed = url.trim();
  const payload = {
    type: 'url',
    content: trimmed,
    responseLanguage: responseLanguage,
  };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(ANALYZE_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || (data && data.success === false)) {
      return {
        success: false,
        errorType: String(response.status || 'default'),
        statusCode: response.status || 500,
        message: data?.message || (responseLanguage === 'hi' ? 'URL का विश्लेषण करने में विफल।' : 'Failed to analyze URL content.'),
        devDetails: data?.error || `HTTP ${response.status}`
      };
    }

    return {
      ...normalizeResult(data, trimmed),
      inputType: 'url',
      url: trimmed
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      errorType: isTimeout ? '504' : 'network',
      statusCode: isTimeout ? 504 : 0,
      message: isTimeout
        ? (responseLanguage === 'hi' ? 'URL विश्लेषण में अधिक समय लगा।' : 'URL analysis timed out.')
        : (responseLanguage === 'hi' ? 'नेटवर्क त्रुटि हुई।' : 'Network connection error.'),
      devDetails: err.message
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verify an image against the SatyaScan backend (OCR + Gemini Vision Analysis).
 */
export async function verifyImage(imageFile, responseLanguage = 'en', token = null) {
  if (!imageFile) {
    return {
      success: false,
      errorType: 'default',
      statusCode: 400,
      message: responseLanguage === 'hi' ? 'कोई छवि फ़ाइल प्रदान नहीं की गई।' : 'No image file provided.',
      devDetails: 'Validation error: Missing image file'
    };
  }

  const formData = new FormData();
  formData.append('type', 'image');
  formData.append('file', imageFile);
  formData.append('selectedLanguage', responseLanguage);
  formData.append('responseLanguage', responseLanguage);

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(ANALYZE_ENDPOINT, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success === false) {
      return {
        success: false,
        errorType: String(response.status || 'default'),
        statusCode: response.status || 500,
        message: data?.message || (responseLanguage === 'hi' ? 'छवि का विश्लेषण करने में विफल।' : 'Image analysis failed.'),
        devDetails: data?.error || `HTTP ${response.status}`
      };
    }

    return {
      ...normalizeResult(data, imageFile.name || 'Uploaded image'),
      inputType: 'image',
      originalFileName: imageFile.name
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      errorType: isTimeout ? '504' : 'network',
      statusCode: isTimeout ? 504 : 0,
      message: isTimeout
        ? (responseLanguage === 'hi' ? 'छवि विश्लेषण का समय समाप्त हो गया।' : 'Image analysis timed out.')
        : (responseLanguage === 'hi' ? 'नेटवर्क त्रुटि हुई।' : 'Network connection error during image analysis.'),
      devDetails: err.message
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Map the raw backend response to a clean, stable shape.
 */
function normalizeResult(data, originalText) {
  const firstClaim = Array.isArray(data.claims) && data.claims.length > 0
    ? data.claims[0]
    : null;

  return {
    ...data,
    verdict: data.pageVerdict
      || firstClaim?.verdict
      || data.verdict
      || 'Unverified',
    trustScore: typeof data.trustScore === 'number' ? data.trustScore : null,
    confidence: typeof firstClaim?.confidence === 'number'
      ? firstClaim.confidence
      : null,
    explanation: firstClaim?.reasoning
      || (Array.isArray(data.aiReasoning) ? data.aiReasoning.join(' ') : data.aiReasoning)
      || 'No explanation available.',
    originalText: originalText,
    claims: data.claims || [],
    verifiedAt: data.verifiedAt || new Date().toISOString(),
    responseLanguage: data.responseLanguage || 'en',
  };
}
