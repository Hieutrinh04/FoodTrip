// Shared server-side cache for slow third-party searches (table
// public.search_cache, service role only). Talks to PostgREST with a plain
// fetch: pulling in supabase-js for two calls added to every cold start.
//
// Strictly best-effort: a cache that cannot be read or written only costs the
// search it would have saved, so every failure here is swallowed rather than
// failing the request.

const TIMEOUT_MS = 3000

function endpoint() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  return { url: `${url}/rest/v1/search_cache`, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' } }
}

/** Lower-cased, space-collapsed text, so "Phở Thìn " and "phở thìn" share an entry. */
export const cacheKeyPart = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

export async function readSearchCache<T>(key: string): Promise<{ payload: T; expiresAt: number } | null> {
  const api = endpoint()
  if (!api) return null
  try {
    const res = await fetch(`${api.url}?key=eq.${encodeURIComponent(key)}&select=payload,expires_at`, { headers: api.headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const [row] = await res.json()
    return row ? { payload: row.payload as T, expiresAt: Date.parse(row.expires_at) } : null
  } catch {
    return null
  }
}

export async function writeSearchCache(key: string, payload: unknown, expiresAt: number) {
  const api = endpoint()
  if (!api) return
  try {
    await fetch(`${api.url}?on_conflict=key`, {
      method: 'POST',
      headers: { ...api.headers, prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, payload, expires_at: new Date(expiresAt).toISOString(), updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // best-effort, see above
  }
}

/**
 * Lets work finish after the response has gone (Supabase's EdgeRuntime keeps
 * the worker alive for it); runs it inline where that is not available.
 */
export function afterResponse(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else return work
}
