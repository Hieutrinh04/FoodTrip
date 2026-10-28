import { supabase, hasSupabase } from './supabaseClient.js'
import { fetchPlaceDetails } from './placeDetails.js'
import { fetchPlaceReviews } from './placeReviews.js'
import { assessPlaceData, placeEvidence } from '../../supabase/functions/_shared/assistant/placeAssessment.js'

export function evidenceFromPlace(place, listing, reviews = []) {
  const live = place.source === 'google-maps'
  return placeEvidence({
    name: listing?.name || place.name?.vi || place.name?.en,
    address: listing?.address || place.address?.vi,
    category: listing?.category,
    rating: listing?.rating ?? (live ? place.googleRating : null),
    ratingCount: listing?.ratingCount ?? (live ? place.googleRatingCount : null),
    price: listing?.priceRange ?? listing?.priceLevel,
    hours: listing?.hours,
    // Never use the curated place.reviews, which are illustrative seed data.
    reviews,
  })
}

export async function assessPlace(place, details, lang = 'vi', { loadDetails = fetchPlaceDetails, loadReviews = fetchPlaceReviews, invoke = hasSupabase ? (body) => supabase.functions.invoke('assistant', { body, signal: AbortSignal.timeout(9000) }) : null } = {}) {
  const profile = details?.status === 'ok' ? details : await loadDetails({ name: place.name?.vi, address: place.address?.vi, location: place.location }).catch(() => null)
  const listing = profile?.status === 'ok' ? profile.place : null
  const result = listing ? await loadReviews({ mapsUrl: listing.mapsUrl, placeId: listing.placeId }).catch(() => null) : null
  const evidence = evidenceFromPlace(place, listing, result?.status === 'ok' ? result.reviews : [])
  if (!evidence) throw new Error('missing-place')
  const fallback = assessPlaceData(evidence, lang)
  if (invoke) {
    try {
      const { data, error } = await invoke({ placeAssessment: evidence, lang })
      if (!error && data?.assessment?.source === 'model' && typeof data.assessment.text === 'string' && data.assessment.text.length <= 5000) return { ...fallback, text: data.assessment.text, source: 'model' }
    } catch { /* data analysis remains available offline or against an older backend */ }
  }
  return fallback
}
