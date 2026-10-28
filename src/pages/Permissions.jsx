import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { useAccess } from '../auth/AccessContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { ROLES, FEATURES, FEATURE_GROUPS, ACCESS_LEVELS } from '../lib/accessPolicy.js'

export default function Permissions() {
  const { user, loading } = useAuth()
  const access = useAccess()
  const { lang } = useLanguage()
  const t = (vi, en) => lang === 'vi' ? vi : en
  const [role, setRole] = useState('guest')
  const [group, setGroup] = useState('all')
  const [search, setSearch] = useState('')
  const [compare, setCompare] = useState(false)
  const features = FEATURES.filter((f) => (group === 'all' || f.group === group) && `${f.label[lang]} ${f.note[lang]}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const roles = compare ? Object.keys(ROLES) : [role]
  const input = 'min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm'
  return <div className="mx-auto max-w-[1400px] px-5 py-12 md:px-8">
    <span className="eyebrow">{t('Tài khoản FoodTrip', 'FoodTrip accounts')}</span>
    <h1 className="mt-3 text-3xl font-bold md:text-4xl">{t('Vai trò & quyền truy cập', 'Roles & permissions')}</h1>
    <p className="mt-4 max-w-3xl text-ink-muted">{t('Tra cứu chức năng bạn được sử dụng và phạm vi dữ liệu được quản lý. Một tài khoản có thể có nhiều vai trò; quyền đối tác chỉ áp dụng tại cơ sở hoặc đơn vị được giao.', 'See the features you can use and the records you can manage. One account can hold multiple roles; partner permissions apply only to assigned properties or operators.')}</p>

    <section className="my-8 rounded-2xl border border-line bg-surface p-5" aria-labelledby="current-access">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="current-access" className="text-xl font-bold">{t('Quyền của tài khoản hiện tại', 'Your current account access')}</h2>
        {user && <button disabled={access.status === 'loading'} onClick={access.refresh} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">{t('Kiểm tra lại quyền', 'Refresh access')}</button>}
      </div>
      {loading || access.status === 'loading' ? <p role="status" className="mt-3">{t('Đang kiểm tra…', 'Checking…')}</p> : access.status === 'error' ? <p role="alert" className="mt-3 text-chili">{t('Chưa tải được vai trò. Hãy thử lại; quyền quản lý tạm thời chưa được xác nhận.', 'Could not load roles. Retry to verify management access.')}</p> : <>
        <div className="mt-3 flex flex-wrap gap-2">{access.roles.map((r) => <span key={r} className="rounded-full bg-herb/10 px-3 py-1.5 text-sm font-semibold text-herb">{ROLES[r][lang]}</span>)}</div>
        {!user && <p className="mt-3 text-sm text-ink-muted">{t('Bạn có thể khám phá địa điểm, xem trước 3 bài cộng đồng và điền lựa chọn chuyến đi. Đăng nhập để xem thêm, lưu địa điểm, tạo/xuất lịch trình, đặt chỗ và tham gia thảo luận.', 'You can explore places, preview 3 community stories and fill in trip preferences. Sign in for more, favourites, itinerary generation/export, bookings and discussions.')}</p>}
        {access.properties.map((p) => <p className="mt-2 text-sm" key={p.id}>{p.name} · {p.role === 'owner' ? ROLES.hotel_owner[lang] : ROLES.hotel_staff[lang]}{!p.active ? t(' · Cơ sở bị đình chỉ: không nhận đặt mới', ' · Suspended: no new bookings') : ''}</p>)}
        {access.operators.map((o) => <p className="mt-2 text-sm" key={o.id}>{o.name} · {o.status === 'approved' ? ({ owner: ROLES.tour_owner, manager: ROLES.tour_manager, guide: ROLES.guide }[o.role]?.[lang] ?? o.role) : t('Chưa được duyệt — chưa có quyền vận hành', 'Not approved — no operational permissions')}</p>)}
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-chili">
          {access.can('hotel.portal') && <Link to="/partner">{t('Vào cổng lưu trú →', 'Open property portal →')}</Link>}
          {access.can('tour.portal') && <Link to="/partner/tours">{t('Vào cổng tour →', 'Open tour portal →')}</Link>}
          {access.can('admin') && <Link to="/admin">{t('Vào quản trị →', 'Open administration →')}</Link>}
        </div>
      </>}
    </section>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">{t('Tra cứu vai trò', 'View a role')}<select aria-label={t('Tra cứu vai trò', 'View a role')} value={role} onChange={(e) => { setRole(e.target.value); setCompare(false) }} className={input}>{Object.entries(ROLES).map(([id, label]) => <option key={id} value={id}>{label[lang]}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">{t('Nhóm chức năng', 'Feature group')}<select aria-label={t('Nhóm chức năng', 'Feature group')} value={group} onChange={(e) => setGroup(e.target.value)} className={input}><option value="all">{t('Tất cả', 'All')}</option>{Object.entries(FEATURE_GROUPS).map(([id, label]) => <option key={id} value={id}>{label[lang]}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">{t('Tìm chức năng', 'Find a feature')}<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} className={input} placeholder={t('Ví dụ: giá, đăng bài…', 'For example: prices, posts…')} /></label>
      <label className="flex items-center gap-2 self-end py-3 text-sm font-semibold"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />{t('So sánh tất cả vai trò', 'Compare all roles')}</label>
    </div>
    <p className="mb-4 text-sm text-ink-muted">{t('Bộ lọc chỉ dùng để tra cứu, không thay đổi vai trò tài khoản. Các vai trò đã đăng nhập đều có quyền của người dùng; nếu kiêm nhiệm, bạn được dùng thêm quyền ở đúng đơn vị đó.', 'Filters only change this reference view, not your account roles. All signed-in roles include member features; additional roles apply within their assigned organizations.')}</p>
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface" tabIndex={0} role="region" aria-label={t('Bảng quyền truy cập; cuộn ngang để so sánh', 'Permissions table; scroll horizontally to compare')}>
      <table className={`w-full border-collapse text-left text-sm ${compare ? 'min-w-[1500px]' : ''}`}>
        <caption className="sr-only">{t('Quyền theo chức năng và vai trò', 'Permissions by feature and role')}</caption>
        <thead className="bg-paper-2"><tr><th scope="col" className="min-w-[190px] p-4">{t('Chức năng & điều kiện', 'Feature & conditions')}</th>{roles.map((r) => <th scope="col" className="min-w-[130px] p-4" key={r}>{ROLES[r][lang]}</th>)}</tr></thead>
        <tbody>{features.map((f) => <tr className="border-t border-line" key={f.id}>
          <th scope="row" className="p-4 font-normal"><span className="font-semibold">{f.label[lang]}</span><span className="mt-1 block max-w-xl text-xs leading-relaxed text-ink-muted">{f.note[lang]}</span></th>
          {roles.map((r) => <td key={r} className={`p-4 font-semibold ${f.grants[r] ? 'text-herb' : 'text-ink-muted'}`}>{ACCESS_LEVELS[f.grants[r] ?? 'no'][lang]}</td>)}
        </tr>)}</tbody>
      </table>
      {!features.length && <p className="p-6 text-center text-ink-muted">{t('Không có chức năng khớp bộ lọc.', 'No features match your filters.')}</p>}
    </div>
    <p className="mt-5 max-w-4xl text-sm text-ink-muted">{t('Vai trò chủ/nhân viên khách sạn không cấp quyền quản lý tour và ngược lại. Admin dùng công cụ quản trị được cấp, không tự trở thành chủ mọi khách sạn/tour. Hồ sơ đối tác chờ duyệt chưa cấp quyền vận hành.', 'Property roles do not grant tour management access, or vice versa. Admins use their assigned administration tools and do not automatically become owners of every property or tour. Pending partner applications grant no operational rights.')}</p>
  </div>
}
