import { jsonResponse, handleOptions } from '../_shared/cors.ts'

/**
 * Google Maps reviews for one place, via Serper's reviews endpoint.
 *
 * The place is identified by the ids Google itself gave it — the `cid` in its
 * Maps link, or its `placeId` — never by name. A name search would happily
 * return reviews of a different branch or a namesake across town, and a review
 * shown under the wrong restaurant is worse than no review at all.
 *
 * Reviews are passed through as written: text, star rating, author and date
 * are Google's, untouched. The client labels the section as Google's and links
 * to the full list there.
 */

const REVIEWS_URL = 'https://google.serper.dev/reviews'
const MAX_REVIEWS = 10
const SORTS = new Set(['mostRelevant', 'newest', 'highestRating', 'lowestRating'])

type SerperReview = {
  rating?: number
  date?: string
  isoDate?: string
  snippet?: string
  likes?: number
  user?: { name?: string; thumbnail?: string; link?: string; reviews?: number; photos?: number }
  media?: { type?: string; imageUrl?: string }[]
  response?: { snippet?: string; date?: string }
  id?: string
}

function shapeReview(review: SerperReview, index: number) {
  const photos = (review.media ?? [])
    .filter((item) => item.imageUrl && (!item.type || item.type.toLowerCase().includes('photo')))
    .map((item) => item.imageUrl as string)
    .slice(0, 4)
  return {
    id: review.id ?? `review-${index}`,
    author: review.user?.name ?? null,
    authorAvatar: review.user?.thumbnail ?? null,
    authorUrl: review.user?.link ?? null,
    // How many reviews this person has written in total — the usual signal for
    // telling a regular local guide from a one-off account.
    authorReviewCount: typeof review.user?.reviews === 'number' ? review.user.reviews : null,
    rating: typeof review.rating === 'number' ? review.rating : null,
    text: review.snippet?.trim() || null,
    // Google's own relative phrase ("2 tuần trước"), plus the absolute date
    // when present so the client can sort or format it itself.
    date: review.date ?? null,
    isoDate: review.isoDate ?? null,
    likes: typeof review.likes === 'number' ? review.likes : 0,
    photos,
    ownerReply: review.response?.snippet?.trim() || null,
  }
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight

  const params = new URL(request.url).searchParams
  const cid = params.get('cid')?.trim() || null
  const placeId = params.get('placeId')?.trim() || null
  const sortBy = SORTS.has(params.get('sortBy') ?? '') ? params.get('sortBy')! : 'mostRelevant'
  if (!cid && !placeId) return jsonResponse({ error: 'missing-place' }, { status: 400 })

  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) return jsonResponse({ status: 'no-key', reviews: [] })

  // cid is the id in a Maps link and the one Serper resolves most reliably;
  // a ChIJ… placeId is the fallback.
  const body: Record<string, string> = { gl: 'vn', hl: 'vi', sortBy }
  if (cid) body.cid = cid
  else if (placeId) body.placeId = placeId

  try {
    const response = await fetch(REVIEWS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      const message = (await response.text()).slice(0, 180)
      console.error('place-reviews: Serper', response.status, message)
      // A 200 carrying the failure, as map-place-search does: functions.invoke
      // swallows a 5xx into a generic error with no message.
      return jsonResponse({ status: 'provider-error', reviews: [], message: `Serper ${response.status}` })
    }
    const json = await response.json() as { reviews?: SerperReview[] }
    const reviews = (json.reviews ?? [])
      .map(shapeReview)
      // A star with no words says nothing a reader can use here — the average
      // already carries it.
      .filter((review) => review.text)
      .slice(0, MAX_REVIEWS)
    return jsonResponse({ status: 'ok', sortBy, reviews })
  } catch (error) {
    console.error('place-reviews failed:', (error as Error).message)
    return jsonResponse({ status: 'error', reviews: [] })
  }
})
