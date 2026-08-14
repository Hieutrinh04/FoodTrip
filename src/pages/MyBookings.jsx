import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Bed, MapPin, X } from '@phosphor-icons/react'
import { getMyBookings, cancelBooking } from '../lib/bookings.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const C = {
  vi: {
    eyebrow: 'Đặt phòng của tôi', title: 'Những phòng bạn đã đặt.',
    loginHint: 'Đăng nhập để xem lịch sử đặt phòng.',
    empty: 'Bạn chưa đặt phòng nào — tìm khách sạn từ một lịch trình ở trang "Lịch trình AI".',
    loading: 'Đang tải…', cancel: 'Huỷ đặt phòng',
    status: { pending: 'Chờ thanh toán', paid: 'Đã xác nhận', failed: 'Thanh toán thất bại', cancelled: 'Đã huỷ' },
    nights: (n) => (n === 1 ? '1 đêm' : `${n} đêm`),
  },
  en: {
    eyebrow: 'My bookings', title: 'Rooms you’ve booked.',
    loginHint: 'Log in to see your booking history.',
    empty: 'No bookings yet — find a hotel from a trip on the "AI Itinerary" page.',
    loading: 'Loading…', cancel: 'Cancel booking',
    status: { pending: 'Payment pending', paid: 'Confirmed', failed: 'Payment failed', cancelled: 'Cancelled' },
    nights: (n) => (n === 1 ? '1 night' : `${n} nights`),
  },
}

const STATUS_STYLE = {
  pending: 'bg-lantern/20 text-lantern',
  paid: 'bg-herb text-herb-ink',
  failed: 'bg-chili/15 text-chili',
  cancelled: 'bg-paper-2 text-ink-faint',
}

function formatVnd(n) {
  return n.toLocaleString('vi-VN') + 'đ'
}

export default function MyBookings() {
  const { lang } = useLanguage()
  const c = C[lang]
  const { user } = useAuth()
  const [status, setStatus] = useState('loading') // loading | ready
  const [bookings, setBookings] = useState([])

  useEffect(() => {
    if (!user) {
      setStatus('ready')
      setBookings([])
      return
    }
    setStatus('loading')
    getMyBookings(user.id).then((data) => {
      setBookings(data)
      setStatus('ready')
    })
  }, [user])

  async function handleCancel(id) {
    await cancelBooking(id)
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, payment_status: 'cancelled' } : b)))
  }

  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-12 md:py-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="max-w-[700px] mb-10">
        <motion.span variants={fadeUp} className="font-utility text-[12.5px] font-bold uppercase tracking-[0.14em] text-chili inline-flex items-center gap-2 before:content-[''] before:w-4 before:h-[1.5px] before:bg-chili">
          {c.eyebrow}
        </motion.span>
        <motion.h1 variants={fadeUp} className="text-[32px] md:text-[44px] font-bold leading-[1.15] mt-3">{c.title}</motion.h1>
      </motion.div>

      {!user && <p className="text-ink-muted text-[15px]">{c.loginHint}</p>}
      {user && status === 'loading' && <p className="text-ink-muted text-[15px]">{c.loading}</p>}

      {user && status === 'ready' && (
        bookings.length === 0 ? (
          <p className="text-ink-muted text-[15px] max-w-[52ch]">{c.empty}</p>
        ) : (
          <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {bookings.map((b) => (
              <motion.div key={b.id} variants={fadeUp} className="rounded-xl border border-line bg-surface p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[16px] truncate">{b.hotel_name}</div>
                    <div className="flex items-center gap-1 font-utility text-[11.5px] text-ink-faint mt-1 truncate">
                      <MapPin size={12} className="shrink-0" /> {b.hotel_address}
                    </div>
                  </div>
                  <span className={`shrink-0 font-utility text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLE[b.payment_status]}`}>
                    {c.status[b.payment_status]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[13.5px]">
                  <Bed size={14} className="text-herb shrink-0" /> {b.room_name}
                </div>
                <div className="font-utility text-[12.5px] text-ink-faint">
                  {b.check_in} → {b.check_out} · {c.nights(b.nights)}
                </div>
                <div className="font-bold text-[17px] text-chili tabular">{formatVnd(b.total_price)}</div>
                {(b.payment_status === 'pending' || b.payment_status === 'paid') && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    className="mt-auto inline-flex items-center justify-center gap-1.5 font-utility font-semibold text-[13px] px-4 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors self-start"
                  >
                    <X size={13} /> {c.cancel}
                  </button>
                )}
              </motion.div>
            ))}
          </motion.div>
        )
      )}
    </div>
  )
}
