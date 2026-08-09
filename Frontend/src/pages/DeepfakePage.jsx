import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import client from '../api/client';

/* ── Constants ─────────────────────────────────────────────────────────────── */
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const VIDEO_MAX = 50 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          {hasConfidence ? 'Confidence' : 'No HF Score'}
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
        <linearGradient id="sgDeepfake" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#232B1B" />
          <stop offset="100%" stopColor="#5C6650" />
        </linearGradient>
      </defs>
      <path d="M50 6 L88 22 L88 54 C88 72 70 88 50 95 C30 88 12 72 12 54 L12 22 Z"
        fill="url(#sgDeepfake)" opacity="0.08" stroke="url(#sgDeepfake)" strokeWidth="2.5" />
      <text x="50" y="66" textAnchor="middle" fontSize="44" fontWeight="800"
        fontFamily="Inter,Arial,sans-serif" fill="url(#sgDeepfake)">S</text>
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
    { key: 1, icon: '📤', text: 'Uploading video…' },
    { key: 2, icon: '🎞️', text: 'Extracting frames every 2 seconds…' },
    { key: 3, icon: '🔬', text: 'Analyzing each frame for manipulation…' },
    { key: 4, icon: '⚖️', text: 'Calculating final verdict…' },
  ];

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Big spinner */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-[#C3CC9B] rounded-full" />
        <div className="absolute inset-0 border-4 border-transparent border-t-[#232B1B] rounded-full animate-spin" />
      </div>

      {/* Stages */}
      <div className="w-full max-w-sm space-y-3">
        {stages.map((s) => (
          <AnimatePresence key={s.key}>
            {stage >= s.key && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: stage === s.key ? 1 : 0.45, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-3"
              >
                <span className="text-lg">{s.icon}</span>
                <span className={`text-sm font-semibold ${stage === s.key ? 'text-[#232B1B] animate-pulse' : 'text-[#5C6650]/50'}`}>
                  {s.text}
                </span>
                {stage > s.key && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="ml-auto text-green-600 text-sm font-bold"
                  >
                    ✓
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
          className="w-full max-w-sm"
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

      <p className="text-xs text-[#5C6650]/60">This may take up to 2 minutes for longer videos</p>
    </div>
  );
}

/* ── Frame Analysis Bar ────────────────────────────────────────────────────── */
function FrameAnalysisBar({ deepfakeFrames, totalFrames }) {
  const cleanFrames = totalFrames - deepfakeFrames;
  const deepfakePercent = totalFrames > 0 ? Math.round((deepfakeFrames / totalFrames) * 100) : 0;
  const cleanPercent = 100 - deepfakePercent;

  return (
    <motion.div
      variants={cardVariants}
      className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl shadow-xl p-6"
    >
      <h3 className="text-lg font-bold text-[#232B1B] mb-4 flex items-center gap-2">
        <span>🎬</span> Frame Analysis Summary
      </h3>

      {/* Horizontal bar */}
      <div className="h-6 rounded-full overflow-hidden flex bg-[#C3CC9B]/30 mb-4">
        {deepfakePercent > 0 && (
          <motion.div
            className="h-full bg-red-500 flex items-center justify-center"
            initial={{ width: 0 }}
            animate={{ width: `${deepfakePercent}%` }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            {deepfakePercent >= 15 && (
              <span className="text-white text-xs font-bold">{deepfakePercent}%</span>
            )}
          </motion.div>
        )}
        {cleanPercent > 0 && (
          <motion.div
            className="h-full bg-green-500 flex items-center justify-center"
            initial={{ width: 0 }}
            animate={{ width: `${cleanPercent}%` }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            {cleanPercent >= 15 && (
              <span className="text-white text-xs font-bold">{cleanPercent}%</span>
            )}
          </motion.div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-red-800 font-semibold">
            {deepfakeFrames} frame{deepfakeFrames !== 1 ? 's' : ''} showed manipulation signs
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-green-800 font-semibold">
            {cleanFrames} frame{cleanFrames !== 1 ? 's' : ''} appeared authentic
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════════ */
export default function DeepfakePage() {
  const navigate = useNavigate();
  const location = useLocation();

  /* ── Shared state ── */
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'image'); // 'image' | 'video'
  const [menuOpen, setMenuOpen] = useState(false);

  /* ── Image state ── */
  const imgRef = useRef(null);
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgDragOver, setImgDragOver] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState('');
  const [imgResult, setImgResult] = useState(null);

  /* ── Video state ── */
  const vidRef = useRef(null);
  const [vidFile, setVidFile] = useState(null);
  const [vidPreview, setVidPreview] = useState(null);
  const [vidDragOver, setVidDragOver] = useState(false);
  const [vidLoading, setVidLoading] = useState(false);
  const [vidStage, setVidStage] = useState(0);
  const [vidError, setVidError] = useState('');
  const [vidResult, setVidResult] = useState(null);
  const [vidSizeWarn, setVidSizeWarn] = useState(false);

  /* ═════════════════════════ IMAGE HANDLERS ═════════════════════════════════ */
  const processImage = useCallback((f) => {
    setImgError('');
    setImgResult(null);
    if (!IMAGE_TYPES.includes(f.type)) {
      setImgError('Invalid file type. Only JPG, PNG, and WEBP images are accepted.');
      return;
    }
    if (f.size > IMAGE_MAX) {
      setImgError('File too large. Maximum size is 10 MB.');
      return;
    }
    setImgFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setImgPreview(e.target.result);
    reader.readAsDataURL(f);
  }, []);

  const handleImgDrop = useCallback((e) => {
    e.preventDefault();
    setImgDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) processImage(f);
  }, [processImage]);

  const clearImage = () => {
    setImgFile(null);
    setImgPreview(null);
    setImgResult(null);
    setImgError('');
    if (imgRef.current) imgRef.current.value = '';
  };

  const handleAnalyzeImage = async () => {
    if (!imgFile) return setImgError('Please upload an image first.');
    setImgLoading(true);
    setImgError('');
    setImgResult(null);
    try {
      const form = new FormData();
      form.append('image', imgFile);
      const res = await client.post('/deepfake/image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setImgResult(res.data);
    } catch (err) {
      setImgError(err.response?.data?.error || err.message || 'Analysis failed. Please try again.');
    } finally {
      setImgLoading(false);
    }
  };

  /* ═════════════════════════ VIDEO HANDLERS ═════════════════════════════════ */
  const processVideo = useCallback((f) => {
    setVidError('');
    setVidResult(null);
    setVidSizeWarn(false);
    if (!VIDEO_TYPES.includes(f.type)) {
      setVidError('Invalid file type. Only MP4, WebM, and MOV videos are accepted.');
      return;
    }
    if (f.size > VIDEO_MAX) {
      setVidSizeWarn(true);
      setVidError('File too large. Maximum size is 50 MB.');
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
    if (!vidFile) return setVidError('Please upload a video first.');
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
      setVidResult(res.data);
    } catch (err) {
      if (err.response?.status === 408) {
        setVidError('Analysis timed out. Please try a shorter or smaller video.');
      } else {
        setVidError(err.response?.data?.error || err.message || 'Video analysis failed. Please try again.');
      }
    } finally {
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      clearTimeout(stageTimer4);
      setVidLoading(false);
      setVidStage(0);
    }
  };

  /* ═════════════════════════ SHARED RESULTS RENDERER ════════════════════════ */
  function ResultCards({ result, mediaType }) {
    if (!result) return null;

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
              <p className="text-lg font-bold mb-1">⚠️ Detection Unavailable</p>
              <p className="text-sm">{result.error}</p>
            </div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: [0.7, 1.08, 1] }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className={`inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-xl uppercase tracking-wider border-2 ${
                  result.verdict === 'LIKELY DEEPFAKE'
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : result.verdict === 'LIKELY REAL'
                    ? 'bg-green-100 border-green-300 text-green-700'
                    : 'bg-yellow-100 border-yellow-300 text-yellow-700'
                }`}
              >
                <span className="text-3xl">
                  {result.verdict === 'LIKELY DEEPFAKE' ? '🚨' : result.verdict === 'LIKELY REAL' ? '✅' : '⚠️'}
                </span>
                {result.verdict || (result.isDeepfake ? 'LIKELY DEEPFAKE' : 'LIKELY REAL')}
              </motion.div>

              {/* Confidence Ring */}
              <ConfidenceRing value={result.confidence} isFake={result.isDeepfake} />

              {/* Video stats line */}
              {mediaType === 'video' && result.totalFramesAnalyzed != null && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-sm font-semibold text-[#232B1B] text-center"
                >
                  {result.deepfakeFrames} out of {result.totalFramesAnalyzed} frames flagged •{' '}
                  {result.deepfakePercentage}% manipulated
                </motion.p>
              )}

              {/* Analyzed By subtitle */}
              <p className="text-xs text-[#5C6650] font-semibold uppercase tracking-wider mt-2">
                Analyzed by: {result.analyzedBy && result.analyzedBy.length > 0
                  ? result.analyzedBy.join(' + ')
                  : 'Hugging Face + Gemini Vision AI'}
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
                <h3 className="text-lg font-bold text-[#232B1B] mb-3">Why we flagged this</h3>
                <p className="text-sm text-[#5C6650] leading-relaxed mb-4">
                  {result.detectionReason}
                </p>
                {result.manipulationTechnique && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-[#232B1B] text-[#FBE8CE]">
                    Technique: {result.manipulationTechnique}
                  </span>
                )}
              </motion.div>
            )}

            {/* 3. Frame Analysis Bar (video only) */}
            {mediaType === 'video' && result.totalFramesAnalyzed != null && (
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
                <div className="bg-red-50/40 border border-red-200/50 rounded-2xl p-6 space-y-4">
                  <h4 className="text-base font-bold text-red-900 flex items-center gap-2">
                    <span>⚠️</span> Suspicious Areas Found
                  </h4>
                  <div className="space-y-3">
                    {result.suspiciousAreas && result.suspiciousAreas.length > 0 ? (
                      result.suspiciousAreas.map((item, idx) => (
                        <div key={idx} className="bg-white/60 border border-red-100 rounded-xl p-4 flex items-start gap-2.5 shadow-sm text-sm text-red-950">
                          <span className="text-base shrink-0">⚠️</span>
                          <p className="leading-relaxed">{item}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-red-700 italic">No suspicious areas detected.</p>
                    )}
                  </div>
                </div>

                {/* Right Column: Authentic Areas */}
                <div className="bg-green-50/40 border border-green-200/50 rounded-2xl p-6 space-y-4">
                  <h4 className="text-base font-bold text-green-900 flex items-center gap-2">
                    <span>✅</span> Authentic Areas
                  </h4>
                  <div className="space-y-3">
                    {result.authenticAreas && result.authenticAreas.length > 0 ? (
                      result.authenticAreas.map((item, idx) => (
                        <div key={idx} className="bg-white/60 border border-green-100 rounded-xl p-4 flex items-start gap-2.5 shadow-sm text-sm text-green-950">
                          <span className="text-base shrink-0">✅</span>
                          <p className="leading-relaxed">{item}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-green-700 italic">No authentic areas identified.</p>
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
                <h3 className="text-lg font-bold text-[#232B1B] mb-2">Our Confidence</h3>
                <p className="text-sm text-[#5C6650] leading-relaxed">
                  {result.confidenceExplanation}
                </p>
              </motion.div>
            )}

            {/* 6. Recommendation Card */}
            {result.recommendation && (
              <motion.div
                variants={cardVariants}
                className="bg-blue-50/40 border border-blue-200/50 rounded-2xl p-6 space-y-4 shadow-xl"
              >
                <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                  <span>💡</span> What should you do?
                </h3>
                <p className="text-sm text-blue-950 leading-relaxed">
                  {result.recommendation}
                </p>
                {result.isDeepfake && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center gap-2 mt-2">
                    <span>🚨</span> Do not share this {mediaType} without verification
                  </div>
                )}
              </motion.div>
            )}

            {/* Disclaimer */}
            <motion.p
              variants={cardVariants}
              className="text-xs text-[#5C6650]/60 text-center max-w-sm mx-auto italic mt-4"
            >
              ⚖️ This is an AI estimate, not a forensic conclusion. Results should be interpreted with caution.
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
          <h1 className="text-4xl font-extrabold mb-2 text-[#232B1B]">
            Deepfake{' '}
            <span style={{
              background: 'linear-gradient(135deg, #768E56 0%, #232B1B 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Detection
            </span>
          </h1>
          <p className="text-[#5C6650] text-sm mb-8 max-w-xl">
            Upload an image or video to analyze it for signs of AI generation or digital manipulation using neural forensic detection.
          </p>
        </motion.div>

        {/* ── Tab Switcher ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex mb-8 bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl p-1.5 shadow-md"
        >
          {[
            { key: 'image', icon: '🖼️', label: 'Image' },
            { key: 'video', icon: '🎬', label: 'Video', badge: 'Multi-Frame AI' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 border-none cursor-pointer ${
                activeTab === tab.key
                  ? 'bg-[#232B1B] text-[#FBE8CE] shadow-lg shadow-[#232B1B]/20'
                  : 'bg-transparent text-[#5C6650] hover:text-[#232B1B] hover:bg-[#FBE8CE]/60'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
              {tab.badge && (
                <span className={`ml-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-normal normal-case transition-colors ${
                  activeTab === 'video'
                    ? 'bg-[#9AB17A] text-[#232B1B]'
                    : 'bg-[#232B1B]/15 text-[#232B1B]'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </motion.div>

        {/* ═══════════════════════ IMAGE TAB ═══════════════════════════════════ */}
        <AnimatePresence mode="wait">
          {activeTab === 'image' && (
            <motion.div
              key="image-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl overflow-hidden shadow-xl"
              >
                <div className="p-6 space-y-5">
                  {/* Drag & Drop Zone */}
                  <div
                    onDrop={handleImgDrop}
                    onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                    onDragLeave={() => setImgDragOver(false)}
                    onClick={() => imgRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
                      imgDragOver
                        ? 'border-[#232B1B] bg-[#FBE8CE] scale-[1.01]'
                        : 'border-[#C3CC9B] bg-[#FBE8CE]/60 hover:border-[#5C6650] hover:bg-[#FBE8CE]'
                    }`}
                    style={{ minHeight: imgPreview ? 'auto' : '220px' }}
                  >
                    <input
                      ref={imgRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) processImage(f); }}
                      className="hidden"
                    />

                    <AnimatePresence mode="wait">
                      {imgPreview ? (
                        <motion.div
                          key="preview"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="p-4"
                        >
                          <div className="relative rounded-lg overflow-hidden bg-[#232B1B]/5 flex items-center justify-center"
                            style={{ maxHeight: '340px' }}>
                            <img
                              src={imgPreview}
                              alt="Upload preview"
                              className="max-w-full max-h-[320px] object-contain rounded-lg"
                            />
                          </div>
                          <div className="flex items-center justify-between mt-3 px-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-lg">🖼️</span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#232B1B] truncate max-w-[260px]">
                                  {imgFile?.name}
                                </p>
                                <p className="text-xs text-[#5C6650]">{imgFile && formatBytes(imgFile.size)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); clearImage(); }}
                              className="text-xs text-red-700 hover:text-red-900 font-semibold bg-transparent border-none cursor-pointer"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center py-14 px-4 text-center"
                        >
                          <div className="w-16 h-16 rounded-2xl bg-[#232B1B]/5 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-[#5C6650]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-sm font-semibold text-[#232B1B] mb-1">
                            Drag & drop an image here
                          </p>
                          <p className="text-xs text-[#5C6650]">
                            or click to browse · JPG, PNG, WEBP · Max 10 MB
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Error */}
                  {imgError && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2 font-medium">
                      <span>⚠️</span> {imgError}
                    </motion.div>
                  )}

                  {/* Analyze button */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 text-xs text-[#5C6650]/80">
                      <ShieldLogo size={18} />
                      <span className="font-semibold">Deepfake Detector v1</span>
                    </div>
                    <motion.button
                      type="button"
                      onClick={handleAnalyzeImage}
                      disabled={imgLoading || !imgFile}
                      whileHover={!imgLoading && imgFile ? { scale: 1.02, backgroundColor: '#343F29' } : {}}
                      whileTap={!imgLoading && imgFile ? { scale: 0.97 } : {}}
                      className={`font-bold px-8 py-3 text-sm uppercase tracking-wider rounded-xl transition-all shadow-md shadow-[#232B1B]/10 border-none cursor-pointer ${
                        imgLoading || !imgFile
                          ? 'bg-[#5C6650]/30 text-[#5C6650]/50 cursor-not-allowed'
                          : 'bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE]'
                      }`}
                    >
                      {imgLoading ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Analyzing…
                        </span>
                      ) : (
                        <><span>🔬</span> Analyze Image</>
                      )}
                    </motion.button>
                  </div>
                </div>
              </motion.div>

              {/* Loading overlay */}
              <AnimatePresence>
                {imgLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-8 flex flex-col items-center gap-4 py-10"
                  >
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 border-4 border-[#C3CC9B] rounded-full" />
                      <div className="absolute inset-0 border-4 border-transparent border-t-[#232B1B] rounded-full animate-spin" />
                    </div>
                    <p className="text-sm font-semibold text-[#5C6650] animate-pulse">
                      Analyzing for manipulation…
                    </p>
                    <p className="text-xs text-[#5C6650]/60">This may take up to 30 seconds</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Image Results */}
              <AnimatePresence>
                {imgResult && !imgLoading && (
                  <ResultCards result={imgResult} mediaType="image" />
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ═══════════════════════ VIDEO TAB ═════════════════════════════════ */}
          {activeTab === 'video' && (
            <motion.div
              key="video-tab"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl overflow-hidden shadow-xl"
              >
                <div className="p-6 space-y-5">
                  {/* Drag & Drop Zone */}
                  <div
                    onDrop={handleVidDrop}
                    onDragOver={(e) => { e.preventDefault(); setVidDragOver(true); }}
                    onDragLeave={() => setVidDragOver(false)}
                    onClick={() => !vidPreview && vidRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl transition-all duration-200 ${
                      vidPreview ? 'border-[#C3CC9B] bg-[#FBE8CE]/60' : 'cursor-pointer'
                    } ${
                      vidDragOver
                        ? 'border-[#232B1B] bg-[#FBE8CE] scale-[1.01]'
                        : !vidPreview ? 'border-[#C3CC9B] bg-[#FBE8CE]/60 hover:border-[#5C6650] hover:bg-[#FBE8CE]' : ''
                    }`}
                    style={{ minHeight: vidPreview ? 'auto' : '220px' }}
                  >
                    <input
                      ref={vidRef}
                      type="file"
                      accept=".mp4,.webm,.mov"
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
                              className="max-w-full max-h-[320px] rounded-lg"
                              style={{ background: '#1a1a1a' }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-3 px-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-lg">🎬</span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#232B1B] truncate max-w-[260px]">
                                  {vidFile?.name}
                                </p>
                                <p className="text-xs text-[#5C6650]">
                                  {vidFile && formatBytes(vidFile.size)}
                                  <span className="ml-2 text-[#5C6650]/60">• Max 60 seconds will be analyzed</span>
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); clearVideo(); }}
                              className="text-xs text-red-700 hover:text-red-900 font-semibold bg-transparent border-none cursor-pointer"
                            >
                              ✕ Remove
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
                          <div className="w-16 h-16 rounded-2xl bg-[#232B1B]/5 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-[#5C6650]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-sm font-semibold text-[#232B1B] mb-1">
                            Drag & drop a video here
                          </p>
                          <p className="text-xs text-[#5C6650]">
                            or click to browse · MP4, WebM, MOV · Max 50 MB
                          </p>
                          <p className="text-xs text-[#5C6650]/60 mt-1">
                            Max 60 seconds of video will be analyzed
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Size warning */}
                  {vidSizeWarn && !vidError && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2 font-medium">
                      <span>⚠️</span> This video is close to the 50 MB limit. Upload may take longer.
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
                      <span className="font-semibold">Video Deepfake Detector</span>
                    </div>
                    <motion.button
                      type="button"
                      onClick={handleAnalyzeVideo}
                      disabled={vidLoading || !vidFile}
                      whileHover={!vidLoading && vidFile ? { scale: 1.02, backgroundColor: '#343F29' } : {}}
                      whileTap={!vidLoading && vidFile ? { scale: 0.97 } : {}}
                      className={`font-bold px-8 py-3 text-sm uppercase tracking-wider rounded-xl transition-all shadow-md shadow-[#232B1B]/10 border-none cursor-pointer ${
                        vidLoading || !vidFile
                          ? 'bg-[#5C6650]/30 text-[#5C6650]/50 cursor-not-allowed'
                          : 'bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE]'
                      }`}
                    >
                      {vidLoading ? (
                        <span className="flex items-center gap-2">
                          <Spinner />
                          Analyzing…
                        </span>
                      ) : (
                        <><span>🔬</span> Analyze Video</>
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

              {/* Video Results */}
              <AnimatePresence>
                {vidResult && !vidLoading && (
                  <ResultCards result={vidResult} mediaType="video" />
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status bar */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-6 mt-6 text-xs text-[#5C6650]/60"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9AB17A]" />
            All nodes operational
          </span>
          <span>Powered by HuggingFace & Gemini Vision</span>
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
