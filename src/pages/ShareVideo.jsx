import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link as LinkIcon, MagicWand, CheckCircle, PencilSimple, Trash, MapPin, ListChecks } from '@phosphor-icons/react'
import VideoReviewCard from '../components/video/VideoReviewCard.jsx'
import PlaceMiniMap from '../components/map/PlaceMiniMap.jsx'
import {
  detectPlatform,
  fetchTikTokOEmbed,
  fetchYoutubeOEmbed,
  detectPlaceFromContent,
  verifyPlaceQuery,
  getVideoReviews,
  saveVideoReview,
  deleteVideoReview,
} from '../lib/videoShare.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer, easeOut } from '../motion/variants.js'

const C = {
  vi: {
    eyebrow: 'Chia sẻ quán từ video',
    title: 'Dán link TikTok, YouTube, Facebook hay Instagram — tụi mình tìm quán giúp bạn.',
    sub: 'Với TikTok và YouTube, AI đọc tiêu đề/caption và ảnh trong video để nhận diện MỌI địa điểm được nhắc đến (kể cả video kiểu "Top 5 quán ngon") — mỗi quán đều được xác minh địa chỉ thật qua Google Places trước khi hiện lên bản đồ.',
    placeholder: 'Dán link video vào đây…',
    submit: 'Phân tích',
    analyzing: 'Đang phân tích nội dung video…',
    verifying: 'Đang xác minh địa chỉ thật…',
    unknownPlatform: 'Link này mình chưa nhận diện được nền tảng (chỉ hỗ trợ TikTok, YouTube, Facebook, Instagram).',
    noAiKey: 'Chưa cấu hình API AI (ANTHROPIC_API_KEY) — bỏ qua bước tự nhận diện, nhập tay bên dưới nhé.',
    noPlacesKey: 'Chưa cấu hình Google Places server key — không xác minh được địa chỉ thật, bạn có thể lưu link không kèm bản đồ.',
    fbNoAuto: 'Facebook/Instagram không cho phép lấy nội dung qua API công khai, nên không tự nhận diện được — nhập tên & địa chỉ quán bên dưới nhé.',
    multiFoundTitle: (n) => (n === 1 ? 'AI tìm thấy 1 quán trong video này' : `AI tìm thấy ${n} quán trong video này`),
    multiFoundHint: 'Bỏ chọn quán nào không đúng, rồi lưu lại (đã chọn sẵn hết):',
    reject: 'Không quán nào đúng, để mình nhập tay',
    confirmMulti: (n) => (n === 1 ? 'Lưu quán này' : `Lưu ${n} quán đã chọn`),
    manualTitle: 'Nhập thông tin quán',
    manualName: 'Tên quán',
    manualAddress: 'Địa chỉ (càng chi tiết càng dễ tìm đúng)',
    manualSearch: 'Tìm & xác minh',
    manualSave: 'Lưu (không có bản đồ)',
    savedListTitle: 'Các quán đã chia sẻ',
    empty: 'Chưa có quán nào được chia sẻ — dán 1 link ở trên để bắt đầu.',
    delete: 'Xoá',
    reset: 'Dán link khác',
  },
  en: {
    eyebrow: 'Share a place from a video',
    title: 'Paste a TikTok, YouTube, Facebook or Instagram link — we’ll help find the place.',
    sub: 'For TikTok and YouTube, AI reads the title/caption and thumbnail to detect EVERY place mentioned (including "Top 5" style listicle videos) — each one is verified against a real Google Places address before it shows on the map.',
    placeholder: 'Paste a video link…',
    submit: 'Analyze',
    analyzing: 'Analyzing the video content…',
    verifying: 'Verifying the real address…',
    unknownPlatform: "Couldn't recognize this link's platform (only TikTok, YouTube, Facebook, Instagram are supported).",
    noAiKey: 'AI API not configured (ANTHROPIC_API_KEY) — skipping auto-detection, please enter details below.',
    noPlacesKey: "Google Places server key not configured — can't verify a real address, you can still save the link without a map.",
    fbNoAuto: "Facebook/Instagram don't allow fetching content via public API, so auto-detection isn't possible — enter the place name & address below.",
    multiFoundTitle: (n) => (n === 1 ? 'AI found 1 place in this video' : `AI found ${n} places in this video`),
    multiFoundHint: 'Uncheck any that are wrong, then save (all selected by default):',
    reject: "None of these are right, let me enter manually",
    confirmMulti: (n) => (n === 1 ? 'Save this place' : `Save ${n} selected places`),
    manualTitle: 'Enter place details',
    manualName: 'Place name',
    manualAddress: 'Address (more detail = easier to match)',
    manualSearch: 'Search & verify',
    manualSave: 'Save (without a map)',
    savedListTitle: 'Shared places',
    empty: 'No places shared yet — paste a link above to start.',
    delete: 'Delete',
    reset: 'Paste another link',
  },
}

export default function ShareVideo() {
  const { lang } = useLanguage()
  const c = C[lang]

  const [url, setUrl] = useState('')
  const [step, setStep] = useState('input') // input | analyzing | verifying | multi-found | manual
  const [platform, setPlatform] = useState(null)
  const [oembed, setOembed] = useState(null)
  const [notice, setNotice] = useState(null)
  const [manualName, setManualName] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [reviews, setReviews] = useState([])

  const [foundPlaces, setFoundPlaces] = useState([]) // verified Places results for this video
  const [selectedIds, setSelectedIds] = useState(new Set())

  useEffect(() => {
    getVideoReviews().then(setReviews).catch(() => setReviews([]))
  }, [])

  function reset() {
    setUrl('')
    setStep('input')
    setPlatform(null)
    setOembed(null)
    setNotice(null)
    setManualName('')
    setManualAddress('')
    setFoundPlaces([])
    setSelectedIds(new Set())
  }

  async function handleAnalyze(e) {
    e.preventDefault()
    const p = detectPlatform(url.trim())
    setPlatform(p)
    setNotice(null)

    if (p === 'unknown') {
      setNotice(c.unknownPlatform)
      return
    }

    if (p !== 'tiktok' && p !== 'youtube') {
      setNotice(c.fbNoAuto)
      setStep('manual')
      return
    }

    setStep('analyzing')
    try {
      const oe = p === 'tiktok' ? await fetchTikTokOEmbed(url.trim()) : await fetchYoutubeOEmbed(url.trim())
      setOembed(oe)

      const detection = await detectPlaceFromContent({ caption: oe.title, thumbnailUrl: oe.thumbnail_url })

      if (detection.evidence === 'missing-api-key') {
        setNotice(c.noAiKey)
        setStep('manual')
        return
      }
      if (!detection.places?.length) {
        setStep('manual')
        return
      }

      setStep('verifying')
      const verifiedResults = await Promise.all(
        detection.places.map((g) =>
          verifyPlaceQuery([g.guessedName, g.guessedArea].filter(Boolean).join(', ')).catch(() => ({ status: 'error' }))
        )
      )

      if (verifiedResults.some((v) => v.status === 'no-key')) {
        setNotice(c.noPlacesKey)
        setManualName(detection.places[0]?.guessedName || '')
        setStep('manual')
        return
      }

      const matched = verifiedResults.filter((v) => v.status === 'matched')
      if (!matched.length) {
        setManualName(detection.places[0]?.guessedName || '')
        setStep('manual')
        return
      }

      // De-duplicate in case two guesses verified to the same real place.
      const seen = new Set()
      const unique = matched.filter((v) => (seen.has(v.placeId) ? false : (seen.add(v.placeId), true)))

      setFoundPlaces(unique)
      setSelectedIds(new Set(unique.map((v) => v.placeId)))
      setStep('multi-found')
    } catch {
      setStep('manual')
    }
  }

  function toggleFound(placeId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(placeId) ? next.delete(placeId) : next.add(placeId)
      return next
    })
  }

  async function confirmMultiFound() {
    const toSave = foundPlaces.filter((v) => selectedIds.has(v.placeId))
    let next = reviews
    for (const v of toSave) {
      next = await saveVideoReview({
        videoUrl: url.trim(),
        platform,
        embedHtml: oembed?.html ?? null,
        thumbnailUrl: oembed?.thumbnail_url ?? null,
        placeName: v.name,
        address: v.address,
        location: v.location,
        googlePlaceId: v.placeId,
      })
    }
    setReviews(next)
    reset()
  }

  async function handleManualSearch(e) {
    e.preventDefault()
    if (!manualName.trim()) return
    setStep('verifying')
    try {
      const v = await verifyPlaceQuery(`${manualName.trim()}, ${manualAddress.trim()}`)
      if (v.status === 'matched') {
        setFoundPlaces([v])
        setSelectedIds(new Set([v.placeId]))
        setStep('multi-found')
      } else {
        await saveManual()
      }
    } catch {
      await saveManual()
    }
  }

  async function saveManual() {
    const next = await saveVideoReview({
      videoUrl: url.trim(),
      platform,
      embedHtml: oembed?.html ?? null,
      thumbnailUrl: oembed?.thumbnail_url ?? null,
      placeName: manualName.trim() || null,
      address: manualAddress.trim() || null,
      location: null,
    })
    setReviews(next)
    reset()
  }

  async function handleDelete(id) {
    setReviews(await deleteVideoReview(id))
  }

  return (
    <div className="max-w-[900px] mx-auto px-5 md:px-8 py-12 md:py-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="mb-10">
        <motion.span variants={fadeUp} className="font-utility text-[12.5px] font-bold uppercase tracking-[0.14em] text-chili inline-flex items-center gap-2 before:content-[''] before:w-4 before:h-[1.5px] before:bg-chili">
          {c.eyebrow}
        </motion.span>
        <motion.h1 variants={fadeUp} className="text-[28px] md:text-[38px] font-bold leading-[1.15] mt-3">{c.title}</motion.h1>
        <motion.p variants={fadeUp} className="text-[15px] text-ink-muted mt-3 max-w-[62ch]">{c.sub}</motion.p>
      </motion.div>

      {step === 'input' && (
        <form onSubmit={handleAnalyze} className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-4 py-3 focus-within:border-chili transition-colors">
            <LinkIcon size={18} className="text-ink-faint shrink-0" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={c.placeholder}
              required
              type="url"
              className="flex-1 min-w-0 bg-transparent text-[14.5px] outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-3 rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow shrink-0"
          >
            <MagicWand size={16} /> {c.submit}
          </button>
        </form>
      )}

      {notice && step === 'input' && (
        <p className="mt-3 text-[13.5px] text-lantern">{notice}</p>
      )}

      {(step === 'analyzing' || step === 'verifying') && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <motion.div
            className="w-9 h-9 rounded-full border-[3px] border-line-strong border-t-chili"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-ink-muted text-[14.5px]">{step === 'analyzing' ? c.analyzing : c.verifying}</p>
        </div>
      )}

      {step === 'multi-found' && foundPlaces.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: easeOut }} className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2 font-bold text-[16px] mb-1">
            <ListChecks size={19} weight="bold" className="text-herb" /> {c.multiFoundTitle(foundPlaces.length)}
          </div>
          <p className="text-[13.5px] text-ink-muted mb-4">{c.multiFoundHint}</p>

          <div className="flex flex-col gap-3 mb-4">
            {foundPlaces.map((v) => (
              <label
                key={v.placeId}
                className={`flex flex-col gap-2 rounded-lg border-[1.5px] px-4 py-3 cursor-pointer transition-colors ${selectedIds.has(v.placeId) ? 'border-chili bg-paper-2' : 'border-line-strong'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(v.placeId)}
                    onChange={() => toggleFound(v.placeId)}
                    className="accent-[var(--chili)] mt-1 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14.5px] flex items-center gap-1.5">
                      <MapPin size={14} className="text-chili shrink-0" /> {v.name}
                    </div>
                    <div className="text-[12.5px] text-ink-faint mt-0.5">{v.address}</div>
                  </div>
                </div>
                {selectedIds.has(v.placeId) && (
                  <PlaceMiniMap location={v.location} title={v.name} className="h-[140px] w-full" />
                )}
              </label>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={confirmMultiFound}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-5 py-2.5 rounded-full bg-chili text-chili-ink disabled:opacity-50"
            >
              <CheckCircle size={16} /> {c.confirmMulti(selectedIds.size)}
            </button>
            <button
              onClick={() => setStep('manual')}
              className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-5 py-2.5 rounded-full border-[1.5px] border-line-strong hover:border-chili"
            >
              <PencilSimple size={16} /> {c.reject}
            </button>
          </div>
        </motion.div>
      )}

      {step === 'manual' && (
        <motion.form onSubmit={handleManualSearch} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: easeOut }} className="rounded-xl border border-line bg-surface p-5 flex flex-col gap-3">
          {notice && <p className="text-[13.5px] text-lantern mb-1">{notice}</p>}
          <div className="font-bold text-[16px]">{c.manualTitle}</div>
          <input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder={c.manualName}
            className="rounded-full border-[1.5px] border-line-strong px-4 py-2.5 text-[14px] outline-none focus:border-chili"
          />
          <input
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            placeholder={c.manualAddress}
            className="rounded-full border-[1.5px] border-line-strong px-4 py-2.5 text-[14px] outline-none focus:border-chili"
          />
          <div className="flex gap-3 flex-wrap mt-1">
            <button type="submit" className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-5 py-2.5 rounded-full bg-chili text-chili-ink">
              <MagicWand size={16} /> {c.manualSearch}
            </button>
            <button type="button" onClick={saveManual} className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-5 py-2.5 rounded-full border-[1.5px] border-line-strong hover:border-chili">
              {c.manualSave}
            </button>
          </div>
        </motion.form>
      )}

      {step !== 'input' && (
        <button onClick={reset} className="mt-4 font-utility text-[13px] font-semibold text-ink-muted hover:text-chili transition-colors">
          ← {c.reset}
        </button>
      )}

      <div className="mt-14">
        <h2 className="text-[20px] font-bold mb-5">{c.savedListTitle}</h2>
        {reviews.length === 0 ? (
          <p className="text-[14px] text-ink-muted">{c.empty}</p>
        ) : (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            {reviews.map((r) => (
              <div key={r.id} className="flex flex-col gap-3">
                <VideoReviewCard review={r} />
                {r.location && <PlaceMiniMap location={r.location} title={r.placeName} className="h-[160px] w-full" />}
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] truncate">{r.placeName}</div>
                    {r.address && <div className="text-[12.5px] text-ink-faint truncate">{r.address}</div>}
                  </div>
                  <button onClick={() => handleDelete(r.id)} aria-label={c.delete} className="shrink-0 p-2 text-ink-faint hover:text-chili transition-colors">
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
