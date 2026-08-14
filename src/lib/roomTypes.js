// Google Places has no per-room pricing/inventory API, so room types and
// nightly prices are derived deterministically from each hotel's Google
// place id + price level instead of coming from a real property-management
// system — the same hotel always yields the same rooms/prices, but there is
// no real inventory behind them. This is a documented simplification, not a
// bug: a genuine booking engine would need a hotel-partner contract FoodTrip
// doesn't have.

export const AMENITY_LABEL = {
  wifi: { vi: 'Wifi miễn phí', en: 'Free wifi' },
  ac: { vi: 'Điều hoà', en: 'Air conditioning' },
  breakfast: { vi: 'Bao gồm ăn sáng', en: 'Breakfast included' },
  bathtub: { vi: 'Bồn tắm', en: 'Bathtub' },
  cityview: { vi: 'View thành phố', en: 'City view' },
}

const ROOM_TEMPLATES = [
  { key: 'standard', name: { vi: 'Phòng Standard', en: 'Standard Room' }, capacity: 2, priceFactor: 1, amenities: ['wifi', 'ac'] },
  { key: 'deluxe', name: { vi: 'Phòng Deluxe', en: 'Deluxe Room' }, capacity: 2, priceFactor: 1.6, amenities: ['wifi', 'ac', 'breakfast', 'cityview'] },
  { key: 'family', name: { vi: 'Phòng Gia Đình', en: 'Family Room' }, capacity: 4, priceFactor: 2.2, amenities: ['wifi', 'ac', 'breakfast', 'bathtub'] },
]

const PRICE_LEVEL_BASE = {
  PRICE_LEVEL_FREE: 250000,
  PRICE_LEVEL_INEXPENSIVE: 350000,
  PRICE_LEVEL_MODERATE: 700000,
  PRICE_LEVEL_EXPENSIVE: 1400000,
  PRICE_LEVEL_VERY_EXPENSIVE: 2800000,
}

function seededRandom(seedStr) {
  let seed = 0
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
  if (seed === 0) seed = 1
  return () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
}

/** Returns 3 deterministic room types (name, capacity, amenities, price/night, rooms left) for a hotel. */
export function getRoomTypesForHotel(hotel) {
  const base = PRICE_LEVEL_BASE[hotel.priceLevel] ?? PRICE_LEVEL_BASE.PRICE_LEVEL_MODERATE
  const rand = seededRandom(hotel.id)
  return ROOM_TEMPLATES.map((tpl) => {
    const jitter = 0.9 + rand() * 0.2 // ±10%, keeps prices from looking too templated
    const pricePerNight = Math.round((base * tpl.priceFactor * jitter) / 10000) * 10000
    const roomsLeft = 3 + Math.floor(rand() * 5) // 3-7 "rooms left"
    return {
      id: `${hotel.id}-${tpl.key}`,
      key: tpl.key,
      name: tpl.name,
      capacity: tpl.capacity,
      amenities: tpl.amenities,
      pricePerNight,
      roomsLeft,
    }
  })
}

export function getRoomType(hotel, roomKey) {
  return getRoomTypesForHotel(hotel).find((r) => r.key === roomKey) ?? null
}
