import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bed, MapPin, X, UserCircle } from '@phosphor-icons/react'
import { getMyBookings, cancelBooking } from '../lib/bookings.js'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const C = {
  vi: {
    eyebrow: 'Đặt phòng của tôi', title: 'Những phòng bạn đã đặt.',
    loginTitle: 'Đăng nhập để xem đặt phòng',
    loginHint: 'Lịch sử đặt phòng của bạn sẽ xuất hiện ở đây.',
    loginCta: 'Đăng nhập',
    emptyTitle: 'Chưa có đặt phòng nào',
    empty: 'Tìm khách sạn từ một lịch trình ở trang "Lịch trình AI" để bắt đầu.',
    emptyCta: 'Tạo lịch trình',
    loading: 'Đang tải đặt phòng…', cancel: 'Huỷ đặt phòng',
    confirmCancel: 'Huỷ đặt phòng này?',
    status: { pending: 'Chờ thanh toán', paid: 'Đã xác nhận', failed: 'Thanh toán thất bại', cancelled: 'Đã huỷ' },
    nights: (n) => (n === 1 ? '1 đêm' : `${n} đêm`),
  },
  en: {
    eyebrow: 'My bookings', title: 'Rooms you’ve booked.',
    loginTitle: 'Log in to see your bookings',
    loginHint: 'Your booking history will show up here.',
    loginCta: 'Log in',
    emptyTitle: 'No bookings yet',
    empty: 'Find a hotel from a trip on the "AI Itinerary" page to get started.',
    emptyCta: 'Plan a trip',
    loading: 'Loading your bookings…', cancel: 'Cancel booking',
    confirmCancel: 'Cancel this booking?',
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
  const { user, hasAuth } = useAuth()
  const [status, setStatus] = useState('loading') // loading | ready
  const [bookings, setBookings] = useState([])
  const [authOpen, setAuthOpen] = useState(false)

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
    if (!window.confirm(c.confirmCancel)) return
    await cancelBooking(id)
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, payment_status: 'cancelled' } : b)))
  }

  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-12 md:py-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="max-w-[700px] mb-10">
        <motion.span variants={fadeUp} className="eyebrow eyebrow-tick">
          {c.eyebrow}
        </motion.span>
        <motion.h1 variants={fadeUp} className="text-3xl md:text-4xl font-bold leading-[1.15] mt-3">{c.title}</motion.h1>
      </motion.div>

      {!user && (
        <EmptyState
          icon={UserCircle}
          title={c.loginTitle}
          body={c.loginHint}
          action={hasAuth && (
            <button
              onClick={() => setAuthOpen(true)}
              className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[13px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow"
            >
              <UserCircle size={16} /> {c.loginCta}
            </button>
          )}
        />
      )}
      {user && status === 'loading' && <Spinner label={c.loading} />}

      {user && status === 'ready' && (
        bookings.length === 0 ? (
          <EmptyState
            icon={Bed}
            title={c.emptyTitle}
            body={c.empty}
            action={(
              <Link
                to="/plan"
                className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[13px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow"
              >
                {c.emptyCta}
              </Link>
            )}
          />
        ) : (
          <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {bookings.map((b) => (
              <motion.div key={b.id} variants={fadeUp} className="rounded-xl border border-line bg-surface p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-base truncate">{b.hotel_name}</div>
                    <div className="flex items-center gap-1 font-utility text-xs text-ink-faint mt-1 truncate">
                      <MapPin size={12} className="shrink-0" /> {b.hotel_address}
                    </div>
                  </div>
                  <span className={`shrink-0 font-utility text-2xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_STYLE[b.payment_status]}`}>
                    {c.status[b.payment_status]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-md">
                  <Bed size={14} className="text-herb shrink-0" /> {b.room_name}
                </div>
                <div className="font-utility text-sm text-ink-faint">
                  {b.check_in} → {b.check_out} · {c.nights(b.nights)}
                </div>
                <div className="font-bold text-lg text-chili tabular">{formatVnd(b.total_price)}</div>
                {(b.payment_status === 'pending' || b.payment_status === 'paid') && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    className="mt-auto inline-flex items-center justify-center gap-1.5 font-utility font-semibold text-sm px-4 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors self-start"
                  >
                    <X size={13} /> {c.cancel}
                  </button>
                )}
              </motion.div>
            ))}
          </motion.div>
        )
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}
