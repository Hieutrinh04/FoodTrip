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

// The Serper keys in the order they are tried: the main one, then a backup
// that takes over when the main account runs out of credits.
const KEY_NAMES = ['SERPER_API_KEY', 'SERPER_API_KEY_BACKUP']

export function serperKeys() {
  return KEY_NAMES.map((name) => Deno.env.get(name)).filter((key): key is string => Boolean(key))
}

/**
 * A Serper request that moves on to the next key when the account behind the
 * current one cannot serve it — out of credits (Serper answers 400 "Not
 * enough credits"), key rejected (401/403), or rate-limited (429). Any other
 * failure is the request's own and is returned as is, without spending the
 * backup's credits on it.
 */
export async function serperFetch(path: string, body: unknown, timeoutMs = 15000): Promise<Response> {
  const keys = serperKeys()
  if (!keys.length) throw new Error('no-key')
  let last: Response | null = null
  for (const key of keys) {
    const response = await fetch(`https://google.serper.dev/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.ok) return response
    const text = await response.clone().text()
    const accountProblem = [401, 402, 403, 429].includes(response.status) || (response.status === 400 && /credit|quota|limit/i.test(text))
    if (!accountProblem) return response
    console.warn(`serper: key ${keys.indexOf(key) + 1}/${keys.length} unusable (${response.status}), trying the next`)
    last = response
  }
  return last!
}

export async function serper(endpoint: 'search' | 'videos', q: string, num = 20): Promise<SerperItem[]> {
  const response = await serperFetch(endpoint, { q: q.replace(/["']/g, ' ').replace(/\s+/g, ' ').trim(), num, gl: 'vn', hl: 'vi' }, 12000)
  if (!response.ok) throw new Error(`Serper ${response.status}: ${(await response.text()).slice(0, 180)}`)
  const json = await response.json()
  return (endpoint === 'videos' ? json.videos : json.organic) ?? []
}

export const hasSerperKey = () => serperKeys().length > 0
