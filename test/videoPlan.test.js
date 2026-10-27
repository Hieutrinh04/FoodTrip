import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCaption, listedPlaces, sameHouse } from '../supabase/functions/_shared/captionSignals.js'
import { readPlan, slotFor } from '../supabase/functions/_shared/videoPlan.js'

const TOP6 = `Các quán Ninh đã gọi:
- 00:50 Phở Khôi - 50 Hàng Vải, Hàng Bồ, Hoàn Kiếm, Hà Nội
- 04:19 Sữa chua thạch lá nếp Huyền Vi - 5B Đinh Liệt, Hoàn Kiếm, Hà Nội
- 10:10 Chả cá Thăng Long - 6B Đường Thành, Hoàn Kiếm, Hà Nội
Đừng quên follow và subscribe mình nhé!
✰ Youtube: https://youtube.com/ninhtito
© Bản quyền thuộc về Ninh Titô`

const HUE_TITLE = 'Du Lịch Huế 2 Ngày: Cơm Hến Hoa Đông, Phố Tây Và Phá Tam Giang'
const HUE = `2 ngày ở Huế có gì để trải nghiệm?
Thắng đón hoàng hôn ngay tại homestay, buổi tối ăn cơm niêu Chạn Huế rồi đi bộ dọc phố Tây Võ Thị Sáu.
Sáng hôm sau, Thắng tiếp tục trải nghiệm cơm hến Hoa Đông, rồi rời trung tâm để đi Phá Tam Giang.
Trong video có:

Hoàng hôn ở Huế
Cơm niêu Chạn Huế
Phố Tây Võ Thị Sáu
Cơm hến Hoa Đông
Phá Tam Giang
Trải nghiệm Huế trong 2 ngày

Nếu thấy video hữu ích, nhớ đăng ký kênh.`

test('reads every venue a description lists, with its address, and no channel lines', () => {
  assert.deepEqual(listedPlaces(TOP6), [
    { name: 'Phở Khôi', address: '50 Hàng Vải, Hàng Bồ, Hoàn Kiếm, Hà Nội' },
    { name: 'Sữa chua thạch lá nếp Huyền Vi', address: '5B Đinh Liệt, Hoàn Kiếm, Hà Nội' },
    { name: 'Chả cá Thăng Long', address: '6B Đường Thành, Hoàn Kiếm, Hà Nội' },
  ])
  // Lines under "Trong video có:" — headings, sunsets and "2 ngày" are not places.
  assert.deepEqual(listedPlaces(HUE).map((p) => p.name), ['Cơm niêu Chạn Huế', 'Phố Tây Võ Thị Sáu', 'Cơm hến Hoa Đông', 'Phá Tam Giang'])
  const r = analyzeCaption('TOP 6 QUÁN NGON QUẬN HOÀN KIẾM // Phở KHÔI', { description: TOP6 })
  assert.equal(r.queries.find((q) => q.startsWith('Chả cá')), 'Chả cá Thăng Long, 6B Đường Thành, Hoàn Kiếm, Hà Nội')
  assert.equal(r.addresses[r.names.findIndex((n) => n === 'Chả cá Thăng Long')], '6B Đường Thành, Hoàn Kiếm, Hà Nội')
})

test('tells a branch by its house number and street', () => {
  assert.equal(sameHouse('6B Đường Thành, Hoàn Kiếm', '6B P. Đường Thành, Cửa Đông, Hoàn Kiếm'), true)
  assert.equal(sameHouse('6B Đường Thành', '17A P. Chả Cá, Hoàn Kiếm'), false)
  assert.equal(sameHouse('4A Hàng Vải', '4A P. Hàng Vải, Phố cổ'), true)
  assert.equal(sameHouse('1 Đinh Liệt', '1A P. Đinh Liệt'), false)
  assert.equal(sameHouse(null, '1 Đinh Liệt'), false)
})

test('reads an itinerary: day by day, at the times the video gives', () => {
  const mentions = ['Cơm Hến Hoa Đông', 'Cơm niêu Chạn Huế', 'Phố Tây Võ Thị Sáu', 'Phá Tam Giang'].map((said, i) => ({ said, placeId: `p${i}` }))
  const plan = readPlan(`${HUE_TITLE}\n${HUE}`, mentions, { title: HUE_TITLE })
  assert.equal(plan.duration, 2)
  assert.deepEqual(plan.days.map((d) => d.map((s) => `${s.time} ${s.said}`)), [
    ['19:00 Cơm niêu Chạn Huế', '20:00 Phố Tây Võ Thị Sáu'],
    ['07:30 Cơm Hến Hoa Đông', '08:30 Phá Tam Giang'],
  ])
  assert.equal(plan.days[0][0].slot, 'dinner')
})

test('reads day markers, clock times, and a length said without markers', () => {
  const text = 'Đà Lạt 2N1Đ. Ngày 1: 7h ăn bánh căn Nhà Chung, 12h cơm Bà Nhị. Ngày 2: sáng cà phê Túi Mơ To, trưa lẩu gà lá é Tao Ngộ'
  const plan = readPlan(text, ['bánh căn Nhà Chung', 'cơm Bà Nhị', 'cà phê Túi Mơ To', 'lẩu gà lá é Tao Ngộ'].map((said) => ({ said })))
  assert.deepEqual(plan.days.map((d) => d.map((s) => `${s.time} ${s.said}`)), [
    ['07:00 bánh căn Nhà Chung', '12:00 cơm Bà Nhị'],
    ['07:30 cà phê Túi Mơ To', '12:00 lẩu gà lá é Tao Ngộ'],
  ])
  // "3 ngày" and nothing else: the stops spread over the days, in order.
  const spread = readPlan('Lịch trình Hà Nội 3 ngày: Phở Thìn, Bún chả Hương Liên, Chả cá Lã Vọng', ['Phở Thìn', 'Bún chả Hương Liên', 'Chả cá Lã Vọng'].map((said) => ({ said })))
  assert.deepEqual(spread.days.map((d) => d.map((s) => s.said)), [['Phở Thìn'], ['Bún chả Hương Liên'], ['Chả cá Lã Vọng']])
  assert.equal(slotFor('21:30'), 'evening')
})

test('a top list or a single review is not an itinerary', () => {
  const top = readPlan(`TOP 6 QUÁN NGON QUẬN HOÀN KIẾM\n${TOP6}`, ['Phở Khôi', 'Sữa chua thạch lá nếp Huyền Vi', 'Chả cá Thăng Long'].map((said) => ({ said })))
  assert.equal(top, null)
  assert.equal(readPlan('Bánh xèo 7 Tới ngon nhất Cần Thơ', [{ said: 'Bánh xèo 7 Tới' }]), null)
  // The same venue said twice is one stop.
  const twice = readPlan('Food tour: Phở Thìn rồi Bún chả Hương Liên, quay lại Phở Thìn', [{ said: 'Phở Thìn', placeId: 'a' }, { said: 'Bún chả Hương Liên', placeId: 'b' }, { said: 'phở thìn', placeId: 'a' }])
  assert.equal(twice.days.flat().length, 2)
})
