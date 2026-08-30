import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MagnifyingGlass, SmileySad, MapTrifold, ListBullets, ForkKnife, Coffee, Camera,
  Clock, Star, SlidersHorizontal, X, NavigationArrow, SpinnerGap,
} from '@phosphor-icons/react'
import ExploreMap from '../components/map/ExploreMap.jsx'
import MapPlacePreview from '../components/map/MapPlacePreview.jsx'
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
    reviewCount: (n) => `${n} đánh giá cộng đồng`, noReviewsYet: 'Chưa có đánh giá', clear: 'Xóa bộ lọc', priceUnit: '₫',
    nearMe: 'Gần tôi', locating: 'Đang định vị', located: 'Đã định vị',
    locationDenied: 'Quyền vị trí đang bị chặn. Hãy cho phép vị trí trong thanh địa chỉ rồi thử lại.',
    locationUnavailable: 'Thiết bị chưa xác định được vị trí. Hãy bật Dịch vụ vị trí của Windows rồi thử lại.',
    locationTimeout: 'Định vị mất quá nhiều thời gian. Hãy kiểm tra mạng và thử lại.',
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
    reviewCount: (n) => `${n} community reviews`, noReviewsYet: 'No reviews yet', clear: 'Clear filters', priceUnit: '$',
    nearMe: 'Near me', locating: 'Locating', located: 'Located',
    locationDenied: 'Location permission is blocked. Allow it from the address bar and try again.',
    locationUnavailable: 'Your device could not determine its location. Turn on system Location Services and try again.',
    locationTimeout: 'Location timed out. Check your connection and try again.',
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
  // Unrated live results carry no scorecard; treat their quality as neutral so
  // the match percentage still reflects distance, opening hours and price.
  const score = (getFoodTripScore(place)?.overall ?? 4) / 5
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
  const [locationError, setLocationError] = useState('')
  const [radiusKm, setRadiusKm] = useState(5)
  const [resolvedLocations, setResolvedLocations] = useState({})
  const [livePlaces, setLivePlaces] = useState([])
  const [liveStatus, setLiveStatus] = useState('idle')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [mapSearchOrigin, setMapSearchOrigin] = useState(null)
  const locationWatchRef = useRef(null)
  const locationTimerRef = useRef(null)

  function stopLocationWatch() {
    if (locationWatchRef.current != null) navigator.geolocation?.clearWatch(locationWatchRef.current)
    if (locationTimerRef.current != null) window.clearTimeout(locationTimerRef.current)
    locationWatchRef.current = null
    locationTimerRef.current = null
  }

  useEffect(() => () => stopLocationWatch(), [])

  // Free text or a food-type chip both drive a live search; the typed query
  // wins so "bánh xèo" finds real places instead of filtering the seed list
  // down to nothing. Debounced so typing doesn't fire a request per keystroke.
  const trimmedQuery = query.trim()
  const [liveQuery, setLiveQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setLiveQuery(trimmedQuery), 450)
    return () => clearTimeout(timer)
  }, [trimmedQuery])

  useEffect(() => {
    const hasSearchTerm = liveQuery.length >= 2 || foodType !== 'all' || category !== 'all' || Boolean(mapSearchOrigin) || Boolean(userLocation)
    const searchOrigin = mapSearchOrigin ?? userLocation
    if (!hasSearchTerm || (!searchOrigin && cityFilter === 'all')) {
      setLivePlaces([])
      setLiveStatus('idle')
      return undefined
    }
    let cancelled = false
    setLiveStatus('loading')
    const city = CITIES.find((item) => item.id === cityFilter)
    searchExplorePlaces({ foodType, category, query: liveQuery, city, origin: searchOrigin, radiusKm: mapSearchOrigin ? Math.max(radiusKm, 20) : radiusKm })
      .then((places) => {
        if (!cancelled) {
          setLivePlaces(places)
          setLiveStatus(places.length ? 'ready' : 'empty')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLivePlaces([])
          setLiveStatus('error')
        }
      })
    return () => { cancelled = true }
  }, [foodType, category, liveQuery, cityFilter, userLocation, mapSearchOrigin, radiusKm])

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
    setLocationError('')
    setRadiusKm(5)
    setMapSearchOrigin(null)
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setLocationStatus('error')
      setLocationError(copy.locationUnavailable)
      return
    }
    stopLocationWatch()
    setLocationStatus('loading')
    setLocationError('')
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        stopLocationWatch()
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationStatus('ready')
        setLocationError('')
        setMapSearchOrigin(null)
        setSelectedId(null)
        setMobileView('map')
        setSort('relevant')
      },
      (error) => {
        // Windows/Chrome can emit POSITION_UNAVAILABLE or TIMEOUT while its
        // location service is still resolving. Keep waiting; only a denied
        // permission is final and should be shown immediately.
        if (error.code === error.PERMISSION_DENIED) {
          stopLocationWatch()
          setLocationStatus('error')
          setLocationError(copy.locationDenied)
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    )
    locationTimerRef.current = window.setTimeout(() => {
      stopLocationWatch()
      setLocationStatus('error')
      setLocationError(copy.locationTimeout)
    }, 30000)
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

  function searchMapArea(location) {
    setMapSearchOrigin(location)
    setSelectedId(null)
  }

  const filtered = useMemo(() => {
    const proximityOrigin = mapSearchOrigin ?? userLocation
    const effectiveRadiusKm = mapSearchOrigin ? Math.max(radiusKm, 20) : radiusKm
    const isLive = liveStatus === 'ready'
    const sourcePlaces = isLive ? livePlaces : PLACES
    const result = sourcePlaces.filter((place) => {
      // Live results were already fetched for this city/area and matched the
      // typed phrase server-side, so re-applying the local text and city
      // filters would only throw away real matches.
      if (!isLive && cityFilter !== 'all' && place.city !== cityFilter) return false
      if (category !== 'all' && place.category !== category) return false
      if (!isLive && !placeMatchesFoodType(place, foodType)) return false
      if (price !== 'all' && place.price !== Number(price)) return false
      if (openOnly && !isOpenNow(place.hours)) return false
      const criterionScore = scoreForCriterion(place, criterion)
      // A place with no community rating has no score to compare — only drop it
      // when the traveller actually asked for a minimum.
      if (minScore > 0 && (criterionScore == null || criterionScore < minScore)) return false
      const location = place.location ?? resolvedLocations[place.id]
      const distanceKm = proximityOrigin && location ? haversineKm(proximityOrigin, location) : null
      if (proximityOrigin && distanceKm != null && distanceKm > effectiveRadiusKm) return false
      if (!isLive && query.trim()) {
        const needle = query.trim().toLocaleLowerCase(lang === 'vi' ? 'vi' : 'en')
        const haystack = `${place.name.vi} ${place.name.en} ${place.address.vi} ${place.address.en} ${place.shortDesc.vi} ${place.shortDesc.en}`.toLocaleLowerCase(lang === 'vi' ? 'vi' : 'en')
        if (!haystack.includes(needle)) return false
      }
      return true
    })
    const enriched = result.map((place) => {
      const location = place.location ?? resolvedLocations[place.id]
      const distanceKm = proximityOrigin && location ? haversineKm(proximityOrigin, location) : null
      return { ...place, location, distanceKm, matchScore: proximityOrigin ? calculateMatch(place, distanceKm) : null }
    })
    // Unrated places sort last rather than being treated as a zero score.
    if (sort === 'highest') {
      enriched.sort((a, b) => (scoreForCriterion(b, criterion) ?? -1) - (scoreForCriterion(a, criterion) ?? -1))
    }
    if (sort === 'relevant' && proximityOrigin) enriched.sort((a, b) => b.matchScore - a.matchScore)
    if (sort === 'low-price') enriched.sort((a, b) => a.price - b.price)
    return enriched
  }, [cityFilter, category, foodType, price, openOnly, criterion, minScore, query, sort, lang, userLocation, mapSearchOrigin, radiusKm, resolvedLocations, livePlaces, liveStatus])

  const activeFilterCount = [category !== 'all', foodType !== 'all', price !== 'all', openOnly, minScore > 0, criterion !== 'overall', Boolean(userLocation || mapSearchOrigin)].filter(Boolean).length
  const selectedPlace = filtered.find((place) => place.id === selectedId) ?? null

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-paper lg:flex lg:h-[calc(100dvh-72px)] lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <header className="shrink-0 border-b border-line bg-surface px-4 py-3 sm:px-6 lg:px-8">
        <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="mx-auto max-w-[1600px]">
          <motion.span variants={fadeUp} className="font-utility text-[11.5px] font-bold uppercase tracking-[.14em] text-chili">{copy.eyebrow}</motion.span>
          <motion.div variants={fadeUp} className="mt-1 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-[25px] font-bold leading-tight md:text-[29px]">{copy.title}</h1>
              <p className="mt-0.5 max-w-[70ch] text-[13px] text-ink-muted">{copy.sub}</p>
            </div>
            <div className="inline-flex self-start rounded-full bg-paper-2 p-1 lg:hidden">
              <ViewButton active={mobileView === 'list'} onClick={() => setMobileView('list')} icon={ListBullets} label={copy.list} />
              <ViewButton active={mobileView === 'map'} onClick={() => setMobileView('map')} icon={MapTrifold} label={copy.map} />
            </div>
          </motion.div>
        </motion.div>
      </header>

      <div className="z-30 shrink-0 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full flex-none lg:w-auto lg:min-w-[340px] lg:max-w-none lg:flex-1">
              <MagnifyingGlass size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="w-full rounded-full border-[1.5px] border-line-strong bg-paper py-2.5 pl-11 pr-10 text-[14px] focus:border-chili" />
              {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-faint hover:text-chili"><X size={15} /></button>}
            </div>
            <FilterSelect value={cityFilter} onChange={setCity} label={lang === 'vi' ? 'Thành phố' : 'City'}>
              <option value="all">{lang === 'vi' ? 'Mọi thành phố' : 'All cities'}</option>
              {CITIES.map((city) => <option key={city.id} value={city.id}>{city.name[lang]}</option>)}
            </FilterSelect>
            <button onClick={locateUser} disabled={locationStatus === 'loading'} className={`shrink-0 rounded-full border-[1.5px] px-4 py-2.5 font-utility text-[12.5px] font-semibold disabled:opacity-65 ${userLocation ? 'border-[#2583d8] bg-[#2583d8] text-white' : 'border-line-strong bg-surface text-ink-muted'}`}>
              {locationStatus === 'loading' ? <SpinnerGap size={14} className="mr-1.5 inline animate-spin" /> : <NavigationArrow size={14} weight="fill" className="mr-1.5 inline" />}
              {locationStatus === 'loading' ? copy.locating : userLocation ? copy.located : copy.nearMe}
            </button>
            <button onClick={() => setShowAdvanced((value) => !value)} aria-expanded={showAdvanced} className={`relative shrink-0 rounded-full border-[1.5px] px-4 py-2.5 font-utility text-[12.5px] font-semibold ${showAdvanced ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink-muted'}`}><SlidersHorizontal size={15} className="mr-1.5 inline" />{copy.filters}{activeFilterCount > 0 && <span className="ml-1.5 rounded-full bg-chili px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}</button>
          </div>
          {locationStatus === 'error' && <p role="alert" className="text-[12px] font-medium text-chili">{locationError || copy.locationUnavailable}</p>}
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-0.5">
              <Chip active={category === 'all' && foodType === 'all'} onClick={() => { setCategory('all'); setFoodType('all') }}>{copy.all}</Chip>
              {Object.keys(CATEGORY_LABEL).map((key) => { const Icon = CATEGORY_ICON[key]; return <Chip key={key} active={category === key && foodType === 'all'} onClick={() => { setCategory(key); setFoodType('all') }}><Icon size={13} className="mr-1 inline" />{CATEGORY_LABEL[key][lang]}</Chip> })}
              <span className="h-5 w-px shrink-0 bg-line-strong" aria-hidden="true" />
              {FOOD_TYPES.map((type) => <Chip key={type.id} active={foodType === type.id} onClick={() => { const next = foodType === type.id ? 'all' : type.id; setFoodType(next); if (next === 'coffee') setCategory('cafe'); else if (next !== 'all') setCategory('food') }}>{type[lang]}</Chip>)}
          </div>
          {showAdvanced && <div className="no-scrollbar flex gap-2 overflow-x-auto rounded-xl border border-line bg-paper-2 p-2">
            <FilterSelect value={criterion} onChange={setCriterion} label={copy.scoreTitle}>{CRITERION_KEYS.map((key) => <option key={key} value={key}>{key === 'overall' ? copy.overall : FOODTRIP_CRITERIA[key][lang]}</option>)}</FilterSelect>
            <FilterSelect value={minScore} onChange={(value) => setMinScore(Number(value))} label={copy.rating}><option value="0">{copy.rating}</option><option value="4">4.0+</option><option value="4.3">4.3+</option><option value="4.5">4.5+</option><option value="4.7">4.7+</option></FilterSelect>
            <FilterSelect value={price} onChange={setPrice} label={copy.price}><option value="all">{copy.price}</option><option value="0">{copy.priceUnit}</option><option value="1">{copy.priceUnit.repeat(2)}</option><option value="2">{copy.priceUnit.repeat(3)}</option><option value="3">{copy.priceUnit.repeat(4)}</option></FilterSelect>
            <button onClick={() => setOpenOnly((value) => !value)} className={`shrink-0 rounded-full border-[1.5px] px-4 py-2.5 font-utility text-[12.5px] font-semibold ${openOnly ? 'border-herb bg-herb text-herb-ink' : 'border-line-strong bg-surface text-ink-muted'}`}><Clock size={14} className="mr-1.5 inline" />{copy.open}</button>
            {userLocation && <FilterSelect value={radiusKm} onChange={(value) => setRadiusKm(Number(value))} label={copy.radius}><option value="1">1 km</option><option value="3">3 km</option><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option></FilterSelect>}
            {activeFilterCount > 0 && <button onClick={clearFilters} className="shrink-0 rounded-full px-3 py-2 font-utility text-[12px] font-semibold text-chili hover:bg-surface">{copy.clear}</button>}
          </div>}
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(390px,44%)_1fr]">
        <section className={`${mobileView === 'map' ? 'hidden lg:block' : 'block'} overflow-y-auto border-r border-line bg-paper px-4 py-4 sm:px-6`}>
          <div className="mb-3 flex items-center justify-between gap-3"><span className="font-utility text-[12px] font-semibold text-ink-muted">{liveStatus === 'loading' ? (lang === 'vi' ? 'Đang tìm địa điểm thật…' : 'Finding live places…') : copy.results(filtered.length)}</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label={copy.sort} className="shrink-0 rounded-full border border-line-strong bg-surface px-3 py-2 font-utility text-[11.5px] text-ink-muted"><option value="relevant">{copy.relevant}</option><option value="highest">{copy.highest}</option><option value="low-price">{copy.lowPrice}</option></select></div>
          {(foodType !== 'all' || category !== 'all') && !userLocation && !mapSearchOrigin && cityFilter === 'all' && <div className="mb-3 rounded-xl border border-lantern/30 bg-lantern/10 px-4 py-3 text-[12px] text-ink-muted">{lang === 'vi' ? 'Chọn thành phố, dùng “Gần tôi” hoặc bấm trực tiếp lên bản đồ.' : 'Choose a city, use “Near me”, or click the map.'}</div>}
          {livePlaces.length > 0 && <div className="mb-3 rounded-xl border border-herb/20 bg-herb/5 px-4 py-2.5 text-[11px] text-ink-muted">{lang === 'vi' ? `Đang hiển thị ${livePlaces.length} địa điểm thật. Quán chưa có đánh giá FoodTrip sẽ được ghi rõ là chưa có điểm.` : `Showing ${livePlaces.length} live places. Places without FoodTrip reviews are clearly marked as unrated.`}</div>}
          {liveStatus === 'empty' && mapSearchOrigin && <div className="mb-3 rounded-xl border border-lantern/30 bg-lantern/10 px-4 py-2.5 text-[11px] text-ink-muted">{lang === 'vi' ? 'Chưa tìm thấy quán trong bán kính này. Bản đồ vẫn giữ dữ liệu cũ để bạn chọn khu vực khác.' : 'No places found in this radius. Previous map data remains available.'}</div>}
          {filtered.length ? (
            <div className="grid gap-3">
              {filtered.map((place, index) => <ExplorePlaceCard key={place.id} place={place} index={index} criterion={criterion} selected={selectedId === place.id} onSelect={() => setSelectedId(place.id)} lang={lang} copy={copy} />)}
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-ink-muted"><SmileySad size={38} /><p>{copy.empty}</p><button onClick={clearFilters} className="font-utility text-[12px] font-semibold text-chili">{copy.clear}</button></div>
          )}
        </section>
        <section className={`${mobileView === 'map' ? 'block' : 'hidden lg:block'} relative min-h-[calc(100dvh-220px)] overflow-hidden bg-paper-2 lg:min-h-0`}>
          <ExploreMap places={filtered} criterion={criterion} selectedId={selectedId} onSelect={selectFromMap} onAreaSelect={searchMapArea} userLocation={userLocation} onLocationsResolved={mergeResolvedLocations} className="h-full" />
          {!selectedPlace && <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/95 px-3 py-2 font-utility text-[10.5px] font-semibold text-ink-muted shadow-soft">{liveStatus === 'loading' ? (lang === 'vi' ? 'Đang cập nhật khu vực…' : 'Updating area…') : (lang === 'vi' ? 'Bấm vào bản đồ để tìm quán quanh đó' : 'Click the map to search this area')}</div>}
          {selectedPlace && <MapPlacePreview place={selectedPlace} criterion={criterion} onClose={() => setSelectedId(null)} />}
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
    <motion.article id={`explore-place-${place.id}`} variants={fadeUp} custom={index} initial="hidden" animate="show" onClick={onSelect} className={`cursor-pointer overflow-hidden rounded-xl border bg-surface shadow-soft transition-all ${selected ? 'border-chili ring-2 ring-chili/15' : 'border-line hover:border-line-strong'}`}>
      <div className="grid grid-cols-[112px_1fr]">
        <div className="relative min-h-[150px]">
          {place.image ? <img src={place.image} alt={place.name[lang]} className="absolute inset-0 h-full w-full object-cover" /> : <CityPattern pattern={city.pattern} accent={city.accent} className="absolute inset-0" />}
          {activeScore != null && (
            <span className="absolute left-2 top-2 rounded-full bg-surface/95 px-2 py-1 font-utility text-[11px] font-bold text-chili shadow-soft">{activeScore.toFixed(1)}</span>
          )}
        </div>
        <div className="min-w-0 p-3">
          <div className="flex items-start justify-between gap-2"><h2 className="line-clamp-2 font-display text-[16px] font-bold leading-tight">{place.name[lang]}</h2><span className="shrink-0 text-[11px] text-ink-faint">{copy.priceUnit.repeat(Math.max(1, place.price + 1))}</span></div>
          {score ? (
            <div className="mt-1 flex items-center gap-1.5"><span className="font-utility text-[12px] font-bold text-chili">{score.overall.toFixed(1)}</span><Star size={12} weight="fill" className="text-lantern" /><span className="text-[10.5px] text-ink-faint">({reviewCount(place)})</span></div>
          ) : (
            <div className="mt-1 font-utility text-[10.5px] text-ink-faint">{copy.noReviewsYet}</div>
          )}
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
      {selected && score && (
        <div className="grid grid-cols-5 gap-1 border-t border-line bg-paper-2 px-3 py-2.5">
          {Object.keys(FOODTRIP_CRITERIA).map((key) => <div key={key} className="text-center"><div className="font-utility text-[10.5px] font-bold text-ink">{score[key].toFixed(1)}</div><div className="truncate text-[8.5px] text-ink-faint">{FOODTRIP_CRITERIA[key][lang]}</div></div>)}
        </div>
      )}
    </motion.article>
  )
}
