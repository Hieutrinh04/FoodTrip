import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Star, Users, Bed, CheckCircle, Warning, ArrowLeft } from '@phosphor-icons/react'
import { ACCENT_GRADIENT } from '../components/CityPattern.jsx'
import { fetchHotelById, hotelScoreBadge, hotelCardAccent } from '../lib/hotelSearch.js'
import { getRoomTypesForHotel, AMENITY_LABEL } from '../lib/roomTypes.js'
import { createBooking } from '../lib/bookings.js'
import { startVnpayPayment } from '../lib/vnpay.js'
import { supabase, hasSupabase } from '../lib/supabaseClient.js'
import HotelExternalLinks from '../components/booking/HotelExternalLinks.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const C = {
  vi: {
    back: 'Quay lại', loading: 'Đang tải thông tin khách sạn…', notFound: 'Không tìm thấy khách sạn này.',
    checkIn: 'Nhận phòng', checkOut: 'Trả phòng', guests: 'Số khách',
    invalidDates: 'Ngày trả phòng phải sau ngày nhận phòng.',
    nightsLabel: (n) => (n === 1 ? '1 đêm' : `${n} đêm`),
    perNight: '/đêm', roomsLeft: (n) => `Còn ${n} phòng`,
    selectRoom: 'Chọn phòng này', selected: 'Đã chọn',
    guestInfoTitle: 'Thông tin người đặt', guestName: 'Họ tên', guestPhone: 'Số điện thoại', guestEmail: 'Email',
    total: 'Tổng tiền', confirm: 'Xác nhận & Thanh toán', confirming: 'Đang xử lý…',
    loginHint: 'Đăng nhập (góc trên) để đặt phòng.',
    demoNoKey: 'Chưa cấu hình cổng thanh toán VNPay (VNPAY_TMN_CODE/VNPAY_HASH_SECRET) — dùng nút xác nhận demo bên dưới để tiếp tục thử luồng đặt phòng.',
    confirmDemo: 'Xác nhận (chế độ demo, bỏ qua thanh toán thật)',
    bookingError: 'Đặt phòng thất bại, thử lại nhé.',
    fillGuestInfo: 'Vui lòng nhập họ tên trước khi xác nhận.',
  },
  en: {
    back: 'Back', loading: 'Loading hotel info…', notFound: 'This hotel could not be found.',
    checkIn: 'Check-in', checkOut: 'Check-out', guests: 'Guests',
    invalidDates: 'Check-out date must be after check-in date.',
    nightsLabel: (n) => (n === 1 ? '1 night' : `${n} nights`),
    perNight: '/night', roomsLeft: (n) => `${n} rooms left`,
    selectRoom: 'Select this room', selected: 'Selected',
    guestInfoTitle: 'Guest details', guestName: 'Full name', guestPhone: 'Phone number', guestEmail: 'Email',
    total: 'Total', confirm: 'Confirm & Pay', confirming: 'Processing…',
    loginHint: 'Log in (top right) to book a room.',
    demoNoKey: 'VNPay payment gateway not configured yet (VNPAY_TMN_CODE/VNPAY_HASH_SECRET) — use the demo confirm button below to try the booking flow.',
    confirmDemo: 'Confirm (demo mode, skips real payment)',
    bookingError: 'Booking failed — please try again.',
    fillGuestInfo: 'Please enter a full name before confirming.',
  },
}

function formatVnd(n) {
  return n.toLocaleString('vi-VN') + 'đ'
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(iso, days) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function nightsBetween(checkIn, checkOut) {
  const ms = new Date(checkOut) - new Date(checkIn)
  return Math.round(ms / 86400000)
}

export default function BookingRoom() {
  const { placeId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const c = C[lang]
  const { user } = useAuth()

  const [hotel, setHotel] = useState(location.state?.hotel ?? null)
  const [status, setStatus] = useState(location.state?.hotel ? 'ready' : 'loading')
  const [checkIn, setCheckIn] = useState(todayIso())
  const [checkOut, setCheckOut] = useState(addDaysIso(todayIso(), 1))
  const [guests, setGuests] = useState(2)
  const [selectedRoomKey, setSelectedRoomKey] = useState(null)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState(user?.email ?? '')
  const [bookStatus, setBookStatus] = useState('idle') // idle | booking | error

  useEffect(() => {
    if (hotel) return
    let cancelled = false
    fetchHotelById(placeId).then((h) => {
      if (cancelled) return
      if (!h) {
        setStatus('not-found')
        return
      }
      setHotel(h)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [placeId, hotel])

  const nights = nightsBetween(checkIn, checkOut)
  const datesValid = nights > 0
  const rooms = hotel ? getRoomTypesForHotel(hotel) : []
  const selectedRoom = rooms.find((r) => r.key === selectedRoomKey) ?? null
  const totalPrice = selectedRoom ? selectedRoom.pricePerNight * nights : 0

  async function handleConfirm(demo) {
    if (!user || !selectedRoom || !datesValid) return
    if (!guestName.trim()) {
      setBookStatus('error')
      return
    }
    setBookStatus('booking')
    try {
      const booking = await createBooking({
        userId: user.id,
        hotel,
        room: selectedRoom,
        checkIn,
        checkOut,
        nights,
        guests,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestPhone: guestPhone.trim(),
      })

      if (demo) {
        // No VNPay sandbox credentials configured — mark it obviously as a
        // demo confirmation rather than a real payment result.
        await supabase.from('bookings').update({ payment_status: 'paid', payment_txn_ref: 'DEMO' }).eq('id', booking.id)
        navigate(`/booking/return?bookingId=${booking.id}&status=paid&demo=1`)
        return
      }

      const result = await startVnpayPayment({
        bookingId: booking.id,
        amount: booking.total_price,
        orderInfo: `FoodTrip - ${hotel.name} - ${selectedRoom.name[lang]}`,
      })
      if (result === 'no-key') {
        // Shouldn't normally happen (UI hides the real-payment button when
        // no-key), but fall back gracefully if config changed mid-session.
        navigate(`/booking/return?bookingId=${booking.id}&status=pending`)
      }
      // otherwise startVnpayPayment already redirected the browser to VNPay
    } catch {
      setBookStatus('error')
    }
  }

  if (status === 'loading') {
    return <div className="max-w-[880px] mx-auto px-5 md:px-8 py-16 text-ink-muted text-[15px]">{c.loading}</div>
  }
  if (status === 'not-found' || !hasSupabase) {
    return <div className="max-w-[880px] mx-auto px-5 md:px-8 py-16 text-ink-muted text-[15px]">{c.notFound}</div>
  }

  const badge = hotelScoreBadge(hotel.rating)

  return (
    <div className="max-w-[880px] mx-auto px-5 md:px-8 py-12 md:py-16">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 font-utility font-semibold text-[13.5px] text-ink-muted hover:text-chili transition-colors mb-6">
        <ArrowLeft size={15} /> {c.back}
      </button>

      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="mb-8">
        <motion.div variants={fadeUp} className="relative h-[200px] w-full rounded-xl overflow-hidden mb-5">
          {hotel.photoUrl ? (
            <img src={hotel.photoUrl} alt={hotel.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center" style={{ background: ACCENT_GRADIENT[hotelCardAccent(hotel.id)] }}>
              <Bed size={44} weight="duotone" className="text-white/85" />
            </div>
          )}
          {badge && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-surface/95 rounded-lg px-2.5 py-1.5 shadow-soft">
              <span className="font-bold text-[15px] tabular">{badge.score.toFixed(1)}</span>
              <span className="font-utility text-[11px] font-semibold text-ink-muted">{badge.label[lang]}</span>
            </div>
          )}
        </motion.div>
        <motion.h1 variants={fadeUp} className="text-[26px] md:text-[32px] font-bold">{hotel.name}</motion.h1>
        <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-4 mt-2 text-[13.5px] text-ink-muted">
          <span className="flex items-center gap-1"><MapPin size={15} className="text-chili" /> {hotel.address}</span>
          {hotel.rating != null && (
            <span className="flex items-center gap-1 text-chili font-medium"><Star size={14} weight="fill" /> {hotel.rating.toFixed(1)}</span>
          )}
        </motion.div>
        <motion.div variants={fadeUp} className="mt-3">
          <HotelExternalLinks hotelName={hotel.name} cityName={hotel.address} />
        </motion.div>
      </motion.div>

      <div className="rounded-xl border border-line-strong p-5 mb-8 grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-utility text-[11px] font-bold uppercase tracking-wide text-ink-faint">{c.checkIn}</span>
          <input type="date" value={checkIn} min={todayIso()} onChange={(e) => setCheckIn(e.target.value)} className="rounded-lg border-[1.5px] border-line-strong px-3 py-2 text-[14px] outline-none focus:border-chili" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-utility text-[11px] font-bold uppercase tracking-wide text-ink-faint">{c.checkOut}</span>
          <input type="date" value={checkOut} min={addDaysIso(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} className="rounded-lg border-[1.5px] border-line-strong px-3 py-2 text-[14px] outline-none focus:border-chili" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-utility text-[11px] font-bold uppercase tracking-wide text-ink-faint">{c.guests}</span>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-ink-faint" />
            <input type="number" min={1} max={10} value={guests} onChange={(e) => setGuests(Math.max(1, Math.min(10, Number(e.target.value))))} className="w-full rounded-lg border-[1.5px] border-line-strong px-3 py-2 text-[14px] outline-none focus:border-chili" />
          </div>
        </label>
        {!datesValid && (
          <p className="sm:col-span-3 flex items-center gap-2 text-[13px] text-chili"><Warning size={15} /> {c.invalidDates}</p>
        )}
      </div>

      <div className="grid gap-4 mb-8">
        {rooms.map((room) => {
          const isSelected = selectedRoomKey === room.key
          return (
            <button
              key={room.key}
              type="button"
              onClick={() => setSelectedRoomKey(room.key)}
              className={`text-left rounded-xl border-[1.5px] p-5 transition-colors ${isSelected ? 'border-chili bg-paper-2' : 'border-line-strong hover:border-chili'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Bed size={20} className="text-herb shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-[16px]">{room.name[lang]}</div>
                    <div className="font-utility text-[12px] text-ink-faint mt-0.5">
                      {room.capacity} {lang === 'vi' ? 'khách' : 'guests'} · {c.roomsLeft(room.roomsLeft)}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {room.amenities.map((a) => (
                        <span key={a} className="font-utility text-[10.5px] px-2 py-[3px] rounded-full bg-paper-2 text-ink-muted border border-line">
                          {AMENITY_LABEL[a][lang]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[17px] text-chili tabular">{formatVnd(room.pricePerNight)}<span className="text-[12px] font-normal text-ink-faint">{c.perNight}</span></div>
                  <div className={`inline-flex items-center gap-1.5 mt-2 font-utility text-[12px] font-semibold px-3 py-1.5 rounded-full ${isSelected ? 'bg-chili text-chili-ink' : 'border-[1.5px] border-line-strong'}`}>
                    {isSelected && <CheckCircle size={13} weight="fill" />} {isSelected ? c.selected : c.selectRoom}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selectedRoom && datesValid && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-line-strong p-5">
          <div className="font-utility font-bold text-[12px] uppercase tracking-wide text-chili mb-4">{c.guestInfoTitle}</div>
          <div className="grid gap-3 sm:grid-cols-2 mb-5">
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={c.guestName} className="rounded-lg border-[1.5px] border-line-strong px-3.5 py-2.5 text-[14px] outline-none focus:border-chili sm:col-span-2" />
            <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder={c.guestPhone} className="rounded-lg border-[1.5px] border-line-strong px-3.5 py-2.5 text-[14px] outline-none focus:border-chili" />
            <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder={c.guestEmail} type="email" className="rounded-lg border-[1.5px] border-line-strong px-3.5 py-2.5 text-[14px] outline-none focus:border-chili" />
          </div>

          <div className="flex items-center justify-between mb-5 pt-4 border-t border-dashed border-line-strong">
            <span className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint">{c.nightsLabel(nights)} · {c.total}</span>
            <span className="font-bold text-[22px] text-chili tabular">{formatVnd(totalPrice)}</span>
          </div>

          {!user ? (
            <p className="text-center text-[13px] text-ink-faint">{c.loginHint}</p>
          ) : (
            <>
              <button
                onClick={() => handleConfirm(false)}
                disabled={bookStatus === 'booking'}
                className="w-full inline-flex items-center justify-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-[14px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow disabled:opacity-60"
              >
                {bookStatus === 'booking' ? c.confirming : c.confirm}
              </button>
              <p className="flex items-start gap-2 text-[12.5px] text-ink-faint mt-3">
                <Warning size={14} className="shrink-0 mt-0.5" /> {c.demoNoKey}
              </p>
              <button
                onClick={() => handleConfirm(true)}
                disabled={bookStatus === 'booking'}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 font-utility font-semibold text-[13.5px] px-6 py-3 rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors disabled:opacity-60"
              >
                {c.confirmDemo}
              </button>
              {bookStatus === 'error' && <p className="text-center text-[13px] text-chili mt-3">{!guestName.trim() ? c.fillGuestInfo : c.bookingError}</p>}
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}
