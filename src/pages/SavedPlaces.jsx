import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookmarkSimple, Compass, Trash, UserCircle } from '@phosphor-icons/react'
import PlaceCard from '../components/destinations/PlaceCard.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { getPlace } from '../data/destinations.js'
import { getSavedPlaceIds, setPlaceSaved } from '../lib/savedPlaces.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const C = {
  vi: {
    eyebrow: 'Địa điểm đã lưu', title: 'Sổ tay ăn ngon của bạn.',
    loading: 'Đang tải địa điểm đã lưu…', emptyTitle: 'Chưa lưu địa điểm nào',
    empty: 'Khi thấy một quán hoặc điểm đến yêu thích, bấm “Lưu địa điểm” để xem lại tại đây.',
    explore: 'Khám phá địa điểm', remove: 'Bỏ lưu', error: 'Không tải được danh sách đã lưu. Hãy thử lại.',
    localHint: 'Danh sách này đang được lưu trên thiết bị. Đăng nhập để đồng bộ sang tài khoản của bạn.', login: 'Đăng nhập để đồng bộ',
  },
  en: {
    eyebrow: 'Saved places', title: 'Your personal food notebook.',
    loading: 'Loading saved places…', emptyTitle: 'No saved places yet',
    empty: 'When you find a place you like, choose “Save place” to keep it here.',
    explore: 'Explore places', remove: 'Remove', error: 'Saved places could not be loaded. Please try again.',
    localHint: 'This list is stored on this device. Log in to sync it to your account.', login: 'Log in to sync',
  },
}

export default function SavedPlaces() {
  const { lang } = useLanguage()
  const { user, hasAuth } = useAuth()
  const c = C[lang]
  const [status, setStatus] = useState('loading')
  const [places, setPlaces] = useState([])
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getSavedPlaceIds(user?.id)
      .then((ids) => {
        if (cancelled) return
        setPlaces(ids.map(getPlace).filter(Boolean))
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => { cancelled = true }
  }, [user?.id])

  async function removePlace(placeId) {
    const previous = places
    setPlaces((current) => current.filter((place) => place.id !== placeId))
    try {
      await setPlaceSaved({ userId: user?.id, placeId, saved: false })
    } catch {
      setPlaces(previous)
      setStatus('error')
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-12 md:px-8 md:py-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="mb-8 max-w-[700px]">
        <motion.span variants={fadeUp} className="eyebrow eyebrow-tick">{c.eyebrow}</motion.span>
        <motion.h1 variants={fadeUp} className="mt-3 text-3xl font-bold leading-[1.15] md:text-4xl">{c.title}</motion.h1>
      </motion.div>

      {!user && hasAuth && status === 'ready' && places.length > 0 && (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-lantern/30 bg-lantern/10 px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-sm text-ink-muted">{c.localHint}</p>
          <button type="button" onClick={() => setAuthOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 py-2 font-utility text-xs font-semibold hover:border-chili hover:text-chili">
            <UserCircle size={14} />{c.login}
          </button>
        </div>
      )}

      {status === 'loading' && <Spinner label={c.loading} />}
      {status === 'error' && <p role="alert" className="mb-5 rounded-xl border border-chili/25 bg-chili/10 px-4 py-3 text-sm text-chili">{c.error}</p>}
      {status !== 'loading' && places.length === 0 && (
        <EmptyState
          icon={BookmarkSimple}
          title={c.emptyTitle}
          body={c.empty}
          action={<Link to="/explore" className="inline-flex items-center gap-2 rounded-full bg-chili px-6 py-[13px] font-utility text-md font-semibold text-chili-ink shadow-soft"><Compass size={16} />{c.explore}</Link>}
        />
      )}
      {places.length > 0 && (
        <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
          {places.map((place, index) => (
            <motion.div key={place.id} variants={fadeUp} className="relative">
              <PlaceCard place={place} index={index} />
              <button type="button" onClick={() => removePlace(place.id)} aria-label={`${c.remove}: ${place.name[lang]}`} title={c.remove} className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/95 text-ink-muted shadow-soft backdrop-blur hover:bg-chili hover:text-chili-ink">
                <Trash size={14} />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}
