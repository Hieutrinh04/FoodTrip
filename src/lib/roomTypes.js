// Room types come from one of two places.
//
// When the hotel was priced by Hotelbeds, they are real: real room names, the
// real quoted rate, the real board (room-only / bed & breakfast), the real
// free-cancellation deadline and the real remaining allotment. Those arrive
// already shaped on `hotel.rooms` from the hotel-availability Edge Function.
//
// Otherwise there is no per-room inventory to read — neither Track-Asia nor
// Google Maps exposes one — so rooms are derived deterministically from the
// hotel's id and price band. The same hotel always yields the same rooms and
// prices, but nothing real sits behind them. That is a documented
// simplification, not a bug: a genuine booking engine for those hotels would
// need a hotel-partner contract FoodTrip doesn't have.

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

// Hotelbeds names a board on every rate; "room only" is the default and adds
// nothing worth a line on the card.
const BOARD_LABEL = {
  'BED AND BREAKFAST': { vi: 'Đã gồm ăn sáng', en: 'Breakfast included' },
  'HALF BOARD': { vi: 'Gồm ăn sáng và một bữa chính', en: 'Half board' },
  'FULL BOARD': { vi: 'Gồm ba bữa', en: 'Full board' },
  'ALL INCLUSIVE': { vi: 'Trọn gói', en: 'All inclusive' },
}

export function boardLabel(board) {
  return BOARD_LABEL[String(board || '').toUpperCase()] ?? null
}

/** Real Hotelbeds rooms, shaped like the simulated ones so callers don't branch. */
function realRoomTypes(hotel) {
  return hotel.rooms.map((room, index) => ({
    // Hotelbeds room codes repeat across properties, so the hotel id stays in
    // the key that the booking page selects on.
    id: `${hotel.id}-${room.code ?? index}`,
    key: String(room.code ?? index),
    // Hotelbeds publishes one English room name; there is no Vietnamese
    // translation to show, and inventing one would misname the room.
    name: { vi: room.name, en: room.name },
    capacity: room.capacity,
    amenities: room.amenities ?? [],
    pricePerNight: room.pricePerNight,
    roomsLeft: room.roomsLeft ?? null,
    board: room.board ?? null,
    freeCancellationUntil: room.freeCancellationUntil ?? null,
    real: true,
  }))
}

/** Returns the hotel's room types — real ones when Hotelbeds quoted them, otherwise 3 deterministic ones. */
export function getRoomTypesForHotel(hotel) {
  if (hotel?.rooms?.length) return realRoomTypes(hotel)

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
      board: null,
      freeCancellationUntil: null,
      real: false,
    }
  })
}

export function getRoomType(hotel, roomKey) {
  return getRoomTypesForHotel(hotel).find((r) => r.key === roomKey) ?? null
}

/**
 * The nightly price a hotel card leads with — the cheapest room, real or
 * estimated. A card showing only a vague band ("Giá rẻ (ước tính)") gives a
 * traveller nothing to compare against their budget, so every hotel gets a
 * number; whether it is a quoted tariff is said separately.
 */
export function cheapestPricePerNight(hotel) {
  const rooms = getRoomTypesForHotel(hotel)
  return rooms.length ? Math.min(...rooms.map((room) => room.pricePerNight)) : null
}
