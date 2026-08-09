const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getFullDeepfakeAnalysis } = require('../utils/deepfake');
const { analyzeVideo } = require('../utils/videoDeepfake');

const router = express.Router();

// ── Shared: ensure uploads directory exists ────────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Shared: disk storage factory ───────────────────────────────────────────
function makeStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    },
  });
}

// ── Image upload: 10MB, jpg/jpeg/png/webp ─────────────────────────────────
const imageUpload = multer({
  storage: makeStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, JPEG, PNG, and WEBP images are allowed.'), false);
    }
  },
});

// ── Video upload: 50MB, mp4/mpeg/quicktime/webm ───────────────────────────
const VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50 MB

const videoUpload = multer({
  storage: makeStorage(),
  limits: { fileSize: VIDEO_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only video files accepted'), { code: 'INVALID_VIDEO_TYPE' }), false);
    }
  },
});

// ── Helper: delete a file silently ────────────────────────────────────────
function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
  }
}

// ── Helper: wrap a Promise with a timeout ────────────────────────────────
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error('Analysis timed out'), { code: 'TIMEOUT' })),
      ms
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/deepfake/image
// Accepts single image upload (field name: "image")
// ════════════════════════════════════════════════════════════════════════════
router.post('/image', imageUpload.single('image'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  const filePath = req.file.path;
  try {
    const result = await getFullDeepfakeAnalysis(filePath);
    return res.json(result);
  } catch (err) {
    next(err);
  } finally {
    safeUnlink(filePath);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/deepfake/video
// Accepts single video upload (field name: "video")
// ════════════════════════════════════════════════════════════════════════════
router.post(
  '/video',
  (req, res, next) => {
    // Run multer with custom error handling before the main handler
    videoUpload.single('video')(req, res, (err) => {
      if (!err) return next();

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Video must be under 50MB' });
      }
      if (err.code === 'INVALID_VIDEO_TYPE') {
        return res.status(400).json({ error: 'Only video files accepted' });
      }
      return res.status(400).json({ error: err.message });
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const filePath = req.file.path;
    try {
      // 120-second timeout for the entire analysis pipeline
      const result = await withTimeout(analyzeVideo(filePath), 120_000);

      // Attach sampling metadata and return
      return res.json({
        ...result,
        samplingInfo: '1 frame extracted every 2 seconds, max 60 seconds analyzed',
      });
    } catch (err) {
      if (err.code === 'TIMEOUT') {
        return res.status(408).json({
          error: 'Analysis timed out. Please try a shorter or smaller video.',
        });
      }
      console.error('[deepfake/video] route error:', err.message);
      return res.status(500).json({ error: err.message || 'Video analysis failed' });
    } finally {
      // Always clean up the original uploaded video
      safeUnlink(filePath);
    }
  }
);

module.exports = router;
