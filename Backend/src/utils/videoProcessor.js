const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Extracts frames from a video file at 0.5 fps (1 frame every 2 seconds),
 * limited to the first 60 seconds of video.
 *
 * @param {string} videoFilePath - Absolute path to the source video file
 * @param {string} outputFolder  - Absolute path to the folder to write frames into
 * @returns {Promise<string[]>}  - Resolves with sorted array of extracted frame file paths
 */
function extractFrames(videoFilePath, outputFolder) {
  // Ensure output directory exists
  fs.mkdirSync(outputFolder, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(videoFilePath)
      .setStartTime(0)
      .duration(60)                         // hard limit: first 60 seconds
      .outputOptions([
        '-vf fps=0.5',                      // 1 frame every 2 seconds
        '-q:v 2',                           // high quality JPEG
      ])
      .output(path.join(outputFolder, 'frame%03d.jpg'))
      .on('end', () => {
        try {
          const files = fs.readdirSync(outputFolder)
            .filter((f) => f.endsWith('.jpg'))
            .sort()
            .map((f) => path.join(outputFolder, f));
          resolve(files);
        } catch (readErr) {
          reject(new Error(`Frame extraction succeeded but could not read output folder: ${readErr.message}`));
        }
      })
      .on('error', (err) => {
        reject(new Error(`ffmpeg frame extraction failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Deletes all files inside a folder, then deletes the folder itself.
 * Silently ignores any errors.
 *
 * @param {string} folderPath - Absolute path to the folder to clean up
 */
function cleanupFolder(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) return;

    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(folderPath, file));
      } catch (_) {
        // ignore individual file deletion errors
      }
    }

    fs.rmdirSync(folderPath);
  } catch (_) {
    // silently ignore folder cleanup errors
  }
}

module.exports = { extractFrames, cleanupFolder };
