import { supabase, hasSupabase } from './supabaseClient.js'

// Which hotels take bookings on FoodTrip. Only partner hotels with their own
// room inventory do — the database refuses a booking for any other — so every
// other search result is shown for reference, with links to book elsewhere.

/**
 * Hotel id → { name, address } as the partner registered it, for the hotels
 * among `ids` that can be booked here. Empty when it cannot be told (offline,
 * older database): nothing is then offered as bookable, which is the safe side.
 */
export async function bookableHotels(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))].slice(0, 300)
  if (!hasSupabase || !unique.length) return new Map()
  const { data, error } = await supabase.rpc('hotel_booking_status', { p_ids: unique })
  if (error) return new Map()
  return new Map((data ?? []).map((hotel) => [hotel.hotel_place_id, hotel]))
}

/** The hotels flagged `bookable`, bookable ones first (otherwise in the order given). */
export async function withBookable(hotels) {
  const partners = await bookableHotels(hotels.map((hotel) => hotel.id))
  return hotels
    .map((hotel) => ({ ...hotel, bookable: partners.has(hotel.id) }))
    .sort((a, b) => Number(b.bookable) - Number(a.bookable))
}

/** A partner record as the hotel cards and booking page read hotels. */
function asHotel(row, id = row.id ?? row.hotel_place_id) {
  return {
    id,
    name: row.name,
    address: row.address ?? '',
    location: row.lat != null && row.lng != null ? { lat: Number(row.lat), lng: Number(row.lng) } : null,
    photoUrl: row.photo_url ?? null,
    description: row.description ?? null,
    propertyType: row.property_type ?? null,
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    stars: row.star_rating || null,
    checkIn: row.check_in_time ?? null,
    checkOut: row.check_out_time ?? null,
    cancellation: row.cancellation_policy ?? null,
    houseRules: row.house_rules ?? null,
    rating: null,
    userRatingCount: null,
    priceFrom: row.price_from != null ? Number(row.price_from) : null,
    priceSource: row.price_from != null ? 'partner' : 'estimated',
    rooms: [],
    bookable: true,
  }
}

/** A partner hotel's own record, for a booking link opened without the search that found it. */
export async function partnerHotel(id) {
  const hotel = (await bookableHotels([id])).get(id)
  return hotel ? asHotel(hotel, id) : null
}

/**
 * Partner properties taking bookings near a point — including homestays no
 * search finds — nearest first, as hotel cards. Empty when it cannot be told.
 */
export async function partnerHotelsNear(location, radiusKm = 15) {
  if (!hasSupabase || location?.lat == null || location?.lng == null) return []
  const { data, error } = await supabase.rpc('partner_hotels_near', { p_lat: location.lat, p_lng: location.lng, p_radius_km: radiusKm })
  if (error) return []
  return (data ?? []).map((row) => asHotel(row))
}
