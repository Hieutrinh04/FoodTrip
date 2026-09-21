const ROOM_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{32,160}$/
const MEMBER_NAME_KEY = 'foodtrip-live-member-name'

const MEMBER_COLORS = ['#d8481f', '#2f5d4e', '#2e86d8', '#9b51e0', '#c27a00', '#007f73', '#c33c74', '#4958b5']

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('') || `${Date.now()}-${Math.random()}`
}

export function createLiveRoomToken() {
  return `${randomId()}-${randomId()}`.replaceAll('-', '')
}

export function normalizeLiveRoomToken(value) {
  const token = String(value ?? '').trim()
  return ROOM_TOKEN_PATTERN.test(token) ? token : null
}

export function liveRoomChannelName(roomToken) {
  const token = normalizeLiveRoomToken(roomToken)
  return token ? `foodtrip-live:${token}` : null
}

export function cleanMemberName(value, fallback = 'Thành viên') {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return name || fallback
}

function memberColor(id) {
  let hash = 0
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length]
}

export function createLiveMemberIdentity(roomToken, suggestedName) {
  const storageKey = `foodtrip-live-member:${roomToken}`
  let id = null
  let storedName = null
  try {
    id = sessionStorage.getItem(storageKey)
    storedName = localStorage.getItem(MEMBER_NAME_KEY)
  } catch {
    // Storage can be disabled in privacy mode; a memory-only identity is fine.
  }
  if (!id) {
    id = randomId()
    try {
      sessionStorage.setItem(storageKey, id)
    } catch {
      // Keep the generated id for this page session.
    }
  }
  const fallback = `Thành viên ${id.replaceAll('-', '').slice(-4).toUpperCase()}`
  const name = cleanMemberName(storedName || suggestedName, fallback)
  return { id, name, color: memberColor(id) }
}

export function rememberLiveMemberName(value) {
  const name = cleanMemberName(value)
  try {
    localStorage.setItem(MEMBER_NAME_KEY, name)
  } catch {
    // The room still works when persistent browser storage is unavailable.
  }
  return name
}

function normalizeLocation(value) {
  const lat = Number(value?.lat)
  const lng = Number(value?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return {
    lat,
    lng,
    accuracy: Number.isFinite(Number(value.accuracy)) ? Math.max(0, Number(value.accuracy)) : null,
    heading: Number.isFinite(Number(value.heading)) ? Number(value.heading) : null,
    speed: Number.isFinite(Number(value.speed)) ? Math.max(0, Number(value.speed)) : null,
  }
}

export function normalizePresenceMember(value, fallbackId = '') {
  const id = String(value?.id || fallbackId).slice(0, 100)
  if (!id) return null
  const color = /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color : memberColor(id)
  const location = normalizeLocation(value?.location)
  return {
    id,
    name: cleanMemberName(value?.name, `Thành viên ${id.slice(-4).toUpperCase()}`),
    color,
    sharing: Boolean(value?.sharing && location),
    location,
    updatedAt: Number.isFinite(Number(value?.updatedAt)) ? Number(value.updatedAt) : Date.now(),
  }
}

/** Converts Supabase Presence's keyed arrays into one latest record per member. */
export function flattenPresenceState(presenceState) {
  const latest = new Map()
  for (const [presenceKey, entries] of Object.entries(presenceState ?? {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const member = normalizePresenceMember(entry, presenceKey)
      if (!member) continue
      const previous = latest.get(member.id)
      if (!previous || member.updatedAt >= previous.updatedAt) latest.set(member.id, member)
    }
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name))
}
