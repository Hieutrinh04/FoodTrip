import { supabase, hasSupabase } from './supabaseClient.js'

/**
 * Write-through cache for places discovered via live Google Places search
 * outside the curated cities — otherwise they only exist in the in-memory
 * registry (destinations.js) and vanish on refresh. Fire-and-forget: a
 * caching failure shouldn't block the planner flow.
 */
export async function cacheCustomPlaces(places) {
  if (!hasSupabase || !places?.length) return
  await supabase
    .from('custom_places')
    .upsert(places.map((p) => ({ id: p.id, data: p })))
}

/** Re-hydrates custom places by id, e.g. before rendering a saved itinerary. */
export async function fetchCustomPlaces(ids) {
  if (!hasSupabase || !ids?.length) return []
  const { data, error } = await supabase.from('custom_places').select('data').in('id', ids)
  if (error) return []
  return data.map((row) => row.data)
}
