import { useEffect, useState } from 'react'
import { fetchPlaceEnrichment } from '../lib/placesService.js'
import { fetchPlaceDetails } from '../lib/placeDetails.js'
import { fetchPlaceReviews } from '../lib/placeReviews.js'
import { getCity } from '../data/destinations.js'

const IDLE = { status: 'idle', data: null, error: null }
const REVIEWS_SHOWN = 6

/**
 * Live data for a curated place: its coordinates from the map provider, and
 * its Google listing — rating, review count, Maps link and reviews — through
 * the same Serper lookups as the explore panel (both cached in the browser).
 * The map provider publishes no ratings or reviews, so before this the page's
 * Google rating and reviews never appeared at all.
 */
async function loadEnrichment({ name, address, city }) {
  const base = await fetchPlaceEnrichment({ name, address, city }).catch(() => null)
  const cityName = getCity(city)?.name?.vi ?? ''
  const details = await fetchPlaceDetails({
    name,
    address: [address, cityName].filter(Boolean).join(', '),
    location: base?.location ?? null,
  }).catch(() => null)
  const listing = details?.status === 'ok' ? details.place : null
  if (!listing) return base

  const { reviews } = await fetchPlaceReviews({ mapsUrl: listing.mapsUrl, placeId: listing.placeId })
  return {
    ...base,
    // Google's id, which is also what shared video reviews are filed under.
    placeId: listing.placeId ?? base?.placeId ?? null,
    rating: listing.rating,
    userRatingCount: listing.ratingCount,
    location: base?.location ?? listing.location,
    mapsUri: listing.mapsUrl,
    reviews: reviews.slice(0, REVIEWS_SHOWN).map((r) => ({ author: r.author, rating: r.rating, text: r.text, relativePublishTime: r.date })),
  }
}

/** Fetches live Google rating/reviews/location for a local PLACES entry, keyed by place.id. */
export function usePlaceEnrichment(place) {
  const [state, setState] = useState(IDLE)
  const placeId = place?.id
  const name = place?.name?.vi
  const address = place?.address?.vi
  const city = place?.city

  useEffect(() => {
    if (!placeId) {
      setState(IDLE)
      return
    }
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })

    loadEnrichment({ name, address, city })
      .then((data) => {
        if (!cancelled) setState({ status: data ? 'ready' : 'empty', data, error: null })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [placeId, name, address, city])

  return state
}
