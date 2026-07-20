const logger = require('../config/logger');
const geminiService = require('./geminiService');
const { extractExifData } = require('../utils/exifParser');
const { buildImageVerificationPrompt } = require('../prompts/imageVerification');
const { resolveLanguage, getProcessingTime } = require('../utils/helpers');

async function verifyImage(imageBuffer, mimeType, originalFilename, selectedLanguage) {
  const startTime = Date.now();
  const responseLanguage = resolveLanguage(selectedLanguage);

  logger.info('Starting image verification pipeline', {
    filename: originalFilename,
    mimeType,
    size: imageBuffer.length,
    selectedLanguage,
    responseLanguage,
  });

  logger.info('Step 1: Validating image');
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Empty image buffer');
  }
  if (imageBuffer.length > 10 * 1024 * 1024) {
    throw new Error('Image exceeds 10MB limit');
  }

  logger.info('Step 2: Extracting EXIF metadata');
  const exifData = await extractExifData(imageBuffer);
  logger.info('EXIF extraction complete', {
    available: exifData.available,
    hasCamera: !!exifData.camera,
    hasSoftware: !!exifData.software,
  });

  logger.info('Step 3: Analyzing metadata integrity');
  const metadataAnalysis = analyzeMetadata(exifData, responseLanguage);

  const metadataInfoParts = [exifData.summary];
  if (metadataAnalysis.notes.length > 0) {
    metadataInfoParts.push('Metadata Analysis Notes:');
    metadataInfoParts.push(...metadataAnalysis.notes.map((n) => `- ${n}`));
  }
  const metadataInfo = metadataInfoParts.join('\n');

  logger.info('Step 4: Sending image to Gemini Vision for analysis');
  const imagePrompt = buildImageVerificationPrompt(metadataInfo, responseLanguage);

  let geminiResult;

  try {
    geminiResult = await geminiService.analyzeImage(
      imageBuffer,
      mimeType,
      imagePrompt,
      selectedLanguage
    );

    logger.info('Step 5: Gemini image analysis complete', {
      verdict: geminiResult.verdict,
      confidence: geminiResult.confidence,
    });
  } catch (error) {
    logger.error('Gemini image analysis failed:', error);
    return geminiService.formatGeminiError(error, false, responseLanguage);
  }

  const usedFallback = false;
  const confidence = geminiResult.confidence || 0;

  const result = {
    inputType: 'image',
    verdict: geminiResult.verdict || 'INCONCLUSIVE',
    confidence,
    trustScore: calculateImageTrustScore(geminiResult),
    aiProbability: geminiResult.aiProbability || 0,
    deepfakeProbability: geminiResult.deepfakeProbability || 0,
    manipulationProbability: geminiResult.manipulationProbability || 0,
    aiLikelihood: geminiResult.aiProbability || 0,
    metadataIntegrity: geminiResult.metadataIntegrity || metadataAnalysis.integrity,
    findings: geminiResult.findings || [],
    summary: geminiResult.summary || '',
    language: responseLanguage,
    detectedLanguage: responseLanguage,
    responseLanguage,
    apiWorking: true,
    providerStatus: 'ok',
    providerWarning: null,
    processingTime: getProcessingTime(startTime),
    _exifData: exifData,
    _originalFilename: originalFilename,
  };

  logger.info('Image verification pipeline complete', {
    verdict: result.verdict,
    confidence: result.confidence,
    usedFallback,
    processingTime: result.processingTime,
  });

  return result;
}

function buildProviderWarning(error, responseLanguage) {
  const isHi = responseLanguage === 'hi';
  if (error?.serviceBlocked) {
    return isHi
      ? 'कॉन्फ़िगर की गई Google Cloud परियोजना/कुंजी के लिए जेमिनी एपीआई अवरुद्ध है। जनरेटिव लैंग्वेज एपीआई सक्षम करें या जेमिनी एपीआई कुंजी बदलें।'
      : 'Gemini API is blocked for the configured Google Cloud project/key. Enable Generative Language API or rotate GEMINI_API_KEY.';
  }
  return isHi
    ? 'जेमिनी विज़न अस्थायी रूप से अनुपलब्ध है। केवल मेटाडेटा परिणाम लौटाया गया।'
    : 'Gemini Vision is temporarily unavailable. Returned metadata-only fallback result.';
}

function analyzeMetadata(exifData, responseLanguage) {
  const notes = [];
  let integrity = 'UNKNOWN';
  const isHi = responseLanguage === 'hi';

  if (!exifData.available) {
    notes.push(isHi ? 'कोई EXIF मेटाडेटा नहीं मिला - मेटाडेटा हटाया गया हो सकता है' : 'No EXIF metadata found - metadata may have been stripped');
    integrity = 'STRIPPED';
    return { integrity, notes };
  }

  if (exifData.camera) {
    notes.push(isHi ? `${exifData.camera} द्वारा कैप्चर किया गया` : `Captured by ${exifData.camera}`);
    integrity = 'INTACT';
  } else {
    notes.push(isHi ? 'कैमरे की कोई जानकारी नहीं - यह स्क्रीनशॉट, डाउनलोड या AI-जनित हो सकता है' : 'No camera information - could be a screenshot, download, or AI-generated');
  }

  if (exifData.software) {
    const sw = exifData.software.toLowerCase();
    const editingSoftware = ['photoshop', 'gimp', 'lightroom', 'snapseed', 'picsart', 'canva'];
    const aiSoftware = ['stable diffusion', 'midjourney', 'dall-e', 'dalle', 'comfyui', 'automatic1111', 'firefly'];

    if (aiSoftware.some((a) => sw.includes(a))) {
      notes.push(isHi ? `AI टूल से बनाया गया: ${exifData.software}` : `Created with AI tool: ${exifData.software}`);
      integrity = 'MODIFIED';
    } else if (editingSoftware.some((e) => sw.includes(e))) {
      notes.push(isHi ? `इससे संपादित: ${exifData.software}` : `Edited with: ${exifData.software}`);
      integrity = 'MODIFIED';
    } else {
      notes.push(isHi ? `सॉफ्टवेयर: ${exifData.software}` : `Software: ${exifData.software}`);
    }
  }

  if (exifData.dateTime) {
    notes.push(isHi ? `मूल तिथि: ${exifData.dateTime}` : `Original date: ${exifData.dateTime}`);
  } else {
    notes.push(isHi ? 'कोई मूल तिथि नहीं - टाइमस्टैम्प हटाया गया हो सकता है' : 'No original date - timestamp may have been removed');
  }

  if (exifData.gps) {
    notes.push(isHi ? `GPS निर्देशांक मौजूद हैं: ${exifData.gps.lat}, ${exifData.gps.lng}` : `GPS coordinates present: ${exifData.gps.lat}, ${exifData.gps.lng}`);
    if (integrity === 'UNKNOWN') integrity = 'INTACT';
  }

  if (exifData.camera && exifData.dateTime && exifData.gps) {
    integrity = 'INTACT';
  }

  if (!exifData.camera && !exifData.software && !exifData.dateTime) {
    integrity = 'STRIPPED';
    notes.push(isHi ? 'न्यूनतम मेटाडेटा - संभवतः अपलोड या शेयरिंग के दौरान हटाया गया' : 'Minimal metadata - likely stripped during upload or sharing');
  }

  return { integrity, notes };
}

function buildMetadataOnlyImageResult(exifData, metadataAnalysis, originalFilename, responseLanguage, providerWarning) {
  const signals = collectImageSignals(exifData, metadataAnalysis, originalFilename, responseLanguage);
  const aiProbability = clamp(signals.aiProbability, 0, 100);
  const manipulationProbability = clamp(signals.manipulationProbability, 0, 100);
  const deepfakeProbability = 0;
  const verdict = chooseFallbackImageVerdict(aiProbability, manipulationProbability, metadataAnalysis.integrity);
  const confidence = signals.strongSignal ? 62 : 35;

  const unavailableFinding = responseLanguage === 'hi'
    ? 'Gemini Vision उपलब्ध नहीं था, इसलिए यह परिणाम केवल फाइल मेटाडेटा और नाम संकेतों पर आधारित है।'
    : 'Gemini Vision was unavailable, so this result is based only on file metadata and filename signals.';

  return {
    verdict,
    confidence,
    aiProbability,
    deepfakeProbability,
    manipulationProbability,
    metadataIntegrity: metadataAnalysis.integrity,
    findings: [
      unavailableFinding,
      ...metadataAnalysis.notes,
      ...signals.findings,
      providerWarning,
    ].filter(Boolean),
    summary: buildFallbackImageSummary(verdict, responseLanguage),
  };
}

function collectImageSignals(exifData, metadataAnalysis, originalFilename, responseLanguage) {
  const findings = [];
  let aiProbability = 20;
  let manipulationProbability = metadataAnalysis.integrity === 'MODIFIED' ? 55 : 25;
  let strongSignal = false;
  const isHi = responseLanguage === 'hi';

  const software = (exifData.software || '').toLowerCase();
  const filename = (originalFilename || '').toLowerCase();
  const aiTerms = ['ai', 'generated', 'midjourney', 'dall-e', 'dalle', 'stable-diffusion', 'stable diffusion', 'comfyui', 'sdxl'];
  const editTerms = ['photoshop', 'edited', 'manipulated', 'composite', 'canva'];

  if (aiTerms.some((term) => software.includes(term) || filename.includes(term))) {
    aiProbability = 85;
    manipulationProbability = Math.max(manipulationProbability, 45);
    strongSignal = true;
    findings.push(isHi ? 'मेटाडेटा या फ़ाइल नाम में AI-जनरेशन संकेत मिला।' : 'AI-generation signal found in metadata or filename.');
  }

  if (editTerms.some((term) => software.includes(term) || filename.includes(term))) {
    manipulationProbability = 75;
    strongSignal = true;
    findings.push(isHi ? 'मेटाडेटा या फ़ाइल नाम में संपादन/छेड़छाड़ संकेत मिला।' : 'Editing/manipulation signal found in metadata or filename.');
  }

  if (exifData.camera && exifData.dateTime && !software) {
    aiProbability = 15;
    manipulationProbability = 20;
    strongSignal = true;
    findings.push(isHi ? 'कैमरा और कैप्चर टाइमस्टैम्प मेटाडेटा मौजूद हैं।' : 'Camera and capture timestamp metadata are present.');
  }

  if (metadataAnalysis.integrity === 'STRIPPED') {
    aiProbability = Math.max(aiProbability, 45);
    manipulationProbability = Math.max(manipulationProbability, 45);
    findings.push(isHi ? 'मेटाडेटा हटा दिया गया है, जो संदिग्ध है लेकिन अंतिम नहीं।' : 'Metadata is stripped, which is suspicious but not definitive.');
  }

  return { aiProbability, manipulationProbability, findings, strongSignal };
}

function chooseFallbackImageVerdict(aiProbability, manipulationProbability, metadataIntegrity) {
  if (aiProbability >= 80) return 'AI_GENERATED';
  if (manipulationProbability >= 70) return 'MANIPULATED';
  if (aiProbability >= 55) return 'LIKELY_AI_GENERATED';
  if (metadataIntegrity === 'INTACT' && aiProbability <= 20 && manipulationProbability <= 25) return 'LIKELY_AUTHENTIC';
  return 'INCONCLUSIVE';
}

function buildFallbackImageSummary(verdict, responseLanguage) {
  if (responseLanguage === 'hi') {
    return `अंतिम निष्कर्ष: ${verdict}. विजुअल AI मॉडल उपलब्ध नहीं था, इसलिए भरोसा सीमित है।`;
  }
  return `Final verdict: ${verdict}. Confidence is limited because the visual AI model was unavailable.`;
}

function calculateImageTrustScore(geminiResult) {
  const verdict = (geminiResult.verdict || '').toUpperCase();
  const confidence = geminiResult.confidence || 50;

  const verdictScores = {
    AUTHENTIC: 95,
    LIKELY_AUTHENTIC: 80,
    INCONCLUSIVE: 50,
    LIKELY_AI_GENERATED: 25,
    MANIPULATED: 15,
    AI_GENERATED: 10,
    DEEPFAKE: 5,
  };

  const baseScore = verdictScores[verdict] || 50;
  return Math.round(baseScore * (confidence / 100) + (100 - confidence) * 0.5);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = { verifyImage };
