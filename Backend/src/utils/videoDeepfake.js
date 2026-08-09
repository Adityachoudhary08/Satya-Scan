const path = require('path');
const { getFullDeepfakeAnalysis } = require('./deepfake');
const { extractFrames, cleanupFolder } = require('./videoProcessor');

/**
 * Finds the most frequently occurring non-null string in an array.
 * @param {string[]} arr
 * @returns {string|null}
 */
function mostCommon(arr) {
  const counts = {};
  let max = 0;
  let winner = null;
  for (const val of arr) {
    if (!val) continue;
    counts[val] = (counts[val] || 0) + 1;
    if (counts[val] > max) {
      max = counts[val];
      winner = val;
    }
  }
  return winner;
}

/**
 * Analyzes a video file for deepfake manipulation by extracting frames and
 * running full deepfake analysis on each frame in parallel.
 *
 * @param {string} videoFilePath - Absolute path to the uploaded video file
 * @returns {Promise<Object>} - Combined analysis result across all frames
 */
async function analyzeVideo(videoFilePath) {
  const tempFolder = path.join(
    __dirname,
    '../../uploads',
    `frames_${Date.now()}`
  );

  try {
    // ── Step A: Extract frames ─────────────────────────────────────────────
    console.log(`[videoDeepfake] Extracting frames from: ${videoFilePath}`);
    const frames = await extractFrames(videoFilePath, tempFolder);
    console.log(`[videoDeepfake] Extracted ${frames.length} frames`);

    // ── Step B: Guard empty frames ─────────────────────────────────────────
    if (!frames.length) {
      throw new Error('Could not extract frames from video');
    }

    // ── Step C: Analyze all frames in parallel ─────────────────────────────
    console.log(`[videoDeepfake] Analyzing ${frames.length} frames in parallel…`);
    const rawResults = await Promise.all(
      frames.map((frame) => getFullDeepfakeAnalysis(frame))
    );

    // Filter out completely failed calls (confidence === 0 AND no Gemini data)
    const results = rawResults.filter(
      (r) => r && !(r.confidence === 0 && !r.detectionReason)
    );

    console.log(`[videoDeepfake] Valid frame results: ${results.length}`);

    // ── Step D: Aggregate verdict ──────────────────────────────────────────
    const totalFrames = results.length;
    const confidenceValues = results
      .map((r) => r.confidence)
      .filter((c) => c !== null && c !== undefined);

    const averageConfidence =
      confidenceValues.length > 0
        ? Math.round(
            confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
          )
        : null;

    const deepfakeFrames = results.filter((r) => r.isDeepfake === true).length;
    const deepfakePercentage =
      totalFrames > 0
        ? Math.round((deepfakeFrames / totalFrames) * 100)
        : 0;
    const isDeepfake = deepfakePercentage > 50;

    let verdict;
    if (totalFrames < 3) {
      verdict = 'INCONCLUSIVE';
    } else if (deepfakePercentage > 50) {
      verdict = 'LIKELY DEEPFAKE';
    } else {
      verdict = 'LIKELY REAL';
    }

    // ── Step E: Aggregate forensic details ────────────────────────────────
    // Unique suspicious areas across all frames
    const allSuspiciousAreas = results
      .flatMap((r) => r.suspiciousAreas || [])
      .filter(Boolean);
    const uniqueSuspiciousAreas = [...new Set(allSuspiciousAreas)];

    // Most common manipulation technique
    const techniques = results.map((r) => r.manipulationTechnique).filter(Boolean);
    const manipulationTechnique = mostCommon(techniques) || null;

    // detectionReason from the frame with the highest confidence
    const mostConfidentFrame = results.reduce((best, r) => {
      const conf = r.confidence ?? -1;
      const bestConf = best?.confidence ?? -1;
      return conf > bestConf ? r : best;
    }, null);
    const detectionReason = mostConfidentFrame?.detectionReason || null;

    // Collect a recommendation (prefer from fake frames, fall back to any)
    const fakeResults = results.filter((r) => r.isDeepfake === true);
    const recommendation =
      (fakeResults[0]?.recommendation || results[0]?.recommendation || null);

    // Unique analyzedBy across all frames
    const analyzedBySet = new Set(results.flatMap((r) => r.analyzedBy || []));
    const analyzedBy = analyzedBySet.size > 0
      ? [...analyzedBySet]
      : ['Hugging Face', 'Gemini Vision AI'];

    // ── Step F: Cleanup temp frames ────────────────────────────────────────
    cleanupFolder(tempFolder);

    // ── Step G: Return combined result ─────────────────────────────────────
    return {
      isDeepfake,
      confidence: averageConfidence,
      verdict,
      deepfakeFrames,
      totalFramesAnalyzed: totalFrames,
      deepfakePercentage,
      detectionReason,
      suspiciousAreas: uniqueSuspiciousAreas,
      manipulationTechnique,
      recommendation,
      analyzedBy,
      frameByFrame: results,
    };
  } catch (error) {
    // Always clean up temp files even on failure
    cleanupFolder(tempFolder);
    console.error('[videoDeepfake] analyzeVideo error:', error.message);
    return {
      isDeepfake: null,
      confidence: 0,
      error: error.message,
    };
  }
}

module.exports = { analyzeVideo };
