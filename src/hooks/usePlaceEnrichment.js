import { useEffect, useState } from 'react'
import { fetchPlaceEnrichment } from '../lib/placesService.js'

const IDLE = { status: 'idle', data: null, error: null }

/** Fetches live Google rating/reviews/location for a local PLACES entry, keyed by place.id. */
export function usePlaceEnrichment(place) {
  const [state, setState] = useState(IDLE)

  useEffect(() => {
    if (!place) {
      setState(IDLE)
      return
    }
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })

    fetchPlaceEnrichment({ name: place.name.vi, address: place.address.vi, city: place.city })
      .then((data) => {
        if (!cancelled) setState({ status: data ? 'ready' : 'empty', data, error: null })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [place?.id])

  return state
}
