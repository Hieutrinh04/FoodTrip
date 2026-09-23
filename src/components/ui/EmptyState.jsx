/**
 * Shared empty / logged-out / zero-results block so these states look the same
 * across pages: a duotone icon, a line of copy, and an optional call to action.
 */
export default function EmptyState({ icon: Icon, title, body, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-paper-2/50 px-6 py-14 text-center ${className}`}>
      {Icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-chili shadow-soft">
          <Icon size={26} weight="duotone" />
        </span>
      )}
      {title && <h2 className="font-display text-xl font-bold">{title}</h2>}
      {body && <p className="max-w-[46ch] text-md text-ink-muted">{body}</p>}
      {action}
    </div>
  )
}
