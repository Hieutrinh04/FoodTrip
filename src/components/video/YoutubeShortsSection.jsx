import { useEffect, useState } from 'react'
import { ArrowClockwise, PlayCircle, VideoCamera, WarningCircle } from '@phosphor-icons/react'
import { fetchYoutubeShorts } from '../../lib/youtubeShorts.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    title: 'Video review gợi ý (YouTube)',
    hint: 'FoodTrip tự tìm — không cần ai chia sẻ',
    loading: 'Đang tìm video liên quan…',
    empty: 'Chưa tìm thấy video phù hợp cho địa điểm này.',
    noKey: 'Dịch vụ video chưa được cấu hình.',
    error: 'Không thể tải video lúc này. Vui lòng thử lại.',
    retry: 'Thử lại',
  },
  en: {
    title: 'Suggested review videos (YouTube)',
    hint: 'Auto-found by FoodTrip — no submission needed',
    loading: 'Finding related videos…',
    empty: 'No suitable videos were found for this place.',
    noKey: 'The video service is not configured.',
    error: 'Videos could not be loaded. Please try again.',
    retry: 'Try again',
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
  const [requestId, setRequestId] = useState(0)

  useEffect(() => {
    if (!query) return
    let cancelled = false
    setStatus('loading')
    setVideos([])
    setOpenId(null)

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
  }, [query, requestId])

  const statusMessage = status === 'no-key' ? c.noKey : c[status] || c.empty

  return (
    <section className="mx-auto mt-14 max-w-[1180px] px-5 md:px-8" aria-labelledby="youtube-videos-title">
      <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
        <h2 id="youtube-videos-title" className="text-[22px] font-bold">{c.title}</h2>
        <span className="font-utility text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{c.hint}</span>
      </div>
      {status !== 'ok' ? (
        <div className="flex min-h-[150px] items-center justify-center rounded-2xl border border-line bg-surface px-5 py-8 text-center">
          <div className="flex max-w-[38ch] flex-col items-center gap-3">
            {status === 'loading' ? <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line-strong border-t-chili" /> : status === 'error' ? <WarningCircle size={28} className="text-chili" /> : <VideoCamera size={28} className="text-ink-faint" />}
            <p className="text-[13.5px] text-ink-muted">{statusMessage}</p>
            {status === 'error' && <button type="button" onClick={() => setRequestId((value) => value + 1)} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 font-utility text-[12px] font-semibold hover:border-chili"><ArrowClockwise size={14} />{c.retry}</button>}
          </div>
        </div>
      ) : <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
        {videos.map((v) =>
          openId === v.videoId ? (
            <div key={v.videoId} className="aspect-[9/16] w-[170px] shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-black sm:w-[190px]">
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
              className="group relative aspect-[9/16] w-[170px] shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-paper-2 text-left shadow-soft sm:w-[190px]"
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
      </div>}
    </section>
  )
}
