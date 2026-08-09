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
    'gemini-3.5-flash',
    'gemini-flash-latest'
  ];

  let lastError;
  for (const modelName of modelsToTry) {
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

      const prompt = `You are a forensic deepfake detection expert. 
Analyze this image carefully for signs of AI manipulation or deepfake generation. Look for:
- Unnatural skin texture or blurring around facial edges
- Inconsistent lighting or shadows on face
- Unusual eye reflections or asymmetry
- Hair/background boundary artifacts
- Unnatural facial proportions
- Compression artifacts typical of GAN-generated images
- Any other visual inconsistencies

Respond ONLY in this exact JSON format, no extra text:
{
  "detectionReason": "one paragraph explaining overall verdict",
  "suspiciousAreas": ["area 1 with detail", "area 2 with detail"],
  "authenticAreas": ["area 1", "area 2"],
  "manipulationTechnique": "likely technique used if fake, or Authentic if real",
  "confidenceExplanation": "why you are confident in this verdict",
  "recommendation": "what user should do with this information"
}`;

      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      return parseGeminiJSON(text);
    } catch (error) {
      console.warn(`Gemini analysis failed with model ${modelName}, trying fallback...`);
      lastError = error;
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
    if (hfResult.isDeepfake) {
      verdict = hfResult.confidence > 70 ? "LIKELY DEEPFAKE" : "INCONCLUSIVE";
    } else {
      verdict = hfResult.confidence > 70 ? "LIKELY REAL" : "INCONCLUSIVE";
    }
  }

  // 2. Incorporate Gemini Vision analysis
  let isGeminiFake = null;
  if (geminiOk) {
    const tech = (geminiResult.manipulationTechnique || '').toLowerCase();
    isGeminiFake = tech.length > 0 && !tech.includes('authentic') && !tech.includes('real') && !tech.includes('original') && !tech.includes('none');
    
    if (isDeepfake === null) {
      isDeepfake = isGeminiFake;
    }

    if (hfOk) {
      // Re-evaluate if they agree or disagree
      if (isDeepfake && isGeminiFake) {
        verdict = "LIKELY DEEPFAKE";
      } else if (!isDeepfake && !isGeminiFake) {
        verdict = "LIKELY REAL";
      } else {
        // Disagreement or weak scores
        verdict = "INCONCLUSIVE";
      }
    } else {
      // HF failed, trust Gemini entirely
      verdict = isGeminiFake ? "LIKELY DEEPFAKE" : "LIKELY REAL";
    }
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
