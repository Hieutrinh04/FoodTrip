import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trash, MapTrifold, ArrowLeft, ShareNetwork, Check } from '@phosphor-icons/react'
import ItineraryTicket from '../components/ticket/ItineraryTicket.jsx'
import { getCity, getPlace, registerCustomPlaces } from '../data/destinations.js'
import { getMyItineraries, deleteItinerary, setItineraryPublic } from '../lib/itineraries.js'
import { fetchCustomPlaces } from '../lib/customPlacesCache.js'
import { shareOrCopyLink } from '../lib/shareLink.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const C = {
  vi: {
    eyebrow: 'Lịch trình của tôi',
    title: 'Những chuyến đi bạn đã lưu.',
    loginHint: 'Đăng nhập để xem các lịch trình bạn đã lưu.',
    empty: 'Bạn chưa lưu lịch trình nào — tạo một lịch trình ở trang "Lịch trình AI" rồi bấm Lưu lịch trình nhé.',
    loading: 'Đang tải…',
    view: 'Xem', delete: 'Xoá', back: 'Quay lại danh sách',
    share: 'Chia sẻ', shareCopied: 'Đã sao chép!', shareShared: 'Đã chia sẻ!', shareError: 'Chia sẻ thất bại.',
    shareTitle: (dest) => `Lịch trình ${dest} trên FoodTrip`, shareText: 'Xem lịch trình mình vừa tạo trên FoodTrip nè!',
    duration: (n) => (n === 1 ? '1 ngày' : `${n} ngày ${n - 1} đêm`),
    budgetPerPerson: '/người',
    peopleN: (n) => `${n} người`,
  },
  en: {
    eyebrow: 'My trips',
    title: 'Trips you’ve saved.',
    loginHint: 'Log in to see the itineraries you’ve saved.',
    empty: 'No saved itineraries yet — build one on the "AI Itinerary" page and hit Save itinerary.',
    loading: 'Loading…',
    view: 'View', delete: 'Delete', back: 'Back to list',
    share: 'Share', shareCopied: 'Copied!', shareShared: 'Shared!', shareError: 'Share failed.',
    shareTitle: (dest) => `${dest} itinerary on FoodTrip`, shareText: 'Check out this trip I planned on FoodTrip!',
    duration: (n) => (n === 1 ? '1 day' : `${n} days, ${n - 1} nights`),
    budgetPerPerson: '/person',
    peopleN: (n) => `${n} people`,
  },
}

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
  const { lang } = useLanguage()
  const c = C[lang]
  const { user } = useAuth()
  const [status, setStatus] = useState('loading') // loading | ready
  const [trips, setTrips] = useState([])
  const [openTrip, setOpenTrip] = useState(null)
  const [shareStatusById, setShareStatusById] = useState({})

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
    setOpenTrip(trip)
  }

  async function handleDelete(id) {
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

      {user && status === 'ready' && !openTrip && (
        <>
          {trips.length === 0 ? (
            <p className="text-ink-muted text-[15px] max-w-[52ch]">{c.empty}</p>
          ) : (
            <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {trips.map((trip) => {
                const city = tripCity(trip)
                return (
                  <motion.div key={trip.id} variants={fadeUp} className="rounded-xl border border-line bg-surface p-5 flex flex-col gap-3">
                    <div>
                      <div className="font-bold text-[16px]">{city.name[lang]}</div>
                      <div className="font-utility text-[12.5px] text-ink-faint mt-1">
                        {c.duration(trip.duration)} · {formatVnd(trip.budget)}{c.budgetPerPerson} · {c.peopleN(trip.people)}
                      </div>
                      <div className="font-utility text-[11px] text-ink-faint mt-1">
                        {new Date(trip.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-auto flex-wrap">
                      <button
                        onClick={() => openTripView(trip)}
                        className="inline-flex items-center gap-1.5 font-utility font-semibold text-[13px] px-4 py-2 rounded-full bg-chili text-chili-ink"
                      >
                        <MapTrifold size={14} /> {c.view}
                      </button>
                      <button
                        onClick={() => handleShare(trip)}
                        disabled={shareStatusById[trip.id] === 'sharing'}
                        className="inline-flex items-center gap-1.5 font-utility font-semibold text-[13px] px-4 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors disabled:opacity-70"
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
            onClick={() => setOpenTrip(null)}
            className="inline-flex items-center gap-2 font-utility font-semibold text-[13.5px] text-ink-muted hover:text-chili transition-colors mb-6"
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
            animate="mount"
          />
        </div>
      )}
    </div>
  )
}
