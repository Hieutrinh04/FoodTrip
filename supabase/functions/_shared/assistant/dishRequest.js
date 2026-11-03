// Shared sentence grammar, not an enumeration of individual dishes. Food-word
// families constrain the short noun phrase so arbitrary queries and
// destinations alone never become dishes.
import { plain } from '../placeNames.js'
import { citiesIn } from '../captionSignals.js'

const FOOD_HEAD = /^(?:bun|banh|nem|cha|tra|goi|com|che|chao|mi|my|hu tieu|cao lau|hai san|lau|oc|xoi|sup|soup|bo|ga|vit|de|ca|tom|cua|muc|hen|kem|sua chua|ca phe|cafe|coffee|seafood)(?: |$)/
const OTHER_REQUEST = /\b(thoi tiet|weather|du bao|len lich|lich trinh|ke hoach|ngan sach|huy|hoan tien|cancel|refund|dat phong|khach san|hotel|thanh toan|tour|video|review|tiktok|youtube|dia chi|gio mo cua|may gio|co ngon khong|gia bao nhieu|cach nau|cong thuc|la (?:mon )?gi|co dat khong)\b/
const NEARBY = /\s+(?:gần đây|gan day|gần tôi|gan toi|quanh đây|quanh day|near me|nearby)$/i

export const isDishExplanation = (message) => /\b(?:la (?:mon )?gi|co dat khong)\b/.test(plain(message))
export const blocksDishSearch = (message) => OTHER_REQUEST.test(plain(message))
export const asksNearbyFood = (message) => NEARBY.test(String(message).trim().replace(/[?!.]+$/, ''))
export const isAmbiguousDishSearch = (message) => /^(?:pho|phố)(?:\s|$)/i.test(stripPrefixes(String(message).normalize('NFC').trim()))

function stripPrefixes(text) {
  return text.replace(/^(?:cho (?:mình|minh|tôi|toi|em) (?:hỏi|hoi|xin)|(?:hôm nay|hom nay)(?: (?:mình|minh|tôi|toi))? (?:ăn|an)|(?:mình|minh|tôi|toi) muốn ăn)\s*[, :]?\s*/i, '')
    .replace(/^(?:(?:tìm|tim)\s+)?(?:(?:quán|quan|món|mon|ăn|an|chỗ|cho)\s+)+/i, '')
}

function knownArea(text) {
  const area = plain(text)
  const cities = citiesIn(area)
  // citiesIn finds aliases anywhere; require the whole suffix to name a city,
  // rather than accepting "Hà Nội thì sao" as a destination.
  return cities.some((city) => {
    const name = plain(city)
    if (area === name || area.replaceAll(' ', '') === name.replaceAll(' ', '')) return true
    return name === 'tp ho chi minh' && /^(?:tp hcm|tphcm|hcm|hcmc|sai gon|saigon|ho chi minh|thanh pho ho chi minh)$/.test(area)
      || name === 'ha noi' && area === 'hn'
  })
}

function foodPhrase(text) {
  const dish = text.replace(/\s+ngon$/i, '').trim()
  const normalized = plain(dish)
  if (!dish || dish.split(/\s+/).length > 5 || /\d/.test(dish)) return null
  if (citiesIn(dish).length || /\b(?:gi|nao|dau|sao|thi|la|co|khong|rat|muon|toi|minh|hom|nay|ngay|di|an|uong|mon|quan)\b/.test(normalized)) return null
  // Bare unaccented "pho" can mean phở or phố: do not guess. An explicit
  // accented phở is safe; "phố" and unaccented "pho co" never qualify.
  if (/^pho(?: |$)/.test(normalized)) return /^phở(?:\s|$)/i.test(dish) ? dish : null
  return FOOD_HEAD.test(normalized) ? dish : null
}

export function dishLedSearch(message) {
  let text = String(message).normalize('NFC').trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ')
  if (blocksDishSearch(text)) return null
  // Strip only conversational/eating prefixes, retaining the original noun's accents.
  text = stripPrefixes(text)
  if (asksNearbyFood(text)) return foodPhrase(text.replace(NEARBY, ''))
  const located = text.match(/^(.+?)\s+(?:ở|o|tại|tai|in)\s+(.+)$/i)
  if (located) return knownArea(located[2]) ? foodPhrase(located[1]) : null
  const words = text.split(' ')
  // Longest destination suffix first, so compound city names stay together.
  for (let at = 1; at < words.length; at++) {
    if (knownArea(words.slice(at).join(' '))) return foodPhrase(words.slice(0, at).join(' '))
  }
  return null
}
