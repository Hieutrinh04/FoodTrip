import { supabase, hasSupabase } from './supabaseClient.js'
import { normalizeVi } from './tripRequest.js'

export function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('tiktok.com')) return 'tiktok'
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube'
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'facebook'
    if (host.includes('instagram.com')) return 'instagram'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function fetchTikTokOEmbed(url) {
  if (!hasSupabase) throw new Error('oembed-failed')
  const { data, error } = await supabase.functions.invoke(`tiktok-oembed?url=${encodeURIComponent(url)}`, { method: 'GET' })
  if (error) throw new Error('oembed-failed')
  return data
}

export async function fetchYoutubeOEmbed(url) {
  if (!hasSupabase) throw new Error('oembed-failed')
  const { data, error } = await supabase.functions.invoke(`youtube-oembed?url=${encodeURIComponent(url)}`, { method: 'GET' })
  if (error) throw new Error('oembed-failed')
  return data
}

export async function detectPlaceFromContent({ caption, thumbnailUrl }) {
  if (!hasSupabase) return { places: [], evidence: 'missing-api-key' }
  const { data, error } = await supabase.functions.invoke('detect-place', { body: { caption, thumbnailUrl } })
  if (error) throw new Error('detect-failed')
  return data
}

export async function verifyPlaceQuery(query) {
  if (!hasSupabase) return { status: 'no-key' }
  const { data, error } = await supabase.functions.invoke('verify-place', { body: { query } })
  if (error) throw new Error('verify-failed')
  return data
}

// Community-submitted video reviews now live in Supabase Postgres instead of
// localStorage, so a video one person shares is visible to every visitor —
// not just their own browser.

function rowToReview(row) {
  return {
    id: row.id,
    videoUrl: row.video_url,
    platform: row.platform,
    embedHtml: row.embed_html,
    thumbnailUrl: row.thumbnail_url,
    placeName: row.place_name,
    address: row.address,
    location: row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null,
    googlePlaceId: row.google_place_id,
    addedAt: row.created_at,
  }
}

export async function getVideoReviews() {
  if (!hasSupabase) return []
  const { data, error } = await supabase.from('video_reviews').select('*').order('created_at', { ascending: false })
  if (error) throw new Error('list-failed')
  return data.map(rowToReview)
}

export async function saveVideoReview(entry) {
  if (!hasSupabase) throw new Error('save-failed')
  const { error } = await supabase.from('video_reviews').insert({
    video_url: entry.videoUrl,
    platform: entry.platform,
    embed_html: entry.embedHtml ?? null,
    thumbnail_url: entry.thumbnailUrl ?? null,
    place_name: entry.placeName ?? null,
    address: entry.address ?? null,
    lat: entry.location?.lat ?? null,
    lng: entry.location?.lng ?? null,
    google_place_id: entry.googlePlaceId ?? null,
  })
  if (error) throw new Error('save-failed')
  return getVideoReviews()
}

export async function deleteVideoReview(id) {
  if (!hasSupabase) throw new Error('delete-failed')
  const { error } = await supabase.from('video_reviews').delete().eq('id', id)
  if (error) throw new Error('delete-failed')
  return getVideoReviews()
}

/**
 * Finds saved video reviews for a place. Matches by Google place_id when both
 * sides have one (reliable); otherwise falls back to a loose name match
 * (works for AI/manual entries saved without Places verification).
 */
export async function getReviewsForPlace({ googlePlaceId, name } = {}) {
  if (!hasSupabase || (!googlePlaceId && !name)) return []

  if (googlePlaceId) {
    const { data, error } = await supabase.from('video_reviews').select('*').eq('google_place_id', googlePlaceId)
    if (error) throw new Error('lookup-failed')
    if (data.length) return data.map(rowToReview)
  }

  const target = normalizeVi(name)
  if (!target) return []
  const all = await getVideoReviews()
  return all.filter((r) => {
    const candidate = normalizeVi(r.placeName)
    return candidate && (candidate.includes(target) || target.includes(candidate))
  })
}
