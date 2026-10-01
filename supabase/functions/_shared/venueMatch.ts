import { CITY_ALIASES, GENERIC_WORDS, normalizeSearchText, primaryName, secondarySegments } from './relevance.ts'

/**
 * Deciding whether a discovered video, post or article is about one venue.
 *
 * A web search for a venue's name returns everything that shares a word with
 * it: a laptop called Helios, another café that is "yên tĩnh" and good for
 * "study", the same dish at another branch. One rule applies to every venue
 * alike — the text must name it, must not give an address elsewhere, and must
 * carry at least two independent pieces of evidence that point at this venue,
 * at least one of them more than a place name.
 */

export type Venue = {
  /** The name as listed, SEO segments and all: "Helios - Tiệm Ăn Hàn Quốc - Thủ Dầu Một". */
  name: string
  /** The formatted address: "172/8 Trần Văn Ơn, Phú Lợi, Hồ Chí Minh, Việt Nam". */
  address?: string
  /** The city or "<ward>, <city>" the search was scoped to. */
  area?: string
}

export type Candidate = {
  /** Where the venue's name must appear: a video title, a caption, a headline plus snippet. */
  title: string
  /** Further text that can carry evidence but not the name: a video description. */
  body?: string
  url?: string
  /** Channel or account name. */
  author?: string
}

export type Evidence = 'name' | 'street' | 'account' | 'listing' | 'locality'

const ADMIN_PREFIX = /^(thanh pho|tp|tinh|quan|huyen|thi xa|thi tran|phuong|xa|p|q) /
const ADMIN_WORDS = new Set(['thanh', 'pho', 'tp', 'tinh', 'quan', 'huyen', 'thi', 'xa', 'tran', 'phuong', 'p', 'q', 'duong', 'd'])
const COUNTRY = new Set(['viet nam', 'vietnam', 'vn'])
// A house number, possibly behind "số", "hẻm", "kiệt", "ngõ", "lô": "172/8", "05", "116A", "K24".
const HOUSE_NUMBER = /^(?:(?:so|hem|kiet|ngo|ngach|lo|can|k) )?((?:[a-z]?\d+[a-z]?\d* )+)/
const STREET_PREFIX = /^(?:duong|d|pho|p) /
// "địa chỉ", "đc", "ở số", "cs2", "chi nhánh 2" … then a house number and a street.
const ADDRESS_CUE = / (?:dia chi|dc|d c|address|o so|tai so|cs ?\d|cn ?\d|co so(?: \d)?|chi nhanh(?: \d)?) ((?:[a-z]?\d+[a-z]?\d* )+)(?:(?:duong|d|pho|p) )?((?:[a-z]+ ?){0,2})/g
// Parts a venue's own handle may be made of besides its name and places:
// "ikoi" + "coffee" + "cantho", "…official".
const HANDLE_FILLER = ['official', 'vietnam', 'nhahang', 'restaurant', 'cafe', 'quan', 'tiem', 'an', 'vn']
// New ward names put a direction before the city: "Tây Nha Trang".
const DIRECTION = /^(?:tay|dong|nam|bac) (?=\S+ \S+)/
const URL_SEGMENTS_NOT_ACCOUNTS = new Set(['reel', 'reels', 'p', 'tv', 'watch', 'video', 'videos', 'groups', 'media', 'photo', 'photos', 'posts', 'profile php', 'share', 'story php', 'permalink php', 'vi vn', 'en', 'vi'])

// Words that say what kind of place a name belongs to — "Quán Cẩm", "IKOI
// Coffee". Deliberately not "nhà" or "cà" alone, which begin everyday words.
const KINDS_OF_PLACE = ['quan', 'tiem', 'nha hang', 'ca phe', 'cafe', 'coffee', 'restaurant', 'bar', 'shop', 'store', 'bistro', 'eatery', 'kitchen', 'bakery', 'house']

const phrase = (text: string) => ` ${normalizeSearchText(text)} `
const stripZeros = (number: string) => number.replace(/^0+(?=\d)/, '')

/**
 * The street and house number of a formatted address, normalised:
 * "172/8 Trần Văn Ơn, …" → { street: "tran van on", number: "172" }.
 * No street when the first part is not a named street ("Hẻm 116A Đ.3/2").
 */
export function streetOf(address: string) {
  const first = normalizeSearchText((address || '').split(',')[0] ?? '')
  const match = first.match(HOUSE_NUMBER)
  const street = first.slice(match ? match[0].length : 0).replace(STREET_PREFIX, '').trim()
  const words = street.split(' ').filter(Boolean)
  const named = street.length > 0 && !/\d/.test(street) &&
    (words.length >= 2 || (words[0]?.length >= 5 && !GENERIC_WORDS.has(words[0]) && !ADMIN_WORDS.has(words[0])))
  if (!named) return { street: null, number: null }
  return { street, number: match ? stripZeros(match[1].trim().split(' ')[0]) : null }
}

/** Ward, district and city of the venue, each on its own, as normalised phrases. */
function localitiesOf(venue: Venue) {
  const [, ...rest] = (venue.address ?? '').split(',')
  const parts = [...rest, ...(venue.area ?? '').split(',')]
    .flatMap((part) => part.split(/\s+-\s+/))
    .map((part) => normalizeSearchText(part.replace(/\b\d{4,}\b/g, '')).replace(ADMIN_PREFIX, ''))
    .flatMap((part) => (DIRECTION.test(part) ? [part, part.replace(DIRECTION, '')] : [part]))
    .filter((part) => part.length >= 3 && !/\d/.test(part) && !COUNTRY.has(part))
  return [...new Set(parts)]
}

const localityAliases = (venue: Venue) => localitiesOf(venue).flatMap((place) => CITY_ALIASES[place] ?? [place])

/**
 * The venue's own name, normalised, without a trailing place name: "Mê ốc Hải
 * Phòng" is written "Mê Ốc" as often as not, and Hải Phòng is evidence of its
 * own. Kept whole if nothing else would remain.
 */
function nameCore(venue: Venue) {
  let tokens = normalizeSearchText(primaryName(venue.name)).split(' ').filter(Boolean)
  for (const place of localityAliases(venue).sort((a, b) => b.length - a.length)) {
    const tail = place.split(' ')
    const endsWithPlace = tokens.length > tail.length && tail.every((token, i) => tokens[tokens.length - tail.length + i] === token)
    if (endsWithPlace) tokens = tokens.slice(0, tokens.length - tail.length)
  }
  return tokens.join(' ')
}

/** The words of the name that identify it — generic ones ("quán", "cà phê") and numbers dropped. */
function identifyingWords(core: string) {
  return [...new Set(core.split(' ').filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !GENERIC_WORDS.has(t)))]
}

/** Run together for comparing with handles, with the spellings of "café" made one. */
function compact(text: string) {
  return normalizeSearchText(text).replace(/ /g, '').replace(/caphe|coffee/g, 'cafe').replace(/\d+/g, '')
}

/**
 * Whether the text names the venue at all. The name as one phrase always
 * does. A name with two or more identifying words may also be written in any
 * order. A one-word name must come with what the place is — "Quán Cẩm",
 * "IKOI Coffee" — and not as a stray syllable of another word.
 */
function mentionsVenue(title: string, venue: Venue) {
  const core = nameCore(venue)
  const haystack = phrase(title)
  if (haystack.includes(` ${core} `)) return true
  const words = identifyingWords(core)
  if (words.length >= 2) return words.every((word) => haystack.includes(` ${word} `))
  if (words.length === 1) {
    const kinds = KINDS_OF_PLACE.join('|')
    return new RegExp(` (?:${kinds}) ${words[0]} | ${words[0]} (?:${kinds}) `).test(haystack)
  }
  return false
}

/**
 * Whether the name occurs as the venue's whole name rather than the start of
 * a longer one: "ghé Quán Ốc Vũ Hồng Hạnh" is another restaurant. In ordinary
 * sentence case, a capitalised word straight after the name continues it —
 * unless punctuation separates them or it belongs to the address or listing.
 * Where the words around the name are capitalised anyway (a Title Case or
 * ALL CAPS headline), capitals say nothing and the name is taken as given.
 */
function nameStandsAlone(text: string, venue: Venue, core: string) {
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)]
    .map((m) => ({ word: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, norm: normalizeSearchText(m[0]) }))
    .filter((w) => w.norm)
  const name = core.split(' ')
  const { street } = streetOf(venue.address ?? '')
  const partOfVenue = new Set([
    ...ADMIN_WORDS, ...GENERIC_WORDS, ...secondarySegments(venue.name).flat(),
    ...localityAliases(venue).join(' ').split(' '), ...(street ?? '').split(' '),
  ])
  const capitalised = (w: { word: string }) => /^\p{Lu}/u.test(w.word)
  const allCaps = (w: { word: string }) => w.word === w.word.toUpperCase() && /\p{L}/u.test(w.word)
  const joined = (a: { end: number }, b: { start: number }) => !/[^\s]/.test(text.slice(a.end, b.start))

  for (let i = 0; i + name.length <= words.length; i++) {
    if (!name.every((token, j) => words[i + j].norm === token)) continue
    const first = words[i]
    const last = words[i + name.length - 1]
    const next = words[i + name.length]
    const prev = words[i - 1]
    if (!next || !joined(last, next) || !capitalised(next) || partOfVenue.has(next.norm)) return true
    // Headline casing: the name in capitals, or the word before it capitalised
    // mid-sentence (not the first word of a sentence).
    const prevStartsSentence = !prev || /[.!?|•:\n]/.test(text.slice((words[i - 2]?.end ?? 0), prev.start)) || i === 1
    if (name.every((_, j) => allCaps(words[i + j]))) return true
    if (prev && joined(prev, first) && capitalised(prev) && !prevStartsSentence && !partOfVenue.has(prev.norm)) return true
  }
  return false
}

/** The account a post or video belongs to: its channel name and the handle in its URL. */
function accountsOf(candidate: Candidate) {
  const accounts = [candidate.author ?? '']
  try {
    const segment = new URL(candidate.url ?? '').pathname.split('/').filter(Boolean)[0] ?? ''
    if (!URL_SEGMENTS_NOT_ACCOUNTS.has(normalizeSearchText(segment))) accounts.push(segment.replace(/^@/, ''))
  } catch { /* no URL */ }
  return accounts.map(compact).filter(Boolean)
}

/** #tags and @mentions in the text — people tag the place they review. */
function tagsIn(candidate: Candidate) {
  return [...`${candidate.title} ${candidate.body ?? ''}`.matchAll(/[#@]([\p{L}\p{N}_.]+)/gu)].map((m) => compact(m[1])).filter(Boolean)
}

/**
 * Whether a handle is the venue's: it holds every identifying word of the
 * name and nothing but those, the kind of place, the venue's places and
 * listing, or a plain suffix — "yenstudycafe", "ikoicoffeecantho",
 * "quancambunbohue". Anything else left over makes it another business
 * ("nhahangtrunghoathaitue") or a fan page. Returns whether it also named a
 * place or listing part beyond the name itself.
 */
function matchHandle(handle: string, venue: Venue, core: string) {
  const words = identifyingWords(core).map(compact).filter(Boolean)
  const whole = compact(core)
  // At least as long as the name run together, so a bare "#voi" is not "Cà phê Với".
  if (!words.length || whole.length < 6 || handle.length < whole.length || !words.every((word) => handle.includes(word))) return null
  const extras = [
    ...secondarySegments(venue.name).map((tokens) => compact(tokens.join(' '))),
    ...localityAliases(venue).map(compact),
  ].filter((part) => part.length >= 3 && !whole.includes(part))
  const parts = [...words, ...HANDLE_FILLER, ...core.split(' ').map(compact), ...extras]
    .filter((part) => part.length >= 2).sort((a, b) => b.length - a.length)
  let rest = handle
  for (const part of parts) rest = rest.split(part).join('')
  if (rest.length) return null
  return { beyondName: extras.some((part) => handle.includes(part)) }
}

/**
 * Whether the venue posted it, or it is tagged with the venue. The account
 * behind a post is independent of its text, so a matching account counts on
 * its own. A tag is written by the same hand as the text: one that only
 * repeats the name adds nothing ("#NhaHangTrungHoa9" under "Nhà hàng Trung
 * Hoa mùa 9", a TV show), so a tag counts only when it also carries the
 * venue's place or another part of its listing (#tiemanbepdalat).
 */
function postedByVenue(candidate: Candidate, venue: Venue, core: string) {
  if (accountsOf(candidate).some((handle) => matchHandle(handle, venue, core))) return true
  return tagsIn(candidate).some((tag) => matchHandle(tag, venue, core)?.beyondName)
}

/** Whether the text gives this venue's house number and street. */
function givesItsAddress(haystack: string, venue: Venue) {
  const { street, number } = streetOf(venue.address ?? '')
  if (!street || !number) return false
  return new RegExp(` 0*${number}(?: [a-z]?\\d+[a-z]?\\d*)* (?:(?:duong|d|pho|p) )?${street} `).test(haystack)
}

/**
 * Whether the text gives an address, and it is somewhere else: another
 * branch ("cs2 - 104B1 Thành Công") or another shop of the same name ("ở số 40
 * Nhiêu Tứ"). A post listing several places that includes this one's address
 * is not held against it, nor is a name that is itself an address ("Bánh
 * Cuốn 101 Bà Triệu").
 */
function givesAnotherAddress(haystack: string, venue: Venue) {
  const { street, number } = streetOf(venue.address ?? '')
  if (!street || givesItsAddress(haystack, venue)) return false
  const name = phrase(venue.name)
  let ours = false
  let elsewhere = false
  for (const match of haystack.matchAll(ADDRESS_CUE)) {
    const cuedNumber = stripZeros(match[1].trim().split(' ')[0])
    const cuedStreet = match[2].trim()
    if (name.includes(` ${cuedNumber} `)) continue // the name itself holds an address
    // Same street, or our number with the street cut off ("CS1: 114 …").
    if ((cuedStreet && street.startsWith(cuedStreet)) || (number && cuedNumber === number)) ours = true
    else if (cuedStreet.split(' ').length === 2) elsewhere = true
  }
  return elsewhere && !ours
}

/**
 * What in a search result points at this venue. Each kind counts once:
 *
 * - name     — its whole name as one phrase, not the start of a longer name,
 *              when the name has at least two identifying words. A one-word
 *              name ("Helios", "Với") is shared with too much to count.
 * - street   — its house number and street (the street alone when its
 *              address has no number).
 * - account  — posted by the venue's own account.
 * - listing  — another part of its name as Google Maps lists it ("Tiệm Ăn
 *              Hàn Quốc" in "Helios - Tiệm Ăn Hàn Quốc - Thủ Dầu Một").
 * - locality — its ward, district or city; or its street without the number,
 *              which a whole row of shops shares.
 */
export function venueEvidence(candidate: Candidate, venue: Venue): Evidence[] {
  const text = `${candidate.title} ${candidate.body ?? ''}`
  const haystack = phrase(text)
  const has = (words: string) => words.length > 0 && haystack.includes(` ${words} `)
  const core = nameCore(venue)
  const { street, number } = streetOf(venue.address ?? '')
  const found = new Set<Evidence>()

  if (identifyingWords(core).length >= 2 && has(core) && nameStandsAlone(text, venue, core)) found.add('name')
  if (givesItsAddress(haystack, venue)) found.add('street')
  // Without the number a street is shared by a whole row of shops — unless
  // the venue's address has no number to give.
  else if (street && has(street)) found.add(number ? 'locality' : 'street')
  if (postedByVenue(candidate, venue, core)) found.add('account')
  if (secondarySegments(venue.name).some((tokens) => tokens.every((token) => has(token)))) found.add('listing')
  if (localityAliases(venue).some(has)) found.add('locality')
  return [...found]
}

/** The one test every discovered video, post and article goes through, the same for every venue. */
export function isAboutVenue(candidate: Candidate, venue: Venue) {
  if (!mentionsVenue(candidate.title, venue)) return false
  if (givesAnotherAddress(phrase(`${candidate.title} ${candidate.body ?? ''}`), venue)) return false
  const evidence = venueEvidence(candidate, venue)
  return evidence.length >= 2 && evidence.some((kind) => kind !== 'locality')
}
