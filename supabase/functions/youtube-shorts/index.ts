import { jsonResponse, handleOptions } from '../_shared/cors.ts'

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
 * Finds real YouTube Shorts about a place by name, so the app can suggest
 * relevant short-form video content without anyone having to submit a link
 * (unlike TikTok/Instagram/Facebook, YouTube has a public search API).
 * Only videos at or under 60 seconds are kept — search's videoDuration=short
 * filter alone allows up to 4 minutes, so a second call confirms true Shorts.
 */
async function searchYoutubeShorts(query: string) {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) return { status: 'no-key', videos: [] }

  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoDuration: 'short',
    maxResults: '10',
    q: `${query} #shorts`,
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
    .map((v: { id: string; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } }; contentDetails?: { duration?: string } }) => ({
      videoId: v.id,
      title: v.snippet?.title,
      channelTitle: v.snippet?.channelTitle,
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url,
      durationSeconds: parseIsoDuration(v.contentDetails?.duration),
    }))
    .filter((v: { durationSeconds: number | null }) => v.durationSeconds != null && v.durationSeconds <= 60)
    .slice(0, 6)

  return { status: 'ok', videos: shorts }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const query = new URL(req.url).searchParams.get('query')
  if (!query) return jsonResponse({ error: 'missing-query' }, { status: 400 })
  try {
    const result = await searchYoutubeShorts(query)
    return jsonResponse(result)
  } catch (err) {
    console.error('youtube-shorts failed:', (err as Error).message)
    return jsonResponse({ error: 'youtube-failed', message: (err as Error).message }, { status: 502 })
  }
})
