/**
 * Serper, the Google search API every web-discovery function uses.
 *
 * Its free plan rejects any query containing `site:` or a quoted phrase
 * ("Query pattern not allowed for free accounts") — which silently emptied the
 * TikTok, Instagram/Facebook, article and Agoda/Traveloka searches. So queries
 * here are plain words, and the narrowing that `site:` used to do happens on
 * the results instead: callers check the host, the URL shape and that the text
 * names the place.
 *
 * `videos` is Google's Videos tab. It indexes TikTok, Instagram Reels and
 * Facebook videos by their captions, which the web tab mostly doesn't.
 */
export type SerperItem = {
  title?: string
  link?: string
  snippet?: string
  imageUrl?: string
  source?: string
  channel?: string
  duration?: string
  date?: string
}

export async function serper(endpoint: 'search' | 'videos', q: string, num = 20): Promise<SerperItem[]> {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) throw new Error('no-key')
  const response = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ q: q.replace(/["']/g, ' ').replace(/\s+/g, ' ').trim(), num, gl: 'vn', hl: 'vi' }),
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`Serper ${response.status}: ${(await response.text()).slice(0, 180)}`)
  const json = await response.json()
  return (endpoint === 'videos' ? json.videos : json.organic) ?? []
}

export const hasSerperKey = () => Boolean(Deno.env.get('SERPER_API_KEY'))
