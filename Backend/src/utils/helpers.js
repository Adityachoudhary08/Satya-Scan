/**
 * Shared utility functions
 */

/**
 * Resolve the response language from selectedLanguage.
 * The backend must respect the UI language selection, not detect from input.
 */
function resolveLanguage(selectedLanguage) {
  if (!selectedLanguage || selectedLanguage === 'auto') {
    return 'en'; // default to English
  }
  const langMap = {
    en: 'en',
    hi: 'hi',
    english: 'en',
    hindi: 'hi',
  };
  return langMap[selectedLanguage.toLowerCase()] || 'en';
}

/**
 * Parse a JSON string that may be wrapped in markdown code fences.
 */
function parseGeminiJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty response from Gemini');
  }

  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse Gemini response as JSON: ${err.message}\nRaw: ${text.slice(0, 500)}`);
  }
}

/**
 * Calculate processing time from a start timestamp.
 */
function getProcessingTime(startTime) {
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) return `${elapsed}ms`;
  return `${(elapsed / 1000).toFixed(1)}s`;
}

// ─── Trust tier definitions ───────────────────────────────────────────────────

/**
 * TIER 1 — Official fact-check organisations and wire services (weight: 1.0)
 * These carry the highest authority in the evidence pool.
 */
const TIER1_SOURCES = [
  // Fact-check organisations
  'factcheck.org', 'snopes.com', 'politifact.com', 'fullfact.org',
  'altnews.in', 'boomlive.in', 'factly.in', 'vishvasnews.com',
  'logically.ai', 'leadstories.com', 'newschecker.in',
  // International wire services
  'reuters.com', 'apnews.com', 'afp.com',
  // Official government / international bodies
  'pib.gov.in', 'who.int', 'un.org', 'cdc.gov', 'nih.gov',
  'nasa.gov', 'isro.gov.in', 'india.gov.in', 'mha.gov.in',
  'mea.gov.in', 'rbi.org.in', 'sebi.gov.in', 'eci.gov.in',
];

/**
 * TIER 2 — Major established national/international newspapers (weight: 0.75)
 */
const TIER2_SOURCES = [
  'bbc.com', 'bbc.co.uk',
  'theguardian.com', 'nytimes.com', 'washingtonpost.com',
  'economist.com', 'bloomberg.com', 'ft.com', 'cnbc.com',
  'thehindu.com', 'indianexpress.com', 'ndtv.com',
  'hindustantimes.com', 'tribuneindia.com', 'theprint.in',
  'scroll.in', 'thewire.in', 'outlookindia.com',
  'aljazeera.com', 'dw.com', 'france24.com', 'abc.net.au',
  'time.com', 'forbes.com', 'businessinsider.com',
];

/**
 * TIER 3 — Regional newspapers, reputable digital outlets (weight: 0.5)
 */
const TIER3_SOURCES = [
  'indiatoday.in', 'aajtak.in', 'abplive.com', 'news18.com',
  'zeenews.india.com', 'firstpost.com', 'opindia.com',
  'thestatesman.com', 'telegraphindia.com', 'deccanherald.com',
  'livemint.com', 'business-standard.com', 'financialexpress.com',
  'wionews.com', 'thenewsminute.com', 'mathrubhumi.com',
  'theweek.in', 'openthemagazine.com',
];

/**
 * Consolidated TRUSTED_SOURCES array for backward-compat isTrustedSource().
 */
const TRUSTED_SOURCES = [...TIER1_SOURCES, ...TIER2_SOURCES];

/**
 * Return trust tier (1–3) for a URL, or 4 if unrecognised.
 */
function getSourceTier(url) {
  if (!url) return 4;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (TIER1_SOURCES.some((ts) => hostname === ts || hostname.endsWith('.' + ts))) return 1;
    if (TIER2_SOURCES.some((ts) => hostname === ts || hostname.endsWith('.' + ts))) return 2;
    if (TIER3_SOURCES.some((ts) => hostname === ts || hostname.endsWith('.' + ts))) return 3;
    return 4;
  } catch {
    return 4;
  }
}

/**
 * Trust weight by tier (used for score computation).
 */
const TIER_WEIGHTS = { 1: 1.0, 2: 0.75, 3: 0.5, 4: 0.2 };

/**
 * Check if a URL belongs to a tier-1 or tier-2 trusted source.
 */
function isTrustedSource(url) {
  return getSourceTier(url) <= 2;
}

/**
 * Extract domain name from URL for display.
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return 'Unknown';
  }
}

/**
 * Deduplicate array of objects by a key.
 */
function deduplicateByKey(arr, key) {
  const seen = new Set();
  return arr.filter((item) => {
    const val = item[key];
    if (!val || seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

/**
 * Compute source credibility score (0–100) from a sources array.
 * Weights by tier: Tier 1 = full weight, Tier 2 = 0.75, Tier 3 = 0.5, else 0.2.
 * Fact-check results get a 20-point bonus.
 */
function calculateSourceCredibility(sources) {
  if (!sources || sources.length === 0) return 0;

  let weightedSum = 0;
  let maxPossible = 0;

  for (const src of sources) {
    const tier = src.tier || getSourceTier(src.url);
    const weight = TIER_WEIGHTS[tier] || 0.2;
    const factCheckBonus = src.isFactCheck ? 0.2 : 0;
    weightedSum += Math.min(1.0, weight + factCheckBonus);
    maxPossible += 1.0;
  }

  const ratio = maxPossible > 0 ? weightedSum / maxPossible : 0;
  const volumeBonus = Math.min(sources.length * 1.5, 15);
  return Math.round(Math.min(100, ratio * 85 + volumeBonus));
}

/**
 * Shared function to build prompt language instruction.
 */
function buildResponseLanguageInstruction(selectedLanguage) {
  const targetLang = selectedLanguage === 'hi' ? 'Hindi' : 'English';
  return `Generate the ENTIRE response in ${targetLang}.
Do not mix English and Hindi.
If selectedLanguage is 'hi', write fluent natural Hindi.
Do NOT translate publisher names, website names, URLs, official organization names, or proper nouns.
All JSON keys and enum values (such as "verdict", "stance", "politicalBias", "metadataIntegrity") must remain strictly in English as defined in the schema and MUST NOT be translated, but every human-readable value, explanation, reasoning, description, note, summary, recommendation, and finding must be localized into ${targetLang}.`;
}

module.exports = {
  resolveLanguage,
  parseGeminiJSON,
  getProcessingTime,
  TRUSTED_SOURCES,
  TIER1_SOURCES,
  TIER2_SOURCES,
  TIER3_SOURCES,
  isTrustedSource,
  getSourceTier,
  TIER_WEIGHTS,
  extractDomain,
  deduplicateByKey,
  calculateSourceCredibility,
  buildResponseLanguageInstruction,
};
