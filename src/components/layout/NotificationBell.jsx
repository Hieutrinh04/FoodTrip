import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell } from '@phosphor-icons/react'
import { listNotifications, markNotificationsRead, timeAgo } from '../../lib/notifications.js'

const ICON_BUTTON = 'relative flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-line-strong transition-colors hover:border-chili hover:text-chili'

/**
 * The signed-in user's notifications: bookings paid, confirmed or cancelled,
 * tour requests, partner reviews, payouts, refunds. Refreshed every minute and
 * when the tab comes back into view; opening one goes where it points.
 */
export default function NotificationBell({ lang }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const t = (vi, en) => (lang === 'vi' ? vi : en)

  const load = useCallback(() => { listNotifications().then(setItems).catch(() => {}) }, [])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 60000)
    const onFocus = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onFocus) }
  }, [load])
  useEffect(() => setOpen(false), [location.pathname, location.search])
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const unread = items.filter((n) => !n.read_at)
  async function markRead(ids) {
    setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)))
    try { await markNotificationsRead(ids) } catch { load() }
  }
  function openItem(n) {
    if (!n.read_at) markRead([n.id])
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        aria-label={unread.length ? t(`Thông báo (${unread.length} chưa đọc)`, `Notifications (${unread.length} unread)`) : t('Thông báo', 'Notifications')} className={ICON_BUTTON}>
        <Bell size={17} weight={unread.length ? 'fill' : 'regular'} />
        {unread.length > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-chili px-1 text-center font-utility text-micro font-bold leading-[18px] text-chili-ink">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-surface shadow-lifted">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="font-utility text-sm font-bold">{t('Thông báo', 'Notifications')}</span>
            {unread.length > 0 && <button type="button" onClick={() => markRead(unread.map((n) => n.id))} className="font-utility text-2xs font-semibold text-chili hover:underline">{t('Đánh dấu đã đọc', 'Mark all read')}</button>}
          </div>
          <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {!items.length && <li className="px-4 py-8 text-center text-sm text-ink-muted">{t('Chưa có thông báo nào.', 'No notifications yet.')}</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" role="menuitem" onClick={() => openItem(n)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-2 ${n.read_at ? '' : 'bg-chili/5'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-chili'}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{n.body}</span>
                    <span className="mt-1 block font-utility text-micro text-ink-faint">{timeAgo(n.created_at, lang)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
