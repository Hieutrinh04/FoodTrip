import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  MagnifyingGlass, SmileySad, MapTrifold, ListBullets,
  Clock, Star, SlidersHorizontal, X, NavigationArrow, SpinnerGap, MapPin,
} from '@phosphor-icons/react'
import ExploreMap from '../components/map/ExploreMap.jsx'
import MapPlacePreview from '../components/map/MapPlacePreview.jsx'
import NavigationBanner from '../components/map/NavigationBanner.jsx'
import { useLiveNavigation } from '../hooks/useLiveNavigation.js'
import { splitRoute } from '../lib/routeProgress.js'
import CityPattern from '../components/CityPattern.jsx'
import RemoteImage from '../components/ui/RemoteImage.jsx'
import { CITIES, PLACES, CATEGORY_LABEL, getCity, isLivePlace } from '../data/destinations.js'
import { FOODTRIP_CRITERIA, getFoodTripScore, scoreForCriterion, criteriaWithData } from '../lib/foodTripScore.js'
import { fetchRouteDetails, haversineKm } from '../lib/trackAsia.js'
import { scorePlaceDetailed, toTenPointScale } from '../lib/placeScore.js'
import { searchExplorePlaces } from '../lib/explorePlaceSearch.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import './Explore.css'

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
    suitability: 'Điểm phù hợp', suitabilityBasis: 'Chấm theo tiêu chí có dữ liệu',
    sample: 'Dữ liệu mẫu', sampleHint: 'Điểm và nhận xét của địa điểm này được viết minh hoạ, không phải đánh giá thật.',
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
    suitability: 'Suitability', suitabilityBasis: 'Scored on criteria with real data',
    sample: 'Sample data', sampleHint: 'This place’s score and reviews are illustrative, not real reviews.',
  },
}

const FOOD_TYPES = [
  { id: 'buffet', vi: 'Buffet', en: 'Buffet' },
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
    buffet: ['buffet', 'ăn không giới hạn', 'all you can eat'],
    pho: ['phở', 'pho'], coffee: ['cà phê', 'coffee', 'cafe'], seafood: ['hải sản', 'seafood', 'tôm', 'ốc'],
    noodles: ['bún', 'mì', 'hủ tiếu', 'cao lầu', 'noodle'], rice: ['cơm', 'rice'],
    hotpot: ['lẩu', 'nướng', 'hotpot', 'grill'], snacks: ['ăn vặt', 'bánh', 'streetfood'], vegetarian: ['chay', 'vegetarian'],
  }
  return patterns[type]?.some((term) => text.includes(term)) ?? true
}

/** Centre of a result set, robust to a few far-flung outliers. */
function medianCentre(locations) {
  if (!locations.length) return null
  const middle = (values) => {
    const sorted = [...values].sort((a, b) => a - b)
    const i = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2
  }
  return { lat: middle(locations.map((l) => l.lat)), lng: middle(locations.map((l) => l.lng)) }
}

function calculateMatch(place, distanceKm) {
  // Unrated live results carry no scorecard; treat their quality as neutral so
  // the match percentage still reflects distance, opening hours and price.
  const score = (getFoodTripScore(place)?.overall ?? 4) / 5
  const distanceFit = distanceKm == null ? 0.55 : Math.max(0, 1 - distanceKm / 15)
  const openFit = isOpenNow(place.hours) ? 1 : 0.35
  const valueFit = place.price == null ? 0.6 : Math.max(0.25, 1 - place.price * 0.2)
  return Math.round((score * 0.45 + distanceFit * 0.3 + openFit * 0.15 + valueFit * 0.1) * 100)
}

/**
 * The single figure a place is ranked and filtered by, on a 0–10 scale.
 *
 * The list used to mix two scales: live results showed the system's
 * "Điểm phù hợp" out of 10, while sorting and the minimum-score filter read the
 * community scorecard out of 5 — which live results do not have. "Điểm cao
 * nhất" therefore left them unsorted, and "4.0+" removed every one of them.
 * Now the badge, the map marker, the sort and the filter all read this.
 *
 * "Tổng hợp" is the suitability score every place has. A specific criterion
 * (Món ăn, Vệ sinh…) only exists in the community scorecard, so it is shown
 * doubled onto the same /10 scale, and a place without one has no score for
 * that criterion rather than a borrowed one.
 */
function displayScore(place, criterion) {
  if (criterion === 'overall') return place.suitability ?? null
  const community = scoreForCriterion(place, criterion)
  return community == null ? null : Math.round(community * 2 * 10) / 10
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mobileView, setMobileView] = useState('list')
  const [userLocation, setUserLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle')
  const [locationError, setLocationError] = useState('')
  const [radiusKm, setRadiusKm] = useState(5)
  const [resolvedLocations, setResolvedLocations] = useState({})
  // Motorbike is the default because it is how most people actually get around
  // a Vietnamese city, and walking vs riding changes the time for a 1km trip
  // from fifteen minutes to three.
  const [transport, setTransport] = useState('bike')
  const [route, setRoute] = useState(null)
  const [routeStatus, setRouteStatus] = useState('idle') // idle | loading | ready | error
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
    setLivePlaces([])
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
    stopLocationWatch()
    setUserLocation(null)
    setLocationStatus('idle')
    setLocationError('')
    if (id === 'all') setSearchParams({}, { replace: true })
    else setSearchParams({ city: id }, { replace: true })
    setSelectedId(null)
    setMapSearchOrigin(null)
  }

  function clearFilters() {
    stopLocationWatch()
    setSearchParams({}, { replace: true })
    setSelectedId(null)
    setPreviewOpen(false)
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
    setPreviewOpen(false)
    const row = document.getElementById(`explore-place-${id}`)
    const list = row?.closest('.explore-results')
    if (row && list && list.clientHeight) {
      const toolbarHeight = list.querySelector('.explore-results-toolbar')?.clientHeight ?? 65
      list.scrollTo({ top: list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top - toolbarHeight, behavior: 'auto' })
    }
  }

  function choosePlace(id, details = false) {
    setSelectedId(id)
    setPreviewOpen(details)
    setMobileView('map')
  }

  function searchMapArea(location) {
    setMapSearchOrigin(location)
    setSelectedId(null)
  }

  const filtered = useMemo(() => {
    const proximityOrigin = mapSearchOrigin ?? userLocation
    const effectiveRadiusKm = mapSearchOrigin ? Math.max(radiusKm, 20) : radiusKm
    const isLive = liveStatus !== 'idle' && liveStatus !== 'error'
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
    const located = result.map((place) => place.location ?? resolvedLocations[place.id]).filter(Boolean)
    // The Weighted Sum Model needs a point to measure distance from. Fall back
    // to the centre of the results themselves so every place still gets a
    // score before the traveller shares GPS or taps the map.
    const scoreOrigin = proximityOrigin ?? medianCentre(located)

    const enriched = result.map((place) => {
      const location = place.location ?? resolvedLocations[place.id]
      const distanceKm = proximityOrigin && location ? haversineKm(proximityOrigin, location) : null
      // System-computed suitability, using the same Weighted Sum Model as the
      // itinerary generator so both rank places by identical rules.
      const detail = scorePlaceDetailed(place, {
        // Explore has no preference picker — the food-type chips already act as
        // a hard filter — so that criterion drops out and its weight is shared
        // across the ones that do have data.
        prefs: [],
        budgetPerPersonPerDay: 600000,
        referenceLocation: scoreOrigin,
        location,
        // Real Google figures where we have them. These are what lift the model
        // above a pure distance score: with them, three of the five criteria
        // carry data instead of one.
        rating: place.googleRating ?? place.rating,
        reviewCount: place.googleRatingCount,
      })
      return {
        ...place,
        location,
        distanceKm,
        suitability: toTenPointScale(detail.score),
        suitabilityParts: detail.parts,
        matchScore: proximityOrigin ? calculateMatch(place, distanceKm) : null,
      }
    }).map((place) => ({ ...place, displayScore: displayScore(place, criterion) }))
      // A place with no score for this criterion is only dropped when the
      // traveller actually asked for a minimum.
      .filter((place) => !(minScore > 0 && (place.displayScore == null || place.displayScore < minScore)))
    // Unrated places sort last rather than being treated as a zero score.
    if (sort === 'highest') {
      enriched.sort((a, b) => (b.displayScore ?? -1) - (a.displayScore ?? -1))
    }
    if (sort === 'relevant' && proximityOrigin) enriched.sort((a, b) => b.matchScore - a.matchScore)
    if (sort === 'low-price') enriched.sort((a, b) => (a.price ?? 99) - (b.price ?? 99))
    return enriched
  }, [cityFilter, category, foodType, price, openOnly, criterion, minScore, query, sort, lang, userLocation, mapSearchOrigin, radiusKm, resolvedLocations, livePlaces, liveStatus])

  const activeFilterCount = [cityFilter !== 'all', Boolean(query.trim()), category !== 'all', foodType !== 'all', price !== 'all', openOnly, minScore > 0, criterion !== 'overall', Boolean(userLocation || mapSearchOrigin)].filter(Boolean).length
  const selectedPlace = filtered.find((place) => place.id === selectedId) ?? null
  // Per-criterion scores only exist where reviews actually rated a criterion.
  // The dataset has none today, so this is just "overall" and the selector is
  // hidden; it grows on its own once such data exists.
  const criterionKeys = useMemo(
    () => ['overall', ...criteriaWithData(liveStatus === 'ready' ? livePlaces : PLACES)],
    [liveStatus, livePlaces],
  )
  useEffect(() => {
    if (!criterionKeys.includes(criterion)) setCriterion('overall')
  }, [criterionKeys, criterion])

  // The road route from the traveller to the place they picked. It needs a
  // starting point, so it only exists once "Gần tôi" has located them or they
  // have tapped an area on the map — otherwise there is nothing to route from
  // and the preview says so rather than drawing a line from nowhere.
  const routeOrigin = userLocation ?? mapSearchOrigin
  const destination = selectedPlace?.location ?? resolvedLocations[selectedPlace?.id] ?? null
  useEffect(() => {
    if (!routeOrigin || !destination) {
      setRoute(null)
      setRouteStatus('idle')
      return undefined
    }
    let cancelled = false
    setRoute(null)
    setRouteStatus('loading')
    fetchRouteDetails([routeOrigin, destination], transport)
      .then((details) => {
        if (cancelled) return
        setRoute(details)
        setRouteStatus(details ? 'ready' : 'error')
      })
      .catch(() => {
        if (!cancelled) {
          setRoute(null)
          setRouteStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
    // Keyed on coordinates rather than objects so a re-rendered parent does not
    // re-request the same route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace?.id, routeOrigin?.lat, routeOrigin?.lng, transport])

  // Live, Google-Maps-style tracking of that route. Once the traveller has
  // shared their location ("Gần tôi"), it runs by itself: the dot moves, the
  // road behind turns grey, the distance counts down, a wrong turn re-routes.
  // "Bắt đầu dẫn đường" adds a camera that follows them. GPS fixes stay inside
  // the navigation state: pushed into userLocation they would re-run the
  // nearby search and refit the map on every step.
  const navigation = useLiveNavigation({ destination, transport, initialRoute: route, autoStart: Boolean(userLocation) })
  const [following, setFollowing] = useState(false)
  useEffect(() => { setFollowing(false) }, [selectedPlace?.id])

  const mapPaneRef = useRef(null)
  function startNavigation() {
    setFollowing(true)
    setPreviewOpen(false)
    setMobileView('map')
    if (!navigation.active) navigation.start()
  }
  // On a phone the map sits below the filters; bring it to the top once the
  // map view has rendered (from a click handler it would still be hidden).
  useEffect(() => {
    if (following) mapPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [following])

  const mapNavigation = useMemo(() => {
    if (!navigation.active) return null
    const coords = navigation.route?.geometry?.coordinates
    const { passed, remaining } = coords ? splitRoute(coords, navigation.located) : { passed: [], remaining: [] }
    return { position: navigation.position, heading: navigation.heading, passed, remaining }
  }, [navigation.active, navigation.route, navigation.located, navigation.position, navigation.heading])
  const navigating = navigation.status !== 'idle'

  return (
    <div className="explore-page">
      <header className="explore-heading">
          <div className="explore-heading-inner">
            <div>
              <h1 className="text-xl font-bold leading-tight md:text-2xl">{copy.title}</h1>
              <p className="mt-0.5 max-w-[70ch] text-sm text-ink-muted">{copy.sub}</p>
            </div>
            <div className="explore-mobile-toggle">
              <ViewButton active={mobileView === 'list'} onClick={() => setMobileView('list')} icon={ListBullets} label={copy.list} />
              <ViewButton active={mobileView === 'map'} onClick={() => setMobileView('map')} icon={MapTrifold} label={copy.map} />
            </div>
          </div>
      </header>
      <div className="explore-shell">
      <div className="explore-filters">
        <div className="explore-filters-inner">
          <div className="explore-filter-row">
            <div className="explore-search">
              <MagnifyingGlass size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input aria-label={copy.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="w-full rounded-full border-[1.5px] border-line-strong bg-paper py-2.5 pl-11 pr-10 text-md focus:border-chili" />
              {query && <button aria-label={lang === 'vi' ? 'Xóa tìm kiếm' : 'Clear search'} onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-faint hover:text-chili"><X size={15} /></button>}
            </div>
            <FilterSelect value={cityFilter} onChange={setCity} label={lang === 'vi' ? 'Thành phố' : 'City'}>
              <option value="all">{lang === 'vi' ? 'Mọi thành phố' : 'All cities'}</option>
              {CITIES.map((city) => <option key={city.id} value={city.id}>{city.name[lang]}</option>)}
            </FilterSelect>
            <button onClick={locateUser} disabled={locationStatus === 'loading'} className={`shrink-0 rounded-full border-[1.5px] px-4 py-2.5 font-utility text-sm font-semibold disabled:opacity-65 ${userLocation ? 'border-[#2583d8] bg-[#2583d8] text-white' : 'border-line-strong bg-surface text-ink-muted'}`}>
              {locationStatus === 'loading' ? <SpinnerGap size={14} className="mr-1.5 inline animate-spin" /> : <NavigationArrow size={14} weight="fill" className="mr-1.5 inline" />}
              {locationStatus === 'loading' ? copy.locating : userLocation ? copy.located : copy.nearMe}
            </button>
            <button onClick={() => setShowAdvanced((value) => !value)} aria-expanded={showAdvanced} className={`relative shrink-0 rounded-full border-[1.5px] px-4 py-2.5 font-utility text-sm font-semibold ${showAdvanced ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink-muted'}`}><SlidersHorizontal size={15} className="mr-1.5 inline" />{copy.filters}{activeFilterCount > 0 && <span className="ml-1.5 rounded-full bg-chili px-1.5 py-0.5 text-micro text-white">{activeFilterCount}</span>}</button>
          </div>
          {locationStatus === 'error' && <p role="alert" className="text-xs font-medium text-chili">{locationError || copy.locationUnavailable}</p>}
          <div className="explore-filter-row explore-filter-chips">
            <FilterSelect value={category} label={lang === 'vi' ? 'Loại địa điểm' : 'Place type'} onChange={(value) => { setCategory(value); setFoodType('all') }}><option value="all">{lang === 'vi' ? 'Mọi loại địa điểm' : 'All place types'}</option>{Object.keys(CATEGORY_LABEL).map((key) => <option key={key} value={key}>{CATEGORY_LABEL[key][lang]}</option>)}</FilterSelect>
            <FilterSelect value={foodType} label={copy.foodType} onChange={(value) => { setFoodType(value); if (value === 'coffee') setCategory('cafe'); else if (value !== 'all') setCategory('food') }}><option value="all">{lang === 'vi' ? 'Mọi loại món' : 'All food types'}</option>{FOOD_TYPES.map((type) => <option key={type.id} value={type.id}>{type[lang]}</option>)}</FilterSelect>
            <button aria-pressed={openOnly} onClick={() => setOpenOnly((value) => !value)} className={`shrink-0 rounded-full border px-4 py-2.5 font-utility text-sm font-semibold ${openOnly ? 'border-herb bg-herb text-herb-ink' : 'border-line-strong text-ink-muted'}`}><Clock size={14} className="mr-1.5 inline" />{copy.open}</button>
            {activeFilterCount > 0 && <button onClick={clearFilters} className="rounded-full px-3 py-2 font-utility text-xs font-semibold text-chili">{copy.clear} ({activeFilterCount})</button>}
          </div>
          {showAdvanced && <div className="explore-advanced">
            {criterionKeys.length > 1 && <FilterSelect value={criterion} onChange={setCriterion} label={copy.scoreTitle}>{criterionKeys.map((key) => <option key={key} value={key}>{key === 'overall' ? copy.overall : FOODTRIP_CRITERIA[key][lang]}</option>)}</FilterSelect>}
            <FilterSelect value={minScore} onChange={(value) => setMinScore(Number(value))} label={copy.rating}><option value="0">{copy.rating}</option><option value="6">6.0+</option><option value="7">7.0+</option><option value="8">8.0+</option><option value="9">9.0+</option></FilterSelect>
            <FilterSelect value={price} onChange={setPrice} label={copy.price}><option value="all">{copy.price}</option><option value="0">{copy.priceUnit}</option><option value="1">{copy.priceUnit.repeat(2)}</option><option value="2">{copy.priceUnit.repeat(3)}</option><option value="3">{copy.priceUnit.repeat(4)}</option></FilterSelect>
            {userLocation && <FilterSelect value={radiusKm} onChange={(value) => setRadiusKm(Number(value))} label={copy.radius}><option value="1">1 km</option><option value="3">3 km</option><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option></FilterSelect>}
          </div>}
        </div>
      </div>

      <div className="explore-panels" data-view={mobileView}>
        <section className="explore-results" aria-label={copy.list}>
          <div className="explore-results-toolbar"><span role="status" className="font-utility text-xs font-semibold text-ink-muted">{liveStatus === 'loading' ? (lang === 'vi' ? 'Đang tìm địa điểm…' : 'Finding places…') : copy.results(filtered.length)}</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label={copy.sort} className="shrink-0 rounded-full border border-line-strong bg-surface px-3 py-2 font-utility text-xs text-ink-muted"><option value="relevant">{copy.relevant}</option><option value="highest">{copy.highest}</option><option value="low-price">{copy.lowPrice}</option></select></div>
          {(foodType !== 'all' || category !== 'all') && !userLocation && !mapSearchOrigin && cityFilter === 'all' && <div className="mb-3 rounded-xl border border-lantern/30 bg-lantern/10 px-4 py-3 text-xs text-ink-muted">{lang === 'vi' ? 'Chọn thành phố, dùng “Gần tôi” hoặc bấm trực tiếp lên bản đồ.' : 'Choose a city, use “Near me”, or click the map.'}</div>}
          {livePlaces.length > 0 && <p className="explore-result-note">{lang === 'vi' ? 'Điểm phù hợp /10 do FoodTrip tính, không phải điểm đánh giá /5.' : 'FoodTrip suitability /10 is distinct from user ratings /5.'}</p>}
          {liveStatus === 'error' && <p role="alert" className="explore-result-note">{lang === 'vi' ? 'Chưa tải được kết quả trực tuyến. Đang hiển thị địa điểm có sẵn phù hợp bộ lọc.' : 'Live search is unavailable. Showing matching saved catalogue places.'}</p>}
          {filtered.length ? (
            <div className="explore-result-list">
              {filtered.map((place) => <ExplorePlaceCard key={place.id} place={place} criterion={criterion} selected={selectedId === place.id} roadMeters={selectedId === place.id && routeStatus === 'ready' ? route?.distanceMeters ?? null : null} onSelect={() => choosePlace(place.id)} onDetails={() => choosePlace(place.id, true)} lang={lang} copy={copy} />)}
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-4 text-center text-ink-muted">{liveStatus === 'loading' ? <><SpinnerGap size={30} className="animate-spin" /><p>{lang === 'vi' ? 'Đang tìm địa điểm…' : 'Finding places…'}</p></> : <><SmileySad size={38} /><p>{copy.empty}</p><button onClick={clearFilters} className="font-utility text-xs font-semibold text-chili">{copy.clear}</button></>}</div>
          )}
        </section>
        <section ref={mapPaneRef} className="explore-map-pane" data-navigating={(navigating && following) || undefined} aria-label={copy.map}>
          <ExploreMap places={filtered} criterion={criterion} selectedId={selectedId} onSelect={selectFromMap} onAreaSelect={searchMapArea} userLocation={userLocation} onLocationsResolved={mergeResolvedLocations} routeGeometry={(navigation.active && navigation.route?.geometry) || route?.geometry || null} navigation={mapNavigation} followPosition={following} onUserMove={() => setFollowing(false)} className="h-full" />
          {navigating && selectedPlace && !previewOpen && <NavigationBanner navigation={navigation} destinationName={selectedPlace.name[lang]} following={following} onRecenter={() => setFollowing(true)} onEnd={navigation.end} />}
          {!selectedPlace && !navigating && <div className="explore-map-hint"><span>{liveStatus === 'loading' ? (lang === 'vi' ? 'Đang cập nhật khu vực…' : 'Updating area…') : (lang === 'vi' ? 'Chọn ghim để xem quán · Bấm vùng trống để tìm quanh đó' : 'Select a pin · Click an empty area to search nearby')}</span></div>}
          {selectedPlace && !previewOpen && !following && <div className="explore-selected-summary"><button onClick={() => setSelectedId(null)} aria-label={lang === 'vi' ? 'Bỏ chọn địa điểm' : 'Deselect place'}><X size={18} /></button><h2>{selectedPlace.name[lang]}</h2><p>{selectedPlace.address[lang]}</p><div className="mt-3 flex flex-wrap gap-2">{destination && <button onClick={startNavigation} className="inline-flex items-center gap-1.5 rounded-full bg-[#2583d8] px-4 py-2 font-utility text-xs font-semibold text-white"><NavigationArrow size={13} weight="fill" />{lang === 'vi' ? 'Bắt đầu dẫn đường' : 'Start navigation'}</button>}<button onClick={() => setPreviewOpen(true)} className="rounded-full bg-chili px-4 py-2 font-utility text-xs font-semibold text-chili-ink">{copy.viewDetail} →</button></div></div>}
          {selectedPlace && previewOpen && (
            <MapPlacePreview
              place={selectedPlace}
              criterion={criterion}
              onClose={() => setPreviewOpen(false)}
              route={route}
              routeStatus={routeStatus}
              hasRouteOrigin={Boolean(routeOrigin)}
              transport={transport}
              onTransportChange={setTransport}
              onStartNavigation={destination ? startNavigation : undefined}
            />
          )}
        </section>
      </div>
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, label, children }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="shrink-0 rounded-full border-[1.5px] border-line-strong bg-surface px-4 py-2.5 font-utility text-sm font-semibold text-ink-muted focus:border-chili">{children}</select>
}

function ViewButton({ active, onClick, icon: Icon, label }) {
  return <button aria-pressed={active} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-utility text-xs font-semibold ${active ? 'bg-surface text-chili shadow-soft' : 'text-ink-muted'}`}><Icon size={15} />{label}</button>
}

function ExplorePlaceCard({ place, criterion, selected, roadMeters = null, onSelect, onDetails, lang, copy }) {
  const city = getCity(place.city) ?? { name: { vi: 'Theo vị trí bản đồ', en: 'Map location' }, pattern: 'wave', accent: 'herb' }
  const activeScore = place.displayScore
  const rating = place.googleRating ?? place.rating
  const count = place.googleRatingCount ?? place.reviews?.length
  const knownHours = place.source !== 'track-asia' && place.hours?.open && place.hours?.close
  const open = knownHours ? isOpenNow(place.hours) : null
  return (
    <article id={`explore-place-${place.id}`} className={`explore-result ${selected ? 'is-selected' : ''}`}>
      <button type="button" className="explore-result-pick" onClick={onSelect} aria-pressed={selected} aria-label={`${place.name[lang]} — ${copy.map}`}>
        <div className="explore-result-photo">
          {/* Curated places ship their own photo; places found live on the map
              carry Google's thumbnail instead, which used to be ignored here
              so every real result fell back to the pattern. */}
          <RemoteImage
            src={place.image ?? place.thumbnailUrl}
            alt={place.name[lang]}
            sizeHint="w180-h180-k-no"
            className="absolute inset-0 h-full w-full object-cover"
            fallback={<CityPattern pattern={city.pattern} accent={city.accent} className="absolute inset-0" />}
          />
        </div>
        <div className="min-w-0">
          <h2>{place.name[lang]}</h2>
          <p className="explore-result-address"><MapPin size={13} weight="fill" /><span className="line-clamp-2">{place.address[lang] || city.name[lang]}</span></p>
          <div className="explore-result-stats">{rating != null ? <><Star size={14} weight="fill" className="text-lantern" /><span>{Number(rating).toFixed(1)}/5</span>{count > 0 && <span className="text-ink-faint">({count})</span>}</> : <span className="text-ink-faint">{copy.noReviewsYet}</span>}{/* Two different distances, named for what they are: the list can only
             know the straight line; the selected place also has its road
             route, which is always longer — 949 m as the crow flies was 1.3 km
             by road, and "ước tính" read as if it were the trip. */}
            {roadMeters != null
              ? <span className="text-herb"> · {copy.distance(roadMeters / 1000)} {lang === 'vi' ? 'đường đi' : 'by road'}{place.distanceKm != null && <span className="text-ink-faint"> ({copy.distance(place.distanceKm)} {lang === 'vi' ? 'chim bay' : 'straight'})</span>}</span>
              : place.distanceKm != null && <span className="text-herb"> · {copy.distance(place.distanceKm)} {lang === 'vi' ? 'đường chim bay' : 'straight line'}</span>}</div>
          {!isLivePlace(place) && (
            <p className="mt-1"><span title={copy.sampleHint} className="inline-block rounded-full border border-lantern/40 bg-lantern/10 px-2 py-[2px] font-utility text-micro font-semibold text-ink-muted">{copy.sample}</span></p>
          )}
          <p className="explore-result-category">{CATEGORY_LABEL[place.category][lang]}{place.price != null && ` · ${copy.priceUnit.repeat(Math.max(1, place.price + 1))}`}</p>
          {activeScore != null && <p className="mt-1 text-xs text-ink-muted">{criterion === 'overall' ? copy.suitability : FOODTRIP_CRITERIA[criterion][lang]} <strong className="text-chili">{activeScore.toFixed(1)}/10</strong></p>}
          {open != null && <p className={`mt-1 text-xs ${open ? 'text-herb' : 'text-ink-muted'}`}>{open ? (lang === 'vi' ? 'Đang mở' : 'Open') : (lang === 'vi' ? 'Đã đóng' : 'Closed')} · {place.hours.close}</p>}
        </div>
      </button>
      <div className="explore-result-actions"><button type="button" onClick={onDetails}>{copy.viewDetail}</button>{!isLivePlace(place) && <Link to={`/place/${place.id}`}>{lang === 'vi' ? 'Trang địa điểm' : 'Place page'} →</Link>}</div>
    </article>
  )
}
