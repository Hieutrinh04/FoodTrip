import { FacebookLogo, InstagramLogo, PlayCircle, YoutubeLogo } from '@phosphor-icons/react'
import VideoEmbed from './VideoEmbed.jsx'
import { resolveEmbed } from '../../lib/videoEmbed.js'
import { parseVideoUrl } from '../../../supabase/functions/_shared/videoUrl.js'
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
  const safeVideo = parseVideoUrl(review.videoUrl)
  if (!safeVideo) return <p className="text-sm text-ink-muted">{lang === 'vi' ? 'Liên kết video không hợp lệ.' : 'Invalid video link.'}</p>

  // Played through each platform's public embed endpoint rather than its oEmbed
  // HTML. TikTok's embed.js in particular had to hand the iframe its height over
  // postMessage, a handshake that ad blockers and privacy modes silently broke,
  // leaving a 1px-tall player. A plain iframe has no such dependency — and it
  // covers Instagram and Facebook, which oEmbed could not reach without a token.
  if (resolveEmbed(review.videoUrl)) {
    return <VideoEmbed url={review.videoUrl} title={review.placeName || review.platform} />
  }

  const meta = PLATFORM_META[review.platform] ?? PLATFORM_META.tiktok
  const Icon = meta.icon

  return (
    <a
      href={safeVideo.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 hover:border-chili transition-colors"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-2 text-chili">
        <Icon size={22} weight="fill" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-md truncate">{review.placeName || meta.label}</div>
        <div className="text-sm text-ink-faint">{c.watchOn(meta.label)} ↗</div>
      </div>
    </a>
  )
}
