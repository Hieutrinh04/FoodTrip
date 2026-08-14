import { jsonResponse, handleOptions } from '../_shared/cors.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function fetchImageAsBase64(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`thumbnail fetch failed: ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  return { mediaType: contentType.split(';')[0], data: arrayBufferToBase64(await res.arrayBuffer()) }
}

// Many food-review videos are "listicles" ("Top 5 quán ăn ngon Đà Lạt") that
// name several venues in one caption — SpotFetch-style extraction pulls out
// every place mentioned instead of assuming there's only one.
const SYSTEM_PROMPT = `You help a Vietnamese food-and-travel app identify which real restaurant(s) or food stall(s) a short-form video (TikTok) review is about.
You are given the video's caption text and, when available, a single thumbnail frame.
Many such videos are "listicles" that name several venues (e.g. "Top 5 quán ăn ngon Đà Lạt") — extract EVERY distinct place you find evidence for, not just one.
Look for: a restaurant/stall name, a street/ward/city mentioned in the caption, or text visible on a sign or menu in the image.
Never invent an address or coordinates — you have no access to those. Only report a place if you have real textual or visual evidence for it. If nothing is evident, return an empty list.
Respond with strict JSON only, no prose, in this shape:
{"places": [{"guessedName": string, "guessedArea": string | null, "confidence": "high" | "medium" | "low", "evidence": string}]}
"guessedName" is the best-guess business/stall name. "guessedArea" is a city/district/street if mentioned (or null). "confidence" reflects how directly the evidence supports the guess. "evidence" briefly cites what in the caption/image supports it. Order the list by confidence, highest first.`

function emptyResult(reason: string) {
  return { places: [], evidence: reason }
}

async function detectPlaceFromContent({ caption, thumbnailUrl }: { caption?: string; thumbnailUrl?: string }) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return emptyResult('missing-api-key')

  const content: unknown[] = []
  if (caption) content.push({ type: 'text', text: `Video caption: "${caption}"` })
  if (thumbnailUrl) {
    try {
      const { mediaType, data } = await fetchImageAsBase64(thumbnailUrl)
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
    } catch {
      // thumbnail unreachable — proceed with caption only
    }
  }
  if (!content.length) return emptyResult('no-content')

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }] }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Anthropic API ${response.status}: ${text.slice(0, 200)}`)
  }

  const json = await response.json()
  const text = json.content?.[0]?.text ?? '{}'
  try {
    const parsed = JSON.parse(text)
    return { places: Array.isArray(parsed.places) ? parsed.places : [] }
  } catch {
    return emptyResult('unparseable-response')
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const { caption, thumbnailUrl } = await req.json()
    if (!caption && !thumbnailUrl) return jsonResponse({ error: 'missing-content' }, { status: 400 })
    const guess = await detectPlaceFromContent({ caption, thumbnailUrl })
    return jsonResponse(guess)
  } catch (err) {
    console.error('detect-place failed:', (err as Error).message)
    return jsonResponse({ error: 'detect-failed', message: (err as Error).message }, { status: 502 })
  }
})
