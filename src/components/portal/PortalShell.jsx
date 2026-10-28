import { useSearchParams } from 'react-router-dom'

/**
 * The frame of a partner portal (hotel or tour operator), the way Agoda's
 * and Traveloka's extranets are laid out: the business and a switcher on
 * top, sections on the left (a scrolling tab bar on phones), the section on
 * the right. The open section lives in the address (?tab=…) so a reload or a
 * shared link lands on the same place.
 *
 * sections: [{ id, label, icon, badge? }]; children: (sectionId) => node.
 */
export default function PortalShell({ eyebrow, title, subtitle, switcher, actions, sections, defaultSection, children }) {
  const [params, setParams] = useSearchParams()
  const wanted = params.get('tab')
  const current = sections.some((s) => s.id === wanted) ? wanted : (defaultSection ?? sections[0]?.id)
  const open = (id) => setParams((p) => { const next = new URLSearchParams(p); next.set('tab', id); return next }, { replace: true })

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-10 md:px-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <span className="eyebrow eyebrow-tick">{eyebrow}</span>}
          <h1 className="mt-2 truncate text-2xl font-bold leading-tight md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{switcher}{actions}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={title} className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0">
          {sections.map(({ id, label, icon: Icon, badge }) => {
            const active = id === current
            return (
              <button key={id} type="button" onClick={() => open(id)} aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left font-utility text-sm font-semibold transition-colors ${active ? 'bg-ink text-paper' : 'text-ink-muted hover:bg-paper-2 hover:text-ink'}`}>
                {Icon && <Icon size={17} weight={active ? 'fill' : 'regular'} />}
                <span className="whitespace-nowrap lg:flex-1">{label}</span>
                {badge ? <span className={`rounded-full px-1.5 py-0.5 text-micro font-bold ${active ? 'bg-paper text-ink' : 'bg-chili text-chili-ink'}`}>{badge}</span> : null}
              </button>
            )
          })}
        </nav>
        <div className="min-w-0">{children(current, open)}</div>
      </div>
    </div>
  )
}

/** A figure on a dashboard: label, value, optional hint; clickable when it leads somewhere. */
export function StatCard({ label, value, hint, alert = false, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`min-w-0 rounded-2xl border bg-surface p-4 text-left ${onClick ? 'transition-colors hover:border-chili' : ''} ${alert ? 'border-chili/50' : 'border-line'}`}>
      <div className="font-utility text-micro uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-1.5 truncate font-utility text-xl font-bold sm:text-2xl ${alert ? 'text-chili' : ''}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-2xs text-ink-muted">{hint}</div>}
    </Tag>
  )
}

/** A titled block inside a portal section. */
export function PortalCard({ title, actions, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 md:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}
