// What FoodTrip's own users say about a place (migration 20261104090000):
// how many saved it, and their reviews. Kept apart from Google's rating and
// from the sample dataset's illustrative reviews — the three are never mixed.

import { supabase, hasSupabase } from './supabaseClient.js'

/**
 * { saved, rating, review_count, items, mine } for a place, or null when the
 * backend (or the function, before the migration) is unavailable — the page
 * then shows nothing rather than a zero that is not true.
 */
export async function fetchPlaceFacts(placeId, { rpc = hasSupabase ? (args) => supabase.rpc('place_public_facts', args) : null } = {}) {
  if (!rpc || !placeId) return null
  try {
    const { data, error } = await rpc({ p_place: placeId, p_limit: 10 })
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null
    return {
      saved: Number(data.saved) || 0,
      rating: data.rating == null ? null : Number(data.rating),
      reviewCount: Number(data.review_count) || 0,
      items: Array.isArray(data.items) ? data.items : [],
      mine: data.mine ?? null,
    }
  } catch {
    return null
  }
}

export async function submitPlaceReview(placeId, rating, comment) {
  const { error } = await supabase.rpc('submit_place_review', { p_place: placeId, p_rating: rating, p_comment: comment?.trim() || null })
  if (error) throw error
}

export async function deleteMyPlaceReview(placeId) {
  const { error } = await supabase.rpc('delete_my_place_review', { p_place: placeId })
  if (error) throw error
}

export async function adminListPlaceReviews() {
  const { data, error } = await supabase.rpc('admin_list_place_reviews')
  if (error) throw error
  return data ?? []
}

export async function adminSetPlaceReviewHidden(id, hidden, note = null) {
  const { error } = await supabase.rpc('admin_set_place_review_hidden', { p_review: id, p_hidden: hidden, p_note: note })
  if (error) throw error
}
