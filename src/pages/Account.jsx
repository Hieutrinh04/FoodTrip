import { Link } from 'react-router-dom'
import { ArrowRight, Buildings, Compass, Flag, MapTrifold, BookmarkSimple, Bed, ShieldCheck, UserCircle, Handshake, Lifebuoy } from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useAccess } from '../auth/AccessContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { accountWorkspaces, workspaceRole } from '../lib/workspaces.js'
import PortalLoadState from '../components/portal/PortalLoadState.jsx'

const ICONS = { hotel: Buildings, tour: Compass, guide: Flag, admin: ShieldCheck }
const HINTS = {
  hotel_owner: ['Quản lý đặt phòng, kho phòng, hồ sơ, nhân sự và đối soát.', 'Manage bookings, rooms, profile, team and payouts.'],
  hotel_staff: ['Theo dõi đặt phòng và phục vụ khách tại cơ sở được giao.', 'Manage stays and serve guests at your assigned property.'],
  tour_owner: ['Quản lý tour, lịch khởi hành, đoàn khách, nhân sự và hoa hồng.', 'Manage tours, departures, guests, team and commission.'],
  tour_manager: ['Vận hành tour, lịch khởi hành và đơn giữ chỗ của đơn vị.', 'Operate tours, departures and reservations for your operator.'],
  guide: ['Xem lịch hướng dẫn, điểm hẹn và danh sách khách được giao.', 'See assigned departures, meeting points and guest lists.'],
  admin: ['Theo dõi hệ thống, duyệt đối tác và xử lý công việc quản trị.', 'Monitor the platform, review partners and handle administration.'],
}

export function WorkspaceCards({ entries, lang }) {
  const t = (vi, en) => lang === 'vi' ? vi : en
  return <div className="mt-4 grid gap-4 md:grid-cols-2">{entries.map((entry) => {
    const Icon = ICONS[entry.type] ?? UserCircle
    return <article key={entry.id} className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-herb/10 text-herb"><Icon size={24} /></span><div className="min-w-0"><p className="text-xs font-semibold text-ink-muted">{workspaceRole(entry, lang)}</p><h3 className="mt-1 break-words text-lg font-bold">{entry.label[lang]}</h3></div></div>
      <p className="mt-4 text-sm text-ink-muted">{t(...HINTS[entry.role])}</p>
      {entry.suspended && <p className="mt-3 rounded-xl bg-chili/10 p-3 text-sm text-chili">{t('Cơ sở tạm khoá. Vào cổng để xem thông tin và liên hệ hỗ trợ.', 'Property suspended. Open the portal for details and support.')}</p>}
      <Link to={entry.to} className="mt-5 inline-flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line-strong px-4 py-2.5 text-sm font-semibold hover:border-chili hover:text-chili">{entry.type === 'guide' ? t('Xem đoàn của tôi', 'View my groups') : t('Vào khu vực làm việc', 'Open workspace')}<ArrowRight size={17} /></Link>
    </article>
  })}</div>
}

export default function Account() {
  const { user } = useAuth()
  const access = useAccess()
  const { lang } = useLanguage()
  const t = (vi, en) => lang === 'vi' ? vi : en
  const workspaces = accountWorkspaces(access).filter((e) => e.type !== 'personal')
  const personal = [
    { to: '/trips', icon: MapTrifold, title: t('Lịch trình của tôi', 'My trips'), hint: t('Tiếp tục, chia sẻ hoặc xuất chuyến đi đã lưu.', 'Continue, share or export a saved trip.') },
    { to: '/saved', icon: BookmarkSimple, title: t('Địa điểm đã lưu', 'Saved places'), hint: t('Tìm lại quán và điểm đến yêu thích.', 'Return to your favourite places.') },
    { to: '/bookings', icon: Bed, title: t('Đặt chỗ của tôi', 'My bookings'), hint: t('Theo dõi thanh toán, phòng và tour đã đặt.', 'Track payments, rooms and tour reservations.') },
  ]
  return <div className="portal-workspace mx-auto max-w-[1280px] px-5 py-10 md:px-8 md:py-12">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><span className="eyebrow">{t('Không gian FoodTrip của bạn', 'Your FoodTrip space')}</span><h1 className="mt-2 text-3xl font-bold">{t('Tài khoản & công việc', 'Account & workspaces')}</h1><p className="mt-3 break-all text-sm text-ink-muted">{user?.email}</p></div><Link to="/plan" className="rounded-full bg-chili px-5 py-3 text-sm font-semibold text-chili-ink">{t('Tạo lịch trình', 'Plan a trip')}</Link></header>
    <section aria-labelledby="personal-title"><h2 id="personal-title" className="text-xl font-bold">{t('Chuyến đi của bạn', 'Your travels')}</h2><div className="mt-4 grid gap-4 md:grid-cols-3">{personal.map(({ to, icon: Icon, title, hint }) => <Link key={to} to={to} className="group rounded-2xl border border-line bg-surface p-5 hover:border-chili"><Icon size={25} className="text-chili" /><h3 className="mt-4 flex items-center justify-between gap-2 font-bold">{title}<ArrowRight size={16} className="text-ink-muted group-hover:text-chili" /></h3><p className="mt-2 text-sm text-ink-muted">{hint}</p></Link>)}</div></section>
    <section className="mt-9" aria-labelledby="workspaces-title"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="workspaces-title" className="text-xl font-bold">{t('Khu vực làm việc', 'Workspaces')}</h2><button type="button" disabled={access.status === 'loading'} onClick={access.refresh} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">{t('Cập nhật quyền', 'Refresh access')}</button></div><p className="mt-2 text-sm text-ink-muted">{t('Chọn đúng cơ sở hoặc đơn vị để bắt đầu công việc.', 'Choose a property or operator to start work.')}</p>
      {access.status !== 'ready' ? <div className="mt-4"><PortalLoadState status={access.status} onRetry={access.refresh} /></div> : workspaces.length ? <WorkspaceCards entries={workspaces} lang={lang} /> : <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-6"><p className="font-semibold">{t('Chưa có khu vực làm việc được phân công', 'No workspaces assigned yet')}</p><p className="mt-2 text-sm text-ink-muted">{t('Nếu bạn là nhân viên hoặc hướng dẫn viên, hãy nhờ chủ cơ sở/đơn vị thêm tài khoản này vào nhân sự.', 'If you are staff or a guide, ask your property or operator owner to add this account to their team.')}</p></div>}
    </section>
    <section className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-line p-5"><Handshake size={22} className="text-herb" /><h2 className="mt-3 font-bold">{t('Đăng ký hoặc theo dõi hồ sơ đối tác', 'Partner applications')}</h2><p className="mt-2 text-sm text-ink-muted">{t('Dùng tài khoản hiện tại để đăng ký; hồ sơ chờ duyệt được xem tại cổng tương ứng.', 'Apply with this account and follow pending applications in the relevant portal.')}</p><div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-chili"><Link to="/partner?view=application">{t('Cơ sở lưu trú →', 'Property →')}</Link><Link to="/partner/tours?view=application">{t('Đơn vị tour →', 'Tour operator →')}</Link></div></div><div className="rounded-2xl border border-line p-5"><Lifebuoy size={22} className="text-herb" /><h2 className="mt-3 font-bold">{t('Quyền truy cập & hỗ trợ', 'Access & support')}</h2><p className="mt-2 text-sm text-ink-muted">{t('Kiểm tra phạm vi được cấp hoặc liên hệ FoodTrip khi cần hỗ trợ.', 'Check your access scope or contact FoodTrip for help.')}</p><div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-chili"><Link to="/permissions">{t('Xem quyền →', 'View access →')}</Link><Link to="/contact">{t('Liên hệ →', 'Contact →')}</Link></div></div></section>
  </div>
}
