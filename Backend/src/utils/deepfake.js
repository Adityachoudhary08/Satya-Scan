const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY } = require('../config/env');
const { parseGeminiJSON } = require('./helpers');

/**
 * Resolves the MIME type of a file based on its extension.
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

/**
 * Sends an image file buffer to Hugging Face deepfake detector model.
 * 
 * @param {string} imageFilePath - Path to the image file
 * @returns {Promise<{ isDeepfake: boolean|null, confidence: number, label?: string, error?: string }>}
 */
async function detectDeepfake(imageFilePath) {
  if (!process.env.HUGGINGFACE_API_KEY) {
    return {
      isDeepfake: null,
      confidence: 0,
      error: 'HUGGINGFACE_API_KEY is missing in backend .env file.',
    };
  }

  const url = 'https://router.huggingface.co/hf-inference/models/prithivMLmods/deepfake-detector-model-v1';

  const makeRequest = async () => {
    const imageBuffer = fs.readFileSync(imageFilePath);
    const headers = {
      'Content-Type': 'application/octet-stream',
    };
    if (process.env.HUGGINGFACE_API_KEY) {
      headers.Authorization = `Bearer ${process.env.HUGGINGFACE_API_KEY}`;
    }
    const response = await axios.post(url, imageBuffer, {
      headers,
      timeout: 30000,
    });
    return response.data;
  };

  let data;
  try {
    try {
      data = await makeRequest();
    } catch (err) {
      if (err.response && err.response.status === 503) {
        // Model is loading, wait 10 seconds and retry once
        await new Promise((resolve) => setTimeout(resolve, 10000));
        data = await makeRequest();
      } else {
        throw err;
      }
    }

    const items = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0] : data) : [];
    if (!items.length) {
      return { isDeepfake: null, confidence: 0, error: 'Detection unavailable' };
    }

    // Find object with highest score
    const highest = items.reduce((max, item) => (item.score > max.score ? item : max), items[0]);
    const labelLower = (highest.label || '').toLowerCase();
    const isDeepfake = labelLower.includes('fake');
    const confidence = Math.round((highest.score || 0) * 100);

    return {
      isDeepfake,
      confidence,
      label: highest.label,
    };
  } catch (error) {
    console.error("========== DEEPFAKE HF API ERROR ==========");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error("Data:", error.response.data);
    } else {
      console.error(error);
    }
    console.error("==========================================");
    return {
      isDeepfake: null,
      confidence: 0,
      error: 'Detection unavailable',
    };
  }
}

/**
 * Sends an image file buffer to Gemini Vision API for qualitative deepfake analysis.
 * 
 * @param {string} imageFilePath - Path to the image file
 * @returns {Promise<{ detectionReason: string, suspiciousAreas: string[], authenticAreas: string[], manipulationTechnique: string, confidenceExplanation: string, recommendation: string } | null>}
 */
async function analyzeDeepfakeWithAI(imageFilePath) {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing in backend env.");
    return null;
  }

  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
  ];

  let lastError;
  for (const modelName of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

        const imageBuffer = fs.readFileSync(imageFilePath);
        const mimeType = getMimeType(imageFilePath);

        const imagePart = {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType,
          },
        };

        const prompt = `You are a forensic deepfake and AI-generated media detection expert. 
Analyze this image/video frame carefully for signs of AI generation, synthetic media, face swaps, or deepfake manipulation. Look for:
- Generative AI synthetic artifacts (Sora, Runway, Pika, Kling, Midjourney, Stable Diffusion, GANs)
- Unnatural facial proportions, teeth alignment, or eye reflection specular mismatches
- Unnatural skin micro-smoothing or lack of optical sensor noise
- Hair/background boundary merging and unnatural edge blending
- Lighting or shadow directionality mismatches across subject layers

Respond ONLY in this exact JSON format with no extra text:
{
  "isDeepfake": true,
  "confidence": 85,
  "detectionReason": "detailed explanation of overall verdict",
  "suspiciousAreas": ["suspicious feature 1", "suspicious feature 2"],
  "authenticAreas": ["authentic feature 1"],
  "manipulationTechnique": "AI Generation (or Deepfake Face Swap, or Authentic if real)",
  "confidenceExplanation": "explanation of confidence",
  "recommendation": "recommendation for user"
}`;

        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text();
        return parseGeminiJSON(text);
      } catch (error) {
        lastError = error;
        const msg = error?.message || '';
        if (msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('429')) {
          console.warn(`Gemini model ${modelName} attempt ${attempt} hit rate limit / 503, retrying in 500ms...`);
          await new Promise((res) => setTimeout(res, 500 * attempt));
        } else {
          break; // Try next model for hard errors (404/invalid model name)
        }
      }
    }
  }

  console.error("========== DEEPFAKE GEMINI API ERROR ==========");
  console.error(lastError);
  console.error("==============================================");
  return null;
}

/**
 * Combines results from Hugging Face Deepfake Detector and Gemini Vision AI in parallel.
 * 
 * @param {string} imageFilePath - Path to the image file
 * @returns {Promise<{ isDeepfake: boolean|null, confidence: number|null, verdict: string, detectionReason: string|null, suspiciousAreas: string[]|null, authenticAreas: string[]|null, manipulationTechnique: string|null, confidenceExplanation: string|null, recommendation: string|null, analyzedBy: string[] }>}
 */
async function getFullDeepfakeAnalysis(imageFilePath) {
  const [hfResult, geminiResult] = await Promise.all([
    detectDeepfake(imageFilePath).catch(err => {
      console.error("detectDeepfake call failed in getFullDeepfakeAnalysis:", err);
      return null;
    }),
    analyzeDeepfakeWithAI(imageFilePath).catch(err => {
      console.error("analyzeDeepfakeWithAI call failed in getFullDeepfakeAnalysis:", err);
      return null;
    }),
  ]);

  const hfOk = hfResult && hfResult.isDeepfake !== null && !hfResult.error;
  const geminiOk = geminiResult && geminiResult.detectionReason;

  let isDeepfake = null;
  let confidence = null;
  let verdict = "INCONCLUSIVE";

  // 1. Evaluate Hugging Face score if available
  if (hfOk) {
    isDeepfake = hfResult.isDeepfake;
    confidence = hfResult.confidence;
  }

  // 2. Incorporate Gemini Vision analysis
  if (geminiOk) {
    const tech = (geminiResult.manipulationTechnique || '').toLowerCase();
    const reason = (geminiResult.detectionReason || '').toLowerCase();
    
    // Detect synthetic AI signatures from technique, reason, or explicit boolean
    const hasAiSignatures = /ai|synthetic|deepfake|sora|runway|pika|kling|midjourney|diffusion|generated|face-swap|manipulat/i.test(tech + ' ' + reason);
    const isGeminiFake = geminiResult.isDeepfake === true || (hasAiSignatures && !tech.includes('authentic') && !tech.includes('real'));
    const geminiConfidence = typeof geminiResult.confidence === 'number' ? geminiResult.confidence : (isGeminiFake ? 88 : 75);

    if (isDeepfake === null || isGeminiFake) {
      isDeepfake = isGeminiFake;
      confidence = geminiConfidence;
    }
  }

  if (isDeepfake === true) {
    verdict = "LIKELY DEEPFAKE";
  } else if (isDeepfake === false) {
    verdict = "LIKELY REAL";
  } else {
    verdict = "INCONCLUSIVE";
  }

  const analyzedBy = [];
  if (hfOk) analyzedBy.push("Hugging Face Deepfake Detector");
  if (geminiOk) analyzedBy.push("Gemini Vision AI");

  return {
    isDeepfake,
    confidence,
    verdict,
    detectionReason: geminiOk ? geminiResult.detectionReason : null,
    suspiciousAreas: geminiOk ? geminiResult.suspiciousAreas : null,
    authenticAreas: geminiOk ? geminiResult.authenticAreas : null,
    manipulationTechnique: geminiOk ? geminiResult.manipulationTechnique : null,
    confidenceExplanation: geminiOk ? geminiResult.confidenceExplanation : null,
    recommendation: geminiOk ? geminiResult.recommendation : null,
    analyzedBy,
  };
}

module.exports = {
  detectDeepfake,
  analyzeDeepfakeWithAI,
  getFullDeepfakeAnalysis,
};
