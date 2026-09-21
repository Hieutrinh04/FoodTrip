import { supabase, hasSupabase } from './supabaseClient.js'
import { parseVideoUrl, reviewPayload } from '../../supabase/functions/_shared/videoUrl.js'
export { parseVideoUrl }

export const REVIEW_PAGE_SIZE = 12
export const detectPlatform = (url) => parseVideoUrl(url)?.platform || 'unknown'

async function invoke(name, options = {}) {
  if (!hasSupabase) throw new Error('unavailable')
  const { data, error } = await supabase.functions.invoke(name, { ...options, signal: AbortSignal.timeout(18000) })
  if (error || !data) throw new Error('lookup-failed')
  return data
}

export async function fetchTikTokOEmbed(url) {
  return invoke(`tiktok-oembed?url=${encodeURIComponent(url)}`, { method: 'GET' })
}
export async function fetchYoutubeOEmbed(url) {
  return invoke(`youtube-oembed?url=${encodeURIComponent(url)}`, { method: 'GET' })
}

// Suggestions are never posted automatically: the user confirms the exact venue.
export async function detectPlaceFromContent({ caption }) {
  return invoke('detect-place', { body: { caption } })
}
export async function verifyPlaceQuery(query) {
  return invoke('verify-place', { body: { query } })
}

function rowToReview(row) {
  return {
    id: row.id, userId: row.user_id, videoUrl: row.video_url, platform: row.platform,
    thumbnailUrl: row.thumbnail_url, placeName: row.place_name, address: row.address,
    note: row.note || '', location: row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null,
    googlePlaceId: row.google_place_id, addedAt: row.created_at,
  }
}

export async function getVideoReviews({ offset = 0, userId } = {}) {
  if (!hasSupabase) throw new Error('unavailable')
  let query = supabase.from('video_reviews').select('*').order('created_at', { ascending: false }).order('id', { ascending: false })
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query.range(offset, offset + REVIEW_PAGE_SIZE - 1)
  if (error) throw new Error('list-failed')
  return data.map(rowToReview)
}

async function currentUserId() {
  if (!hasSupabase) throw new Error('unavailable')
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('auth-required')
  return data.user.id
}

export async function saveVideoReviews(entries) {
  const userId = await currentUserId()
  if (!entries.length || entries.length > 8) throw new Error('invalid-details')
  // Atomic insert: multi-place videos cannot leave partially published posts.
  const { data, error } = await supabase.from('video_reviews').insert(entries.map((entry) => reviewPayload(entry, userId))).select('*')
  if (error) throw new Error(error.code === '23505' ? 'duplicate' : 'save-failed')
  return data.map(rowToReview)
}

export async function saveVideoReview(entry) { return saveVideoReviews([entry]) }

export async function updateVideoReview(id, entry) {
  const userId = await currentUserId()
  const { data, error } = await supabase.from('video_reviews').update(reviewPayload(entry, userId)).eq('id', id).eq('user_id', userId).select('*').single()
  if (error) throw new Error(error.code === '23505' ? 'duplicate' : 'save-failed')
  return rowToReview(data)
}

export async function deleteVideoReview(id) {
  const userId = await currentUserId()
  const { data, error } = await supabase.from('video_reviews').delete().eq('id', id).eq('user_id', userId).select('id')
  if (error || data.length !== 1) throw new Error('delete-failed')
}

export async function getReviewsForPlace({ googlePlaceId, name } = {}) {
  if (!hasSupabase || (!googlePlaceId && !name)) return []
  const base = () => supabase.from('video_reviews').select('*').order('created_at', { ascending: false }).limit(24)
  if (googlePlaceId) {
    const { data, error } = await base().eq('google_place_id', googlePlaceId)
    if (error) throw new Error('lookup-failed')
    if (data.length) return data.map(rowToReview)
  }
  if (!name?.trim()) return []
  const { data, error } = await base().ilike('place_name', name.trim().replace(/[\\%_]/g, '\\$&'))
  if (error) throw new Error('lookup-failed')
  return data.map(rowToReview)
}
