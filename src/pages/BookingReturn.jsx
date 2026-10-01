import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, Warning, Receipt } from '@phosphor-icons/react'
import { getBooking } from '../lib/bookings.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const C = {
  vi: {
    paid: 'Đã ghi nhận thanh toán!', refunded: 'Đã hoàn tiền.', failed: 'Thanh toán thất bại.', pending: 'Đang chờ xác nhận thanh toán…',
    error: 'Có lỗi xảy ra khi xử lý thanh toán.', invalidSignature: 'Không xác thực được kết quả thanh toán.',
    demoNote: 'Đây là xác nhận demo (không qua cổng thanh toán thật).',
    cancelled: 'Đơn đặt phòng đã được huỷ.', none: 'Không có giao dịch nào để hiển thị.',
    noneHint: 'Trang này hiện kết quả sau khi bạn thanh toán một đơn đặt phòng.',
    loading: 'Đang tải…', viewBookings: 'Xem lịch sử đặt phòng', backHome: 'Về trang chủ',
  },
  en: {
    paid: 'Payment recorded!', refunded: 'Payment refunded.', failed: 'Payment failed.', pending: 'Waiting for payment confirmation…',
    error: 'Something went wrong processing the payment.', invalidSignature: "Couldn't verify the payment result.",
    demoNote: 'This is a demo confirmation (no real payment gateway involved).',
    cancelled: 'This booking was cancelled.', none: 'There is no payment to show.',
    noneHint: 'This page shows the result after you pay for a booking.',
    loading: 'Loading…', viewBookings: 'View my bookings', backHome: 'Back home',
  },
}

const STATUS_ICON = { paid: CheckCircle, failed: XCircle, cancelled: XCircle, pending: Clock, error: Warning, 'invalid-signature': Warning, none: Receipt }
const STATUS_MESSAGE_KEY = { paid: 'paid', refunded: 'refunded', failed: 'failed', cancelled: 'cancelled', pending: 'pending', error: 'error', 'invalid-signature': 'invalidSignature', none: 'none' }

/**
 * What to show for a payment result.
 *
 * The booking row is the only authority. The status in the URL is just what
 * the redirect said, and anyone can type "?status=paid" — the page used to
 * believe it and announce a successful booking for an unpaid one. The URL is
 * used only while the booking loads, and for the two outcomes that never reach
 * the row: a callback whose signature failed, and an error before lookup.
 */
function resolveStatus({ bookingId, urlStatus, booking, loading }) {
  if (!bookingId) return 'none'
  if (booking) {
    if (booking.payment_status === 'pending' && (urlStatus === 'invalid-signature' || urlStatus === 'error')) return urlStatus
    return booking.payment_status
  }
  if (loading) return 'pending'
  // Could not read the booking (not signed in, or not theirs): claim nothing.
  return urlStatus === 'invalid-signature' ? 'invalid-signature' : 'error'
}

export default function BookingReturn() {
  const [params] = useSearchParams()
  const { user, loading } = useAuth()
  if (loading) return <p role="status" className="p-10 text-center">Đang tải… / Loading…</p>
  return <BookingReturnForAccount key={`${user?.id ?? 'guest'}-${params.get('bookingId')}`} />
}

function BookingReturnForAccount() {
  const [params] = useSearchParams()
  const { lang } = useLanguage()
  const c = C[lang]
  const bookingId = params.get('bookingId')
  const urlStatus = params.get('status')
  const [booking, setBooking] = useState(null)
  const [loadingBooking, setLoadingBooking] = useState(Boolean(bookingId))
  const status = resolveStatus({ bookingId, urlStatus, booking, loading: loadingBooking })
  // A demo confirmation is recorded on the booking itself by the server.
  const isDemo = booking?.payment_txn_ref === 'DEMO'

  useEffect(() => {
    if (!bookingId) return
    // A failed lookup must not leave an unhandled rejection: the payment
    // result above is the important part and stands on its own.
    let active = true
    getBooking(bookingId).then((row) => { if (active) setBooking(row) }).catch(() => { if (active) setBooking(null) }).finally(() => { if (active) setLoadingBooking(false) })
    return () => { active = false }
  }, [bookingId])

  const Icon = STATUS_ICON[status] ?? Clock
  const message = c[STATUS_MESSAGE_KEY[status]] ?? c.pending

  return (
    <div className="max-w-[560px] mx-auto px-5 md:px-8 py-16 md:py-24 text-center">
      <Icon size={48} weight="fill" className={status === 'paid' ? 'text-herb mx-auto' : status === 'failed' || status === 'error' || status === 'invalid-signature' ? 'text-chili mx-auto' : status === 'none' ? 'text-ink-faint mx-auto' : 'text-lantern mx-auto'} />
      <h1 className="text-2xl font-bold mt-4">{message}</h1>
      {status === 'none' && <p className="text-md text-ink-faint mt-2">{c.noneHint}</p>}
      {isDemo && <p className="text-md text-ink-faint mt-2">{c.demoNote}</p>}

      {loadingBooking && <p className="mt-6 font-utility text-sm text-ink-faint">{c.loading}</p>}
      {booking && (
        <div className="mt-6 rounded-xl border border-line-strong p-5 text-left text-md">
          <div className="font-bold">{booking.hotel_name}</div>
          <div className="text-ink-muted mt-1">{booking.room_name} · {booking.nights} {lang === 'vi' ? 'đêm' : 'nights'}</div>
          <div className="text-ink-muted">{booking.check_in} → {booking.check_out}</div>
          <div className="font-bold text-chili mt-2">{booking.total_price.toLocaleString('vi-VN')}đ</div>
        </div>
      )}

      <div className="flex justify-center gap-3 mt-8 flex-wrap">
        <Link to="/bookings" className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-3 rounded-full bg-chili text-chili-ink">
          {c.viewBookings}
        </Link>
        <Link to="/" className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-3 rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors">
          {c.backHome}
        </Link>
      </div>
    </div>
  )
}
