import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import client from '../api/client';

/* ── Constants ─────────────────────────────────────────────────────────────── */
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const VIDEO_MAX = 50 * 1024 * 1024; // 50MB

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeVideoResult(res) {
  if (!res) return null;
  const isManipulated =
    res.isDeepfake === true ||
    res.verdict === 'LIKELY DEEPFAKE' ||
    res.imageVerdict === 'LIKELY DEEPFAKE' ||
    (res.deepfakeFrames != null && res.deepfakeFrames >= 1) ||
    (res.deepfakePercentage != null && res.deepfakePercentage >= 20);

  const verdict =
    res.verdict ||
    res.imageVerdict ||
    (isManipulated ? 'LIKELY DEEPFAKE' : (res.totalFramesAnalyzed && res.totalFramesAnalyzed < 3 ? 'INCONCLUSIVE' : 'LIKELY REAL'));

  const confidence =
    (res.confidence != null && res.confidence > 0)
      ? res.confidence
      : (res.imageConfidence != null && res.imageConfidence > 0)
        ? res.imageConfidence
        : (res.deepfakePercentage != null && res.deepfakePercentage > 0)
          ? Math.max(res.deepfakePercentage, 100 - res.deepfakePercentage)
          : (res.trustScore != null ? (isManipulated ? 100 - res.trustScore : res.trustScore) : 85);

  return {
    ...res,
    isDeepfake: isManipulated,
    verdict,
    confidence,
    deepfakeFrames: res.deepfakeFrames ?? 0,
    totalFramesAnalyzed: res.totalFramesAnalyzed ?? 0,
    deepfakePercentage: res.deepfakePercentage ?? 0,
    detectionReason: res.detectionReason || res.summary || '',
    manipulationTechnique: res.manipulationTechnique || '',
    suspiciousAreas: res.suspiciousAreas || res.findings || [],
    authenticAreas: res.authenticAreas || res.verifiedFacts || [],
    recommendation: res.recommendation || '',
    analyzedBy: res.analyzedBy && res.analyzedBy.length > 0 ? res.analyzedBy : ['Gemini Vision AI'],
  };
}

/* ── Animated SVG confidence ring ──────────────────────────────────────────── */
function ConfidenceRing({ value, isFake }) {
  const size = 180;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const hasConfidence = value !== null && value !== undefined;
  const accentColor = !hasConfidence ? '#768E56' : (isFake ? '#DC2626' : '#16A34A');
  const trackColor = !hasConfidence ? 'rgba(118,142,86,0.12)' : (isFake ? 'rgba(220,38,38,0.12)' : 'rgba(22,163,74,0.12)');

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={trackColor} strokeWidth={stroke}
        />
        {hasConfidence && (
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - (circumference * value) / 100 }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: 0.3 }}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-4xl font-black"
          style={{ color: accentColor }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {hasConfidence ? `${value}%` : 'N/A'}
        </motion.span>
        <span className="text-xs font-semibold text-[#5C6650] uppercase tracking-wider mt-1">
          {hasConfidence ? 'Confidence' : 'Calculated Score'}
        </span>
      </div>
    </div>
  );
}

/* ── Shield Logo ───────────────────────────────────────────────────────────── */
function ShieldLogo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sgVideoForensics" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#232B1B" />
          <stop offset="100%" stopColor="#5C6650" />
        </linearGradient>
      </defs>
      <path d="M50 6 L88 22 L88 54 C88 72 70 88 50 95 C30 88 12 72 12 54 L12 22 Z"
        fill="url(#sgVideoForensics)" opacity="0.08" stroke="url(#sgVideoForensics)" strokeWidth="2.5" />
      <text x="50" y="66" textAnchor="middle" fontSize="44" fontWeight="800"
        fontFamily="Inter,Arial,sans-serif" fill="url(#sgVideoForensics)">S</text>
    </svg>
  );
}

/* ── Spinner component ─────────────────────────────────────────────────────── */
function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

/* ── Motion Variants for Staggered Cards ───────────────────────────────────── */
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 15 },
  },
};

/* ── Video Progress Stage ──────────────────────────────────────────────────── */
function VideoProgressStages({ stage }) {
  const stages = [
    { key: 1, icon: '📤', text: 'Uploading video payload & verifying format…' },
    { key: 2, icon: '🎞️', text: 'Sampling video keyframes every 2 seconds…' },
    { key: 3, icon: '🔬', text: 'Analyzing visual frames for synthesis anomalies…' },
    { key: 4, icon: '⚖️', text: 'Cross-referencing temporal consensus & generating report…' },
  ];

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Big spinner */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-[#C3CC9B] rounded-full" />
        <div className="absolute inset-0 border-4 border-transparent border-t-[#232B1B] rounded-full animate-spin" />
      </div>

      {/* Stages */}
      <div className="w-full max-w-md space-y-3">
        {stages.map((s) => (
          <AnimatePresence key={s.key}>
            {stage >= s.key && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: stage === s.key ? 1 : 0.45, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-3 bg-[#FBE8CE]/50 p-2.5 rounded-xl border border-[#C3CC9B]/40"
              >
                <span className="text-lg">{s.icon}</span>
                <span className={`text-xs font-semibold ${stage === s.key ? 'text-[#232B1B] font-bold' : 'text-[#5C6650]'}`}>
                  {s.text}
                </span>
                {stage > s.key && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="ml-auto text-green-700 text-xs font-black bg-green-100 px-2 py-0.5 rounded-full"
                  >
                    ✓ Done
                  </motion.span>
                )}
                {stage === s.key && (
                  <Spinner className="ml-auto h-4 w-4 text-[#232B1B]" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        ))}
      </div>

      {/* Upload progress bar for stage 1 */}
      {stage === 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-md"
        >
          <div className="h-2 bg-[#C3CC9B]/40 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#232B1B] rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 3, ease: 'easeInOut' }}
            />
          </div>
        </motion.div>
      )}

      <p className="text-xs text-[#5C6650]/70 font-medium">Neural video frame extraction may take 30 to 90 seconds depending on video length</p>
    </div>
  );
}

/* ── Frame Analysis Bar ────────────────────────────────────────────────────── */
function FrameAnalysisBar({ deepfakeFrames, totalFrames }) {
  const cleanFrames = Math.max(0, totalFrames - deepfakeFrames);
  const deepfakePercent = totalFrames > 0 ? Math.round((deepfakeFrames / totalFrames) * 100) : 0;
  const cleanPercent = 100 - deepfakePercent;

  return (
    <motion.div
      variants={cardVariants}
      className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl shadow-xl p-6"
    >
      <h3 className="text-lg font-bold text-[#232B1B] mb-4 flex items-center gap-2">
        <span>🎬</span> Frame Anomaly Distribution
      </h3>

      {/* Horizontal bar */}
      <div className="h-6 rounded-full overflow-hidden flex bg-[#C3CC9B]/40 mb-4 border border-[#C3CC9B]">
        {deepfakePercent > 0 && (
          <motion.div
            className="h-full bg-red-600 flex items-center justify-center text-white text-xs font-black shadow-inner"
            initial={{ width: 0 }}
            animate={{ width: `${deepfakePercent}%` }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            {deepfakePercent >= 12 && (
              <span>{deepfakePercent}% Flagged</span>
            )}
          </motion.div>
        )}
        {cleanPercent > 0 && (
          <motion.div
            className="h-full bg-emerald-600 flex items-center justify-center text-white text-xs font-black shadow-inner"
            initial={{ width: 0 }}
            animate={{ width: `${cleanPercent}%` }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            {cleanPercent >= 12 && (
              <span>{cleanPercent}% Authentic</span>
            )}
          </motion.div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2 pt-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-600 shrink-0" />
          <span className="text-red-900 font-bold">
            {deepfakeFrames} frame{deepfakeFrames !== 1 ? 's' : ''} exhibited manipulation / synthesis signs
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-600 shrink-0" />
          <span className="text-emerald-900 font-bold">
            {cleanFrames} frame{cleanFrames !== 1 ? 's' : ''} verified authentic
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT: Video Analysis Page
   ══════════════════════════════════════════════════════════════════════════════ */
export default function DeepfakePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  /* ── Video state ── */
  const vidRef = useRef(null);
  const [vidFile, setVidFile] = useState(location.state?.videoFile || null);
  const [vidPreview, setVidPreview] = useState(
    location.state?.videoFile ? URL.createObjectURL(location.state.videoFile) : null
  );
  const [vidDragOver, setVidDragOver] = useState(false);
  const [vidLoading, setVidLoading] = useState(false);
  const [vidStage, setVidStage] = useState(0);
  const [vidError, setVidError] = useState('');
  const [vidResult, setVidResult] = useState(
    normalizeVideoResult(location.state?.preloadedResult || location.state?.result || null)
  );
  const [vidSizeWarn, setVidSizeWarn] = useState(false);

  /* ═════════════════════════ VIDEO HANDLERS ═════════════════════════════════ */
  const processVideo = useCallback((f) => {
    setVidError('');
    setVidResult(null);
    setVidSizeWarn(false);
    if (!VIDEO_TYPES.includes(f.type) && !f.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
      setVidError('Invalid file type. Only MP4, WebM, MOV, AVI, and MKV videos are supported.');
      return;
    }
    if (f.size > VIDEO_MAX) {
      setVidSizeWarn(true);
      setVidError('File exceeds maximum size. Maximum video upload size is 50 MB.');
      return;
    }
    if (f.size > 40 * 1024 * 1024) {
      setVidSizeWarn(true); // near limit warning
    }
    setVidFile(f);
    setVidPreview(URL.createObjectURL(f));
  }, []);

  const handleVidDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setVidDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) processVideo(f);
  }, [processVideo]);

  const clearVideo = () => {
    setVidFile(null);
    if (vidPreview) URL.revokeObjectURL(vidPreview);
    setVidPreview(null);
    setVidResult(null);
    setVidError('');
    setVidSizeWarn(false);
    setVidStage(0);
    if (vidRef.current) vidRef.current.value = '';
  };

  const handleAnalyzeVideo = async () => {
    if (!vidFile) return setVidError('Please select or drag a video file first.');
    setVidLoading(true);
    setVidError('');
    setVidResult(null);

    // Simulate stage progression while the request runs
    setVidStage(1);
    const stageTimer2 = setTimeout(() => setVidStage(2), 3000);
    const stageTimer3 = setTimeout(() => setVidStage(3), 8000);
    const stageTimer4 = setTimeout(() => setVidStage(4), 20000);

    try {
      const form = new FormData();
      form.append('video', vidFile);
      const res = await client.post('/deepfake/video', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });
      setVidResult(normalizeVideoResult(res.data));
    } catch (err) {
      if (err.response?.status === 408) {
        setVidError('Video analysis timed out. Please try a shorter video snippet (under 60 seconds).');
      } else {
        setVidError(err.response?.data?.error || err.message || 'Video analysis failed. Please verify your connection and try again.');
      }
    } finally {
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      clearTimeout(stageTimer4);
      setVidLoading(false);
      setVidStage(0);
    }
  };

  /* ═════════════════════════ RESULTS RENDERER ═══════════════════════════════ */
  function ResultCards({ result: rawResult }) {
    const result = normalizeVideoResult(rawResult);
    if (!result) return null;

    const isManipulated = result.isDeepfake || result.verdict === 'LIKELY DEEPFAKE';

    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mt-8 space-y-6"
      >
        {/* 1. Verdict Banner Card */}
        <motion.div
          variants={cardVariants}
          className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl overflow-hidden shadow-xl p-8 flex flex-col items-center gap-6"
        >
          {result.error ? (
            <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-xl px-6 py-4 text-center">
              <p className="text-lg font-bold mb-1">⚠️ Video Forensic Unavailable</p>
              <p className="text-sm">{result.error}</p>
            </div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: [0.7, 1.05, 1] }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className={`inline-flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black text-xl uppercase tracking-wider border-2 shadow-sm ${isManipulated
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : result.verdict === 'LIKELY REAL'
                      ? 'bg-green-100 border-green-300 text-green-700'
                      : 'bg-yellow-100 border-yellow-300 text-yellow-800'
                  }`}
              >
                <span className="text-3xl">
                  {isManipulated ? '🚨' : result.verdict === 'LIKELY REAL' ? '✅' : '⚠️'}
                </span>
                {result.verdict || (isManipulated ? 'LIKELY MANIPULATED' : 'LIKELY AUTHENTIC')}
              </motion.div>

              {/* Confidence Ring */}
              <ConfidenceRing value={result.confidence} isFake={isManipulated} />

              {/* Video stats line */}
              {result.totalFramesAnalyzed != null && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="bg-[#FBE8CE] border border-[#C3CC9B] px-5 py-2.5 rounded-xl text-sm font-bold text-[#232B1B] text-center shadow-sm"
                >
                  <span>{result.deepfakeFrames} of {result.totalFramesAnalyzed} frames flagged</span>
                  <span className="mx-2 text-[#C3CC9B]">•</span>
                  <span className={isManipulated ? 'text-red-700 font-black' : 'text-emerald-700 font-black'}>
                    {result.deepfakePercentage}% manipulation detected
                  </span>
                </motion.div>
              )}

              {/* Analyzed By subtitle */}
              <p className="text-xs text-[#5C6650] font-semibold uppercase tracking-wider">
                Forensic Engines: {result.analyzedBy && result.analyzedBy.length > 0
                  ? result.analyzedBy.join(' + ')
                  : 'Hugging Face Video Frame Detector + Gemini Vision AI'}
              </p>
            </>
          )}
        </motion.div>

        {!result.error && (
          <>
            {/* 2. Detection Reasoning Card */}
            {result.detectionReason && (
              <motion.div
                variants={cardVariants}
                className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl shadow-xl p-6"
              >
                <h3 className="text-lg font-bold text-[#232B1B] mb-3 flex items-center gap-2">
                  <span>🔬</span> Forensic Assessment
                </h3>
                <p className="text-sm text-[#5C6650] leading-relaxed mb-4 font-medium">
                  {result.detectionReason}
                </p>
                {result.manipulationTechnique && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-[#232B1B] text-[#FBE8CE]">
                    Identified Pattern: {result.manipulationTechnique}
                  </span>
                )}
              </motion.div>
            )}

            {/* 3. Frame Analysis Distribution Bar */}
            {result.totalFramesAnalyzed != null && (
              <FrameAnalysisBar
                deepfakeFrames={result.deepfakeFrames || 0}
                totalFrames={result.totalFramesAnalyzed || 0}
              />
            )}

            {/* 4. Two Column Evidence Section */}
            {((result.suspiciousAreas && result.suspiciousAreas.length > 0) ||
              (result.authenticAreas && result.authenticAreas.length > 0)) && (
                <motion.div variants={cardVariants} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Suspicious Areas */}
                  <div className="bg-red-50/50 border border-red-200 rounded-2xl p-6 space-y-4">
                    <h4 className="text-base font-bold text-red-900 flex items-center gap-2">
                      <span>⚠️</span> Flagged Frame Anomalies
                    </h4>
                    <div className="space-y-3">
                      {result.suspiciousAreas && result.suspiciousAreas.length > 0 ? (
                        result.suspiciousAreas.map((item, idx) => (
                          <div key={idx} className="bg-white/80 border border-red-100 rounded-xl p-4 flex items-start gap-2.5 shadow-sm text-xs text-red-950 font-medium leading-relaxed">
                            <span className="text-sm shrink-0">⚠️</span>
                            <p>{item}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-red-700 italic">No suspicious visual anomalies detected.</p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Authentic Areas */}
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-6 space-y-4">
                    <h4 className="text-base font-bold text-emerald-900 flex items-center gap-2">
                      <span>✅</span> Natural Temporal Markers
                    </h4>
                    <div className="space-y-3">
                      {result.authenticAreas && result.authenticAreas.length > 0 ? (
                        result.authenticAreas.map((item, idx) => (
                          <div key={idx} className="bg-white/80 border border-emerald-100 rounded-xl p-4 flex items-start gap-2.5 shadow-sm text-xs text-emerald-950 font-medium leading-relaxed">
                            <span className="text-sm shrink-0">✅</span>
                            <p>{item}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-emerald-700 italic">No authentic reference markers isolated.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

            {/* 5. Confidence Explanation Card */}
            {result.confidenceExplanation && (
              <motion.div
                variants={cardVariants}
                className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl shadow-xl p-6"
              >
                <h3 className="text-lg font-bold text-[#232B1B] mb-2 flex items-center gap-2">
                  <span>📊</span> Confidence Metrics
                </h3>
                <p className="text-sm text-[#5C6650] leading-relaxed">
                  {result.confidenceExplanation}
                </p>
              </motion.div>
            )}

            {/* 6. Actionable Recommendation Card */}
            {result.recommendation && (
              <motion.div
                variants={cardVariants}
                className="bg-blue-50/50 border border-blue-200 rounded-2xl p-6 space-y-4 shadow-xl"
              >
                <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                  <span>💡</span> Recommended Action
                </h3>
                <p className="text-sm text-blue-950 leading-relaxed font-medium">
                  {result.recommendation}
                </p>
                {isManipulated && (
                  <div className="bg-red-100 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center gap-2 mt-2">
                    <span>🚨</span> Warning: High likelihood of synthetic manipulation. Avoid resharing.
                  </div>
                )}
              </motion.div>
            )}

            {/* Action Bar */}
            <motion.div variants={cardVariants} className="flex justify-center pt-2">
              <button
                type="button"
                onClick={clearVideo}
                className="btn-primary px-8 py-3 rounded-xl text-sm font-black text-[#FBE8CE] cursor-pointer shadow-md"
              >
                Analyze Another Video
              </button>
            </motion.div>

            {/* Disclaimer */}
            <motion.p
              variants={cardVariants}
              className="text-xs text-[#5C6650]/60 text-center max-w-sm mx-auto italic mt-4"
            >
              ⚖️ Neural frame analysis provides probabilistic verification based on trained ML models.
            </motion.p>
          </>
        )}
      </motion.div>
    );
  }

  /* ═════════════════════════ RENDER ═════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#FBE8CE] text-[#232B1B] font-sans">
      {/* ── Top bar ── */}
      <div className="flex flex-col border-b border-[#C3CC9B] px-6 py-4 bg-[#FBE8CE]/85 backdrop-blur-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/')}>
            <img src="/SatyaScan_logo_transparent.png" alt="SatyaScan Logo" className="h-10 w-auto object-contain" />
            <span className="font-bold text-base tracking-tight">
              <span className="text-[#232B1B]">Satya</span><span className="text-[#5C6650] font-medium">Scan</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-5 text-sm text-[#5C6650]">
            <button onClick={() => navigate('/analyze')} className="hover:text-[#232B1B] transition-colors bg-transparent border-none outline-none cursor-pointer font-semibold">
              Analyze
            </button>
            <button onClick={() => navigate('/history')} className="hover:text-[#232B1B] transition-colors bg-transparent border-none outline-none cursor-pointer font-semibold">
              History
            </button>
            <button onClick={() => navigate('/')} className="hover:text-[#232B1B] transition-colors font-medium text-[#232B1B] bg-transparent border-none outline-none cursor-pointer">
              Dashboard
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-[#5C6650] hover:text-[#232B1B] p-2 bg-transparent border-none outline-none cursor-pointer"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-[#C3CC9B]/50 space-y-4">
            <button onClick={() => { navigate('/analyze'); setMenuOpen(false); }}
              className="block text-[#5C6650] hover:text-[#232B1B] py-1.5 transition-colors font-semibold bg-transparent border-none outline-none text-left w-full cursor-pointer">
              Analyze
            </button>
            <button onClick={() => { navigate('/history'); setMenuOpen(false); }}
              className="block text-[#5C6650] hover:text-[#232B1B] py-1.5 transition-colors font-semibold bg-transparent border-none outline-none text-left w-full cursor-pointer">
              History
            </button>
            <button onClick={() => { navigate('/'); setMenuOpen(false); }}
              className="block text-[#232B1B] hover:text-[#232B1B] py-1.5 transition-colors font-semibold bg-transparent border-none outline-none text-left w-full cursor-pointer">
              Dashboard
            </button>
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="max-w-3xl mx-auto px-6 pt-14 pb-20">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E4DFB5] border border-[#C3CC9B] text-[#5C6650] text-xs font-bold uppercase tracking-wider mb-3">
            <span>🎬</span> Temporal Keyframe Forensics
          </div>
          <h1 className="text-4xl font-extrabold mb-2 text-[#232B1B]">
            Video{' '}
            <span style={{
              background: 'linear-gradient(135deg, #768E56 0%, #232B1B 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Analysis
            </span>
          </h1>
          <p className="text-[#5C6650] text-sm mb-8 max-w-xl leading-relaxed">
            Upload digital video content to detect synthetic generation, face manipulations, and frame-level anomalies across temporal sequences.
          </p>
        </motion.div>

        {/* ── Video Upload Card / Loading / Results ── */}
        {!vidResult ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl overflow-hidden shadow-xl"
            >
              <div className="p-6 space-y-5">
                {/* Drag & Drop Zone */}
                <div
                  onDrop={handleVidDrop}
                  onDragOver={(e) => { e.preventDefault(); setVidDragOver(true); }}
                  onDragLeave={() => setVidDragOver(false)}
                  onClick={() => !vidPreview && vidRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl transition-all duration-200 ${vidPreview ? 'border-[#C3CC9B] bg-[#FBE8CE]/60' : 'cursor-pointer'
                    } ${vidDragOver
                      ? 'border-[#232B1B] bg-[#FBE8CE] scale-[1.01]'
                      : !vidPreview ? 'border-[#C3CC9B] bg-[#FBE8CE]/60 hover:border-[#5C6650] hover:bg-[#FBE8CE]' : ''
                    }`}
                  style={{ minHeight: vidPreview ? 'auto' : '220px' }}
                >
                  <input
                    ref={vidRef}
                    type="file"
                    accept=".mp4,.webm,.mov,.avi,.mkv"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) processVideo(f); }}
                    className="hidden"
                  />

                  <AnimatePresence mode="wait">
                    {vidPreview ? (
                      <motion.div
                        key="vid-preview"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-4"
                      >
                        <div className="relative rounded-lg overflow-hidden bg-[#232B1B]/5 flex items-center justify-center"
                          style={{ maxHeight: '340px' }}>
                          <video
                            src={vidPreview}
                            controls
                            className="max-w-full max-h-[320px] rounded-lg shadow-sm"
                            style={{ background: '#1a1a1a' }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-3 px-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl">🎬</span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-[#232B1B] truncate max-w-[280px]">
                                {vidFile?.name}
                              </p>
                              <p className="text-xs text-[#5C6650] font-medium">
                                {vidFile && formatBytes(vidFile.size)}
                                <span className="ml-2 text-[#5C6650]/80 font-bold">• 60s sampling window</span>
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); clearVideo(); }}
                            className="text-xs text-red-700 hover:text-red-900 font-bold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors border border-red-200 cursor-pointer"
                          >
                            ✕ Remove Video
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="vid-empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center justify-center py-14 px-4 text-center"
                      >
                        <div className="w-16 h-16 rounded-2xl bg-[#232B1B]/5 flex items-center justify-center mb-4 text-[#5C6650]">
                          <svg className="w-8 h-8 text-[#5C6650]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-base font-extrabold text-[#232B1B] mb-1">
                          Drag & drop a video file to analyze
                        </p>
                        <p className="text-xs text-[#5C6650] font-medium">
                          or click to browse · MP4, WebM, MOV, AVI, MKV · Up to 50 MB
                        </p>
                        <p className="text-[11px] text-[#5C6650]/70 mt-2 font-semibold">
                          Automated keyframe sampling extracts frames every 2 seconds for neural inspection
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Size warning */}
                {vidSizeWarn && !vidError && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-4 py-3 text-xs flex items-center gap-2 font-bold">
                    <span>⚠️</span> This video is close to the 50 MB limit. Frame extraction may take longer.
                  </motion.div>
                )}

                {/* Error */}
                {vidError && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2 font-medium">
                    <span>⚠️</span> {vidError}
                  </motion.div>
                )}

                {/* Analyze button */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 text-xs text-[#5C6650]/80">
                    <ShieldLogo size={18} />
                    <span className="font-bold">Neural Video Engine v2</span>
                  </div>
                  <motion.button
                    type="button"
                    onClick={handleAnalyzeVideo}
                    disabled={vidLoading || !vidFile}
                    whileHover={!vidLoading && vidFile ? { scale: 1.02, backgroundColor: '#343F29' } : {}}
                    whileTap={!vidLoading && vidFile ? { scale: 0.97 } : {}}
                    className={`font-black px-8 py-3.5 text-sm uppercase tracking-wider rounded-xl transition-all shadow-md shadow-[#232B1B]/10 border-none cursor-pointer ${vidLoading || !vidFile
                        ? 'bg-[#5C6650]/30 text-[#5C6650]/50 cursor-not-allowed'
                        : 'bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE]'
                      }`}
                  >
                    {vidLoading ? (
                      <span className="flex items-center gap-2">
                        <Spinner />
                        Analyzing Video…
                      </span>
                    ) : (
                      <><span>🎬</span> Analyze Video</>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>

            {/* Video progress stages */}
            <AnimatePresence>
              {vidLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-8"
                >
                  <VideoProgressStages stage={vidStage} />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          /* Video Results */
          <AnimatePresence>
            <ResultCards result={vidResult} />
          </AnimatePresence>
        )}

        {/* Status bar */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-6 mt-6 text-xs text-[#5C6650]/60"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9AB17A]" />
            Video analysis pipeline operational
          </span>
          <span>Powered by OpenCV + HuggingFace + Gemini Vision AI</span>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#C3CC9B] bg-[#E4DFB5] px-8 py-5 flex items-center justify-between">
        <div>
          <p className="font-bold text-sm text-[#232B1B]">Satya<span className="text-[#5C6650] font-medium">Scan AI</span></p>
          <p className="text-[#5C6650] text-xs">© 2025 SatyaScan AI. All rights reserved.</p>
        </div>
        <div className="flex gap-5 text-xs text-[#5C6650]">
          {['About', 'Features', 'GitHub', 'Contact'].map((l) => (
            <a key={l} href="#" className="hover:text-[#232B1B] transition-colors">{l}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
