// What a video caption says about WHERE, read with rules instead of a trained
// model: the venue names it gives, an address, the city. detect-place uses it
// to search for the venue rather than for the whole caption, to skip the map
// search entirely when a caption names no venue ("10 món phải thử ở Hà Nội"),
// and to keep the search inside the right city. Plain JS: Deno and Node share it.
//
// Keywords are matched WITH their accents: without them "quận" reads as
// "quán" and "phố" as "phở".

import { canonical, plain, sameVenue } from './placeNames.js'

// Cities and provinces as people write them in captions (accents stripped).
const CITIES = [
  ['Hà Nội', 'ha noi', 'hanoi', 'hn', 'thu do'],
  ['TP. Hồ Chí Minh', 'ho chi minh', 'sai gon', 'saigon', 'tphcm', 'tp hcm', 'hcm', 'hcmc', 'thanh pho ho chi minh'],
  ['Đà Nẵng', 'da nang', 'danang'], ['Hội An', 'hoi an', 'hoian'], ['Huế', 'hue'], ['Nha Trang', 'nha trang', 'nhatrang', 'nah trang'],
  ['Đà Lạt', 'da lat', 'dalat'], ['Phú Quốc', 'phu quoc', 'phuquoc'], ['Cần Thơ', 'can tho', 'cantho'], ['Hải Phòng', 'hai phong'],
  ['Hạ Long', 'ha long', 'halong', 'quang ninh'], ['Sa Pa', 'sa pa', 'sapa', 'lao cai'], ['Ninh Bình', 'ninh binh', 'trang an', 'tam coc'],
  ['Vũng Tàu', 'vung tau'], ['Phan Thiết', 'phan thiet', 'mui ne', 'binh thuan'], ['Quy Nhơn', 'quy nhon', 'binh dinh'],
  ['Buôn Ma Thuột', 'buon ma thuot', 'dak lak'], ['Hà Giang', 'ha giang'], ['Mộc Châu', 'moc chau'], ['Côn Đảo', 'con dao'],
  ['Cát Bà', 'cat ba'], ['Tuy Hòa', 'tuy hoa', 'phu yen'], ['Đồng Hới', 'dong hoi', 'quang binh'], ['Vinh', 'nghe an'],
  ['Thanh Hóa', 'thanh hoa', 'sam son'], ['Bến Tre', 'ben tre'], ['Châu Đốc', 'chau doc', 'an giang'], ['Cà Mau', 'ca mau'],
  ['Bạc Liêu', 'bac lieu'], ['Sóc Trăng', 'soc trang'], ['Tây Ninh', 'tay ninh'], ['Bình Dương', 'binh duong', 'thu dau mot'],
  ['Biên Hòa', 'bien hoa', 'dong nai'], ['Pleiku', 'pleiku', 'gia lai'], ['Kon Tum', 'kon tum'], ['Quảng Ngãi', 'quang ngai'],
  ['Tam Đảo', 'tam dao'], ['Mai Châu', 'mai chau'], ['Rạch Giá', 'rach gia', 'kien giang'], ['Long Xuyên', 'long xuyen'],
].map(([name, ...aliases]) => ({ name, aliases }))
// Whole aliases, word by word: a city stops a name only as a whole ("Thanh Hóa"), so
// "Hoa" or "Đông" alone ("Cơm Hến Hoa Đông") still read as names.
const CITY_ALIASES = CITIES.flatMap((c) => c.aliases.map((a) => a.split(' ')))

// Words before a name that say it is a place you can go to (lower case, accented).
const TYPE_PHRASES = ['quán ăn', 'quán cà phê', 'quán cafe', 'quán cf', 'quán nướng', 'quán lẩu', 'quán ốc', 'quán cơm', 'quán bún', 'quán phở', 'quán hải sản', 'quán',
  'nhà hàng hải sản', 'nhà hàng', 'tiệm bánh', 'tiệm cà phê', 'tiệm cafe', 'tiệm', 'cửa hàng cafe', 'cửa hàng', 'cafe', 'café', 'cà phê', 'cf',
  'khách sạn', 'homestay', 'resort', 'hải sản', 'buffet rau', 'buffet', 'vựa cua', 'vựa hải sản', 'vựa', 'vua']
// After "cafe / cà phê": a drink, not a place.
const DRINKS = new Set(['trứng', 'muối', 'sữa', 'đá', 'đen', 'nâu', 'cốt', 'dừa', 'phin', 'chồn', 'bạc', 'sáng', 'ngon'])
// Words after a name that say the same in English (or "quán" after a name, in lower case).
const SUFFIXES = new Set(['coffee', 'cafe', 'café', 'restaurant', 'bistro', 'seafood', 'garden', 'kitchen', 'house', 'bar', 'skybar', 'roaster', 'bakery', 'hotel', 'homestay', 'resort', 'eatery', 'grill', 'buffet'])
// Dishes a venue is often named after: "Bánh Xèo 7 Tới", "Phở Thìn".
const DISHES = ['bánh xèo', 'bánh mì', 'bánh cuốn', 'bánh canh', 'bánh khoái', 'bánh ướt', 'bún chả', 'bún bò', 'bún riêu', 'bún đậu', 'bún', 'phở', 'cơm tấm', 'cơm niêu', 'cơm gà',
  'cơm hến', 'cơm', 'lẩu', 'chè', 'ốc', 'xôi', 'mì quảng', 'cao lầu', 'hủ tiếu', 'bánh tráng', 'chả cá', 'nem', 'gà', 'vịt', 'dê', 'bò', 'thắng cố']
// Honorifics that start a name in lower case: "chú 7 Tới", "bà Dưỡng", "cô Lợi".
const HONORIFICS = new Set(['chú', 'cô', 'bà', 'ông', 'anh', 'chị', 'dì', 'bác', 'o', 'mợ', 'cậu', 'thím'])
// Words that are description, not name (plain form) — they end a name.
const NOT_NAME = new Set(['ngon', 'dep', 'xinh', 're', 'noi', 'tieng', 'nhat', 'view', 'chill', 'hot', 'sieu', 'cuc', 'qua', 'thu', 'gan', 'o', 'tai', 'cua',
  'va', 'voi', 'cho', 'la', 'thi', 'nay', 'kia', 'nao', 'gi', 'khi', 'review', 'vlog', 'top', 'list', 'phai', 'nen', 'uong', 'den', 've', 'tu',
  'trong', 'ngoai', 'tren', 'duoi', 'gia', 'khach', 'local', 'best', 'the', 'in', 'at', 'of', 'and', 'with', 'for', 'to', 'my', 'this', 'mot', 'nhung',
  'cac', 'chua', 'roi', 'luon', 'ne', 'ngay', 'tuan', 'lan', 'dat', 'sao', 'ca', 'nhieu', 'it', 'rat', 'hon', 'het', 'nhu', 'trieu', 'nghin', 'k',
  'egg', 'iced', 'milk', 'black', 'salt', 'coconut', 'hidden', 'gem', 'famous', 'cheap', 'street', 'food', 'tour', 'travel', 'trip', 'guide', 'day', 'days', 'night',
  'thuong', 'thuc', 'kham', 'pha', 'trai', 'nghiem', 'song', 'ao', 'checkin', 'check', 'san', 'may', 'diem', 'dia', 'phuong', 'vi', 'giam',
  // regions, and how food is made or tastes: "Bánh Xèo Miền Tây", "Bánh Xèo Giòn Rụm"
  'co', 'bung', 'thit', 'heo', 'tom', 'muc', 'trung', 'rau', 'mam', 'ruoc', 'tron', 'cuon', 'gion', 'rum', 'thom', 'beo', 'cay', 'nong', 'lanh', 'ngot', 'chua', 'man', 'sach', 'tuoi', 'nuong', 'chien', 'xao', 'hap', 'luoc', 'kho', 'rang', 'chuan',
  'cach', 'lam', 'cong', 'mon', 'an', 'nau', 'bot', 'shorts', 'short', 'fyp', 'viral', 'trend', 'trending'])
// Venue names do not start with these: a sentence or a count does.
const BAD_START = new Set(['top', 'nhung', 'cac', 'mot', 'review', 'list', 'tong', 'hop'])
const STREET_WORDS = /(?:đường|đ\.|p\.|phố|ngõ|ngách|hẻm|kiệt|duong|street|st\.)/iu
const PIN = /[📍📌]\s*(?:(?:địa chỉ|address|đ\/c|dc|location)\s*[:：-]?\s*)?([^\n|#📍📌]{3,90})/iu
const PIN_ALL = new RegExp(PIN.source, 'giu')
const ADDRESS = /(?:địa chỉ|address|đ\/c|addr)\s*[:：-]\s*([^\n|#📍📌]{5,120})/iu
const HOUSE = /(?:^|[\s,(])(\d{1,4}[a-z]?\/\d{1,4}|\d{1,4}[a-z]?\s+(?:đường|đ\.|p\.|phố|ngõ|hẻm|kiệt)\s+[\p{L}\d][\p{L}\d]*)/iu

/**
 * Words of a caption — original spelling, lower case with accents, plain — without
 * hashtags, links and mentions. Punctuation and line breaks between words stay as
 * a separator ({ sep: true }): a name never runs across ", - | :" or onto the next line.
 */
function words(text) {
  const cleaned = text.replace(/https?:\/\/\S+/g, ' ').replace(/[#@]\s*[\p{L}\p{N}_.]+/gu, ' ')
  return [...cleaned.matchAll(/[\p{L}\p{N}][\p{L}\p{N}&'’]*(?:[./][\p{L}\p{N}]+)*|&|[,;:|()[\]"“”!?•·–—\n]|\s[-/]\s/gu)]
    .map(([raw]) => (/^[\p{L}\p{N}&]/u.test(raw) ? { raw, low: canonical(raw), plain: plain(raw) } : { raw: raw.trim(), low: '', plain: '', sep: true }))
}

// "Miền Tây / Bắc / Nam / Trung" is a region, not part of a name ("Bánh Xèo Miền Tây").
const REGION_AFTER = new Set(['tay', 'bac', 'nam', 'trung'])

/**
 * Whether two addresses start at the same house on the same street: "6B Đường
 * Thành, Hoàn Kiếm" and "6B P. Đường Thành, Cửa Đông" do; "17A P. Chả Cá" does not.
 */
export function sameHouse(a, b) {
  const house = (s) => {
    const m = plain(s).replace(/\b(?:so|p|pho|duong|d|ng|ngo|hem|kiet)\b/g, ' ').replace(/\s+/g, ' ').match(/(?:^| )(\d{1,4}[a-z]?) ([a-z]+)/)
    return m ? { number: m[1], street: m[2] } : null
  }
  const x = house(a ?? ''), y = house(b ?? '')
  return Boolean(x && y && x.number === y.number && (x.street === y.street || x.street.startsWith(y.street) || y.street.startsWith(x.street)))
}

/** Cities named anywhere in the caption, in the order they appear. */
export function citiesIn(text) {
  const p = ` ${plain(String(text).replace(/[#@]/g, ' '))} `
  return CITIES
    .map((c) => ({ city: c.name, at: Math.min(...c.aliases.map((a) => { const i = p.indexOf(` ${a} `); return i < 0 ? Infinity : i })) }))
    .filter((c) => c.at < Infinity).sort((a, b) => a.at - b.at).map((c) => c.city)
}

/**
 * The places a caption names, by rule:
 *   pin       text after 📍 / 📌 (often "Name - address")
 *   address   "Địa chỉ: …", or a house number with a street word / a "283/2" number
 *   names     a type word + a name ("Quán cà phê Bình Minh Ơi"), a name + an English
 *             type ("Mê Linh Coffee Garden"), a dish + a proper name ("Bánh Xèo 7 Tới"),
 *             a name + "quán" in lower case ("Mộc quán")
 * `hasVenue` is false when none of these appear — the caption is about food
 * or a city in general, and a map search would only return guesses.
 *
 * A video description is read too, more warily: it is full of playlist headings
 * and channel lines ("MÓN NGON TỪ CƠM NGUỘI"), so a dish + name there is not a
 * venue — only pins, addresses, type words and English types are. Names from
 * the title come first.
 */
export function analyzeCaption(text, { description = '', spoken = '', area = '', comments = [], author = '', screen = '' } = {}) {
  const title = read(text)
  // A description line that is an item of a list — "1. Phở Thìn – 13 Lò Đúc", "📍 …",
  // "- Bún chả Hương Liên" — names a venue the way a title does, dish + name included;
  // the rest of the description is read warily (see above).
  const lines = String(description ?? '').split(/\r?\n/)
  const items = lines.filter((l) => LIST_ITEM.test(l)).slice(0, 40).map((l) => read(l))
  const listed = listedPlaces(description)
  // With a list of the venues, the prose around it only adds noise ("Các quán Ninh đã gọi").
  const about = description && !listed.length ? read(lines.filter((l) => !LIST_ITEM.test(l)).join('\n'), { dishNames: false }) : null
  // Comments: the creator's own, pinned ones, and answers to "xin địa chỉ / quán gì" (see videoPage.js) — read warily too.
  const said = (comments ?? []).filter((c) => c.answer || c.by === 'creator').map((c) => c.text).filter(Boolean)
  const remarks = said.length ? read(said.join('\n'), { dishNames: false }) : null
  // Text written on the pictures (cover, photos) reads like a title — or a list, one venue per photo.
  const shown = screen ? read(screen) : null
  const shownListed = screen ? listedPlaces(screen) : []
  let names = [...title.names]
  for (const n of [...listed.map((l) => l.name), ...shownListed.map((l) => l.name), ...items.flatMap((r) => r.names), ...(shown?.names ?? []), ...(about?.names ?? []), ...spokenNames(spoken), ...(remarks?.names ?? [])]) if (!names.some((m) => sameVenue(m, n))) names.push(n)
  // A hashtag that spells a name ("#nhakho" for "quán nhà kho") puts that name first.
  const tags = venueHashtags([text, description].join('\n'), { author })
  const compact = (s) => plain(s).replace(/\s/g, '')
  const tagged = names.filter((n) => tags.some((tag) => compact(n).length >= 4 && (tag.includes(compact(n)) || compact(n).includes(tag))))
  names = [...tagged, ...names.filter((n) => !tagged.includes(n))]
  const pins = [...new Set([...title.pins, ...items.flatMap((r) => r.pins), ...(shown?.pins ?? []), ...(about?.pins ?? []), ...(remarks?.pins ?? [])])]
  const address = title.address ?? items.find((r) => r.address)?.address ?? about?.address ?? null
  // Where the video says the venue is, when it says so outside a list: aloud, or in an answer to a comment.
  const addressHint = address ?? shown?.address ?? spokenAddress(spoken) ?? commentAddress(comments) ?? remarks?.address ?? null
  const cities = [...new Set([...title.cities, ...citiesIn(area), ...items.flatMap((r) => r.cities), ...(shown?.cities ?? []), ...(about?.cities ?? []), ...citiesIn(spoken), ...(remarks?.cities ?? [])])]
  const city = cities[0] ?? ''
  // A listed venue with its address is searched with it ("Phở Khôi, 50 Hàng Vải, Hoàn Kiếm"); a
  // video about one or two venues, with the address it gives ("quán nhà kho, 97 lái thiêu, Bình Dương").
  const listedAddress = (name) => [...listed, ...shownListed].find((l) => l.address && sameVenue(l.name, name))?.address ?? null
  const addressFor = (name) => listedAddress(name) ?? (names.length <= 2 ? addressHint : null)
  const queries = names.slice(0, MAX_NAMES).map((name) => {
    const at = addressFor(name)
    // The city only when the address does not already say it ("…, Hoàn Kiếm, Hà Nội").
    const inAddress = at && city && citiesIn(at).includes(city)
    return at ? [name, at, inAddress ? '' : city].filter(Boolean).join(', ') : [name, city].filter(Boolean).join(' ')
  })
  // The address the video gives for each name, to tell its branch from the others.
  const addresses = names.slice(0, MAX_NAMES).map(addressFor)
  // A pin whose venue no name covers is searched as written ("Quán Ốc Oanh - 534 Vĩnh Khánh").
  for (const pin of pins) if (queries.length < MAX_NAMES && !names.some((n) => plain(pin).includes(plain(n)))) queries.push(pin)
  // Nothing named: a name-like hashtag with the address or city ("nhakho, Lai thieu 97, Bình Dương"), then the address alone.
  if (!queries.length && tags.length && (addressHint || city)) queries.push([tags[0], addressHint, city].filter(Boolean).join(', '))
  if (!queries.length && addressHint) queries.push([addressHint, city].filter(Boolean).join(', '))
  return {
    names: names.slice(0, MAX_NAMES), addresses, pin: pins[0] ?? null, pins, address: addressHint, cities, tags,
    hasVenue: Boolean(names.length || pins.length || addressHint), queries, titleCase: title.titleCase,
    streetHint: title.streetHint || Boolean(about?.streetHint),
  }
}

// Food tours and itineraries name many venues; a caption about one names one.
const MAX_NAMES = 8
const LIST_ITEM = /^\s*(?:\d{1,2}\s*[.)/:-]|[-–•*+]\s|\p{Extended_Pictographic})/u
const BULLET = /^\s*(?:(?:[-–•*+✰]|\p{Extended_Pictographic}|️)\s*)+/u
// A video chapter time ("00:50 Phở Khôi") comes off before a list number would: "00:" is not item 0.
const TIMESTAMP = /^(?:\d{1,2}:)?\d{1,2}:\d{2}\s*/
const NUMBER = /^\d{1,2}\s*[.)/-]\s*/
// List lines that are not a place: headings, prices, links, advice.
const ITEM_NOT_PLACE = /trải nghiệm|hoàng hôn|bình minh|kinh nghiệm|chi phí|giá vé|giá cả|lưu ý|tổng kết|cảm nhận|review|subscribe|đăng ký|theo dõi|liên hệ|hotline|facebook|instagram|youtube|tiktok|fanpage|zalo|email|có gì|ăn gì|đi đâu|chơi gì|ở đâu|thế nào|bao nhiêu|^\d+\s*(?:ngày|đêm)|^ngày\s|^day\s|link|order|đặt món|ưu đãi|giảm giá|khuyến mãi|bản quyền|copyright|reup|do not|all rights|tài trợ|sponsor|quảng cáo|hợp tác|booking|podcast|music|âm nhạc|nhạc nền|credit/u

/**
 * Venues a description lists: lines marked as list items ("- 00:50 Phở Khôi -
 * 50 Hàng Vải, Hoàn Kiếm", "1/ Cáp treo Hòn Thơm"), and the short lines under a
 * heading that ends in ":" ("Trong video có:" → "Cơm niêu Chạn Huế"). The name
 * is what comes before " - " / ": "; what follows is kept as the address when it
 * has a house number.
 */
export function listedPlaces(description) {
  const lines = String(description ?? '').normalize('NFC').split(/\r?\n/).map((l) => l.trim())
  const found = []
  // 'none' → a heading ending in ":" → 'heading' (blank lines may follow) → its short lines → 'items' → a blank or long line ends them.
  let state = 'none'
  for (const line of lines) {
    if (!line) { if (state === 'items') state = 'none'; continue }
    const marked = LIST_ITEM.test(line)
    if (!marked && /[:：]$/.test(line) && line.length <= 80) { state = 'heading'; continue }
    if (!marked) {
      if (state === 'none' || line.length > 70) { state = 'none'; continue }
      state = 'items'
    }
    const item = itemPlace(line)
    if (item && !found.some((f) => sameVenue(f.name, item.name))) found.push(item)
  }
  return found.slice(0, 20)
}

function itemPlace(line) {
  const text = line.replace(BULLET, '').replace(TIMESTAMP, '').replace(NUMBER, '').replace(TIMESTAMP, '').trim()
  const [head, ...rest] = text.split(/\s[-–—|]\s|[:：]\s/)
  const name = head.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  const words = name.split(' ')
  if (words.length < 2 || words.length > 8 || name.length > 70 || /https?:|www\.|[#@]/.test(name)) return null
  if (!/^[\p{Lu}\d]/u.test(name) || /\d{3,}|\d+\s*k(?![\p{L}])|vnđ|\d\s*đ(?![\p{L}])/iu.test(name)) return null
  if (ITEM_NOT_PLACE.test(canonical(name)) || words.every((w) => NOT_NAME.has(plain(w)))) return null
  const after = rest.join(' - ').trim()
  return { name, address: /\d/.test(after) && after.length <= 160 ? after : null }
}

// Spoken words (automatic subtitles) are lower case and unpunctuated, so the
// rules above cannot see names in them. Reviewers do say the name outright,
// though: "quán có tên là khét BBQ nha", "tên quán là Bếp Nhà Mây". The name
// runs to the first filler word.
// With accents: "nha" (the filler) ends a name, "Nhà" ("Bếp Nhà Mây") does not.
const SPOKEN_STOP = new Set(['nha', 'nhé', 'nhe', 'nhá', 'nè', 'á', 'à', 'ạ', 'đó', 'đấy', 'đây', 'luôn', 'ha', 'hen', 'nghen', 'nhen', 'mà', 'thì', 'ở', 'tại', 'nay', 'này',
  'với', 'và', 'là', 'của', 'có', 'ngay', 'rồi', 'ơi', 'nhưng', 'nên', 'cho', 'vì', 'khi', 'nếu', 'hay', 'hoặc', 'mọi', 'người', 'mình', 'tui', 'tôi', 'em', 'bạn',
  'giá', 'địa', 'nằm', 'ngon', 'đẹp', 'rẻ', 'siêu', 'cực', 'chill', 'view', 'bên', 'gần', 'trên', 'dưới', 'trong', 'ngoài', 'chuyên', 'bán', 'thôi', 'đi', 'ăn', 'uống'])
const VENUE_WORDS = ['quan an', 'quan', 'nha hang', 'tiem', 'homestay', 'khach san']

// Words that say what a place is, not which one: "quán lẩu nướng này" names no venue.
const GENERIC_SPOKEN = new Set(['quan', 'hang', 'tiem', 'ca', 'phe', 'cafe', 'cf', 'coffee', 'tra', 'sua', 'bbq', 'buffet', 'pub', 'bar', 'lau', 'nuong', 'hai', 'san', 'oc', 'com', 'bun', 'pho', 'banh', 'che', 'kem', 'an', 'vat', 'nhau', 'chay', 'quen', 'moi', 'nho', 'to', 'lon'])
// After "quán X …": the words that end a venue name said in passing ("quán nhà kho này nằm ở …").
const SPOKEN_AFTER_NAME = new Set(['này', 'nằm', 'ở', 'tại', 'thì', 'nha', 'nè', 'đó', 'này', 'có', 'luôn'])

/**
 * Venue names said aloud: "(quán …) tên là X", "tên quán là X", and a name said
 * in passing — "quán nhà kho này nằm ở …", "quán Bếp Mây ở đường …" — when it is
 * not just a kind of food ("quán lẩu nướng này").
 */
export function spokenNames(text) {
  const tokens = String(text ?? '').normalize('NFC').split(/[\s,.!?;:"“”()]+/).filter(Boolean).slice(0, 1500)
  const p = tokens.map(plain)
  const names = []
  const add = (run) => {
    const name = run.join(' ')
    if (run.length && /\p{L}{2}/u.test(name) && plain(name).replace(/\s/g, '').length >= 3 && !names.some((n) => sameVenue(n, name))) names.push(name)
  }
  for (let i = 0; i < tokens.length; i++) {
    if (p[i] === 'quan' && canonical(tokens[i]) === 'quán' && p[i + 1] !== 'nay') {
      const run = []
      let j = i + 1
      for (; j < tokens.length && run.length < 4 && !SPOKEN_STOP.has(canonical(tokens[j])); j++) run.push(tokens[j])
      // "nhà hàng" is a kind of place; "nhà kho" (a venue called Nhà Kho) is a name.
      const words = canonical(run.slice(0, 2).join(' ')) === 'nhà hàng' ? run.slice(2) : run
      const named = words.some((w) => !GENERIC_SPOKEN.has(plain(w)) && !NOT_NAME.has(plain(w)) && !DISHES.includes(canonical(w)))
      if (named && SPOKEN_AFTER_NAME.has(canonical(tokens[j] ?? ''))) add(run)
      continue
    }
    if (p[i] !== 'ten') continue
    let j = i + 1
    // "tên quán là X" — or "quán (này) (có) tên là X", the venue word just before.
    const venueAfter = VENUE_WORDS.find((v) => v.split(' ').every((w, k) => p[j + k] === w))
    if (venueAfter) j += venueAfter.split(' ').length
    else if (!p.slice(Math.max(0, i - 4), i).some((w) => w === 'quan' || w === 'hang' || w === 'tiem')) continue
    if (p[j] === 'goi') j++
    if (p[j] === 'la') j++
    const run = []
    for (; j < tokens.length && run.length < 5 && !SPOKEN_STOP.has(canonical(tokens[j])); j++) run.push(tokens[j])
    add(run)
  }
  return names.slice(0, MAX_NAMES)
}

/**
 * An address said aloud: "nằm ở đường lái thiêu 97", "ở số 12 đường Nguyễn Huệ",
 * "địa chỉ là 45 Hoàng Quốc Việt" → "97 lái thiêu", "12 Nguyễn Huệ", or null.
 */
export function spokenAddress(text) {
  const tokens = String(text ?? '').normalize('NFC').split(/[\s,.!?;:"“”()]+/).filter(Boolean).slice(0, 1500)
  const c = tokens.map(canonical)
  const isNumber = (t) => /^\d{1,4}[a-z]?(?:\/\d{1,4})?$/i.test(t ?? '')
  const street = (from) => {
    const run = []
    // The street name ends at the ward or district ("12 Nguyễn Huệ quận 1" → "Nguyễn Huệ").
    for (let j = from; j < tokens.length && run.length < 4 && !isNumber(tokens[j]) && !SPOKEN_STOP.has(c[j]) && !ADMIN_WORDS.has(c[j]) && /\p{L}/u.test(tokens[j]); j++) run.push(tokens[j])
    return run
  }
  for (let i = 0; i < tokens.length; i++) {
    // "đường lái thiêu 97": the street, then its number.
    if (c[i] === 'đường') {
      const run = street(i + 1)
      if (run.length && isNumber(tokens[i + 1 + run.length])) return `${tokens[i + 1 + run.length]} ${run.join(' ')}`
    }
    // "(ở / tại / địa chỉ là) (số) 12 (đường) Nguyễn Huệ"
    if (['ở', 'tại', 'chỉ'].includes(c[i])) {
      let j = i + 1
      if (c[j] === 'là') j++
      if (c[j] === 'số') j++
      if (isNumber(tokens[j])) {
        const run = street(j + 1 + (c[j + 1] === 'đường' ? 1 : 0))
        if (run.length) return `${tokens[j]} ${run.join(' ')}`
      }
    }
  }
  return null
}

const ADMIN_WORDS = new Set(['quận', 'phường', 'huyện', 'xã', 'thành', 'tp', 'thị', 'tỉnh'])

const GENERIC_TAGS =/^(?:fyp|foryou|xuhuong|trend|trending|viral|review|food|foodie|foodtour|ancungtiktok|reviewanngon|anvat|monngon|quanngon|amthuc|travel|dulich|checkin|cafe|coffee|shorts?|tiktok|vietnam)/
/** Hashtags that could be a venue's name: not a trend tag, a city, or a "review…" tag. */
export function venueHashtags(text, { author = '' } = {}) {
  const handle = plain(author).replace(/\s/g, '')
  return [...new Set([...String(text ?? '').matchAll(/#([\p{L}\p{N}_]{3,40})/gu)].map((m) => plain(m[1]).replace(/[\s_]/g, '')))]
    .filter((tag) => tag.length >= 4 && !GENERIC_TAGS.test(tag) && !/review|anngon|angi|dulich|travel|food/.test(tag) && tag !== handle
      && !CITY_ALIASES.some((a) => tag.includes(a.join(''))))
}

/**
 * An address from the comments: a reply to "xin địa chỉ" ("Dạ. Lai thieu 97.
 * Phường Lái Thiêu"), or a comment written as an address.
 */
export function commentAddress(comments) {
  for (const { text, answer, by } of comments ?? []) {
    // Viewers' own addresses are often another venue ("ghé bên em số 2 …"): only answers and the creator count.
    if (!answer && by !== 'creator') continue
    const t = String(text ?? '').replace(/^\s*(?:dạ|da|ạ|vâng)[.,!\s]*/iu, '').trim()
    if (!t || t.length > 120 || !/\d/.test(t) || !/\p{L}{2}/u.test(t)) continue
    if (answer || ADDRESS.test(t) || HOUSE.test(t)) return t.replace(/[.\s]+$/, '')
  }
  return null
}

function read(text, { dishNames = true } = {}) {
  const caption = String(text ?? '').normalize('NFC').slice(0, 2000)
  const list = words(caption)
  const real = list.filter((w) => !w.sep)
  // In Title Case Captions Every Word Is Capitalised, so capitals say nothing.
  const titleCase = real.length >= 4 && real.filter((w) => /^\p{Lu}/u.test(w.raw)).length / real.length > 0.6
  const capital = (w) => !w.sep && (/^[\p{Lu}\d]/u.test(w.raw) || w.raw === '&')
  const region = (j) => list[j]?.plain === 'mien' && REGION_AFTER.has(list[j + 1]?.plain)
  const cityAt = (j) => CITY_ALIASES.some((a) => a.every((part, k) => list[j + k]?.plain === part))
  const nameWord = (w, j) => !w.sep && !NOT_NAME.has(w.plain) && !cityAt(j) && !region(j) && (titleCase ? /[\p{L}\d]/u.test(w.raw) : capital(w))
  const distinctive = (w) => /\p{L}/u.test(w.raw) && !NOT_NAME.has(w.plain) && !DISHES.includes(w.low) && !HONORIFICS.has(w.low)
  const names = []
  const addName = (parts) => {
    const name = parts.map((w) => w.raw).join(' ').replace(/\s*&$/, '').trim()
    if (!parts.some(distinctive) || BAD_START.has(parts[0].plain)) return
    if (!names.some((n) => sameVenue(n, name))) names.push(name)
  }
  const phraseAt = (i, phrases) => {
    let best = 0
    for (const p of phrases) {
      const ws = p.split(' ')
      if (ws.length > best && ws.every((w, j) => list[i + j]?.low === w)) best = ws.length
    }
    return best
  }
  /** A name starting at j: name-like words, an honorific may lead, a house number ends it. */
  const nameRun = (j, max) => {
    const run = []
    if (list[j] && HONORIFICS.has(list[j].low) && list[j + 1] && capital(list[j + 1])) run.push(list[j++])
    for (; j < list.length && run.length < max && nameWord(list[j], j); j++) {
      // "Mộc Seafood 26 Tô Hiến Thành": a number followed by two capitalised words starts an address.
      // In Title Case only a longer number does ("Quán Ốc Oanh 534 Vĩnh Khánh"): "Bánh Xèo 7 Tới" is a name.
      if (/^\d/.test(list[j].raw) && run.length && list[j + 1] && list[j + 2] && capital(list[j + 1]) && capital(list[j + 2]) && !cityAt(j + 1) && !cityAt(j + 2) && (!titleCase || /^\d{2}/.test(list[j].raw))) break
      run.push(list[j])
    }
    return run
  }

  for (let i = 0; i < list.length; i++) {
    const typeLen = phraseAt(i, TYPE_PHRASES)
    if (typeLen) {
      const drink = ['cafe', 'café', 'cà phê', 'cf'].includes(list.slice(i, i + typeLen).map((w) => w.low).join(' ')) && DRINKS.has(list[i + typeLen]?.low)
      const run = drink ? [] : nameRun(i + typeLen, 6)
      if (run.length) { addName([...list.slice(i, i + typeLen), ...run]); i += typeLen + run.length - 1; continue }
    }
    // A dish in lower case inside a Title Case caption is the food, not a name ("Ăn ốc đã đời …").
    const dishLen = !dishNames || (titleCase && !capital(list[i])) ? 0 : phraseAt(i, DISHES)
    if (dishLen) {
      const run = nameRun(i + dishLen, 4)
      // In Title Case "Món Xyz" is a name only with an honorific or a number ("Bánh Xèo Bà Dưỡng",
      // "Bánh Xèo 7 Tới"), a closing "Quán" ("Cơm Niêu Kim Anh Quán"), or a two-word dish and a
      // two-word name ("Cơm Hến Hoa Đông").
      const titled = HONORIFICS.has(run[0]?.low) || /\d/.test(run[0]?.raw ?? '') || run.some((w) => w.low === 'quán') || (dishLen >= 2 && run.length >= 2 && run.every(distinctive))
      if (run.length && (!titleCase || titled)) {
        addName([...list.slice(i, i + dishLen), ...run]); i += dishLen + run.length - 1; continue
      }
    }
    // name + English type suffix ("Mê Linh Coffee Garden"), or name + lower-case "quán" ("Mộc quán")
    const suffix = SUFFIXES.has(list[i].low) || (list[i].raw === 'quán' && !titleCase)
    if (suffix && i > 0) {
      const run = []
      for (let j = i - 1; j >= 0 && run.length < 4 && nameWord(list[j], j) && !SUFFIXES.has(list[j].low); j--) run.unshift(list[j])
      let end = i
      while (end + 1 < list.length && SUFFIXES.has(list[end + 1].low) && end - i < 2) end++
      // "8 quán", "Top 5 quán": a count, not a name.
      if (run.some(distinctive)) { addName([...run, ...list.slice(i, end + 1)]); i = end }
    }
  }

  const pins = [...caption.matchAll(PIN_ALL)].map((m) => m[1].trim()).filter(Boolean)
  const house = caption.match(HOUSE)
  const address = caption.match(ADDRESS)?.[1]?.trim() ?? (house ? house[1].trim() : null)
  return { names, pins, address, cities: citiesIn(caption), titleCase, streetHint: STREET_WORDS.test(caption) }
}
