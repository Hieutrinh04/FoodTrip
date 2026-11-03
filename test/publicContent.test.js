import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findFoodAnswer } from '../src/lib/assistantAnswers.js'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Landing never advertises the unsupported audience, itinerary or review totals', () => {
  const landing = source('src/pages/Landing.jsx')
  assert.doesNotMatch(landing, /41[.,]?000|180\s*K|9[.,]?200/i)
  assert.doesNotMatch(landing, /\bto:\s*180\b/)
  assert.doesNotMatch(landing, /testimonials|Thảo Nguyên|reviewQuote|c\.trust/)
  assert.match(landing, /to: CITIES\.length/)
  assert.match(landing, /Danh sách minh hoạ/)
  assert.match(landing, /Illustrative list/)
})

test('pho discovery does not trust provider query alone and keeps menu evidence under a different venue name', async () => {
  const venue = (id, name, rating = 4.5, extra = {}) => ({ id, name: { vi: name }, address: { vi: 'Hà Nội' }, city: 'hanoi', category: 'food', googleRating: rating, googleRatingCount: 500, ...extra })
  const wrong = venue('wrong', 'Bún Thang Thanh Thanh gia truyền', 4.9)
  const pho = venue('pho', 'Phở Bát Đàn', 4.4)
  const menu = venue('menu', 'Bếp nhà', 4.7, { menu: [{ name: 'Phở bò tái' }] })
  const desc = venue('desc', 'Quán gia đình', 4.6, { shortDesc: { vi: 'Phục vụ phở gà buổi sáng' } })
  const negative = venue('negative', 'Bún quán', 4.9, { description: { vi: 'Không bán phở' } })
  const street = venue('street', 'Bún phố cổ', 4.9, { shortDesc: { vi: 'Quán bún trong phố cổ' } })
  const options = { catalog: async () => [], locate: async () => ({}), search: async () => ({ places: [wrong, street, menu, negative, desc, pho] }) }
  const out = await findFoodAnswer('quán phở ngon ở Hà Nội', [], { cityId: 'hanoi' }, 'vi', options)
  assert.deepEqual(out.places.map((p) => p.id), ['pho', 'menu', 'desc'])
  const noMatch = await findFoodAnswer('quán phở ngon ở Hà Nội', [], { cityId: 'hanoi' }, 'vi', { ...options, search: async () => ({ places: [wrong, negative] }) })
  assert.equal(noMatch.places, undefined)
  assert.match(noMatch.text, /chưa tìm thấy quán phở/)
  const db = await findFoodAnswer('quán phở ngon ở Hà Nội', [], { cityId: 'hanoi' }, 'en', { ...options, catalog: async () => [wrong, menu, negative, desc, pho], search: async () => { throw new Error('No live query needed') } })
  assert.deepEqual(db.places.map((p) => p.id), ['pho', 'menu', 'desc'])
})

test('Hotelbeds test prices are labelled as reference prices in both languages and chat knowledge', async () => {
  const { FAQ } = await import('../supabase/functions/_shared/assistant/faq.js')
  const budgetFaq = FAQ.find((e) => e.id === 'book-budget')
  // Find by content if the FAQ identifier changes.
  const entry = budgetFaq ?? FAQ.find((e) => e.a.vi.includes('35%'))
  assert.match(entry.a.vi, /Hotelbeds.*thử nghiệm.*chưa phải giá đặt được/)
  assert.match(entry.a.en, /Hotelbeds.*test environment.*not bookable/)
})

test('rendered public content uses bilingual reference labels, neutral wording and privacy navigation', async () => {
  const { createServer } = await import('vite')
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter } = await import('react-router-dom')
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  const oldWindow = globalThis.window
  try {
    const [{ LanguageProvider }, { default: HotelCard }, { default: InfoPage }, { default: Footer }, { default: EmptyState }, { default: PlaceAssessment }, { default: Landing }] = await Promise.all([
      server.ssrLoadModule('/src/i18n/LanguageContext.jsx'), server.ssrLoadModule('/src/components/booking/HotelCard.jsx'),
      server.ssrLoadModule('/src/pages/InfoPage.jsx'), server.ssrLoadModule('/src/components/layout/Footer.jsx'),
      server.ssrLoadModule('/src/components/ui/EmptyState.jsx'), server.ssrLoadModule('/src/components/assistant/PlaceAssessment.jsx'),
      server.ssrLoadModule('/src/pages/Landing.jsx'),
    ])
    const h = React.createElement
    const ServerContent = ({ children }) => { delete globalThis.window; return children }
    const render = (node, lang) => {
      // Only select the provider's initial language; effects/network writes do not run in SSR.
      globalThis.window = { localStorage: { getItem: () => lang } }
      return renderToStaticMarkup(h(MemoryRouter, null, h(LanguageProvider, null, h(ServerContent, null, node))))
    }
    for (const lang of ['vi', 'en']) {
      const card = render(h(HotelCard, { hotel: { id: 'test-hotel', name: 'Test hotel', priceSource: 'hotelbeds', priceFrom: 700000 }, showCompareLinks: false }), lang)
      assert.match(card, lang === 'vi' ? /giá tham khảo từ nhà cung cấp — chưa phải giá đặt được/ : /provider reference price — not a bookable rate/)
      assert.doesNotMatch(card, /text-herb|live rate|giá thật/i)
      const privacy = render(h(InfoPage, { page: 'privacy' }), lang)
      assert.match(privacy, /<h1\b/)
      assert.match(privacy, /Supabase Auth/)
      assert.match(privacy, lang === 'vi' ? /lọc này không bảo đảm/ : /does not guarantee removal/)
      const terms = render(h(InfoPage, { page: 'terms' }), lang)
      assert.match(terms, /SePay/)
      assert.match(terms, /VNPay sandbox/)
      const footer = render(h(Footer), lang)
      assert.match(footer, /href="\/privacy"/)
      assert.doesNotMatch(footer, /AI Itinerary|Lịch trình AI/)
      const help = render(h(InfoPage, { page: 'help' }), lang)
      const about = render(h(InfoPage, { page: 'about' }), lang)
      const assessment = render(h(PlaceAssessment, { place: { name: { vi: 'Test' } }, lang }), lang)
      assert.doesNotMatch(help + about + assessment, /\bAI\b|API.key|project map-service key|khóa dịch vụ/)
      assert.match(assessment, lang === 'vi' ? /Phân tích dữ liệu quán/ : /Place data analysis/)
      const landing = render(h(Landing), lang)
      assert.doesNotMatch(landing, /FoodTrip AI/)
      assert.match(landing, /bg-\[#17130f\]\/95/)
      assert.match(landing, /sm:border-r/)
    }
    const h1 = render(h(EmptyState, { headingAs: 'h1', title: 'Missing' }), 'en')
    const h2 = render(h(EmptyState, { title: 'Missing' }), 'en')
    assert.match(h1, /<h1 class="font-display text-xl font-bold">Missing<\/h1>/)
    assert.equal(h1.replaceAll('h1', 'h2'), h2, 'only the semantic heading changes')
  } finally {
    if (oldWindow === undefined) delete globalThis.window
    else globalThis.window = oldWindow
    await server.close()
  }
})

test('privacy route and missing-page heading call sites remain wired', () => {
  assert.match(source('src/App.jsx'), /path="\/privacy" element=\{<InfoPage page="privacy"/)
  // These pages start with async loading in SSR; their resolved not-found wiring is checked here.
  for (const file of ['src/pages/SharedTrip.jsx', 'src/pages/TourPage.jsx', 'src/pages/BookingRoom.jsx']) assert.match(source(file), /headingAs="h1"/)
})
