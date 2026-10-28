// Which venue a shared video shows, from its caption — rules and known venues
// first, the map search only when the caption actually names a place:
//
//   1. the same video shared before → the venues people confirmed for it
//   2. the answer cached for this video link (7 days; 1 day when empty)
//   3. the video's own location tag (TikTok), when the creator set one → the
//      known venue of that name, or one map search for its name and address
//   4. known venues named in the caption or description (known_places / place_aliases) — free
//   5. venue names, a 📍 or an address read by rule (captionSignals.js) →
//      a map search for each (at most 2 searches in all), the caption's city first
//   6. nothing of the above → no search at all: { source: 'no-venue-signal' }
//
// Every answer is a suggestion (requiresConfirmation): the person sharing picks
// the right venue, and that choice is remembered (remember_share_place).

import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { sharePlaceSearch } from '../_shared/sharePlaceSearch.ts'
import { analyzeCaption, spokenNames, sameHouse } from '../_shared/captionSignals.js'
import { matchKnown } from '../_shared/knownPlaces.js'
import { plain, sameVenue } from '../_shared/placeNames.js'
import { parseVideoUrl } from '../_shared/videoUrl.js'
import { readPlan } from '../_shared/videoPlan.js'
import { loadKnown, asCandidate, sharedBefore, saveFound, type Candidate, type FoundPlace } from '../_shared/knownPlacesStore.ts'
import { readSearchCache, writeSearchCache } from '../_shared/searchCache.ts'

const DAY = 24 * 3600e3
const MAX_SEARCHES = 2
// A video naming several venues: one search per venue, at most this many (about 3 credits each).
const MAX_SEARCHES_LIST = 8

type Mention = { said: string; placeId: string | null; address: string | null }
type Answer = {
  places: Candidate[]; source: string; requiresConfirmation: true; signals: { names: string[]; cities: string[]; hasVenue: boolean }
  catalogueSaved?: boolean
  mentions: Mention[]; plan: ReturnType<typeof readPlan>
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight
  if (request.method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, { status: 405 })
  try {
    const body = await request.json()
    const { caption, videoUrl } = body
    if (typeof caption !== 'string' || !caption.trim() || caption.length > 10000) return jsonResponse({ error: 'invalid-caption' }, { status: 400 })
    const description = typeof body.description === 'string' ? body.description.slice(0, 5000) : ''
    // What the reviewer says aloud, and a city/district tag to search in.
    const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 6000) : ''
    const area = typeof body.area === 'string' ? body.area.slice(0, 200) : ''
    // Comments that can say where it is: { text, answer, by } (tiktok-oembed keeps only the creator's and answers).
    const comments = Array.isArray(body.comments)
      ? body.comments.slice(0, 20).filter((c: unknown) => c && typeof (c as { text?: unknown }).text === 'string')
        .map((c: { text: string; answer?: unknown; by?: unknown }) => ({ text: c.text.slice(0, 300), answer: c.answer === true, by: c.by === 'creator' ? 'creator' : 'viewer' }))
      : []
    const author = typeof body.author === 'string' ? body.author.slice(0, 80) : ''
    // Text read on the video's pictures (cover, photos), when Cloud Vision is on.
    const screen = typeof body.screenText === 'string' ? body.screenText.slice(0, 4000) : ''
    const tag = videoLocation(body.location)
    const video = typeof videoUrl === 'string' ? parseVideoUrl(videoUrl)?.url ?? null : null
    // v5: comments, names said in passing ("quán nhà kho này") and addresses said aloud are read too.
    const cacheKey = video ? `share:v5:${video}` : null

    const shared = video ? await sharedBefore(video) : []
    if (cacheKey) {
      const hit = await readSearchCache<Answer>(cacheKey)
      if (hit && hit.expiresAt > Date.now()) {
        const catalogueSaved = await saveFound(hit.payload.places.filter((p) => !p.known) as FoundPlace[])
        return jsonResponse(withShared({ ...hit.payload, catalogueSaved }, shared, 'cache'))
      }
    }

    // Search text is untrusted data: it is only ever used as a search query.
    // The title goes first: names found there come before the description's.
    // Known venues are looked for in the written text and the names said aloud (not the whole talk).
    const text = [caption, description, screen, ...spokenNames(transcript), area].filter(Boolean).join('\n')
    const signals = analyzeCaption(caption, { description, spoken: transcript, area, comments, author, screen })
    const { places: known, aliases } = await loadKnown()
    type Match = { place: Parameters<typeof asCandidate>[0] }

    // The creator's location tag names the venue outright: a known venue of that
    // name, or one search for its name and address (the closest name first).
    let tagged: Candidate[] = []
    let searches = 0
    if (tag) {
      const knownTag = (matchKnown(`${tag.name} ${tag.city}`, known, aliases) as Match[]).find((m) => sameVenue(m.place.name, tag.name))
      const asKnown = knownTag ? await asCandidate(knownTag.place) : null
      if (asKnown) tagged = [asKnown]
      else {
        searches++
        try {
          const found = await sharePlaceSearch([tag.name, tag.address || tag.city].filter(Boolean).join(', ')) as Candidate[]
          tagged = [...found.filter((p) => sameVenue(tag.name, p.name)), ...found.filter((p) => !sameVenue(tag.name, p.name))].slice(0, 3)
        } catch { /* the caption may still say it */ }
      }
    }
    const matched = (await Promise.all((matchKnown(text, known, aliases) as Match[]).slice(0, 8).map((m) => asCandidate(m.place)))).filter(Boolean) as Candidate[]

    // Names already answered by the tag or a known venue need no search. A video
    // naming several venues (a food tour, a top list, an itinerary) gets a search
    // for each, up to MAX_SEARCHES_LIST; the answer is cached for the link.
    const answered = [...tagged, ...matched]
    const multi = signals.names.length >= 3 || signals.pins.length >= 2
    const budget = (multi ? MAX_SEARCHES_LIST : MAX_SEARCHES) - searches
    // Where the video gives an address, only the venue at that address answers the name:
    // a known "Chả Cá Thăng Long" at 17A Chả Cá does not answer "… - 6B Đường Thành".
    const addressOf = (said: string) => signals.addresses[signals.names.indexOf(said)] ?? null
    const answers = (p: Candidate, said: string) => sameVenue(said, p.name) && (!addressOf(said) || sameHouse(addressOf(said)!, p.address))
    const open = signals.queries.map((_q: string, i: number) => i).filter((i: number) => !answered.some((m) => answers(m, signals.names[i] ?? '')))
    const city = signals.cities[0] ? plain(signals.cities[0]) : ''
    // For one name: the venue of that name first, then one in the caption's city.
    // The branch at the address the video gives counts most ("Chả cá Thăng Long - 6B Đường Thành").
    const score = (p: Candidate, said: string, at: string | null) => (at && sameHouse(at, p.address) ? 3 : 0) + (sameVenue(said, p.name) ? 2 : 0) + (city && plain(p.address).includes(city) ? 1 : 0)
    const perName: { said: string; places: Candidate[] }[] = []
    let source = tagged.length ? 'video-location' : matched.length ? 'known' : 'no-venue-signal'
    if (signals.hasVenue && open.length && budget > 0) {
      const asked = open.slice(0, budget)
      const results = await Promise.allSettled(asked.map((i: number) => sharePlaceSearch(signals.queries[i])))
      results.forEach((r, k) => {
        const said = signals.names[asked[k]] ?? signals.queries[asked[k]]
        const at = signals.addresses[asked[k]] ?? null
        const found = (r.status === 'fulfilled' ? r.value : []) as Candidate[]
        perName.push({ said, places: found.map((p, i) => ({ p, i })).sort((a, b) => score(b.p, said, at) - score(a.p, said, at) || a.i - b.i).map(({ p }) => p) })
      })
      if (!answered.length) source = 'caption-search'
      if (results.every((r) => r.status === 'rejected') && !answered.length && !shared.length) throw new Error('search-unavailable')
    }
    // Each name's best venue first (in the video's order), then the other results.
    const searched = [...perName.map((n) => n.places[0]).filter(Boolean), ...perName.flatMap((n) => n.places.slice(1))]

    // Every venue the video names, with the suggestion that matches it.
    const pick = (said: string) =>
      [...tagged, ...matched].find((p) => answers(p, said))?.placeId
      ?? perName.find((n) => n.said === said)?.places.find((p) => sameVenue(said, p.name) || multi)?.placeId
      ?? null
    const said = tag ? [tag.name, ...signals.names.filter((n: string) => !sameVenue(n, tag.name))] : signals.names
    const mentions = said.map((s: string) => ({ said: s, placeId: pick(s), address: addressOf(s) }))
    // Someone's own route ("Huế 2 ngày: … Sáng hôm sau …") → a plan like theirs can be drafted.
    const plan = mentions.length >= 2 ? readPlan([caption, description, transcript].join('\n'), mentions, { title: caption }) : null

    const answer: Answer = {
      places: unique([...tagged, ...matched, ...searched]).slice(0, multi ? 16 : 8),
      source, requiresConfirmation: true,
      signals: { names: said, cities: signals.cities, hasVenue: signals.hasVenue || answered.length > 0 },
      mentions, plan,
    }
    // Venues a search found become FoodTrip's own venue data (details included).
    answer.catalogueSaved = await saveFound([...tagged, ...searched] as FoundPlace[])
    if (cacheKey) await writeSearchCache(cacheKey, answer, Date.now() + (answer.places.length ? 7 * DAY : DAY))
    return jsonResponse(withShared(answer, shared))
  } catch {
    return jsonResponse({ error: 'search-unavailable' }, { status: 502 })
  }
})

/** A location tag sent along with the caption: { name, address?, city? } as short strings. */
function videoLocation(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const field = (key: string, max: number) => {
    const value = (raw as Record<string, unknown>)[key]
    return typeof value === 'string' ? value.trim().slice(0, max) : ''
  }
  const name = field('name', 200)
  return name.length >= 2 ? { name, address: field('address', 300), city: field('city', 80) } : null
}

/** One suggestion per venue: by Google id, else by name and address. */
function unique(list: Candidate[]) {
  const seen = new Set<string>()
  return list.filter((p) => {
    const key = p.placeId || `${p.name}|${p.address}`
    if (!p.location || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Venues confirmed for this video before go first, whatever else was found. */
function withShared(answer: Answer, shared: Candidate[], source?: string): Answer {
  if (!shared.length) return source ? { ...answer, source } : answer
  return { ...answer, places: unique([...shared, ...answer.places]).slice(0, 8), source: 'shared-before' }
}
