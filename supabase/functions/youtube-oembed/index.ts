import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { parseVideoUrl } from '../_shared/videoUrl.js'
import { parseYoutubeVideos, YOUTUBE_VIDEOS_URL } from '../_shared/videoPage.js'
import { screenText } from '../_shared/screenText.ts'

/** The video description (Data API, 1 quota unit), or '' without a key or on failure. */
async function description(url: string) {
  const key = Deno.env.get('YOUTUBE_API_KEY')
  const id = new URL(url).searchParams.get('v')
  if (!key || !id) return ''
  const params = new URLSearchParams({ part: 'snippet', id, key, fields: 'items(snippet(description))' })
  return fetch(`${YOUTUBE_VIDEOS_URL}?${params}`, { signal: AbortSignal.timeout(6000) })
    .then((r) => (r.ok ? r.json() : null)).then(parseYoutubeVideos).catch(() => '')
}

// oEmbed gives the title; the Data API adds the description, where creators
// usually write the venue and its address ("Địa chỉ: 45 Hoàng Quốc Việt …").
Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const url = new URL(req.url).searchParams.get('url')
  if (!url) return jsonResponse({ error: 'missing-url' }, { status: 400 })
  const parsed = parseVideoUrl(url)
  if (parsed?.platform !== 'youtube') return jsonResponse({ error: 'invalid-url' }, { status: 400 })

  try {
    const [upstream, about] = await Promise.all([
      fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.url)}&format=json`, { signal: AbortSignal.timeout(10000) }),
      description(parsed.url),
    ])
    if (!upstream.ok) return jsonResponse({ error: 'oembed-failed' }, { status: upstream.status })
    const json = await upstream.json()
    // The thumbnail's text ("NHÀ KHO LẨU & NƯỚNG") when Cloud Vision is on; only YouTube's own image host.
    const thumb = typeof json.thumbnail_url === 'string' && /^https:\/\/i\d?\.ytimg\.com\//.test(json.thumbnail_url) ? json.thumbnail_url : null
    return jsonResponse({ ...json, description: about, screenText: thumb ? await screenText([thumb]) : '' })
  } catch (err) {
    return jsonResponse({ error: 'oembed-fetch-failed', message: (err as Error).message }, { status: 502 })
  }
})
