import { ShieldCheck, Zap } from 'lucide-react';

/**
 * Header – Brand logo, name, and subtitle.
 * Colors match the SatyaScan Frontend palette (teal accent, #0B0B0B bg).
 */
export default function Header({ uiLang, onToggleLang }) {
  return (
    <header className="relative px-5 pt-5 pb-4 overflow-hidden">
      {/* Ambient teal top glow */}
      <div className="header-glow absolute inset-x-0 top-0 h-24 pointer-events-none" />

      <div className="relative flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="relative flex-shrink-0">
            <img
              src="/SatyaScan_logo_transparent.png"
              alt="SatyaScan Logo"
              className="w-10 h-10 object-contain rounded-lg animate-pulse-glow"
            />

            {/* Online indicator dot */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
              style={{
                backgroundColor: '#768E56',
                borderColor: '#FBE8CE',
              }}
            />
          </div>

          {/* Brand text */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span
                className="text-lg font-bold tracking-tight leading-none gradient-text"
                style={{ letterSpacing: '-0.01em' }}
              >
                SatyaScan
              </span>
              {/* Version badge — mirrors ss-badge style */}
              <span className="ss-badge" style={{ fontSize: '9px', padding: '2px 8px' }}>
                v1
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Zap size={10} color="#768E56" strokeWidth={2.5} />
              <span className="text-[11px] font-medium" style={{ color: '#5C6650' }}>
                AI Fact Checker
              </span>
            </div>
          </div>
        </div>

        {/* UI Language Toggle (EN/HI) */}
        <button
          onClick={onToggleLang}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#C3CC9B] text-[#5C6650] hover:border-[#232B1B] hover:text-[#232B1B] transition-colors text-[10px] font-bold uppercase tracking-wider bg-transparent cursor-pointer shrink-0 z-10"
          title={uiLang === 'en' ? 'Language' : 'भाषा'}
        >
          <span>{uiLang === 'en' ? '🇮🇳' : '🇬🇧'}</span>
          <span>{uiLang === 'en' ? 'HI' : 'EN'}</span>
        </button>
      </div>
    </header>
  );
}
