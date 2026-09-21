import { supabase, hasSupabase } from './supabaseClient.js'

function daysWithStartDate(days, startDate) {
  if (!startDate || !days?.[0]?.[0]) return days
  return days.map((day, dayIndex) => day.map((stop, stopIndex) => (
    dayIndex === 0 && stopIndex === 0 ? { ...stop, _tripStartDate: startDate } : stop
  )))
}

function normalizeItinerary(row) {
  if (!row) return row
  return { ...row, start_date: row.start_date ?? row.days?.[0]?.[0]?._tripStartDate ?? null }
}

export async function saveItinerary({ userId, cityId, customCityName, duration, startDate, budget, people, transport, prefs, days, hotels, isPublic = false }) {
  if (!hasSupabase) throw new Error('no-supabase')
  const payload = {
    user_id: userId,
    city_id: cityId ?? null,
    custom_city_name: customCityName ?? null,
    duration,
    start_date: startDate ?? null,
    budget,
    people,
    transport,
    prefs,
    // The embedded copy keeps the date available during the rollout window in
    // which the remote database may not have applied start_date yet.
    days: daysWithStartDate(days, startDate),
    hotels: hotels ?? [],
    is_public: isPublic,
  }
  let { data, error } = await supabase.from('itineraries').insert(payload).select('id').single()
  // Keep saves working while an existing deployment is waiting for the new
  // start_date migration. Once migrated, every new trip retains its dates.
  if (error?.code === 'PGRST204' && error.message?.includes('start_date')) {
    delete payload.start_date
    const fallback = await supabase.from('itineraries').insert(payload).select('id').single()
    data = fallback.data
    error = fallback.error
  }
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
  return (data ?? []).map(normalizeItinerary)
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
  return normalizeItinerary(data)
}
