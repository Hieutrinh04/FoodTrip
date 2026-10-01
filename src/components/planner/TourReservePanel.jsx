import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Compass, Warning } from '@phosphor-icons/react'
import { tourRpc, tourError, tourMoney, vnTime } from '../../lib/tours.js'

const C = {
  vi: {
    title: 'Giữ chỗ tour trong lịch trình',
    hint: 'Gửi yêu cầu để đơn vị tổ chức giữ chỗ cho nhóm bạn. FoodTrip chưa thu tiền tour — đơn vị sẽ xác nhận và hướng dẫn thanh toán. Họ tên và số điện thoại được gửi cho đơn vị tổ chức.',
    login: 'Đăng nhập để giữ chỗ',
    name: 'Họ tên người đặt', phone: 'Số điện thoại', seats: 'Số người',
    total: (amount) => `Tổng giá báo: ${amount} — chưa thanh toán`,
    submit: 'Gửi yêu cầu giữ chỗ', sending: 'Đang gửi…',
    done: 'Đã gửi yêu cầu — chờ đơn vị xác nhận.',
    view: 'Xem trong "Đặt chỗ của tôi"',
  },
  en: {
    title: 'Reserve the tours in this itinerary',
    hint: "Send a request so the operator holds seats for your group. FoodTrip doesn't take payment for tours — the operator confirms and explains how to pay. Your name and phone go to the operator.",
    login: 'Sign in to reserve',
    name: 'Name', phone: 'Phone', seats: 'People',
    total: (amount) => `Quoted total: ${amount} — not paid`,
    submit: 'Send reservation request', sending: 'Sending…',
    done: 'Request sent — waiting for the operator to confirm.',
    view: 'See it in "My bookings"',
  },
}

/**
 * Seats for the tours the traveller put in their itinerary. One request per
 * departure; each keeps its own retry key so a double click or a network
 * retry never books twice.
 */
export default function TourReservePanel({ tours, people, user, onLogin, lang }) {
  const c = C[lang]
  const [form, setForm] = useState({ name: user?.user_metadata?.full_name ?? '', phone: '', seats: people })
  const [keys, setKeys] = useState(() => Object.fromEntries(tours.map((tour) => [tour.id, crypto.randomUUID()])))
  const [results, setResults] = useState({}) // id → 'done' | error text
  const [busy, setBusy] = useState(false)

  const seats = Math.max(1, Math.min(20, Number(form.seats) || 1))
  const pending = tours.filter((tour) => results[tour.id] !== 'done')

  function update(field, value) {
    setForm((old) => ({ ...old, [field]: value }))
    // A changed request is a new request, not a retry of the old one.
    setKeys(Object.fromEntries(tours.map((tour) => [tour.id, crypto.randomUUID()])))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    for (const tour of pending) {
      try {
        await tourRpc('tour_reserve', {
          p_departure: tour.id, p_seats: seats, p_name: form.name.trim(), p_phone: form.phone.trim(),
          p_key: keys[tour.id] ?? crypto.randomUUID(), p_expected_price: tour.price * seats,
        })
        setResults((old) => ({ ...old, [tour.id]: 'done' }))
      } catch (e) {
        setResults((old) => ({ ...old, [tour.id]: tourError(e) }))
      }
    }
    setBusy(false)
  }

  return (
    <section className="no-print mx-auto mt-8 max-w-[880px] rounded-[16px] border border-line-strong bg-surface p-5 shadow-soft">
      <h3 className="flex items-center gap-2 text-lg font-bold"><Compass size={20} className="text-herb" />{c.title}</h3>
      <p className="mt-1 text-sm text-ink-muted">{c.hint}</p>

      <ul className="mt-4 flex flex-col gap-2">
        {tours.map((tour) => (
          <li key={tour.id} className="rounded-lg border border-line px-3.5 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{tour.title}</span>
              <span className="tabular text-ink-muted">
                {new Date(tour.starts_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })} · {vnTime(tour.starts_at)}–{vnTime(tour.ends_at)}
              </span>
            </div>
            <div className="text-ink-faint">{tour.operator_name} · {tourMoney(tour.price)}{lang === 'vi' ? '/người' : '/person'}</div>
            {results[tour.id] === 'done' && <p role="status" className="mt-1 flex items-center gap-1 text-herb"><CheckCircle size={14} weight="fill" />{c.done}</p>}
            {results[tour.id] && results[tour.id] !== 'done' && <p role="alert" className="mt-1 flex items-start gap-1 text-chili"><Warning size={14} className="mt-0.5 shrink-0" />{results[tour.id]}</p>}
          </li>
        ))}
      </ul>

      {!user ? (
        <button type="button" onClick={onLogin} className="mt-4 rounded-full bg-chili px-5 py-2.5 font-utility text-sm font-semibold text-chili-ink">{c.login}</button>
      ) : pending.length === 0 ? (
        <Link to="/bookings#tours" className="mt-4 inline-block font-utility text-sm font-semibold text-chili hover:underline">{c.view} →</Link>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_110px]">
          <label className="text-sm">{c.name}
            <input required minLength={2} maxLength={150} value={form.name} onChange={(e) => update('name', e.target.value)} className="mt-1 block w-full rounded-lg border border-line-strong bg-paper px-3 py-2" />
          </label>
          <label className="text-sm">{c.phone}
            <input required type="tel" minLength={8} maxLength={30} value={form.phone} onChange={(e) => update('phone', e.target.value)} className="mt-1 block w-full rounded-lg border border-line-strong bg-paper px-3 py-2" />
          </label>
          <label className="text-sm">{c.seats}
            <input required type="number" min={1} max={20} value={form.seats} onChange={(e) => update('seats', e.target.value)} className="mt-1 block w-full rounded-lg border border-line-strong bg-paper px-3 py-2" />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <button disabled={busy} className="rounded-full bg-chili px-5 py-2.5 font-utility text-sm font-semibold text-chili-ink disabled:opacity-60">{busy ? c.sending : c.submit}</button>
            <span className="text-sm font-semibold tabular">{c.total(tourMoney(pending.reduce((sum, tour) => sum + tour.price * seats, 0)))}</span>
          </div>
        </form>
      )}
    </section>
  )
}
