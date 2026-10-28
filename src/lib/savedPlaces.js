import { hasSupabase, supabase } from './supabaseClient.js'

const STORAGE_KEY = 'foodtrip-saved'

export function getLocalSavedPlaceIds() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string'))] : []
  } catch {
    return []
  }
}

function setLocalSavedPlaceIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]))
  } catch { /* local storage may be unavailable in private mode */ }
}

export async function getSavedPlaceIds(userId = null) {
  if (!userId || !hasSupabase) return []
  const localIds = getLocalSavedPlaceIds()

  const { data, error } = await supabase
    .from('saved_places')
    .select('place_id')
    .eq('user_id', userId)
  if (error) throw error

  const accountIds = data.map((row) => row.place_id)
  const missing = localIds.filter((id) => !accountIds.includes(id))
  if (missing.length) {
    const { error: syncError } = await supabase
      .from('saved_places')
      .upsert(missing.map((placeId) => ({ user_id: userId, place_id: placeId })), {
        onConflict: 'user_id,place_id',
        ignoreDuplicates: true,
      })
    if (syncError) throw syncError
  }
  // Legacy guest favourites are imported once; account favourites must never
  // be copied to the next account using this browser.
  if (localIds.length) setLocalSavedPlaceIds([])
  return [...new Set([...accountIds, ...localIds])]
}

export async function setPlaceSaved({ userId = null, placeId, saved }) {
  if (!userId || !hasSupabase) throw new Error('auth-required')
  if (saved) {
    const { error } = await supabase
      .from('saved_places')
      .upsert({ user_id: userId, place_id: placeId }, { onConflict: 'user_id,place_id', ignoreDuplicates: true })
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('saved_places')
    .delete()
    .eq('user_id', userId)
    .eq('place_id', placeId)
  if (error) throw error
}
