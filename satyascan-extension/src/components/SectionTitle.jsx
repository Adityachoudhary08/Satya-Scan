/**
 * SectionTitle – Reusable section heading with optional icon and badge.
 * Colors: teal accent on icon, muted gray label, teal pill badge.
 *
 * Props:
 *   icon      – Lucide icon element (optional)
 *   title     – Section label string (required)
 *   badge     – Small badge text, e.g. count (optional)
 *   className – Extra classes (optional)
 */
export default function SectionTitle({ icon, title, badge, className = '' }) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className="flex items-center justify-center w-5 h-5 rounded-md"
            style={{ color: '#768E56' }}
          >
            {icon}
          </span>
        )}
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: '#5C6650', letterSpacing: '0.1em' }}
        >
          {title}
        </h2>
      </div>

      {badge !== undefined && (
        <span className="ss-badge" style={{ fontSize: '10px' }}>
          {badge}
        </span>
      )}
    </div>
  );
}
