import { supabase, hasSupabase } from './supabaseClient.js'

export async function saveItinerary({ userId, cityId, customCityName, duration, budget, people, transport, prefs, days, hotels, isPublic = false }) {
  if (!hasSupabase) throw new Error('no-supabase')
  const { data, error } = await supabase
    .from('itineraries')
    .insert({
      user_id: userId,
      city_id: cityId ?? null,
      custom_city_name: customCityName ?? null,
      duration,
      budget,
      people,
      transport,
      prefs,
      days,
      hotels: hotels ?? [],
      is_public: isPublic,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function getMyItineraries(userId) {
  if (!hasSupabase) return []
  const { data, error } = await supabase
    .from('itineraries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return []
  return data
}

export async function deleteItinerary(id) {
  if (!hasSupabase) return
  await supabase.from('itineraries').delete().eq('id', id)
}

/** Marks a saved itinerary public/private — sharing needs an explicit opt-in. */
export async function setItineraryPublic(id, isPublic) {
  if (!hasSupabase) return
  const { error } = await supabase.from('itineraries').update({ is_public: isPublic }).eq('id', id)
  if (error) throw error
}

/** Fetches a shared itinerary by id — works for anonymous visitors, since RLS allows reading public rows without auth. */
export async function getPublicItinerary(id) {
  if (!hasSupabase) return null
  const { data, error } = await supabase.from('itineraries').select('*').eq('id', id).eq('is_public', true).single()
  if (error) return null
  return data
}
