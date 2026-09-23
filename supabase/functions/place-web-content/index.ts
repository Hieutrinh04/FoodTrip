import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { contentHostAllowed, isRelevantToPlace, primaryName } from '../_shared/relevance.ts'

const SEARCH_URL = 'https://google.serper.dev/search'
const SOURCE_FILTER = '(site:foody.vn OR site:vnexpress.net OR site:thanhnien.vn OR site:tuoitre.vn OR site:kenh14.vn OR site:dantri.com.vn OR site:vietnamnet.vn OR site:afamily.vn OR site:facebook.com OR site:instagram.com)'
const INSTAGRAM_POST_FILTER = '(site:instagram.com/reel OR site:instagram.com/p)'

// A URL that points at a single playable post rather than a profile or a
// written article — the client can embed these inline.
const PLAYABLE_PATH = /\/(reel|reels|tv|videos|watch)\//

type Organic = Record<string, unknown>

function platformFromUrl(url: string) {
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('facebook.com')) return 'facebook'
  return 'article'
}

async function serperSearch(apiKey: string, q: string) {
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ q: q.replace(/\s+/g, ' ').trim(), num: 12, gl: 'vn', hl: 'vi' }),
  })
  if (!response.ok) throw new Error(`Serper ${response.status}: ${(await response.text()).slice(0, 180)}`)
  const json = await response.json()
  return (json.organic || []) as Organic[]
}

async function searchPlaceContent(query: string, placeName: string) {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) return { status: 'no-key', items: [] }

  // The name goes in quotes so the provider anchors on it; the area stays loose.
  // No giant quoted blob — an SEO-stuffed name quoted whole matches nothing and
  // makes Google silently drop the site filter and the quotes both.
  const name = primaryName(placeName)
  const area = query.replace(placeName, '').replace(name, '').trim()

  // Two searches, run together. The general one covers articles and Facebook;
  // the second targets Instagram *posts* specifically, because a plain
  // site:instagram.com search returns profile pages, which have no video to
  // embed. Path-scoped site: filters are what surface reels instead.
  const [general, instagram] = await Promise.all([
    serperSearch(apiKey, `"${name}" ${area} review ${SOURCE_FILTER}`),
    serperSearch(apiKey, `"${name}" ${area} ${INSTAGRAM_POST_FILTER}`).catch(() => [] as Organic[]),
  ])

  const seen = new Set<string>()
  const items = [...general, ...instagram].flatMap((item: Organic) => {
    const url = String(item.link || '')
    const text = `${String(item.title || '')} ${String(item.snippet || '')}`
    // Three gates: a known source, no duplicate, and the result actually names
    // the place. Any one failing drops it — a wrong result is worse than none.
    if (!url || seen.has(url) || !contentHostAllowed(url) || !isRelevantToPlace(text, name)) return []
    seen.add(url)
    const platform = platformFromUrl(url)
    return [{
      id: url,
      platform,
      // Reels and Facebook videos play inline, so the client groups them with
      // the videos rather than with the written articles.
      contentType: platform === 'article' ? 'article' : (PLAYABLE_PATH.test(url) ? 'video' : 'post'),
      title: String(item.title || ''),
      url,
      snippet: String(item.snippet || ''),
      source: String(item.source || new URL(url).hostname.replace(/^www\./, '')),
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
    return jsonResponse(await searchPlaceContent(query, placeName))
  } catch (error) {
    console.error('place-web-content failed:', (error as Error).message)
    return jsonResponse({ status: 'error', items: [] }, { status: 502 })
  }
})
