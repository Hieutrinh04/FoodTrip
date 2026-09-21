import { useEffect, useState } from 'react'
import { fetchPlaceEnrichment } from '../lib/placesService.js'

const IDLE = { status: 'idle', data: null, error: null }

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

    fetchPlaceEnrichment({ name, address, city })
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
