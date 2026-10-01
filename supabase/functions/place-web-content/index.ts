import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { contentHostAllowed, primaryName, searchName } from '../_shared/relevance.ts'
import { isAboutVenue } from '../_shared/venueMatch.ts'
import { hasSerperKey, serper, type SerperItem } from '../_shared/serper.ts'

// A URL that points at a single playable post rather than a profile or a
// written article — the client can embed these inline.
const PLAYABLE_PATH = /\/(reel|reels|tv|videos|watch)\//
// Instagram profile pages have nothing to embed; only single posts count.
const INSTAGRAM_POST_RE = /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[\w-]+/
// TikTok and YouTube have their own functions, with oEmbed checks.
const OWN_FUNCTION_HOSTS = /(^|\.)(tiktok\.com|youtube\.com|youtu\.be)$/
const MAX_PER_PLATFORM = 8

function platformFromUrl(url: string) {
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('facebook.com')) return 'facebook'
  return 'article'
}

/**
 * Instagram, Facebook and article coverage of a place.
 *
 * Three plain searches run together (Serper's free plan refuses `site:`, see
 * _shared/serper.ts): Google's Videos tab with "instagram" and with "facebook"
 * added, which is where Reels and Facebook videos are indexed, and the web tab
 * for articles.
 */
async function searchPlaceContent(query: string, placeName: string, address: string) {
  if (!hasSerperKey()) return { status: 'no-key', items: [] }

  const name = primaryName(placeName)
  const area = query.replace(placeName, '').replace(name, '').trim()
  const base = `${searchName(placeName)} ${area}`

  const results = await Promise.allSettled([
    serper('videos', `${base} instagram`),
    serper('videos', `${base} facebook`),
    serper('search', `${base} review`),
  ])
  if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
  const found = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])) as SerperItem[]

  const seen = new Set<string>()
  const perPlatform: Record<string, number> = {}
  const items = found.flatMap((item) => {
    // One Instagram post comes back under several URLs (?img_index=6, ?__d=1).
    const url = String(item.link || '').replace(/^(https:\/\/(www\.)?instagram\.com\/[^?#]+)[?#].*$/, '$1')
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { return [] }
    const text = `${item.title || ''} ${item.snippet || ''}`
    const platform = platformFromUrl(url)
    // Gates, any one failing drops the result — a wrong result is worse than
    // none: a known source, a single post rather than a profile, not a
    // duplicate, and enough evidence that it is about this venue.
    if (seen.has(url) || OWN_FUNCTION_HOSTS.test(host) || !contentHostAllowed(url)) return []
    if (platform === 'instagram' && !INSTAGRAM_POST_RE.test(url)) return []
    if (!isAboutVenue({ title: text, url, author: item.channel }, { name: placeName, address, area })) return []
    seen.add(url)
    // A famous venue returns dozens; the panel stays readable with the top few.
    perPlatform[platform] = (perPlatform[platform] ?? 0) + 1
    if (perPlatform[platform] > MAX_PER_PLATFORM) return []
    return [{
      id: url,
      platform,
      // Reels and Facebook videos play inline, so the client groups them with
      // the videos rather than with the written articles.
      contentType: platform === 'article' ? 'article' : (PLAYABLE_PATH.test(url) ? 'video' : 'post'),
      title: String(item.title || ''),
      url,
      snippet: String(item.snippet || ''),
      source: String(item.channel || item.source || host),
      thumbnailUrl: item.imageUrl ? String(item.imageUrl) : null,
    }]
  })
  return { status: 'ok', items }
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight
  const query = new URL(request.url).searchParams.get('query')?.trim()
  if (!query) return jsonResponse({ error: 'missing-query' }, { status: 400 })
  const placeName = new URL(request.url).searchParams.get('name')?.trim() || query
  try {
    const address = new URL(request.url).searchParams.get('address')?.trim() || ''
    return jsonResponse(await searchPlaceContent(query, placeName, address))
  } catch (error) {
    console.error('place-web-content failed:', (error as Error).message)
    return jsonResponse({ status: 'error', items: [] }, { status: 502 })
  }
})
