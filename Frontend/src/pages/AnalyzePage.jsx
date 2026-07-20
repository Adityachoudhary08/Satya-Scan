import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeText, analyzeUrl, analyzeImage } from '../api/api';
import LoadingState from '../components/LoadingState';
import LanguageSelector from '../components/LanguageSelector';
import { useLanguage, useTranslation } from '../context/LanguageContext';

const MAX_CHARS = 10000;

function useFakeProgress(active) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) { setStep(0); return; }
    const delays = [3000, 7000, 15000, 30000, 45000];
    const timers = delays.map((d, i) => setTimeout(() => setStep(i + 1), d));
    return () => timers.forEach(clearTimeout);
  }, [active]);
  return step;
}

// Inline shield SVG with warm-sage colors
function ShieldLogo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sgAnalyze" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#232B1B" />
          <stop offset="100%" stopColor="#5C6650" />
        </linearGradient>
      </defs>
      <path d="M50 6 L88 22 L88 54 C88 72 70 88 50 95 C30 88 12 72 12 54 L12 22 Z"
        fill="url(#sgAnalyze)" opacity="0.08" stroke="url(#sgAnalyze)" strokeWidth="2.5" />
      <text x="50" y="66" textAnchor="middle" fontSize="44" fontWeight="800"
        fontFamily="Inter,Arial,sans-serif" fill="url(#sgAnalyze)">S</text>
    </svg>
  );
}

export default function AnalyzePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedLanguage, setDetectedLanguage } = useLanguage();
  const { t } = useTranslation();

  const TABS = [
    { key: 'text', icon: '📝', label: t('analyze.tabs.text') },
    { key: 'url', icon: '🔗', label: t('analyze.tabs.url') },
    { key: 'image', icon: '🖼️', label: t('analyze.tabs.image') },
  ];

  const [tab, setTab] = useState('text');
  const [textInput, setTextInput] = useState(location.state?.prefill || '');
  const [urlInput, setUrlInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const progressStep = useFakeProgress(loading);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (tab === 'text' && !textInput.trim()) return setError(t('analyze.errors.noText'));
    if (tab === 'url' && !urlInput.trim()) return setError(t('analyze.errors.noUrl'));
    if (tab === 'image' && !imageFile) return setError(t('analyze.errors.noImage'));
    setLoading(true);
    try {
      let res;
      if (tab === 'text') res = await analyzeText(textInput, selectedLanguage);
      else if (tab === 'url') res = await analyzeUrl(urlInput, selectedLanguage);
      else res = await analyzeImage(imageFile, selectedLanguage);

      // Update detected language in context
      if (res.data?.detectedLanguage) {
        setDetectedLanguage(res.data.detectedLanguage);
      }

      navigate('/results', { state: { result: res.data } });
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('analyze.errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) return <LoadingState currentStep={progressStep} />;

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
            <LanguageSelector />
            <button onClick={() => navigate('/history')} className="hover:text-[#232B1B] transition-colors bg-transparent border-none outline-none cursor-pointer font-semibold">
              {t('nav.history')}
            </button>
            <button
              onClick={() => navigate('/')}
              className="hover:text-[#232B1B] transition-colors font-medium text-[#232B1B] border-b border-[#232B1B] pb-0.5 bg-transparent border-none outline-none cursor-pointer"
            >
              {t('nav.dashboard')}
            </button>
          </div>

          {/* Mobile hamburger button */}
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
            <div className="flex items-center justify-between py-1">
              <span className="text-xs font-bold text-[#5C6650] uppercase tracking-wider">{t('nav.language')}</span>
              <LanguageSelector />
            </div>
            <button
              onClick={() => {
                navigate('/history');
                setMenuOpen(false);
              }}
              className="block text-[#5C6650] hover:text-[#232B1B] py-1.5 transition-colors no-underline font-semibold bg-transparent border-none outline-none text-left w-full cursor-pointer"
            >
              {t('nav.history')}
            </button>
            <button
              onClick={() => {
                navigate('/');
                setMenuOpen(false);
              }}
              className="block text-[#232B1B] hover:text-[#232B1B] py-1.5 transition-colors no-underline font-semibold bg-transparent border-none outline-none text-left w-full cursor-pointer"
            >
              {t('nav.dashboard')}
            </button>
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="max-w-3xl mx-auto px-6 pt-14 pb-20">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-4xl font-extrabold mb-2 text-[#232B1B]">
            {t('analyze.title')}{' '}
            <span style={{
              background: 'linear-gradient(135deg, #768E56 0%, #232B1B 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              {t('analyze.titleAccent')}
            </span>
          </h1>
          <p className="text-[#5C6650] text-sm mb-10 max-w-xl">
            {t('analyze.subtitle')}
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl overflow-hidden shadow-xl"
        >
          {/* Tab bar */}
          <div className="flex border-b border-[#C3CC9B]">
            {TABS.map((tabItem) => (
              <button
                key={tabItem.key}
                onClick={() => { setTab(tabItem.key); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-semibold uppercase tracking-widest transition-all duration-200 border-b-2 -mb-px
                  ${tab === tabItem.key
                    ? 'border-[#232B1B] text-[#232B1B] bg-[#FBE8CE]/50'
                    : 'border-transparent text-[#5C6650]/50 hover:text-[#232B1B] hover:bg-[#FBE8CE]/20'}`}
              >
                <span>{tabItem.icon}</span> {tabItem.label}
              </button>
            ))}
          </div>

          {/* Input area */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <AnimatePresence mode="wait">
              {tab === 'text' && (
                <motion.div key="text" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>
                  <div className="relative">
                    <textarea
                      rows={9}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value.slice(0, MAX_CHARS))}
                      placeholder={t('analyze.textPlaceholder')}
                      className="w-full bg-[#FBE8CE] border border-[#C3CC9B] text-[#232B1B] rounded-xl px-5 py-4 focus:outline-none focus:border-[#5C6650] resize-none text-sm placeholder-[#5C6650]/40 transition-colors"
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-3 text-xs text-[#5C6650]/60">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#232B1B]/70 animate-pulse" />
                        {t('analyze.detectingLanguage')}
                      </span>
                      <span>{textInput.length} / {MAX_CHARS.toLocaleString()}</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {tab === 'url' && (
                <motion.div key="url" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5C6650]/50">🔗</span>
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder={t('analyze.urlPlaceholder')}
                      className="w-full bg-[#FBE8CE] border border-[#C3CC9B] text-[#232B1B] rounded-xl pl-10 pr-4 py-4 focus:outline-none focus:border-[#5C6650] text-sm placeholder-[#5C6650]/40 transition-colors"
                    />
                  </div>
                  <p className="text-[#5C6650]/60 text-xs mt-2 ml-1">{t('analyze.urlHint')}</p>
                </motion.div>
              )}

              {tab === 'image' && (
                <motion.div key="image" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200
                      ${imageFile ? 'border-[#9AB17A] bg-[#FBE8CE]/50' : 'border-[#C3CC9B] hover:border-[#9AB17A] hover:bg-[#FBE8CE]/30'}`}
                  >
                    {imageFile ? (
                      <div className="text-[#232B1B] text-sm">
                        <div className="text-3xl mb-2">✅</div>
                        <p className="font-bold">{imageFile.name}</p>
                        <p className="text-[#5C6650] text-xs mt-1">{(imageFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <div className="text-[#5C6650]">
                        <div className="text-4xl mb-3">🖼️</div>
                        <p className="text-[#232B1B] text-sm font-medium">{t('analyze.imageUpload')}</p>
                        <p className="text-[#5C6650]/70 text-xs mt-1">{t('analyze.imageHint')}</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => setImageFile(e.target.files[0] || null)} />
                  {imageFile && (
                    <button type="button" onClick={() => setImageFile(null)}
                      className="text-xs text-red-700 hover:underline mt-2 ml-1 font-medium">
                      {t('analyze.removeFile')}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2 font-medium">
                <span>⚠️</span> {error}
              </motion.div>
            )}

            {/* Footer row */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-6 text-xs text-[#5C6650]/80">
                <div>
                  <p className="uppercase tracking-wider mb-0.5 font-bold text-[10px]">{t('analyze.confidence')}</p>
                  <p className="text-[#232B1B] font-extrabold text-sm">24ms</p>
                </div>
                <div>
                  <p className="uppercase tracking-wider mb-0.5 font-bold text-[10px]">{t('analyze.modelVersion')}</p>
                  <p className="text-[#232B1B] font-semibold">Satya-Neo v4.2</p>
                </div>
              </div>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.02, backgroundColor: '#343F29' }}
                whileTap={{ scale: 0.97 }}
                className="bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-bold px-8 py-3 text-sm uppercase tracking-wider rounded-xl transition-all shadow-md shadow-[#232B1B]/10"
              >
                <span>⚡</span> {t('analyze.analyzeBtn')}
              </motion.button>
            </div>
          </form>
        </motion.div>

        {/* Status bar */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-6 mt-6 text-xs text-[#5C6650]/60"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9AB17A]" />
            {t('analyze.allOperational')}
          </span>
          <span>{t('analyze.updatedAgo')}</span>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#C3CC9B] bg-[#E4DFB5] px-8 py-5 flex items-center justify-between">
        <div>
          <p className="font-bold text-sm text-[#232B1B]">Satya<span className="text-[#5C6650] font-medium">Scan AI</span></p>
          <p className="text-[#5C6650] text-xs">{t('landing.footer.rights')}</p>
        </div>
        <div className="flex gap-5 text-xs text-[#5C6650]">
          {[t('landing.footer.about'), t('landing.footer.features'), t('landing.footer.github'), t('landing.footer.contact')].map((l) => (
            <a key={l} href="#" className="hover:text-[#232B1B] transition-colors">{l}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
