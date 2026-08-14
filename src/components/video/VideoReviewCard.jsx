import { useEffect } from 'react'
import { FacebookLogo, InstagramLogo, PlayCircle, YoutubeLogo } from '@phosphor-icons/react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const PLATFORM_META = {
  facebook: { icon: FacebookLogo, label: 'Facebook' },
  instagram: { icon: InstagramLogo, label: 'Instagram' },
  tiktok: { icon: PlayCircle, label: 'TikTok' },
  youtube: { icon: YoutubeLogo, label: 'YouTube' },
}

const C = {
  vi: { watchOn: (name) => `Xem trên ${name}` },
  en: { watchOn: (name) => `Watch on ${name}` },
}

export default function VideoReviewCard({ review }) {
  const { lang } = useLanguage()
  const c = C[lang]

  useEffect(() => {
    if (review.platform !== 'tiktok' || !review.embedHtml) return
    const script = document.createElement('script')
    script.src = 'https://www.tiktok.com/embed.js'
    script.async = true
    document.body.appendChild(script)
    return () => {
      document.body.contains(script) && document.body.removeChild(script)
    }
  }, [review.id, review.platform, review.embedHtml])

  if (review.platform === 'tiktok' && review.embedHtml) {
    return (
      <div
        // TikTok's embed.js is supposed to resize its iframe via postMessage
        // once the video loads, but that handshake can silently fail (ad
        // blockers, privacy modes, some sandboxed environments) and leave the
        // iframe stuck at its 1px placeholder height. Forcing a minimum
        // height here keeps the video visible either way.
        className="rounded-xl overflow-hidden bg-surface border border-line flex justify-center [&_.tiktok-embed]:!my-0 [&_iframe]:!min-h-[580px] [&_iframe]:!max-h-none"
        dangerouslySetInnerHTML={{ __html: review.embedHtml }}
      />
    )
  }

  if (review.platform === 'youtube' && review.embedHtml) {
    return (
      <div
        // YouTube's oEmbed iframe carries fixed pixel width/height attributes —
        // override to fill a responsive 16:9 box instead.
        className="rounded-xl overflow-hidden bg-black border border-line aspect-video [&_iframe]:!w-full [&_iframe]:!h-full [&_iframe]:!border-0"
        dangerouslySetInnerHTML={{ __html: review.embedHtml }}
      />
    )
  }

  const meta = PLATFORM_META[review.platform] ?? PLATFORM_META.tiktok
  const Icon = meta.icon

  return (
    <a
      href={review.videoUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 hover:border-chili transition-colors"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-2 text-chili">
        <Icon size={22} weight="fill" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[14px] truncate">{review.placeName || meta.label}</div>
        <div className="text-[12.5px] text-ink-faint">{c.watchOn(meta.label)} ↗</div>
      </div>
    </a>
  )
}
