// The text written on a video's pictures — a cover's title ("NHÀ KHO LẨU & NƯỚNG"),
// a photo post's photos ("1. Bò sốt cay 99 – 12 Bạch Đằng") — read by Google
// Cloud Vision. It needs the Cloud Vision API enabled for GOOGLE_VISION_KEY (or,
// failing that, the project's GOOGLE_CUSTOM_SEARCH_KEY); without it, or when
// Google refuses, this answers '' and stops asking for an hour, so sharing
// still works on the caption, speech and comments alone.

import { pageHeaders, visionText } from './videoPage.js'

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate'
let refusedUntil = 0

function base64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Text on up to 6 pictures (https URLs the caller already vetted), in one Vision request. */
export async function screenText(urls: string[]): Promise<string> {
  const key = Deno.env.get('GOOGLE_VISION_KEY') ?? Deno.env.get('GOOGLE_CUSTOM_SEARCH_KEY')
  if (!key || !urls.length || Date.now() < refusedUntil) return ''
  try {
    // Fetched here, not by Google: TikTok's signed picture links refuse other fetchers.
    const pictures = (await Promise.all(urls.slice(0, 6).map((url) =>
      fetch(url, { headers: pageHeaders, signal: AbortSignal.timeout(5000) })
        .then(async (r) => (r.ok && /^image\//.test(r.headers.get('content-type') ?? '') ? new Uint8Array(await r.arrayBuffer()) : null))
        .catch(() => null)))).filter((b): b is Uint8Array => Boolean(b && b.byteLength > 0 && b.byteLength < 4_000_000))
    if (!pictures.length) return ''
    const res = await fetch(`${VISION_URL}?key=${key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ requests: pictures.map((b) => ({ image: { content: base64(b) }, features: [{ type: 'TEXT_DETECTION' }], imageContext: { languageHints: ['vi', 'en'] } })) }),
    })
    if (res.status === 403 || res.status === 401) { refusedUntil = Date.now() + 3600e3; return '' }
    return res.ok ? visionText(await res.json()) : ''
  } catch {
    return ''
  }
}
