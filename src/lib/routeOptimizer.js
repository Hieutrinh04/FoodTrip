/**
 * Route optimisation for a single day of an itinerary.
 *
 * The planner fills each time slot greedily, one slot at a time, so it never
 * reconsiders an earlier choice — a restaurant picked for lunch can leave the
 * afternoon stop stranded on the far side of town. This module improves the
 * finished day with a local search.
 *
 * The problem is a Travelling Salesman Problem with Time Windows: the visiting
 * order is not free, because each position carries a fixed time and meaning
 * (breakfast has to be in the morning, dinner in the evening). Times and
 * activity labels therefore stay bound to their position; only *which place
 * sits at each position* is allowed to move, and a move is legal only when
 * every relocated place still matches its new slot's category and is open at
 * that slot's time.
 *
 * Two classic neighbourhoods are explored until neither yields an improvement:
 *   - 2-opt: reverse a contiguous run of positions, which undoes route crossings
 *   - swap:  exchange the places at two positions, which 2-opt alone can't reach
 *     under these constraints because most reversals are rejected as illegal
 *
 * This is a heuristic, not an exact solver: it returns a local optimum, which
 * for a handful of stops per day is in practice as good as an exact one and
 * costs microseconds.
 */

const MAX_PASSES = 60

function haversineKm(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Total straight-line distance, optionally including fixed start/end anchors. */
export function totalDistanceKm(entries, startLocation = null, endLocation = null) {
  let sum = 0
  let previous = startLocation
  for (const entry of entries) {
    if (!entry.location) continue
    if (previous) sum += haversineKm(previous, entry.location) ?? 0
    previous = entry.location
  }
  if (previous && endLocation) sum += haversineKm(previous, endLocation) ?? 0
  return sum
}

/** A place may occupy a slot only if the category matches and it is open then. */
function fitsSlot(entry, slot, isOpenAt) {
  return slot.categories.includes(entry.place.category) && isOpenAt(entry.place.hours, slot.time)
}

function allFit(entries, slots, isOpenAt) {
  return entries.every((entry, index) => fitsSlot(entry, slots[index], isOpenAt))
}

/**
 * Reorders one day's stops to shorten total travel, keeping every stop in a
 * slot it is actually valid for.
 *
 * @param entries [{ place, location, slot }] in slot order
 * @param isOpenAt (hours, time) => boolean — supplied by the caller so this
 *        module stays free of dataset-specific opening-hours rules
 * @returns { entries, before, after, improvedKm } — `entries` is the input
 *          order when no legal improvement exists
 */
export function optimiseDayRoute(entries, isOpenAt, { startLocation = null, endLocation = null } = {}) {
  const slots = entries.map((entry) => entry.slot)
  const before = totalDistanceKm(entries, startLocation, endLocation)

  // Fewer than four stops leaves nothing a reversal or swap could improve:
  // the first stop is fixed by the day's start and any shuffle of two is
  // either the same route or an illegal one.
  if (entries.length < 4) return { entries, before, after: before, improvedKm: 0 }

  let best = entries
  let bestDistance = before

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let improvedThisPass = false

    for (let i = 0; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const candidates = []

        // 2-opt: reverse positions i..j
        candidates.push([...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)])

        // swap: exchange positions i and j
        const swapped = [...best]
        swapped[i] = best[j]
        swapped[j] = best[i]
        candidates.push(swapped)

        for (const candidate of candidates) {
          if (!allFit(candidate, slots, isOpenAt)) continue
          const distance = totalDistanceKm(candidate, startLocation, endLocation)
          // Require a real gain so floating-point noise can't loop forever.
          if (distance < bestDistance - 1e-6) {
            best = candidate
            bestDistance = distance
            improvedThisPass = true
          }
        }
      }
    }

    if (!improvedThisPass) break
  }

  // The slot belongs to the position, not to the place that arrived in it, so
  // rebind each entry to the slot it now occupies. Without this the caller
  // reads the slot the place *used to* sit in and the day comes out with its
  // times scrambled — 19:00 before 07:00.
  const rebound = best.map((entry, index) => ({ ...entry, slot: slots[index] }))
  return { entries: rebound, before, after: bestDistance, improvedKm: before - bestDistance }
}

function routePoints(entries, startLocation, endLocation) {
  return [
    ...(startLocation ? [startLocation] : []),
    ...entries.map((entry) => entry.location).filter(Boolean),
    ...(endLocation ? [endLocation] : []),
  ]
}

/** Enumerates every schedule-valid assignment for the small (normally 2–6 stop) day. */
function legalOrders(entries, slots, isOpenAt) {
  const orders = []
  const used = new Array(entries.length).fill(false)
  const current = []

  function visit(position) {
    if (position === slots.length) {
      orders.push([...current])
      return
    }
    for (let index = 0; index < entries.length; index += 1) {
      if (used[index] || !fitsSlot(entries[index], slots[position], isOpenAt)) continue
      used[index] = true
      current.push(entries[index])
      visit(position + 1)
      current.pop()
      used[index] = false
    }
  }

  visit(0)
  return orders
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Chooses the best legal order using actual road travel time returned by the
 * routing provider. All legal orders are considered for small days; for a
 * longer/more permissive day, the best straight-line candidates are shortlisted
 * first to keep API usage and generation time bounded.
 *
 * The returned `routeDetails.legs` matches the final point order and can be used
 * to display road distance/time for every segment without estimating it again.
 */
export async function optimiseDayRouteByRoad(entries, isOpenAt, {
  startLocation = null,
  endLocation = null,
  fetchRouteDetails,
  candidateLimit = 24,
  concurrency = 4,
} = {}) {
  const fallback = optimiseDayRoute(entries, isOpenAt, { startLocation, endLocation })
  if (entries.length < 2 || typeof fetchRouteDetails !== 'function' || entries.some((entry) => !entry.location)) {
    return { ...fallback, routeDetails: null, usedRoadRouting: false }
  }

  const slots = entries.map((entry) => entry.slot)
  const fallbackOrder = fallback.entries.map((entry, index) => ({ ...entry, slot: slots[index] }))
  const allOrders = legalOrders(entries, slots, isOpenAt)
    .sort((a, b) => totalDistanceKm(a, startLocation, endLocation) - totalDistanceKm(b, startLocation, endLocation))

  // Always test both the generated order and the Haversine local optimum, then
  // fill the remaining budget with the best geographically plausible orders.
  const candidates = []
  const seen = new Set()
  for (const order of [entries, fallbackOrder, ...allOrders]) {
    const key = order.map((entry) => entry.place.id).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(order)
    if (candidates.length >= Math.max(2, candidateLimit)) break
  }

  // Preflight the current route first. If the provider is unavailable or the
  // waypoints cannot be snapped to roads, avoid flooding it with alternatives
  // and immediately return the safe geographic fallback.
  const originalDetails = await fetchRouteDetails(routePoints(candidates[0], startLocation, endLocation))
  if (!originalDetails) return { ...fallback, routeDetails: null, usedRoadRouting: false }

  const remainder = await mapWithConcurrency(candidates.slice(1), concurrency, async (order) => {
    const details = await fetchRouteDetails(routePoints(order, startLocation, endLocation))
    return details ? { order, details } : null
  })
  const routed = [{ order: candidates[0], details: originalDetails }, ...remainder]
  const viable = routed.filter(Boolean)
  if (!viable.length) return { ...fallback, routeDetails: null, usedRoadRouting: false }

  viable.sort((a, b) => {
    const durationA = a.details.durationSeconds ?? Infinity
    const durationB = b.details.durationSeconds ?? Infinity
    if (durationA !== durationB) return durationA - durationB
    return (a.details.distanceMeters ?? Infinity) - (b.details.distanceMeters ?? Infinity)
  })
  const best = viable[0]
  const originalRoadKm = routed[0]?.details?.distanceMeters != null
    ? routed[0].details.distanceMeters / 1000
    : fallback.before
  const bestRoadKm = (best.details.distanceMeters ?? 0) / 1000
  const rebound = best.order.map((entry, index) => ({ ...entry, slot: slots[index] }))
  return {
    entries: rebound,
    before: originalRoadKm,
    after: bestRoadKm,
    improvedKm: Math.max(0, originalRoadKm - bestRoadKm),
    routeDetails: best.details,
    usedRoadRouting: true,
  }
}
