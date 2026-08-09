/**
 * Transform a stored Check document into the same shape returned by POST /api/analyze.
 * Used when reopening history — no AI recompute.
 */
function checkToResult(check) {
  const checkId = check._id?.toString?.() || check._id;

  if (check.inputType === 'image') {
    return {
      inputType: 'image',
      trustScore: check.trustScore,
      verdict: check.visualAuthenticity?.status || check.imageVerdict || 'Uncertain',
      confidence: check.visualAuthenticity?.confidence ?? check.imageConfidence ?? 50,
      aiProbability: check.aiProbability,
      deepfakeProbability: check.deepfakeProbability,
      manipulationProbability: check.manipulationProbability,
      metadataIntegrity: check.metadataIntegrity,
      findings: check.findings || check.visualAuthenticity?.evidence || [],
      evidence: check.visualAuthenticity?.evidence || check.findings || [],
      visualAuthenticity: check.visualAuthenticity || {
        status: check.imageVerdict || 'Uncertain',
        confidence: check.imageConfidence || 50,
        evidence: check.findings || [],
      },
      ocrClaimVerification: check.ocrClaimVerification || {
        hasText: false,
        extractedText: null,
        verdict: null,
        confidence: null,
        sources: [],
      },
      extractedText: check.ocrClaimVerification?.extractedText || null,
      claimVerdict: check.ocrClaimVerification?.verdict || null,
      summary: check.imageSummary || check.detectionReason,
      language: check.language,
      detectedLanguage: check.detectedLanguage,
      responseLanguage: check.responseLanguage,
      processingTime: check.processingTime,
      checkId,
    };
  }

  if (check.inputType === 'video') {
    const isManipulated =
      check.imageVerdict === 'LIKELY DEEPFAKE' ||
      (check.deepfakePercentage != null && check.deepfakePercentage > 50) ||
      (check.deepfakeFrames != null && check.totalFramesAnalyzed != null && check.deepfakeFrames > check.totalFramesAnalyzed / 2);

    const confidence =
      (check.imageConfidence != null && check.imageConfidence > 0)
        ? check.imageConfidence
        : (check.deepfakePercentage != null && check.deepfakePercentage > 0)
        ? Math.max(check.deepfakePercentage, 100 - check.deepfakePercentage)
        : (check.trustScore != null ? (isManipulated ? 100 - check.trustScore : check.trustScore) : 85);

    return {
      inputType: 'video',
      trustScore: check.trustScore ?? (isManipulated ? 20 : 85),
      verdict: check.imageVerdict || (isManipulated ? 'LIKELY DEEPFAKE' : 'LIKELY REAL'),
      confidence,
      isDeepfake: isManipulated,
      totalFramesAnalyzed: check.totalFramesAnalyzed || 0,
      deepfakeFrames: check.deepfakeFrames || 0,
      deepfakePercentage: check.deepfakePercentage || 0,
      detectionReason: check.detectionReason || '',
      manipulationTechnique: check.manipulationTechnique || '',
      suspiciousAreas: check.suspiciousAreas || check.findings || [],
      authenticAreas: check.authenticAreas || check.verifiedFacts || [],
      confidenceExplanation: check.confidenceExplanation || '',
      recommendation: check.recommendation || '',
      analyzedBy: check.analyzedBy && check.analyzedBy.length > 0 ? check.analyzedBy : ['OpenCV + Hugging Face + Gemini AI'],
      findings: check.suspiciousAreas || check.findings || [],
      summary: check.detectionReason || '',
      checkId,
    };
  }

  const aiReasoning =
    check.aiReasoning ||
    (check.claims || [])
      .map((c) => c.reasoning)
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');

  const result = {
    inputType: check.inputType,
    trustScore: check.trustScore,
    aiLikelihood: check.aiScore != null ? 100 - check.aiScore : undefined,
    aiScore: check.aiScore,
    aiReasoning,
    sourceCredibility: check.sourceScore,
    language: check.language,
    detectedLanguage: check.detectedLanguage,
    responseLanguage: check.responseLanguage,
    claims: check.claims || [],
    processingTime: check.processingTime,
    checkId,
  };

  if (check.pageType) {
    result.pageType = check.pageType;
    result.pageTypeLabel = check.pageTypeLabel;
    result.pageTypeDescription = check.pageTypeDescription;
  }
  if (check.pageVerdict) {
    result.pageVerdict = check.pageVerdict;
  }

  return result;
}

module.exports = checkToResult;
