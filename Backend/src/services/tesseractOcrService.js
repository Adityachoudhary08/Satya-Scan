const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const logger = require('../config/logger');

function cleanOcrText(value = '') {
  return String(value)
    .replace(/[|~`^_]{2,}/g, ' ')
    .replace(/[^\p{L}\p{N}\s'".,!?&:;()/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]\b/gi, '')
    .trim();
}

function validateOCRText(text, confidence = 0) {
  const clean = cleanOcrText(text);
  const letters = (clean.match(/[\p{L}]/gu) || []).length;
  const printable = (clean.match(/[\p{L}\p{N}\s]/gu) || []).length;
  const words = clean.split(/\s+/).filter(word => /[\p{L}]{2,}/u.test(word));
  const tokens = clean.split(/\s+/).filter(Boolean);
  const validWordRatio = words.length / Math.max(1, clean.split(/\s+/).filter(Boolean).length);
  const shortTokenRatio = tokens.filter(token => token.replace(/[^\p{L}\p{N}]/gu, '').length <= 2).length / Math.max(1, tokens.length);
  const noiseRatio = 1 - printable / Math.max(1, clean.length);
  const hasMeaningfulClaim = clean.length >= 8 && letters >= 6 && words.length >= 2 && validWordRatio >= 0.55 && shortTokenRatio <= 0.25 && noiseRatio <= 0.2 && confidence >= 35;
  return { text: clean, confidence: Math.round(confidence), hasMeaningfulClaim, reason: hasMeaningfulClaim ? null : 'OCR extraction unreliable' };
}

async function preprocessForOcr(imageBuffer) {
  const image = sharp(imageBuffer, { failOn: 'none' });
  const metadata = await image.metadata();
  const width = Math.min(2400, Math.max(1200, (metadata.width || 800) * 2));
  return image.rotate().grayscale().normalise().sharpen({ sigma: 1.2 }).resize({ width, withoutEnlargement: false }).png().toBuffer();
}

async function extractTextWithTesseract(imageBuffer) {
  const startedAt = Date.now();
  try {
    const prepared = await preprocessForOcr(imageBuffer);
    const { data } = await Tesseract.recognize(prepared, 'eng', { logger: message => {
      if (message.status === 'recognizing text') logger.debug('[Tesseract OCR] progress', { progress: message.progress });
    }});
    const validation = validateOCRText(data?.text, data?.confidence);
    logger.info('[Tesseract OCR] completed', { source: 'tesseract_preprocessed', ocrConfidence: validation.confidence, hasMeaningfulClaim: validation.hasMeaningfulClaim, durationMs: Date.now() - startedAt });
    return { ...validation, source: 'tesseract_preprocessed', rawText: data?.text || '' };
  } catch (error) {
    logger.warn('[Tesseract OCR] failed', { message: error.message, durationMs: Date.now() - startedAt });
    return null;
  }
}

module.exports = { extractTextWithTesseract, cleanOcrText, validateOCRText, preprocessForOcr };
