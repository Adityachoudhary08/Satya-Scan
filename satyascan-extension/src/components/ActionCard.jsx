/**
 * ActionCard – A prominent clickable card button for primary actions.
 * Colors match SatyaScan Frontend: teal primary, dark secondary.
 *
 * Props:
 *   icon        – Lucide icon element (required)
 *   title       – Action label (required)
 *   description – Short hint text (optional)
 *   variant     – 'primary' | 'secondary' (default: 'secondary')
 *   onClick     – Click handler (optional, wired in Module 2)
 *   disabled    – Disables interaction (optional)
 *   className   – Extra classes (optional)
 */
export default function ActionCard({
  icon,
  title,
  description,
  variant = 'secondary',
  onClick,
  disabled = false,
  className = '',
}) {
  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 px-4 py-3.5 text-left
        transition-all duration-200 outline-none
        ${isPrimary ? 'btn-primary shimmer-btn' : 'btn-secondary glass-card'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      style={{
        borderRadius: '12px',
      }}
      aria-label={title}
    >
      {/* Icon container */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{
          background: isPrimary
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(118, 142, 86, 0.12)',
          color: isPrimary ? '#FBE8CE' : '#768E56',
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div className="flex flex-col min-w-0">
        <span
          className="text-sm font-semibold leading-tight"
          style={{ color: isPrimary ? '#FBE8CE' : '#232B1B' }}
        >
          {title}
        </span>
        {description && (
          <span
            className="text-[11px] mt-0.5 leading-tight truncate"
            style={{ color: isPrimary ? 'rgba(251, 232, 206, 0.7)' : '#5C6650' }}
          >
            {description}
          </span>
        )}
      </div>

      {/* Chevron hint */}
      <svg
        className="ml-auto flex-shrink-0 opacity-50"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isPrimary ? '#FBE8CE' : '#768E56'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
