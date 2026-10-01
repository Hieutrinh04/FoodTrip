import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MapPin, Clock, CheckCircle, XCircle, Star, BookmarkSimple, ArrowLeft,
} from '@phosphor-icons/react'
import CityPattern from '../components/CityPattern.jsx'
import CategoryIcon from '../components/ui/CategoryIcon.jsx'
import PlaceCard from '../components/destinations/PlaceCard.jsx'
import VideoReviewCard from '../components/video/VideoReviewCard.jsx'
import YoutubeShortsSection from '../components/video/YoutubeShortsSection.jsx'
import TikTokAutoSuggestSection from '../components/video/TikTokAutoSuggestSection.jsx'
import { getPlace, getCity, getPlacesByCity, TAGS, CATEGORY_LABEL } from '../data/destinations.js'
import { usePlaceEnrichment } from '../hooks/usePlaceEnrichment.js'
import { useVideoReviewsForPlace } from '../hooks/useVideoReviewsForPlace.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { getSavedPlaceIds, setPlaceSaved } from '../lib/savedPlaces.js'
import { fadeUp, staggerContainer, viewportOnce } from '../motion/variants.js'
import NotFound from './NotFound.jsx'

const C = {
  vi: {
    back: 'Quay lại khám phá',
    openNow: 'Đang mở cửa', closedNow: 'Đã đóng cửa',
    hours: (o, cl) => `${o} – ${cl}`,
    save: 'Lưu địa điểm', saved: 'Đã lưu',
    reviewsTitle: 'Nhận xét minh hoạ',
    sampleRating: 'điểm mẫu',
    sampleNote: 'Địa điểm này thuộc bộ dữ liệu mẫu dùng để trình diễn. Điểm, mô tả và các nhận xét bên dưới được viết minh hoạ, không phải đánh giá của khách thật — hãy xem điểm và đánh giá Google (nếu có) để có thông tin thật.',
    relatedTitle: (city) => `Địa điểm khác tại ${city}`,
    priceLabel: 'Mức giá',
    googleReviewsTitle: 'Đánh giá thật từ Google',
    viewOnGoogle: 'Xem trên Google Maps',
    googleRatingsCount: (n) => `${n.toLocaleString('vi-VN')} lượt đánh giá`,
    videoReviewsTitle: 'Video review từ mạng xã hội',
    shareVideoCta: 'Chia sẻ video review',
  },
  en: {
    back: 'Back to explore',
    openNow: 'Open now', closedNow: 'Closed now',
    hours: (o, cl) => `${o} – ${cl}`,
    save: 'Save place', saved: 'Saved',
    reviewsTitle: 'Illustrative reviews',
    sampleRating: 'sample score',
    sampleNote: 'This place is part of the sample dataset used for demonstration. Its score, description and the reviews below are illustrative, not written by real visitors — see the Google rating and reviews (where available) for real information.',
    relatedTitle: (city) => `More in ${city}`,
    priceLabel: 'Price level',
    googleReviewsTitle: 'Real reviews from Google',
    viewOnGoogle: 'View on Google Maps',
    googleRatingsCount: (n) => `${n.toLocaleString('en-US')} ratings`,
    videoReviewsTitle: 'Video reviews from social media',
    shareVideoCta: 'Share a video review',
  },
}

function isOpenNow(hours) {
  if (hours.open === '00:00' && hours.close === '24:00') return true
  const now = new Date()
  const [oh, om] = hours.open.split(':').map(Number)
  const [ch, cm] = hours.close.split(':').map(Number)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const openMin = oh * 60 + om
  const closeMin = ch * 60 + cm
  if (closeMin < openMin) return nowMin >= openMin || nowMin <= closeMin
  return nowMin >= openMin && nowMin <= closeMin
}

export default function PlaceDetail() {
  const { id } = useParams()
  const { lang } = useLanguage()
  const c = C[lang]
  const place = getPlace(id)
  const { user } = useAuth()
  const [saved, setSaved] = useState(false)
  const enrichment = usePlaceEnrichment(place)
  const videoReviews = useVideoReviewsForPlace({ googlePlaceId: enrichment.data?.placeId, name: place?.name?.vi })

  useEffect(() => {
    if (!place) return
    let cancelled = false
    getSavedPlaceIds(user?.id)
      .then((ids) => { if (!cancelled) setSaved(ids.includes(place.id)) })
      .catch(() => { /* keep the current button state if loading fails */ })
    return () => { cancelled = true }
  }, [place, user])

  if (!place) return <NotFound />

  const city = getCity(place.city)
  const related = getPlacesByCity(place.city).filter((p) => p.id !== place.id).slice(0, 3)
  const open = isOpenNow(place.hours)

  async function toggleSave() {
    const next = !saved
    setSaved(next)
    try {
      await setPlaceSaved({ userId: user?.id, placeId: place.id, saved: next })
    } catch {
      setSaved(!next)
    }
  }

  return (
    <div className="pb-20">
      <div className="max-w-[1180px] mx-auto px-5 md:px-8 pt-8">
        <Link to="/explore" className="inline-flex items-center gap-2 text-md font-utility font-semibold text-ink-muted hover:text-chili transition-colors">
          <ArrowLeft size={16} /> {c.back}
        </Link>
      </div>

      <div className="max-w-[1180px] mx-auto px-5 md:px-8 mt-5 grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative h-[240px] md:h-[340px] rounded-2xl overflow-hidden"
        >
          {place.image ? (
            <img src={place.image} alt={place.name[lang]} className="h-full w-full object-cover" />
          ) : (
            <CityPattern pattern={city.pattern} accent={city.accent} className="h-full" />
          )}
          <span className="absolute top-4 left-4 w-10 h-10 rounded-full bg-surface/90 backdrop-blur flex items-center justify-center">
            <CategoryIcon category={place.category} size={18} />
          </span>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="flex flex-col gap-4">
          {/* The save button shares the eyebrow's row, not the title's: beside
              the title it squeezed a three-word name to one word per line. */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-utility text-xs font-bold uppercase tracking-wide text-ink-faint">{city.name[lang]} · {CATEGORY_LABEL[place.category][lang]}</span>
              <button
                onClick={toggleSave}
                aria-pressed={saved}
                className={`shrink-0 flex items-center gap-2 font-utility text-sm font-semibold px-4 py-2.5 rounded-full border-[1.5px] transition-colors ${saved ? 'bg-herb border-herb text-herb-ink' : 'border-line-strong hover:border-chili'}`}
              >
                <BookmarkSimple size={16} weight={saved ? 'fill' : 'regular'} />
                {saved ? c.saved : c.save}
              </button>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight mt-2">{place.name[lang]}</h1>
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-utility font-bold text-md text-lantern">
            {/* The curated rating is invented for the demo dataset; it says so
                next to the number rather than passing for a real score. */}
            <span className="flex items-center gap-2">
              <Star size={16} weight="fill" /> {place.rating.toFixed(1)}
              <span className="font-normal text-xs text-ink-faint">({c.sampleRating})</span>
            </span>
            {enrichment.status === 'ready' && enrichment.data?.rating != null && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
                <Star size={13} weight="fill" className="text-chili" />
                {enrichment.data.rating.toFixed(1)} · Google ({enrichment.data.userRatingCount ?? 0})
              </span>
            )}
            <span className="text-ink-faint font-normal">{'đ'.repeat(place.price || 1)}</span>
          </motion.div>

          <motion.p variants={fadeUp} className="text-base text-ink-muted">{place.longDesc[lang]}</motion.p>

          <motion.div variants={fadeUp} className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4">
            <div className="flex items-center gap-2 text-md">
              <MapPin size={16} className="text-chili shrink-0" /> {place.address[lang]}
            </div>
            <div className="flex items-center gap-2 text-md">
              <Clock size={16} className="text-chili shrink-0" /> {c.hours(place.hours.open, place.hours.close)}
              <span className={`ml-2 inline-flex items-center gap-1 font-utility text-xs font-bold ${open ? 'text-herb' : 'text-ink-faint'}`}>
                {open ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {open ? c.openNow : c.closedNow}
              </span>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-wrap gap-2">
            {place.tags.map((tag) => (
              <span key={tag} className="font-utility text-xs font-semibold px-3 py-1.5 rounded-full bg-paper-2 text-ink-muted">
                {TAGS[tag][lang]}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </div>

      <div className="max-w-[1180px] mx-auto px-5 md:px-8 mt-14">
        <motion.h2 initial="hidden" whileInView="show" viewport={viewportOnce} variants={fadeUp} className="text-xl font-bold mb-5">
          {c.reviewsTitle}
        </motion.h2>
        <p className="-mt-2 mb-5 max-w-[70ch] rounded-lg border border-lantern/30 bg-lantern/10 px-4 py-3 text-sm text-ink-muted">{c.sampleNote}</p>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={staggerContainer(0.1)}
          className="grid gap-4 grid-cols-1 md:grid-cols-2"
        >
          {place.reviews.map((r) => (
            <motion.div key={r.name} variants={fadeUp} className="bg-surface border border-line rounded-xl p-5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-md">{r.name}</span>
                <div className="flex gap-0.5 text-lantern">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={13} weight={i < r.rating ? 'fill' : 'regular'} />
                  ))}
                </div>
              </div>
              <p className="text-md text-ink-muted">"{r.quote[lang]}"</p>
              <div className="flex flex-wrap gap-1.5">
                {r.tags.map((t) => (
                  <span key={t} className="font-utility text-2xs font-semibold px-2.5 py-1 rounded-full bg-paper-2 text-ink-muted">{t}</span>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {enrichment.status === 'ready' && enrichment.data?.reviews?.length > 0 && (
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 mt-14">
          <motion.div initial="hidden" whileInView="show" viewport={viewportOnce} variants={fadeUp} className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <h2 className="text-xl font-bold">{c.googleReviewsTitle}</h2>
            {enrichment.data.mapsUri && (
              <a href={enrichment.data.mapsUri} target="_blank" rel="noreferrer" className="font-utility text-sm font-semibold text-chili hover:underline">
                {c.viewOnGoogle} ↗
              </a>
            )}
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={viewportOnce}
            variants={staggerContainer(0.1)}
            className="grid gap-4 grid-cols-1 md:grid-cols-2"
          >
            {enrichment.data.reviews.map((r, i) => (
              <motion.div key={i} variants={fadeUp} className="bg-surface border border-line rounded-xl p-5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-md">{r.author}</span>
                  <div className="flex gap-0.5 text-lantern">
                    {Array.from({ length: 5 }).map((_, si) => (
                      <Star key={si} size={13} weight={si < Math.round(r.rating) ? 'fill' : 'regular'} />
                    ))}
                  </div>
                </div>
                {r.text && <p className="text-md text-ink-muted line-clamp-4">"{r.text}"</p>}
                {r.relativePublishTime && (
                  <span className="font-utility text-xs text-ink-faint">{r.relativePublishTime}</span>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      <YoutubeShortsSection query={`${place.name.vi} ${city.name.vi}`} name={place.name.vi} location={city.name.vi} />
      <TikTokAutoSuggestSection query={`${place.name.vi} ${city.name.vi}`} name={place.name.vi} location={city.name.vi} />

      {videoReviews.length > 0 && (
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 mt-14">
          <motion.div initial="hidden" whileInView="show" viewport={viewportOnce} variants={fadeUp} className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <h2 className="text-xl font-bold">{c.videoReviewsTitle}</h2>
            <Link to="/share" className="font-utility text-sm font-semibold text-chili hover:underline">
              {c.shareVideoCta} ↗
            </Link>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={viewportOnce}
            variants={staggerContainer(0.1)}
            className="grid gap-4 grid-cols-1 md:grid-cols-2"
          >
            {videoReviews.map((r) => (
              <motion.div key={r.id} variants={fadeUp}>
                <VideoReviewCard review={r} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      {related.length > 0 && (
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 mt-16">
          <motion.h2 initial="hidden" whileInView="show" viewport={viewportOnce} variants={fadeUp} className="text-xl font-bold mb-5">
            {c.relatedTitle(city.name[lang])}
          </motion.h2>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={viewportOnce}
            variants={staggerContainer(0.1)}
            className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
          >
            {related.map((p, i) => (
              <PlaceCard key={p.id} place={p} index={i} />
            ))}
          </motion.div>
        </div>
      )}
    </div>
  )
}
