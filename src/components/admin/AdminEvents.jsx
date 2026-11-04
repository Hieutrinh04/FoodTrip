import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowsClockwise, Check, EyeSlash, Trash } from '@phosphor-icons/react'
import { adminEvents, deleteEvent, eventSchedule, eventStatus, setEventStatus, STATUS_LABEL } from '../../lib/foodEvents.js'
import { getCity } from '../../data/destinations.js'
import Spinner from '../ui/Spinner.jsx'

const BUTTON = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold transition-colors hover:border-chili hover:text-chili disabled:opacity-50'
const STATE = { pending: ['Chờ duyệt', 'Awaiting review'], published: ['Đã đăng', 'Published'], hidden: ['Không đăng', 'Not published'] }

/** Admin → Sự kiện: review what partners proposed; publish, hide or delete. */
export default function AdminEvents({ t, lang }) {
  const [show, setShow] = useState('pending')
  const [list, setList] = useState({ status: 'loading', rows: [] })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let live = true
    setList((l) => ({ ...l, status: 'loading' }))
    adminEvents(show).then((rows) => { if (live) setList({ status: 'ready', rows }) }).catch(() => { if (live) setList({ status: 'error', rows: [] }) })
    return () => { live = false }
  }, [show, tick])

  async function act(id, action) {
    setBusy(id); setError('')
    try { await action(); reload() } catch { setError(t('Chưa lưu được — kiểm tra quyền quản trị và migration 20261103130000.', 'Could not save — check admin rights and migration 20261103130000.')) }
    setBusy(null)
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t('Sự kiện ẩm thực', 'Food events')}<span className="ml-2 font-utility text-sm font-semibold text-ink-faint">{list.rows.length}</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={show} onChange={(e) => setShow(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1.5 font-utility text-2xs font-semibold">
            <option value="pending">{t('Chờ duyệt', 'Awaiting review')}</option>
            <option value="published">{t('Đã đăng', 'Published')}</option>
            <option value="hidden">{t('Không đăng', 'Not published')}</option>
            <option value="all">{t('Tất cả', 'All')}</option>
          </select>
          <button type="button" onClick={reload} className={BUTTON}><ArrowsClockwise size={14} />{t('Tải lại', 'Reload')}</button>
          <Link to="/su-kien" className={BUTTON}>{t('Trang sự kiện', 'Events page')} ↗</Link>
        </div>
      </div>
      <p className="mb-4 text-sm text-ink-muted">{t('Kiểm tra tên, thời gian, địa điểm và trang chính thức trước khi đăng. Giá chỉ giữ khi ban tổ chức đã công bố.', 'Check the name, times, venue and official page before publishing. Keep a price only if the organiser announced it.')}</p>
      {error && <p role="alert" className="mb-3 rounded-xl bg-chili/10 px-4 py-2.5 text-sm text-chili">{error}</p>}
      {list.status === 'loading' && !list.rows.length && <Spinner label={t('Đang tải…', 'Loading…')} />}
      {list.status === 'error' && <p role="alert" className="rounded-xl bg-chili/10 px-4 py-3 text-sm text-chili">{t('Không tải được — migration 20261103130000 đã được áp dụng chưa?', 'Could not load — has migration 20261103130000 been applied?')}</p>}
      {list.status === 'ready' && !list.rows.length && <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">{t('Không có sự kiện nào trong mục này.', 'Nothing here.')}</p>}
      {list.rows.length > 0 && <ul className={`divide-y divide-line ${list.status === 'loading' ? 'opacity-60' : ''}`}>
        {list.rows.map((e) => (
          <li key={e.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/su-kien/${e.id}`} className="font-semibold hover:text-chili">{e.title_vi}</Link>
                <div className="text-xs text-ink-muted">{getCity(e.city_id)?.name[lang] ?? e.city_id} · {e.venue} · {eventSchedule(e, lang)} · {STATUS_LABEL[eventStatus(e).status][lang]}</div>
                <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{e.summary}</p>
                {e.official_url && <a href={e.official_url} target="_blank" rel="noreferrer noopener" className="text-xs text-chili hover:underline">{e.official_url}</a>}
                {e.review_note && <div className="mt-1 text-xs text-ink-faint">{t('Ghi chú duyệt:', 'Review note:')} {e.review_note}</div>}
              </div>
              <span className="rounded-full bg-paper-2 px-2.5 py-1 font-utility text-2xs font-semibold">{STATE[e.status][lang === 'vi' ? 0 : 1]}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {e.status !== 'published' && <button type="button" disabled={busy === e.id} onClick={() => act(e.id, () => setEventStatus(e.id, 'published'))} className={BUTTON}><Check size={13} />{t('Đăng', 'Publish')}</button>}
              {e.status !== 'hidden' && <button type="button" disabled={busy === e.id} onClick={() => {
                const note = window.prompt(t('Lý do không đăng (người đề xuất sẽ thấy):', 'Why it is not published (the proposer sees this):'), e.review_note ?? '')
                if (note !== null) act(e.id, () => setEventStatus(e.id, 'hidden', note.slice(0, 500)))
              }} className={BUTTON}><EyeSlash size={13} />{t('Không đăng', 'Hide')}</button>}
              <button type="button" disabled={busy === e.id} onClick={() => window.confirm(t('Xoá sự kiện này?', 'Delete this event?')) && act(e.id, () => deleteEvent(e.id))}
                className="inline-flex items-center gap-1.5 rounded-full border border-chili/40 px-3 py-1.5 font-utility text-2xs font-semibold text-chili hover:bg-chili hover:text-chili-ink"><Trash size={13} />{t('Xoá', 'Delete')}</button>
            </div>
          </li>
        ))}
      </ul>}
    </div>
  )
}
