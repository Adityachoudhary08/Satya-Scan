import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation, useLanguage } from '../context/LanguageContext';
import { User } from 'lucide-react';

// Inline SVG shield logo with forest black/sage gradient
function ShieldLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shieldGradNav" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#232B1B" />
          <stop offset="100%" stopColor="#5C6650" />
        </linearGradient>
      </defs>
      <path
        d="M50 6 L88 22 L88 54 C88 72 70 88 50 95 C30 88 12 72 12 54 L12 22 Z"
        fill="url(#shieldGradNav)"
        opacity="0.08"
        stroke="url(#shieldGradNav)"
        strokeWidth="2.5"
      />
      <text
        x="50" y="66"
        textAnchor="middle"
        fontSize="44"
        fontWeight="800"
        fontFamily="'Inter', 'Arial', sans-serif"
        fill="url(#shieldGradNav)"
        letterSpacing="-2"
      >
        S
      </text>
    </svg>
  );
}

export default function Navbar() {
  const { isLoggedIn, user, logout } = useAuth();
  const { t, uiLang, setUiLang } = useTranslation();
  const { selectedLanguage, setSelectedLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const currentY = window.scrollY;
      setScrolled(currentY > 20);
      setVisible(currentY < lastY || currentY < 20);
      lastY = currentY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
    setMenuOpen(false);
  };

  const toggleUiLang = () => {
    const newLang = uiLang === 'en' ? 'hi' : 'en';
    setUiLang(newLang);
    setSelectedLanguage(newLang);
  };

  const isLanding = location.pathname === '/';

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 px-6 py-3"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), background 0.35s ease, backdrop-filter 0.35s ease, box-shadow 0.35s ease, border-color 0.35s ease',
        background: isLanding && !scrolled
          ? 'transparent'
          : 'rgba(251, 232, 206, 0.85)',
        backdropFilter: isLanding && !scrolled ? 'none' : 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: isLanding && !scrolled ? 'none' : 'blur(24px) saturate(180%)',
        borderBottom: isLanding && !scrolled ? '1px solid transparent' : '1px solid #C3CC9B',
        boxShadow: scrolled ? '0 4px 30px rgba(35, 43, 27, 0.03)' : 'none',
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group no-underline">
          <img src="/SatyaScan_logo_transparent.png" alt="SatyaScan Logo" className="h-10 w-auto object-contain" />
          <span className="font-bold text-lg tracking-tight text-[#232B1B]">
            <span>Satya</span><span className="text-[#5C6650] font-medium">Scan</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-5 text-sm">
          <Link
            to="/analyze"
            className="text-[#5C6650] hover:text-[#232B1B] transition-colors font-semibold no-underline"
          >
            {t('nav.analyze')}
          </Link>
          {isLoggedIn && location.pathname !== '/history' && (
            <Link
              to="/history"
              className="text-[#5C6650] hover:text-[#232B1B] transition-colors font-semibold no-underline"
            >
              {t('nav.history')}
            </Link>
          )}

          {/* UI Language Toggle (EN/HI) */}
          <button
            onClick={toggleUiLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C3CC9B] text-[#5C6650] hover:border-[#232B1B] hover:text-[#232B1B] transition-colors text-xs font-bold uppercase tracking-wider bg-transparent"
            title={t('nav.language')}
          >
            <span>{uiLang === 'en' ? '🇮🇳' : '🇬🇧'}</span>
            <span>{uiLang === 'en' ? 'HI' : 'EN'}</span>
          </button>

          {/* Auth */}
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#768E56]/10 border border-[#768E56]/25 text-[#232B1B] text-sm font-medium">
                <div className="w-5 h-5 rounded-full bg-[#768E56]/20 flex items-center justify-center text-[#768E56] -ml-1">
                  <User size={12} strokeWidth={2.5} />
                </div>
                <span>{user?.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-sm border border-red-200/60 text-red-600 hover:text-red-700 hover:border-red-600 px-3 py-1.5 rounded-lg transition-colors bg-transparent font-semibold"
              >
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <>
              <Link
                to="/login"
                className="text-[#5C6650] hover:text-[#232B1B] transition-colors font-semibold no-underline"
              >
                {t('nav.login')}
              </Link>
              <Link
                to="/signup"
                className="bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-bold px-4 py-1.5 rounded-lg transition-all text-xs shadow-sm shadow-[#232B1B]/10 no-underline"
              >
                {t('nav.signup')}
              </Link>
            </>
          )}
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
        <div className="md:hidden mt-3 pb-4 border-t border-[#C3CC9B] pt-4 space-y-3 px-1">
          <Link to="/analyze" className="block text-[#5C6650] hover:text-[#232B1B] py-1.5 transition-colors no-underline font-semibold" onClick={() => setMenuOpen(false)}>
            {t('nav.analyze')}
          </Link>
          {isLoggedIn && location.pathname !== '/history' && (
            <Link to="/history" className="block text-[#5C6650] hover:text-[#232B1B] py-1.5 transition-colors no-underline font-semibold" onClick={() => setMenuOpen(false)}>
              {t('nav.history')}
            </Link>
          )}
          <button
            onClick={toggleUiLang}
            className="block text-[#5C6650] hover:text-[#232B1B] py-1.5 text-sm font-bold transition-colors bg-transparent border-none outline-none text-left w-full cursor-pointer"
          >
            {uiLang === 'en' ? '🇮🇳 Switch to Hindi' : '🇬🇧 English पर जाएं'}
          </button>
          {isLoggedIn ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#768E56]/10 border border-[#768E56]/20 text-[#232B1B] text-sm font-medium w-fit">
                <div className="w-6 h-6 rounded-full bg-[#768E56]/20 flex items-center justify-center text-[#768E56]">
                  <User size={13} strokeWidth={2.5} />
                </div>
                <span>{user?.name}</span>
              </div>
              <button onClick={handleLogout} className="block text-red-700 hover:text-red-800 py-1.5 transition-colors text-sm font-bold bg-transparent border-none outline-none text-left w-full cursor-pointer">
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <div className="flex gap-3 pt-1">
              <Link to="/login" className="bg-[#E4DFB5] hover:bg-[#E4DFB5]/70 text-[#232B1B] border border-[#C3CC9B] text-xs px-4 py-2 rounded-lg no-underline font-bold" onClick={() => setMenuOpen(false)}>
                {t('nav.login')}
              </Link>
              <Link to="/signup" className="bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-bold text-xs px-4 py-2 rounded-lg no-underline" onClick={() => setMenuOpen(false)}>
                {t('nav.signup')}
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
