/**
 * EmptyState – Displayed when a list has no items.
 * Colors: dark bg-secondary surface with teal dashed border tint.
 *
 * Props:
 *   icon        – Lucide icon element (optional)
 *   title       – Primary empty message (required)
 *   description – Secondary hint text (optional)
 *   className   – Extra classes (optional)
 */
export default function EmptyState({ icon, title, description, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl ${className}`}
      style={{
        background: 'rgba(228, 223, 181, 0.4)',
        border: '1px dashed var(--color-border)',
      }}
    >
      {icon && (
        <div
          className="mb-3 w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: 'rgba(118, 142, 86, 0.08)',
            color: '#768E56',
          }}
        >
          {icon}
        </div>
      )}

      <p
        className="text-sm font-medium"
        style={{ color: '#5C6650' }}
      >
        {title}
      </p>

      {description && (
        <p
          className="text-xs mt-1 max-w-[210px]"
          style={{ color: 'rgba(92, 102, 80, 0.7)' }}
        >
          {description}
        </p>
      )}
    </div>
  );
}
