export const MAX_PHOTOS = 4
export const MAX_INPUT_BYTES = 10 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function text(value, min, max) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (result.length < min || result.length > max) throw new Error('invalid-content')
  return result
}

export function coordinates(lat, lng) {
  if (lat == null || lng == null || String(lat).trim() === '' || String(lng).trim() === '') throw new Error('invalid-location')
  const point = { lat: Number(lat), lng: Number(lng) }
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) throw new Error('invalid-location')
  return point
}

export function postPayload(draft) {
  return {
    author_name: text(draft.author_name, 2, 60), body: text(draft.body, 1, 3000),
    place_name: text(draft.place_name, 2, 200), address: text(draft.address, 2, 500),
    ...coordinates(draft.lat, draft.lng),
  }
}

export function commentPayload(draft) {
  return { author_name: text(draft.author_name, 2, 60), body: text(draft.body, 1, 1000) }
}

export function validatePhoto(file) {
  if (!PHOTO_TYPES.includes(file?.type) || !(file.size > 0) || file.size > MAX_INPUT_BYTES) throw new Error('invalid-photo')
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')
}

// A cursor comes only from database rows, but validating it also prevents query grammar injection.
export function olderThan(cursor) {
  if (!cursor) return null
  if (!isUuid(cursor.id) || !/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(cursor.created_at)) throw new Error('invalid-cursor')
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
}
