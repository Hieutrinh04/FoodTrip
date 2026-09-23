import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, Warning } from '@phosphor-icons/react'
import { getBooking } from '../lib/bookings.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const C = {
  vi: {
    paid: 'Đặt phòng thành công!', failed: 'Thanh toán thất bại.', pending: 'Đang chờ xác nhận thanh toán…',
    error: 'Có lỗi xảy ra khi xử lý thanh toán.', invalidSignature: 'Không xác thực được kết quả thanh toán.',
    demoNote: 'Đây là xác nhận demo (không qua cổng thanh toán thật).',
    loading: 'Đang tải…', viewBookings: 'Xem lịch sử đặt phòng', backHome: 'Về trang chủ',
  },
  en: {
    paid: 'Booking confirmed!', failed: 'Payment failed.', pending: 'Waiting for payment confirmation…',
    error: 'Something went wrong processing the payment.', invalidSignature: "Couldn't verify the payment result.",
    demoNote: 'This is a demo confirmation (no real payment gateway involved).',
    loading: 'Loading…', viewBookings: 'View my bookings', backHome: 'Back home',
  },
}

const STATUS_ICON = { paid: CheckCircle, failed: XCircle, pending: Clock, error: Warning, 'invalid-signature': Warning }
const STATUS_MESSAGE_KEY = { paid: 'paid', failed: 'failed', pending: 'pending', error: 'error', 'invalid-signature': 'invalidSignature' }

export default function BookingReturn() {
  const [params] = useSearchParams()
  const { lang } = useLanguage()
  const c = C[lang]
  const bookingId = params.get('bookingId')
  const requestedStatus = params.get('status')
  const validStatuses = new Set(['paid', 'failed', 'pending', 'error', 'invalid-signature'])
  const status = bookingId && validStatuses.has(requestedStatus) ? requestedStatus : 'error'
  const isDemo = params.get('demo') === '1'
  const [booking, setBooking] = useState(null)
  const [loadingBooking, setLoadingBooking] = useState(Boolean(bookingId))

  useEffect(() => {
    if (!bookingId) return
    // A failed lookup must not leave an unhandled rejection: the payment
    // result above is the important part and stands on its own.
    getBooking(bookingId).then(setBooking).catch(() => setBooking(null)).finally(() => setLoadingBooking(false))
  }, [bookingId])

  const Icon = STATUS_ICON[status] ?? Clock
  const message = c[STATUS_MESSAGE_KEY[status]] ?? c.pending

  return (
    <div className="max-w-[560px] mx-auto px-5 md:px-8 py-16 md:py-24 text-center">
      <Icon size={48} weight="fill" className={status === 'paid' ? 'text-herb mx-auto' : status === 'failed' || status === 'error' || status === 'invalid-signature' ? 'text-chili mx-auto' : 'text-lantern mx-auto'} />
      <h1 className="text-2xl font-bold mt-4">{message}</h1>
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
