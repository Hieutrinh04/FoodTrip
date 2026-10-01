import test from 'node:test'
import assert from 'node:assert/strict'

// Edge Function helpers are TypeScript; Node runs them directly with type
// stripping, so they are tested exactly as deployed.
import { canonicalQuery, signParams } from '../supabase/functions/_shared/vnpay.ts'
import { findGoogleTwin, photoMatchesHotel, photoHostAllowed, listingMatchesHotel } from '../supabase/functions/_shared/hotelMatch.ts'
import { hasLocationEvidence, searchName } from '../supabase/functions/_shared/relevance.ts'
import { isAboutVenue, venueEvidence, streetOf } from '../supabase/functions/_shared/venueMatch.ts'

test('VNPay query is sorted and encodes spaces as "+"', () => {
  const q = canonicalQuery({ vnp_OrderInfo: 'Thanh toan dat phong', vnp_Amount: '100000', vnp_Command: 'pay' })
  assert.equal(q, 'vnp_Amount=100000&vnp_Command=pay&vnp_OrderInfo=Thanh+toan+dat+phong')
})

test('a payment URL verifies after the round trip through the browser', async () => {
  const secret = 'TESTSECRET'
  const sent = { vnp_TxnRef: 'b1', vnp_OrderInfo: 'Thanh toan dat phong b1', vnp_Amount: '150000000' }
  const { query, hash } = await signParams(sent, secret)
  // What VNPay hands back: the same fields, decoded by URLSearchParams.
  const back = Object.fromEntries(new URLSearchParams(query))
  const again = await signParams(back, secret)
  assert.equal(again.hash, hash)
})

const pearl = { name: 'The Pearl Hoi An', location: { lat: 15.9187, lng: 108.3303 } }

test('the same hotel from both providers is matched', () => {
  const twin = findGoogleTwin(pearl, [{ name: 'The Pearl Hoi An', location: { lat: 15.9188, lng: 108.3301 } }], 'Hội An')
  assert.equal(twin?.name, 'The Pearl Hoi An')
})

test('hotels sharing one word are not matched', () => {
  // The first version matched these, pricing one hotel with another's rate.
  const hotel = { name: 'Hoi An Silk Marina Resort & Spa', location: { lat: 15.8745, lng: 108.3223 } }
  const twin = findGoogleTwin(hotel, [{ name: 'Bel Marina Hoi An Resort', location: { lat: 15.8746, lng: 108.3224 } }], 'Hội An')
  assert.equal(twin, null)
})

test('a name made of generic words is not matched to every hotel', () => {
  const hotel = { name: 'Hoi An Beach Resort', location: { lat: 15.9, lng: 108.37 } }
  const twin = findGoogleTwin(hotel, [{ name: 'Khu nghỉ dưỡng Legacy Hội An', location: { lat: 15.9, lng: 108.37 } }], 'Hội An')
  assert.equal(twin, null)
})

test('web photos must name the whole hotel, generic words included', () => {
  assert.ok(photoMatchesHotel('THE VIEW HOMESTAY HỘI AN, Hội An (cập nhật giá)', 'The View Homestay Hoi An', 'Hội An'))
  assert.ok(!photoMatchesHotel('Mountain View Homestay Hội An', 'The View Homestay Hoi An', 'Hội An'))
})

test('only hotel-listing hosts supply web photos', () => {
  assert.ok(photoHostAllowed('https://cf.bstatic.com/xdata/images/hotel/max1024x768/1.jpg'))
  assert.ok(!photoHostAllowed('https://i.pinimg.com/736x/abc.jpg'))
  assert.ok(!photoHostAllowed('https://evil-agoda.com/x.jpg'))
})

test('a listing link must be this branch of a chain, not the first one found', () => {
  const name = 'Khách sạn Mường Thanh Grand Hà Nội'
  assert.ok(listingMatchesHotel('https://www.agoda.com/vi-vn/muong-thanh-grand-hanoi-hotel/hotel/hanoi-vn.html', name))
  // Both came back from the same search, ranked above the right page.
  assert.ok(!listingMatchesHotel('https://www.agoda.com/vi-vn/muong-thanh-grand-da-nang-hotel/hotel/da-nang-vn.html', name))
  assert.ok(!listingMatchesHotel('https://www.traveloka.com/vi-vn/hotel/vietnam/muong-thanh-hanoi-centre-hotel-1000000506979', name))
})

test('an English caption that runs the city together still places it', () => {
  assert.ok(hasLocationEvidence('Hanoi food guide #1 Bún chả Hương Liên', 'Hà Nội'))
  assert.ok(hasLocationEvidence('best banh mi in Hoian', 'Phường Minh An, Hội An'))
  assert.ok(!hasLocationEvidence('Had to hit this on my last day in Vietnam', 'Hà Nội'))
})

// Content discovery: one rule for every venue — the name, plus two independent
// pieces of evidence, at least one of them more than a place name.

const about = (title, venue, extra = {}) => isAboutVenue({ title, ...extra }, venue)

test('each kind of evidence is recognised', () => {
  const venue = { name: 'Bún Chả Hương Liên', address: '24 P. Lê Văn Hưu, Phan Chu Trinh, Hai Bà Trưng, Hà Nội' }
  assert.deepEqual(venueEvidence({ title: 'Bún chả Hương Liên, 24 Lê Văn Hưu, Hà Nội' }, venue), ['name', 'street', 'locality'])
  assert.deepEqual(venueEvidence({ title: 'Obama ăn ở đây', url: 'https://www.facebook.com/bunchahuonglien/posts/1' }, venue), ['account'])
})

test('the name alone, or the name and a city, is enough only for a distinctive name', () => {
  const venue = { name: 'Bánh Mì Phượng', address: '2B Phan Châu Trinh, Minh An, Hội An' }
  assert.ok(about('Bánh mì Phượng ngon nhất Hội An', venue))
  assert.ok(!about('Bánh mì Phượng', venue)) // no second piece of evidence
})

test('a one-word name counts as a mention, never as evidence', () => {
  const venue = { name: 'Helios - Tiệm Ăn Hàn Quốc - Thủ Dầu Một', address: '172/8 Trần Văn Ơn, Phú Lợi, Hồ Chí Minh' }
  assert.ok(!about('ACER Predator Helios 700 - mẫu PC di động', venue))
  assert.ok(!about('Helios Riverside Apartment | Ho Chi Minh City, Vietnam | Hotel Review', venue)) // a city only
  assert.ok(about('Helios - Tiệm Gà Rán Hàn Quốc | 172 Trần Văn Ơn', venue)) // listing + street
})

test('scattered everyday words are not the name', () => {
  const venue = { name: 'Yên study càfe | Quán cà phê học bài Bình Dương', address: '55/12 Trương Định, Phú Lợi, Hồ Chí Minh 70000, Việt Nam' }
  assert.ok(!about('Không gian rộng rãi, yên tĩnh … Dr Quy Study Space, Ho Chi Minh City', venue))
  assert.ok(about('55/12 Trương Định, P Phú Lợi. Tại YÊN Study Coffee', venue, { url: 'https://www.facebook.com/yenstudycafe/posts/1' }))
})

test('a place name alone never makes the case, however many there are', () => {
  const venue = { name: 'Cà phê Với', address: '130 Lê Hồng Phong, Phú Lợi, Hồ Chí Minh, Việt Nam' }
  assert.ok(!about('Đi cà phê với hội bạn ở Phú Lợi, Sài Gòn', venue))
  assert.ok(about('Cà phê Với - 130 Lê Hồng Phong, Phú Lợi', venue))
})

test('an account handle is read from the URL, not from a post slug', () => {
  const venue = { name: 'Bún Chả Hương Liên', address: '24 Lê Văn Hưu, Hà Nội' }
  // The slug repeats the caption; it says nothing about who posted it.
  assert.deepEqual(venueEvidence({ title: 'x', url: 'https://www.facebook.com/nhandian/videos/bun-cha-huong-lien/340964322223215/' }, venue), [])
})

test('the street is read past house numbers and abbreviations', () => {
  assert.deepEqual(streetOf('172/8 Trần Văn Ơn, Phú Lợi, Hồ Chí Minh'), { street: 'tran van on', number: '172' })
  assert.deepEqual(streetOf('Đ. Nguyễn Bình, Phú Lợi'), { street: 'nguyen binh', number: null })
  assert.deepEqual(streetOf('24 P. Lê Văn Hưu, Hai Bà Trưng'), { street: 'le van huu', number: '24' })
  assert.deepEqual(streetOf('05 Nguyễn Du, Huế'), { street: 'nguyen du', number: '5' })
  assert.deepEqual(streetOf('lô 15 P. Thế Lữ, Hồng Bàng'), { street: 'the lu', number: '15' })
  assert.deepEqual(streetOf('Đường số 5, Bình Tân'), { street: null, number: null })
})

test('a one-word name is searched together with the next part of its listing', () => {
  assert.equal(searchName('Helios - Tiệm Ăn Hàn Quốc - Thủ Dầu Một'), 'Helios Tiệm Ăn Hàn Quốc')
  assert.equal(searchName('Bún Chả Hương Liên'), 'Bún Chả Hương Liên')
})

// The rules below use invented venues on purpose: they are about kinds of
// mistake, not about any one restaurant.

test('an account whose name only starts with the venue name is someone else', () => {
  const venue = { name: 'Nhà Hàng Sen Vàng', address: '12 Lê Lợi, Hải Châu, Đà Nẵng' }
  assert.deepEqual(venueEvidence({ title: 'x', author: 'Nhà Hàng Sen Vàng Official' }, venue), ['account'])
  assert.deepEqual(venueEvidence({ title: 'x', author: 'Nhà Hàng Sen Vàng Quy Nhơn' }, venue), [])
})

test('a street shared by a whole row of shops needs the house number', () => {
  const venue = { name: 'Quán Mây Hồng', address: '58/44 Đ. Hàng Mành, Hoàn Kiếm, Hà Nội' }
  assert.deepEqual(venueEvidence({ title: '122 Hàng Mành, Hoàn Kiếm' }, venue), ['locality'])
  assert.deepEqual(venueEvidence({ title: '58/44 Hàng Mành' }, venue), ['street'])
})

test('an address elsewhere rules a post out, even with the name in it', () => {
  const venue = { name: 'Bún Cá Cô Ba', address: '5 Trần Phú, Hải Châu, Đà Nẵng' }
  assert.ok(about('Bún Cá Cô Ba Đà Nẵng, ngon lắm', venue))
  assert.ok(!about('Bún Cá Cô Ba Đà Nẵng, ở số 40 Nguyễn Văn Linh', venue))
  assert.ok(!about('Bún Cá Cô Ba cs2 - 17 Hùng Vương, Đà Nẵng', venue))
  // A list of places that includes this one's address is fine.
  assert.ok(about('1. Bún Cá Cô Ba - 5 Trần Phú 2. Mì Quảng Bà Mua - địa chỉ 19 Trần Bình Trọng', venue))
})

test('a longer name is a different venue', () => {
  const venue = { name: 'Quán Gió Biển', address: '9 Võ Nguyên Giáp, Sơn Trà, Đà Nẵng' }
  assert.ok(!about('Ghé Quán Gió Biển Hải Yến nhé, hải sản tươi, Sơn Trà', venue))
  assert.ok(about('Ghé Quán Gió Biển Sơn Trà nhé, hải sản tươi', venue))
})

test('a one-word name must appear whole, not as a stray syllable', () => {
  const venue = { name: 'Quán Nhàn - Bánh Canh', address: '3 Lê Lợi, Huế' }
  assert.ok(!about('Bánh canh ngon ở Huế, nhàn nhã buổi sáng', venue))
  assert.ok(about('Quán Nhàn - Bánh Canh ở Huế', venue))
})

test('a tag counts only when it says more than the name it repeats', () => {
  const venue = { name: 'Quán Sen Vàng', address: '12 Lê Lợi, Hải Châu, Đà Nẵng' }
  assert.deepEqual(venueEvidence({ title: 'Quán Sen Vàng mùa 9 #QuanSenVang9' }, venue), ['name']) // the tag adds nothing
  assert.deepEqual(venueEvidence({ title: 'ăn tối ở đây #quansenvangdanang' }, venue), ['account'])
})
