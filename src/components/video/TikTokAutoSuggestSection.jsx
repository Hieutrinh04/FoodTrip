import { useEffect, useState } from 'react'
import { ArrowSquareOut, PlayCircle, TiktokLogo } from '@phosphor-icons/react'
import { fetchTikTokAutoSuggestions } from '../../lib/tiktokAutoSearch.js'
import VideoEmbed from './VideoEmbed.jsx'
import RemoteImage from '../ui/RemoteImage.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    title: 'Video TikTok gợi ý',
    hint: 'FoodTrip tự tìm qua Google Search — không cần ai chia sẻ',
    play: 'Phát video',
    openOnTikTok: 'Không phát được? Xem trên TikTok',
  },
  en: {
    title: 'Suggested TikTok videos',
    hint: 'Auto-found via Google Search by FoodTrip — no submission needed',
    play: 'Play video',
    openOnTikTok: 'Not playing? Watch on TikTok',
  },
}

/**
 * One video as a light card — thumbnail, caption, author — that turns into
 * TikTok's player only when tapped. Six players up front meant six iframes
 * pulling TikTok's whole web app (several MB each) for videos most visitors
 * never start.
 */
function TikTokCard({ video, copy }) {
  const [playing, setPlaying] = useState(false)
  // TikTok's player sometimes refuses to load (it rate-limits busy networks
  // with a blank "overload-protect" page), so the video stays one tap away.
  if (playing) return (
    <div>
      <VideoEmbed url={video.videoUrl} autoPlay title={video.title} />
      <a href={video.videoUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-chili hover:underline">{copy.openOnTikTok}<ArrowSquareOut size={12} /></a>
    </div>
  )

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`${copy.play}: ${video.title}`}
      className="group flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-chili"
    >
      <div className="relative h-[90px] w-[160px] shrink-0 overflow-hidden rounded-lg bg-paper-2">
        <RemoteImage
          src={video.thumbnailUrl}
          alt=""
          className="h-full w-full object-cover"
          fallback={<span className="flex h-full items-center justify-center text-ink-faint"><TiktokLogo size={28} /></span>}
        />
        <PlayCircle size={34} weight="fill" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow transition-transform group-hover:scale-110" />
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="mb-1.5 flex items-center gap-1.5 font-utility text-micro font-bold uppercase text-ink-faint"><TiktokLogo size={12} />TikTok{video.authorName && <span className="normal-case">· @{video.authorName}</span>}</div>
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{video.title}</p>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-chili">{copy.play}<PlayCircle size={12} weight="fill" /></span>
      </div>
    </button>
  )
}

/** Auto-discovers real TikTok videos about a place via Google search
 * (TikTok has no public search API, so this searches Google's index of
 * tiktok.com instead — works for TikTok specifically, not Facebook/Instagram
 * which Google barely indexes). */
export default function TikTokAutoSuggestSection({ query, name = query, location = '' }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const [status, setStatus] = useState('loading')
  const [videos, setVideos] = useState([])

  useEffect(() => {
    if (!query) return
    let cancelled = false
    setStatus('loading')

    fetchTikTokAutoSuggestions(query, name, location)
      .then((res) => {
        if (cancelled) return
        if (res.status === 'no-key') return setStatus('no-key')
        if (!res.videos?.length) return setStatus('empty')
        setVideos(res.videos)
        setStatus('ok')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [query, name, location])

  // Nothing to say when there is nothing to show; while searching, a skeleton
  // holds the space so the page does not jump when the videos land.
  if (status !== 'ok' && status !== 'loading') return null

  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 mt-14">
      <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
        <h2 className="text-xl font-bold">{c.title}</h2>
        <span className="font-utility text-2xs font-semibold uppercase tracking-wide text-ink-faint">{c.hint}</span>
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2" aria-busy={status === 'loading'}>
        {status === 'loading'
          ? [0, 1].map((i) => <div key={i} className="h-[116px] animate-pulse rounded-xl border border-line bg-paper-2" />)
          : videos.map((v) => <TikTokCard key={v.videoUrl} video={v} copy={c} />)}
      </div>
    </div>
  )
}
