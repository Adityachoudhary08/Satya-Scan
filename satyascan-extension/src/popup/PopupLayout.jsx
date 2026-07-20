import Header from '../components/Header';

/**
 * PopupLayout – Shell wrapper for all popup views.
 * Background matches SatyaScan Frontend: #0B0B0B primary with teal ambient orbs.
 */
export default function PopupLayout({ children, uiLang, onToggleLang }) {
  return (
    <div
      className="flex flex-col animate-fade-in-up"
      style={{
        width: '380px',
        minHeight: '560px',
        backgroundColor: '#FBE8CE',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Decorative sage ambient orbs — mirrors hero-gradient from Frontend */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '260px',
          height: '140px',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(118,142,86,0.08) 0%, transparent 70%)',
          top: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: '160px',
          height: '160px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(118,142,86,0.05) 0%, transparent 70%)',
          bottom: '80px',
          right: '-40px',
        }}
      />

      {/* Header */}
      <Header uiLang={uiLang} onToggleLang={onToggleLang} />

      {/* Thin separator */}
      <div className="divider mx-5" />

      {/* Page content */}
      <main
        className="flex-1 flex flex-col overflow-y-auto"
        style={{ position: 'relative', zIndex: 1 }}
      >
        {children}
      </main>
    </div>
  );
}
