import { Link } from 'react-router-dom'
import { CalendarBlank, MapPin, Ticket } from '@phosphor-icons/react'
import { getCity } from '../../data/destinations.js'
import { eventSchedule, eventTitle, STATUS_LABEL } from '../../lib/foodEvents.js'

const C = {
  vi: { free: 'Miễn phí', paid: 'Có thu phí', details: 'Xem chi tiết' },
  en: { free: 'Free', paid: 'Paid entry', details: 'Details' },
}
const BADGE = { ongoing: 'bg-herb text-herb-ink', upcoming: 'bg-lantern/20 text-lantern', past: 'bg-paper-2 text-ink-faint' }

export function StatusBadge({ status, lang }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 font-utility text-2xs font-bold uppercase tracking-wide ${BADGE[status]}`}>{STATUS_LABEL[status][lang]}</span>
}

/** One event as a card: status, name, where and when. `event.when` comes from withStatus(). */
export function EventCard({ event, lang }) {
  const c = C[lang]
  const city = getCity(event.city_id)
  return (
    <article className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/su-kien/${event.id}`} className="text-base font-bold leading-snug hover:text-chili">{eventTitle(event, lang)}</Link>
        <StatusBadge status={event.when.status} lang={lang} />
      </div>
      <div className="flex items-start gap-1.5 text-sm text-ink-muted"><MapPin size={14} className="mt-0.5 shrink-0 text-chili" />{[event.venue, city?.name[lang]].filter(Boolean).join(' · ')}</div>
      <div className="flex items-start gap-1.5 text-sm text-ink-muted"><CalendarBlank size={14} className="mt-0.5 shrink-0 text-herb" />{eventSchedule(event, lang)}</div>
      {event.is_free != null && <div className="flex items-center gap-1.5 text-sm text-ink-muted"><Ticket size={14} className="shrink-0" />{event.is_free ? c.free : c.paid}{event.price_note ? ` — ${event.price_note}` : ''}</div>}
      <Link to={`/su-kien/${event.id}`} className="mt-auto pt-1 font-utility text-xs font-semibold text-chili hover:underline">{c.details} →</Link>
    </article>
  )
}
