import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Star, Users, Bed, CheckCircle, Warning, ArrowLeft } from '@phosphor-icons/react'
import { ACCENT_GRADIENT } from '../lib/visualTokens.js'
import { fetchHotelById, hotelScoreBadge, hotelCardAccent, rememberHotel, hotelMapsUrl } from '../lib/hotelSearch.js'
import { AMENITY_LABEL, boardLabel } from '../lib/roomTypes.js'
import { partnerHotel } from '../lib/partnerHotels.js'
import { AMENITIES, CANCELLATION } from '../lib/partner.js'
import { createBooking } from '../lib/bookings.js'
import { inventoryError, quoteRooms } from '../lib/inventory.js'
import { startVnpayPayment, confirmDemoPayment, getPaymentMode } from '../lib/vnpay.js'
import { getSepayMode } from '../lib/sepay.js'
import { hasSupabase } from '../lib/supabaseClient.js'
import HotelExternalLinks from '../components/booking/HotelExternalLinks.jsx'
import RemoteImage from '../components/ui/RemoteImage.jsx'
import HotelGallery from '../components/booking/HotelGallery.jsx'
import { fetchHotelGallery } from '../lib/hotelPhotos.js'
import { useAuth } from '../auth/AuthContext.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const C = {
  vi: {
    back: 'Quay lại', loading: 'Đang tải thông tin khách sạn…', notFound: 'Không tìm thấy khách sạn này.',
    checkIn: 'Nhận phòng', checkOut: 'Trả phòng', guests: 'Số khách',
    invalidDates: 'Ngày trả phòng phải sau ngày nhận phòng.',
    nightsLabel: (n) => (n === 1 ? '1 đêm' : `${n} đêm`),
    perNight: '/đêm', roomsLeft: (n) => `Còn ${n} phòng`,
    freeCancel: (d) => `Huỷ miễn phí trước ${d}`, realRate: 'Giá thật từ Hotelbeds',
    webPhotos: 'Ảnh sưu tầm từ các trang đặt phòng (Booking, Agoda, TripAdvisor) — không phải ảnh do khách sạn cung cấp.',
    selectRoom: 'Chọn phòng này', selected: 'Đã chọn',
    guestInfoTitle: 'Thông tin người đặt', guestName: 'Họ tên', guestPhone: 'Số điện thoại', guestEmail: 'Email',
    total: 'Tổng tiền', confirm: 'Xác nhận & Thanh toán', confirming: 'Đang xử lý…',
    confirmTransfer: 'Đặt phòng & chuyển khoản', transferHint: 'Thanh toán bằng chuyển khoản ngân hàng (VietQR). Đơn được xác nhận tự động khi tiền về.',
    loginHint: 'Đăng nhập (góc trên) để đặt phòng.',
    demoNoKey: 'Cổng thanh toán VNPay chưa được cấu hình, nên đơn được xác nhận ở chế độ demo — không có giao dịch tiền thật nào diễn ra.',
    confirmDemo: 'Xác nhận (chế độ demo, bỏ qua thanh toán thật)',
    checkingPayment: 'Đang kiểm tra cổng thanh toán…',
    bookingError: 'Đặt phòng thất bại, thử lại nhé.',
    fillGuestInfo: 'Vui lòng nhập họ tên trước khi xác nhận.',
    partnerBadge: 'Đặt ngay trên FoodTrip — phòng và giá do khách sạn quản lý',
    referenceTitle: 'Khách sạn này chưa nhận đặt phòng qua FoodTrip',
    referenceBody: 'Thông tin ở đây chỉ để tham khảo. FoodTrip chỉ nhận đặt phòng và thanh toán cho khách sạn đối tác — nơi phòng trống và giá do chính khách sạn quản lý và xác nhận đơn. Bạn có thể so sánh giá và đặt trên Agoda / Traveloka, hoặc liên hệ trực tiếp khách sạn.',
    openMaps: 'Xem trên Google Maps (số điện thoại, đường đi)',
    ownerCta: 'Bạn là chủ khách sạn này? Đăng ký làm đối tác FoodTrip →',
  },
  en: {
    back: 'Back', loading: 'Loading hotel info…', notFound: 'This hotel could not be found.',
    checkIn: 'Check-in', checkOut: 'Check-out', guests: 'Guests',
    invalidDates: 'Check-out date must be after check-in date.',
    nightsLabel: (n) => (n === 1 ? '1 night' : `${n} nights`),
    perNight: '/night', roomsLeft: (n) => `${n} rooms left`,
    freeCancel: (d) => `Free cancellation until ${d}`, realRate: 'Live rate from Hotelbeds',
    webPhotos: 'Photos collected from booking sites (Booking, Agoda, TripAdvisor) — not supplied by the property.',
    selectRoom: 'Select this room', selected: 'Selected',
    guestInfoTitle: 'Guest details', guestName: 'Full name', guestPhone: 'Phone number', guestEmail: 'Email',
    total: 'Total', confirm: 'Confirm & Pay', confirming: 'Processing…',
    confirmTransfer: 'Book & pay by transfer', transferHint: 'Pay by bank transfer (VietQR). The booking is confirmed automatically when the money arrives.',
    loginHint: 'Log in (top right) to book a room.',
    demoNoKey: 'The VNPay gateway is not configured, so this booking is confirmed in demo mode — no real money changes hands.',
    confirmDemo: 'Confirm (demo mode, skips real payment)',
    checkingPayment: 'Checking the payment gateway…',
    bookingError: 'Booking failed — please try again.',
    fillGuestInfo: 'Please enter a full name before confirming.',
    partnerBadge: 'Book on FoodTrip — rooms and prices managed by the hotel',
    referenceTitle: "This hotel doesn't take bookings on FoodTrip yet",
    referenceBody: 'This page is for reference. FoodTrip only takes bookings and payment for partner hotels, which manage their own availability and prices and confirm each booking. You can compare prices and book on Agoda / Traveloka, or contact the hotel directly.',
    openMaps: 'View on Google Maps (phone, directions)',
    ownerCta: 'Own this hotel? Become a FoodTrip partner →',
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
  const [quote, setQuote] = useState({ status: 'loading', managed: false, rooms: [] })
  const [quoteRevision, setQuoteRevision] = useState(0)
  const [bookingError, setBookingError] = useState('')
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())
  useEffect(() => { setRequestKey(crypto.randomUUID()) }, [selectedRoomKey, checkIn, checkOut, guests, user?.id])
  useEffect(() => {
    let active = true
    setSelectedRoomKey(null)
    setQuote({ status: 'loading', managed: false, rooms: [] })
    if (!checkIn || !checkOut || checkOut <= checkIn) return () => { active = false }
    quoteRooms(placeId, checkIn, checkOut, guests).then((data) => {
      if (active) setQuote({ ...data, status: 'ready' })
    }).catch((error) => {
      if (active) setQuote({ status: 'error', managed: false, rooms: [], error: inventoryError(error) })
    })
    return () => { active = false }
  }, [placeId, checkIn, checkOut, guests, quoteRevision])
  // A partner hotel found by search (an hb- id) opens with the search's
  // record; once the quote says a partner runs it, its own photos, facilities
  // and policies are layered on top.
  useEffect(() => {
    if (quote.status !== 'ready' || !quote.managed) return undefined
    let active = true
    partnerHotel(placeId).then((own) => {
      if (!active || !own) return
      setHotel((h) => (h ? {
        ...h,
        gallery: own.gallery, amenities: own.amenities, checkIn: own.checkIn, checkOut: own.checkOut,
        cancellation: own.cancellation, houseRules: own.houseRules,
        description: own.description ?? h.description, photoUrl: own.photoUrl ?? h.photoUrl,
      } : h))
    })
    return () => { active = false }
  }, [quote.status, quote.managed, placeId])

  // Whether the real VNPay gateway is configured. The page used to show the
  // payment button and the demo button together, whatever the server had.
  // Bank transfer through SePay comes first when it is configured, then
  // VNPay, then the labelled demo.
  const [paymentMode, setPaymentMode] = useState('checking') // checking | sepay | ready | no-key | unknown

  useEffect(() => {
    let cancelled = false
    getSepayMode()
      .then(async (sepay) => (sepay === 'ready' ? 'sepay' : getPaymentMode()))
      .then((mode) => { if (!cancelled) setPaymentMode(mode) })
    return () => { cancelled = true }
  }, [])
  const [gallery, setGallery] = useState({ general: [], rooms: {}, source: 'none' })

  useEffect(() => {
    rememberHotel(hotel)
  }, [hotel])

  // Photos arrive after the page does: the gallery costs a lookup plus a check
  // per image, and nothing else on the page waits on it.
  useEffect(() => {
    if (!hotel) return
    let cancelled = false
    fetchHotelGallery(hotel).then((result) => {
      if (!cancelled) setGallery(result)
    })
    return () => {
      cancelled = true
    }
  }, [hotel])

  useEffect(() => {
    if (hotel) return
    let cancelled = false
    fetchHotelById(placeId)
      .then(async (h) => h ?? (await partnerHotel(placeId)))
      .then((h) => {
        if (cancelled) return
        if (!h) {
          setStatus('not-found')
          return
        }
        setHotel(h)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('not-found')
      })
    return () => {
      cancelled = true
    }
  }, [placeId, hotel])

  // The cover photo leads the gallery so the hero matches the card the
  // traveller just clicked, and so it has something to show before the gallery
  // resolves. Memoised because HotelGallery resets to the first frame whenever
  // the array identity changes — rebuilding it each render would make the
  // carousel jump back on every keystroke elsewhere on the page.
  const heroPhotos = useMemo(() => {
    // A partner's own photos come first: they published them.
    if (hotel?.gallery?.length > 1) return hotel.gallery
    const cover = hotel?.photoUrl
    if (!gallery.general.length) return cover ? [cover] : []
    return cover && !gallery.general.includes(cover) ? [cover, ...gallery.general] : gallery.general
  }, [gallery, hotel])

  const nights = nightsBetween(checkIn, checkOut)
  const datesValid = nights > 0
  const rooms = quote.status !== 'ready' ? [] : quote.managed ? quote.rooms.map((r) => ({
    key: r.id, name: { vi: r.name, en: r.name }, capacity: r.capacity, roomsLeft: r.rooms_left,
    pricePerNight: Math.round(Number(r.total_price) / nights), totalPrice: Number(r.total_price),
    managed: true, amenities: [],
  })).filter((r) => r.roomsLeft > 0) : []
  const reference = quote.status === 'ready' && !quote.managed
  const selectedRoom = rooms.find((r) => r.key === selectedRoomKey) ?? null
  const totalPrice = selectedRoom ? (selectedRoom.totalPrice ?? selectedRoom.pricePerNight * nights) : 0

  // method: 'sepay' | 'vnpay' | 'demo'
  async function handleConfirm(method) {
    if (!user || !selectedRoom || !datesValid) return
    if (!guestName.trim()) {
      setBookStatus('error')
      return
    }
    setBookStatus('booking')
    setBookingError('')
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
        requestKey,
      })

      if (method === 'sepay') {
        // The payment page shows the QR and waits for the SePay webhook.
        navigate(`/pay/${booking.id}`)
        return
      }

      if (method === 'demo') {
        // Confirmed by the server, labelled DEMO — the browser cannot mark a
        // booking paid on its own any more.
        await confirmDemoPayment(booking.id)
        navigate(`/booking/return?bookingId=${booking.id}&status=paid&demo=1`)
        return
      }

      // The server reads the amount from the booking; nothing about the price
      // is sent from here.
      const result = await startVnpayPayment({ bookingId: booking.id })
      if (result === 'no-key') {
        // Shouldn't normally happen (UI hides the real-payment button when
        // no-key), but fall back gracefully if config changed mid-session.
        navigate(`/booking/return?bookingId=${booking.id}&status=pending`)
      }
      // otherwise startVnpayPayment already redirected the browser to VNPay
    } catch (error) {
      setBookingError(selectedRoom.managed ? inventoryError(error) : c.bookingError)
      setBookStatus('error')
    }
  }

  if (status === 'loading') {
    return <div className="mx-auto max-w-[880px] px-5 py-8 md:px-8"><Spinner label={c.loading} /></div>
  }
  if (status === 'not-found' || !hasSupabase) {
    return <div className="mx-auto max-w-[880px] px-5 py-8 md:px-8"><EmptyState icon={Bed} title={c.notFound} /></div>
  }

  const badge = hotelScoreBadge(hotel.rating)

  return (
    <div className="max-w-[880px] mx-auto px-5 md:px-8 py-12 md:py-16">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 font-utility font-semibold text-md text-ink-muted hover:text-chili transition-colors mb-6">
        <ArrowLeft size={15} /> {c.back}
      </button>

      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="mb-8">
        {/* A Hotelbeds property has a gallery; a Google-only one has exactly the
            single thumbnail Maps gave us, so the hero stays as it was for those
            rather than padding it out with photos of some other building. */}
        {heroPhotos.length > 1 ? (
          <motion.div variants={fadeUp} className="mb-5">
            <HotelGallery photos={heroPhotos} alt={hotel.name} />
            {/* Second-hand photos must say so: they are of this property, but
                the property did not publish them. */}
            {gallery.source === 'web' && (
              <p className="mt-2 font-utility text-2xs text-ink-faint">{c.webPhotos}</p>
            )}
          </motion.div>
        ) : (
        <motion.div variants={fadeUp} className="relative h-[200px] w-full rounded-xl overflow-hidden mb-5">
          <RemoteImage
            src={hotel.photoUrl}
            alt={hotel.name}
            loading="eager"
            sizeHint="w880-h400-k-no"
            className="h-full w-full object-cover"
            fallback={
              <div className="h-full w-full flex items-center justify-center" style={{ background: ACCENT_GRADIENT[hotelCardAccent(hotel.id)] }}>
                <Bed size={44} weight="duotone" className="text-white/85" />
              </div>
            }
          />
          {badge && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-surface/95 rounded-lg px-2.5 py-1.5 shadow-soft">
              <span className="font-bold text-md tabular">{badge.score.toFixed(1)}</span>
              <span className="font-utility text-2xs font-semibold text-ink-muted">{badge.label[lang]}</span>
            </div>
          )}
        </motion.div>
        )}
        <motion.h1 variants={fadeUp} className="text-2xl md:text-3xl font-bold">{hotel.name}</motion.h1>
        <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-4 mt-2 text-md text-ink-muted">
          <span className="flex items-center gap-1"><MapPin size={15} className="text-chili" /> {hotel.address}</span>
          {hotel.rating != null && (
            <span className="flex items-center gap-1 text-chili font-medium"><Star size={14} weight="fill" /> {hotel.rating.toFixed(1)}</span>
          )}
        </motion.div>
        {hotel.description && <motion.p variants={fadeUp} className="mt-3 max-w-[70ch] text-md text-ink-muted">{hotel.description}</motion.p>}
        {/* On a reference page the same links sit in the panel below. */}
        {!reference && (
          <motion.div variants={fadeUp} className="mt-3">
            <HotelExternalLinks hotelName={hotel.name} cityName={hotel.address} />
          </motion.div>
        )}
      </motion.div>

      {quote.status === 'ready' && quote.managed && (
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-herb px-3 py-1 font-utility text-xs font-bold text-herb-ink"><CheckCircle size={13} weight="fill" />{c.partnerBadge}</p>
      )}
      {/* What a partner promises — facilities and policies, as on Agoda/Traveloka. */}
      {quote.status === 'ready' && quote.managed && (hotel.amenities?.length > 0 || hotel.checkIn || hotel.cancellation) && (
        <section className="mb-8 grid gap-4 rounded-xl border border-line-strong p-5 sm:grid-cols-2">
          {hotel.amenities?.length > 0 && (
            <div className="sm:col-span-2">
              <div className="mb-2 font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{lang === 'vi' ? 'Tiện nghi' : 'Facilities'}</div>
              <div className="flex flex-wrap gap-1.5">{hotel.amenities.filter((a) => AMENITIES[a]).map((a) => <span key={a} className="rounded-full bg-paper-2 px-2.5 py-1 text-xs">{AMENITIES[a][lang]}</span>)}</div>
            </div>
          )}
          {(hotel.checkIn || hotel.checkOut) && (
            <div>
              <div className="mb-1 font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{lang === 'vi' ? 'Nhận / trả phòng' : 'Check-in / out'}</div>
              <div className="text-sm">{lang === 'vi' ? `Nhận từ ${hotel.checkIn ?? '—'} · Trả trước ${hotel.checkOut ?? '—'}` : `From ${hotel.checkIn ?? '—'} · By ${hotel.checkOut ?? '—'}`}</div>
            </div>
          )}
          {CANCELLATION[hotel.cancellation] && (
            <div>
              <div className="mb-1 font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{lang === 'vi' ? 'Chính sách huỷ' : 'Cancellation'}</div>
              <div className="text-sm">{CANCELLATION[hotel.cancellation][lang]}</div>
            </div>
          )}
          {hotel.houseRules && <p className="text-sm text-ink-muted sm:col-span-2">{hotel.houseRules}</p>}
        </section>
      )}
      {reference && (
        <section className="mb-8 rounded-xl border border-line-strong bg-paper-2 p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Warning size={18} className="text-lantern" />{c.referenceTitle}</h2>
          <p className="mt-2 text-md text-ink-muted">{c.referenceBody}</p>
          <div className="mt-4 flex flex-col gap-3">
            <HotelExternalLinks hotelName={hotel.name} cityName={hotel.address} />
            <a href={hotelMapsUrl(hotel)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 self-start font-utility text-sm font-semibold text-chili hover:underline"><MapPin size={14} />{c.openMaps} ↗</a>
            <Link to={`/partner?${new URLSearchParams({ claim: hotel.id, name: hotel.name, address: hotel.address ?? '' })}`} className="self-start font-utility text-sm font-semibold text-ink-muted hover:text-chili">{c.ownerCta}</Link>
          </div>
        </section>
      )}

      {!reference && (
      <div className="rounded-xl border border-line-strong p-5 mb-8 grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{c.checkIn}</span>
          <input type="date" value={checkIn} min={todayIso()} onChange={(e) => setCheckIn(e.target.value)} className="rounded-lg border-[1.5px] border-line-strong px-3 py-2 text-md outline-none focus:border-chili" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{c.checkOut}</span>
          <input type="date" value={checkOut} min={addDaysIso(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} className="rounded-lg border-[1.5px] border-line-strong px-3 py-2 text-md outline-none focus:border-chili" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{c.guests}</span>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-ink-faint" />
            <input type="number" min={1} max={10} value={guests} onChange={(e) => setGuests(Math.max(1, Math.min(10, Number(e.target.value))))} className="w-full rounded-lg border-[1.5px] border-line-strong px-3 py-2 text-md outline-none focus:border-chili" />
          </div>
        </label>
        {!datesValid && (
          <p className="sm:col-span-3 flex items-center gap-2 text-sm text-chili"><Warning size={15} /> {c.invalidDates}</p>
        )}
      </div>
      )}

      <div className="grid gap-4 mb-8">
        {datesValid && quote.status === 'loading' && <p role="status">{lang === 'vi' ? 'Đang kiểm tra phòng trống…' : 'Checking availability…'}</p>}
        {quote.status === 'error' && <div role="alert"><p className="text-chili">{quote.error}</p><button className="mt-2 underline" onClick={() => setQuoteRevision((n) => n + 1)}>{lang === 'vi' ? 'Tải lại giá' : 'Retry availability'}</button></div>}
        {quote.status === 'ready' && quote.managed && <p className="text-sm text-herb">{lang === 'vi' ? 'Giá và phòng trống do đối tác quản lý. Giá mỗi đêm hiển thị là trung bình; tổng tiền tính theo từng ngày.' : 'Partner-managed availability. Nightly price is an average; the total uses each date’s rate.'}</p>}
        {quote.status === 'ready' && quote.managed && !rooms.length && <p role="status">{lang === 'vi' ? 'Không còn phòng phù hợp ngày và số khách đã chọn.' : 'No rooms available for these dates and guests.'}</p>}
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
                    <div className="font-bold text-base">{room.name[lang]}</div>
                    <div className="font-utility text-xs text-ink-faint mt-0.5">
                      {room.capacity} {lang === 'vi' ? 'khách' : 'guests'}
                      {/* Hotelbeds does not report an allotment on every rate. */}
                      {room.roomsLeft ? ` · ${c.roomsLeft(room.roomsLeft)}` : ''}
                    </div>
                    {room.freeCancellationUntil && (
                      <div className="font-utility text-xs text-herb mt-0.5">
                        {c.freeCancel(new Date(room.freeCancellationUntil).toLocaleDateString('vi-VN'))}
                      </div>
                    )}
                    {/* Hotelbeds tags most of its photos with the room code it
                        priced, so a room can be shown with its own pictures
                        instead of another shot of the lobby. */}
                    {(gallery.rooms[room.key]?.length ?? 0) > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                        {gallery.rooms[room.key].map((photo) => (
                          <RemoteImage
                            key={photo}
                            src={photo}
                            alt={room.name[lang]}
                            className="shrink-0 h-16 w-24 rounded-lg object-cover border border-line"
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {boardLabel(room.board) && (
                        <span className="font-utility text-2xs px-2 py-[3px] rounded-full bg-herb/10 text-herb border border-herb/30">
                          {boardLabel(room.board)[lang]}
                        </span>
                      )}
                      {room.amenities.map((a) => (
                        <span key={a} className="font-utility text-2xs px-2 py-[3px] rounded-full bg-paper-2 text-ink-muted border border-line">
                          {AMENITY_LABEL[a][lang]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-lg text-chili tabular">{formatVnd(room.pricePerNight)}<span className="text-xs font-normal text-ink-faint">{c.perNight}</span></div>
                  {room.real && <div className="font-utility text-2xs text-ink-faint mt-0.5">{c.realRate}</div>}
                  <div className={`inline-flex items-center gap-1.5 mt-2 font-utility text-xs font-semibold px-3 py-1.5 rounded-full ${isSelected ? 'bg-chili text-chili-ink' : 'border-[1.5px] border-line-strong'}`}>
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
          <div className="font-utility font-bold text-xs uppercase tracking-wide text-chili mb-4">{c.guestInfoTitle}</div>
          <div className="grid gap-3 sm:grid-cols-2 mb-5">
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={c.guestName} className="rounded-lg border-[1.5px] border-line-strong px-3.5 py-2.5 text-md outline-none focus:border-chili sm:col-span-2" />
            <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder={c.guestPhone} className="rounded-lg border-[1.5px] border-line-strong px-3.5 py-2.5 text-md outline-none focus:border-chili" />
            <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder={c.guestEmail} type="email" className="rounded-lg border-[1.5px] border-line-strong px-3.5 py-2.5 text-md outline-none focus:border-chili" />
          </div>

          <div className="flex items-center justify-between mb-5 pt-4 border-t border-dashed border-line-strong">
            <span className="font-utility text-xs font-bold uppercase tracking-wide text-ink-faint">{c.nightsLabel(nights)} · {c.total}</span>
            <span className="font-bold text-xl text-chili tabular">{formatVnd(totalPrice)}</span>
          </div>

          {!user ? (
            <p className="text-center text-sm text-ink-faint">{c.loginHint}</p>
          ) : (
            <>
              {paymentMode === 'sepay' && (
                <>
                  <button
                    onClick={() => handleConfirm('sepay')}
                    disabled={bookStatus === 'booking'}
                    className="w-full inline-flex items-center justify-center gap-2 font-utility font-semibold text-md px-6 py-[14px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow disabled:opacity-60"
                  >
                    {bookStatus === 'booking' ? c.confirming : c.confirmTransfer}
                  </button>
                  <p className="mt-2 text-center text-2xs text-ink-faint">{c.transferHint}</p>
                </>
              )}
              {paymentMode === 'ready' && (
                <button
                  onClick={() => handleConfirm('vnpay')}
                  disabled={bookStatus === 'booking'}
                  className="w-full inline-flex items-center justify-center gap-2 font-utility font-semibold text-md px-6 py-[14px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow disabled:opacity-60"
                >
                  {bookStatus === 'booking' ? c.confirming : c.confirm}
                </button>
              )}
              {(paymentMode === 'no-key' || paymentMode === 'unknown') && (
                <>
                  <p className="flex items-start gap-2 text-sm text-ink-faint">
                    <Warning size={14} className="shrink-0 mt-0.5" /> {c.demoNoKey}
                  </p>
                  <button
                    onClick={() => handleConfirm('demo')}
                    disabled={bookStatus === 'booking'}
                    className="w-full mt-3 inline-flex items-center justify-center gap-2 font-utility font-semibold text-md px-6 py-[14px] rounded-full bg-ink text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {bookStatus === 'booking' ? c.confirming : c.confirmDemo}
                  </button>
                </>
              )}
              {paymentMode === 'checking' && <p className="text-center text-sm text-ink-faint">{c.checkingPayment}</p>}
              {bookStatus === 'error' && <div role="alert" className="text-center text-sm text-chili mt-3"><p>{!guestName.trim() ? c.fillGuestInfo : bookingError || c.bookingError}</p><button className="underline" onClick={() => setQuoteRevision((n) => n + 1)}>{lang === 'vi' ? 'Tải lại giá và phòng trống' : 'Refresh availability'}</button></div>}
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}
