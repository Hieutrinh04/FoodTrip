import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarBlank, Compass, MapPin, X } from '@phosphor-icons/react'
import { tourRpc, tourError, tourMoney, tourDate, TOUR_STATUS } from '../../lib/tours.js'

const STATUS_STYLE = {
  requested: 'bg-lantern/20 text-lantern',
  confirmed: 'bg-herb/15 text-herb',
  cancelled: 'bg-paper-2 text-ink-muted',
  completed: 'bg-paper-2 text-ink-muted',
}

const C = {
  vi: {
    title: 'Tour đã giữ chỗ',
    hint: 'Trạng thái giữ chỗ, chưa phải xác nhận thanh toán — FoodTrip chưa thu tiền tour.',
    empty: 'Chưa giữ chỗ tour nào. Tour được chọn ngay trong bước "Tour & trải nghiệm" khi tạo lịch trình.',
    plan: 'Tạo lịch trình',
    people: (n) => `${n} người`,
    cancel: 'Huỷ giữ chỗ', confirmCancel: 'Huỷ giữ chỗ tour này? Chỗ sẽ được trả lại cho chuyến.',
    loading: 'Đang tải tour đã đặt…', retry: 'Tải lại danh sách tour',
    acceptedTerms: 'Nội dung tại thời điểm giữ chỗ', programme: 'Lịch trình', included: 'Bao gồm', notIncluded: 'Không bao gồm', policy: 'Chính sách',
  },
  en: {
    title: 'Reserved tours',
    hint: "Reservation status, not payment — FoodTrip doesn't take payment for tours.",
    empty: 'No tour reservations yet. Tours are chosen in the "Tours & experiences" step when you plan a trip.',
    plan: 'Plan a trip',
    people: (n) => `${n} people`,
    cancel: 'Cancel reservation', confirmCancel: 'Cancel this tour reservation? The seats go back to the departure.',
    loading: 'Loading reserved tours…', retry: 'Reload tour reservations',
    acceptedTerms: 'Terms accepted when reserved', programme: 'Programme', included: 'Included', notIncluded: 'Not included', policy: 'Policies',
  },
}

/** The signed-in traveller's tour requests, inside "My bookings". */
export default function MyTourReservations({ lang }) {
  const c = C[lang]
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [tick, setTick] = useState(0)
  const { hash } = useLocation()

  useEffect(() => {
    let active = true
    setError('')
    tourRpc('tour_my_reservations')
      .then((data) => { if (active) { setRows(data ?? []); setError('') } })
      .catch((e) => { if (active) { setRows([]); setError(tourError(e)) } })
    return () => { active = false }
  }, [tick])

  // Arriving from the planner at /bookings#tours: the section only exists once
  // the list has loaded, so the browser cannot jump to it by itself.
  useEffect(() => {
    if (rows && hash === '#tours') document.getElementById('tours')?.scrollIntoView({ behavior: 'smooth' })
  }, [rows, hash])

  async function cancel(id) {
    if (!window.confirm(c.confirmCancel)) return
    setBusyId(id)
    try {
      await tourRpc('tour_set_reservation', { p_booking: id, p_status: 'cancelled', p_note: 'Khách hủy yêu cầu chưa thanh toán' })
      setTick((n) => n + 1)
    } catch (e) {
      setError(tourError(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section id="tours" className="mt-14 scroll-mt-24">
      <h2 className="flex items-center gap-2 text-2xl font-bold"><Compass size={22} className="text-herb" />{c.title}</h2>
      <p className="mt-1 mb-5 text-sm text-ink-muted">{c.hint}</p>
      {!rows && !error && <p role="status">{c.loading}</p>}
      {error && <div role="alert" className="mb-4 text-sm text-chili"><p>{error}</p><button className="mt-2 underline" onClick={() => setTick((n) => n + 1)}>{c.retry}</button></div>}
      {rows && rows.length === 0 && !error && (
        <p className="text-md text-ink-muted">
          {c.empty} <Link to="/plan" className="font-semibold text-chili hover:underline">{c.plan} →</Link>
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {rows.map((r) => (
            <article key={r.id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-base font-bold">{r.title}</div>
                  <div className="mt-0.5 text-xs text-ink-faint">{r.operator_name}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 font-utility text-2xs font-bold uppercase tracking-wide ${STATUS_STYLE[r.status] ?? ''}`}>{TOUR_STATUS[r.status] ?? r.status}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-ink-muted"><CalendarBlank size={14} className="shrink-0 text-herb" />{tourDate(r.starts_at)}</div>
              <div className="flex items-start gap-1.5 text-sm text-ink-muted"><MapPin size={14} className="mt-0.5 shrink-0 text-chili" />{r.meeting_point}</div>
              <div className="text-sm">{c.people(r.seats)} · <span className="font-bold tabular text-chili">{tourMoney(r.total_price)}</span></div>
              {r.note && <p className="text-sm text-ink-muted">{r.note}</p>}
              {r.tour_snapshot && Object.keys(r.tour_snapshot).length > 0 && (
                <details className="rounded-lg bg-paper-2 px-3 py-2 text-sm text-ink-muted">
                  <summary className="cursor-pointer font-semibold text-ink">{c.acceptedTerms}</summary>
                  <div className="mt-2 space-y-2">
                    {r.tour_snapshot.summary && <p>{r.tour_snapshot.summary}</p>}
                    {r.tour_snapshot.schedule?.length > 0 && <div><b className="text-ink">{c.programme}:</b>{r.tour_snapshot.schedule.map((item, index) => <p key={`${item.title}-${index}`} className="mt-1">{item.title}{item.meals ? ` · ${item.meals}` : ''}{item.body ? ` — ${item.body}` : ''}</p>)}</div>}
                    {r.tour_snapshot.includes?.length > 0 && <p><b className="text-ink">{c.included}:</b> {r.tour_snapshot.includes.join(', ')}</p>}
                    {r.tour_snapshot.excludes?.length > 0 && <p><b className="text-ink">{c.notIncluded}:</b> {r.tour_snapshot.excludes.join(', ')}</p>}
                    {(r.tour_snapshot.child_policy || r.tour_snapshot.cancel_policy || r.tour_snapshot.notes) && <div><b className="text-ink">{c.policy}:</b>{[r.tour_snapshot.child_policy, r.tour_snapshot.cancel_policy, r.tour_snapshot.notes].filter(Boolean).map((text) => <p key={text} className="mt-1">{text}</p>)}</div>}
                  </div>
                </details>
              )}
              {['requested', 'confirmed'].includes(r.status) && new Date(r.starts_at) > new Date() && (
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => cancel(r.id)}
                  className="mt-auto inline-flex items-center gap-1.5 self-start rounded-full border-[1.5px] border-line-strong px-4 py-2 font-utility text-sm font-semibold transition-colors hover:border-chili hover:text-chili disabled:opacity-60"
                >
                  <X size={13} /> {c.cancel}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
