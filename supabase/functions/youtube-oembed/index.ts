import { jsonResponse, handleOptions } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const url = new URL(req.url).searchParams.get('url')
  if (!url) return jsonResponse({ error: 'missing-url' }, { status: 400 })

  try {
    const upstream = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    if (!upstream.ok) return jsonResponse({ error: 'oembed-failed' }, { status: upstream.status })
    const json = await upstream.json()
    return jsonResponse(json)
  } catch (err) {
    return jsonResponse({ error: 'oembed-fetch-failed', message: (err as Error).message }, { status: 502 })
  }
})
