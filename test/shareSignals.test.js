import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCaption, citiesIn, spokenNames } from '../supabase/functions/_shared/captionSignals.js'
import { matchKnown, distinctiveCore } from '../supabase/functions/_shared/knownPlaces.js'
import { coreName, sameVenue } from '../supabase/functions/_shared/placeNames.js'
import { parseTikTokPage, parseYoutubeVideos, vttText } from '../supabase/functions/_shared/videoPage.js'

test('reads venue names from captions that give one', () => {
  const cases = [
    ['Trải nghiệm quán cà phê Bình Minh ơi tại Đà Lạt 🥰', 'Bình Minh'],
    ['Về Cái Răng thưởng thức món Bánh Xèo 7 Tới ngon nức tiếng ở Cần Thơ', 'Bánh Xèo 7 Tới'],
    ['Hải sản Mộc quán Đà Nẵng ( Moc Seafood ) # seafood # danang', 'Moc Seafood'],
    ['Discover Xóm Mới Garden in Nha Trang', 'Xóm Mới Garden'],
    ['Bánh xèo chú 7 Tới Cần Thơ', 'chú 7 Tới'],
    ['Cơm hến Hoa Đông ở thôn Vỹ Dạ , Huế', 'Hoa Đông'],
    // Mostly capitalised, yet "ốc đã đời" is the food and 534 starts the address.
    ['Ăn ốc đã đời 📍 Quán Ốc Oanh 534 Vĩnh Khánh Quận 4 Sài Gòn', 'Quán Ốc Oanh'],
  ]
  for (const [caption, venue] of cases) {
    const r = analyzeCaption(caption)
    assert.ok(r.hasVenue, caption)
    assert.ok(r.names.some((n) => sameVenue(n, venue)), `${caption} → ${r.names.join(' | ')}`)
  }
})

test('stays silent on captions that name no venue', () => {
  for (const caption of [
    'Top 7 quán cơm phần ngon ở Cần Thơ # comphancantho',
    'Đặc sản Hà Nội: 10 món ngon nhất nên thử',
    'Cách làm BÁNH XÈO MIỀN TÂY chuẩn vị , giòn rụm',
    'Tổng hợp 8 quán đạt Michelin mà tui đã ăn ở Hà Nội ...',
    'Món Ngon Hà Nội : 7 Ngày Ăn Gì ?',
    'cà phê trứng ngon nhất Hà Nội',
  ]) assert.equal(analyzeCaption(caption).hasVenue, false, caption)
})

test('reads pins, addresses and cities', () => {
  const r = analyzeCaption('Ăn tối cực đã 📍 Quán Ốc Oanh - 534 Vĩnh Khánh, Quận 4')
  assert.equal(r.pin, 'Quán Ốc Oanh - 534 Vĩnh Khánh, Quận 4')
  assert.equal(analyzeCaption('Địa chỉ: 283/2 Linh Đông, Thủ Đức').address, '283/2 Linh Đông, Thủ Đức')
  assert.deepEqual(citiesIn('Đi Sài Gòn rồi ra Hà Nội'), ['TP. Hồ Chí Minh', 'Hà Nội'])
  assert.deepEqual(analyzeCaption('Quán cơm Nam Đô ở Cần Thơ').queries, ['Quán cơm Nam Đô Cần Thơ'])
})

test('reads the caption and location tag from a TikTok page, the description from the YouTube API', () => {
  const item = { desc: 'Must-visit seafood #danang', author: { nickname: 'Ady' }, poi: { name: 'Mộc quán Seafood Đà Nẵng', address: '26 Tô Hiến Thành, An Hải', city: 'Da Nang', ttTypeNameMedium: 'Nhà hàng hải sản' } }
  const tiktok = `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: item } } } })}</script></html>`
  assert.deepEqual(parseTikTokPage(tiktok), {
    caption: 'Must-visit seafood #danang', author: 'Ady',
    location: { name: 'Mộc quán Seafood Đà Nẵng', address: '26 Tô Hiến Thành, An Hải', city: 'Da Nang', type: 'Nhà hàng hải sản' },
    area: '', subtitleUrl: null, hints: [], isPhoto: false, images: [], authorId: '', id: '', commentCount: 0,
  })
  assert.equal(parseTikTokPage('<html>captcha</html>'), null)
  assert.equal(parseTikTokPage(tiktok.replace(/"poi":\{[^}]*\}/, '"poi":{}')).location, null)
  assert.equal(parseYoutubeVideos({ items: [{ snippet: { description: ' QUÁN BÁNH XÈO 7 TỚI\nĐịa chỉ: 45 Hoàng Quốc Việt ' } }] }), 'QUÁN BÁNH XÈO 7 TỚI\nĐịa chỉ: 45 Hoàng Quốc Việt')
  assert.equal(parseYoutubeVideos({ items: [] }), '')
  assert.equal(parseYoutubeVideos(null), '')
  // A name stops at the end of a line.
  const r = analyzeCaption('Về Cần Thơ ăn bánh xèo\nQUÁN BÁNH XÈO 7 TỚI\nĐịa chỉ: 45 Hoàng Quốc Việt, Ninh Kiều')
  assert.ok(r.names.some((n) => sameVenue(n, 'Bánh Xèo 7 Tới')), r.names.join(' | '))
  assert.ok(!r.names.some((n) => /Địa/.test(n)), r.names.join(' | '))
  assert.equal(r.address, '45 Hoàng Quốc Việt, Ninh Kiều')
})

test('hears the venue name the reviewer says, and searches in a tagged city', () => {
  const said = 'bữa nay giới thiệu cho cả nhà một cái quán ăn ngay bờ sông Bạch Đằng luôn nha quán có tên là khét BBQ nha nay là mô hình gọi món'
  assert.deepEqual(spokenNames(said), ['khét BBQ'])
  assert.deepEqual(spokenNames('tên quán là Bếp Nhà Mây nè mọi người'), ['Bếp Nhà Mây'])
  assert.deepEqual(spokenNames('nhà hàng này tên Sen Hồng ở quận 1'), ['Sen Hồng'])
  assert.deepEqual(spokenNames('tên của tui là Tâm nha'), [], 'a person, not a venue')
  const r = analyzeCaption('Phát hiện quán ăn bên sông Bạch Đằng view chill siêu mát mẻ 💫 #thudaumot', { spoken: said, area: 'Thu Dau Mot, Binh Duong, Vietnam' })
  assert.deepEqual(r.queries, ['khét BBQ Bình Dương'])
  // A city tag is an area to search in, a venue tag is the venue.
  const page = (poi) => `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { desc: 'x', poi, video: { subtitleInfos: [{ LanguageCodeName: 'eng-US', Url: 'https://v16-webapp.tiktok.com/en' }, { LanguageCodeName: 'vie-VN', Url: 'https://v16-webapp.tiktok.com/vi' }] } } } } } })}</script>`
  const city = parseTikTokPage(page({ name: 'Thu Dau Mot', address: 'Binh Duong, Vietnam', category: 'Địa điểm và địa chỉ', ttTypeNameTiny: 'Thành phố' }))
  assert.equal(city.location, null)
  assert.equal(city.area, 'Thu Dau Mot, Binh Duong, Vietnam')
  assert.equal(city.subtitleUrl, 'https://v16-webapp.tiktok.com/vi')
  assert.deepEqual(city.hints, [])
  assert.equal(parseTikTokPage(page({ name: 'Mộc quán', category: 'Thực phẩm và đồ uống', ttTypeNameTiny: 'Nhà hàng hải sản' })).location.name, 'Mộc quán')
  assert.equal(parseTikTokPage(page(null).replace('v16-webapp.tiktok.com/vi', 'evil.example.com/vi').replace('v16-webapp.tiktok.com/en', 'evil.example.com/en')).subtitleUrl, null)
  assert.equal(vttText('WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nquán có tên\n\n2\n00:00:02.000 --> 00:00:03.000\nlà <i>khét</i> BBQ'), 'quán có tên là khét BBQ')
})

test('reads a description warily, after the title', () => {
  // Playlist headings are not venues.
  const recipe = analyzeCaption('BÁNH XÈO GIÒN - cách pha bột đổ bánh xèo giòn xốp', { description: 'MỨT TẾT\nhttps://youtube.com/playlist?list=x\nMÓN NGON TỪ CƠM NGUỘI\nhttps://youtube.com/playlist?list=y' })
  assert.equal(recipe.hasVenue, false, recipe.names.join(' | '))
  // The venue and address under a title that names none.
  const r = analyzeCaption('Ăn gì ở Cần Thơ?', { description: 'QUÁN BÁNH XÈO 7 TỚI\nĐịa chỉ: 45 Hoàng Quốc Việt, Ninh Kiều, Cần Thơ' })
  assert.ok(r.names.some((n) => sameVenue(n, 'Bánh Xèo 7 Tới')), r.names.join(' | '))
  assert.equal(r.address, '45 Hoàng Quốc Việt, Ninh Kiều, Cần Thơ')
  // The same venue in title and description is one name.
  assert.equal(analyzeCaption('Bánh Xèo 7 Tới ở Cần Thơ', { description: 'QUÁN BÁNH XÈO 7 TỚI' }).names.length, 1)
})

test('recognises known venues only by distinctive names, in the right city', () => {
  const places = [
    { place_id: 'a', name: 'Quán Bánh xèo 7 Tới', core: coreName('Quán Bánh xèo 7 Tới'), city: 'Cần Thơ', confirmations: 0 },
    { place_id: 'b', name: 'Quán Ngon Phố Cổ', core: coreName('Quán Ngon Phố Cổ'), city: 'Hà Nội', confirmations: 0 },
    { place_id: 'c', name: 'Mê Linh Coffee Garden', core: coreName('Mê Linh Coffee Garden'), city: 'Đà Lạt', confirmations: 0 },
  ]
  assert.deepEqual(matchKnown('Ăn bánh xèo 7 tới ở Cần Thơ ngon xỉu', places).map((m) => m.place.place_id), ['a'])
  assert.deepEqual(matchKnown('món ngon phố cổ Hà Nội', places), [], 'generic words are not a venue')
  assert.deepEqual(matchKnown('Bánh Xèo 7 Tới ở Hà Nội', places), [], 'a venue in another city is left out')
  assert.equal(distinctiveCore(coreName('Quán Ăn Ngon')), false)
  // A remembered alias wins: the caption says "chú 7 Tới", the person picked place a.
  const viaAlias = matchKnown('Đi Cần Thơ phải thử chú 7 Tới', places, [{ alias: 'chu 7 toi', place_id: 'a', hits: 2 }])
  assert.equal(viaAlias[0]?.place.place_id, 'a')
  assert.equal(viaAlias[0]?.via, 'alias')
})
