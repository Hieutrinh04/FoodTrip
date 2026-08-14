import { supabase, hasSupabase } from './supabaseClient.js'

/**
 * Looks up the real Agoda/Traveloka listing page for a hotel via Google
 * Custom Search (see search-hotel-listings Edge Function). Falls back to a
 * plain Google search link for each platform when the Custom Search key
 * isn't configured or nothing matched — so the button is still useful even
 * without that key, it just can't jump straight to the exact listing.
 */
export async function findHotelListings({ hotelName, cityName }) {
  const fallback = {
    agodaUrl: `https://www.google.com/search?q=${encodeURIComponent(`${hotelName} ${cityName} agoda`)}`,
    travelokaUrl: `https://www.google.com/search?q=${encodeURIComponent(`${hotelName} ${cityName} traveloka`)}`,
    exact: false,
  }
  if (!hasSupabase) return fallback

  try {
    const { data, error } = await supabase.functions.invoke('search-hotel-listings', { body: { hotelName, cityName } })
    if (error || data?.status !== 'ok') return fallback
    return {
      agodaUrl: data.agodaUrl || fallback.agodaUrl,
      travelokaUrl: data.travelokaUrl || fallback.travelokaUrl,
      exact: Boolean(data.agodaUrl || data.travelokaUrl),
    }
  } catch {
    return fallback
  }
}
