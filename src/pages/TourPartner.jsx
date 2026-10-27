import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { SquaresFour, Compass, CalendarBlank, CalendarCheck, Storefront, UsersThree, Wallet, Flag, ChatCircleText, ArrowSquareOut } from '@phosphor-icons/react'
import { tourStatusLabel, tourDate, tourError, tourMoney, tourRows, tourRpc, vnDate, vnTime, OPERATOR_TYPES, operatorStatement } from '../lib/tours.js'
import PortalShell, { StatCard, PortalCard } from '../components/portal/PortalShell.jsx'
import TourContentEditor from '../components/tours/TourContentEditor.jsx'
import TourApplication from '../components/tours/TourApplication.jsx'
import { OperatorChecklist, TourChecklist } from '../components/tours/TourOnboarding.jsx'
import PartnerReviews from '../components/reviews/PartnerReviews.jsx'
import './Tours.css'

/** The page language as `t(vi, en)`, plus `lang` for helpers that format dates and errors. */
function useT() {
  const { lang } = useLanguage()
  return { lang, t: (vi, en) => (lang === 'vi' ? vi : en) }
}

// Server permissions remain authoritative; these forms only expose actions
// for the selected operator and never set a user's global account role.
export default function TourPartner() {
  const { user } = useAuth()
  return <TourPartnerAccount key={user?.id ?? 'guest'} />
}

function TourPartnerAccount() {
  const { user, loading } = useAuth()
  const { t, lang } = useT()
  const [data, setData] = useState(null)
  const [tick, setTick] = useState(0)
  const [error, setError] = useState('')
  const [auth, setAuth] = useState(false)
  const [operatorId, setOperatorId] = useState('')
  // Bumped when the operator profile or terms change: every tour's checklist depends on them.
  const [profileTick, setProfileTick] = useState(0)
  const reload = () => setTick((n) => n + 1)
  useEffect(() => {
    let active = true; setData(null); setError('')
    if (!user) return () => { active = false }
    Promise.all([tourRows('tour_operators'),tourRows('tour_members'),tourRows('tours'),tourRows('tour_departures'),tourRows('tour_reservations'),tourRpc('tour_guide_manifest')])
      .then(([operators,members,tours,departures,bookings,manifest]) => { if (active) setData({ operators,members,tours,departures,bookings,manifest }) })
      .catch((e) => { if (active) setError(tourError(e, lang)) })
    return () => { active = false }
  }, [user, tick, lang])

  const operators = data?.operators.filter((o) => o.status === 'approved' && data.members.some((m) => m.operator_id===o.id && m.user_id===user?.id && ['owner','manager'].includes(m.role))) ?? []
  const operator = operators.find((o) => o.id===operatorId) ?? operators[0]
  const owner = data?.members.some((m) => m.operator_id===operator?.id && m.user_id===user?.id && m.role==='owner')
  const isGuide = data?.members.some((m) => m.user_id===user?.id && m.role==='guide')

  // Not (yet) running an operator: the sign-up, its waiting state, or the guide's own view.
  if (!operator) {
    return <div className="tour-page"><span className="eyebrow">{t('Cổng đối tác tour', 'Tour partner portal')}</span><h1>{t('Quản lý tour & đoàn khách', 'Manage tours & groups')}</h1>
      {loading && <p role="status">{t('Đang kiểm tra tài khoản…', 'Checking your account…')}</p>}
      {!loading && !user && <button className="tour-primary" onClick={() => setAuth(true)}>{t('Đăng nhập cổng đối tác', 'Sign in to the partner portal')}</button>}
      {error && <p role="alert" className="tour-error">{error}</p>}
      {user && !data && !error && <p role="status">{t('Đang tải dữ liệu đối tác…', 'Loading partner data…')}</p>}
      {data && <>
        {data.operators.filter((o) => o.applicant_id===user.id && o.status==='pending').map((o) => <div key={o.id} className="tour-card">
          <h2>{t(`Hồ sơ “${o.name}” đang chờ duyệt`, `“${o.name}” is waiting for review`)}</h2>
          <p className="text-ink-muted">{t(
            `FoodTrip sẽ gọi ${o.phone ? `số ${o.phone}` : 'số điện thoại bạn đã khai'} để xác minh và duyệt trong 1–3 ngày làm việc. Khi được duyệt, trang này hiện danh sách việc cần làm để công bố tour đầu tiên.`,
            `FoodTrip will call ${o.phone ? o.phone : 'the phone number you gave'} to verify and review within 1–3 working days. Once approved, this page shows what is left to publish your first tour.`,
          )}</p>
        </div>)}
        {isGuide && <GuideManifest manifest={data.manifest} />}
        {!isGuide && !data.operators.some((o) => o.applicant_id===user.id && ['pending','approved'].includes(o.status)) && (
          <TourApplication onDone={reload} rejected={data.operators.filter((o) => o.applicant_id===user.id && o.status==='rejected').sort((x, y) => y.created_at.localeCompare(x.created_at))[0]} />
        )}
      </>}
      {auth && <AuthModal onClose={() => setAuth(false)} />}
    </div>
  }

  const tours = data.tours.filter((x) => x.operator_id===operator.id)
  const tourIds = new Set(tours.map((x) => x.id))
  const departures = data.departures.filter((d) => tourIds.has(d.tour_id))
  const departureIds = new Set(departures.map((d) => d.id))
  const reservations = data.bookings.filter((b) => departureIds.has(b.departure_id))
  const requested = reservations.filter((b) => b.status==='requested').length
  const sections = [
    { id: 'overview', label: t('Tổng quan', 'Overview'), icon: SquaresFour },
    { id: 'tours', label: t('Tour', 'Tours'), icon: Compass, badge: tours.some((x) => !x.published) ? tours.filter((x) => !x.published).length : null },
    { id: 'departures', label: t('Lịch khởi hành', 'Departures'), icon: CalendarBlank },
    { id: 'reservations', label: t('Đơn giữ chỗ', 'Reservations'), icon: CalendarCheck, badge: requested || null },
    { id: 'reviews', label: t('Đánh giá', 'Reviews'), icon: ChatCircleText },
    { id: 'profile', label: t('Hồ sơ đơn vị', 'Operator profile'), icon: Storefront },
    ...(owner ? [{ id: 'team', label: t('Nhân sự', 'Team'), icon: UsersThree }] : []),
    { id: 'money', label: t('Đối soát hoa hồng', 'Commission'), icon: Wallet },
    ...(data.manifest.length || isGuide ? [{ id: 'manifest', label: t('Đoàn của tôi', 'My groups'), icon: Flag }] : []),
  ]
  const ctx = { data, operator, tours, departures, reservations, reload, owner }

  return <>
    <PortalShell
      eyebrow={t('Cổng đối tác tour', 'Tour partner portal')}
      title={operator.name}
      subtitle={[OPERATOR_TYPES[operator.operator_type]?.[lang], operator.cities?.join(', '), owner ? null : t('Bạn là quản lý tour', 'You are a tour manager')].filter(Boolean).join(' · ')}
      switcher={operators.length > 1 && <select value={operator.id} onChange={(e) => setOperatorId(e.target.value)} aria-label={t('Chọn đơn vị', 'Choose operator')} className="rounded-full border border-line bg-surface px-4 py-2 font-utility text-sm font-semibold">{operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
      actions={<button type="button" onClick={reload} className="rounded-full border border-line px-3.5 py-1.5 font-utility text-2xs font-semibold hover:border-chili hover:text-chili">{t('Tải lại', 'Reload')}</button>}
      sections={sections}
    >
      {(section, open) => <div className="tour-page !m-0 !max-w-none !p-0 space-y-5">
        {error && <p role="alert" className="tour-error">{error}</p>}
        {section === 'overview' && <TourOverview ctx={ctx} profileTick={profileTick} onProfileSaved={() => setProfileTick((n) => n + 1)} open={open} />}
        {section === 'tours' && <>
          <details className="tour-card"><summary>+ {t('Tạo tour mới', 'New tour')}</summary><ActionForm key={operator.id} onDone={reload} label={t('Lưu tour nháp', 'Save draft tour')} submit={(f) => tourRpc('tour_create',{ p_operator:operator.id,p_title:f.title,p_destination:f.destination,p_description:f.description,p_meeting:f.meeting })} fields={[
            { key:'title',label:t('Tên tour', 'Tour name'),minLength:3,maxLength:200 },{ key:'destination',label:t('Điểm đến', 'Destination'),minLength:2,maxLength:200 },
            { key:'description',label:t('Mô tả ngắn (chi tiết điền ở "Nội dung trang tour" sau khi tạo)', 'Short description (fill in the full page under "Tour page content" afterwards)'),type:'textarea',minLength:20,maxLength:10000 },
            { key:'meeting',label:t('Địa chỉ điểm hẹn cụ thể', 'Exact meeting point address'),minLength:5,maxLength:500 },
          ]} /></details>
          {tours.map((x) => <ManagedTour key={x.id} tour={x} data={data} reload={reload} profileTick={profileTick} />)}
          {!tours.length && <p className="text-ink-muted">{t('Chưa có tour. Tạo tour nháp, điền nội dung trang tour, thêm lịch khởi hành rồi công bố.', 'No tours yet. Create a draft, fill in the tour page, add departures, then publish.')}</p>}
        </>}
        {section === 'departures' && <DepartureBoard ctx={ctx} />}
        {section === 'reservations' && <ReservationBoard ctx={ctx} />}
        {section === 'reviews' && <PartnerReviews key={operator.id} kind="tour" ownerId={operator.id} lang={lang} />}
        {section === 'profile' && (owner
          ? <OperatorChecklist key={operator.id} operator={operator} onSaved={() => setProfileTick((n) => n + 1)} />
          : <PortalCard title={t('Hồ sơ đơn vị', 'Operator profile')}><p className="text-sm text-ink-muted">{operator.description || t('Chưa có giới thiệu.', 'No description yet.')}</p><p className="mt-2 text-2xs text-ink-faint">{t('Chỉ chủ đơn vị sửa được hồ sơ và điều khoản.', 'Only the owner can edit the profile and terms.')}</p></PortalCard>)}
        {section === 'team' && owner && <OperatorTeam ctx={ctx} />}
        {section === 'money' && <OperatorMoney operator={operator} />}
        {section === 'manifest' && <GuideManifest manifest={data.manifest} />}
      </div>}
    </PortalShell>
  </>
}

/** The operator's day: requests to answer, the week's departures, the month's seats and revenue. */
function TourOverview({ ctx, profileTick, onProfileSaved, open }) {
  const { t, lang } = useT()
  const { operator, tours, departures, reservations, owner } = ctx
  const now = Date.now()
  const week = now + 7 * 864e5
  const month = new Date().toISOString().slice(0, 7)
  const upcoming = departures.filter((d) => Date.parse(d.starts_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const held = (d) => reservations.filter((b) => b.departure_id===d.id && ['requested','confirmed','completed'].includes(b.status)).reduce((sum, b) => sum + b.seats, 0)
  const monthly = reservations.filter((b) => ['confirmed','completed'].includes(b.status) && (departures.find((d) => d.id===b.departure_id)?.starts_at ?? '').slice(0, 7)===month)
  const profileDone = (operator.description ?? '').trim().length >= 30 && operator.terms_accepted_at
  return <>
    {owner && !profileDone && <OperatorChecklist key={`${operator.id}-${profileTick}`} operator={operator} onSaved={onProfileSaved} />}
    {!tours.some((x) => x.published) && <button type="button" onClick={() => open('tours')} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-lantern/50 bg-lantern/10 px-4 py-3 text-left text-sm">
      <span><strong>{t('Chưa có tour nào đang mở bán.', 'No tour is on sale yet.')}</strong> {t('Hoàn thành danh sách kiểm tra của tour (ảnh, giới thiệu, lịch trình, bao gồm, chính sách huỷ, lịch khởi hành) rồi bấm Công bố.', "Complete the tour's checklist (photos, introduction, programme, inclusions, cancellation policy, departures), then press Publish.")}</span>
      <span className="shrink-0 font-semibold text-chili">{t('Đến mục Tour →', 'Go to Tours →')}</span>
    </button>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label={t('Chờ xác nhận', 'To confirm')} value={reservations.filter((b) => b.status==='requested').length} alert={reservations.some((b) => b.status==='requested')} onClick={() => open('reservations')} />
      <StatCard label={t('Chuyến 7 ngày tới', 'Next 7 days')} value={upcoming.filter((d) => Date.parse(d.starts_at) < week).length} onClick={() => open('departures')} />
      <StatCard label={t('Khách tháng này', 'Guests this month')} value={monthly.reduce((sum, b) => sum + b.seats, 0)} hint={t('đã xác nhận / hoàn thành', 'confirmed / completed')} />
      <StatCard label={t('Doanh thu tháng (ước tính)', 'Revenue this month (est.)')} value={tourMoney(monthly.reduce((sum, b) => sum + Number(b.total_price), 0))} hint={t('đơn vị tự thu', 'collected by you')} />
    </div>
    <PortalCard title={t('Chuyến sắp khởi hành', 'Upcoming departures')}>
      {!upcoming.length ? <p className="text-sm text-ink-muted">{t('Chưa có lịch khởi hành sắp tới.', 'No upcoming departures.')}</p> : <ul className="divide-y divide-line">
        {upcoming.slice(0, 6).map((d) => {
          const tour = tours.find((x) => x.id===d.tour_id)
          return <li key={d.id} className="grid grid-cols-[1fr_auto] items-center gap-2 py-2.5 text-sm">
            <span className="min-w-0"><span className="font-semibold">{tour?.title}</span><span className="block text-2xs text-ink-muted">{tourDate(d.starts_at, lang)} · {d.status==='open' ? t('đang nhận khách', 'taking guests') : t('đã đóng', 'closed')}</span></span>
            <SeatBar used={held(d)} capacity={d.capacity} />
          </li>
        })}
      </ul>}
    </PortalCard>
  </>
}

function SeatBar({ used, capacity }) {
  const pct = Math.min(100, Math.round((used / capacity) * 100))
  return <span className="flex items-center gap-2 text-2xs tabular"><span className="h-2 w-24 overflow-hidden rounded-full bg-paper-2"><span className={`block h-full rounded-full ${pct >= 90 ? 'bg-chili' : 'bg-herb'}`} style={{ width: `${pct}%` }} /></span>{used}/{capacity}</span>
}

/** Every departure of every tour, by date: how full, who guides, open or closed. */
function DepartureBoard({ ctx }) {
  const { t, lang } = useT()
  const { data, tours, departures, reservations } = ctx
  const [show, setShow] = useState('upcoming')
  const now = Date.now()
  const list = departures.filter((d) => show==='all' || (show==='upcoming' ? Date.parse(d.ends_at) > now : Date.parse(d.ends_at) <= now))
    .sort((a, b) => (show==='past' ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)))
  const guideName = (id) => data.members.find((m) => m.user_id===id)?.display_name
  const held = (d) => reservations.filter((b) => b.departure_id===d.id && ['requested','confirmed','completed'].includes(b.status)).reduce((sum, b) => sum + b.seats, 0)
  const filters = [['upcoming', t('Sắp tới', 'Upcoming')], ['past', t('Đã qua', 'Past')], ['all', t('Tất cả', 'All')]]
  return <PortalCard title={t('Lịch khởi hành', 'Departures')} actions={<div className="flex gap-1.5">{filters.map(([id, label]) => <button key={id} type="button" onClick={() => setShow(id)} aria-pressed={show===id} className={`rounded-full px-3 py-1 font-utility text-2xs font-semibold ${show===id ? 'bg-ink text-paper' : 'border border-line text-ink-muted'}`}>{label}</button>)}</div>}>
    {!list.length ? <p className="text-sm text-ink-muted">{t('Không có chuyến nào ở mục này. Thêm lịch khởi hành trong mục Tour.', 'Nothing here. Add departures under Tours.')}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
      <thead className="text-left font-utility text-2xs uppercase tracking-wide text-ink-faint"><tr><th className="py-2">{t('Khởi hành', 'Departs')}</th><th>{t('Tour', 'Tour')}</th><th>{t('Hướng dẫn viên', 'Guide')}</th><th>{t('Chỗ', 'Seats')}</th><th>{t('Trạng thái', 'Status')}</th></tr></thead>
      <tbody className="divide-y divide-line">{list.map((d) => <tr key={d.id}>
        <td className="py-2.5 tabular">{tourDate(d.starts_at, lang)}</td>
        <td className="max-w-[220px] truncate">{tours.find((x) => x.id===d.tour_id)?.title}</td>
        <td className="text-ink-muted">{guideName(d.guide_id) || (d.guide_id ? t('Cần phân công lại', 'Needs reassigning') : t('Chưa phân công', 'Unassigned'))}</td>
        <td><SeatBar used={held(d)} capacity={d.capacity} /></td>
        <td><span className={`rounded-full px-2 py-0.5 font-utility text-micro font-semibold ${d.status==='open' ? 'bg-herb/15 text-herb' : 'bg-paper-2 text-ink-muted'}`}>{d.status==='open' ? t('Đang nhận', 'Open') : t('Đã đóng', 'Closed')}</span></td>
      </tr>)}</tbody>
    </table></div>}
    <p className="mt-3 text-2xs text-ink-faint">{t('Sửa giờ, giá, số chỗ, hướng dẫn viên hoặc đóng nhận khách trong mục Tour → tour tương ứng.', 'Change times, prices, seats, the guide, or close a departure under Tours → the tour.')}</p>
  </PortalCard>
}

/** All seat requests across the operator's tours, with the operator's actions. */
function ReservationBoard({ ctx }) {
  const { t, lang } = useT()
  const { tours, departures, reservations, reload } = ctx
  const [filter, setFilter] = useState('requested')
  const [query, setQuery] = useState('')
  const now = Date.now()
  const filters = [['requested', t('Chờ xác nhận', 'To confirm')], ['upcoming', t('Sắp đi', 'Upcoming')], ['completed', t('Đã hoàn thành', 'Completed')], ['cancelled', t('Đã huỷ', 'Cancelled')], ['all', t('Tất cả', 'All')]]
  const dep = (b) => departures.find((d) => d.id===b.departure_id)
  const match = (b, f) => {
    const d = dep(b)
    if (f==='requested') return b.status==='requested'
    if (f==='upcoming') return b.status==='confirmed' && d && Date.parse(d.ends_at) > now
    if (f==='completed') return b.status==='completed' || (b.status==='confirmed' && d && Date.parse(d.ends_at) <= now)
    if (f==='cancelled') return b.status==='cancelled'
    return true
  }
  const q = query.trim().toLowerCase()
  const list = reservations.filter((b) => match(b, filter)).filter((b) => !q || `${b.guest_name} ${b.phone}`.toLowerCase().includes(q))
    .sort((a, b) => (dep(a)?.starts_at ?? '').localeCompare(dep(b)?.starts_at ?? ''))
  return <PortalCard>
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">{filters.map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter===id} className={`shrink-0 rounded-full px-3.5 py-1.5 font-utility text-2xs font-semibold ${filter===id ? 'bg-ink text-paper' : 'border border-line text-ink-muted'}`}>{label}<span className="ml-1 opacity-60">{reservations.filter((b) => match(b, id)).length}</span></button>)}</div>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Tìm tên, số điện thoại…', 'Search name, phone…')} aria-label={t('Tìm đơn', 'Search reservations')} className="!mt-0 md:!max-w-[240px]" />
    </div>
    {!list.length && <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">{t('Không có đơn nào ở mục này.', 'No reservations here.')}</p>}
    <ul className="divide-y divide-line">{list.map((b) => {
      const d = dep(b); const tour = tours.find((x) => x.id===d?.tour_id)
      return <li key={b.id} className="grid gap-3 py-4 md:grid-cols-[1fr_minmax(0,360px)]">
        <div className="min-w-0 space-y-0.5 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-display text-md font-bold">{b.guest_name}</span><span className="rounded-full bg-paper-2 px-2 py-0.5 font-utility text-micro font-semibold">{tourStatusLabel(b.status, lang)}</span></div>
          <div className="text-ink-muted">{tour?.title} · {d ? tourDate(d.starts_at, lang) : ''}</div>
          <div>{t(`${b.seats} người`, `${b.seats} people`)} · {tourMoney(b.total_price)} · <a href={`tel:${b.phone}`} className="text-chili hover:underline">{b.phone}</a></div>
          {b.note && <p className="text-2xs text-ink-faint">{t('Ghi chú', 'Note')}: {b.note}</p>}
        </div>
        {['requested','confirmed'].includes(b.status) && <ActionForm label={t('Cập nhật đơn', 'Update reservation')} onDone={reload} submit={(f) => tourRpc('tour_set_reservation',{ p_booking:b.id,p_status:f.status,p_note:f.note })} fields={[
          { key:'status',label:t('Thao tác', 'Action'),options:b.status==='requested'
            ? [['confirmed',t('Xác nhận chỗ', 'Confirm seats')],['cancelled',t('Huỷ yêu cầu', 'Decline request')]]
            : [['completed',t('Hoàn thành (sau giờ kết thúc)', 'Completed (after it ends)')],['cancelled',t('Huỷ trước khởi hành', 'Cancel before departure')]] },
          { key:'note',label:t('Ghi chú / lý do huỷ', 'Note / reason for cancelling'),required:false,maxLength:2000 },
        ]} />}
      </li>
    })}</ul>
  </PortalCard>
}

/** The owner's team: managers run tours, guides see only the groups they lead. */
function OperatorTeam({ ctx }) {
  const { t } = useT()
  const { data, operator, reload } = ctx
  const team = data.members.filter((m) => m.operator_id===operator.id)
  const ROLE = { owner: t('Chủ đơn vị', 'Owner'), manager: t('Quản lý tour', 'Tour manager'), guide: t('Hướng dẫn viên', 'Guide') }
  return <PortalCard title={t('Nhân sự', 'Team')}>
    <p className="mb-3 text-sm text-ink-muted">{t('Nhập email tài khoản FoodTrip đã có. Quản lý tour thao tác được tour và đơn; hướng dẫn viên chỉ xem đoàn được giao (tên khách, số người).', 'Enter the email of an existing FoodTrip account. Managers run tours and reservations; guides only see the groups they lead (guest names, party size).')}</p>
    <ActionForm key={operator.id} onDone={reload} label={t('Thêm thành viên', 'Add member')} submit={(f) => tourRpc('tour_add_member',{ p_operator:operator.id,p_email:f.email,p_role:f.role })} fields={[
      { key:'email',label:t('Email thành viên', 'Member email'),type:'email' },{ key:'role',label:t('Vai trò', 'Role'),options:[['guide',ROLE.guide],['manager',ROLE.manager]] },
    ]} />
    <ul className="mt-4 divide-y divide-line">{team.map((m) => <li key={m.user_id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
      <span className="min-w-0 truncate">{m.display_name || m.user_id} <span className="text-2xs text-ink-faint">· {ROLE[m.role] ?? m.role}</span></span>
      {m.role!=='owner' && <RemoveMember operatorId={operator.id} member={m} onDone={reload} />}
    </li>)}</ul>
  </PortalCard>
}

function RemoveMember({ operatorId, member, onDone }) {
  const { t, lang } = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    if (!window.confirm(t(`Thu hồi quyền của ${member.display_name || 'thành viên này'}?`, `Remove ${member.display_name || 'this member'}'s access?`))) return
    setBusy(true); setError('')
    try { await tourRpc('tour_remove_member',{ p_operator:operatorId,p_user:member.user_id }); onDone() } catch (e) { setError(tourError(e, lang)); setBusy(false) }
  }
  return <span className="flex items-center gap-2">{error && <span className="text-2xs text-chili">{error}</span>}<button type="button" disabled={busy} onClick={remove} className="tour-secondary !py-1">{t('Thu hồi', 'Remove')}</button></span>
}

/** What the operator owes FoodTrip: commission on finished tours, settled monthly. */
function OperatorMoney({ operator }) {
  const { t, lang } = useT()
  const [statement, setStatement] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { operatorStatement(operator.id).then(setStatement).catch((e) => setError(tourError(e, lang))) }, [operator.id, lang])
  if (error) return <p role="alert" className="tour-error">{error}</p>
  if (!statement) return <p role="status">{t('Đang tải số liệu…', 'Loading figures…')}</p>
  const STATUS = { pending: [t('Chờ thanh toán', 'Awaiting payment'), 'bg-lantern/20 text-lantern'], paid: [t('Đã thanh toán', 'Paid'), 'bg-herb/15 text-herb'] }
  return <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard label={t('Hoa hồng chờ đối soát', 'Commission to settle')} value={tourMoney(statement.unsettled.commission)} hint={t(`${statement.unsettled.count} đơn hoàn thành · ${tourMoney(statement.unsettled.gross)}`, `${statement.unsettled.count} completed · ${tourMoney(statement.unsettled.gross)}`)} />
      <StatCard label={t('Đơn đang chạy', 'Open reservations')} value={tourMoney(statement.upcoming.gross)} hint={t(`${statement.upcoming.count} đơn chờ / đã xác nhận`, `${statement.upcoming.count} requested / confirmed`)} />
      <StatCard label={t('Mức hoa hồng', 'Commission rate')} value={`${Number(statement.commission_pct)}%`} hint={t('theo điều khoản tour đã ký', 'under the tour terms you accepted')} />
    </div>
    <PortalCard title={t('Các kỳ đối soát', 'Settlements')}>
      <p className="mb-3 text-sm text-ink-muted">{t('Đơn vị tự thu tiền tour của khách. FoodTrip lập bảng đối soát hoa hồng cho các đơn đã hoàn thành; đơn vị thanh toán trong 7 ngày.', 'You collect tour payments from guests. FoodTrip issues a commission statement for completed reservations, payable within 7 days.')}</p>
      {!statement.settlements.length ? <p className="text-sm text-ink-muted">{t('Chưa có kỳ đối soát nào.', 'No settlements yet.')}</p> : <ul className="divide-y divide-line">{statement.settlements.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
        <span>{t('Đến', 'To')} {new Date(`${s.period_end}T12:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')} · {t(`${s.item_count} đơn`, `${s.item_count} reservations`)} · {t('hoa hồng', 'commission')} <strong>{tourMoney(s.commission)}</strong> <span className="text-2xs text-ink-faint">({Number(s.commission_pct)}% × {tourMoney(s.gross)})</span></span>
        <span className="flex items-center gap-2">{s.reference && <span className="font-utility text-2xs text-ink-faint">{s.reference}</span>}<span className={`rounded-full px-2 py-0.5 font-utility text-micro font-semibold ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span></span>
      </li>)}</ul>}
    </PortalCard>
  </>
}

/** A guide's groups: who is coming, how many, where to meet. */
function GuideManifest({ manifest }) {
  const { t, lang } = useT()
  return <PortalCard title={t('Đoàn được giao hướng dẫn', 'Groups you lead')}>
    {!manifest.length ? <p className="text-sm text-ink-muted">{t('Chưa có chuyến sắp tới được giao cho bạn.', 'No upcoming departures assigned to you.')}</p> : <div className="grid gap-3 md:grid-cols-2">{manifest.map((d) => <article key={d.id} className="rounded-xl border border-line p-4">
      <h3 className="font-bold">{d.title}</h3>
      <p className="text-sm text-ink-muted">{tourDate(d.starts_at, lang)} · {d.meeting_point}</p>
      <p className="mt-1 text-sm font-semibold">{t(`${d.guests.reduce((sum, g) => sum + g.seats, 0)} khách`, `${d.guests.reduce((sum, g) => sum + g.seats, 0)} guests`)}</p>
      <ul className="mt-1 text-sm">{d.guests.map((g, i) => <li key={i}>{g.name} · {t(`${g.seats} người`, `${g.seats} people`)}</li>)}</ul>
    </article>)}</div>}
  </PortalCard>
}

function ManagedTour({ tour, data, reload, profileTick }) {
  const { t, lang } = useT()
  const [busy,setBusy] = useState(false)
  const [ready,setReady] = useState(false)
  const [check,setCheck] = useState(0)
  const [error,setError] = useState('')
  const guides = data.members.filter((m) => m.operator_id===tour.operator_id && m.role==='guide')
  const unassigned = t('Chưa phân công', 'Unassigned')
  async function publish() {
    setBusy(true); setError('')
    try { await tourRpc('tour_publish',{ p_tour:tour.id,p_published:!tour.published }); reload() } catch(e) { setError(tourError(e, lang)); setBusy(false) }
  }
  return <section className="tour-card"><h2>{tour.title}</h2>
    <p className="flex flex-wrap items-center gap-x-3">{tour.destination} · {tour.published ? t('Đã công bố', 'Published') : t('Bản nháp', 'Draft')}
      {tour.published && <Link to={`/tour/${tour.id}`} className="inline-flex items-center gap-1 font-utility text-xs font-semibold text-chili hover:underline">{t('Xem trang tour', 'View tour page')}<ArrowSquareOut size={12} /></Link>}
    </p>
    {!tour.published && <TourChecklist tourId={tour.id} refresh={check + profileTick} onReady={setReady} />}
    <button disabled={busy || (!tour.published && !ready)} onClick={publish} className={tour.published ? 'tour-secondary' : 'tour-primary'}>{tour.published ? t('Ẩn tour khỏi danh sách đặt mới', 'Hide tour from new bookings') : t('Công bố tour', 'Publish tour')}</button>
    {!tour.published && !ready && <p className="text-2xs text-ink-faint">{t('Hoàn thành đủ các mục trên để công bố tour.', 'Complete the items above to publish.')}</p>}
    {error && <p role="alert" className="tour-error">{error}</p>}
    <details><summary>{t('Sửa tên tour, điểm đến và điểm hẹn', 'Edit name, destination and meeting point')}</summary><p>{t('Chỉ sửa khi tour đã ẩn và chưa từng có đơn đặt, để bảo toàn thông tin lịch sử của khách.', 'Only while the tour is hidden and has never been booked, so past guests keep the details they booked.')}</p>
      <ActionForm label={t('Lưu thông tin cơ bản', 'Save basics')} onDone={reload} submit={(f) => tourRpc('tour_update_basics',{ p_tour:tour.id,p_title:f.title,p_destination:f.destination,p_description:f.description,p_meeting:f.meeting })} fields={[
        { key:'title',label:t('Tên tour', 'Tour name'),initial:tour.title,minLength:3,maxLength:200 },{ key:'destination',label:t('Điểm đến', 'Destination'),initial:tour.destination,minLength:2,maxLength:200 },
        { key:'description',label:t('Mô tả', 'Description'),initial:tour.description,type:'textarea',minLength:20,maxLength:10000 },{ key:'meeting',label:t('Điểm hẹn', 'Meeting point'),initial:tour.meeting_point,minLength:5,maxLength:500 },
      ]} />
    </details>
    <details><summary>{t('Nội dung trang tour (ảnh, giới thiệu, lịch trình, bao gồm, chính sách)', 'Tour page content (photos, introduction, programme, inclusions, policies)')}{!tour.cover_url && t(' — chưa có ảnh bìa', ' — no cover photo yet')}</summary>
      <TourContentEditor tour={tour} departures={data.departures.filter((d) => d.tour_id===tour.id)} operatorName={data.operators.find((o) => o.id===tour.operator_id)?.name ?? ''} onSaved={() => setCheck((n) => n + 1)} />
    </details>
    <details><summary>{t('Thêm lịch khởi hành', 'Add a departure')}</summary><p>{t('Thời gian nhập theo giờ Việt Nam (UTC+7). Giá mới chỉ áp dụng cho yêu cầu đặt mới, không sửa tổng tiền của đơn đã có.', 'Times are Vietnam time (UTC+7). A new price applies to new requests only, never to existing reservations.')}</p>
      <ActionForm label={t('Tạo lịch khởi hành', 'Create departure')} onDone={reload} submit={(f) => tourRpc('tour_create_departure',{
        p_tour:tour.id,p_start:new Date(`${f.start}:00+07:00`).toISOString(),p_end:new Date(`${f.end}:00+07:00`).toISOString(),p_capacity:Number(f.capacity),p_price:Number(f.price),p_guide:f.guide || null,
      })} fields={[
        { key:'start',label:t('Khởi hành', 'Departs'),type:'datetime-local' },{ key:'end',label:t('Kết thúc', 'Ends'),type:'datetime-local' },
        { key:'capacity',label:t('Số chỗ', 'Seats'),type:'number',min:1,max:500 },{ key:'price',label:t('Giá VND / người', 'Price VND / person'),type:'number',min:1000,max:100000000 },
        { key:'guide',label:t('Hướng dẫn viên', 'Guide'),required:false,options:[['',unassigned],...guides.map((g) => [g.user_id,g.display_name || g.user_id])] },
      ]} />
    </details>
    {data.departures.filter((d) => d.tour_id===tour.id).sort((a,b) => a.starts_at.localeCompare(b.starts_at)).map((d) => <article key={d.id} className="tour-card"><h3 className="font-bold">{tourDate(d.starts_at, lang)} → {tourDate(d.ends_at, lang)}</h3><p>{t(`${d.capacity} chỗ`, `${d.capacity} seats`)} · {tourMoney(d.price)}{t('/người', '/person')}</p>
      <p>{t('Hướng dẫn viên', 'Guide')}: {guides.find((g) => g.user_id===d.guide_id)?.display_name || (d.guide_id ? t('Cần phân công lại nhân sự', 'Needs reassigning') : unassigned)}</p>
      <p>{d.status==='open' ? t('Đang mở nhận khách', 'Taking guests') : t('Đã đóng nhận khách', 'Closed to new guests')} · {t('Đã giữ', 'Held')} {data.bookings.filter((b) => b.departure_id===d.id && b.status!=='cancelled').reduce((sum,b) => sum+b.seats,0)}/{d.capacity} {t('chỗ', 'seats')}</p>
      {new Date(d.starts_at)>new Date() && <details><summary>{t('Sửa giờ, giá và số chỗ', 'Edit times, price and seats')}</summary><p>{t('Giờ chỉ đổi được khi chưa có lịch sử đặt chỗ. Giá mới không đổi tổng tiền đơn cũ; số chỗ không được thấp hơn chỗ đã giữ.', 'Times can change only before any reservation. A new price leaves existing totals alone; seats cannot go below those held.')}</p>
        <ActionForm label={t('Lưu giá và số chỗ', 'Save price and seats')} onDone={reload} submit={(f) => tourRpc('tour_edit_departure',{
          p_departure:d.id,p_start:new Date(`${f.start}:00+07:00`).toISOString(),p_end:new Date(`${f.end}:00+07:00`).toISOString(),p_capacity:Number(f.capacity),p_price:Number(f.price),
        })} fields={[
          { key:'start',label:t('Khởi hành (giờ Việt Nam)', 'Departs (Vietnam time)'),type:'datetime-local',initial:`${vnDate(d.starts_at)}T${vnTime(d.starts_at)}` },
          { key:'end',label:t('Kết thúc (giờ Việt Nam)', 'Ends (Vietnam time)'),type:'datetime-local',initial:`${vnDate(d.ends_at)}T${vnTime(d.ends_at)}` },
          { key:'capacity',label:t('Tổng số chỗ', 'Total seats'),type:'number',initial:d.capacity,min:1,max:500 },{ key:'price',label:t('Giá mới / người (VND)', 'New price / person (VND)'),type:'number',initial:d.price,min:1000,max:100000000 },
        ]} />
      </details>}
      {new Date(d.starts_at)>new Date() && <details><summary>{t('Phân công hướng dẫn viên / đóng nhận chỗ mới', 'Assign guide / close to new guests')}</summary><p>{t('Đóng nhận chỗ không hủy các đơn đã có. Khi lưu, hướng dẫn viên được thay bằng lựa chọn bên dưới.', 'Closing keeps existing reservations. Saving replaces the guide with the choice below.')}</p><ActionForm label={t('Lưu lịch khởi hành', 'Save departure')} onDone={reload} submit={(f) => tourRpc('tour_update_departure',{ p_departure:d.id,p_open:f.open==='yes',p_guide:f.guide || null })} fields={[
        { key:'open',label:t('Nhận yêu cầu mới', 'New requests'),options:d.status==='open' ? [['yes',t('Đang mở', 'Open')],['no',t('Đóng', 'Close')]] : [['no',t('Đang đóng', 'Closed')],['yes',t('Mở lại', 'Reopen')]] },
        { key:'guide',label:t('Hướng dẫn viên', 'Guide'),required:false,options:[...(d.guide_id && guides.some((g) => g.user_id===d.guide_id) ? [[d.guide_id,guides.find((g) => g.user_id===d.guide_id).display_name || d.guide_id]] : []),['',unassigned],...guides.filter((g) => g.user_id!==d.guide_id).map((g) => [g.user_id,g.display_name || g.user_id])] },
      ]} /></details>}
      {data.bookings.some((b) => b.departure_id===d.id) && <p className="text-2xs text-ink-faint">{t(`${data.bookings.filter((b) => b.departure_id===d.id && b.status!=='cancelled').length} đơn — xử lý ở mục Đơn giữ chỗ.`, `${data.bookings.filter((b) => b.departure_id===d.id && b.status!=='cancelled').length} reservation(s) — handle them under Reservations.`)}</p>}
    </article>)}
  </section>
}

/**
 * One operator application as the admin checks it: who, where, which papers,
 * the terms accepted — then approve in one click after the verification call,
 * or reject with a reason the applicant will read.
 */
function OperatorReviewRow({ o, onDone }) {
  const { t, lang } = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  async function review(approve) {
    if (!approve && note.trim().length < 3) { setError(t('Ghi lý do từ chối (ít nhất 3 ký tự) — người đăng ký sẽ thấy.', 'Give a reason (at least 3 characters) — the applicant will see it.')); return }
    setBusy(true); setError('')
    try { await tourRpc('tour_review_operator', { p_operator: o.id, p_approve: approve, p_note: approve ? 'Đã xác minh' : note.trim() }); onDone() } catch (e) { setError(tourError(e, lang)); setBusy(false) }
  }
  const papers = [
    o.travel_license && `${t('GP lữ hành', 'Travel licence')} ${o.travel_license}`, o.business_license && `${t('GPKD', 'Business reg.')} ${o.business_license}`,
    o.guide_card && `${t('Thẻ HDV', 'Guide card')} ${o.guide_card}`, o.tax_code && `${t('MST', 'Tax code')} ${o.tax_code}`,
  ].filter(Boolean)
  const STATUS = { pending: t('Chờ duyệt', 'Pending'), approved: t('Đã duyệt', 'Approved'), rejected: t('Đã từ chối', 'Rejected') }
  return <article className="tour-card">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="font-bold">{o.name}</h3>
      <span className={`rounded-full px-2.5 py-0.5 font-utility text-2xs font-bold ${o.status === 'pending' ? 'bg-lantern/20 text-lantern' : o.status === 'approved' ? 'bg-herb/15 text-herb' : 'bg-paper-2 text-ink-muted'}`}>{STATUS[o.status] ?? o.status}</span>
    </div>
    <p className="text-sm text-ink-muted">{[OPERATOR_TYPES[o.operator_type]?.[lang], o.cities?.length ? o.cities.join(', ') : null].filter(Boolean).join(' · ') || t('Đăng ký theo mẫu cũ', 'Older application form')}</p>
    <p className="text-sm">{o.contact_name ? `${o.contact_name} (${o.contact_role === 'manager' ? t('quản lý', 'manager') : t('chủ', 'owner')}) · ${o.phone}` : o.contact}</p>
    {papers.length > 0 && <p className="text-2xs text-ink-muted">{papers.join(' · ')}</p>}
    {o.website && <a href={o.website} target="_blank" rel="noopener noreferrer" className="break-all text-2xs text-chili hover:underline">{o.website}</a>}
    {o.description && <p className="text-sm text-ink-muted">“{o.description}”</p>}
    {o.terms_accepted_at && <p className="text-2xs text-herb">{t(`Đã đồng ý điều khoản tour v${o.terms_version}`, `Accepted tour terms v${o.terms_version}`)} · {new Date(o.terms_accepted_at).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB')}</p>}
    {o.review_note && o.status !== 'pending' && <p className="text-2xs text-ink-faint">{t('Ghi chú', 'Note')}: {o.review_note}</p>}
    {o.status === 'pending' && <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => review(true)} className="inline-flex items-center gap-1.5 rounded-full bg-herb px-4 py-1.5 font-utility text-xs font-semibold text-herb-ink disabled:opacity-50">✓ {t('Duyệt (đã gọi xác minh)', 'Approve (verified by phone)')}</button>
      {!rejecting ? <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="tour-secondary">{t('Từ chối…', 'Reject…')}</button> : <>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Lý do từ chối', 'Reason')} maxLength={2000} className="!mt-0 !w-auto flex-1" />
        <button type="button" disabled={busy} onClick={() => review(false)} className="tour-secondary">{t('Xác nhận từ chối', 'Confirm rejection')}</button>
      </>}
    </div>}
    {error && <p role="alert" className="tour-error">{error}</p>}
  </article>
}

export function TourOperatorReview() {
  const { t, lang } = useT()
  const [rows,setRows] = useState([])
  const [error,setError] = useState('')
  const [tick,setTick] = useState(0)
  const [loading,setLoading] = useState(true)
  useEffect(() => {
    let active=true; setLoading(true); setError('')
    tourRows('tour_operators').then((data) => { if(active) { setRows(data); setLoading(false) } }).catch((e) => { if(active) { setError(tourError(e, lang)); setLoading(false) } })
    return () => { active=false }
  }, [tick, lang])
  return <div className="tour-page !p-0"><h2 className="text-xl font-bold">{t('Đơn vị tổ chức tour', 'Tour operators')}</h2><p>{t('Xác minh thông tin đơn vị trước khi duyệt. Phê duyệt cho phép chủ đơn vị công bố tour và nhận thông tin khách đặt.', "Verify the operator before approving. Approval lets the owner publish tours and receive guests' details.")}</p><button className="tour-secondary" onClick={() => setTick((n) => n+1)}>{t('Tải lại', 'Reload')}</button>
    {loading && <p role="status">{t('Đang tải hồ sơ…', 'Loading applications…')}</p>}{error && <p role="alert" className="tour-error">{error}</p>}
    {!loading && !error && !rows.length && <p>{t('Chưa có hồ sơ đối tác tour.', 'No tour operator applications yet.')}</p>}
    {[...rows].sort((x, y) => (x.status === 'pending' ? -1 : 0) - (y.status === 'pending' ? -1 : 0)).map((o) => <OperatorReviewRow key={o.id} o={o} onDone={() => setTick((n) => n+1)} />)}
  </div>
}

function ActionForm({ fields, submit, onDone, label }) {
  const { t, lang } = useT()
  const [form,setForm] = useState(() => Object.fromEntries(fields.map((f) => [f.key,f.initial ?? f.options?.[0]?.[0] ?? ''])))
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  async function run(e) {
    e.preventDefault(); setBusy(true); setError('')
    try { await submit(form); onDone() } catch(err) { setError(tourError(err, lang)) } finally { setBusy(false) }
  }
  return <form onSubmit={run} className="tour-form"><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
    {fields.map(({ key,label:fieldLabel,options,initial: _initial,required=true,...attrs }) => <label key={key}>{fieldLabel}{options ? <select required={required} value={form[key]} onChange={(e) => setForm({ ...form,[key]:e.target.value })}>{options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select> : attrs.type==='textarea' ? <textarea required={required} minLength={attrs.minLength} maxLength={attrs.maxLength} rows={5} value={form[key]} onChange={(e) => setForm({ ...form,[key]:e.target.value })} /> : <input {...attrs} required={required} value={form[key]} onChange={(e) => setForm({ ...form,[key]:e.target.value })} />}</label>)}
  </fieldset>{error && <p role="alert" className="tour-error">{error}</p>}<button className="tour-primary justify-self-start" disabled={busy}>{busy ? t('Đang xử lý…', 'Working…') : label}</button></form>
}
