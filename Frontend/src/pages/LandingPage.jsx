import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useTranslation, useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

// ── Enhanced Animation variants ────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.4, 0, 0.2, 1] },
  }),
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: (i = 0) => ({
    opacity: 1,
    transition: { duration: 0.5, delay: i * 0.1 },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: (i = 0) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.5, delay: i * 0.12, ease: [0.4, 0, 0.2, 1] },
  }),
};

const springUp = {
  hidden: { opacity: 0, y: 60 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 15, delay: i * 0.12 },
  }),
};

// ── 3D Tilt Card component ─────────────────────────────────────────────────────
function TiltCard({ children, className = '', style = {} }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-6, 6]);
  const springRotateX = useSpring(rotateX, { stiffness: 200, damping: 20 });
  const springRotateY = useSpring(rotateY, { stiffness: 200, damping: 20 });

  const handleMouse = useCallback((e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [x, y]);

  const handleLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ ...style, rotateX: springRotateX, rotateY: springRotateY, transformStyle: 'preserve-3d' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Animated section wrapper ───────────────────────────────────────────────────
function AnimatedSection({ children, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div ref={ref} initial="hidden" animate={inView ? 'visible' : 'hidden'} className={className}>
      {children}
    </motion.div>
  );
}

// ── Shield Logo ────────────────────────────────────────────────────────────────
function ShieldLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="slgLanding" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#232B1B" />
          <stop offset="100%" stopColor="#5C6650" />
        </linearGradient>
      </defs>
      <path d="M50 6 L88 22 L88 54 C88 72 70 88 50 95 C30 88 12 72 12 54 L12 22 Z"
        fill="url(#slgLanding)" opacity="0.08" stroke="url(#slgLanding)" strokeWidth="2.5" />
      <text x="50" y="66" textAnchor="middle" fontSize="44" fontWeight="800"
        fontFamily="Inter,Arial,sans-serif" fill="url(#slgLanding)">S</text>
    </svg>
  );
}

const FEATURE_ICONS = ['🔍', '🤖', '✅', '🌐'];
const STEP_NUMS = ['01', '02', '03', '04'];

export default function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { uiLang, setUiLang, setSelectedLanguage } = useLanguage();
  const { isLoggedIn, logout } = useAuth();
  const [searchValue, setSearchValue] = useState('');
  const [navVisible, setNavVisible] = useState(true);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    let lastY = 0;
    const handler = ({ scroll }) => {
      const y = scroll;
      setNavScrolled(y > 50);
      setNavVisible(y < lastY || y < 60);
      lastY = y;
    };
    const lenis = window.__lenis;
    if (lenis) {
      lenis.on('scroll', handler);
      return () => lenis.off('scroll', handler);
    } else {
      const nativeHandler = () => handler({ scroll: window.scrollY });
      window.addEventListener('scroll', nativeHandler, { passive: true });
      return () => window.removeEventListener('scroll', nativeHandler);
    }
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    navigate('/analyze', { state: { prefill: searchValue } });
  };

  const goAnalyze = () => navigate('/analyze');

  const FEATURES = [
    { icon: FEATURE_ICONS[0], title: t('landing.features.f1Title'), desc: t('landing.features.f1Desc') },
    { icon: FEATURE_ICONS[1], title: t('landing.features.f2Title'), desc: t('landing.features.f2Desc') },
    { icon: FEATURE_ICONS[2], title: t('landing.features.f3Title'), desc: t('landing.features.f3Desc') },
    { icon: FEATURE_ICONS[3], title: t('landing.features.f4Title'), desc: t('landing.features.f4Desc') },
  ];

  const STEPS = [
    { step: STEP_NUMS[0], title: t('landing.steps.s1Title'), desc: t('landing.steps.s1Desc') },
    { step: STEP_NUMS[1], title: t('landing.steps.s2Title'), desc: t('landing.steps.s2Desc') },
    { step: STEP_NUMS[2], title: t('landing.steps.s3Title'), desc: t('landing.steps.s3Desc') },
    { step: STEP_NUMS[3], title: t('landing.steps.s4Title'), desc: t('landing.steps.s4Desc') },
  ];

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FBE8CE] text-[#232B1B] overflow-x-hidden font-sans">
      {/* ── Navbar ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 px-6 py-3.5"
        style={{
          transform: navVisible ? 'translateY(0)' : 'translateY(-110%)',
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease, backdrop-filter 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease',
          background: navScrolled || menuOpen
            ? 'rgba(251, 232, 206, 0.85)'
            : 'transparent',
          backdropFilter: navScrolled || menuOpen ? 'blur(24px) saturate(180%)' : 'none',
          WebkitBackdropFilter: navScrolled || menuOpen ? 'blur(24px) saturate(180%)' : 'none',
          borderBottom: navScrolled || menuOpen ? '1px solid #C3CC9B' : '1px solid transparent',
          boxShadow: navScrolled || menuOpen ? '0 4px 30px rgba(35, 43, 27, 0.03)' : 'none',
          willChange: 'transform',
        }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <span className="font-bold text-xl tracking-tight cursor-pointer flex items-center gap-2.5" onClick={() => navigate('/')}>
              <img src="/SatyaScan_logo_transparent.png" alt="SatyaScan Logo" className="h-10 w-auto object-contain" />
              <span><span className="text-[#232B1B]">Satya</span><span className="text-[#5C6650] font-medium">Scan</span></span>
            </span>
          </motion.div>

          {/* Desktop Nav */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}
            className="hidden md:flex items-center gap-3">

            {/* Search bar → goes to /analyze */}
            <form onSubmit={handleSearchSubmit} className="flex items-center">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6650] text-sm">🔍</span>
                <input
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onFocus={() => navigate('/analyze')}
                  type="text"
                  placeholder={t('landing.searchPlaceholder')}
                  className="pl-9 pr-4 py-1.5 rounded-lg border border-[#C3CC9B] bg-[#E4DFB5]/50 text-[#232B1B] placeholder-[#5C6650]/60 text-sm w-48 outline-none focus:border-[#5C6650] focus:bg-[#E4DFB5] transition-all"
                />
              </div>
            </form>

            {/* UI Language toggle */}
            <button
              onClick={() => {
                const newLang = uiLang === 'en' ? 'hi' : 'en';
                setUiLang(newLang);
                setSelectedLanguage(newLang);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#C3CC9B] text-[#5C6650] hover:border-[#232B1B] hover:text-[#232B1B] transition-all text-xs font-bold"
            >
              {uiLang === 'en' ? '🇮🇳 HI' : '🇬🇧 EN'}
            </button>

            {/* Sign In / Logout */}
            {isLoggedIn ? (
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-red-200/60 text-red-600 hover:text-red-700 hover:border-red-600 transition-all text-sm font-semibold"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-[#C3CC9B] text-[#5C6650] hover:border-[#232B1B] hover:text-[#232B1B] transition-all text-sm font-semibold"
              >
                Sign In
              </button>
            )}

            {/* Get Started */}
            <button
              onClick={goAnalyze}
              className="bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-semibold text-sm px-4 py-1.5 rounded-lg transition-all shadow-sm"
            >
              {t('landing.hero.cta')} →
            </button>
          </motion.div>

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
          <div className="md:hidden mt-3 pb-4 border-t border-[#C3CC9B] pt-4 space-y-3 px-1">
            <button
              onClick={() => navigate('/analyze')}
              className="block text-left w-full text-[#5C6650] hover:text-[#232B1B] py-1.5 transition-colors no-underline font-semibold bg-transparent border-none outline-none cursor-pointer"
            >
              {t('landing.hero.cta')}
            </button>
            <button
              onClick={() => {
                const newLang = uiLang === 'en' ? 'hi' : 'en';
                setUiLang(newLang);
                setSelectedLanguage(newLang);
                setMenuOpen(false);
              }}
              className="block text-[#5C6650] hover:text-[#232B1B] py-1.5 text-sm font-bold transition-colors bg-transparent border-none outline-none text-left w-full cursor-pointer"
            >
              {uiLang === 'en' ? '🇮🇳 Switch to Hindi' : '🇬🇧 English पर जाएं'}
            </button>
            {isLoggedIn ? (
              <button
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
                className="block text-red-700 hover:text-red-800 py-1.5 transition-colors text-sm font-bold bg-transparent border-none outline-none text-left w-full cursor-pointer"
              >
                Logout
              </button>
            ) : (
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    navigate('/login');
                    setMenuOpen(false);
                  }}
                  className="bg-[#E4DFB5] hover:bg-[#E4DFB5]/70 text-[#232B1B] border border-[#C3CC9B] text-xs px-4 py-2 rounded-lg no-underline font-bold cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    navigate('/signup');
                    setMenuOpen(false);
                  }}
                  className="bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-bold text-xs px-4 py-2 rounded-lg no-underline cursor-pointer"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        )}
      </nav>


      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6 max-w-6xl mx-auto relative">
        {/* Subtle gradient blob */}
        <div className="absolute top-10 right-10 w-[400px] h-[400px] morph-blob opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(195,204,155,0.3) 0%, transparent 70%)' }} />

        {/* Soft grid pattern overlay */}
        <div className="absolute inset-0 opacity-30 pointer-events-none animate-pulse"
          style={{
            backgroundImage: 'linear-gradient(rgba(195, 204, 155, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(195, 204, 155, 0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }}
        />

        <div className="flex flex-col lg:flex-row items-center gap-12 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <motion.div variants={fadeIn} initial="hidden" animate="visible" custom={0}>
              <span className="px-3 py-1 rounded-full border border-[#C3CC9B] bg-[#E4DFB5] text-xs font-semibold text-[#5C6650] mb-6 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#232B1B]/60" />
                {t('landing.badge')}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp} initial="hidden" animate="visible" custom={1}
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6 text-[#232B1B]"
            >
              {t('landing.hero.title1')}{' '}
              <span className="block font-black" style={{
                background: 'linear-gradient(135deg, #768E56 0%, #232B1B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {t('landing.hero.title2')}
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp} initial="hidden" animate="visible" custom={2}
              className="text-lg text-[#5C6650] mb-8 max-w-lg mx-auto lg:mx-0"
            >
              {t('landing.hero.subtitle')}
            </motion.p>

            <motion.div
              variants={fadeUp} initial="hidden" animate="visible" custom={3}
              className="flex flex-wrap gap-4 justify-center lg:justify-start"
            >
              <motion.button
                whileHover={{ scale: 1.03, backgroundColor: '#343F29' }}
                whileTap={{ scale: 0.98 }}
                onClick={goAnalyze}
                className="px-8 py-3 text-sm font-bold text-[#FBE8CE] bg-[#232B1B] rounded-xl shadow-lg shadow-[#232B1B]/10 transition-all"
              >
                {t('landing.hero.cta')} →
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03, borderColor: '#232B1B', backgroundColor: '#FBE8CE' }}
                whileTap={{ scale: 0.98 }}
                onClick={goAnalyze}
                className="px-8 py-3 text-sm font-semibold text-[#232B1B] border border-[#C3CC9B] bg-[#E4DFB5] rounded-xl transition-all"
              >
                {t('landing.hero.ctaSecondary')}
              </motion.button>
            </motion.div>

            <motion.div
              variants={fadeUp} initial="hidden" animate="visible" custom={4}
              className="flex gap-6 mt-8 justify-center lg:justify-start flex-wrap"
            >
              {[t('landing.trust.soc2'), t('landing.trust.encrypted'), t('landing.trust.gdpr')].map((tag) => (
                <span key={tag} className="text-xs flex items-center gap-1.5 text-[#5C6650]">
                  <span className="text-[#232B1B]">✓</span> {tag}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Hero visual cards */}
          <div className="flex-1 relative w-full max-w-sm mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
              className="relative"
            >
              {/* Floating verified card */}
              <motion.div
                animate={{
                  y: [0, -10, 0, 6, 0],
                  x: [0, 5, 0, -5, 0],
                  rotate: [0, 1, 0, -1, 0],
                }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-4 right-0 flex items-center gap-3 px-4 py-3 rounded-xl border border-[#C3CC9B] bg-[#E4DFB5] shadow-lg z-10"
              >
                <span className="text-[#232B1B] text-xl">✓</span>
                <div>
                  <p className="text-[10px] text-[#5C6650] uppercase tracking-wider">{t('landing.verified')}</p>
                  <p className="text-sm font-bold text-[#232B1B]">BBC News</p>
                </div>
              </motion.div>

              {/* Main card with 3D tilt */}
              <TiltCard className="mt-12 rounded-2xl border border-[#C3CC9B] bg-[#E4DFB5] p-6 shadow-xl">
                <div className="flex items-center gap-2 mb-4">
                  <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity, delay: 0 }} className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity, delay: 0.3 }} className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
                  <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity, delay: 0.6 }} className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                  <span className="ml-auto text-xs text-[#5C6650]">{t('landing.analysisProgress')}…</span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: t('landing.claimExtraction'), status: '✓', color: 'bg-[#232B1B]', w: 'w-full' },
                    { label: t('landing.sourceMatching'), status: '✓', color: 'bg-[#232B1B]', w: 'w-4/5' },
                    { label: t('landing.aiDetection'), status: '…', color: 'bg-[#5C6650]', w: 'w-3/5' },
                  ].map((item, idx) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#5C6650]">{item.label}</span>
                        <span className="text-[#232B1B] font-bold">{item.status}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#FBE8CE]">
                        <motion.div
                          className={`h-1.5 rounded-full ${item.color}`}
                          initial={{ width: 0 }} animate={{ width: item.w }}
                          transition={{ duration: 1.2, delay: 0.8 + idx * 0.2, ease: [0.4, 0, 0.2, 1] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </TiltCard>

              {/* Floating AI confidence card */}
              <motion.div
                animate={{
                  y: [0, 8, 0, -6, 0],
                  x: [0, -6, 0, 4, 0],
                  rotate: [0, -1.5, 0, 1.5, 0],
                }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                className="absolute -bottom-4 left-0 flex items-center gap-3 px-4 py-3 rounded-xl border border-[#C3CC9B] bg-[#E4DFB5] shadow-lg"
              >
                <span className="text-xl">🤖</span>
                <div>
                  <p className="text-[10px] text-[#5C6650] uppercase tracking-wider">{t('landing.aiConfidence')}</p>
                  <p className="text-sm font-bold text-[#232B1B]">{t('landing.genuine')}</p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <AnimatedSection className="py-24 px-6 max-w-7xl mx-auto">
        {/* Section heading */}
        <motion.div variants={fadeUp} className="text-center mb-16">
          <span className="px-3 py-1 rounded-full border border-[#C3CC9B] bg-[#E4DFB5] text-xs font-semibold text-[#5C6650] mb-5 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#232B1B]/60" />
            {t('landing.features.badgeText')}
          </span>
          <h2 className="text-4xl sm:text-5xl font-extrabold mb-4 leading-tight text-[#232B1B]">
            {t('landing.features.title')}{' '}
            <span style={{
              background: 'linear-gradient(135deg, #768E56 0%, #232B1B 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              {t('landing.features.titleAccent')}
            </span>
          </h2>
          <p className="text-[#5C6650] max-w-2xl mx-auto text-lg leading-relaxed">
            {t('landing.features.subtitle')}
          </p>
        </motion.div>

        {/* Asymmetric feature grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">

          {/* ── Large Left Card (2/3 width) ── */}
          <TiltCard
            className="lg:col-span-2 relative rounded-2xl border border-[#C3CC9B] overflow-hidden cursor-pointer group"
            style={{
              background: 'linear-gradient(145deg, #E4DFB5 0%, #FBE8CE 100%)',
              boxShadow: '0 8px 30px rgba(35,43,27,0.02), inset 0 1px 0 rgba(255,255,255,0.4)',
            }}
          >
            <motion.div variants={scaleIn} custom={0} className="h-full">
              {/* Subtle top-left glow */}
              <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                style={{ background: 'radial-gradient(circle, rgba(195,204,155,0.2) 0%, transparent 70%)' }} />

              <div className="relative z-10 p-8 sm:p-10 flex flex-col h-full">
                {/* Icon with glow ring */}
                <div className="mb-6">
                  <motion.div
                    whileHover={{ rotate: [0, -5, 5, 0], scale: 1.05 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center justify-center w-14 h-14 rounded-xl text-2xl"
                    style={{
                      background: 'linear-gradient(135deg, #E4DFB5 0%, #FBE8CE 100%)',
                      border: '1px solid #C3CC9B',
                      boxShadow: '0 0 12px rgba(35,43,27,0.01)',
                    }}
                  >
                    🔍
                  </motion.div>
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#232B1B] mb-3 leading-snug">
                  {t('landing.features.f1Title')}
                </h3>
                <p className="text-[#5C6650] text-base leading-relaxed max-w-lg">
                  {t('landing.features.f1Desc')}
                </p>

                {/* Illustrative banner */}
                <div className="mt-8 flex-1 rounded-xl overflow-hidden relative min-h-[160px]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(195,204,155,0.15) 0%, #E4DFB5 80%)',
                    border: '1px solid #C3CC9B',
                  }}
                >
                  {/* Animated scan lines */}
                  <div className="absolute inset-0 flex flex-col justify-center px-6 py-4 gap-3">
                    {[
                      { label: t('landing.features.f1Banner1'), match: t('landing.features.high'), w: 'w-full', color: '#232B1B' },
                      { label: t('landing.features.f1Banner2'), match: t('landing.features.high'), w: 'w-5/6', color: '#5C6650' },
                      { label: t('landing.features.f1Banner3'), match: t('landing.features.medium'), w: 'w-4/5', color: '#7E8C6E' },
                      { label: t('landing.features.f1Banner4'), match: t('landing.features.medium'), w: 'w-3/4', color: '#9FAB8B' },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-[10px] text-[#5C6650] w-36 shrink-0 truncate">{item.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-[#FBE8CE] overflow-hidden">
                          <motion.div
                            className="h-1.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                            initial={{ width: 0 }}
                            animate={{ width: item.w }}
                            transition={{ duration: 1.4, delay: 0.6 + idx * 0.15, ease: [0.4, 0, 0.2, 1] }}
                          />
                        </div>
                        <span className="text-[10px] font-bold shrink-0" style={{ color: item.color }}>{item.match}</span>
                      </div>
                    ))}
                  </div>
                  {/* Corner badge */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                    style={{ background: '#E4DFB5', border: '1px solid #C3CC9B', color: '#232B1B' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#232B1B]" />
                    {t('landing.features.live')}
                  </div>
                </div>
              </div>
            </motion.div>
          </TiltCard>

          {/* ── Right Column: Two stacked cards ── */}
          <div className="flex flex-col gap-5">

            {/* Card 2 ── AI Content Detection */}
            <TiltCard
              className="flex-1 relative rounded-2xl border border-[#C3CC9B] overflow-hidden cursor-pointer group"
              style={{
                background: 'linear-gradient(145deg, #E4DFB5 0%, #FBE8CE 100%)',
                boxShadow: '0 8px 30px rgba(35,43,27,0.02), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              <motion.div variants={scaleIn} custom={1} className="h-full">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                  style={{ background: 'radial-gradient(circle, rgba(195,204,155,0.15) 0%, transparent 70%)' }} />
                <div className="relative z-10 p-7">
                  <motion.div
                    whileHover={{ rotate: [0, -5, 5, 0], scale: 1.05 }}
                    transition={{ duration: 0.5 }}
                    className="mb-5 inline-flex items-center justify-center w-11 h-11 rounded-xl text-xl"
                    style={{
                      background: 'linear-gradient(135deg, #E4DFB5 0%, #FBE8CE 100%)',
                      border: '1px solid #C3CC9B',
                      boxShadow: '0 0 16px rgba(35,43,27,0.01)',
                    }}
                  >
                    🤖
                  </motion.div>
                  <h3 className="text-lg font-bold text-[#232B1B] mb-2 leading-snug">
                    {t('landing.features.f2Title')}
                  </h3>
                  <p className="text-sm text-[#5C6650] leading-relaxed">
                    {t('landing.features.f2Desc')}
                  </p>
                  {/* Mini stat pills */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {[t('landing.features.f2Tag1'), t('landing.features.f2Tag2'), t('landing.features.f2Tag3')].map((tag) => (
                      <motion.span
                        key={tag}
                        whileHover={{ scale: 1.05 }}
                        className="px-2.5 py-1 rounded-full text-[10px] font-semibold cursor-default border border-[#C3CC9B] bg-[#FBE8CE] text-[#5C6650]">
                        {tag}
                      </motion.span>
                    ))}
                  </div>
                </div>
              </motion.div>
            </TiltCard>

            {/* Card 3 ── Source Credibility Analysis */}
            <TiltCard
              className="flex-1 relative rounded-2xl border border-[#C3CC9B] overflow-hidden cursor-pointer group"
              style={{
                background: 'linear-gradient(145deg, #E4DFB5 0%, #FBE8CE 100%)',
                boxShadow: '0 8px 30px rgba(35,43,27,0.02), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              <motion.div variants={scaleIn} custom={2} className="h-full">
                <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                  style={{ background: 'radial-gradient(circle, rgba(195,204,155,0.15) 0%, transparent 70%)' }} />
                <div className="relative z-10 p-7">
                  <motion.div
                    whileHover={{ rotate: [0, -5, 5, 0], scale: 1.05 }}
                    transition={{ duration: 0.5 }}
                    className="mb-5 inline-flex items-center justify-center w-11 h-11 rounded-xl text-xl"
                    style={{
                      background: 'linear-gradient(135deg, #E4DFB5 0%, #FBE8CE 100%)',
                      border: '1px solid #C3CC9B',
                      boxShadow: '0 0 16px rgba(35,43,27,0.01)',
                    }}
                  >
                    ✅
                  </motion.div>
                  <h3 className="text-lg font-bold text-[#232B1B] mb-2 leading-snug">
                    {t('landing.features.f3Title')}
                  </h3>
                  <p className="text-sm text-[#5C6650] leading-relaxed">
                    {t('landing.features.f3Desc')}
                  </p>
                  {/* Credibility meter */}
                  <div className="mt-5">
                    <div className="flex justify-between text-[10px] text-[#5C6650] mb-1.5">
                      <span>{t('landing.features.f3Meter')}</span>
                      <span className="text-[#232B1B] font-bold">{t('landing.features.f3High')}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#FBE8CE] overflow-hidden">
                      <motion.div
                        className="h-1.5 rounded-full"
                        style={{ background: 'linear-gradient(90deg, #232B1B, #5C6650)' }}
                        initial={{ width: 0 }}
                        animate={{ width: '94%' }}
                        transition={{ duration: 1.5, delay: 0.8, ease: [0.4, 0, 0.2, 1] }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            </TiltCard>

          </div>
        </div>
      </AnimatedSection>

      {/* ── How It Works ── */}
      <AnimatedSection className="py-20 px-6 max-w-5xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-12">
          <h2 className="text-4xl font-extrabold mb-3 text-[#232B1B]">{t('landing.steps.title')}</h2>
          <p className="text-[#5C6650]">{t('landing.steps.subtitle')}</p>
        </motion.div>

        {/* Steps with connected timeline */}
        <div className="relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 z-0">
            <motion.div
              className="h-full rounded-full"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
              style={{ transformOrigin: 'left', background: 'linear-gradient(90deg, transparent 0%, #C3CC9B 10%, #C3CC9B 90%, transparent 100%)' }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 relative z-10">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.step} variants={springUp} custom={i}
                whileHover={{ y: -6, boxShadow: '0 12px 30px rgba(35,43,27,0.04)' }}
                className="relative bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl p-6 shadow-sm transition-all duration-300"
              >
                {/* Step number with watermark */}
                <motion.p
                  className="text-4xl font-black mb-3"
                  style={{ color: 'rgba(35, 43, 27, 0.45)' }}
                  whileHover={{ color: 'rgba(35, 43, 27, 0.7)' }}
                >
                  {s.step}
                </motion.p>
                <h3 className="font-bold text-base mb-1 text-[#232B1B]">{s.title}</h3>
                <p className="text-sm text-[#5C6650]">{s.desc}</p>

                {/* Arrow connector (desktop) */}
                {i < STEPS.length - 1 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.15 }}
                    className="hidden lg:flex absolute right-0 translate-x-1/2 top-1/2 -translate-y-1/2 items-center justify-center z-20 w-8 h-8 rounded-full bg-[#FBE8CE] border border-[#C3CC9B] shadow-sm"
                  >
                    <svg className="w-4 h-4 text-[#9AB17A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ── CTA ── */}
      <AnimatedSection className="py-20 px-6">
        <motion.div
          variants={scaleIn}
          className="max-w-2xl mx-auto text-center relative overflow-hidden rounded-3xl"
        >
          <div className="relative bg-[#E4DFB5] border border-[#C3CC9B] rounded-3xl p-12 shadow-xl">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-4xl font-extrabold text-[#232B1B] mb-4"
            >
              {t('landing.cta.title')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-[#5C6650] mb-8"
            >
              {t('landing.cta.subtitle')}
            </motion.p>
            <div className="flex gap-4 justify-center flex-wrap">
              <motion.button
                whileHover={{ scale: 1.03, backgroundColor: '#343F29' }}
                whileTap={{ scale: 0.98 }}
                onClick={goAnalyze}
                className="px-8 py-3 font-bold text-[#FBE8CE] bg-[#232B1B] rounded-xl shadow-lg shadow-[#232B1B]/10 transition-all"
              >
                {t('landing.cta.primary')}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03, borderColor: '#232B1B', backgroundColor: '#FBE8CE' }}
                whileTap={{ scale: 0.98 }}
                onClick={goAnalyze}
                className="px-8 py-3 font-semibold text-[#232B1B] border border-[#C3CC9B] bg-[#E4DFB5] rounded-xl transition-all"
              >
                {t('landing.cta.secondary')}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </AnimatedSection>

      {/* ── Footer ── */}
      <footer className="border-t border-[#C3CC9B] bg-[#E4DFB5] px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold text-lg text-[#232B1B]">
              Satya<span className="text-[#5C6650] font-medium">Scan</span>
            </p>
            <p className="text-xs text-[#5C6650]">{t('landing.footer.rights')}</p>
          </div>
          <div className="flex gap-6 text-sm text-[#5C6650]">
            {[
              t('landing.footer.about'),
              t('landing.footer.features'),
              t('landing.footer.github'),
              t('landing.footer.contact'),
            ].map((l) => (
              <a key={l} href="#" className="hover:text-[#232B1B] transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
