import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowSquareOut, Article, FacebookLogo, InstagramLogo, MapPin, PlayCircle, SpinnerGap, Star, TiktokLogo, YoutubeLogo, X } from '@phosphor-icons/react'
import { fetchYoutubeShorts } from '../../lib/youtubeShorts.js'
import { fetchTikTokAutoSuggestions } from '../../lib/tiktokAutoSearch.js'
import { fetchPlaceWebContent } from '../../lib/placeWebContent.js'
import { getReviewsForPlace } from '../../lib/videoShare.js'
import { FOODTRIP_CRITERIA, scoreForCriterion } from '../../lib/foodTripScore.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const COPY = {
  vi: { score: 'Điểm FoodTrip', content: 'Review liên quan', loading: 'Đang tổng hợp nội dung…', empty: 'Chưa tìm thấy nội dung phù hợp.', detail: 'Xem chi tiết', all: 'Tất cả', video: 'Video', tiktok: 'TikTok', articles: 'Bài viết', open: 'Mở nội dung', limited: 'TikTok, Facebook và bài báo sẽ xuất hiện khi cấu hình nguồn tìm kiếm web.' },
  en: { score: 'FoodTrip score', content: 'Related reviews', loading: 'Collecting content…', empty: 'No related content found.', detail: 'View details', all: 'All', video: 'Video', tiktok: 'TikTok', articles: 'Articles', open: 'Open content', limited: 'TikTok, Facebook and articles appear when web search is configured.' },
}

const PLATFORM_ICON = { youtube: YoutubeLogo, tiktok: TiktokLogo, facebook: FacebookLogo, instagram: InstagramLogo, article: Article }
const normalizeYoutube = (video) => ({ id: `youtube-${video.videoId}`, platform: 'youtube', contentType: 'video', title: video.title, thumbnailUrl: video.thumbnailUrl, videoId: video.videoId, url: `https://www.youtube.com/watch?v=${video.videoId}` })
const normalizeTikTok = (video) => ({ id: `tiktok-${video.videoUrl}`, platform: 'tiktok', contentType: 'video', title: video.title, thumbnailUrl: video.thumbnailUrl, url: video.videoUrl })
const normalizeCommunity = (review) => ({ id: `community-${review.id}`, platform: review.platform, contentType: 'video', title: review.placeName || 'Community review', thumbnailUrl: review.thumbnailUrl, url: review.videoUrl })

export default function MapPlacePreview({ place, criterion, onClose }) {
  const { lang } = useLanguage()
  const copy = COPY[lang]
  const [status, setStatus] = useState('loading')
  const [items, setItems] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [playingId, setPlayingId] = useState(null)
  const [webSearchMissing, setWebSearchMissing] = useState(false)
  const score = scoreForCriterion(place, criterion)
  const locationHint = place.address?.vi?.split(',').at(-1)?.trim() || ''
  const query = `${place.name.vi} ${locationHint}`.trim()

  useEffect(() => {
    let cancelled = false
    setStatus('loading'); setItems([]); setPlayingId(null); setActiveTab('all')
    Promise.allSettled([
      fetchYoutubeShorts(query, place.name.vi, locationHint), fetchTikTokAutoSuggestions(query, place.name.vi, locationHint),
      fetchPlaceWebContent(query, place.name.vi), getReviewsForPlace({ name: place.name.vi }),
    ]).then(([youtubeResult, tiktokResult, webResult, communityResult]) => {
      if (cancelled) return
      const youtube = youtubeResult.status === 'fulfilled' ? (youtubeResult.value.videos || []).map(normalizeYoutube) : []
      const tiktok = tiktokResult.status === 'fulfilled' ? (tiktokResult.value.videos || []).map(normalizeTikTok) : []
      const web = webResult.status === 'fulfilled' ? (webResult.value.items || []) : []
      const community = communityResult.status === 'fulfilled' ? communityResult.value.map(normalizeCommunity) : []
      setWebSearchMissing((tiktokResult.status === 'fulfilled' && tiktokResult.value.status === 'no-key') || (webResult.status === 'fulfilled' && webResult.value.status === 'no-key'))
      const seen = new Set()
      const combined = [...community, ...youtube, ...tiktok, ...web].filter((item) => { const key = item.url || item.id; if (!key || seen.has(key)) return false; seen.add(key); return true })
      setItems(combined); setStatus(combined.length ? 'ready' : 'empty')
    })
    return () => { cancelled = true }
  }, [query, place.name.vi])

  const filteredItems = useMemo(() => items.filter((item) => {
    if (activeTab === 'all') return true
    if (activeTab === 'video') return item.contentType === 'video'
    if (activeTab === 'tiktok') return item.platform === 'tiktok'
    return item.contentType === 'article' || ['facebook', 'instagram'].includes(item.platform)
  }), [items, activeTab])
  const tabs = [['all', copy.all], ['video', copy.video], ['tiktok', copy.tiktok], ['articles', copy.articles]]

  return <aside className="absolute inset-x-3 bottom-3 z-20 max-h-[calc(100%-24px)] overflow-y-auto rounded-2xl border border-line bg-surface/95 p-4 shadow-lifted backdrop-blur-md sm:left-4 sm:right-auto sm:w-[440px]" aria-label={place.name[lang]}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-[18px] font-bold">{place.name[lang]}</h2><p className="mt-1 line-clamp-2 flex items-start gap-1.5 text-[11.5px] text-ink-muted"><MapPin size={13} className="mt-0.5 shrink-0 text-chili" />{place.address?.[lang]}</p></div><button type="button" onClick={onClose} aria-label="Đóng" className="shrink-0 rounded-full border border-line p-1.5 text-ink-muted hover:border-chili hover:text-chili"><X size={15} /></button></div>
    <div className="mt-3 flex items-center justify-between rounded-xl bg-paper-2 px-3 py-2.5"><div><div className="font-utility text-[10px] uppercase tracking-wide text-ink-faint">{criterion === 'overall' ? copy.score : FOODTRIP_CRITERIA[criterion]?.[lang]}</div><div className="mt-0.5 flex items-center gap-1 font-utility text-[17px] font-bold text-chili">{score?.toFixed(1) ?? '—'} <Star size={14} weight="fill" className="text-lantern" /></div></div>{place.distanceKm != null && <span className="rounded-full bg-surface px-2.5 py-1 font-utility text-[11px] font-semibold text-ink-muted">{place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m` : `${place.distanceKm.toFixed(1)} km`}</span>}{place.source !== 'track-asia' && <Link to={`/place/${place.id}`} className="inline-flex items-center gap-1 font-utility text-[11.5px] font-semibold text-chili hover:underline">{copy.detail}<ArrowSquareOut size={13} /></Link>}</div>
    <div className="mt-3"><div className="mb-2 flex items-center justify-between"><div className="font-utility text-[11px] font-bold uppercase tracking-wide text-ink-muted">{copy.content}</div>{status === 'ready' && <span className="text-[10px] text-ink-faint">{items.length}</span>}</div>
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => { setActiveTab(id); setPlayingId(null) }} className={`shrink-0 rounded-full px-3 py-1.5 font-utility text-[10.5px] font-semibold ${activeTab === id ? 'bg-ink text-paper' : 'border border-line bg-surface text-ink-muted'}`}>{label}</button>)}</div>
      {status === 'loading' && <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-5 text-[12px] text-ink-muted"><SpinnerGap size={16} className="animate-spin text-chili" />{copy.loading}</div>}
      {status === 'empty' && <div className="rounded-xl border border-dashed border-line-strong px-3 py-5 text-center text-[12px] text-ink-muted">{copy.empty}</div>}
      {status === 'ready' && playingId && <div className="mb-3 aspect-video overflow-hidden rounded-xl bg-black"><iframe src={`https://www.youtube.com/embed/${playingId}?autoplay=1`} title="YouTube review" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full border-0" /></div>}
      {status === 'ready' && !filteredItems.length && <div className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-[12px] text-ink-muted">{copy.empty}</div>}
      {status === 'ready' && filteredItems.length > 0 && <div className="no-scrollbar flex max-h-[230px] flex-col gap-2 overflow-y-auto pr-1">{filteredItems.map((item) => <ContentCard key={item.id} item={item} copy={copy} onPlay={setPlayingId} />)}</div>}
      {webSearchMissing && <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">{copy.limited}</p>}
    </div>
  </aside>
}

function ContentCard({ item, copy, onPlay }) {
  const Icon = PLATFORM_ICON[item.platform] || Article
  const body = <><div className="relative h-[68px] w-[96px] shrink-0 overflow-hidden rounded-lg bg-paper-2">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-ink-faint"><Icon size={22} /></span>}{item.platform === 'youtube' && <PlayCircle size={23} weight="fill" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />}</div><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-1.5 font-utility text-[9.5px] font-bold uppercase text-ink-faint"><Icon size={12} />{item.platform}</div><p className="line-clamp-2 text-[11.5px] font-semibold leading-snug">{item.title}</p><span className="mt-1 inline-flex items-center gap-1 text-[9.5px] text-chili">{copy.open}<ArrowSquareOut size={10} /></span></div></>
  if (item.platform === 'youtube' && item.videoId) return <button type="button" onClick={() => onPlay(item.videoId)} className="flex w-full gap-3 rounded-xl border border-line bg-surface p-2 text-left transition-colors hover:border-chili">{body}</button>
  return <a href={item.url} target="_blank" rel="noreferrer" className="flex gap-3 rounded-xl border border-line bg-surface p-2 transition-colors hover:border-chili">{body}</a>
}
