export function requireLocalSupabase(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('E2E dừng: cần URL Supabase local hợp lệ.') }
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('E2E dừng: Supabase phải là localhost hoặc 127.0.0.1. Không dùng project thật.')
  }
  return url.origin
}
