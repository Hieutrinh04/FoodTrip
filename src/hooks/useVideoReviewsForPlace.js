import { useEffect, useState } from 'react'
import { getReviewsForPlace } from '../lib/videoShare.js'

/** Fetches shared (server-backed) video reviews for a place, by Google place_id or name. */
export function useVideoReviewsForPlace({ googlePlaceId, name } = {}) {
  const [reviews, setReviews] = useState([])

  useEffect(() => {
    if (!googlePlaceId && !name) {
      setReviews([])
      return
    }
    let cancelled = false
    getReviewsForPlace({ googlePlaceId, name })
      .then((list) => {
        if (!cancelled) setReviews(list)
      })
      .catch(() => {
        if (!cancelled) setReviews([])
      })
    return () => {
      cancelled = true
    }
  }, [googlePlaceId, name])

  return reviews
}
