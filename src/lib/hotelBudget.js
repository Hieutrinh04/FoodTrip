import { nightlyPriceOf } from './roomTypes.js'

// Hotel prices against a trip budget. Kept apart from hotelSearch.js, which
// reaches the network, so it can be tested on its own.

// The share of a trip's budget that goes on the room. The rest pays for
// the food — the point of the trip — getting around, and tickets. At 35%, a
// two-person weekend on 1.5M each leaves ~1.05M for the night's room and
// ~1M a head for everything else.
export const LODGING_SHARE = 0.35
// Rooms under half the nightly budget are "better value" rather than "right
// in your budget": cheaper than the traveller planned to spend.
const VALUE_BELOW = 0.5

/**
 * What the party can spend on one night's room, in VND. The trip budget is per
 * person for the whole trip, so it is multiplied by the party size, cut to the
 * lodging share, and spread over the nights (a 2-day trip is 1 night).
 */
export function nightlyRoomBudget({ budgetPerPerson, people = 1, duration = 1 }) {
  const nights = Math.max(1, (duration ?? 1) - 1)
  const total = (budgetPerPerson || 0) * Math.max(1, people || 1)
  return Math.round((total * LODGING_SHARE) / nights / 1000) * 1000
}

/** Where a price sits against the nightly budget. */
export function budgetTier(price, nightlyBudget) {
  if (price == null || !nightlyBudget) return 'unknown'
  if (price > nightlyBudget) return 'premium'
  return price < nightlyBudget * VALUE_BELOW ? 'value' : 'match'
}
export const TIER_ORDER = { match: 0, value: 1, unknown: 2, premium: 3 }

/**
 * Groups hotels against what the party can spend on a night's room, by the
 * same nightly price each card shows: "match" up to that amount, "value" under
 * half of it, "premium" over it, "unknown" with no price at all. It used to
 * work from broad price bands, and the middle band ran from 500k to 1.5M a
 * night — so 1.49M rooms were "right in your budget" for a trip whose whole
 * budget was 1.5M a head.
 */
export function groupHotelsByBudgetTier(hotels, nightlyBudget) {
  const groups = { match: [], value: [], premium: [], unknown: [] }
  for (const hotel of hotels) groups[budgetTier(nightlyPriceOf(hotel), nightlyBudget)].push(hotel)
  return groups
}
