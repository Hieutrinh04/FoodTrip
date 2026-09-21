import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, NavigationArrow, Star, ArrowsClockwise, Warning, Ruler, MagnifyingGlass, SlidersHorizontal, ForkKnife, ArrowSquareOut, MapTrifold, X } from '@phosphor-icons/react'
import { searchNearbyFood, searchFoodByText, getPosition } from '../lib/nearbySearch.js'
import { fetchPlaceReviews } from '../lib/placeReviews.js'
import RemoteImage from '../components/ui/RemoteImage.jsx'
import ExploreMap from '../components/map/ExploreMap.jsx'
import MapPlacePreview from '../components/map/MapPlacePreview.jsx'
import { scorePlaceDetailed, toTenPointScale } from '../lib/placeScore.js'
import { fetchRouteDetails } from '../lib/trackAsia.js'
import FoodWheel from '../components/wheel/FoodWheel.jsx'
import { wheelItemLabel } from '../lib/foodWheelLabel.js'
import { FOOD_WHEEL_ITEMS } from '../data/foodWheel.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { fadeUp, staggerContainer, easeOut } from '../motion/variants.js'

const WHEEL_STORAGE_KEY = 'ft_food_wheel_items_v1'

function loadWheelItems() {
  try {
    const raw = localStorage.getItem(WHEEL_STORAGE_KEY)
    if (!raw) return FOOD_WHEEL_ITEMS
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length >= 2) return parsed
  } catch {
    // corrupt/unavailable storage — fall back to defaults
  }
  return FOOD_WHEEL_ITEMS
}

const C = {
  vi: {
    eyebrow: 'Ăn gì bây giờ?',
    otherWays: 'Hoặc tìm theo cách khác',
    title: 'Chưa biết ăn gì? Quay một vòng, để FoodTrip chọn giúp bạn.',
    sub: 'Quay vòng để chọn món, FoodTrip sẽ tìm ngay quán ăn gần bạn — dù bạn đang ở Hà Nội, Bình Dương hay bất kỳ đâu.',
    cta: 'Định vị & gợi ý cho tôi',
    locating: 'Đang xác định vị trí của bạn…',
    searching: 'Đang tìm quán ăn quanh bạn…',
    searchingText: (q) => `Đang tìm “${q}”…`,
    searchingWheel: (dish) => `Đang tìm quán ${dish} gần bạn…`,
    locDenied: 'Trang này đang bị chặn quyền vị trí. Bấm biểu tượng vị trí ở thanh địa chỉ, chọn “Cho phép”, rồi thử lại.',
    locSystemOff: 'Trình duyệt đã cho phép trang dùng vị trí, nhưng Windows đang tắt vị trí. Mở Cài đặt → Quyền riêng tư & bảo mật → Vị trí, bật “Dịch vụ vị trí” và “Cho phép ứng dụng máy tính truy cập vị trí”, rồi thử lại.',
    locUnavailable: 'Máy chưa xác định được vị trí. Hãy bật Dịch vụ vị trí (Location) của Windows hoặc điện thoại, rồi thử lại.',
    locTimeout: 'Định vị quá lâu mà chưa có kết quả. Kiểm tra kết nối mạng rồi thử lại, hoặc gõ nơi bạn muốn ăn ở ô bên dưới.',
    locUnsupported: 'Trình duyệt này không hỗ trợ định vị — hãy gõ nơi bạn muốn ăn ở ô bên dưới.',
    noKey: 'Dịch vụ tìm quán chưa được cấu hình nên chưa tìm được quán.',
    emptyGps: 'Chưa thấy quán ăn nào quanh vị trí của bạn.',
    emptyText: (q) => `Không tìm thấy quán nào cho “${q}” — thử diễn đạt khác xem sao.`,
    emptyWheel: (dish) => `Chưa tìm thấy quán ${dish} nào gần bạn — quay một món khác nhé.`,
    searchError: 'Có lỗi khi tìm quán. Kiểm tra kết nối mạng rồi thử lại.',
    retry: 'Thử lại', backToWheel: 'Quay lại vòng quay', showOnMap: 'Xem trên bản đồ', closeMap: 'Đóng bản đồ',
    or: 'hoặc',
    wheelTitle: 'Quay vòng để chọn món',
    wheelSpin: 'Quay ngay',
    wheelSpinning: 'Đang quay…',
    wheelPicked: (dish) => `Vòng quay ra: ${dish}`,
    revealEmoji: '🎉',
    revealCta: 'Tìm quán gần đây cho món này',
    revealRespin: 'Quay lại',
    customize: 'Tuỳ chỉnh vòng quay',
    customizeClose: 'Đóng',
    editorHint: 'Mỗi dòng là một món trên vòng quay (tối thiểu 2 món):',
    editorPlaceholder: 'Cơm tấm\nPhở bò\nBún bò Huế\n...',
    editorSave: 'Lưu vòng quay',
    editorReset: 'Khôi phục mặc định',
    textFallbackLabel: 'Nhập nơi bạn muốn ăn bằng ngôn ngữ tự nhiên:',
    textPlaceholder: 'Ví dụ: địa điểm ăn sáng ở thủ dầu một',
    textSubmit: 'Tìm quán',
    featuredLabel: 'Hôm nay ăn thử:',
    reroll: 'Gợi ý món khác',
    restart: 'Định vị lại',
    spinAgain: 'Quay lại vòng quay',
    fullListTitle: 'Các lựa chọn khác gần bạn',
    viewOnMaps: 'Xem trên Google Maps',
    ratingsCount: (n) => `${n.toLocaleString('vi-VN')} đánh giá`,
    reviewsTitle: 'Khách nói gì trên Google Maps', reviewsAll: 'Xem tất cả đánh giá', reviewsLoading: 'Đang tải đánh giá…',
    distance: (km) => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`),
  },
  en: {
    eyebrow: 'What to eat now?',
    otherWays: 'Or find a place another way',
    title: "Don't know what to eat? Spin the wheel and let FoodTrip decide.",
    sub: 'Spin to pick a dish, then FoodTrip finds real places near you — wherever you are, from Hanoi to Binh Duong and beyond.',
    cta: 'Locate me & suggest',
    locating: 'Finding your location…',
    searching: 'Looking for places to eat around you…',
    searchingText: (q) => `Searching for “${q}”…`,
    searchingWheel: (dish) => `Looking for ${dish} near you…`,
    locDenied: 'Location is blocked for this site. Click the location icon in the address bar, choose “Allow”, then try again.',
    locSystemOff: 'Your browser allows this site to use location, but Windows has location turned off. Open Settings → Privacy & security → Location, turn on “Location services” and “Let desktop apps access your location”, then try again.',
    locUnavailable: 'Your device could not work out where it is. Turn on Location Services on Windows or your phone, then try again.',
    locTimeout: 'Finding your location took too long. Check your connection and try again, or type where you want to eat below.',
    locUnsupported: 'This browser cannot share a location — type where you want to eat below.',
    noKey: 'The place search service is not configured, so nothing can be found yet.',
    emptyGps: 'No places to eat found around you yet.',
    emptyText: (q) => `Nothing found for “${q}” — try wording it differently.`,
    emptyWheel: (dish) => `No ${dish} places found near you — spin for another dish.`,
    searchError: 'Something went wrong while searching. Check your connection and try again.',
    retry: 'Try again', backToWheel: 'Back to the wheel', showOnMap: 'Show on map', closeMap: 'Close map',
    or: 'or',
    wheelTitle: 'Spin the wheel to pick a dish',
    wheelSpin: 'Spin now',
    wheelSpinning: 'Spinning…',
    wheelPicked: (dish) => `The wheel picked: ${dish}`,
    revealEmoji: '🎉',
    revealCta: 'Find nearby places for this',
    revealRespin: 'Spin again',
    customize: 'Customize wheel',
    customizeClose: 'Close',
    editorHint: 'One dish per line on the wheel (at least 2):',
    editorPlaceholder: 'Broken rice\nBeef pho\nHue noodle\n...',
    editorSave: 'Save wheel',
    editorReset: 'Reset to default',
    textFallbackLabel: 'Type where you want to eat in natural language:',
    textPlaceholder: 'e.g. breakfast spots in thu dau mot',
    textSubmit: 'Find places',
    featuredLabel: 'Try this today:',
    reroll: 'Suggest something else',
    restart: 'Locate again',
    spinAgain: 'Spin again',
    fullListTitle: 'Other options near you',
    viewOnMaps: 'View on Google Maps',
    ratingsCount: (n) => `${n.toLocaleString('en-US')} ratings`,
    reviewsTitle: 'What people say on Google Maps', reviewsAll: 'See all reviews', reviewsLoading: 'Loading reviews…',
    distance: (km) => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`),
  },
}

// Two is enough to give the flavour of what people think without turning the
// suggestion card into a review page; the link leads to the rest.
const FEATURED_REVIEW_COUNT = 2

/**
 * A couple of real Google reviews under the suggested place — the same source
 * and lookup as the explore map's review section, fetched by the listing's own
 * id so they are about this exact place. Renders nothing for a place that has
 * no Google listing (the Track-Asia fallback), rather than an empty box.
 */
function FeaturedReviews({ place, c }) {
  const [state, setState] = useState({ status: 'idle', reviews: [] })

  useEffect(() => {
    if (!place?.mapsUri) {
      setState({ status: 'none', reviews: [] })
      return undefined
    }
    let cancelled = false
    setState({ status: 'loading', reviews: [] })
    fetchPlaceReviews({ mapsUrl: place.mapsUri }).then((result) => {
      if (!cancelled) setState(result)
    })
    return () => { cancelled = true }
  }, [place?.mapsUri])

  if (state.status === 'none' || state.status === 'no-id') return null
  if (state.status === 'ok' && !state.reviews.length) return null
  if (state.status === 'error' || state.status === 'provider-error' || state.status === 'no-key') return null

  return (
    <div className="mt-5 border-t border-dashed border-line pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-utility text-xs font-bold uppercase tracking-wide text-ink-faint">{c.reviewsTitle}</span>
        <a href={place.mapsUri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-utility text-xs font-semibold text-chili hover:underline">
          {c.reviewsAll} <ArrowSquareOut size={12} />
        </a>
      </div>
      {state.status === 'loading' ? (
        <p className="text-sm text-ink-faint">{c.reviewsLoading}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {state.reviews.slice(0, FEATURED_REVIEW_COUNT).map((review) => (
            <figure key={review.id} className="rounded-xl bg-paper-2 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <figcaption className="truncate text-sm font-semibold">{review.author}</figcaption>
                <span className="shrink-0 font-utility text-micro text-ink-faint">{review.date}</span>
              </div>
              {review.rating != null && (
                <div className="mt-0.5 flex gap-0.5 text-lantern" aria-label={`${review.rating}/5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={11} weight={n <= Math.round(review.rating) ? 'fill' : 'regular'} className={n <= Math.round(review.rating) ? '' : 'text-line-strong'} />
                  ))}
                </div>
              )}
              {/* Google's words, unedited — only folded to three lines here. */}
              <blockquote className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{review.text}</blockquote>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NearbyEats() {
  const { lang } = useLanguage()
  const c = C[lang]
  const { user } = useAuth()

  // idle | locating | searching | ready | location-error | no-key | empty | error
  const [status, setStatus] = useState('idle')
  // What the current search was started from, so every message — while it
  // runs, and if it finds nothing or fails — describes what actually happened
  // rather than one generic sentence for all three.
  const [source, setSource] = useState(null) // gps | text | wheel
  const [lastQuery, setLastQuery] = useState('')
  const [locationError, setLocationError] = useState(null) // denied | system-off | unavailable | timeout | unsupported
  // Where the search was made from — the map's "you are here", the route's
  // start, and the point distances are scored against. Null for a typed search.
  const [origin, setOrigin] = useState(null)
  // The map opens when a place is picked and stays open while the traveller
  // compares others; closing the side panel does not take the map away.
  const [mapOpen, setMapOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [transport, setTransport] = useState('bike')
  const [route, setRoute] = useState(null)
  const [routeStatus, setRouteStatus] = useState('idle')
  const mapSectionRef = useRef(null)
  const [results, setResults] = useState([])
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const [textQuery, setTextQuery] = useState('')
  const [wheelPick, setWheelPick] = useState(null)
  const [revealPick, setRevealPick] = useState(null)
  const [wheelItems, setWheelItems] = useState(loadWheelItems)
  const [showEditor, setShowEditor] = useState(false)
  const [editorText, setEditorText] = useState('')

  useEffect(() => {
    if (!user) {
      setWheelItems(loadWheelItems())
      return
    }
    supabase
      .from('user_wheel_items')
      .select('items')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setWheelItems(data?.items ?? FOOD_WHEEL_ITEMS))
  }, [user])

  function applyResults(found) {
    if (found === null) {
      setStatus('no-key')
      return
    }
    if (!found.length) {
      setStatus('empty')
      return
    }
    setResults(found)
    setSelectedId(null)
    setMapOpen(false)
    setFeaturedIndex(Math.floor(Math.random() * found.length))
    setStatus('ready')
  }

  async function runSearch(search) {
    setStatus('searching')
    try {
      applyResults(await search())
    } catch {
      setStatus('error')
    }
  }

  /**
   * Resolves the position or puts the page into the matching location-error
   * state. The failures need different fixes and only one is about permission
   * — all of them used to say "allow location access", which was wrong for a
   * desktop that had permission but no position yet.
   */
  async function locate() {
    setStatus('locating')
    const { origin, error } = await getPosition()
    if (error) {
      setLocationError(error)
      setStatus('location-error')
      return null
    }
    return origin
  }

  async function handleLocate() {
    setWheelPick(null)
    setSource('gps')
    const origin = await locate()
    setOrigin(origin)
    if (origin) runSearch(() => searchNearbyFood(origin))
  }

  function searchText(q) {
    setWheelPick(null)
    setSource('text')
    setLastQuery(q)
    setOrigin(null)
    runSearch(() => searchFoodByText(q))
  }

  function handleTextSearch(e) {
    e.preventDefault()
    const q = textQuery.trim()
    if (q) searchText(q)
  }

  // A wheel pick is a dish, not a place: without a position there is nothing
  // to search around, and searching anyway returned bánh mì in Chicago. So a
  // failed position stops here with the reason, like the "Định vị" button.
  async function searchWheel(item) {
    setWheelPick(item)
    setSource('wheel')
    const origin = await locate()
    setOrigin(origin)
    if (origin) runSearch(() => searchFoodByText(wheelItemLabel(item, lang), origin))
  }

  // The results in the explore map's own shape, scored by the same Weighted
  // Sum Model, so the map, its markers and the place panel behave exactly as
  // they do on the Explore page rather than as a copy of it.
  const mapPlaces = useMemo(() => results
    .filter((r) => r.explore?.location)
    .map((r) => {
      const place = r.explore
      const detail = scorePlaceDetailed(place, {
        prefs: [],
        budgetPerPersonPerDay: 600000,
        referenceLocation: origin,
        location: place.location,
        rating: place.googleRating ?? place.rating,
        reviewCount: place.googleRatingCount,
      })
      const suitability = toTenPointScale(detail.score)
      return { ...place, distanceKm: r.distanceKm, suitability, suitabilityParts: detail.parts, displayScore: suitability }
    }), [results, origin])
  const selectedPlace = mapPlaces.find((place) => place.id === selectedId) ?? null

  function showOnMap(id) {
    setSelectedId(id)
    setMapOpen(true)
    // After the section has rendered, bring it into view.
    requestAnimationFrame(() => mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // The road route from where the search was made to the picked place — same
  // lookup as the Explore panel's. A typed search has no origin, so the panel
  // explains that instead of drawing a line from nowhere.
  useEffect(() => {
    const destination = selectedPlace?.location
    if (!origin || !destination) {
      setRoute(null)
      setRouteStatus('idle')
      return undefined
    }
    let cancelled = false
    setRouteStatus('loading')
    fetchRouteDetails([origin, destination], transport)
      .then((details) => {
        if (cancelled) return
        setRoute(details)
        setRouteStatus(details ? 'ready' : 'error')
      })
      .catch(() => {
        if (!cancelled) { setRoute(null); setRouteStatus('error') }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace?.id, origin?.lat, origin?.lng, transport])

  /** Repeats whatever the traveller last tried, exactly as they tried it. */
  function retry() {
    if (source === 'text' && lastQuery) searchText(lastQuery)
    else if (source === 'wheel' && wheelPick) searchWheel(wheelPick)
    else handleLocate()
  }

  function handleWheelResult(item) {
    setRevealPick(item)
  }

  function confirmWheelSearch() {
    const item = revealPick
    setRevealPick(null)
    searchWheel(item)
  }

  function respinFromReveal() {
    setRevealPick(null)
  }

  function spinAgain() {
    setWheelPick(null)
    setRevealPick(null)
    setLocationError(null)
    setStatus('idle')
  }

  const dish = wheelPick ? wheelItemLabel(wheelPick, lang) : ''
  const loadingText = status === 'locating'
    ? c.locating
    : source === 'text' ? c.searchingText(lastQuery)
    : source === 'wheel' ? c.searchingWheel(dish)
    : c.searching
  const LOCATION_MESSAGE = { denied: c.locDenied, 'system-off': c.locSystemOff, unavailable: c.locUnavailable, timeout: c.locTimeout, unsupported: c.locUnsupported }
  const noticeText = status === 'location-error' ? LOCATION_MESSAGE[locationError] ?? c.locTimeout
    : status === 'no-key' ? c.noKey
    : status === 'error' ? c.searchError
    : source === 'text' ? c.emptyText(lastQuery)
    : source === 'wheel' ? c.emptyWheel(dish)
    : c.emptyGps

  function openEditor() {
    setEditorText(wheelItems.map((it) => wheelItemLabel(it, lang)).join('\n'))
    setShowEditor(true)
  }

  async function saveWheelItems() {
    const items = editorText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (items.length < 2) return
    setWheelItems(items)
    if (user) {
      await supabase.from('user_wheel_items').upsert({ user_id: user.id, items, updated_at: new Date().toISOString() })
    } else {
      try {
        localStorage.setItem(WHEEL_STORAGE_KEY, JSON.stringify(items))
      } catch {
        // storage unavailable — keep the in-memory change for this session
      }
    }
    setShowEditor(false)
  }

  async function resetWheelItems() {
    setWheelItems(FOOD_WHEEL_ITEMS)
    if (user) {
      await supabase.from('user_wheel_items').delete().eq('user_id', user.id)
    } else {
      try {
        localStorage.removeItem(WHEEL_STORAGE_KEY)
      } catch {
        // ignore
      }
    }
    setShowEditor(false)
  }

  function reroll() {
    if (results.length < 2) return
    setFeaturedIndex((prev) => {
      let next = Math.floor(Math.random() * results.length)
      while (next === prev) next = Math.floor(Math.random() * results.length)
      return next
    })
  }

  const featured = results[featuredIndex]
  const others = results.filter((_, i) => i !== featuredIndex)

  // Rendered in two places: full width inside the side card, and centred and
  // capped under an error message where it stands alone.
  const renderTextForm = (inCard) => (
    <form onSubmit={handleTextSearch} className={`flex w-full flex-col gap-2.5 ${inCard ? '' : 'max-w-[440px] items-center'}`}>
      <p className="text-sm text-ink-faint">{c.textFallbackLabel}</p>
      <div className={`flex w-full gap-2 ${inCard ? 'flex-col' : ''}`}>
        <input
          type="text"
          value={textQuery}
          onChange={(e) => setTextQuery(e.target.value)}
          placeholder={c.textPlaceholder}
          className="flex-1 min-w-0 rounded-full border-[1.5px] border-line-strong bg-surface px-4 py-2.5 text-md outline-none focus:border-chili transition-colors"
        />
        <button
          type="submit"
          disabled={!textQuery.trim()}
          className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-chili px-4 py-2.5 font-utility text-md font-semibold text-chili-ink disabled:opacity-50 ${inCard ? 'w-full' : ''}`}
        >
          <MagnifyingGlass size={15} /> {c.textSubmit}
        </button>
      </div>
    </form>
  )

  return (
    <div className="max-w-[1080px] mx-auto px-5 md:px-8 pt-10 pb-12 md:pt-12 md:pb-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="mb-8 text-center">
        <motion.span variants={fadeUp} className="eyebrow eyebrow-tick">
          {c.eyebrow}
        </motion.span>
        <motion.h1 variants={fadeUp} className="text-2xl md:text-4xl font-bold leading-[1.2] mt-4">{c.title}</motion.h1>
        <motion.p variants={fadeUp} className="text-md text-ink-muted leading-relaxed mt-4 max-w-[46ch] mx-auto">{c.sub}</motion.p>
      </motion.div>

      {/* Two ways in, side by side on a wide screen: spin the wheel, or skip it.
          Stacked in one column they sat below a 460px wheel, so the faster
          route — "just show me what's near" — was only found by scrolling. */}
      {status === 'idle' && !revealPick && (
        <div className="mx-auto grid max-w-[920px] items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col items-center gap-6">
            <p className="font-utility text-sm font-bold uppercase tracking-wide text-ink-faint">{c.wheelTitle}</p>
            <FoodWheel items={wheelItems} onResult={handleWheelResult} spinLabel={c.wheelSpin} spinningLabel={c.wheelSpinning} />
              {!showEditor ? (
                <button
                  onClick={openEditor}
                  className="inline-flex items-center gap-1.5 font-utility text-sm font-semibold text-ink-faint hover:text-chili transition-colors"
                >
                  <SlidersHorizontal size={14} /> {c.customize}
                </button>
              ) : (
                <div className="w-full max-w-[380px] flex flex-col gap-2.5">
                  <p className="text-sm text-ink-faint">{c.editorHint}</p>
                  <textarea
                    value={editorText}
                    onChange={(e) => setEditorText(e.target.value)}
                    placeholder={c.editorPlaceholder}
                    rows={8}
                    className="w-full rounded-xl border-[1.5px] border-line-strong bg-surface px-3.5 py-3 text-md outline-none focus:border-chili transition-colors resize-y"
                  />
                  <div className="flex gap-2 flex-wrap justify-center">
                    <button
                      onClick={saveWheelItems}
                      disabled={editorText.split('\n').map((s) => s.trim()).filter(Boolean).length < 2}
                      className="inline-flex items-center gap-1.5 font-utility font-semibold text-sm px-4 py-2 rounded-full bg-chili text-chili-ink disabled:opacity-50"
                    >
                      {c.editorSave}
                    </button>
                    <button
                      onClick={resetWheelItems}
                      className="inline-flex items-center gap-1.5 font-utility font-semibold text-sm px-4 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                    >
                      {c.editorReset}
                    </button>
                    <button
                      onClick={() => setShowEditor(false)}
                      className="inline-flex items-center gap-1.5 font-utility font-semibold text-sm px-4 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                    >
                      {c.customizeClose}
                    </button>
                  </div>
                </div>
              )}
          </div>

          <aside className="w-full max-w-[400px] justify-self-center rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <p className="font-utility text-xs font-bold uppercase tracking-wide text-ink-faint">{c.otherWays}</p>
            {/* Dark rather than chili: the wheel's spin button is the page's
                primary action, and two identical red pills competed for it. */}
            <button
              onClick={handleLocate}
              className="mt-4 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-3.5 font-utility text-md font-semibold text-paper transition-opacity hover:opacity-90"
            >
              <NavigationArrow size={17} weight="fill" /> {c.cta}
            </button>
            <div className="my-5 flex items-center gap-3 font-utility text-xs font-bold uppercase tracking-wide text-ink-faint">
              <span className="h-px flex-1 bg-line" />{c.or}<span className="h-px flex-1 bg-line" />
            </div>
            {renderTextForm(true)}
          </aside>
        </div>
      )}

      {status === 'idle' && revealPick && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: easeOut }}
          className="flex flex-col items-center gap-5 py-10 text-center"
        >
          <span className="text-4xl">{c.revealEmoji}</span>
          <p className="font-utility text-sm font-bold uppercase tracking-wide text-ink-faint">{c.wheelTitle}</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-chili">{wheelItemLabel(revealPick, lang)}</h2>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={confirmWheelSearch}
              className="inline-flex items-center gap-2.5 font-utility font-semibold text-md px-7 py-4 rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow"
            >
              <MagnifyingGlass size={18} weight="bold" /> {c.revealCta}
            </button>
            <button
              onClick={respinFromReveal}
              className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-3 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
            >
              🎡 {c.revealRespin}
            </button>
          </div>
        </motion.div>
      )}

      {(status === 'locating' || status === 'searching') && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <motion.div
            className="w-9 h-9 rounded-full border-[3px] border-line-strong border-t-chili"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-ink-muted text-md">
            {loadingText}
          </p>
        </div>
      )}

      {(status === 'location-error' || status === 'no-key' || status === 'empty' || status === 'error') && (
        <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 py-10 text-center">
          <div role="status" className="flex items-start gap-2.5 rounded-xl border border-line-strong bg-paper-2 px-5 py-4 text-left text-md text-ink-muted">
            <Warning size={18} className="mt-0.5 shrink-0 text-lantern" />
            <span>{noticeText}</span>
          </div>
          {status !== 'no-key' && (
            <>
              {/* "Thử lại" repeats exactly what failed. It used to always
                  re-run GPS, even after a failed text search. */}
              <button
                onClick={retry}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-utility text-md font-semibold text-paper transition-opacity hover:opacity-90"
              >
                <ArrowsClockwise size={16} /> {c.retry}
              </button>
              <span className="font-utility text-xs font-bold uppercase tracking-wide text-ink-faint">{c.or}</span>
              {renderTextForm(false)}
            </>
          )}
          <button onClick={spinAgain} className="font-utility text-sm font-semibold text-ink-faint transition-colors hover:text-chili">
            🎡 {c.backToWheel}
          </button>
        </div>
      )}

      {status === 'ready' && featured && (
        <>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: easeOut }}>
            {wheelPick && (
              <p className="text-center font-utility text-sm font-bold text-ink-faint mb-1.5">🎡 {c.wheelPicked(wheelItemLabel(wheelPick, lang))}</p>
            )}
            <p className="text-center font-utility text-sm font-bold uppercase tracking-wide text-chili mb-3">{c.featuredLabel}</p>
            <div className="overflow-hidden rounded-2xl border-2 border-chili bg-surface shadow-lifted">
              {/* Eager: this is the hero of the result, and a lazy image that
                  measures 0x0 on first paint is never fetched at all. */}
              <RemoteImage
                src={featured.thumbnailUrl}
                alt={featured.name}
                loading="eager"
                sizeHint="w900-h360-k-no"
                className="h-48 w-full object-cover md:h-60"
              />
              <div className="p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <h2 className="font-display text-2xl font-bold">{featured.name}</h2>
                {featured.rating != null && (
                  <span className="flex items-center gap-1.5 font-utility font-bold text-md text-lantern shrink-0">
                    <Star size={16} weight="fill" /> {featured.rating.toFixed(1)}
                    {featured.userRatingCount != null && (
                      <span className="text-ink-faint font-normal text-sm">({c.ratingsCount(featured.userRatingCount)})</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-md text-ink-muted mb-4">
                <span className="flex items-center gap-1.5"><MapPin size={15} className="text-chili" /> {featured.address}</span>
                {featured.distanceKm != null && (
                  <span className="flex items-center gap-1.5"><Ruler size={15} className="text-chili" /> {c.distance(featured.distanceKm)}</span>
                )}
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={reroll}
                  disabled={results.length < 2}
                  className="inline-flex items-center gap-2 font-utility font-semibold text-md px-5 py-2.5 rounded-full bg-chili text-chili-ink disabled:opacity-50"
                >
                  <ArrowsClockwise size={16} /> {c.reroll}
                </button>
                <button
                  onClick={() => showOnMap(featured.id)}
                  className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-5 py-2.5 font-utility text-md font-semibold transition-colors hover:border-chili"
                >
                  <MapTrifold size={16} /> {c.showOnMap}
                </button>
                {featured.mapsUri && (
                  <a
                    href={featured.mapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-utility font-semibold text-md px-5 py-2.5 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                  >
                    {c.viewOnMaps} ↗
                  </a>
                )}
                <button
                  onClick={handleLocate}
                  className="inline-flex items-center gap-2 font-utility font-semibold text-md px-5 py-2.5 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                >
                  <NavigationArrow size={15} /> {c.restart}
                </button>
                <button
                  onClick={spinAgain}
                  className="inline-flex items-center gap-2 font-utility font-semibold text-md px-5 py-2.5 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                >
                  🎡 {c.spinAgain}
                </button>
              </div>
              <FeaturedReviews place={featured} c={c} />
              </div>
            </div>
          </motion.div>

          {mapOpen && (
            <section
              ref={mapSectionRef}
              className="relative mt-8 h-[72vh] min-h-[520px] scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-paper-2 shadow-soft"
            >
              <ExploreMap
                places={mapPlaces}
                criterion="overall"
                selectedId={selectedId}
                onSelect={setSelectedId}
                userLocation={origin}
                routeGeometry={route?.geometry ?? null}
                className="h-full"
              />
              <button
                type="button"
                onClick={() => { setMapOpen(false); setSelectedId(null) }}
                className="absolute right-14 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/95 px-3 py-2 font-utility text-xs font-semibold shadow-soft transition-colors hover:border-chili hover:text-chili"
              >
                <X size={13} /> {c.closeMap}
              </button>
              {selectedPlace && (
                <MapPlacePreview
                  place={selectedPlace}
                  criterion="overall"
                  onClose={() => setSelectedId(null)}
                  route={route}
                  routeStatus={routeStatus}
                  hasRouteOrigin={Boolean(origin)}
                  transport={transport}
                  onTransportChange={setTransport}
                />
              )}
            </section>
          )}

          {others.length > 0 && (
            <div className="mt-12">
              <h3 className="text-lg font-bold mb-4">{c.fullListTitle}</h3>
              <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {others.map((p) => (
                  <motion.button
                    key={p.id}
                    type="button"
                    variants={fadeUp}
                    onClick={() => showOnMap(p.id)}
                    aria-pressed={selectedId === p.id}
                    className={`grid grid-cols-[96px_1fr] overflow-hidden rounded-xl border bg-surface text-left transition-colors hover:border-chili ${selectedId === p.id ? 'border-chili ring-2 ring-chili/15' : 'border-line'}`}
                  >
                    <RemoteImage
                      src={p.thumbnailUrl}
                      alt={p.name}
                      sizeHint="w192-h240-k-no"
                      className="h-full min-h-[104px] w-full object-cover"
                      fallback={
                        <div className="flex h-full min-h-[104px] w-full items-center justify-center bg-paper-2 text-ink-faint">
                          <ForkKnife size={22} />
                        </div>
                      }
                    />
                    <div className="flex min-w-0 flex-col gap-1 p-3.5">
                      <span className="truncate text-md font-semibold">{p.name}</span>
                      {p.rating != null && (
                        <span className="flex items-center gap-1 font-utility text-xs font-bold text-lantern">
                          <Star size={12} weight="fill" /> {p.rating.toFixed(1)}
                          {p.userRatingCount != null && (
                            <span className="font-normal text-ink-faint">({c.ratingsCount(p.userRatingCount)})</span>
                          )}
                        </span>
                      )}
                      <span className="truncate text-sm text-ink-faint">{p.address}</span>
                      {p.distanceKm != null && (
                        <span className="mt-auto font-utility text-xs text-ink-faint">{c.distance(p.distanceKm)}</span>
                      )}
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
