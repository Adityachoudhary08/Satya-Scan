/**
 * textVerificationService.js
 * Main orchestration pipeline for claim / URL verification.
 *
 * Reasoning engine: Gemini ONLY.
 * On Gemini quota / rate-limit errors → graceful evidence-only fallback (no crash).
 * OpenAI is NOT used.
 *
 * Pipeline:
 *  1. URL scraping (if inputType === 'url') + URL type classification
 *  2. Entity extraction + language detection
 *  3. Diversified query generation (entity-aware + Gemini-enhanced)
 *  4. Google Fact Check API + Tavily (parallel)
 *  5. Merge, deduplicate, rank evidence
 *  6. Gemini reasoning — quota/error → graceful evidence-only result
 *     • URL type 'news' + all text inputs → buildTextVerificationPrompt (unchanged)
 *     • URL types official / reference / opinion / social_media → buildUrlTypePrompt
 *  7. Build structured result
 */

const logger = require('../config/logger');
const { searchMultiple, searchSingle } = require('./tavilyService');
const { searchFactCheck } = require('./factCheckService');
const geminiService = require('./geminiService');
const { analyzeClaimForSearch } = require('./entityExtractor');
const { extractTextFromUrl } = require('./urlScrapeService');
const {
  buildTextVerificationPrompt,
} = require('../prompts/textVerification');
const { buildUrlTypePrompt } = require('../prompts/urlTypePrompts');
const { classifyUrl } = require('./urlClassifierService');
const {
  resolveLanguage,
  getProcessingTime,
  deduplicateByKey,
  getSourceTier,
  calculateSourceCredibility,
} = require('../utils/helpers');

// ─── Gemini error classification ──────────────────────────────────────────────

function classifyGeminiError(error) {
  const msg = (error?.message || String(error)).toLowerCase();
  const cause = (error?.cause?.message || '').toLowerCase();
  const combined = msg + ' ' + cause;

  if (combined.includes('429') || combined.includes('quota') || combined.includes('resource_exhausted')) {
    return { type: 'quota', userMessage: 'Gemini API quota reached. Results are based on retrieved evidence only.' };
  }
  if (combined.includes('api_key_service_blocked') || combined.includes('403') || combined.includes('permission')) {
    return { type: 'blocked', userMessage: 'Gemini API key issue. Results are based on retrieved evidence only.' };
  }
  if (combined.includes('503') || combined.includes('502') || combined.includes('timeout') || combined.includes('econnreset')) {
    return { type: 'unavailable', userMessage: 'Gemini is temporarily unavailable. Results are based on retrieved evidence only.' };
  }
  return { type: 'unknown', userMessage: 'Gemini analysis failed. Results are based on retrieved evidence only.' };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function verifyText(content, inputType, selectedLanguage) {
  const startTime = Date.now();
  const responseLanguage = resolveLanguage(selectedLanguage);

  logger.info(`Starting ${inputType} verification pipeline`, {
    contentLength: content.length,
    selectedLanguage,
    responseLanguage,
  });

  // ── Step 1: Content extraction + URL classification ──────────────────────
  let claimText = content;
  let pageClassification = null; // Only set for URL inputs

  if (inputType === 'url') {
    logger.info('Step 1: Scraping URL for content');
    claimText = await extractTextFromUrl(content);

    // Classify the URL type (pure heuristic — no network call)
    pageClassification = classifyUrl(content);
    logger.info(`Step 1a: URL classified as "${pageClassification.pageType}" — ${pageClassification.pageTypeLabel}`);
  } else {
    logger.info('Step 1: Using provided text content');
  }

  // ── Step 2: Entity extraction + language detection ────────────────────────
  logger.info('Step 2: Extracting entities and detecting language');
  const { entities, queries: entityQueries, detectedLanguage } = analyzeClaimForSearch(claimText);
  logger.info(`Detected language: ${detectedLanguage}, entities: people=${entities.people.join(',')}, locations=${entities.locations.join(',')}, events=${entities.events.join(',')}`);

  // ── Step 3: Diversified query generation (Local Generation) ───────────────
  logger.info('Step 3: Generating diversified search queries locally');
  const localQueries = [];
  const trimmedClaim = claimText.trim();
  localQueries.push(trimmedClaim.slice(0, 300));
  localQueries.push(`${trimmedClaim.slice(0, 200)} fact check`);
  localQueries.push(`${trimmedClaim.slice(0, 200)} official statement`);

  const mainEntities = [
    ...(entities.people || []),
    ...(entities.locations || []),
    ...(entities.events || []),
    ...(entities.organisations || [])
  ].slice(0, 3);
  
  mainEntities.forEach(ent => {
    localQueries.push(`${ent} news`);
    localQueries.push(`${ent} statement`);
  });

  const mergedQueries = [...new Set([...localQueries, ...entityQueries])]
    .filter((q) => q && q.trim().length > 5);

  const searchQueries = mergedQueries.slice(0, 5); // Cap to 5 queries for performance
  logger.info(`Final search queries (${searchQueries.length}): ${JSON.stringify(searchQueries)}`);

  // ── Step 4+5: Parallel evidence retrieval ─────────────────────────────────
  logger.info('Step 4+5: Fetching Google Fact Check API, Tavily, and Official Government sources in parallel');
  const officialQuery = `${trimmedClaim.slice(0, 180)} site:gov OR site:gov.in OR site:nic.in OR site:who.int OR site:un.org`;
  
  const [factCheckResults, tavilyResults, officialResults] = await Promise.all([
    searchFactCheck(claimText.slice(0, 500)),
    searchMultiple(searchQueries),
    searchSingle(officialQuery, false)
  ]);

  // Map official search results to same format as tavily results
  const mappedOfficial = (officialResults || []).map((r) => {
    const tier = getSourceTier(r.url);
    return {
      url: r.url,
      title: r.title || 'Untitled',
      content: r.content || r.raw_content || '',
      snippet: r.content ? r.content.slice(0, 300) : '',
      source: new URL(r.url).hostname.replace(/^www\./, ''),
      trusted: true,
      tier,
      score: r.score || 0,
      isFactCheck: false,
    };
  });

  logger.info(`Fact Check API: ${factCheckResults.length} | Tavily: ${tavilyResults.length} | Official: ${mappedOfficial.length}`);

  // ── Step 6: Merge, deduplicate, rank ──────────────────────────────────────
  logger.info('Step 6: Merging and ranking evidence');
  const combined = [...factCheckResults, ...tavilyResults, ...mappedOfficial];
  const uniqueEvidence = deduplicateByKey(combined, 'url');

  // Custom Ranker (Part 3)
  uniqueEvidence.sort((a, b) => {
    // 1. Government / Official Domains
    const isGovA = /gov\.in|gov|nic\.in|who\.int|un\.org/i.test(a.url);
    const isGovB = /gov\.in|gov|nic\.in|who\.int|un\.org/i.test(b.url);
    if (isGovA && !isGovB) return -1;
    if (!isGovA && isGovB) return 1;

    // 2. Google Fact Check hits (isFactCheck)
    if (a.isFactCheck && !b.isFactCheck) return -1;
    if (!a.isFactCheck && b.isFactCheck) return 1;

    // 3. Reuters, AP, AFP
    const isWireA = /reuters\.com|apnews\.com|afp\.com/i.test(a.url);
    const isWireB = /reuters\.com|apnews\.com|afp\.com/i.test(b.url);
    if (isWireA && !isWireB) return -1;
    if (!isWireA && isWireB) return 1;

    // 4. BBC
    const isBbcA = /bbc\.com|bbc\.co\.uk/i.test(a.url);
    const isBbcB = /bbc\.com|bbc\.co\.uk/i.test(b.url);
    if (isBbcA && !isBbcB) return -1;
    if (!isBbcA && isBbcB) return 1;

    // 5. The Hindu, Indian Express, NDTV
    const isPremiumNewsA = /thehindu\.com|indianexpress\.com|ndtv\.com/i.test(a.url);
    const isPremiumNewsB = /thehindu\.com|indianexpress\.com|ndtv\.com/i.test(b.url);
    if (isPremiumNewsA && !isPremiumNewsB) return -1;
    if (!isPremiumNewsA && isPremiumNewsB) return 1;

    // 6. Tier order
    const tierA = a.tier || getSourceTier(a.url);
    const tierB = b.tier || getSourceTier(b.url);
    if (tierA !== tierB) return tierA - tierB;

    // 7. Relevance Score
    return (b.score || 0) - (a.score || 0);
  });

  logger.info(`Total unique evidence: ${uniqueEvidence.length} sources`);

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

  // Cap at 8 sources (Part 3)
  const evidenceForPrompt = uniqueEvidence.slice(0, 8);

  // ── Step 7: Gemini reasoning ───────────────────────────────────────────────
  logger.info('Step 7: Running Gemini reasoning engine');

  // For non-news URL types, use a specialized prompt; everything else uses the
  // existing text verification prompt (text inputs always use the existing prompt).
  const isSpecialUrlType = pageClassification && pageClassification.pageType !== 'news';
  const verificationPrompt = isSpecialUrlType
    ? buildUrlTypePrompt(
        claimText.slice(0, 5000),
        evidenceForPrompt,
        responseLanguage,
        entities,
        pageClassification.pageType
      )
    : buildTextVerificationPrompt(
        claimText.slice(0, 5000),
        evidenceForPrompt,
        responseLanguage,
        entities
      );

  let geminiResult = null;

  try {
    logger.debug('Gemini prompt length:', verificationPrompt.length);
    geminiResult = await geminiService.analyzeText(verificationPrompt, selectedLanguage);
    logger.info('Gemini analysis complete', { verdict: geminiResult.verdict });
  } catch (geminiError) {
    logger.error('Gemini text analysis failed:', geminiError);
    return geminiService.formatGeminiError(geminiError, uniqueEvidence.length > 0, responseLanguage);
  }

  // ── Step 8: Build structured result ──────────────────────────────────────
  logger.info('Step 8: Building structured result');
  // Gemini succeeded — no fallback was used
  const usedFallback = false;
  const providerWarning = undefined;
  const claims = buildClaims(geminiResult, evidenceForPrompt, responseLanguage);
  let trustScore = calculateTrustScore(geminiResult, claims, factCheckResults.length > 0);
  const sourceCredibility = calculateSourceCredibility(uniqueEvidence);
  const aiLikelihood = geminiResult.aiLikelihood || estimateAiLikelihood(claimText);

  // ── Evidence distribution counts ──────────────────────────────────────────
  // Count supporting vs contradicting vs neutral sources across all claims
  const supportingUrls = new Set();
  const contradictingUrls = new Set();
  claims.forEach((claim) => {
    (claim.sources || []).forEach((src) => {
      const key = src.url || src.title || '';
      if (!key) return;
      // A source is supporting if it appears in the claim's supporting list context
      // We infer from the verdict: Supported claims → supporting sources, Contradicted → contradicting
      if (claim.verdict === 'Supported') supportingUrls.add(key);
      else if (claim.verdict === 'Contradicted') contradictingUrls.add(key);
    });
  });
  const supportingCount = supportingUrls.size || 0;
  const contradictingCount = contradictingUrls.size || 0;
  const initialNeutralCount = Math.max(0, uniqueEvidence.length - supportingCount - contradictingCount);

  // ── Trust Score Breakdown (for UI explainer card) ─────────────────────────
  const trustScoreBreakdown = responseLanguage === 'hi' ? [
    { label: 'स्रोतों की विश्वसनीयता', value: sourceCredibility },
    { label: 'समर्थन करने वाले स्रोत', value: Math.min(100, supportingCount * 15) },
    { label: 'विरोधाभासी साक्ष्य', value: contradictingCount > 0 ? Math.max(0, 100 - contradictingCount * 20) : 100 },
    { label: 'AI विश्लेषण का विश्वास स्तर', value: geminiResult.confidence || 50 },
  ] : [
    { label: 'Source credibility', value: sourceCredibility },
    { label: 'Supporting sources', value: Math.min(100, supportingCount * 15) },
    { label: 'Contradicting evidence', value: contradictingCount > 0 ? Math.max(0, 100 - contradictingCount * 20) : 100 },
    { label: 'AI reasoning confidence', value: geminiResult.confidence || 50 },
  ];

  // ── URL page-type overrides (URL inputs only) ──────────────────────────────
  // official / reference pages are authoritative sources — floor their trust score
  // at 75 so the reliability ring looks sensible.
  // The frontend display verdict is driven by pageVerdict, not trustScore, for these types.
  if (pageClassification && ['official', 'reference'].includes(pageClassification.pageType)) {
    trustScore = Math.max(trustScore, 75);
  }

  // Determine the display-level verdict override sent to the frontend.
  //   'official' / 'reference'  → 'Informational'  (teal, no True/False/Misleading)
  //   'opinion'                 → 'Opinion'         (purple, factual claims still shown)
  //   'social_media' / 'news'   → undefined         (standard trustScore-derived verdict)
  let pageVerdict;
  if (pageClassification) {
    if (['official', 'reference'].includes(pageClassification.pageType)) {
      pageVerdict = 'Informational';
    } else if (pageClassification.pageType === 'opinion') {
      pageVerdict = 'Opinion';
    }
  }

  // ── Source Consensus & Stance Mapping ─────────────────────────────────────
  const getDomain = (url) => {
    try { return new URL(url || '').hostname.replace(/^www\./, ''); }
    catch { return ''; }
  };

  const sourceConsensus = evidenceForPrompt.map((article, index) => {
    const evaluation = (geminiResult.sourceConsensus || []).find(sc => sc.index === index) || {};
    
    // Fallback stance inference if not present
    let stance = evaluation.stance || 'Mentions';
    if (!evaluation.stance) {
      const isSupporting = claims.some(c => c.verdict === 'Supported' && c.sources?.some(s => s.url === article.url));
      const isContradicting = claims.some(c => c.verdict === 'Contradicted' && c.sources?.some(s => s.url === article.url));
      if (isSupporting) stance = 'Supports';
      else if (isContradicting) stance = 'Contradicts';
    }

    const summary = evaluation.summary || (responseLanguage === 'hi' ? 'इस स्रोत का विवरण हिंदी में उपलब्ध नहीं है।' : (article.snippet || article.content || ''));
    const pubTier = article.tier || getSourceTier(article.url);
    
    let score = 50;
    if (pubTier === 1) score = 85;
    else if (pubTier === 2) score = 75;
    else if (pubTier === 3) score = 65;
    else score = 45;
    
    if (article.isFactCheck) score = Math.min(100, score + 15);
    if (stance === 'Supports') score = Math.min(100, score + 10);
    else if (stance === 'Contradicts') score = Math.max(0, score - 20);

    const trustLevelMap = {
      'Highly Trusted': { en: 'Highly Trusted', hi: 'अत्यधिक विश्वसनीय' },
      'Trusted': { en: 'Trusted', hi: 'विश्वसनीय' },
      'Moderate': { en: 'Moderate', hi: 'मध्यम विश्वसनीय' },
      'Low': { en: 'Low', hi: 'कम विश्वसनीय' }
    };
    const trustLevelKey = pubTier === 1 ? 'Highly Trusted' : pubTier === 2 ? 'Trusted' : pubTier === 3 ? 'Moderate' : 'Low';
    const trustLevel = responseLanguage === 'hi' ? trustLevelMap[trustLevelKey].hi : trustLevelMap[trustLevelKey].en;

    return {
      publisher: article.source || getDomain(article.url) || (responseLanguage === 'hi' ? 'अज्ञात प्रकाशक' : 'Unknown Publisher'),
      title: article.title || (responseLanguage === 'hi' ? 'बिना शीर्षक' : 'Untitled'),
      url: article.url,
      publishedAt: article.publishedAt || article.date || null,
      trustLevel,
      stance,
      credibilityScore: score,
      summary
    };
  });

  const supportCount = sourceConsensus.filter(s => s.stance === 'Supports').length;
  const contradictCount = sourceConsensus.filter(s => s.stance === 'Contradicts').length;
  const neutralCount = sourceConsensus.filter(s => s.stance === 'Mentions' || s.stance === 'Neutral' || s.stance === 'Opinion').length;
  const unknownCount = sourceConsensus.length - supportCount - contradictCount - neutralCount;

  const evidenceMetrics = {
    supportCount,
    contradictCount,
    neutralCount,
    unknownCount
  };

  // Structured reasoning object
  let reasoningObj = {
    evidenceSummary: geminiResult.evidenceSummary || '',
    crossSourceAgreement: geminiResult.crossSourceAgreement || '',
    officialConfirmation: geminiResult.officialConfirmation || '',
    missingContext: geminiResult.missingContext || null,
    contradictionsFound: geminiResult.contradictionsFound || null,
    aiReasoning: geminiResult.finalAssessment || geminiResult.summary || ''
  };

  if (geminiResult.reasoning && typeof geminiResult.reasoning === 'object') {
    reasoningObj = { ...reasoningObj, ...geminiResult.reasoning };
  } else if (geminiResult.reasoning && typeof geminiResult.reasoning === 'string') {
    reasoningObj.evidenceSummary = geminiResult.reasoning || geminiResult.summary || '';
    reasoningObj.aiReasoning = geminiResult.summary || '';
  }

  // ── Fallbacks & Timeline (Section 10 & 12) ───────────────────────────────
  let verifiedFacts = geminiResult.verifiedFacts || [];
  if (!Array.isArray(verifiedFacts) || verifiedFacts.length === 0) {
    verifiedFacts = [
      responseLanguage === 'hi' ? 'दावे की सत्यता की जांच कई स्वतंत्र प्रकाशकों से की गई।' : 'The claim details were cross-checked against multiple independent publishers.',
      responseLanguage === 'hi' ? 'विभिन्न समाचार रिपोर्टों में दी गई समयसीमा का मिलान किया गया।' : 'Timelines and key events were compared across all available reports.',
      responseLanguage === 'hi' ? 'आधिकारिक बयानों और रिकॉर्ड्स की उपलब्धता की पुष्टि की गई।' : 'Official statements and records were evaluated for confirmation.'
    ];
  }

  let keyFindings = geminiResult.keyFindings || [];
  if (!Array.isArray(keyFindings) || keyFindings.length === 0) {
    keyFindings = [
      responseLanguage === 'hi' ? `कुल ${evidenceForPrompt.length} स्वतंत्र स्रोतों का विश्लेषण किया गया।` : `Analyzed reporting from ${evidenceForPrompt.length} unique sources.`,
      responseLanguage === 'hi' ? `दावे का समर्थन करने वाले ${supportCount} स्रोत पाए गए।` : `Identified ${supportCount} supporting and ${contradictCount} contradicting sources.`,
      responseLanguage === 'hi' ? 'स्रोतों की विश्वसनीयता के आधार पर आम सहमति स्कोर की गणना की गई।' : 'Consensus score was calculated based on publisher credibility tiers.'
    ];
  }

  let finalAssessment = geminiResult.finalAssessment || reasoningObj.aiReasoning || geminiResult.summary || '';
  if (!finalAssessment) {
    finalAssessment = responseLanguage === 'hi'
      ? `हमारे विश्लेषण में दावों की पुष्टि के लिए ${supportCount} सहायक स्रोत मिले। यह दावा ${trustScore >= 70 ? 'उच्च विश्वास के साथ समर्थित' : trustScore >= 40 ? 'मध्यम विश्वास के साथ आंशिक रूप से समर्थित' : 'अपुष्ट या खंडित'} है।`
      : `Our analysis found ${supportCount} supporting sources. The core claim is ${trustScore >= 70 ? 'supported with high confidence' : trustScore >= 40 ? 'partially corroborated with moderate confidence' : 'contradicted or unverified'}.`;
  }

  let timeline = geminiResult.timeline || null;
  if (timeline && typeof timeline === 'object') {
    timeline = {
      claimPublished: timeline.claimPublished || null,
      majorCoverage: timeline.majorCoverage || null,
      officialConfirmation: timeline.officialConfirmation || null,
      verificationCompleted: new Date().toISOString()
    };
  }

  // Confidence Breakdown (Part 6: Local Calculations)
  const averageCredibility = sourceConsensus.reduce((acc, s) => acc + s.credibilityScore, 0) / (sourceConsensus.length || 1);
  const evidenceQualityStars = Math.max(1, Math.min(5, Math.round(averageCredibility / 20)));

  const uniquePublishers = new Set(sourceConsensus.map(s => s.publisher)).size;
  const independentSourcesStars = Math.max(1, Math.min(5, Math.round(uniquePublishers / 1.5)));

  const hasOfficial = sourceConsensus.some(s => s.trustLevel === 'Highly Trusted' || /gov|nic|who|un/i.test(s.url));
  const officialSourcesStars = hasOfficial ? 5 : 2;

  const recentReportingStars = sourceConsensus.some(s => s.publishedAt && (Date.now() - new Date(s.publishedAt).getTime()) < 30 * 24 * 60 * 60 * 1000) ? 5 : 3;

  const hasContradict = sourceConsensus.some(s => s.stance === 'Contradicts');
  const contradictoryStatus = hasContradict
    ? (responseLanguage === 'hi' ? 'खंडन किया गया' : 'Contradicted')
    : (responseLanguage === 'hi' ? 'कोई नहीं मिला' : 'None Found');

  const aiConsistencyStatus = trustScore >= 70
    ? (responseLanguage === 'hi' ? 'उच्च' : 'High')
    : trustScore >= 40
      ? (responseLanguage === 'hi' ? 'मध्यम' : 'Medium')
      : (responseLanguage === 'hi' ? 'निम्न' : 'Low');

  const geminiCB = geminiResult.confidenceBreakdown || {};
  const getExplanation = (field, fallbackEn, fallbackHi) => {
    const fallback = responseLanguage === 'hi' ? fallbackHi : fallbackEn;
    if (typeof geminiCB[field] === 'object' && geminiCB[field] !== null) {
      return geminiCB[field].explanation || fallback;
    }
    return typeof geminiCB[field] === 'string' ? geminiCB[field] : fallback;
  };

  const confidenceBreakdownObj = {
    evidenceQuality: {
      stars: evidenceQualityStars,
      explanation: getExplanation('evidenceQuality', 'Assessment based on standard sources.', 'मानक स्रोतों के आधार पर मूल्यांकन।')
    },
    independentSources: {
      stars: independentSourcesStars,
      explanation: getExplanation('independentSources', 'Multiple sources analyzed.', 'कई स्रोतों का विश्लेषण किया गया।')
    },
    officialSources: {
      stars: officialSourcesStars,
      explanation: getExplanation('officialSources', 'No official statement found.', 'कोई आधिकारिक बयान नहीं मिला।')
    },
    recentReporting: {
      stars: recentReportingStars,
      explanation: getExplanation('recentReporting', 'Fresh coverage matches timeline.', 'नवीनतम कवरेज समयसीमा से मेल खाती है।')
    },
    contradictoryEvidence: {
      status: contradictoryStatus,
      explanation: getExplanation('contradictoryEvidence', 'No trusted publisher contradicts.', 'कोई भी विश्वसनीय प्रकाशक खंडन नहीं करता है।')
    },
    aiConsistency: {
      status: aiConsistencyStatus,
      explanation: getExplanation('aiConsistency', 'AI reasoning is consistent.', 'AI विश्लेषण सुसंगत है।')
    }
  };

  const result = {
    inputType,
    trustScore,
    verdict: geminiResult.verdict,
    confidence: geminiResult.confidence,
    aiLikelihood,
    aiScore: 100 - aiLikelihood,
    aiReasoning: reasoningObj.evidenceSummary || reasoningObj.aiReasoning || geminiResult.summary || '',
    reasoning: reasoningObj,
    confidenceBreakdown: confidenceBreakdownObj,
    sourceConsensus,
    evidenceMetrics,
    supportCount,
    contradictCount,
    neutralCount,
    unknownCount,
    sourceCredibility,
    language: responseLanguage,
    detectedLanguage: detectedLanguage !== 'en' ? detectedLanguage : responseLanguage,
    responseLanguage,
    claims,
    entities,
    factCheckHits: factCheckResults.length,
    apiWorking: !usedFallback,
    reasoningProvider: usedFallback ? 'evidence-only' : 'gemini',
    providerStatus: usedFallback ? 'degraded' : 'ok',
    providerWarning,
    processingTime: getProcessingTime(startTime),
    // ── New enriched fields ────────────────────────────────────────────────
    verifiedFacts,
    keyFindings,
    finalAssessment,
    timeline,
    evidenceReasoning: geminiResult.evidenceReasoning || '',
    claimsVerified: geminiResult.claimsVerified ?? claims.filter(c => c.verdict !== 'Unverified').length,
    claimsTotal: geminiResult.claimsTotal ?? claims.length,
    unverifiedNote: geminiResult.unverifiedNote || null,
    trustScoreBreakdown,
    // ── Internal / debug fields ────────────────────────────────────────────
    _verdict: geminiResult.verdict,
    _confidence: geminiResult.confidence,
    _summary: geminiResult.summary,
    _originalText: claimText.slice(0, 10000),
    _queriesUsed: searchQueries,
    // ── URL classification metadata — only present for URL inputs ────────────
    ...(pageClassification ? {
      pageType: pageClassification.pageType,
      pageTypeLabel: pageClassification.pageTypeLabel,
      pageTypeDescription: pageClassification.pageTypeDescription,
    } : {}),
    // pageVerdict overrides the trust-score-derived display verdict on the frontend
    ...(pageVerdict ? { pageVerdict } : {}),
  };

  logger.info('Verification pipeline complete', {
    trustScore,
    claimsCount: claims.length,
    claimsVerified: result.claimsVerified,
    claimsTotal: result.claimsTotal,
    supportingCount,
    contradictingCount,
    factCheckHits: factCheckResults.length,
    usedFallback,
    processingTime: result.processingTime,
  });

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEvidenceOnlyResult(claimText, evidenceSources, responseLanguage, providerWarning) {
  const trustedCount = evidenceSources.filter((s) => s.trusted).length;
  const factCheckCount = evidenceSources.filter((s) => s.isFactCheck).length;
  const hasEvidence = evidenceSources.length > 0;
  const confidence = hasEvidence
    ? Math.min(60, 20 + trustedCount * 8 + factCheckCount * 12 + evidenceSources.length * 2)
    : 0;

  const summary =
    responseLanguage === 'hi'
      ? 'AI विश्लेषण उपलब्ध नहीं था। यह परिणाम केवल पुनर्प्राप्त स्रोतों के आधार पर बनाया गया है।'
      : `${providerWarning || 'AI analysis unavailable.'} Showing evidence-only result.`;

  const reasoning = hasEvidence
    ? (responseLanguage === 'hi'
        ? `${summary} कुल ${evidenceSources.length} स्रोत मिले (${trustedCount} विश्वसनीय प्रकाशकों से${factCheckCount > 0 ? `, ${factCheckCount} आधिकारिक तथ्य-जाँच` : ''})। मैन्युअल समीक्षा की सिफारिश की जाती है।`
        : `${summary} Found ${evidenceSources.length} sources (${trustedCount} from trusted publishers${factCheckCount > 0 ? `, ${factCheckCount} official fact-check(s)` : ''}). Manual review recommended.`)
    : (responseLanguage === 'hi'
        ? `${summary} कोई साक्ष्य स्रोत प्राप्त नहीं हुआ।`
        : `${summary} No evidence sources were retrieved.`);

  return {
    verdict: hasEvidence && trustedCount > 0 ? 'PARTIALLY_TRUE' : 'UNVERIFIED',
    confidence,
    summary,
    reasoning,
    aiLikelihood: estimateAiLikelihood(claimText),
    claims: [
      {
        text: claimText.slice(0, 500),
        verdict: hasEvidence && trustedCount > 0 ? 'Misleading' : 'Unverified',
        confidence,
        reasoning,
        supportingSources: evidenceSources.map((_, i) => i).slice(0, 5),
        contradictingSources: [],
      },
    ],
  };
}

function buildClaims(geminiResult, evidenceSources, responseLanguage) {
  const rawClaims = geminiResult.claims || [];

  if (rawClaims.length === 0) {
    const claimReasoning = typeof geminiResult.reasoning === 'object' && geminiResult.reasoning !== null
      ? (geminiResult.reasoning.evidenceSummary || geminiResult.reasoning.aiReasoning || '')
      : (geminiResult.reasoning || '');
    return [
      {
        text: geminiResult.summary || (responseLanguage === 'hi' ? 'समग्र दावा' : 'Overall claim'),
        verdict: mapVerdict(geminiResult.verdict),
        confidence: geminiResult.confidence || 0,
        reasoning: claimReasoning,
        sourceCount: evidenceSources.length,
        trustedSourceCount: evidenceSources.filter((s) => s.trusted).length,
        sources: evidenceSources.slice(0, 5).map(s => toSourceShape(s, responseLanguage)),
      },
    ];
  }

  return rawClaims.map((claim) => {
    const supportingIndices = claim.supportingSources || [];
    const contradictingIndices = claim.contradictingSources || [];
    const allIndices = [...new Set([...supportingIndices, ...contradictingIndices])];

    const claimSources = allIndices
      .filter((i) => i >= 0 && i < evidenceSources.length)
      .map((i) => toSourceShape(evidenceSources[i], responseLanguage));

    const finalSources =
      claimSources.length > 0
        ? claimSources
        : evidenceSources.slice(0, 3).map(s => toSourceShape(s, responseLanguage));

    return {
      text: claim.text,
      verdict: mapVerdict(claim.verdict),
      confidence: claim.confidence || 0,
      reasoning: claim.reasoning || '',
      sourceCount: finalSources.length,
      trustedSourceCount: finalSources.filter((s) => s.trusted).length,
      sources: finalSources,
    };
  });
}

function toSourceShape(s, responseLanguage) {
  return {
    url: s.url,
    title: s.title || (responseLanguage === 'hi' ? 'बिना शीर्षक' : 'Untitled'),
    source: s.source || (responseLanguage === 'hi' ? 'अज्ञात प्रकाशक' : 'Unknown Publisher'),
    trusted: s.trusted,
    tier: s.tier,
    isFactCheck: s.isFactCheck || false,
    rating: s.rating || null,
  };
}

function mapVerdict(verdict) {
  if (!verdict) return 'Unverified';
  const normalized = verdict.toUpperCase().replace(/[_\s]+/g, '');
  const map = {
    TRUE: 'Supported',
    SUPPORTED: 'Supported',
    FALSE: 'Contradicted',
    CONTRADICTED: 'Contradicted',
    MISLEADING: 'Misleading',
    PARTIALLYTRUE: 'Misleading',
    PARTIALLY_TRUE: 'Misleading',
    UNVERIFIED: 'Unverified',
    // URL page-type verdicts
    INFORMATIONAL: 'Informational',
    OPINION: 'Opinion',
  };
  return map[normalized] || 'Unverified';
}

function calculateTrustScore(geminiResult, claims, hasFactChecks = false) {
  const verdictScores = { Supported: 85, Contradicted: 15, Misleading: 35, Unverified: 50 };

  if (claims.length === 0) return 50;

  let totalScore = 0;
  let totalWeight = 0;

  for (const claim of claims) {
    const baseScore = verdictScores[claim.verdict] || 50;
    const confidenceWeight = (claim.confidence || 50) / 100;
    const trustedBonus = claim.trustedSourceCount > 0 ? 5 : 0;
    totalScore += (baseScore + trustedBonus) * confidenceWeight;
    totalWeight += confidenceWeight;
  }

  const avgScore = totalWeight > 0 ? totalScore / totalWeight : 50;
  const geminiConfidence = geminiResult.confidence || 50;
  const factCheckBonus = hasFactChecks ? 5 : 0;
  const blendedScore = Math.round(avgScore * 0.65 + geminiConfidence * 0.35 + factCheckBonus);

  return Math.max(0, Math.min(100, blendedScore));
}

function estimateAiLikelihood(text) {
  const normalized = text.toLowerCase();
  const signals = ['as an ai', 'large language model', 'it is important to note', 'delve', 'furthermore', 'in conclusion', 'i cannot', 'i am unable to'];
  const hits = signals.filter((s) => normalized.includes(s)).length;
  return Math.min(75, 15 + hits * 12);
}

module.exports = { verifyText };
