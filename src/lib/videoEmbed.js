/**
 * Turns a public post URL into something the app can embed inline.
 *
 * Every platform here exposes a keyless, public embed endpoint, so a video can
 * be played inside FoodTrip without an API token and without the platform's own
 * loader script:
 *
 *   YouTube    /embed/{id}
 *   TikTok     /embed/v2/{videoId}      (replaces the flaky embed.js handshake)
 *   Instagram  /p|reel|tv/{code}/embed/
 *   Facebook   /plugins/video.php?href=…
 *
 * Returns null when a URL is not an embeddable single post — an Instagram
 * profile or a TikTok hashtag page has nothing to play, and must stay a link.
 */

import { parseVideoUrl } from '../../supabase/functions/_shared/videoUrl.js'

const YOUTUBE_ID = /^[\w-]{11}$/

function youtubeId(url) {
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0]
  const v = url.searchParams.get('v')
  if (v) return v
  const match = url.pathname.match(/\/(embed|shorts|live|v)\/([\w-]+)/)
  return match?.[2] ?? null
}

/** @returns {{platform: string, src: string, shape: 'video'|'portrait'|'post'}|null} */
export function resolveEmbed(rawUrl) {
  const parsed = parseVideoUrl(rawUrl)
  if (!parsed) return null
  let url
  try {
    url = new URL(parsed.url)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')

  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = youtubeId(url)
    if (!id || !YOUTUBE_ID.test(id)) return null
    return { platform: 'youtube', src: `https://www.youtube.com/embed/${id}`, shape: 'video' }
  }

  if (host.endsWith('tiktok.com')) {
    // Only a real video page has an id to embed; @profile and /tag/ pages don't.
    const id = url.pathname.match(/\/video\/(\d+)/)?.[1]
    if (!id) return null
    return { platform: 'tiktok', src: `https://www.tiktok.com/embed/v2/${id}`, shape: 'portrait' }
  }

  if (host.endsWith('instagram.com')) {
    // Keep the original segment: /reel/ and /tv/ resolve differently from /p/.
    const match = url.pathname.match(/\/(p|reel|reels|tv)\/([\w-]+)/)
    if (!match) return null
    const kind = match[1] === 'reels' ? 'reel' : match[1]
    return { platform: 'instagram', src: `https://www.instagram.com/${kind}/${match[2]}/embed/`, shape: 'post' }
  }

  if (host.endsWith('facebook.com') || host === 'fb.watch') {
    // Only video permalinks play; a page or photo link would render an error box.
    if (host !== 'fb.watch' && !/\/(videos|reel|watch)\b/.test(url.pathname) && !url.searchParams.get('v')) return null
    const href = encodeURIComponent(url.toString())
    return { platform: 'facebook', src: `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false`, shape: 'video' }
  }

  return null
}

export function isEmbeddable(url) {
  return resolveEmbed(url) != null
}
