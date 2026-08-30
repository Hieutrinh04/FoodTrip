import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { hasExactPlaceMention, hasLocationEvidence } from '../_shared/relevance.ts'

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'

// ISO 8601 duration like "PT45S" or "PT1M5S" -> total seconds.
function parseIsoDuration(iso: string | undefined) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '')
  if (!match) return null
  const [, h, m, s] = match
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0)
}

/**
 * Finds both regular YouTube reviews and Shorts about a place by name.
 */
async function searchYoutubeShorts(query: string, placeName: string, location: string) {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) return { status: 'no-key', videos: [] }

  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '12',
    q: `${query} review`,
    key: apiKey,
  })
  const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`)
  if (!searchRes.ok) throw new Error(`YouTube search ${searchRes.status}: ${(await searchRes.text()).slice(0, 200)}`)
  const searchJson = await searchRes.json()
  const ids = (searchJson.items || []).map((it: { id?: { videoId?: string } }) => it.id?.videoId).filter(Boolean)
  if (!ids.length) return { status: 'ok', videos: [] }

  const videosParams = new URLSearchParams({ part: 'contentDetails,snippet', id: ids.join(','), key: apiKey })
  const videosRes = await fetch(`${VIDEOS_URL}?${videosParams}`)
  if (!videosRes.ok) throw new Error(`YouTube videos ${videosRes.status}: ${(await videosRes.text()).slice(0, 200)}`)
  const videosJson = await videosRes.json()

  const shorts = (videosJson.items || [])
    .map((v: { id: string; snippet?: { title?: string; description?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } }; contentDetails?: { duration?: string } }) => ({
      videoId: v.id,
      title: v.snippet?.title,
      channelTitle: v.snippet?.channelTitle,
      description: v.snippet?.description,
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url,
      durationSeconds: parseIsoDuration(v.contentDetails?.duration),
      contentType: (parseIsoDuration(v.contentDetails?.duration) ?? Infinity) <= 60 ? 'short' : 'video',
    }))
    .filter((v: { durationSeconds: number | null }) => v.durationSeconds != null)
    // Channel names are not evidence that a video is about the venue: a
    // creator can coincidentally share the owner's name. Require the venue's
    // distinctive words in the video title itself.
    .filter((v: { title?: string; description?: string }) => {
      const evidence = `${v.title || ''} ${v.description || ''}`
      return hasExactPlaceMention(v.title || '', placeName) && hasLocationEvidence(evidence, location)
    })
    .slice(0, 8)

  return { status: 'ok', videos: shorts }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const query = new URL(req.url).searchParams.get('query')
  if (!query) return jsonResponse({ error: 'missing-query' }, { status: 400 })
  const placeName = new URL(req.url).searchParams.get('name')?.trim() || query
  const location = new URL(req.url).searchParams.get('location')?.trim() || ''
  try {
    const result = await searchYoutubeShorts(query, placeName, location)
    return jsonResponse(result)
  } catch (err) {
    console.error('youtube-shorts failed:', (err as Error).message)
    return jsonResponse({ error: 'youtube-failed', message: (err as Error).message }, { status: 502 })
  }
})
