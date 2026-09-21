import { useEffect, useState } from 'react'
import { fetchTikTokAutoSuggestions } from '../../lib/tiktokAutoSearch.js'
import VideoReviewCard from './VideoReviewCard.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    title: 'Video TikTok gợi ý',
    hint: 'FoodTrip tự tìm qua Google Search — không cần ai chia sẻ',
  },
  en: {
    title: 'Suggested TikTok videos',
    hint: 'Auto-found via Google Search by FoodTrip — no submission needed',
  },
}

/** Auto-discovers real TikTok videos about a place via Google Custom Search
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

  if (status !== 'ok') return null

  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 mt-14">
      <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
        <h2 className="text-xl font-bold">{c.title}</h2>
        <span className="font-utility text-2xs font-semibold uppercase tracking-wide text-ink-faint">{c.hint}</span>
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {videos.map((v) => (
          <VideoReviewCard key={v.videoUrl} review={{ id: v.videoUrl, platform: 'tiktok', videoUrl: v.videoUrl, embedHtml: v.embedHtml, placeName: v.title }} />
        ))}
      </div>
    </div>
  )
}
