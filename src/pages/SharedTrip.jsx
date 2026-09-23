import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapTrifold, LinkBreak } from '@phosphor-icons/react'
import ItineraryTicket from '../components/ticket/ItineraryTicket.jsx'
import { getCity, getPlace, registerCustomPlaces } from '../data/destinations.js'
import { getPublicItinerary } from '../lib/itineraries.js'
import { fetchCustomPlaces } from '../lib/customPlacesCache.js'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const C = {
  vi: {
    eyebrow: 'Lịch trình được chia sẻ',
    notFound: 'Không tìm thấy lịch trình này — có thể liên kết đã bị xoá hoặc không còn công khai.',
    loading: 'Đang tải lịch trình…',
    notFoundTitle: 'Không mở được lịch trình',
    cta: 'Tự tạo lịch trình của riêng bạn',
  },
  en: {
    eyebrow: 'Shared itinerary',
    notFound: "This itinerary couldn't be found — the link may be deleted or no longer public.",
    loading: 'Loading the itinerary…',
    notFoundTitle: 'Cannot open this itinerary',
    cta: 'Plan your own trip',
  },
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

export default function SharedTrip() {
  const { id } = useParams()
  const { lang } = useLanguage()
  const c = C[lang]
  const [status, setStatus] = useState('loading') // loading | ready | not-found
  const [trip, setTrip] = useState(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getPublicItinerary(id).then(async (data) => {
      if (cancelled) return
      if (!data) {
        setStatus('not-found')
        return
      }
      await hydrateCustomPlaces(data.days)
      if (cancelled) return
      setTrip(data)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-12 md:py-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="max-w-[700px] mb-10">
        <motion.span variants={fadeUp} className="eyebrow eyebrow-tick">
          {c.eyebrow}
        </motion.span>
      </motion.div>

      {status === 'loading' && <Spinner label={c.loading} />}
      {status === 'not-found' && (
        <EmptyState
          icon={LinkBreak}
          title={c.notFoundTitle}
          body={c.notFound}
          action={(
            <Link to="/plan" className="inline-flex items-center gap-2 rounded-full bg-chili px-6 py-[13px] font-utility text-md font-semibold text-chili-ink shadow-soft transition-shadow hover:shadow-lifted">
              <MapTrifold size={16} /> {c.cta}
            </Link>
          )}
        />
      )}

      {status === 'ready' && trip && (
        <>
          <ItineraryTicket
            city={tripCity(trip)}
            days={trip.days}
            hotels={trip.hotels ?? []}
            startDate={trip.start_date}
            people={trip.people}
            budget={trip.budget}
            transport={trip.transport}
            preferredTags={trip.prefs ?? []}
            animate="mount"
          />
          <div className="text-center mt-8">
            <Link
              to="/plan"
              className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[14px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow"
            >
              <MapTrifold size={16} /> {c.cta}
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
