import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { parseVideoUrl } from '../_shared/videoUrl.js'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const url = new URL(req.url).searchParams.get('url')
  if (!url) return jsonResponse({ error: 'missing-url' }, { status: 400 })
  const parsed = parseVideoUrl(url)
  if (parsed?.platform !== 'tiktok') return jsonResponse({ error: 'invalid-url' }, { status: 400 })

  try {
    const upstream = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.url)}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'Mozilla/5.0 (FoodTrip video-share feature)' },
    })
    if (!upstream.ok) return jsonResponse({ error: 'oembed-failed' }, { status: upstream.status })
    const json = await upstream.json()
    return jsonResponse(json)
  } catch (err) {
    return jsonResponse({ error: 'oembed-fetch-failed', message: (err as Error).message }, { status: 502 })
  }
})
