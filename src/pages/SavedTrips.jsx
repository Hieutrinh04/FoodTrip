import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Trash, MapTrifold, ArrowLeft, ShareNetwork, Check, UserCircle, Compass, FileXls, FilePdf, PlayCircle } from '@phosphor-icons/react'
import ItineraryTicket from '../components/ticket/ItineraryTicket.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { getCity, getPlace, registerCustomPlaces } from '../data/destinations.js'
import { getMyItineraries, deleteItinerary, setItineraryPublic } from '../lib/itineraries.js'
import { fetchCustomPlaces } from '../lib/customPlacesCache.js'
import { shareOrCopyLink } from '../lib/shareLink.js'
import { createLiveRoomToken } from '../lib/liveTripRoom.js'
import { destinationWeatherLocation } from '../lib/tripWeather.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const C = {
  vi: {
    eyebrow: 'Lịch trình của tôi',
    title: 'Những chuyến đi bạn đã lưu.',
    loginTitle: 'Đăng nhập để xem lịch trình đã lưu',
    loginHint: 'Các lịch trình bạn lưu sẽ xuất hiện ở đây để xem lại bất cứ lúc nào.',
    loginCta: 'Đăng nhập',
    emptyTitle: 'Chưa có lịch trình nào',
    empty: 'Tạo một lịch trình ở trang "Lịch trình AI" rồi bấm Lưu lịch trình — nó sẽ xuất hiện ở đây.',
    emptyCta: 'Tạo lịch trình',
    loading: 'Đang tải lịch trình…',
    confirmDelete: 'Xoá lịch trình này? Không thể hoàn tác.',
    view: 'Xem', delete: 'Xoá', back: 'Quay lại danh sách',
    share: 'Chia sẻ', shareCopied: 'Đã sao chép!', shareShared: 'Đã chia sẻ!', shareError: 'Chia sẻ thất bại.',
    shareTitle: (dest) => `Lịch trình ${dest} trên FoodTrip`, shareText: 'Xem lịch trình mình vừa tạo trên FoodTrip nè!',
    duration: (n) => (n === 1 ? '1 ngày' : `${n} ngày ${n - 1} đêm`),
    budgetPerPerson: '/người',
    peopleN: (n) => `${n} người`,
    showMap: 'Xem bản đồ trực tiếp', hideMap: 'Ẩn bản đồ',
    exportExcel: 'Xuất Excel', exportPdf: 'Xuất PDF',
    startLive: 'Bắt đầu hành trình chung', startingLive: 'Đang mở phòng…', startLiveError: 'Không thể mở phòng hành trình.',
    loadingMap: 'Đang tải bản đồ…', exportingExcel: 'Đang tạo file Excel…', exportExcelError: 'Không thể tạo file Excel, hãy thử lại.',
  },
  en: {
    eyebrow: 'My trips',
    title: 'Trips you’ve saved.',
    loginTitle: 'Log in to see your saved trips',
    loginHint: 'Itineraries you save show up here so you can revisit them any time.',
    loginCta: 'Log in',
    emptyTitle: 'No saved itineraries yet',
    empty: 'Build one on the "AI Itinerary" page and hit Save itinerary — it will appear here.',
    emptyCta: 'Plan a trip',
    loading: 'Loading your trips…',
    confirmDelete: 'Delete this itinerary? This cannot be undone.',
    view: 'View', delete: 'Delete', back: 'Back to list',
    share: 'Share', shareCopied: 'Copied!', shareShared: 'Shared!', shareError: 'Share failed.',
    shareTitle: (dest) => `${dest} itinerary on FoodTrip`, shareText: 'Check out this trip I planned on FoodTrip!',
    duration: (n) => (n === 1 ? '1 day' : `${n} days, ${n - 1} nights`),
    budgetPerPerson: '/person',
    peopleN: (n) => `${n} people`,
    showMap: 'Show live map', hideMap: 'Hide map',
    exportExcel: 'Export Excel', exportPdf: 'Export PDF',
    startLive: 'Start live journey', startingLive: 'Opening room…', startLiveError: 'Could not open the live journey room.',
    loadingMap: 'Loading map…', exportingExcel: 'Creating Excel file…', exportExcelError: 'Could not create the Excel file — please try again.',
  },
}

const ItineraryMapPanel = lazy(() => import('../components/map/ItineraryMapPanel.jsx'))
const TripWeatherAdvice = lazy(() => import('../components/planner/TripWeatherAdvice.jsx'))

function formatVnd(n) {
  return n.toLocaleString('vi-VN') + 'đ'
}

function tripCity(trip) {
  if (trip.city_id) return getCity(trip.city_id)
  return { id: 'custom', pattern: 'skyline', accent: 'chili', name: { vi: trip.custom_city_name, en: trip.custom_city_name } }
}

async function hydrateCustomPlaces(days) {
  const missingIds = new Set()
  for (const day of days) {
    for (const stop of day) {
      if (!getPlace(stop.placeId)) missingIds.add(stop.placeId)
    }
  }
  if (!missingIds.size) return
  const places = await fetchCustomPlaces([...missingIds])
  registerCustomPlaces(places)
}

export default function SavedTrips() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const c = C[lang]
  const { user, hasAuth } = useAuth()
  const [status, setStatus] = useState('loading') // loading | ready
  const [trips, setTrips] = useState([])
  const [openTrip, setOpenTrip] = useState(null)
  const [shareStatusById, setShareStatusById] = useState({})
  const [authOpen, setAuthOpen] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [liveStatus, setLiveStatus] = useState('idle')
  const [excelStatus, setExcelStatus] = useState('idle')
  const openTripWeatherLocation = useMemo(
    () => openTrip ? destinationWeatherLocation(openTrip.city_id, openTrip.days?.flat() ?? []) : null,
    [openTrip],
  )

  useEffect(() => {
    if (!user) {
      setStatus('ready')
      setTrips([])
      return
    }
    setStatus('loading')
    getMyItineraries(user.id).then((data) => {
      setTrips(data)
      setStatus('ready')
    })
  }, [user])

  async function openTripView(trip) {
    await hydrateCustomPlaces(trip.days)
    setShowMap(false)
    setLiveStatus('idle')
    setExcelStatus('idle')
    setOpenTrip(trip)
  }

  async function handleDelete(id) {
    if (!window.confirm(c.confirmDelete)) return
    await deleteItinerary(id)
    setTrips((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleShare(trip) {
    setShareStatusById((prev) => ({ ...prev, [trip.id]: 'sharing' }))
    try {
      if (!trip.is_public) await setItineraryPublic(trip.id, true)
      const url = `${window.location.origin}/trip/${trip.id}`
      const result = await shareOrCopyLink(url, { title: c.shareTitle(tripCity(trip).name[lang]), text: c.shareText })
      const nextStatus = result === 'shared' ? 'shared' : result === 'copied' ? 'copied' : result === 'cancelled' ? 'idle' : 'error'
      setShareStatusById((prev) => ({ ...prev, [trip.id]: nextStatus }))
    } catch {
      setShareStatusById((prev) => ({ ...prev, [trip.id]: 'error' }))
    }
  }

  async function handleExportExcel(trip) {
    setExcelStatus('exporting')
    try {
      const { exportItineraryToExcel } = await import('../lib/exportItinerary.js')
      exportItineraryToExcel({
        city: tripCity(trip),
        days: trip.days,
        hotels: trip.hotels ?? [],
        startDate: trip.start_date,
        people: trip.people,
        budget: trip.budget,
        transport: trip.transport,
        lang,
      })
      setExcelStatus('idle')
    } catch {
      setExcelStatus('error')
    }
  }

  function handleExportPdf() {
    window.print()
  }

  async function handleStartLiveTrip(trip) {
    setLiveStatus('starting')
    try {
      if (!trip.is_public) await setItineraryPublic(trip.id, true)
      navigate(`/live/${trip.id}?room=${encodeURIComponent(createLiveRoomToken())}`)
    } catch {
      setLiveStatus('error')
    }
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

      {user && status === 'ready' && !openTrip && (
        <>
          {trips.length === 0 ? (
            <EmptyState
              icon={Compass}
              title={c.emptyTitle}
              body={c.empty}
              action={(
                <Link
                  to="/plan"
                  className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[13px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow"
                >
                  <MapTrifold size={16} /> {c.emptyCta}
                </Link>
              )}
            />
          ) : (
            <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {trips.map((trip) => {
                const city = tripCity(trip)
                return (
                  <motion.div key={trip.id} variants={fadeUp} className="rounded-xl border border-line bg-surface p-5 flex flex-col gap-3">
                    <div>
                      <div className="font-bold text-base">{city.name[lang]}</div>
                      <div className="font-utility text-sm text-ink-faint mt-1">
                        {c.duration(trip.duration)} · {formatVnd(trip.budget)}{c.budgetPerPerson} · {c.peopleN(trip.people)}
                      </div>
                      <div className="font-utility text-2xs text-ink-faint mt-1">
                        {trip.start_date
                          ? `${lang === 'vi' ? 'Khởi hành' : 'Departure'}: ${new Date(`${trip.start_date}T12:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}`
                          : new Date(trip.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-auto flex-wrap">
                      <button
                        onClick={() => openTripView(trip)}
                        className="inline-flex items-center gap-1.5 font-utility font-semibold text-sm px-4 py-2 rounded-full bg-chili text-chili-ink"
                      >
                        <MapTrifold size={14} /> {c.view}
                      </button>
                      <button
                        onClick={() => handleShare(trip)}
                        disabled={shareStatusById[trip.id] === 'sharing'}
                        className="inline-flex items-center gap-1.5 font-utility font-semibold text-sm px-4 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors disabled:opacity-70"
                      >
                        {shareStatusById[trip.id] === 'copied' || shareStatusById[trip.id] === 'shared' ? <Check size={14} /> : <ShareNetwork size={14} />}
                        {shareStatusById[trip.id] === 'copied' ? c.shareCopied : shareStatusById[trip.id] === 'shared' ? c.shareShared : c.share}
                      </button>
                      <button
                        onClick={() => handleDelete(trip.id)}
                        aria-label={c.delete}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </>
      )}

      {openTrip && (
        <div>
          <button
            onClick={() => { setOpenTrip(null); setShowMap(false) }}
            className="inline-flex items-center gap-2 font-utility font-semibold text-md text-ink-muted hover:text-chili transition-colors mb-6"
          >
            <ArrowLeft size={15} /> {c.back}
          </button>
          <ItineraryTicket
            city={tripCity(openTrip)}
            days={openTrip.days}
            hotels={openTrip.hotels ?? []}
            people={openTrip.people}
            budget={openTrip.budget}
            transport={openTrip.transport}
            preferredTags={openTrip.prefs ?? []}
            selectedHotelId={(openTrip.hotels ?? []).find((hotel) => hotel.selected)?.id ?? null}
            startDate={openTrip.start_date}
            animate="mount"
          />
          {openTrip.start_date && (
            <div className="no-print mx-auto mt-6 max-w-[880px]">
              <Suspense fallback={<Spinner label={lang === 'vi' ? 'Đang tải dự báo…' : 'Loading forecast…'} />}>
                <TripWeatherAdvice
                  cityId={openTrip.city_id}
                  location={openTripWeatherLocation}
                  startDate={openTrip.start_date}
                  duration={openTrip.duration}
                  lang={lang}
                />
              </Suspense>
            </div>
          )}
          <div className="no-print mt-8 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => handleStartLiveTrip(openTrip)}
              disabled={liveStatus === 'starting'}
              className="inline-flex items-center gap-2 rounded-full bg-herb px-6 py-[14px] font-utility text-md font-semibold text-herb-ink shadow-soft hover:shadow-lifted disabled:opacity-70"
            >
              <PlayCircle size={18} weight="fill" /> {liveStatus === 'starting' ? c.startingLive : c.startLive}
            </button>
            <button
              onClick={() => setShowMap((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full bg-chili px-6 py-[14px] font-utility text-md font-semibold text-chili-ink shadow-soft hover:shadow-lifted"
            >
              <MapTrifold size={17} /> {showMap ? c.hideMap : c.showMap}
            </button>
            <button
              onClick={() => handleExportExcel(openTrip)}
              disabled={excelStatus === 'exporting'}
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-6 py-[14px] font-utility text-md font-semibold hover:border-chili hover:text-chili"
            >
              <FileXls size={17} /> {excelStatus === 'exporting' ? c.exportingExcel : c.exportExcel}
            </button>
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-6 py-[14px] font-utility text-md font-semibold hover:border-chili hover:text-chili"
            >
              <FilePdf size={17} /> {c.exportPdf}
            </button>
            <button
              onClick={() => handleShare(openTrip)}
              disabled={shareStatusById[openTrip.id] === 'sharing'}
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-6 py-[14px] font-utility text-md font-semibold hover:border-chili hover:text-chili disabled:opacity-70"
            >
              {shareStatusById[openTrip.id] === 'copied' || shareStatusById[openTrip.id] === 'shared' ? <Check size={17} /> : <ShareNetwork size={17} />}
              {shareStatusById[openTrip.id] === 'copied' ? c.shareCopied : shareStatusById[openTrip.id] === 'shared' ? c.shareShared : c.share}
            </button>
          </div>
          {liveStatus === 'error' && <p className="no-print mt-3 text-center text-sm text-chili">{c.startLiveError}</p>}
          {excelStatus === 'error' && <p className="no-print mt-3 text-center text-sm text-chili">{c.exportExcelError}</p>}
          {shareStatusById[openTrip.id] === 'error' && <p className="no-print mt-3 text-center text-sm text-chili">{c.shareError}</p>}
          {showMap && (
            <div className="no-print mx-auto mt-6 max-w-[880px]">
              <Suspense fallback={<Spinner label={c.loadingMap} />}>
                <ItineraryMapPanel days={openTrip.days} hotels={openTrip.hotels ?? []} transport={openTrip.transport} lang={lang} />
              </Suspense>
            </div>
          )}
        </div>
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}
