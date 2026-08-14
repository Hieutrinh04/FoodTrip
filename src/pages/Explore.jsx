import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MagnifyingGlass, SmileySad, MapTrifold, ListBullets, ForkKnife, Coffee, Camera,
  Clock, Star, SlidersHorizontal, X, NavigationArrow, SpinnerGap,
} from '@phosphor-icons/react'
import ExploreMap from '../components/map/ExploreMap.jsx'
import Chip from '../components/ui/Chip.jsx'
import CityPattern from '../components/CityPattern.jsx'
import { CITIES, PLACES, CATEGORY_LABEL, getCity } from '../data/destinations.js'
import { FOODTRIP_CRITERIA, getFoodTripScore, scoreForCriterion } from '../lib/foodTripScore.js'
import { haversineKm } from '../lib/trackAsia.js'
import { searchExplorePlaces } from '../lib/explorePlaceSearch.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const COPY = {
  vi: {
    eyebrow: 'Bản đồ FoodTrip', title: 'Ăn đâu ngon? Xem điểm thật rõ.',
    sub: 'Khám phá quán ăn trên bản đồ và so sánh theo những tiêu chí quan trọng với bạn.',
    search: 'Tìm tên quán, món ăn hoặc địa chỉ…', all: 'Tất cả', open: 'Đang mở cửa',
    filters: 'Bộ lọc', results: (n) => `${n} địa điểm`, empty: 'Không có địa điểm phù hợp với bộ lọc này.',
    overall: 'Tổng hợp', rating: 'Điểm tối thiểu', price: 'Mức giá', sort: 'Sắp xếp',
    relevant: 'Phù hợp nhất', highest: 'Điểm cao nhất', lowPrice: 'Giá thấp nhất',
    viewDetail: 'Xem chi tiết', map: 'Bản đồ', list: 'Danh sách', scoreTitle: 'Điểm FoodTrip',
    reviewCount: (n) => `${n} đánh giá cộng đồng`, clear: 'Xóa bộ lọc', priceUnit: '₫',
    nearMe: 'Gần tôi', locating: 'Đang định vị', locationDenied: 'Không lấy được vị trí. Hãy cấp quyền và thử lại.',
    radius: 'Bán kính', distance: (km) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`,
    match: 'phù hợp', foodType: 'Loại món',
  },
  en: {
    eyebrow: 'FoodTrip Map', title: 'Find the right place, with scores that matter.',
    sub: 'Explore dining places on the map and compare them using FoodTrip-specific criteria.',
    search: 'Search places, dishes or addresses…', all: 'All', open: 'Open now',
    filters: 'Filters', results: (n) => `${n} places`, empty: 'No places match these filters.',
    overall: 'Overall', rating: 'Minimum score', price: 'Price', sort: 'Sort',
    relevant: 'Most relevant', highest: 'Highest score', lowPrice: 'Lowest price',
    viewDetail: 'View details', map: 'Map', list: 'List', scoreTitle: 'FoodTrip score',
    reviewCount: (n) => `${n} community reviews`, clear: 'Clear filters', priceUnit: '$',
    nearMe: 'Near me', locating: 'Locating', locationDenied: 'Could not access location. Allow permission and try again.',
    radius: 'Radius', distance: (km) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`,
    match: 'match', foodType: 'Food type',
  },
}

const CATEGORY_ICON = { food: ForkKnife, cafe: Coffee, attraction: Camera }
const CRITERION_KEYS = ['overall', ...Object.keys(FOODTRIP_CRITERIA)]
const FOOD_TYPES = [
  { id: 'pho', vi: 'Phở', en: 'Pho' },
  { id: 'coffee', vi: 'Cà phê', en: 'Coffee' },
  { id: 'seafood', vi: 'Hải sản', en: 'Seafood' },
  { id: 'noodles', vi: 'Bún · Mì', en: 'Noodles' },
  { id: 'rice', vi: 'Cơm', en: 'Rice' },
  { id: 'hotpot', vi: 'Lẩu · Nướng', en: 'Hotpot · Grill' },
  { id: 'snacks', vi: 'Ăn vặt', en: 'Snacks' },
  { id: 'vegetarian', vi: 'Món chay', en: 'Vegetarian' },
]

function placeMatchesFoodType(place, type) {
  if (type === 'all') return true
  const text = `${place.name.vi} ${place.name.en} ${place.shortDesc.vi} ${(place.tags || []).join(' ')}`.toLowerCase()
  const patterns = {
    pho: ['phở', 'pho'], coffee: ['cà phê', 'coffee', 'cafe'], seafood: ['hải sản', 'seafood', 'tôm', 'ốc'],
    noodles: ['bún', 'mì', 'hủ tiếu', 'cao lầu', 'noodle'], rice: ['cơm', 'rice'],
    hotpot: ['lẩu', 'nướng', 'hotpot', 'grill'], snacks: ['ăn vặt', 'bánh', 'streetfood'], vegetarian: ['chay', 'vegetarian'],
  }
  return patterns[type]?.some((term) => text.includes(term)) ?? true
}

function calculateMatch(place, distanceKm) {
  const score = getFoodTripScore(place).overall / 5
  const distanceFit = distanceKm == null ? 0.55 : Math.max(0, 1 - distanceKm / 15)
  const openFit = isOpenNow(place.hours) ? 1 : 0.35
  const valueFit = Math.max(0.25, 1 - place.price * 0.2)
  return Math.round((score * 0.45 + distanceFit * 0.3 + openFit * 0.15 + valueFit * 0.1) * 100)
}

function isOpenNow(hours) {
  if (!hours?.open || !hours?.close) return false
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [openHour, openMinute] = hours.open.split(':').map(Number)
  const [closeHour, closeMinute] = hours.close.split(':').map(Number)
  const open = openHour * 60 + openMinute
  const close = closeHour * 60 + closeMinute
  if (close >= open) return current >= open && current <= close
  return current >= open || current <= close
}

function reviewCount(place) {
  return Math.max(place.reviews?.length ?? 0, 8 + (place.id.length * 17) % 180)
}

export default function Explore() {
  const { lang } = useLanguage()
  const copy = COPY[lang]
  const [searchParams, setSearchParams] = useSearchParams()
  const cityFilter = searchParams.get('city') || 'all'
  const [category, setCategory] = useState('all')
  const [foodType, setFoodType] = useState('all')
  const [query, setQuery] = useState('')
  const [criterion, setCriterion] = useState('overall')
  const [minScore, setMinScore] = useState(0)
  const [price, setPrice] = useState('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [sort, setSort] = useState('relevant')
  const [selectedId, setSelectedId] = useState(null)
  const [mobileView, setMobileView] = useState('list')
  const [userLocation, setUserLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle')
  const [radiusKm, setRadiusKm] = useState(5)
  const [resolvedLocations, setResolvedLocations] = useState({})
  const [livePlaces, setLivePlaces] = useState([])
  const [liveStatus, setLiveStatus] = useState('idle')

  useEffect(() => {
    if (foodType === 'all' || (!userLocation && cityFilter === 'all')) {
      setLivePlaces([])
      setLiveStatus('idle')
      return undefined
    }
    let cancelled = false
    setLiveStatus('loading')
    const city = CITIES.find((item) => item.id === cityFilter)
    searchExplorePlaces({ foodType, city, origin: userLocation, radiusKm })
      .then((places) => {
        if (!cancelled) {
          setLivePlaces(places)
          setLiveStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLivePlaces([])
          setLiveStatus('error')
        }
      })
    return () => { cancelled = true }
  }, [foodType, cityFilter, userLocation, radiusKm])

  function setCity(id) {
    if (id === 'all') setSearchParams({}, { replace: true })
    else setSearchParams({ city: id }, { replace: true })
    setSelectedId(null)
  }

  function clearFilters() {
    setCategory('all')
    setFoodType('all')
    setCriterion('overall')
    setMinScore(0)
    setPrice('all')
    setOpenOnly(false)
    setSort('relevant')
    setQuery('')
    setUserLocation(null)
    setLocationStatus('idle')
    setRadiusKm(5)
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setLocationStatus('error')
      return
    }
    setLocationStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationStatus('ready')
        setSort('relevant')
      },
      () => setLocationStatus('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    )
  }

  function mergeResolvedLocations(nextLocations) {
    setResolvedLocations((previous) => {
      let changed = false
      const merged = { ...previous }
      Object.entries(nextLocations).forEach(([id, location]) => {
        if (previous[id]?.lat !== location.lat || previous[id]?.lng !== location.lng) {
          merged[id] = location
          changed = true
        }
      })
      return changed ? merged : previous
    })
  }

  function selectFromMap(id) {
    setSelectedId(id)
    document.getElementById(`explore-place-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const filtered = useMemo(() => {
    const sourcePlaces = liveStatus === 'ready' ? livePlaces : PLACES
    const result = sourcePlaces.filter((place) => {
      if (cityFilter !== 'all' && place.city !== cityFilter) return false
      if (category !== 'all' && place.category !== category) return false
      if (!placeMatchesFoodType(place, foodType)) return false
      if (price !== 'all' && place.price !== Number(price)) return false
      if (openOnly && !isOpenNow(place.hours)) return false
      if (scoreForCriterion(place, criterion) < minScore) return false
      const location = place.location ?? resolvedLocations[place.id]
      const distanceKm = userLocation && location ? haversineKm(userLocation, location) : null
      if (userLocation && distanceKm != null && distanceKm > radiusKm) return false
      if (query.trim()) {
        const needle = query.trim().toLocaleLowerCase(lang === 'vi' ? 'vi' : 'en')
        const haystack = `${place.name.vi} ${place.name.en} ${place.address.vi} ${place.address.en} ${place.shortDesc.vi} ${place.shortDesc.en}`.toLocaleLowerCase(lang === 'vi' ? 'vi' : 'en')
        if (!haystack.includes(needle)) return false
      }
      return true
    })
    const enriched = result.map((place) => {
      const location = place.location ?? resolvedLocations[place.id]
      const distanceKm = userLocation && location ? haversineKm(userLocation, location) : null
      return { ...place, location, distanceKm, matchScore: userLocation ? calculateMatch(place, distanceKm) : null }
    })
    if (sort === 'highest') enriched.sort((a, b) => scoreForCriterion(b, criterion) - scoreForCriterion(a, criterion))
    if (sort === 'relevant' && userLocation) enriched.sort((a, b) => b.matchScore - a.matchScore)
    if (sort === 'low-price') enriched.sort((a, b) => a.price - b.price)
    return enriched
  }, [cityFilter, category, foodType, price, openOnly, criterion, minScore, query, sort, lang, userLocation, radiusKm, resolvedLocations, livePlaces, liveStatus])

  const activeFilterCount = [category !== 'all', foodType !== 'all', price !== 'all', openOnly, minScore > 0, criterion !== 'overall', Boolean(userLocation)].filter(Boolean).length

  return (
    <div className="min-h-[calc(100vh-72px)] bg-paper">
      <header className="border-b border-line bg-surface px-4 py-5 sm:px-6 lg:px-8">
        <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="mx-auto max-w-[1600px]">
          <motion.span variants={fadeUp} className="font-utility text-[11.5px] font-bold uppercase tracking-[.14em] text-chili">{copy.eyebrow}</motion.span>
          <motion.div variants={fadeUp} className="mt-1 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">{copy.title}</h1>
              <p className="mt-1 max-w-[65ch] text-[14px] text-ink-muted md:text-[15px]">{copy.sub}</p>
            </div>
            <div className="inline-flex self-start rounded-full bg-paper-2 p-1 lg:hidden">
              <ViewButton active={mobileView === 'list'} onClick={() => setMobileView('list')} icon={ListBullets} label={copy.list} />
              <ViewButton active={mobileView === 'map'} onClick={() => setMobileView('map')} icon={MapTrifold} label={copy.map} />
            </div>
          </motion.div>
        </motion.div>
      </header>

      <div className="sticky top-0 z-30 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <div className="relative min-w-[270px] flex-1 lg:max-w-[430px]">
              <MagnifyingGlass size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="w-full rounded-full border-[1.5px] border-line-strong bg-paper py-2.5 pl-11 pr-10 text-[14px] focus:border-chili" />
              {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-faint hover:text-chili"><X size={15} /></button>}
            </div>
            <FilterSelect value={criterion} onChange={setCriterion} label={copy.scoreTitle}>
              {CRITERION_KEYS.map((key) => <option key={key} value={key}>{key === 'overall' ? copy.overall : FOODTRIP_CRITERIA[key][lang]}</option>)}
            </FilterSelect>
            <FilterSelect value={minScore} onChange={(value) => setMinScore(Number(value))} label={copy.rating}>
              <option value="0">{copy.rating}</option><option value="4">4.0+</option><option value="4.3">4.3+</option><option value="4.5">4.5+</option><option value="4.7">4.7+</option>
            </FilterSelect>
            <FilterSelect value={price} onChange={setPrice} label={copy.price}>
              <option value="all">{copy.price}</option><option value="0">{copy.priceUnit}</option><option value="1">{copy.priceUnit.repeat(2)}</option><option value="2">{copy.priceUnit.repeat(3)}</option><option value="3">{copy.priceUnit.repeat(4)}</option>
            </FilterSelect>
            <button onClick={() => setOpenOnly((value) => !value)} className={`shrink-0 rounded-full border-[1.5px] px-4 py-2.5 font-utility text-[12.5px] font-semibold ${openOnly ? 'border-herb bg-herb text-herb-ink' : 'border-line-strong bg-surface text-ink-muted'}`}><Clock size={14} className="mr-1.5 inline" />{copy.open}</button>
            <button onClick={locateUser} disabled={locationStatus === 'loading'} className={`shrink-0 rounded-full border-[1.5px] px-4 py-2.5 font-utility text-[12.5px] font-semibold disabled:opacity-65 ${userLocation ? 'border-[#2583d8] bg-[#2583d8] text-white' : 'border-line-strong bg-surface text-ink-muted'}`}>
              {locationStatus === 'loading' ? <SpinnerGap size={14} className="mr-1.5 inline animate-spin" /> : <NavigationArrow size={14} weight="fill" className="mr-1.5 inline" />}
              {locationStatus === 'loading' ? copy.locating : copy.nearMe}
            </button>
            {userLocation && (
              <FilterSelect value={radiusKm} onChange={(value) => setRadiusKm(Number(value))} label={copy.radius}>
                <option value="1">1 km</option><option value="3">3 km</option><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option>
              </FilterSelect>
            )}
            {activeFilterCount > 0 && <button onClick={clearFilters} className="shrink-0 rounded-full px-3 py-2 font-utility text-[12px] font-semibold text-chili hover:bg-paper-2">{copy.clear}</button>}
          </div>
          {locationStatus === 'error' && <p className="text-[12px] font-medium text-chili">{copy.locationDenied}</p>}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip active={cityFilter === 'all'} onClick={() => setCity('all')}>{copy.all}</Chip>
            {CITIES.map((city) => <Chip key={city.id} active={cityFilter === city.id} onClick={() => setCity(city.id)}>{city.name[lang]}</Chip>)}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto">
              <Chip active={category === 'all'} onClick={() => setCategory('all')}>{copy.all}</Chip>
              {Object.keys(CATEGORY_LABEL).map((key) => { const Icon = CATEGORY_ICON[key]; return <Chip key={key} active={category === key} onClick={() => setCategory(key)}><Icon size={13} className="mr-1 inline" />{CATEGORY_LABEL[key][lang]}</Chip> })}
            </div>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label={copy.sort} className="shrink-0 rounded-full border border-line-strong bg-surface px-3 py-2 font-utility text-[11.5px] text-ink-muted">
              <option value="relevant">{copy.relevant}</option><option value="highest">{copy.highest}</option><option value="low-price">{copy.lowPrice}</option>
            </select>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label={copy.foodType}>
            <Chip active={foodType === 'all'} onClick={() => setFoodType('all')}>{copy.all}</Chip>
            {FOOD_TYPES.map((type) => <Chip key={type.id} active={foodType === type.id} onClick={() => { setFoodType(type.id); if (type.id === 'coffee') setCategory('cafe'); else if (category === 'cafe') setCategory('food') }}>{type[lang]}</Chip>)}
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 lg:h-[calc(100vh-262px)] lg:grid-cols-[minmax(390px,46%)_1fr]">
        <section className={`${mobileView === 'map' ? 'hidden lg:block' : 'block'} overflow-y-auto border-r border-line bg-paper px-4 py-4 sm:px-6`}>
          <div className="mb-3 flex items-center justify-between"><span className="font-utility text-[12px] font-semibold text-ink-muted">{liveStatus === 'loading' ? (lang === 'vi' ? 'Đang tìm địa điểm thật…' : 'Finding live places…') : copy.results(filtered.length)}</span><span className="inline-flex items-center gap-1 text-[11px] text-ink-faint"><SlidersHorizontal size={13} />{activeFilterCount} {copy.filters.toLowerCase()}</span></div>
          {foodType !== 'all' && !userLocation && cityFilter === 'all' && <div className="mb-3 rounded-xl border border-lantern/30 bg-lantern/10 px-4 py-3 text-[12px] text-ink-muted">{lang === 'vi' ? 'Chọn một thành phố hoặc bấm “Gần tôi” để tải đúng các địa điểm trên bản đồ.' : 'Choose a city or use “Near me” to load matching map places.'}</div>}
          {livePlaces.length > 0 && <div className="mb-3 rounded-xl border border-herb/20 bg-herb/5 px-4 py-2.5 text-[11px] text-ink-muted">{lang === 'vi' ? `Đang hiển thị ${livePlaces.length} địa điểm thật. Điểm FoodTrip hiện là điểm thử nghiệm.` : `Showing ${livePlaces.length} live places. FoodTrip scores are currently demo scores.`}</div>}
          {filtered.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {filtered.map((place, index) => <ExplorePlaceCard key={place.id} place={place} index={index} criterion={criterion} selected={selectedId === place.id} onSelect={() => setSelectedId(place.id)} lang={lang} copy={copy} />)}
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-ink-muted"><SmileySad size={38} /><p>{copy.empty}</p><button onClick={clearFilters} className="font-utility text-[12px] font-semibold text-chili">{copy.clear}</button></div>
          )}
        </section>
        <section className={`${mobileView === 'map' ? 'block' : 'hidden lg:block'} relative min-h-[calc(100vh-220px)] overflow-hidden bg-paper-2 lg:min-h-0`}>
          <ExploreMap places={filtered} criterion={criterion} selectedId={selectedId} onSelect={selectFromMap} userLocation={userLocation} onLocationsResolved={mergeResolvedLocations} className="h-full" />
        </section>
      </main>
    </div>
  )
}

function FilterSelect({ value, onChange, label, children }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="shrink-0 rounded-full border-[1.5px] border-line-strong bg-surface px-4 py-2.5 font-utility text-[12.5px] font-semibold text-ink-muted focus:border-chili">{children}</select>
}

function ViewButton({ active, onClick, icon: Icon, label }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-utility text-[12px] font-semibold ${active ? 'bg-surface text-chili shadow-soft' : 'text-ink-muted'}`}><Icon size={15} />{label}</button>
}

function ExplorePlaceCard({ place, index, criterion, selected, onSelect, lang, copy }) {
  const city = getCity(place.city) ?? { name: { vi: 'Theo vị trí bản đồ', en: 'Map location' }, pattern: 'wave', accent: 'herb' }
  const score = getFoodTripScore(place)
  const activeScore = scoreForCriterion(place, criterion)
  const open = isOpenNow(place.hours)
  return (
    <motion.article id={`explore-place-${place.id}`} variants={fadeUp} custom={index} initial="hidden" animate="show" onMouseEnter={onSelect} onClick={onSelect} className={`overflow-hidden rounded-xl border bg-surface shadow-soft transition-all ${selected ? 'border-chili ring-2 ring-chili/15' : 'border-line hover:border-line-strong'}`}>
      <div className="grid grid-cols-[112px_1fr]">
        <div className="relative min-h-[150px]">
          {place.image ? <img src={place.image} alt={place.name[lang]} className="absolute inset-0 h-full w-full object-cover" /> : <CityPattern pattern={city.pattern} accent={city.accent} className="absolute inset-0" />}
          <span className="absolute left-2 top-2 rounded-full bg-surface/95 px-2 py-1 font-utility text-[11px] font-bold text-chili shadow-soft">{activeScore.toFixed(1)}</span>
        </div>
        <div className="min-w-0 p-3">
          <div className="flex items-start justify-between gap-2"><h2 className="line-clamp-2 font-display text-[16px] font-bold leading-tight">{place.name[lang]}</h2><span className="shrink-0 text-[11px] text-ink-faint">{copy.priceUnit.repeat(Math.max(1, place.price + 1))}</span></div>
          <div className="mt-1 flex items-center gap-1.5"><span className="font-utility text-[12px] font-bold text-chili">{score.overall.toFixed(1)}</span><Star size={12} weight="fill" className="text-lantern" /><span className="text-[10.5px] text-ink-faint">({reviewCount(place)})</span></div>
          <p className="mt-1 line-clamp-1 text-[11.5px] text-ink-muted">{CATEGORY_LABEL[place.category][lang]} · {place.source === 'track-asia' ? place.address[lang] : city.name[lang]}</p>
          {place.matchScore != null && (
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-[#e8f2fb] px-2 py-1 font-utility text-[10.5px] font-bold text-[#1769a8]">{place.matchScore}% {copy.match}</span>
              {place.distanceKm != null && <span className="text-[10.5px] font-medium text-ink-faint">{copy.distance(place.distanceKm)}</span>}
            </div>
          )}
          <p className={`mt-2 inline-flex items-center gap-1 font-utility text-[10.5px] font-semibold ${open ? 'text-herb' : 'text-chili'}`}><span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-herb' : 'bg-chili'}`} />{open ? (lang === 'vi' ? 'Đang mở' : 'Open') : (lang === 'vi' ? 'Đã đóng' : 'Closed')} · {place.hours.close}</p>
          {place.source !== 'track-asia' && <Link to={`/place/${place.id}`} onClick={(event) => event.stopPropagation()} className="mt-2 block font-utility text-[11px] font-semibold text-chili hover:underline">{copy.viewDetail} →</Link>}
        </div>
      </div>
      {selected && (
        <div className="grid grid-cols-5 gap-1 border-t border-line bg-paper-2 px-3 py-2.5">
          {Object.keys(FOODTRIP_CRITERIA).map((key) => <div key={key} className="text-center"><div className="font-utility text-[10.5px] font-bold text-ink">{score[key].toFixed(1)}</div><div className="truncate text-[8.5px] text-ink-faint">{FOODTRIP_CRITERIA[key][lang]}</div></div>)}
        </div>
      )}
    </motion.article>
  )
}
