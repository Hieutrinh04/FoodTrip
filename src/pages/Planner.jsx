import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Minus, Plus, Motorcycle, Car, PersonSimpleWalk, Taxi, ArrowCounterClockwise, MapTrifold, MagicWand, Warning,
  FileXls, FilePdf, Sparkle, BookmarkSimple, ShareNetwork, Check, Bed, CalendarBlank, Path, Clock, ArrowsOut, ArrowsIn,
} from '@phosphor-icons/react'
import CityPattern from '../components/CityPattern.jsx'
import CategoryIcon from '../components/ui/CategoryIcon.jsx'
import Chip from '../components/ui/Chip.jsx'
import ItineraryTicket from '../components/ticket/ItineraryTicket.jsx'
import LiveTripMap from '../components/map/LiveTripMap.jsx'
import HotelCard from '../components/booking/HotelCard.jsx'
import { CITIES, TAGS, TRANSPORT, CATEGORY_LABEL, getCity, getPlacesByCity, registerCustomPlaces } from '../data/destinations.js'
import { generateItinerary } from '../lib/itineraryEngine.js'
import { searchCityPlaces } from '../lib/citySearch.js'
import { searchHotelsForCity, groupHotelsByBudgetTier } from '../lib/hotelSearch.js'
import { withStopIds } from '../lib/itineraryEdit.js'
import { exportItineraryToExcel } from '../lib/exportItinerary.js'
import { parseTripRequestText, resolveDestinationQuery } from '../lib/tripRequest.js'
import { cacheCustomPlaces } from '../lib/customPlacesCache.js'
import { saveItinerary, setItineraryPublic } from '../lib/itineraries.js'
import { shareOrCopyLink } from '../lib/shareLink.js'
import { haversineKm } from '../lib/trackAsia.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer, easeOut } from '../motion/variants.js'

const TRANSPORT_ICON = { bike: Motorcycle, car: Car, walk: PersonSimpleWalk, taxi: Taxi }
const PREFERENCE_TAGS = ['seafood', 'vegetarian', 'coffee', 'oldtown', 'nightlife', 'nature']

const C = {
  vi: {
    eyebrow: 'Lịch trình AI',
    title: 'Cùng dựng lịch trình vừa ý bạn.',
    steps: ['Điểm đến', 'Thời gian & ngân sách', 'Chọn khách sạn', 'Sở thích & di chuyển', 'Lịch trình của bạn'],
    stepCity: 'Bạn muốn đi đâu?',
    stepTime: 'Đi bao lâu, với ngân sách nào?',
    duration: 'Thời gian',
    durationMinus: 'Giảm số ngày', durationPlus: 'Tăng số ngày',
    budget: 'Ngân sách / người',
    people: 'Số người',
    stepHotel: 'Bạn muốn ở khách sạn nào?',
    hotelHint: 'FoodTrip tìm khách sạn thật quanh điểm đến, xếp theo tầm giá bạn vừa chọn. Chọn 1 khách sạn hoặc bỏ qua, chọn sau cũng được.',
    hotelSearching: 'Đang tìm khách sạn phù hợp…',
    hotelNoKey: 'Cần cấu hình Google Maps API key để tìm khách sạn thật — bạn có thể bỏ qua bước này, không ảnh hưởng đến lịch trình.',
    hotelEmpty: 'Không tìm thấy khách sạn nào ở điểm đến này — bỏ qua bước này cũng được.',
    hotelError: 'Có lỗi khi tìm khách sạn, thử lại sau hoặc bỏ qua bước này.',
    tierMatch: 'Đúng tầm giá của bạn', tierValue: 'Tiết kiệm hơn', tierPremium: 'Cao cấp hơn',
    hotelReviews: (n) => `${n} đánh giá`,
    selectHotel: 'Chọn khách sạn này', hotelSelectedChip: 'Đã chọn',
    skipHotel: 'Bỏ qua, chọn sau', nextWithHotel: 'Tiếp tục',
    stepPref: 'Bạn thích điều gì?',
    prefHint: 'Chọn sở thích để FoodTrip đánh dấu những điểm dừng hợp gu bạn nhất.',
    transport: 'Phương tiện di chuyển',
    back: 'Quay lại', next: 'Tiếp tục', generate: 'Tạo lịch trình',
    resultTitle: (city) => `Lịch trình ${city} đã sẵn sàng!`,
    resultSub: 'FoodTrip đã kiểm tra giờ mở cửa và khoảng cách giữa các điểm cho bạn.',
    restart: 'Tạo lịch trình khác',
    people1: 'người', peopleN: 'người',
    generating: 'Đang chấm điểm địa điểm theo đánh giá Google và sở thích của bạn…',
    showMap: 'Xem bản đồ trực tiếp', hideMap: 'Ẩn bản đồ',
    orOther: 'Hoặc nhập điểm đến khác',
    otherPlaceholder: 'vd: Phan Thiết, Quy Nhơn, Phú Quốc…',
    searchDest: 'Tìm kiếm',
    searchingDest: (name) => `Đang tìm địa điểm nổi bật tại ${name}…`,
    noKeyDest: 'Cần cấu hình Google Maps API key để tìm điểm đến ngoài 6 thành phố có sẵn — bạn có thể chọn 1 trong các thành phố ở trên.',
    emptyDest: (name) => `Không tìm thấy đủ dữ liệu cho "${name}" — thử tên khác hoặc chọn 1 thành phố có sẵn ở trên.`,
    errorDest: 'Có lỗi khi tìm kiếm, thử lại sau nhé.',
    resultsHint: 'Chọn những địa điểm bạn muốn đưa vào lịch trình (đã chọn sẵn hết):',
    selectedCount: (n) => `Đã chọn ${n} địa điểm`,
    exportExcel: 'Xuất Excel', exportPdf: 'Xuất PDF',
    saveTrip: 'Lưu lịch trình', saveTripSaved: 'Đã lưu', saveTripError: 'Lưu thất bại, thử lại nhé.',
    saveTripLoginHint: 'Đăng nhập (góc trên) để lưu lịch trình này lại xem sau.',
    shareTrip: 'Chia sẻ cho bạn bè', shareTripCopied: 'Đã sao chép liên kết!', shareTripShared: 'Đã chia sẻ!', shareTripError: 'Chia sẻ thất bại, thử lại nhé.',
    shareTripTitle: (dest) => `Lịch trình ${dest} trên FoodTrip`,
    shareTripText: 'Xem lịch trình mình vừa tạo trên FoodTrip nè!',
    quickTitle: 'Mô tả nhanh chuyến đi của bạn (AI tự điền)',
    quickPlaceholder: 'vd: Lên lịch 3 ngày biển dưới 2 triệu, thích hải sản, đi xe máy…',
    quickSubmit: 'Điền tự động',
    quickParsing: 'AI đang đọc yêu cầu của bạn…',
    quickNoKey: 'Chưa cấu hình API AI (ANTHROPIC_API_KEY) — bạn tự chọn bên dưới nhé.',
    quickErrorText: 'Không đọc được yêu cầu, thử diễn đạt khác xem sao.',
    quickApplied: 'Đã điền tự động theo mô tả của bạn — kiểm tra lại bên dưới nhé!',
  },
  en: {
    eyebrow: 'AI Itinerary',
    title: 'Let’s build a plan you’ll love.',
    steps: ['Destination', 'Time & budget', 'Choose a hotel', 'Preferences & transport', 'Your itinerary'],
    stepCity: 'Where do you want to go?',
    stepTime: 'How long, and what budget?',
    duration: 'Duration',
    durationMinus: 'Decrease days', durationPlus: 'Increase days',
    budget: 'Budget / person',
    people: 'Group size',
    stepHotel: 'Which hotel would you like to stay at?',
    hotelHint: "FoodTrip finds real hotels near your destination, ranked by the budget you just set. Pick one or skip this — you can always choose later.",
    hotelSearching: 'Finding hotels that fit…',
    hotelNoKey: "A Google Maps API key is needed to find real hotels — you can skip this step, it won't affect your itinerary.",
    hotelEmpty: 'No hotels found for this destination — feel free to skip this step.',
    hotelError: 'Something went wrong searching for hotels — try again or skip this step.',
    tierMatch: 'Right in your budget', tierValue: 'Better value', tierPremium: 'More upscale',
    hotelReviews: (n) => `${n} reviews`,
    selectHotel: 'Select this hotel', hotelSelectedChip: 'Selected',
    skipHotel: 'Skip, choose later', nextWithHotel: 'Continue',
    stepPref: 'What do you enjoy?',
    prefHint: 'Pick preferences and FoodTrip will flag the stops that match your taste best.',
    transport: 'Transport',
    back: 'Back', next: 'Continue', generate: 'Generate itinerary',
    resultTitle: (city) => `Your ${city} itinerary is ready!`,
    resultSub: 'FoodTrip checked real opening hours and distances between stops.',
    restart: 'Plan another trip',
    people1: 'person', peopleN: 'people',
    generating: 'Scoring places by Google ratings and your preferences…',
    showMap: 'Show live map', hideMap: 'Hide map',
    orOther: 'Or enter another destination',
    otherPlaceholder: 'e.g. Phan Thiet, Quy Nhon, Phu Quoc…',
    searchDest: 'Search',
    searchingDest: (name) => `Finding notable spots in ${name}…`,
    noKeyDest: 'A Google Maps API key is needed to search destinations outside the 6 cities above — you can pick one of those instead.',
    emptyDest: (name) => `Couldn't find enough data for "${name}" — try another name or pick a city above.`,
    errorDest: 'Something went wrong searching — please try again.',
    resultsHint: 'Pick which places to include in the itinerary (all selected by default):',
    selectedCount: (n) => `${n} places selected`,
    exportExcel: 'Export Excel', exportPdf: 'Export PDF',
    saveTrip: 'Save itinerary', saveTripSaved: 'Saved', saveTripError: 'Save failed — please try again.',
    saveTripLoginHint: 'Log in (top right) to save this itinerary for later.',
    shareTrip: 'Share with friends', shareTripCopied: 'Link copied!', shareTripShared: 'Shared!', shareTripError: 'Share failed — please try again.',
    shareTripTitle: (dest) => `${dest} itinerary on FoodTrip`,
    shareTripText: 'Check out this trip I planned on FoodTrip!',
    quickTitle: 'Describe your trip in a sentence (AI fills it in)',
    quickPlaceholder: 'e.g. Plan a 3-day beach trip under 2 million, love seafood, on a motorbike…',
    quickSubmit: 'Auto-fill',
    quickParsing: 'AI is reading your request…',
    quickNoKey: 'AI API not configured (ANTHROPIC_API_KEY) — please choose manually below.',
    quickErrorText: "Couldn't parse that request — try rephrasing it.",
    quickApplied: 'Auto-filled from your description — double-check below!',
  },
}

function formatVnd(n) {
  return n.toLocaleString('vi-VN') + 'đ'
}

function durationLabel(n, lang) {
  if (n === 1) return lang === 'vi' ? '1 ngày' : '1 day'
  return lang === 'vi' ? `${n} ngày ${n - 1} đêm` : `${n} days, ${n - 1} nights`
}

export default function Planner() {
  const { lang } = useLanguage()
  const c = C[lang]
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [cityId, setCityId] = useState('hoian')
  const [destMode, setDestMode] = useState('curated') // 'curated' | 'custom'
  const [duration, setDuration] = useState(2)
  const [budget, setBudget] = useState(1500000)
  const [people, setPeople] = useState(2)
  const [prefs, setPrefs] = useState(['seafood', 'coffee'])
  const [transport, setTransport] = useState('bike')
  const [days, setDays] = useState(null)
  const [hotels, setHotels] = useState([])
  const [hotelStatus, setHotelStatus] = useState('idle') // idle | searching | ready | no-key | empty | error
  const [selectedHotelId, setSelectedHotelId] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [activeMapDay, setActiveMapDay] = useState(0)

  const [customCityName, setCustomCityName] = useState('')
  const [citySearchStatus, setCitySearchStatus] = useState('idle') // idle | searching | results | no-key | empty | error
  const [cityCandidates, setCityCandidates] = useState([])
  const [selectedCandidateIds, setSelectedCandidateIds] = useState(new Set())
  const [confirmedCustomPlaces, setConfirmedCustomPlaces] = useState(null)
  const [customCity, setCustomCity] = useState(null)

  const [quickText, setQuickText] = useState('')
  const [quickStatus, setQuickStatus] = useState('idle') // idle | parsing | no-key | error
  const [quickNotice, setQuickNotice] = useState(null)

  const [saveTripStatus, setSaveTripStatus] = useState('idle') // idle | saving | saved | error
  const [savedTripId, setSavedTripId] = useState(null)
  const [shareStatus, setShareStatus] = useState('idle') // idle | sharing | copied | shared | error

  const city = destMode === 'custom' ? customCity : getCity(cityId)

  function selectCuratedCity(id) {
    setDestMode('curated')
    setCityId(id)
    setCitySearchStatus('idle')
    setCityCandidates([])
  }

  async function runCitySearch(name) {
    if (!name) return
    setCitySearchStatus('searching')
    try {
      const results = await searchCityPlaces(name)
      if (results === null) {
        setCitySearchStatus('no-key')
        return
      }
      if (!results.length) {
        setCitySearchStatus('empty')
        return
      }
      setCityCandidates(results)
      setSelectedCandidateIds(new Set(results.map((r) => r.id)))
      setDestMode('custom')
      setCitySearchStatus('results')
    } catch {
      setCitySearchStatus('error')
    }
  }

  function handleSearchDestination(e) {
    e.preventDefault()
    runCitySearch(customCityName.trim())
  }

  async function handleQuickFill(e) {
    e.preventDefault()
    if (!quickText.trim()) return
    setQuickStatus('parsing')
    setQuickNotice(null)
    try {
      const parsed = await parseTripRequestText(quickText.trim())
      if (parsed.error === 'missing-api-key') {
        setQuickStatus('no-key')
        return
      }
      if (parsed.error) {
        setQuickStatus('error')
        return
      }

      if (parsed.duration) setDuration(Math.min(14, Math.max(1, parsed.duration)))
      if (parsed.budgetPerPerson) setBudget(Math.min(3000000, Math.max(500000, parsed.budgetPerPerson)))
      if (parsed.people) setPeople(Math.min(8, Math.max(1, parsed.people)))
      if (parsed.transport && TRANSPORT[parsed.transport]) setTransport(parsed.transport)
      if (parsed.prefs?.length) setPrefs(parsed.prefs.filter((t) => PREFERENCE_TAGS.includes(t)))

      const resolved = resolveDestinationQuery(parsed.destinationQuery)
      setQuickStatus('idle')
      setQuickNotice(c.quickApplied)

      if (resolved?.type === 'curated') {
        selectCuratedCity(resolved.cityId)
        goNext()
      } else if (resolved?.type === 'custom') {
        setCustomCityName(resolved.name)
        runCitySearch(resolved.name)
      }
    } catch {
      setQuickStatus('error')
    }
  }

  function toggleCandidate(id) {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const canAdvanceFromCity =
    destMode === 'curated' ? Boolean(cityId) : citySearchStatus === 'results' && selectedCandidateIds.size > 0

  function confirmDestinationAndAdvance() {
    if (destMode === 'custom') {
      const selected = cityCandidates.filter((p) => selectedCandidateIds.has(p.id))
      registerCustomPlaces(selected)
      cacheCustomPlaces(selected)
      setConfirmedCustomPlaces(selected)
      setCustomCity({
        id: 'custom',
        pattern: 'skyline',
        accent: 'chili',
        name: { vi: customCityName.trim(), en: customCityName.trim() },
      })
    }
    goNext()
  }

  function togglePref(tag) {
    setPrefs((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, 4))
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  async function runHotelSearch() {
    setSelectedHotelId(null)
    setHotelStatus('searching')
    try {
      const budgetPerPersonPerDay = budget / Math.max(people, 1)
      const results = await searchHotelsForCity({ cityName: city.name.vi, budgetPerPersonPerDay })
      if (results === null) {
        setHotelStatus('no-key')
        return
      }
      if (!results.length) {
        setHotelStatus('empty')
        return
      }
      setHotels(results)
      setHotelStatus('ready')
    } catch {
      setHotelStatus('error')
    }
  }

  function confirmBudgetAndAdvance() {
    runHotelSearch()
    goNext()
  }

  async function handleGenerate() {
    setStep(4)
    setGenerating(true)
    setShowMap(false)
    setActiveMapDay(0)
    setSaveTripStatus('idle')
    setSavedTripId(null)
    setShareStatus('idle')
    const generatedDays = await generateItinerary({
      cityId: destMode === 'curated' ? cityId : undefined,
      places: destMode === 'custom' ? confirmedCustomPlaces : undefined,
      duration,
      budget,
      people,
      prefs,
      transport,
    })
    setDays(withStopIds(generatedDays))
    setGenerating(false)
  }

  function handleExportExcel() {
    exportItineraryToExcel({ city, days, hotels, people, budget, transport, lang })
  }

  function handleExportPdf() {
    window.print()
  }

  async function persistTrip(isPublic) {
    const id = await saveItinerary({
      userId: user.id,
      cityId: destMode === 'curated' ? cityId : null,
      customCityName: destMode === 'custom' ? customCityName.trim() : null,
      duration,
      budget,
      people,
      transport,
      prefs,
      days,
      hotels,
      isPublic,
    })
    setSavedTripId(id)
    return id
  }

  async function handleSaveTrip() {
    if (!user) return
    setSaveTripStatus('saving')
    try {
      await persistTrip(false)
      setSaveTripStatus('saved')
    } catch {
      setSaveTripStatus('error')
    }
  }

  async function handleShare() {
    if (!user) return
    setShareStatus('sharing')
    try {
      const id = savedTripId ?? (await persistTrip(true))
      if (savedTripId) await setItineraryPublic(id, true)
      setSaveTripStatus('saved')
      const url = `${window.location.origin}/trip/${id}`
      const result = await shareOrCopyLink(url, { title: c.shareTripTitle(city.name[lang]), text: c.shareTripText })
      if (result === 'shared') setShareStatus('shared')
      else if (result === 'copied') setShareStatus('copied')
      else if (result === 'cancelled') setShareStatus('idle')
      else setShareStatus('error')
    } catch {
      setShareStatus('error')
    }
  }

  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-12 md:py-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="no-print max-w-[700px] mb-10">
        <motion.span variants={fadeUp} className="font-utility text-[12.5px] font-bold uppercase tracking-[0.14em] text-chili inline-flex items-center gap-2 before:content-[''] before:w-4 before:h-[1.5px] before:bg-chili">
          {c.eyebrow}
        </motion.span>
        <motion.h1 variants={fadeUp} className="text-[32px] md:text-[44px] font-bold leading-[1.15] mt-3">{c.title}</motion.h1>
      </motion.div>

      <div className="no-print">
        <StepProgress steps={c.steps} current={step} />
      </div>

      <StepWrap key={step}>
        {step === 0 && (
          <>
            <div className="mb-8 rounded-xl border-[1.5px] border-dashed border-line-strong p-4 sm:p-5">
              <label className="font-utility text-[12px] font-bold uppercase tracking-wide text-chili flex items-center gap-1.5 mb-2">
                <Sparkle size={14} weight="fill" /> {c.quickTitle}
              </label>
              <form onSubmit={handleQuickFill} className="flex gap-2 flex-col sm:flex-row">
                <input
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                  placeholder={c.quickPlaceholder}
                  className="flex-1 min-w-0 rounded-full border-[1.5px] border-line-strong px-4 py-2.5 text-[14px] outline-none focus:border-chili"
                />
                <button
                  type="submit"
                  disabled={quickStatus === 'parsing'}
                  className="inline-flex items-center justify-center gap-2 font-utility font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-chili text-chili-ink shrink-0 disabled:opacity-60"
                >
                  <MagicWand size={15} /> {c.quickSubmit}
                </button>
              </form>
              {quickStatus === 'parsing' && <p className="mt-2.5 text-[13px] text-ink-muted">{c.quickParsing}</p>}
              {quickStatus === 'no-key' && <p className="mt-2.5 text-[13px] text-lantern">{c.quickNoKey}</p>}
              {quickStatus === 'error' && <p className="mt-2.5 text-[13px] text-lantern">{c.quickErrorText}</p>}
              {quickNotice && quickStatus === 'idle' && <p className="mt-2.5 text-[13px] text-herb font-medium">{quickNotice}</p>}
            </div>

            <h2 className="text-[20px] font-bold mb-5">{c.stepCity}</h2>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
              {CITIES.map((ci) => (
                <button
                  key={ci.id}
                  onClick={() => selectCuratedCity(ci.id)}
                  className={`rounded-xl overflow-hidden border-2 transition-colors text-left ${destMode === 'curated' && cityId === ci.id ? 'border-chili' : 'border-transparent'}`}
                >
                  {ci.image ? (
                    <img src={ci.image} alt={ci.name[lang]} loading="lazy" className="h-[100px] w-full object-cover" />
                  ) : (
                    <CityPattern pattern={ci.pattern} accent={ci.accent} className="h-[100px]" />
                  )}
                  <div className="bg-surface p-3">
                    <div className="font-bold text-[14.5px]">{ci.name[lang]}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-dashed border-line">
              <label className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint block mb-2">{c.orOther}</label>
              <form onSubmit={handleSearchDestination} className="flex gap-2 max-w-[480px]">
                <input
                  value={customCityName}
                  onChange={(e) => setCustomCityName(e.target.value)}
                  placeholder={c.otherPlaceholder}
                  className="flex-1 min-w-0 rounded-full border-[1.5px] border-line-strong px-4 py-2.5 text-[14px] outline-none focus:border-chili"
                />
                <button
                  type="submit"
                  disabled={citySearchStatus === 'searching'}
                  className="inline-flex items-center gap-2 font-utility font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-chili text-chili-ink shrink-0 disabled:opacity-60"
                >
                  <MagicWand size={15} /> {c.searchDest}
                </button>
              </form>

              {citySearchStatus === 'searching' && (
                <p className="mt-3 text-[13.5px] text-ink-muted">{c.searchingDest(customCityName.trim())}</p>
              )}
              {(citySearchStatus === 'no-key' || citySearchStatus === 'empty' || citySearchStatus === 'error') && (
                <p className="mt-3 flex items-start gap-2 text-[13.5px] text-lantern">
                  <Warning size={16} className="shrink-0 mt-0.5" />
                  {citySearchStatus === 'no-key' ? c.noKeyDest : citySearchStatus === 'empty' ? c.emptyDest(customCityName.trim()) : c.errorDest}
                </p>
              )}

              {citySearchStatus === 'results' && (
                <div className="mt-5">
                  <p className="text-[13.5px] text-ink-muted mb-3">{c.resultsHint}</p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {cityCandidates.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 rounded-lg border-[1.5px] px-3.5 py-2.5 cursor-pointer transition-colors ${selectedCandidateIds.has(p.id) ? 'border-chili bg-paper-2' : 'border-line-strong'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCandidateIds.has(p.id)}
                          onChange={() => toggleCandidate(p.id)}
                          className="accent-[var(--chili)] shrink-0"
                        />
                        <CategoryIcon category={p.category} size={16} className="shrink-0 text-ink-faint" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[13.5px] truncate">{p.name[lang]}</div>
                          <div className="font-utility text-[11px] text-ink-faint">{CATEGORY_LABEL[p.category][lang]} · {p.rating?.toFixed(1) ?? '–'}★</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 font-utility text-[12px] font-semibold text-chili">{c.selectedCount(selectedCandidateIds.size)}</p>
                </div>
              )}
            </div>

            <NavRow onNext={confirmDestinationAndAdvance} nextLabel={c.next} nextDisabled={!canAdvanceFromCity} />
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-[20px] font-bold mb-5">{c.stepTime}</h2>
            <div className="flex flex-col gap-7 max-w-[520px]">
              <div>
                <label className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint block mb-2">{c.duration}</label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setDuration((d) => Math.max(1, d - 1))}
                    aria-label={c.durationMinus}
                    className="w-11 h-11 rounded-full border-[1.5px] border-line-strong flex items-center justify-center hover:border-chili shrink-0"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="font-display font-bold text-[22px] w-12 text-center tabular shrink-0">{duration}</span>
                  <button
                    onClick={() => setDuration((d) => Math.min(14, d + 1))}
                    aria-label={c.durationPlus}
                    className="w-11 h-11 rounded-full border-[1.5px] border-line-strong flex items-center justify-center hover:border-chili shrink-0"
                  >
                    <Plus size={16} />
                  </button>
                  <span className="text-ink-muted">{durationLabel(duration, lang)}</span>
                </div>
              </div>

              <div>
                <label className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint block mb-2">
                  {c.budget}: <span className="text-chili tabular">{formatVnd(budget)}</span>
                </label>
                <input
                  type="range"
                  min={500000}
                  max={3000000}
                  step={100000}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full accent-[var(--chili)]"
                />
              </div>

              <div>
                <label className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint block mb-2">{c.people}</label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setPeople((p) => Math.max(1, p - 1))}
                    aria-label="Giảm số người"
                    className="w-11 h-11 rounded-full border-[1.5px] border-line-strong flex items-center justify-center hover:border-chili"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="font-display font-bold text-[22px] w-12 text-center tabular">{people}</span>
                  <button
                    onClick={() => setPeople((p) => Math.min(8, p + 1))}
                    aria-label="Tăng số người"
                    className="w-11 h-11 rounded-full border-[1.5px] border-line-strong flex items-center justify-center hover:border-chili"
                  >
                    <Plus size={16} />
                  </button>
                  <span className="text-ink-muted">{people === 1 ? c.people1 : c.peopleN}</span>
                </div>
              </div>
            </div>
            <NavRow onBack={goBack} onNext={confirmBudgetAndAdvance} backLabel={c.back} nextLabel={c.next} />
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-[20px] font-bold mb-2">{c.stepHotel}</h2>
            <p className="text-[14px] text-ink-muted mb-5 max-w-[52ch]">{c.hotelHint}</p>

            {hotelStatus === 'searching' && <p className="text-ink-muted text-[14.5px]">{c.hotelSearching}</p>}
            {(hotelStatus === 'no-key' || hotelStatus === 'empty' || hotelStatus === 'error') && (
              <p className="flex items-start gap-2 text-[13.5px] text-lantern">
                <Warning size={16} className="shrink-0 mt-0.5" />
                {hotelStatus === 'no-key' ? c.hotelNoKey : hotelStatus === 'empty' ? c.hotelEmpty : c.hotelError}
              </p>
            )}

            {hotelStatus === 'ready' && (
              <div className="flex flex-col gap-6">
                {[
                  { key: 'match', label: c.tierMatch },
                  { key: 'value', label: c.tierValue },
                  { key: 'premium', label: c.tierPremium },
                ].map(({ key, label }) => {
                  const group = groupHotelsByBudgetTier(hotels, budget / Math.max(people, 1))[key]
                  if (!group.length) return null
                  return (
                    <div key={key}>
                      <div className="font-utility text-[11.5px] font-bold uppercase tracking-wide text-chili mb-3">{label}</div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.map((hotel) => (
                          <HotelCard
                            key={hotel.id}
                            hotel={hotel}
                            cityName={city.name.vi}
                            selected={selectedHotelId === hotel.id}
                            onSelect={() => setSelectedHotelId(selectedHotelId === hotel.id ? null : hotel.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <NavRow onBack={goBack} onNext={goNext} backLabel={c.back} nextLabel={selectedHotelId ? c.nextWithHotel : c.skipHotel} />
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-[20px] font-bold mb-2">{c.stepPref}</h2>
            <p className="text-[14px] text-ink-muted mb-5 max-w-[52ch]">{c.prefHint}</p>
            <div className="flex flex-wrap gap-2 mb-8">
              {PREFERENCE_TAGS.map((tag) => (
                <Chip key={tag} active={prefs.includes(tag)} onClick={() => togglePref(tag)}>
                  {TAGS[tag][lang]}
                </Chip>
              ))}
            </div>

            <label className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint block mb-2">{c.transport}</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TRANSPORT).map(([key, label]) => {
                const Icon = TRANSPORT_ICON[key]
                return (
                  <button
                    key={key}
                    onClick={() => setTransport(key)}
                    className={`flex items-center gap-2 font-utility text-[13px] font-semibold px-4 py-2.5 rounded-full border-[1.5px] transition-colors ${transport === key ? 'bg-herb border-herb text-herb-ink' : 'border-line-strong hover:border-chili'}`}
                  >
                    <Icon size={16} /> {label[lang]}
                  </button>
                )
              })}
            </div>
            <NavRow onBack={goBack} onNext={handleGenerate} backLabel={c.back} nextLabel={c.generate} nextLoading={generating} />
          </>
        )}

        {step === 4 && (
          <>
            {generating || !days ? (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <motion.div
                  className="w-10 h-10 rounded-full border-[3px] border-line-strong border-t-chili"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
                <p className="text-ink-muted text-[14.5px] max-w-[40ch]">{c.generating}</p>
              </div>
            ) : (
              <>
                <div className="no-print text-center mb-8">
                  <h2 className="text-[24px] md:text-[28px] font-bold mb-2">{c.resultTitle(city.name[lang])}</h2>
                  <p className="text-ink-muted">{c.resultSub}</p>
                </div>
                <ItineraryTicket
                  city={city}
                  days={days}
                  hotels={hotels}
                  selectedHotelId={selectedHotelId}
                  people={people}
                  budget={budget}
                  transport={transport}
                  preferredTags={prefs}
                  animate="mount"
                  editable
                  onDaysChange={setDays}
                  candidatePlaces={destMode === 'curated' ? getPlacesByCity(cityId) : (confirmedCustomPlaces ?? [])}
                  cityId={destMode === 'curated' ? cityId : null}
                />
                <div className="no-print flex justify-center gap-3 mt-8 flex-wrap">
                  <button
                    onClick={() => setShowMap((v) => !v)}
                    className="inline-flex items-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-[14px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow"
                  >
                    <MapTrifold size={16} /> {showMap ? c.hideMap : c.showMap}
                  </button>
                  {user && (
                    <button
                      onClick={handleSaveTrip}
                      disabled={saveTripStatus === 'saving' || saveTripStatus === 'saved'}
                      className="inline-flex items-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-[14px] rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors disabled:opacity-70"
                    >
                      <BookmarkSimple size={16} weight={saveTripStatus === 'saved' ? 'fill' : 'regular'} />
                      {saveTripStatus === 'saved' ? c.saveTripSaved : c.saveTrip}
                    </button>
                  )}
                  {user && (
                    <button
                      onClick={handleShare}
                      disabled={shareStatus === 'sharing'}
                      className="inline-flex items-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-[14px] rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors disabled:opacity-70"
                    >
                      {shareStatus === 'copied' || shareStatus === 'shared' ? <Check size={16} /> : <ShareNetwork size={16} />}
                      {shareStatus === 'copied' ? c.shareTripCopied : shareStatus === 'shared' ? c.shareTripShared : c.shareTrip}
                    </button>
                  )}
                  <button
                    onClick={handleExportExcel}
                    className="inline-flex items-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-[14px] rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors"
                  >
                    <FileXls size={16} /> {c.exportExcel}
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="inline-flex items-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-[14px] rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors"
                  >
                    <FilePdf size={16} /> {c.exportPdf}
                  </button>
                  <button
                    onClick={() => { setStep(0); setDays(null); setHotels([]); setHotelStatus('idle'); setSelectedHotelId(null) }}
                    className="inline-flex items-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-[14px] rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors"
                  >
                    <ArrowCounterClockwise size={16} /> {c.restart}
                  </button>
                </div>
                {!user && <p className="no-print text-center text-[13px] text-ink-faint mt-3">{c.saveTripLoginHint}</p>}
                {saveTripStatus === 'error' && <p className="no-print text-center text-[13px] text-chili mt-3">{c.saveTripError}</p>}
                {shareStatus === 'error' && <p className="no-print text-center text-[13px] text-chili mt-3">{c.shareTripError}</p>}
                {showMap && (
                  <div className="no-print mt-6 max-w-[880px] mx-auto">
                    <DailyItineraryMap
                      days={days}
                      hotels={hotels}
                      selectedHotelId={selectedHotelId}
                      activeDay={activeMapDay}
                      onActiveDayChange={setActiveMapDay}
                      transport={transport}
                      lang={lang}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </StepWrap>
    </div>
  )
}

function DailyItineraryMap({ days, hotels, selectedHotelId, activeDay, onActiveDayChange, transport, lang }) {
  const [expanded, setExpanded] = useState(false)
  const selectedHotel = hotels.find((hotel) => hotel.id === selectedHotelId) ?? null
  const isOverview = activeDay === 0
  const selectedDay = isOverview ? null : days[activeDay - 1]

  const hotelStart = selectedHotel?.location
    ? {
        placeId: `hotel-${selectedHotel.id}`,
        kind: 'hotel',
        name: selectedHotel.name,
        address: selectedHotel.address,
        location: selectedHotel.location,
        time: lang === 'vi' ? 'Bắt đầu' : 'Start',
      }
    : null

  const dayStops = selectedDay?.map((stop, index) => ({ ...stop, displayIndex: index + 1 })) ?? []
  const overviewColors = ['#d8481f', '#2f7f70', '#7357a6', '#2776a8', '#b06a24', '#5c7853']
  const mappedStops = isOverview
    ? [
        ...(hotelStart ? [hotelStart] : []),
        ...days.flatMap((day, dayIndex) => day.map((stop, stopIndex) => ({
          ...stop,
          displayIndex: stopIndex + 1,
          markerColor: overviewColors[dayIndex % overviewColors.length],
        }))),
      ]
    : [
        ...(hotelStart ? [hotelStart] : []),
        ...dayStops,
        ...(hotelStart ? [{ ...hotelStart, placeId: `${hotelStart.placeId}-return`, hideMarker: true }] : []),
      ]

  const overviewRoutes = isOverview
    ? days.map((day, index) => ({
        color: overviewColors[index % overviewColors.length],
        stops: [...(hotelStart ? [hotelStart] : []), ...day, ...(hotelStart ? [hotelStart] : [])],
      }))
    : []

  const routeDistanceKm = !isOverview
    ? mappedStops.slice(1).reduce((total, stop, index) => {
        const previous = mappedStops[index]
        return total + (haversineKm(previous?.location, stop.location) ?? 0)
      }, 0)
    : 0
  const speedKmH = { walk: 4.5, bike: 28, car: 32, taxi: 32 }[transport] ?? 28
  const estimatedMinutes = Math.max(0, Math.round((routeDistanceKm / speedKmH) * 60))

  useEffect(() => {
    const resizeTimer = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    if (!expanded) return () => window.clearTimeout(resizeTimer)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(resizeTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    }
  }, [expanded])

  return (
    <section className={`${expanded ? 'fixed inset-3 z-[100] flex flex-col shadow-lifted sm:inset-6' : ''} overflow-hidden rounded-[16px] border border-line-strong bg-surface shadow-soft`}>
      <div className="flex flex-col gap-4 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 font-bold text-[16px]">
              {selectedHotel ? <Bed size={19} className="text-herb" weight="fill" /> : <CalendarBlank size={19} className="text-chili" />}
              {isOverview
                ? (lang === 'vi' ? 'Tổng quan chuyến đi' : 'Trip overview')
                : (lang === 'vi' ? `Tuyến đường ngày ${activeDay}` : `Day ${activeDay} route`)}
            </div>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              {selectedHotel
                ? (isOverview
                    ? (lang === 'vi' ? `Mỗi ngày bắt đầu và kết thúc tại ${selectedHotel.name}.` : `Every day starts and ends at ${selectedHotel.name}.`)
                    : (lang === 'vi' ? `${selectedHotel.name} → các điểm trong ngày → quay về nơi lưu trú` : `${selectedHotel.name} → daily stops → return to accommodation`))
                : (lang === 'vi' ? 'Chọn khách sạn để dùng làm điểm đầu và cuối của từng ngày.' : 'Choose a hotel to anchor the start and end of every day.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isOverview && (
              <span className="rounded-full bg-paper-2 px-3 py-1.5 font-utility text-[11px] font-bold uppercase tracking-wide text-herb">
                {dayStops.length} {lang === 'vi' ? 'điểm dừng' : 'stops'}
              </span>
            )}
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-paper-2 text-ink-muted transition-colors hover:text-chili"
              aria-label={expanded ? (lang === 'vi' ? 'Thu nhỏ bản đồ' : 'Exit full map') : (lang === 'vi' ? 'Mở rộng bản đồ' : 'Expand map')}
            >
              {expanded ? <ArrowsIn size={17} /> : <ArrowsOut size={17} />}
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={lang === 'vi' ? 'Chọn ngày trên bản đồ' : 'Select map day'}>
          <MapDayTab active={isOverview} onClick={() => onActiveDayChange(0)} label={lang === 'vi' ? 'Tổng quan' : 'Overview'} />
          {days.map((_, index) => (
            <MapDayTab
              key={index}
              active={activeDay === index + 1}
              onClick={() => onActiveDayChange(index + 1)}
              label={lang === 'vi' ? `Ngày ${index + 1}` : `Day ${index + 1}`}
            />
          ))}
        </div>
        {isOverview && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11.5px] text-ink-muted">
            {days.map((_, index) => (
              <span key={index} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: overviewColors[index % overviewColors.length] }} />
                {lang === 'vi' ? `Ngày ${index + 1}` : `Day ${index + 1}`}
              </span>
            ))}
          </div>
        )}
        {!isOverview && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="flex items-center gap-2 rounded-lg bg-paper-2 px-3 py-2 text-[12px] text-ink-muted">
              <Path size={15} className="text-chili" />
              <span><strong className="text-ink">{routeDistanceKm.toFixed(1)} km</strong> {lang === 'vi' ? 'ước tính' : 'estimated'}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-paper-2 px-3 py-2 text-[12px] text-ink-muted">
              <Clock size={15} className="text-herb" />
              <span><strong className="text-ink">{estimatedMinutes} {lang === 'vi' ? 'phút' : 'min'}</strong> {lang === 'vi' ? 'di chuyển' : 'travel'}</span>
            </div>
          </div>
        )}
      </div>

      <LiveTripMap
        key={`${activeDay}-${selectedHotelId ?? 'no-hotel'}`}
        stops={mappedStops}
        transport={transport}
        showRoute={!isOverview}
        overviewRoutes={overviewRoutes}
        className={`${expanded ? 'min-h-0 flex-1 [&>div:first-child]:h-full [&>div:first-child>div:first-child]:h-full' : ''} [&>div:first-child]:rounded-none [&>div:first-child]:border-0`}
      />
    </section>
  )
}

function MapDayTab({ active, onClick, label }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 font-utility text-[12.5px] font-semibold transition-colors ${
        active ? 'bg-chili text-chili-ink shadow-soft' : 'bg-paper-2 text-ink-muted hover:text-chili'
      }`}
    >
      {label}
    </button>
  )
}

function StepWrap({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: easeOut }}
    >
      {children}
    </motion.div>
  )
}

function NavRow({ onBack, onNext, backLabel, nextLabel, nextLoading = false, nextDisabled = false }) {
  return (
    <div className="flex items-center justify-between mt-8">
      {onBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] text-ink-muted hover:text-chili transition-colors">
          <ArrowLeft size={16} /> {backLabel}
        </button>
      ) : <span />}
      <button
        onClick={onNext}
        disabled={nextLoading || nextDisabled}
        className="inline-flex items-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-[13px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted active:scale-[0.97] transition-all disabled:opacity-60"
      >
        {nextLabel} <ArrowRight size={16} />
      </button>
    </div>
  )
}

function StepProgress({ steps, current }) {
  return (
    <div className="flex items-center gap-2 mb-10" aria-label="Tiến trình">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2 flex-1">
          <div className="flex flex-col gap-2 w-full">
            <div className="h-[3px] rounded-full bg-line overflow-hidden">
              <motion.div
                className="h-full bg-chili rounded-full"
                initial={false}
                animate={{ width: i <= current ? '100%' : '0%' }}
                transition={{ duration: 0.4, ease: easeOut }}
              />
            </div>
            <span className={`font-utility text-[11px] font-semibold hidden sm:block ${i <= current ? 'text-chili' : 'text-ink-faint'}`}>
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
