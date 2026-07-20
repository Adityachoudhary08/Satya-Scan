const { verifyText } = require('../services/textVerificationService');
const { verifyImage } = require('../services/imageVerificationService');
const { verifyPageContent, extractPageClaim } = require('../services/pageAnalysisService');
const Check = require('../models/Check');
const logger = require('../config/logger');
const { resolveLanguage } = require('../utils/helpers');

/**
 * POST /api/analyze
 *
 * Routes to the correct pipeline based on `type`:
 * - text/url → textVerificationService (Tavily + Gemini)
 * - image → imageVerificationService (EXIF + Gemini Vision)
 *
 * Images NEVER enter the fact-checking pipeline.
 * Text NEVER enters the image pipeline.
 */
async function analyze(req, res, next) {
  try {
    const type = req.body.type;
    const content = req.body.content;
    const selectedLanguage = req.body.selectedLanguage || req.body.responseLanguage;

    logger.info('Analyze request received', {
      type,
      selectedLanguage,
      userId: req.userId || 'anonymous',
      contentLength: content?.length || 0,
      hasFile: !!req.file,
    });

    // ─── Caching Check (Part 7: CLAIM CACHE) ───────────────────────────
    if (type === 'text' || type === 'url') {
      const normalizedClaim = content.trim().toLowerCase().replace(/[^\w\s\u0900-\u097F]/g, '');
      if (normalizedClaim) {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentChecks = await Check.find({
          createdAt: { $gte: yesterday },
          inputType: type
        }).lean();

        const match = recentChecks.find(check => {
          const checkText = check.originalText || '';
          const checkNorm = checkText.trim().toLowerCase().replace(/[^\w\s\u0900-\u097F]/g, '');
          return checkNorm === normalizedClaim && check.responseLanguage === resolveLanguage(selectedLanguage);
        });

        if (match) {
          logger.info('CACHE HIT: Returning cached check from last 24 hours', { checkId: match._id });
          const cachedResult = {
            success: true,
            inputType: match.inputType,
            trustScore: match.trustScore,
            verdict: match.pageVerdict || (match.trustScore >= 70 ? 'Supported' : match.trustScore >= 40 ? 'Misleading' : 'Contradicted'),
            confidence: match.trustScore || 50,
            aiLikelihood: match.aiLikelihood || (100 - match.aiScore),
            aiScore: match.aiScore,
            aiReasoning: match.aiReasoning,
            reasoning: match.reasoning,
            confidenceBreakdown: match.confidenceBreakdown,
            sourceConsensus: match.sourceConsensus,
            evidenceMetrics: match.evidenceMetrics,
            supportCount: match.supportCount,
            contradictCount: match.contradictCount,
            neutralCount: match.neutralCount,
            unknownCount: match.unknownCount,
            sourceCredibility: match.sourceScore,
            language: match.language,
            detectedLanguage: match.detectedLanguage,
            responseLanguage: match.responseLanguage,
            claims: match.claims,
            processingTime: '0.0s (Cached)',
            isCached: true
          };
          return res.json({ ...cachedResult, checkId: match._id });
        }
      }
    }

    let result;

    // ─── Route to correct pipeline ─────────────────────────────────────
    if (type === 'text' || type === 'url') {
      // TEXT / URL PIPELINE — Tavily + Gemini
      result = await verifyText(content, type, selectedLanguage);
    } else if (type === 'image') {
      // IMAGE PIPELINE — EXIF + Gemini Vision (NO Tavily, NO web search)
      if (!req.file) {
        return res.status(400).json({ message: 'Image file is required' });
      }
      result = await verifyImage(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        selectedLanguage
      );
    } else {
      return res.status(400).json({ message: 'Invalid analysis type' });
    }

    if (result && result.success === false) {
      return res.status(result.statusCode || 500).json({
        success: false,
        errorType: result.errorType,
        message: result.message,
        evidenceCollected: result.evidenceCollected
      });
    }

    // ─── Save to history (Saves all scans to support global caching) ────
    let checkId = null;
    let checkData = null;
    try {
      checkData = buildCheckDocument(req.userId || null, type, content, result);
      const check = await Check.create(checkData);
      checkId = check._id;
      logger.info('Check saved to history', { checkId, userId: req.userId || 'anonymous' });
    } catch (saveError) {
      // Don't fail the whole request if save fails
      logger.error('Failed to save check to history', {
        error: saveError.message,
        stack: saveError.stack,
        validation: saveError.errors,
        payload: checkData
      });
    }

    // ─── Return response ───────────────────────────────────────────────
    // Remove internal fields (prefixed with _)
    const response = { ...result, checkId };
    Object.keys(response).forEach((key) => {
      if (key.startsWith('_')) delete response[key];
    });

    res.json(response);
  } catch (error) {
    logger.error('Analysis failed:', {
      message: error.message,
      type: req.body?.type,
    });
    next(error);
  }
}

/**
 * Build a Check document from the analysis result.
 */
function buildCheckDocument(userId, inputType, content, result) {
  const base = {
    userId,
    inputType,
    language: result.language,
    detectedLanguage: result.detectedLanguage,
    responseLanguage: result.responseLanguage,
    selectedLanguage: result._selectedLanguage || result.selectedLanguage,
    processingTime: result.processingTime,
    reasoning: result.reasoning,
    confidenceBreakdown: result.confidenceBreakdown,
    sourceConsensus: result.sourceConsensus,
    evidenceMetrics: result.evidenceMetrics,
    supportCount: result.supportCount,
    contradictCount: result.contradictCount,
    neutralCount: result.neutralCount,
    unknownCount: result.unknownCount,
    verifiedFacts: result.verifiedFacts,
    keyFindings: result.keyFindings,
    finalAssessment: result.finalAssessment,
    timeline: result.timeline,
  };

  if (inputType === 'text' || inputType === 'url') {
    return {
      ...base,
      originalText: result._originalText || content?.slice(0, 10000),
      trustScore: result.trustScore,
      aiScore: result.aiScore,
      aiReasoning: result.aiReasoning,
      sourceScore: result.sourceCredibility,
      pageType: result.pageType,
      pageTypeLabel: result.pageTypeLabel,
      pageTypeDescription: result.pageTypeDescription,
      pageVerdict: result.pageVerdict,
      claims: result.claims?.map((c) => ({
        text: c.text,
        verdict: c.verdict,
        confidence: c.confidence,
        reasoning: c.reasoning,
        sourceCount: c.sourceCount,
        trustedSourceCount: c.trustedSourceCount,
        sources: c.sources?.map((s) => ({
          url: s.url,
          title: s.title,
          source: s.source,
          trusted: s.trusted,
        })),
      })) || [],
    };
  }

  // Image
  return {
    ...base,
    originalText: result._originalFilename || 'Image upload',
    trustScore: result.trustScore,
    imageVerdict: result.verdict,
    imageConfidence: result.confidence,
    aiProbability: result.aiProbability,
    deepfakeProbability: result.deepfakeProbability,
    manipulationProbability: result.manipulationProbability,
    metadataIntegrity: result.metadataIntegrity,
    findings: result.findings,
    imageSummary: result.summary,
  };
}

async function analyzePage(req, res, next) {
  try {
    const { url, pageTitle, articleTitle, mainContent, metaDescription, selectedLanguage, mainClaim, secondaryClaims, entities, locations, dates } = req.body;

    logger.info('[STAGE 13] Backend received /page SUCCESS');
    logger.info('Analyze page request received', {
      url,
      userId: req.userId || 'anonymous',
      contentLength: mainContent?.length || 0,
      mainClaim,
    });

    const result = await verifyPageContent({
      url,
      pageTitle,
      articleTitle,
      mainContent,
      metaDescription,
      selectedLanguage,
      mainClaim,
      secondaryClaims,
      entities,
      locations,
      dates,
    });

    if (result && result.success === false) {
      return res.status(result.statusCode || 500).json({
        success: false,
        errorType: result.errorType,
        message: result.message,
        evidenceCollected: result.evidenceCollected
      });
    }

    // Save to history if authenticated
    let checkId = null;
    if (req.userId) {
      try {
        const checkData = {
          userId: req.userId,
          inputType: 'page',
          originalText: mainContent?.slice(0, 15000),
          trustScore: result.trustScore,
          aiScore: 100 - result.trustScore,
          aiReasoning: result.summary,
          pageVerdict: result.verdict,
          politicalBias: result.politicalBias,
          claims: result.claims?.map((c) => ({
            text: c.text,
            verdict: c.verdict,
            confidence: c.confidence,
            reasoning: c.reasoning,
            sourceCount: c.sources?.length || 0,
            sources: c.sources?.map((s) => ({
              url: s.url,
              title: s.title,
              source: s.source,
              trusted: s.trusted,
            })) || [],
          })) || [],
          suspiciousStatements: result.suspiciousStatements || [],
          missingContext: result.missingContext || [],
          recommendation: result.recommendation,
          articleTitle: result.articleTitle || articleTitle || '',
          pageTitle: result.pageTitle || pageTitle || '',
          metaDescription: result.metaDescription || metaDescription || '',
          language: result.language,
          detectedLanguage: result.detectedLanguage,
          responseLanguage: result.responseLanguage,
          selectedLanguage,
          processingTime: result.processingTime,
        };
        const check = await Check.create(checkData);
        checkId = check._id;
        logger.info('Page check saved to history', { checkId, userId: req.userId });
      } catch (saveError) {
        logger.error('Failed to save page check to history:', saveError.message);
      }
    }

    res.json({ ...result, checkId });
  } catch (error) {
    logger.error('Page analysis failed:', {
      message: error.message,
    });
    next(error);
  }
}

async function extractClaim(req, res, next) {
  try {
    const { url, pageTitle, articleTitle, mainContent, metaDescription, selectedLanguage } = req.body;

    logger.info('[STAGE 9] Backend received /page/extract SUCCESS');
    logger.info('Extract claim request received', {
      url,
      contentLength: mainContent?.length || 0,
      selectedLanguage,
    });

    const result = await extractPageClaim({
      url,
      pageTitle,
      articleTitle,
      mainContent,
      metaDescription,
      selectedLanguage,
    });

    if (result && result.success === false) {
      return res.status(result.statusCode || 500).json({
        success: false,
        errorType: result.errorType,
        message: result.message,
        evidenceCollected: result.evidenceCollected
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Claim extraction failed:', {
      message: error.message,
    });
    next(error);
  }
}

module.exports = { analyze, analyzePage, extractClaim };
