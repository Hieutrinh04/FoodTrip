import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectedBusiness, selectedSection, guideGroups } from '../src/lib/portalView.js'
import { accountWorkspaces } from '../src/lib/workspaces.js'

test('portal navigation cannot select a tab or business outside the role scope', () => {
  const staff = [{ id: 'overview' }, { id: 'bookings' }, { id: 'rooms' }]
  assert.equal(selectedSection(staff, 'money', 'overview'), 'overview')
  assert.equal(selectedSection(staff, 'team', 'money'), 'overview')
  assert.equal(selectedSection(staff, 'bookings'), 'bookings')
  assert.equal(selectedSection([], 'team'), null)
  const businesses = [{ id: 'a', role: 'owner' }, { id: 'b', role: 'staff' }]
  assert.equal(selectedBusiness(businesses, 'b').role, 'staff')
  assert.equal(selectedBusiness(businesses, 'someone-elses').id, 'a')
  assert.equal(selectedBusiness([], 'a'), null)
})

test('guide filters use Vietnam dates and retain ongoing groups across midnight', () => {
  const now = Date.parse('2026-10-28T01:00:00+07:00')
  const list = [
    { id: 'tomorrow', title: 'Huế', starts_at: '2026-10-29T08:00:00+07:00', ends_at: '2026-10-29T17:00:00+07:00', guests: [] },
    { id: 'tonight', title: 'Đà Lạt', meeting_point: 'Chợ đêm', starts_at: '2026-10-27T23:00:00+07:00', ends_at: '2026-10-28T03:00:00+07:00', guests: [{ name: 'Hà', seats: 2 }] },
    { id: 'ended', title: 'Hà Nội', starts_at: '2026-10-27T08:00:00+07:00', ends_at: '2026-10-27T17:00:00+07:00', guests: [] },
  ]
  assert.deepEqual(guideGroups(list, { filter: 'today', now }).map((d) => d.id), ['tonight'])
  assert.deepEqual(guideGroups(list, { query: 'cho dem', now }).map((d) => d.id), ['tonight'])
  assert.deepEqual(guideGroups(list, { query: 'ha', now }).map((d) => d.id), ['tonight'])
  assert.deepEqual(guideGroups(list, { now }).map((d) => d.id), ['tonight', 'tomorrow'])
  assert.equal(list[0].id, 'tomorrow', 'filtering must not reorder source data')
})

test('rendered role views hide owner revenue from staff and provide actionable empty/error states', async () => {
  const { createServer } = await import('vite')
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter } = await import('react-router-dom')
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const [{ HotelOverview }, { GuideManifest }, { LanguageProvider }, { default: PortalLoadState }, { default: PortalShell }, { default: RoomInventory }, { default: ListingEditor }, { TourChecklist }, { WorkspaceCards }] = await Promise.all([
      server.ssrLoadModule('/src/pages/Partner.jsx'), server.ssrLoadModule('/src/pages/TourPartner.jsx'),
      server.ssrLoadModule('/src/i18n/LanguageContext.jsx'), server.ssrLoadModule('/src/components/portal/PortalLoadState.jsx'),
      server.ssrLoadModule('/src/components/portal/PortalShell.jsx'), server.ssrLoadModule('/src/components/booking/RoomInventory.jsx'),
      server.ssrLoadModule('/src/components/partner/ListingEditor.jsx'), server.ssrLoadModule('/src/components/tours/TourOnboarding.jsx'),
      server.ssrLoadModule('/src/pages/Account.jsx'),
    ])
    const h = React.createElement
    const render = (node, entry = '/') => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [entry] }, h(LanguageProvider, null, node)))
    const props = { t: (vi) => vi, lang: 'vi', property: { inventory_enabled: true }, bookings: [], rooms: [], today: '2026-10-28', openBookings() {}, openListing() {} }
    const owner = render(h(HotelOverview, { ...props, owner: true }))
    const staff = render(h(HotelOverview, { ...props, owner: false }))
    assert.match(owner, /Doanh thu tháng này/)
    assert.doesNotMatch(staff, /Doanh thu tháng này/)
    assert.match(staff, /Trả phòng hôm nay/)
    const guide = render(h(GuideManifest, { manifest: [], onReload() {} }))
    assert.match(guide, /Chưa có chuyến sắp tới/)
    assert.match(guide, /Tìm đoàn hoặc tên khách/)
    assert.doesNotMatch(guide, /Doanh thu|Tài khoản nhận tiền|Thêm thành viên/)
    const error = render(h(PortalLoadState, { status: 'error', onRetry() {} }))
    assert.match(error, /role="alert"/)
    assert.match(error, /Thử lại/)
    const nav = render(h(PortalShell, { title: 'Cơ sở kiểm thử', sections: [{ id: 'overview', label: 'Tổng quan' }, { id: 'bookings', label: 'Đặt phòng' }], children: (current) => h('p', null, `Open: ${current}`) }), '/partner?tab=bookings&property=b')
    assert.match(nav, /Open: bookings/)
    const room = render(h(RoomInventory, { property: { id: 'b', role: 'staff', active: true } }))
    assert.doesNotMatch(room, /Thêm loại phòng/)
    const suspended = render(h(RoomInventory, { property: { id: 'c', role: 'owner', active: false } }))
    assert.doesNotMatch(suspended, /Thêm loại phòng/)
    const listing = render(h(ListingEditor, { property: { id: 'a' }, t: (vi) => vi }))
    assert.match(listing, /role="status"/)
    assert.doesNotMatch(listing, /0\/6/)
    const checklist = render(h(TourChecklist, { tourId: 'tour-a' }))
    assert.match(checklist, /Đang tải dữ liệu/)
    assert.doesNotMatch(checklist, /0\/\d/)
    const entries = accountWorkspaces({ userId: 'u', status: 'ready', admin: true,
      properties: [{ id: 'stay-b', name: 'Nhà B', role: 'staff', active: false }],
      operators: [{ id: 'tour-a', name: 'Tour A', role: 'manager', status: 'approved' }, { id: 'tour-b', name: 'Tour B', role: 'guide', status: 'approved' }],
    }).filter((e) => e.type !== 'personal')
    const cards = render(h(WorkspaceCards, { entries, lang: 'vi' }))
    assert.match(cards, /Nhân viên lưu trú/)
    assert.match(cards, /Quản lý tour/)
    assert.match(cards, /Cơ sở tạm khoá/)
    assert.match(cards, /href="\/partner\?property=stay-b"/)
    assert.match(cards, /href="\/partner\/tours\?view=guide"/)
    const englishCards = render(h(WorkspaceCards, { entries, lang: 'en' }))
    assert.match(englishCards, /View my groups/)
    assert.match(englishCards, /Property staff/)
  } finally { await server.close() }
})
