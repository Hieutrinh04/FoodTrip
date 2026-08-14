import { useEffect, useState } from 'react'
import { PlayCircle } from '@phosphor-icons/react'
import { fetchYoutubeShorts } from '../../lib/youtubeShorts.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    title: 'Video ngắn gợi ý (YouTube)',
    hint: 'FoodTrip tự tìm — không cần ai chia sẻ',
    loading: 'Đang tìm video ngắn liên quan…',
  },
  en: {
    title: 'Suggested short videos (YouTube)',
    hint: 'Auto-found by FoodTrip — no submission needed',
    loading: 'Finding related short videos…',
  },
}

/** Auto-discovers real YouTube Shorts about a place via search — unlike the
 * TikTok/Facebook/Instagram share flow, this needs no manual link submission
 * since YouTube (unlike those platforms) has a public search API. */
export default function YoutubeShortsSection({ query }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const [status, setStatus] = useState('loading') // loading | ok | empty | no-key | error
  const [videos, setVideos] = useState([])
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    if (!query) return
    let cancelled = false
    setStatus('loading')

    fetchYoutubeShorts(query)
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
  }, [query])

  if (status === 'loading' || status === 'no-key' || status === 'empty' || status === 'error') {
    return null
  }

  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 mt-14">
      <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
        <h2 className="text-[22px] font-bold">{c.title}</h2>
        <span className="font-utility text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{c.hint}</span>
      </div>
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {videos.map((v) =>
          openId === v.videoId ? (
            <div key={v.videoId} className="shrink-0 w-[160px] aspect-[9/16] rounded-xl overflow-hidden bg-black border border-line">
              <iframe
                src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1`}
                title={v.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          ) : (
            <button
              key={v.videoId}
              type="button"
              onClick={() => setOpenId(v.videoId)}
              className="group relative shrink-0 w-[160px] aspect-[9/16] rounded-xl overflow-hidden bg-paper-2 border border-line text-left"
            >
              {v.thumbnailUrl && (
                <img src={v.thumbnailUrl} alt={v.title} loading="lazy" className="h-full w-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <PlayCircle size={30} weight="fill" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/90 group-hover:scale-110 transition-transform" />
              <div className="absolute bottom-0 inset-x-0 p-2.5">
                <p className="text-white text-[12px] font-semibold leading-snug line-clamp-3">{v.title}</p>
              </div>
            </button>
          )
        )}
      </div>
    </div>
  )
}
