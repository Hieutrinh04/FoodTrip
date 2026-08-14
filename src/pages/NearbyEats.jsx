import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, NavigationArrow, Star, ArrowsClockwise, Warning, Ruler, MagnifyingGlass, SlidersHorizontal } from '@phosphor-icons/react'
import { searchNearbyFood, searchFoodByText, tryGetLocation } from '../lib/nearbySearch.js'
import FoodWheel, { wheelItemLabel } from '../components/wheel/FoodWheel.jsx'
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
    title: 'Chưa biết ăn gì? Quay một vòng, để FoodTrip chọn giúp bạn.',
    sub: 'Quay vòng để chọn món, FoodTrip sẽ tìm ngay quán ăn gần bạn — dù bạn đang ở Hà Nội, Bình Dương hay bất kỳ đâu.',
    cta: 'Định vị & gợi ý cho tôi',
    locating: 'Đang xác định vị trí của bạn…',
    searching: 'Đang tìm quán ăn gần bạn…',
    denied: 'Không lấy được vị trí — hãy cho phép quyền truy cập vị trí trên trình duyệt rồi thử lại.',
    noKey: 'Cần cấu hình Google Maps API key để dùng tính năng này.',
    empty: 'Không tìm thấy quán ăn nào — thử một mô tả khác xem sao.',
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
    textSearching: 'Đang tìm theo mô tả của bạn…',
    featuredLabel: 'Hôm nay ăn thử:',
    reroll: 'Gợi ý món khác',
    restart: 'Định vị lại',
    spinAgain: 'Quay lại vòng quay',
    fullListTitle: 'Các lựa chọn khác gần bạn',
    viewOnMaps: 'Xem trên Google Maps',
    ratingsCount: (n) => `${n.toLocaleString('vi-VN')} đánh giá`,
    distance: (km) => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`),
  },
  en: {
    eyebrow: 'What to eat now?',
    title: "Don't know what to eat? Spin the wheel and let FoodTrip decide.",
    sub: 'Spin to pick a dish, then FoodTrip finds real places near you — wherever you are, from Hanoi to Binh Duong and beyond.',
    cta: 'Locate me & suggest',
    locating: 'Finding your location…',
    searching: 'Searching for nearby places…',
    denied: 'Could not get your location — please allow location access in your browser and try again.',
    noKey: 'A Google Maps API key is needed for this feature.',
    empty: 'No food places found — try describing it differently.',
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
    textSearching: 'Searching based on your description…',
    featuredLabel: 'Try this today:',
    reroll: 'Suggest something else',
    restart: 'Locate again',
    spinAgain: 'Spin again',
    fullListTitle: 'Other options near you',
    viewOnMaps: 'View on Google Maps',
    ratingsCount: (n) => `${n.toLocaleString('en-US')} ratings`,
    distance: (km) => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`),
  },
}

export default function NearbyEats() {
  const { lang } = useLanguage()
  const c = C[lang]
  const { user } = useAuth()

  const [status, setStatus] = useState('idle') // idle | locating | searching | searching-text | ready | denied | no-key | empty | error
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
    setFeaturedIndex(Math.floor(Math.random() * found.length))
    setStatus('ready')
  }

  function handleLocate() {
    if (!navigator.geolocation) {
      setStatus('denied')
      return
    }
    setWheelPick(null)
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setStatus('searching')
        try {
          applyResults(await searchNearbyFood(origin))
        } catch {
          setStatus('error')
        }
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  async function handleTextSearch(e) {
    e.preventDefault()
    const q = textQuery.trim()
    if (!q) return
    setWheelPick(null)
    setStatus('searching-text')
    try {
      applyResults(await searchFoodByText(q))
    } catch {
      setStatus('error')
    }
  }

  function handleWheelResult(item) {
    setRevealPick(item)
  }

  async function confirmWheelSearch() {
    const item = revealPick
    setRevealPick(null)
    setWheelPick(item)
    setStatus('searching-text')
    const origin = await tryGetLocation()
    try {
      applyResults(await searchFoodByText(wheelItemLabel(item, lang), origin))
    } catch {
      setStatus('error')
    }
  }

  function respinFromReveal() {
    setRevealPick(null)
  }

  function spinAgain() {
    setWheelPick(null)
    setRevealPick(null)
    setStatus('idle')
  }

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

  const textForm = (
    <form onSubmit={handleTextSearch} className="w-full max-w-[440px] flex flex-col items-center gap-2.5">
      <p className="text-[13px] text-ink-faint">{c.textFallbackLabel}</p>
      <div className="flex w-full gap-2">
        <input
          type="text"
          value={textQuery}
          onChange={(e) => setTextQuery(e.target.value)}
          placeholder={c.textPlaceholder}
          className="flex-1 min-w-0 rounded-full border-[1.5px] border-line-strong bg-surface px-4 py-2.5 text-[14px] outline-none focus:border-chili transition-colors"
        />
        <button
          type="submit"
          disabled={!textQuery.trim()}
          className="inline-flex items-center gap-1.5 font-utility font-semibold text-[13.5px] px-4 py-2.5 rounded-full bg-chili text-chili-ink disabled:opacity-50 shrink-0"
        >
          <MagnifyingGlass size={15} /> {c.textSubmit}
        </button>
      </div>
    </form>
  )

  return (
    <div className="max-w-[900px] mx-auto px-5 md:px-8 py-12 md:py-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="mb-10 text-center">
        <motion.span variants={fadeUp} className="font-utility text-[12.5px] font-bold uppercase tracking-[0.14em] text-chili inline-flex items-center gap-2 before:content-[''] before:w-4 before:h-[1.5px] before:bg-chili">
          {c.eyebrow}
        </motion.span>
        <motion.h1 variants={fadeUp} className="text-[28px] md:text-[38px] font-bold leading-[1.2] mt-4">{c.title}</motion.h1>
        <motion.p variants={fadeUp} className="text-[15px] text-ink-muted leading-relaxed mt-4 max-w-[46ch] mx-auto">{c.sub}</motion.p>
      </motion.div>

      {status === 'idle' && !revealPick && (
        <div className="flex flex-col items-center gap-6">
          <p className="font-utility text-[13px] font-bold uppercase tracking-wide text-ink-faint">{c.wheelTitle}</p>
          <FoodWheel items={wheelItems} onResult={handleWheelResult} spinLabel={c.wheelSpin} spinningLabel={c.wheelSpinning} />

          {!showEditor ? (
            <button
              onClick={openEditor}
              className="inline-flex items-center gap-1.5 font-utility text-[12.5px] font-semibold text-ink-faint hover:text-chili transition-colors"
            >
              <SlidersHorizontal size={14} /> {c.customize}
            </button>
          ) : (
            <div className="w-full max-w-[380px] flex flex-col gap-2.5">
              <p className="text-[12.5px] text-ink-faint">{c.editorHint}</p>
              <textarea
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                placeholder={c.editorPlaceholder}
                rows={8}
                className="w-full rounded-xl border-[1.5px] border-line-strong bg-surface px-3.5 py-3 text-[13.5px] outline-none focus:border-chili transition-colors resize-y"
              />
              <div className="flex gap-2 flex-wrap justify-center">
                <button
                  onClick={saveWheelItems}
                  disabled={editorText.split('\n').map((s) => s.trim()).filter(Boolean).length < 2}
                  className="inline-flex items-center gap-1.5 font-utility font-semibold text-[13px] px-4 py-2 rounded-full bg-chili text-chili-ink disabled:opacity-50"
                >
                  {c.editorSave}
                </button>
                <button
                  onClick={resetWheelItems}
                  className="inline-flex items-center gap-1.5 font-utility font-semibold text-[13px] px-4 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                >
                  {c.editorReset}
                </button>
                <button
                  onClick={() => setShowEditor(false)}
                  className="inline-flex items-center gap-1.5 font-utility font-semibold text-[13px] px-4 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                >
                  {c.customizeClose}
                </button>
              </div>
            </div>
          )}

          <span className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint mt-2">{c.or}</span>
          <button
            onClick={handleLocate}
            className="inline-flex items-center gap-2.5 font-utility font-semibold text-[15px] px-7 py-4 rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow"
          >
            <NavigationArrow size={18} weight="fill" /> {c.cta}
          </button>
          <span className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint">{c.or}</span>
          {textForm}
        </div>
      )}

      {status === 'idle' && revealPick && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: easeOut }}
          className="flex flex-col items-center gap-5 py-10 text-center"
        >
          <span className="text-[40px]">{c.revealEmoji}</span>
          <p className="font-utility text-[13px] font-bold uppercase tracking-wide text-ink-faint">{c.wheelTitle}</p>
          <h2 className="font-display text-[32px] md:text-[40px] font-bold text-chili">{wheelItemLabel(revealPick, lang)}</h2>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={confirmWheelSearch}
              className="inline-flex items-center gap-2.5 font-utility font-semibold text-[15px] px-7 py-4 rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow"
            >
              <MagnifyingGlass size={18} weight="bold" /> {c.revealCta}
            </button>
            <button
              onClick={respinFromReveal}
              className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-6 py-3 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
            >
              🎡 {c.revealRespin}
            </button>
          </div>
        </motion.div>
      )}

      {(status === 'locating' || status === 'searching' || status === 'searching-text') && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <motion.div
            className="w-9 h-9 rounded-full border-[3px] border-line-strong border-t-chili"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-ink-muted text-[14.5px]">
            {status === 'locating' ? c.locating : status === 'searching-text' ? c.textSearching : c.searching}
          </p>
        </div>
      )}

      {(status === 'denied' || status === 'no-key' || status === 'empty' || status === 'error') && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-paper-2 px-5 py-4 text-[13.5px] text-ink-muted max-w-[52ch]">
            <Warning size={18} className="shrink-0 text-lantern" />
            {status === 'denied' ? c.denied : status === 'no-key' ? c.noKey : status === 'empty' ? c.empty : c.denied}
          </div>
          {status !== 'no-key' && (
            <>
              <button
                onClick={handleLocate}
                className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-6 py-3 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
              >
                <NavigationArrow size={16} /> {c.cta}
              </button>
              <span className="font-utility text-[12px] font-bold uppercase tracking-wide text-ink-faint">{c.or}</span>
              {textForm}
            </>
          )}
        </div>
      )}

      {status === 'ready' && featured && (
        <>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: easeOut }}>
            {wheelPick && (
              <p className="text-center font-utility text-[12.5px] font-bold text-ink-faint mb-1.5">🎡 {c.wheelPicked(wheelItemLabel(wheelPick, lang))}</p>
            )}
            <p className="text-center font-utility text-[13px] font-bold uppercase tracking-wide text-chili mb-3">{c.featuredLabel}</p>
            <div className="rounded-2xl border-2 border-chili bg-surface p-6 shadow-lifted">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <h2 className="font-display text-[24px] font-bold">{featured.name}</h2>
                {featured.rating != null && (
                  <span className="flex items-center gap-1.5 font-utility font-bold text-[15px] text-lantern shrink-0">
                    <Star size={16} weight="fill" /> {featured.rating.toFixed(1)}
                    {featured.userRatingCount != null && (
                      <span className="text-ink-faint font-normal text-[12.5px]">({c.ratingsCount(featured.userRatingCount)})</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-[14px] text-ink-muted mb-4">
                <span className="flex items-center gap-1.5"><MapPin size={15} className="text-chili" /> {featured.address}</span>
                {featured.distanceKm != null && (
                  <span className="flex items-center gap-1.5"><Ruler size={15} className="text-chili" /> {c.distance(featured.distanceKm)}</span>
                )}
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={reroll}
                  disabled={results.length < 2}
                  className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-5 py-2.5 rounded-full bg-chili text-chili-ink disabled:opacity-50"
                >
                  <ArrowsClockwise size={16} /> {c.reroll}
                </button>
                {featured.mapsUri && (
                  <a
                    href={featured.mapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-5 py-2.5 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                  >
                    {c.viewOnMaps} ↗
                  </a>
                )}
                <button
                  onClick={handleLocate}
                  className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-5 py-2.5 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                >
                  <NavigationArrow size={15} /> {c.restart}
                </button>
                <button
                  onClick={spinAgain}
                  className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-5 py-2.5 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
                >
                  🎡 {c.spinAgain}
                </button>
              </div>
            </div>
          </motion.div>

          {others.length > 0 && (
            <div className="mt-12">
              <h3 className="text-[18px] font-bold mb-4">{c.fullListTitle}</h3>
              <motion.div initial="hidden" animate="show" variants={staggerContainer(0.06)} className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {others.map((p) => (
                  <motion.a
                    key={p.id}
                    variants={fadeUp}
                    href={p.mapsUri || '#'}
                    target={p.mapsUri ? '_blank' : undefined}
                    rel="noreferrer"
                    className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 hover:border-chili transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[14px] truncate">{p.name}</span>
                      {p.rating != null && (
                        <span className="flex items-center gap-1 font-utility text-[12.5px] font-bold text-lantern shrink-0">
                          <Star size={12} weight="fill" /> {p.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <span className="text-[12.5px] text-ink-faint truncate">{p.address}</span>
                    {p.distanceKm != null && (
                      <span className="font-utility text-[11.5px] text-ink-faint">{c.distance(p.distanceKm)}</span>
                    )}
                  </motion.a>
                ))}
              </motion.div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
