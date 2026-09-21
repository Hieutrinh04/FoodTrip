// Probe: does the Hotelbeds TEST environment carry bookable, priced hotels for
// the 12 cities FoodTrip covers?
//
// The Evaluation Plan key is limited in both call volume and geography, so a
// city having hotels in Hotelbeds' global inventory does not mean the test key
// can see them. Run this before writing any integration code: if most cities
// come back empty, the integration is not worth building and hotel prices
// should stay simulated — which the đề cương already allows, since payment is
// sandbox-only.
//
// Credentials are read from the environment, falling back to .env.local so the
// secret never has to be pasted on a command line or into a chat window.
//
//   HOTELBEDS_API_KEY=...   (the "Api key" from developer.hotelbeds.com)
//   HOTELBEDS_SECRET=...    (the "Secret" next to it — server-side only,
//                            never prefix it with VITE_)
//
// Usage: node scripts/check-hotelbeds-coverage.js

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'

const HOST = 'https://api.test.hotelbeds.com'
const AVAILABILITY = `${HOST}/hotel-api/1.0/hotels`

const CITIES = [
  { name: 'Hà Nội', lat: 21.0285, lng: 105.8542 },
  { name: 'Hội An', lat: 15.8801, lng: 108.3380 },
  { name: 'Đà Nẵng', lat: 16.0544, lng: 108.2022 },
  { name: 'TP. Hồ Chí Minh', lat: 10.7769, lng: 106.7009 },
  { name: 'Đà Lạt', lat: 11.9404, lng: 108.4583 },
  { name: 'Huế', lat: 16.4637, lng: 107.5909 },
  { name: 'Phú Quốc', lat: 10.2270, lng: 103.9670 },
  { name: 'Nha Trang', lat: 12.2388, lng: 109.1967 },
  { name: 'Ninh Bình', lat: 20.2506, lng: 105.9745 },
  { name: 'Cần Thơ', lat: 10.0452, lng: 105.7469 },
  { name: 'Sa Pa', lat: 22.3364, lng: 103.8438 },
  { name: 'Phan Thiết', lat: 10.9280, lng: 108.1020 },
]

/** Reads a key from the environment, then from .env.local as a convenience. */
function credential(name) {
  if (process.env[name]) return process.env[name].trim()
  const file = new URL('../.env.local', import.meta.url)
  if (!existsSync(file)) return null
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`))
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const API_KEY = credential('HOTELBEDS_API_KEY')
const SECRET = credential('HOTELBEDS_SECRET')

if (!API_KEY || !SECRET) {
  console.error('Thiếu thông tin đăng nhập Hotelbeds.')
  console.error('Thêm vào .env.local (đã được gitignore), KHÔNG dùng tiền tố VITE_:')
  console.error('  HOTELBEDS_API_KEY=...')
  console.error('  HOTELBEDS_SECRET=...')
  console.error('Lấy tại https://developer.hotelbeds.com → Dashboard')
  process.exit(1)
}

/** Hotelbeds signs every call with SHA256(apiKey + secret + unix seconds). */
function headers() {
  const stamp = Math.floor(Date.now() / 1000)
  return {
    'Api-key': API_KEY,
    'X-Signature': createHash('sha256').update(API_KEY + SECRET + stamp).digest('hex'),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

function stayDates() {
  const inDate = new Date(Date.now() + 30 * 86400000)
  const outDate = new Date(Date.now() + 31 * 86400000)
  const iso = (d) => d.toISOString().slice(0, 10)
  return { checkIn: iso(inDate), checkOut: iso(outDate) }
}

async function probe(city) {
  const body = {
    stay: stayDates(),
    occupancies: [{ rooms: 1, adults: 2, children: 0 }],
    geolocation: { latitude: city.lat, longitude: city.lng, radius: 20, unit: 'km' },
  }
  const res = await fetch(AVAILABILITY, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  if (!res.ok) {
    const text = (await res.text()).slice(0, 120).replace(/\s+/g, ' ')
    return { error: `${res.status} ${text}` }
  }
  const json = await res.json()
  const hotels = json?.hotels?.hotels ?? []
  const priced = hotels.filter((h) => h.minRate != null)
  const cheapest = priced.length
    ? `${Math.round(Math.min(...priced.map((h) => Number(h.minRate))))} ${priced[0].currency ?? ''}`.trim()
    : null
  return { total: hotels.length, priced: priced.length, cheapest }
}

console.log(`Dò môi trường test Hotelbeds · lưu trú ${stayDates().checkIn} → ${stayDates().checkOut} · 2 người\n`)
console.log('  ' + 'Thành phố'.padEnd(20) + 'Khách sạn'.padEnd(12) + 'Có giá'.padEnd(10) + 'Giá thấp nhất')
console.log('  ' + '-'.repeat(64))

let withPrices = 0
for (const city of CITIES) {
  const r = await probe(city)
  if (r.error) {
    console.log('  ' + city.name.padEnd(20) + `lỗi ${r.error}`)
  } else {
    if (r.priced) withPrices++
    console.log(
      '  ' + city.name.padEnd(20) +
      String(r.total).padEnd(12) +
      String(r.priced).padEnd(10) +
      (r.cheapest ?? '—'),
    )
  }
  // The evaluation plan rate-limits hard; keep well under it.
  await new Promise((r) => setTimeout(r, 1200))
}

console.log('\n' + '='.repeat(66))
console.log(`Có giá phòng thật: ${withPrices}/12 thành phố`)
if (withPrices === 0) {
  console.log('=> Key test không phủ Việt Nam. KHÔNG tích hợp; giữ giá mô phỏng như đề cương cho phép.')
} else if (withPrices < 6) {
  console.log('=> Phủ quá thưa — phần lớn thành phố sẽ không có giá. Cân nhắc kỹ trước khi tích hợp.')
} else {
  console.log('=> Đủ dùng. Có thể thay giá mô phỏng bằng giá thật từ Hotelbeds.')
}
