import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { isRelevantToPlace } from '../_shared/relevance.ts'

const SEARCH_URL = 'https://google.serper.dev/search'
const SOURCE_FILTER = '(site:foody.vn OR site:vnexpress.net OR site:thanhnien.vn OR site:tuoitre.vn OR site:kenh14.vn OR site:facebook.com OR site:instagram.com)'

function platformFromUrl(url: string) {
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('facebook.com')) return 'facebook'
  return 'article'
}

async function searchPlaceContent(query: string, placeName: string) {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) return { status: 'no-key', items: [] }

  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ q: `"${query}" review ${SOURCE_FILTER}`, num: 10, gl: 'vn', hl: 'vi' }),
  })
  if (!response.ok) throw new Error(`Serper ${response.status}: ${(await response.text()).slice(0, 180)}`)
  const json = await response.json()
  const seen = new Set<string>()
  const items = (json.organic || []).flatMap((item: Record<string, unknown>) => {
    const url = String(item.link || '')
    if (!url || seen.has(url) || !isRelevantToPlace(`${String(item.title || '')} ${String(item.snippet || '')}`, placeName)) return []
    seen.add(url)
    return [{
      id: url,
      platform: platformFromUrl(url),
      contentType: platformFromUrl(url) === 'article' ? 'article' : 'post',
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
