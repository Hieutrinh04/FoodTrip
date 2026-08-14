import { CITIES } from '../data/destinations.js'
import { supabase, hasSupabase } from './supabaseClient.js'

const THEME_TO_CITIES = {
  'biển': ['phuquoc', 'nhatrang', 'danang', 'phanthiet'],
  'beach': ['phuquoc', 'nhatrang', 'danang', 'phanthiet'],
  'nui': ['sapa', 'dalat'],
  'núi': ['sapa', 'dalat'],
  'mountain': ['sapa', 'dalat'],
  'pho co': ['hoian', 'hue'],
  'phố cổ': ['hoian', 'hue'],
  'old town': ['hoian', 'hue'],
  'di san': ['ninhbinh', 'hue', 'hoian'],
  'di sản': ['ninhbinh', 'hue', 'hoian'],
  'song nuoc': ['cantho'],
  'sông nước': ['cantho'],
  'miet vuon': ['cantho'],
  'miệt vườn': ['cantho'],
  'delta': ['cantho'],
  'ca phe': ['dalat'],
  'cà phê': ['dalat'],
  'coffee': ['dalat'],
}

export function normalizeVi(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
}

/**
 * Resolves a free-text destination description to either a curated city
 * (exact name match or thematic keyword match, e.g. "biển" -> a beach city)
 * or flags it as a custom destination name to run through the live
 * Google Places city search instead.
 */
export function resolveDestinationQuery(query) {
  if (!query?.trim()) return null
  const norm = normalizeVi(query)

  const cityMatch = CITIES.find((ci) => {
    const nameVi = normalizeVi(ci.name.vi)
    const nameEn = normalizeVi(ci.name.en)
    return norm.includes(nameVi) || nameVi.includes(norm) || norm.includes(nameEn) || nameEn.includes(norm)
  })
  if (cityMatch) return { type: 'curated', cityId: cityMatch.id }

  for (const [keyword, cityIds] of Object.entries(THEME_TO_CITIES)) {
    if (norm.includes(normalizeVi(keyword))) {
      return { type: 'curated', cityId: cityIds[0] }
    }
  }

  return { type: 'custom', name: query.trim() }
}

export async function parseTripRequestText(text) {
  if (!hasSupabase) return { error: 'missing-api-key' }
  const { data, error } = await supabase.functions.invoke('parse-trip-request', { body: { text } })
  if (error) throw new Error('parse-failed')
  return data
}
