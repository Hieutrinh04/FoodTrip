// Answers about the signed-in person's own bookings and tour requests, read
// with their own session (row-level security): where each one stands and what
// they can do next. Nothing here is guessed — a state FoodTrip has not
// recorded is not described.

import { getMyBookings, getRefundQuote, CANCELLATION_TEXT } from './bookings.js'
import { tourRpc, tourStatusLabel } from './tours.js'

/** The intents a person's own bookings answer better than the policy text. */
export const ACCOUNT_INTENTS = new Set(['booking_status', 'booking_payment', 'booking_cancel_refund', 'tour_info'])
// Unpaid bookings hold the room this long (the pg_cron job cancels them after it).
export const HOLD_MS = 30 * 60 * 1000
const MAX_ITEMS = 4

const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`
const day = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '')
const todayIso = (now) => new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10)

const T = {
  vi: {
    none: 'Bạn chưa có đơn đặt phòng hay yêu cầu tour nào.',
    nonePending: 'Bạn không có đơn nào đang chờ thanh toán.',
    noneCancellable: 'Bạn không có đơn đã thanh toán nào còn huỷ được.',
    holding: (m) => `chờ thanh toán — còn giữ phòng ${m} phút`,
    lapsed: 'đã hết 30 phút giữ phòng, đơn sẽ tự huỷ',
    awaiting: 'đã thanh toán, chờ khách sạn xác nhận', confirmed: 'khách sạn đã xác nhận',
    checked_in: 'đã nhận phòng', completed: 'đã hoàn thành', no_show: 'khách sạn ghi nhận không đến',
    rejected: 'khách sạn đã từ chối', failed: 'thanh toán thất bại', cancelled: 'đã huỷ',
    refunding: (n) => `FoodTrip đang hoàn ${money(n)}`, refunded: (n) => `đã hoàn ${money(n)}`,
    quote: (q) => (q.refund_amount > 0
      ? `huỷ bây giờ được hoàn ${money(q.refund_amount)} (${q.refund_pct}%, ${CANCELLATION_TEXT[q.policy]?.vi ?? q.policy})`
      : q.demo ? 'đơn thử nghiệm, huỷ không phát sinh hoàn tiền'
        : `huỷ bây giờ không được hoàn tiền (${CANCELLATION_TEXT[q.policy]?.vi ?? q.policy})`),
    tour: 'Tour', pay: 'Thanh toán', mine: 'Đặt phòng của tôi',
  },
  en: {
    none: 'You have no room bookings or tour requests yet.',
    nonePending: 'You have no bookings waiting for payment.',
    noneCancellable: 'You have no paid bookings that can still be cancelled.',
    holding: (m) => `awaiting payment — room held for ${m} more min`,
    lapsed: 'the 30-minute hold is over; the booking will be cancelled',
    awaiting: 'paid, awaiting the hotel', confirmed: 'confirmed by the hotel',
    checked_in: 'checked in', completed: 'completed', no_show: 'marked as no-show',
    rejected: 'declined by the hotel', failed: 'payment failed', cancelled: 'cancelled',
    refunding: (n) => `FoodTrip is refunding ${money(n)}`, refunded: (n) => `${money(n)} refunded`,
    quote: (q) => (q.refund_amount > 0
      ? `cancelling now refunds ${money(q.refund_amount)} (${q.refund_pct}%, ${CANCELLATION_TEXT[q.policy]?.en ?? q.policy})`
      : q.demo ? 'a test booking; cancelling refunds nothing'
        : `cancelling now refunds nothing (${CANCELLATION_TEXT[q.policy]?.en ?? q.policy})`),
    tour: 'Tour', pay: 'Pay', mine: 'My bookings',
  },
}

/** Where one booking stands, in the person's words. */
export function bookingState(b, lang = 'vi', now = Date.now()) {
  const t = T[lang]
  const refund = b.refund_status === 'pending' ? t.refunding(b.refund_amount) : b.refund_status === 'completed' ? t.refunded(b.refund_amount) : null
  if (b.payment_status === 'pending') {
    const left = Math.ceil((new Date(b.created_at).getTime() + HOLD_MS - now) / 60000)
    return left > 0 ? t.holding(left) : t.lapsed
  }
  if (b.payment_status === 'paid') {
    const state = t[b.fulfillment_status] ?? t.awaiting
    return refund ? `${state} — ${refund}` : state
  }
  const state = t[b.payment_status] ?? b.payment_status
  return refund ? `${state} — ${refund}` : state
}

/** The bookings worth talking about first: awaiting payment, then upcoming stays, then refunds under way. */
export function relevantBookings(bookings, now = Date.now()) {
  const today = todayIso(now)
  const rank = (b) => (b.payment_status === 'pending' ? 0
    : b.payment_status === 'paid' && b.check_out >= today ? 1
      : b.refund_status === 'pending' ? 2 : 9)
  return [...(bookings ?? [])].map((b) => [rank(b), b]).filter(([r]) => r < 9)
    .sort(([ra, a], [rb, b]) => ra - rb || String(a.check_in).localeCompare(String(b.check_in)))
    .map(([, b]) => b)
}

/**
 * The reply about the person's own bookings for an intent: a few lines, each a
 * booking and where it stands, and the links that act on them.
 * `quotes` maps booking id → booking_refund_quote (for booking_cancel_refund).
 */
export function describeAccount(intent, { bookings = [], tours = [], quotes = {} }, lang = 'vi', now = Date.now()) {
  const t = T[lang]
  const line = (b, extra) => `${b.hotel_name} · ${day(b.check_in)}–${day(b.check_out)} · ${extra}`
  let items = []
  let empty = t.none
  const links = [{ to: '/bookings', label: t.mine }]

  if (intent === 'booking_payment') {
    const pending = (bookings ?? []).filter((b) => b.payment_status === 'pending' && new Date(b.created_at).getTime() + HOLD_MS > now)
    items = pending.map((b) => line(b, `${money(b.total_price)} · ${bookingState(b, lang, now)}`))
    for (const b of pending.slice(0, 2)) links.unshift({ to: `/pay/${b.id}`, label: `${t.pay} ${money(b.total_price)}` })
    empty = t.nonePending
  } else if (intent === 'booking_cancel_refund') {
    const paid = relevantBookings(bookings, now).filter((b) => quotes[b.id]?.can_cancel || (b.refund_status ?? 'none') !== 'none')
    items = paid.map((b) => line(b, quotes[b.id]?.can_cancel ? t.quote(quotes[b.id]) : bookingState(b, lang, now)))
    empty = t.noneCancellable
  } else {
    const today = todayIso(now)
    const rooms = intent === 'tour_info' ? [] : relevantBookings(bookings, now).map((b) => line(b, bookingState(b, lang, now)))
    const trips = (tours ?? []).filter((r) => ['requested', 'confirmed'].includes(r.status) && String(r.starts_at).slice(0, 10) >= today)
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
      .map((r) => `${t.tour}: ${r.title} · ${day(String(r.starts_at).slice(0, 10))} · ${r.seats} ${lang === 'vi' ? 'chỗ' : 'seat(s)'} · ${tourStatusLabel(r.status, lang).toLowerCase()}`)
    items = [...rooms, ...trips]
    if (intent === 'tour_info' && !items.length) return null
  }
  const shown = items.slice(0, MAX_ITEMS)
  const more = items.length - shown.length
  return {
    lines: shown.length ? shown : [empty],
    more: more > 0 ? (lang === 'vi' ? `và ${more} đơn khác` : `and ${more} more`) : null,
    links,
  }
}

/** Reads the person's bookings (and refund quotes or tours when the intent needs them) and describes them. */
export async function accountAnswer(intent, userId, lang = 'vi') {
  if (!ACCOUNT_INTENTS.has(intent) || !userId) return null
  const wantsRooms = intent !== 'tour_info'
  const wantsTours = intent === 'booking_status' || intent === 'tour_info'
  const [bookings, tours] = await Promise.all([
    wantsRooms ? getMyBookings(userId) : [],
    wantsTours ? tourRpc('tour_my_reservations').catch(() => []) : [],
  ])
  const quotes = {}
  if (intent === 'booking_cancel_refund') {
    const paid = relevantBookings(bookings).filter((b) => b.payment_status === 'paid').slice(0, MAX_ITEMS)
    const got = await Promise.all(paid.map((b) => getRefundQuote(b.id).catch(() => null)))
    paid.forEach((b, i) => { if (got[i]) quotes[b.id] = got[i] })
  }
  return describeAccount(intent, { bookings, tours: Array.isArray(tours) ? tours : [], quotes }, lang)
}
