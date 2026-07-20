/**
 * services/pageAnalysisService.js
 *
 * Orchestration pipeline for full-page article analysis.
 */

'use strict';

const logger = require('../config/logger');
const { searchMultiple } = require('./tavilyService');
const { searchFactCheck } = require('./factCheckService');
const geminiService = require('./geminiService');
const { analyzeClaimForSearch } = require('./entityExtractor');
const { buildClaimExtractionPrompt, buildPageVerificationPrompt } = require('../prompts/pageAnalysis');
const {
  resolveLanguage,
  getProcessingTime,
  deduplicateByKey,
  getSourceTier,
} = require('../utils/helpers');

async function extractPageClaim(pageData) {
  const selectedLanguage = pageData.selectedLanguage;
  const responseLanguage = resolveLanguage(selectedLanguage);
  try {
    const prompt = buildClaimExtractionPrompt(pageData, selectedLanguage);
    const result = await geminiService.analyzeText(prompt, selectedLanguage);
    return {
      mainClaim: result.mainClaim || pageData.articleTitle || (responseLanguage === 'hi' ? 'पृष्ठ सामग्री' : 'Page content'),
      secondaryClaims: result.secondaryClaims || [],
      entities: result.entities || [],
      locations: result.locations || [],
      dates: result.dates || [],
    };
  } catch (error) {
    logger.error('Gemini claim extraction failed:', error);
    return geminiService.formatGeminiError(error, false, responseLanguage);
  }
}

/**
 * Verify full article content by fact-checking its primary factual claim.
 *
 * @param {object} pageData - Webpage details + extracted claims
 * @returns {Promise<object>} Structured verification result
 */
async function verifyPageContent(pageData) {
  const startTime = Date.now();
  const { url, pageTitle, articleTitle, mainClaim, secondaryClaims, entities, selectedLanguage } = pageData;
  const responseLanguage = resolveLanguage(selectedLanguage);

  logger.info(`Starting claim-focused page analysis for mainClaim: "${mainClaim || articleTitle}"`, {
    selectedLanguage,
    responseLanguage,
  });

  const targetText = mainClaim || articleTitle || pageTitle || '';

  // ── Step 1: Query generation & Entity extraction ────────────────────────
  const { queries: entityQueries, detectedLanguage } = analyzeClaimForSearch(targetText);
  
  // Create targeted queries utilizing entities to boost search relevance
  const refinedQueries = (entities || [])
    .slice(0, 2)
    .map((ent) => `${targetText} ${ent}`);

  const searchQueries = [...new Set([
    targetText,
    ...entityQueries,
    ...refinedQueries
  ])].filter((q) => q && q.trim().length > 8).slice(0, 3); // limit queries to 3 for speed

  logger.info(`Page analysis search queries (${searchQueries.length}): ${JSON.stringify(searchQueries)}`);

  // ── Step 2: Parallel evidence retrieval ─────────────────────────────────
  const [factCheckResults, tavilyResults] = await Promise.all([
    searchFactCheck(targetText.slice(0, 500)),
    searchMultiple(searchQueries),
  ]);

  // ── Step 3: Merge and rank evidence ──────────────────────────────────────
  const combined = [...factCheckResults, ...tavilyResults];
  const uniqueEvidence = deduplicateByKey(combined, 'url');

  if (uniqueEvidence.length === 0) {
    logger.warn('No evidence found in trusted sources.');
    return {
      success: false,
      errorType: 'no_evidence',
      message: responseLanguage === 'hi'
        ? 'इस दावे के लिए गूगल फैक्ट चेक या विश्वसनीय स्रोतों से कोई सत्यापन साक्ष्य प्राप्त नहीं किया जा सका।'
        : 'No verification evidence could be retrieved from Google Fact Check or trusted sources for this claim.',
      evidenceCollected: false,
      statusCode: 200
    };
  }

  uniqueEvidence.sort((a, b) => {
    if (a.isFactCheck && !b.isFactCheck) return -1;
    if (!a.isFactCheck && b.isFactCheck) return 1;
    const tierA = a.tier || getSourceTier(a.url);
    const tierB = b.tier || getSourceTier(b.url);
    if (tierA !== tierB) return tierA - tierB;
    return (b.score || 0) - (a.score || 0);
  });
  const evidenceForPrompt = uniqueEvidence.slice(0, 8); // limit evidence to 8 for speed

  // ── Step 4: Call Gemini Reasoning ─────────────────────────────────────────
  const prompt = buildPageVerificationPrompt(pageData, evidenceForPrompt, responseLanguage);
  
  let geminiResult = null;
  try {
    geminiResult = await geminiService.analyzeText(prompt, selectedLanguage);
  } catch (err) {
    logger.error('Gemini page analysis failed:', err);
    return geminiService.formatGeminiError(err, evidenceForPrompt.length > 0, responseLanguage);
  }

  // ── Step 5: Normalize and build result ────────────────────────────────────
  const claims = buildPageClaims(geminiResult, evidenceForPrompt, responseLanguage);
  const trustScore = geminiResult.trustScore || 50;

  return {
    inputType: 'page',
    trustScore,
    verdict: geminiResult.verdict || (responseLanguage === 'hi' ? 'अपुष्ट' : 'Unverified'),
    summary: geminiResult.summary || '',
    politicalBias: geminiResult.politicalBias || (responseLanguage === 'hi' ? 'लागू नहीं' : 'Not Applicable'),
    claims,
    suspiciousStatements: geminiResult.suspiciousStatements || [],
    missingContext: geminiResult.missingContext || [],
    recommendation: geminiResult.recommendation || '',
    language: responseLanguage,
    detectedLanguage: detectedLanguage || responseLanguage,
    responseLanguage,
    processingTime: getProcessingTime(startTime),
    mainClaim: mainClaim || targetText,
    secondaryClaims: secondaryClaims || [],
    entities: entities || [],
    locations: pageData.locations || [],
    dates: pageData.dates || [],
  };
}


function buildPageClaims(geminiResult, evidenceSources, responseLanguage) {
  const rawClaims = geminiResult.claims || [];
  return rawClaims.map((claim) => {
    const supportingIndices = claim.supportingSources || [];
    const contradictingIndices = claim.contradictingSources || [];
    const _allIndices = [...new Set([...supportingIndices, ...contradictingIndices])];

    let claimSources = _allIndices
      .filter((i) => i >= 0 && i < evidenceSources.length)
      .map((i) => ({
        url: evidenceSources[i].url,
        title: evidenceSources[i].title || (responseLanguage === 'hi' ? 'बिना शीर्षक' : 'Untitled'),
        source: evidenceSources[i].source || (responseLanguage === 'hi' ? 'अज्ञात प्रकाशक' : 'Unknown Publisher'),
        trusted: evidenceSources[i].trusted,
      }));

    if (claimSources.length === 0) {
      claimSources = evidenceSources.slice(0, 2).map((s) => ({
        url: s.url,
        title: s.title || (responseLanguage === 'hi' ? 'बिना शीर्षक' : 'Untitled'),
        source: s.source || (responseLanguage === 'hi' ? 'अज्ञात प्रकाशक' : 'Unknown Publisher'),
        trusted: s.trusted,
      }));
    }

    return {
      text: claim.text,
      verdict: claim.verdict || (responseLanguage === 'hi' ? 'अपुष्ट' : 'Unverified'),
      confidence: claim.confidence || 0,
      reasoning: claim.reasoning || '',
      sources: claimSources,
    };
  });
}

module.exports = { verifyPageContent, extractPageClaim };
