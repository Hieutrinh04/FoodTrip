import { resolveEmbed } from '../../lib/videoEmbed.js'

// Each platform's embed has its own natural shape: YouTube is landscape,
// TikTok is a phone-shaped player, and an Instagram embed adds a header and
// caption below the media, so it needs more room than the media alone.
const SHAPE_CLASS = {
  video: 'aspect-video',
  portrait: 'h-[500px]',
  post: 'h-[560px]',
}

const FRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share'

/**
 * Plays a TikTok, Instagram, YouTube or Facebook post inline.
 *
 * Renders nothing when the URL is not an embeddable single post, so callers can
 * fall back to a plain link (`resolveEmbed` returns null for profile, hashtag
 * and article URLs).
 */
export default function VideoEmbed({ url, title = '', autoPlay = false, className = '' }) {
  const embed = resolveEmbed(url)
  if (!embed) return null

  // Only YouTube reliably honours an autoplay flag from a third-party frame;
  // the others start on a tap, which is what their players expect anyway.
  const src = autoPlay && embed.platform === 'youtube' ? `${embed.src}?autoplay=1` : embed.src

  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-black ${SHAPE_CLASS[embed.shape]} ${className}`}>
      <iframe
        src={src}
        title={title || embed.platform}
        loading="lazy"
        allow={FRAME_ALLOW}
        allowFullScreen
        scrolling="no"
        className="h-full w-full border-0"
      />
    </div>
  )
}
