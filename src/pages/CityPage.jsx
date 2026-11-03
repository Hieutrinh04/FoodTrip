import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapTrifold, CalendarPlus, Star, Info } from '@phosphor-icons/react'
import { getCity } from '../data/destinations.js'
import { fetchCityCounts, sampleEateries, sampleSights, topCatalogPlaces } from '../lib/cityStats.js'
import { fetchPlaceCatalog } from '../lib/placeCatalog.js'
import { usePageMeta } from '../hooks/usePageMeta.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import PlaceCard from '../components/destinations/PlaceCard.jsx'
import ShareButton from '../components/ui/ShareButton.jsx'
import NotFound from './NotFound.jsx'

const PlaceDetailsDrawer = lazy(() => import('../components/map/PlaceDetailsDrawer.jsx'))

const C = {
  vi: {
    back: 'Tất cả thành phố', eyebrow: 'Thành phố',
    kept: (n) => `${n.toLocaleString('vi-VN')} địa điểm đã lưu trên FoodTrip`, sample: (n) => `${n} địa điểm mẫu`,
    map: 'Xem trên bản đồ', plan: 'Lên lịch ở đây',
    topTitle: 'Quán đã lưu được đánh giá tốt', topNote: 'Điểm sao và số lượt đánh giá theo Google; FoodTrip không tự chấm.',
    topEmpty: 'FoodTrip chưa lưu quán nào có đánh giá ở đây. Tìm trên bản đồ để thêm quán mới.', topError: 'Chưa tải được danh sách quán đã lưu.',
    details: 'Chi tiết', sampleTitle: 'Địa điểm mẫu', sampleNote: 'Bộ dữ liệu mẫu đi kèm ứng dụng để minh hoạ — điểm và nhận xét của các địa điểm này không phải của người dùng thật.',
    sights: 'Điểm tham quan', loading: 'Đang tải…',
    metaDesc: (name, tagline) => `${name}: ${tagline}. Xem quán trên bản đồ và lên lịch ăn chơi cùng FoodTrip.`,
  },
  en: {
    back: 'All cities', eyebrow: 'City',
    kept: (n) => `${n.toLocaleString('en-US')} place${n > 1 ? 's' : ''} kept on FoodTrip`, sample: (n) => `${n} sample places`,
    map: 'See on the map', plan: 'Plan a trip here',
    topTitle: 'Well-rated places people kept', topNote: 'Stars and review counts are Google’s; FoodTrip does not rate them itself.',
    topEmpty: 'FoodTrip has no rated places kept here yet. Search the map to add some.', topError: 'Could not load the kept places.',
    details: 'Details', sampleTitle: 'Sample places', sampleNote: 'A sample dataset shipped with the app for illustration — the scores and reviews of these places are not from real users.',
    sights: 'Sights', loading: 'Loading…',
    metaDesc: (name, tagline) => `${name}: ${tagline}. See places on the map and plan a food trip with FoodTrip.`,
  },
}

/** /thanh-pho/:cityId — what FoodTrip has in one city, and the ways into it. */
export default function CityPage() {
  const { cityId } = useParams()
  const city = getCity(cityId)
  return city ? <CityContent key={city.id} city={city} /> : <NotFound />
}

function CityContent({ city }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const navigate = useNavigate()
  const name = city.name[lang]
  const [count, setCount] = useState(undefined) // undefined loading · null unavailable · number
  const [top, setTop] = useState({ status: 'loading', places: [] })
  const [detail, setDetail] = useState(null)
  const closeDetail = useCallback(() => setDetail(null), [])
  const eateries = sampleEateries(city.id)
  const sights = sampleSights(city.id)

  usePageMeta({ title: name, description: c.metaDesc(name, city.tagline[lang]), image: city.image })

  useEffect(() => {
    let live = true
    fetchCityCounts().then((counts) => { if (live) setCount(counts ? counts[city.id] ?? 0 : null) })
    fetchPlaceCatalog()
      .then((catalog) => { if (live) setTop({ status: 'ready', places: topCatalogPlaces(catalog, city.id) }) })
      .catch(() => { if (live) setTop({ status: 'error', places: [] }) })
    return () => { live = false }
  }, [city.id])

  function planHere() {
    navigate('/plan', { state: { assistantRequest: { text: lang === 'vi' ? `đi ${city.name.vi}` : `trip to ${city.name.en}`, at: Date.now() } } })
  }

  return (
    <div className="pb-20">
      <section className="relative isolate overflow-hidden">
        <img src={city.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" loading="eager" referrerPolicy="no-referrer" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#17130f]/90 via-[#17130f]/55 to-[#17130f]/20" />
        <div className="mx-auto max-w-[1180px] px-5 pb-10 pt-8 md:px-8 md:pb-14">
          <Link to="/#thanh-pho" className="inline-flex items-center gap-2 font-utility text-sm font-semibold text-white/85 hover:text-white"><ArrowLeft size={16} />{c.back}</Link>
          <div className="mt-16 max-w-[640px] md:mt-24">
            <span className="eyebrow eyebrow-tick text-[#FF9E6D]">{c.eyebrow}</span>
            <h1 className="mt-3 text-4xl font-bold leading-[1.08] text-white md:text-5xl">{name}</h1>
            <p className="mt-3 text-lg text-white/90">{city.tagline[lang]}</p>
            <ul className="mt-4 flex flex-wrap gap-2 font-utility text-xs font-semibold text-white">
              {typeof count === 'number' && count > 0 && <li className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{c.kept(count)}</li>}
              {eateries.length + sights.length > 0 && <li className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{c.sample(eateries.length + sights.length)}</li>}
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to={`/explore?city=${city.id}`} className="inline-flex items-center gap-2 rounded-full bg-[#a02e10] px-5 py-3 font-utility text-sm font-semibold text-white"><MapTrifold size={16} />{c.map}</Link>
              <button type="button" onClick={planHere} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-utility text-sm font-semibold text-[#17130f]"><CalendarPlus size={16} />{c.plan}</button>
              <ShareButton title={name} text={city.tagline[lang]} className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-white/60 px-4 py-2.5 font-utility text-sm font-semibold text-white hover:bg-white/10" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-5 pt-12 md:px-8">
        <h2 className="text-2xl font-bold">{c.topTitle}</h2>
        <p className="mt-1 text-sm text-ink-muted">{c.topNote}</p>
        {top.status === 'loading' && <p role="status" className="mt-4 text-sm text-ink-muted">{c.loading}</p>}
        {top.status === 'error' && <p className="mt-4 text-sm text-ink-muted">{c.topError}</p>}
        {top.status === 'ready' && !top.places.length && <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-6 text-sm text-ink-muted">{c.topEmpty} <Link to={`/explore?city=${city.id}`} className="font-semibold text-chili hover:underline">{c.map} →</Link></p>}
        {top.places.length > 0 && <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {top.places.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4">
              <div className="min-w-0">
                <div className="font-bold">{p.name[lang] ?? p.name.vi}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><Star size={12} weight="fill" className="text-lantern" />{p.googleRating} · {(p.googleRatingCount ?? 0).toLocaleString('vi-VN')}</div>
                {p.address?.vi && <div className="mt-1 line-clamp-2 text-xs text-ink-faint">{p.address.vi}</div>}
              </div>
              <button type="button" onClick={() => setDetail(p)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-3 py-1.5 font-utility text-2xs font-semibold hover:border-chili"><Info size={12} />{c.details}</button>
            </li>
          ))}
        </ul>}
      </section>

      {eateries.length + sights.length > 0 && <section className="mx-auto max-w-[1180px] px-5 pt-14 md:px-8">
        <h2 className="text-2xl font-bold">{c.sampleTitle}</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">{c.sampleNote}</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...eateries, ...sights].map((p, i) => <PlaceCard key={p.id} place={p} index={i} />)}
        </div>
      </section>}

      {detail && <Suspense fallback={null}><PlaceDetailsDrawer place={detail} onClose={closeDetail} /></Suspense>}
    </div>
  )
}
