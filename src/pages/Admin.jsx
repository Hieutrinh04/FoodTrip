import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowSquareOut, ArrowsClockwise, Bed, ChartBar, ChatCircleText, DownloadSimple, EnvelopeSimple,
  Lock, MagnifyingGlass, Trash, UserCircle, Users, VideoCamera, WarningCircle, Check, ArrowCounterClockwise, Receipt, CaretDown, ClockCounterClockwise, ShieldCheck, Buildings,
} from '@phosphor-icons/react'
import * as admin from '../lib/admin.js'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { useInputDialog } from '../components/ui/useInputDialog.jsx'
import { FULFILLMENT, PROPERTY_TYPES } from '../lib/partner.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { TourOperatorReview } from './TourPartner.jsx'

const TABS = [
  { id: 'overview', icon: ChartBar, vi: 'Tổng quan', en: 'Overview' },
  { id: 'bookings', icon: Bed, vi: 'Đặt phòng', en: 'Bookings' },
  { id: 'payments', icon: Receipt, vi: 'Giao dịch', en: 'Payments' },
  { id: 'partners', icon: Buildings, vi: 'Đối tác', en: 'Partners' },
  { id: 'tour-partners', icon: Buildings, vi: 'Đối tác tour', en: 'Tour partners' },
  { id: 'community', icon: ChatCircleText, vi: 'Cộng đồng', en: 'Community' },
  { id: 'videos', icon: VideoCamera, vi: 'Video review', en: 'Video reviews' },
  { id: 'messages', icon: EnvelopeSimple, vi: 'Liên hệ', en: 'Messages' },
  { id: 'subscribers', icon: Users, vi: 'Bản tin', en: 'Newsletter' },
  { id: 'users', icon: UserCircle, vi: 'Người dùng', en: 'Users' },
  { id: 'audit', icon: ClockCounterClockwise, vi: 'Nhật ký', en: 'Activity log' },
]

const BOOKING_STATUS = {
  pending: { vi: 'Chờ thanh toán', en: 'Pending', style: 'bg-lantern/20 text-lantern' },
  paid: { vi: 'Đã thanh toán', en: 'Paid', style: 'bg-herb text-herb-ink' },
  failed: { vi: 'Thất bại', en: 'Failed', style: 'bg-chili/15 text-chili' },
  cancelled: { vi: 'Đã huỷ', en: 'Cancelled', style: 'bg-paper-2 text-ink-faint' },
  refunded: { vi: 'Đã hoàn tiền', en: 'Refunded', style: 'bg-ink/10 text-ink-muted' },
}

const BUTTON = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold transition-colors hover:border-chili hover:text-chili disabled:opacity-50'
const DANGER = 'inline-flex items-center gap-1.5 rounded-full border border-chili/40 px-3 py-1.5 font-utility text-2xs font-semibold text-chili transition-colors hover:bg-chili hover:text-chili-ink disabled:opacity-50'
const PRIMARY = 'inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[13px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow'

const formatVnd = (n) => `${Number(n ?? 0).toLocaleString('vi-VN')}đ`
const formatDate = (value, withTime = true) => (value
  ? new Date(value).toLocaleString('vi-VN', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' })
  : '—')

/**
 * Loads one page of a list and reloads it on demand. `load` gets the page
 * index; its identity decides when the list starts again from page one.
 */
function usePagedList(load) {
  const [state, setState] = useState({ status: 'loading', rows: [], count: null })
  const [pageIndex, setPageIndex] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => setPageIndex(0), [load])
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    load(pageIndex)
      .then(({ rows, count }) => { if (!cancelled) setState({ status: 'ready', rows, count }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', rows: [], count: null }) })
    return () => { cancelled = true }
  }, [load, pageIndex, tick])

  return { ...state, pageIndex, setPageIndex, reload: () => setTick((n) => n + 1) }
}

export default function Admin() {
  const { lang } = useLanguage()
  const t = (vi, en) => (lang === 'vi' ? vi : en)
  const { user, loading: authLoading, hasAuth } = useAuth()
  const [access, setAccess] = useState('checking')
  const [tab, setTab] = useState('overview')
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    if (!user) { setAccess('signed-out'); return }
    setAccess('checking')
    admin.getAdminStatus().then(setAccess)
  }, [user])

  const header = (
    <div className="mb-8 max-w-[700px]">
      <span className="eyebrow eyebrow-tick">{t('Quản trị', 'Administration')}</span>
      <h1 className="mt-3 text-3xl font-bold leading-[1.15] md:text-4xl">{t('Trang quản trị FoodTrip', 'FoodTrip admin')}</h1>
    </div>
  )

  let body
  if (authLoading || access === 'checking') body = <Spinner label={t('Đang kiểm tra quyền…', 'Checking access…')} />
  else if (access === 'signed-out') {
    body = <EmptyState icon={Lock} title={t('Đăng nhập để vào trang quản trị', 'Log in to continue')}
      body={t('Trang này chỉ dành cho tài khoản quản trị.', 'This page is for administrator accounts only.')}
      action={hasAuth && <button type="button" onClick={() => setAuthOpen(true)} className={PRIMARY}><UserCircle size={16} />{t('Đăng nhập', 'Log in')}</button>} />
  } else if (access === 'not-admin') {
    body = <EmptyState icon={Lock} title={t('Tài khoản này không có quyền quản trị', 'This account is not an administrator')}
      body={t(`Bạn đang đăng nhập bằng ${user.email}. Quyền quản trị được cấp trong cơ sở dữ liệu.`, `You are signed in as ${user.email}. Admin rights are granted in the database.`)} />
  } else if (access === 'not-installed') {
    body = <EmptyState icon={WarningCircle} title={t('Chưa cài đặt quyền quản trị', 'Admin roles are not set up')}
      body={t('Cơ sở dữ liệu chưa có migration quản trị (supabase/migrations/20260923120000_admin.sql).', 'The admin migration (supabase/migrations/20260923120000_admin.sql) has not been applied.')} />
  } else if (access === 'error') {
    body = <EmptyState icon={WarningCircle} title={t('Không kiểm tra được quyền', 'Could not check access')}
      action={<button type="button" onClick={() => { setAccess('checking'); admin.getAdminStatus().then(setAccess) }} className={BUTTON}><ArrowsClockwise size={14} />{t('Thử lại', 'Retry')}</button>} />
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label={t('Mục quản trị', 'Admin sections')} className="no-scrollbar flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {TABS.map(({ id, icon: Icon, ...label }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left font-utility text-sm font-semibold transition-colors ${tab === id ? 'bg-ink text-paper' : 'text-ink-muted hover:bg-paper-2 hover:text-ink'}`}>
              <Icon size={17} />{label[lang]}
            </button>
          ))}
        </nav>
        <section className="min-w-0">
          {tab === 'overview' && <Overview t={t} onOpen={setTab} />}
          {tab === 'bookings' && <BookingsTab t={t} lang={lang} />}
          {tab === 'payments' && <PaymentsTab t={t} />}
          {tab === 'partners' && <PartnersTab t={t} />}
          {tab === 'tour-partners' && <TourOperatorReview />}
          {tab === 'community' && <CommunityTab t={t} />}
          {tab === 'videos' && <VideosTab t={t} />}
          {tab === 'messages' && <MessagesTab t={t} />}
          {tab === 'subscribers' && <SubscribersTab t={t} />}
          {tab === 'users' && <UsersTab t={t} currentUserId={user.id} />}
          {tab === 'audit' && <AuditTab t={t} />}
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-12 md:px-8 md:py-16">
      {header}
      {body}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

function Panel({ title, count, actions, children }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}{count != null && <span className="ml-2 font-utility text-sm font-semibold text-ink-faint">{count.toLocaleString('vi-VN')}</span>}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/** Loading, error, empty and pager around a list. */
function ListState({ list, t, empty, children }) {
  if (list.status === 'loading' && !list.rows.length) return <Spinner label={t('Đang tải…', 'Loading…')} />
  if (list.status === 'error') {
    return <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-chili/10 px-4 py-3 text-sm text-chili">
      {t('Không tải được dữ liệu.', 'Could not load this list.')}
      <button type="button" onClick={list.reload} className={BUTTON}><ArrowsClockwise size={14} />{t('Thử lại', 'Retry')}</button>
    </div>
  }
  if (!list.rows.length) return <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">{empty}</p>
  const pages = list.count != null ? Math.max(1, Math.ceil(list.count / admin.PAGE_SIZE)) : null
  const hasNext = pages != null ? list.pageIndex + 1 < pages : list.rows.length === admin.PAGE_SIZE
  return (
    <div className={list.status === 'loading' ? 'opacity-60 transition-opacity' : ''}>
      {children}
      {(list.pageIndex > 0 || hasNext) && (
        <div className="mt-4 flex items-center justify-end gap-2 font-utility text-2xs text-ink-muted">
          <button type="button" className={BUTTON} disabled={list.pageIndex === 0} onClick={() => list.setPageIndex(list.pageIndex - 1)}>{t('Trước', 'Previous')}</button>
          <span>{t('Trang', 'Page')} {list.pageIndex + 1}{pages != null && ` / ${pages}`}</span>
          <button type="button" className={BUTTON} disabled={!hasNext} onClick={() => list.setPageIndex(list.pageIndex + 1)}>{t('Sau', 'Next')}</button>
        </div>
      )}
    </div>
  )
}

/** Server errors from the admin functions, in words an admin can act on. */
const ERROR_TEXT = {
  'note-required': ['Hãy ghi chú (ít nhất 3 ký tự) — ví dụ khách trả bằng cách nào.', 'Add a note (3+ characters) — how the money was paid, say.'],
  'amount-too-small': ['Số tiền giao dịch nhỏ hơn tổng tiền của đơn.', 'The transfer is less than the booking total.'],
  'booking-not-found': ['Không tìm thấy đơn với mã thanh toán này.', 'No booking has that payment code.'],
  'booking-not-pending': ['Đơn này không còn ở trạng thái chờ thanh toán.', 'That booking is no longer pending.'],
  'transition-not-allowed': ['Không thể chuyển đơn sang trạng thái này.', 'That status change is not allowed.'],
  'transaction-already-handled': ['Giao dịch này đã được xử lý.', 'That transfer has already been handled.'],
  'cannot-remove-self': ['Bạn không thể tự gỡ quyền admin của chính mình.', 'You cannot remove your own admin rights.'],
  'not-admin': ['Tài khoản không có quyền quản trị.', 'This account is not an administrator.'],
}
function explainError(error, t) {
  const key = Object.keys(ERROR_TEXT).find((k) => String(error?.message ?? '').includes(k))
  return key ? t(...ERROR_TEXT[key]) : t('Thao tác không thành công. Vui lòng thử lại.', 'That did not work. Please try again.')
}

/** Runs an action (after confirmation, if asked), then reloads the list. */
function useAction(list, t) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const run = async (id, confirmText, action) => {
    if (confirmText && !window.confirm(confirmText)) return false
    setBusyId(id); setError('')
    let ok = true
    try { await action(); list.reload() } catch (err) { ok = false; setError(explainError(err, t)) }
    setBusyId(null)
    return ok
  }
  return { busyId, error, run }
}

/** Bars for one daily series; the tallest bar is the period's peak. */
function DayBars({ days, value, format = (n) => n, color = 'bg-chili/80', label }) {
  const peak = Math.max(1, ...days.map(value))
  return (
    <div className="flex h-36 items-end gap-1" role="img" aria-label={label}>
      {days.map((day) => {
        const n = value(day)
        return (
          <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${formatDate(day.day, false)}: ${format(n)}`}>
            <div className={`w-full rounded-t-md ${color}`} style={{ height: `${(n / peak) * 100}%`, minHeight: n ? 4 : 1 }} />
            <span className="font-utility text-micro text-ink-faint">{new Date(day.day).getDate()}</span>
          </div>
        )
      })}
    </div>
  )
}

function ActionError({ error }) {
  return error ? <p role="alert" className="mb-3 rounded-xl bg-chili/10 px-4 py-2.5 text-sm text-chili">{error}</p> : null
}

function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead><tr className="border-b border-line font-utility text-micro uppercase tracking-wide text-ink-faint">{head.map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}

function Overview({ t, onOpen }) {
  const [state, setState] = useState({ status: 'loading', data: null })
  const load = useCallback(() => {
    setState({ status: 'loading', data: null })
    admin.getOverview().then((data) => setState({ status: 'ready', data })).catch(() => setState({ status: 'error', data: null }))
  }, [])
  useEffect(load, [load])

  if (state.status === 'loading') return <Spinner label={t('Đang tải số liệu…', 'Loading figures…')} />
  if (state.status === 'error') return <ListState list={{ status: 'error', rows: [], reload: load }} t={t} />
  const d = state.data
  const bookings = d.bookings ?? {}
  const totalBookings = Object.values(bookings).reduce((a, b) => a + b, 0)
  const days = d.by_day ?? []
  const shortVnd = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr` : formatVnd(n))
  const cards = [
    { label: t('Doanh thu 30 ngày', 'Revenue, 30 days'), value: formatVnd(d.revenue_30d), note: t(`Tổng: ${formatVnd(d.revenue_paid)}`, `All time: ${formatVnd(d.revenue_paid)}`), tab: 'bookings' },
    { label: t('Đang chờ thanh toán', 'Awaiting payment'), value: formatVnd(d.pending_amount), note: t(`${bookings.pending ?? 0} đơn`, `${bookings.pending ?? 0} bookings`), tab: 'bookings' },
    { label: t('Giao dịch cần xem', 'Transfers to review'), value: d.payments_attention, tab: 'payments', alert: d.payments_attention > 0 },
    { label: t('Tin nhắn chưa xử lý', 'Open messages'), value: d.messages_open, tab: 'messages', alert: d.messages_open > 0 },
    { label: t('Khách sạn từ chối — cần hoàn tiền', 'Hotel rejected — refund due'), value: d.hotel_rejected_paid ?? 0, tab: 'bookings', alert: d.hotel_rejected_paid > 0 },
    { label: t('Đơn đăng ký đối tác', 'Partner applications'), value: d.partner_applications ?? 0, tab: 'partners', alert: d.partner_applications > 0 },
    { label: t('Đặt phòng', 'Bookings'), value: totalBookings, note: t(`${bookings.paid ?? 0} đã trả · ${bookings.refunded ?? 0} hoàn tiền`, `${bookings.paid ?? 0} paid · ${bookings.refunded ?? 0} refunded`), tab: 'bookings' },
    { label: t('Người dùng', 'Users'), value: d.users, note: t(`+${d.users_7d} trong 7 ngày`, `+${d.users_7d} in 7 days`), tab: 'users' },
    { label: t('Bài cộng đồng', 'Community posts'), value: d.posts, note: t(`${d.comments} bình luận · ${d.video_reviews} video`, `${d.comments} comments · ${d.video_reviews} videos`), tab: 'community' },
    { label: t('Lịch trình đã lưu', 'Saved itineraries'), value: d.itineraries, note: t(`${d.subscribers} người nhận bản tin`, `${d.subscribers} newsletter subscribers`), tab: 'subscribers' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((card) => (
          <button key={card.label} type="button" onClick={() => onOpen(card.tab)}
            className={`min-w-0 rounded-2xl border bg-surface p-4 text-left transition-colors hover:border-chili ${card.alert ? 'border-chili/50' : 'border-line'}`}>
            <div className="font-utility text-micro uppercase tracking-wide text-ink-faint">{card.label}</div>
            <div className={`mt-1.5 truncate font-utility text-xl font-bold sm:text-2xl ${card.alert ? 'text-chili' : ''}`}>{typeof card.value === 'number' ? card.value.toLocaleString('vi-VN') : card.value}</div>
            {card.note && <div className="mt-1 truncate text-2xs text-ink-muted">{card.note}</div>}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('Doanh thu — 14 ngày', 'Revenue — 14 days')}>
          <DayBars days={days} value={(day) => day.revenue} format={shortVnd} color="bg-herb" label={t('Doanh thu theo ngày', 'Revenue per day')} />
        </Panel>
        <Panel title={t('Đơn đặt phòng mới — 14 ngày', 'New bookings — 14 days')}>
          <DayBars days={days} value={(day) => day.bookings} label={t('Đơn mới theo ngày', 'Bookings per day')} />
        </Panel>
        <Panel title={t('Người dùng mới — 14 ngày', 'New users — 14 days')}>
          <DayBars days={days} value={(day) => day.signups} color="bg-lantern/80" label={t('Người dùng mới theo ngày', 'New users per day')} />
        </Panel>
      </div>
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="font-utility text-micro uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children || '—'}</dd>
    </div>
  )
}

/** Everything about one booking, with the transfers SePay tied to it. */
function BookingDetail({ booking: b, t, lang }) {
  const [transactions, setTransactions] = useState(null)
  useEffect(() => {
    admin.getBookingTransactions(b.id).then(setTransactions).catch(() => setTransactions([]))
  }, [b.id])
  return (
    <div className="grid gap-4 rounded-xl bg-paper-2 p-4 md:grid-cols-2">
      <dl className="grid grid-cols-2 gap-3">
        <DetailRow label={t('Mã đơn', 'Booking id')}><span className="font-utility text-2xs">{b.id}</span></DetailRow>
        <DetailRow label={t('Mã thanh toán', 'Payment code')}><span className="font-utility">{b.payment_code}</span></DetailRow>
        <DetailRow label={t('Khách', 'Guest')}>{b.guest_name}</DetailRow>
        <DetailRow label={t('Liên hệ', 'Contact')}>{[b.guest_email, b.guest_phone].filter(Boolean).join(' · ')}</DetailRow>
        <DetailRow label={t('Giá / đêm', 'Per night')}>{formatVnd(b.price_per_night)}</DetailRow>
        <DetailRow label={t('Tổng', 'Total')}>{formatVnd(b.total_price)}</DetailRow>
        <DetailRow label={t('Cổng thanh toán', 'Provider')}>{b.payment_provider}</DetailRow>
        <DetailRow label={t('Mã giao dịch', 'Reference')}>{b.payment_txn_ref}</DetailRow>
        <DetailRow label={t('Đặt lúc', 'Booked')}>{formatDate(b.created_at)}</DetailRow>
        <DetailRow label={t('Thanh toán lúc', 'Paid')}>{b.paid_at && formatDate(b.paid_at)}</DetailRow>
        <DetailRow label={t('Địa chỉ khách sạn', 'Hotel address')}>{b.hotel_address}</DetailRow>
        <DetailRow label={t('Mã khách sạn', 'Hotel id')}><span className="font-utility text-2xs">{b.hotel_place_id}</span></DetailRow>
      </dl>
      <div className="min-w-0">
        <div className="mb-2 font-utility text-micro uppercase tracking-wide text-ink-faint">{t('Giao dịch chuyển khoản', 'Bank transfers')}</div>
        {transactions == null && <Spinner label={t('Đang tải…', 'Loading…')} />}
        {transactions?.length === 0 && <p className="text-sm text-ink-muted">{t('Chưa có giao dịch nào gắn với đơn này.', 'No transfers linked to this booking.')}</p>}
        <ul className="space-y-2">
          {transactions?.map((tx) => {
            const o = PAYMENT_OUTCOME[tx.outcome] ?? PAYMENT_OUTCOME.processing
            return (
              <li key={tx.id} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-utility font-semibold">{formatVnd(tx.amount)}</span><span className={`rounded-full px-2 py-0.5 font-utility text-micro font-semibold ${o.style}`}>{o[lang]}</span></div>
                <div className="text-2xs text-ink-muted">{formatDate(tx.transaction_date)} · {tx.gateway} · #{tx.id}</div>
                <div className="line-clamp-2 text-2xs text-ink-faint">{tx.content}</div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

const BOOKING_CSV_COLUMNS = ['id', 'payment_code', 'payment_status', 'payment_provider', 'payment_txn_ref', 'total_price', 'price_per_night', 'nights', 'guests', 'check_in', 'check_out', 'hotel_name', 'room_name', 'guest_name', 'guest_email', 'guest_phone', 'created_at', 'paid_at']

function BookingsTab({ t, lang }) {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const load = useCallback((pageIndex) => admin.listBookings({ status, search: query, pageIndex }), [status, query])
  const list = usePagedList(load)
  const { busyId, error, run } = useAction(list, t)
  const [dialog, ask] = useInputDialog(t)

  async function markPaid(b) {
    const note = await ask({
      title: t('Xác nhận đã thu tiền', 'Confirm payment received'),
      body: t(`Đơn ${b.payment_code} · ${formatVnd(b.total_price)}. Dùng khi tiền đến ngoài webhook — khách ghi sai nội dung, trả tiền mặt…`, `Booking ${b.payment_code} · ${formatVnd(b.total_price)}. For money that arrived outside the webhook — a mistyped note, cash…`),
      label: t('Ghi chú (bắt buộc)', 'Note (required)'), placeholder: t('VD: khách chuyển khoản ghi sai nội dung, đã đối chiếu sao kê', 'e.g. transfer with a wrong note, checked on the statement'),
      confirmLabel: t('Xác nhận đã thu', 'Confirm received'), minLength: 3,
    })
    if (note != null) run(b.id, null, () => admin.setBookingStatus(b.id, 'paid', note))
  }
  async function markRefunded(b) {
    const note = await ask({
      title: t('Đánh dấu đã hoàn tiền', 'Mark as refunded'),
      body: t(`Chỉ đánh dấu sau khi đã thực sự chuyển trả ${formatVnd(b.total_price)} cho khách.`, `Only after ${formatVnd(b.total_price)} has actually been sent back.`),
      label: t('Ghi chú (bắt buộc)', 'Note (required)'), placeholder: t('VD: đã hoàn qua chuyển khoản ngày 26/9', 'e.g. refunded by transfer on 26/9'),
      confirmLabel: t('Đã hoàn tiền', 'Refunded'), minLength: 3, danger: true,
    })
    if (note != null) run(b.id, null, () => admin.setBookingStatus(b.id, 'refunded', note))
  }
  async function exportCsv() {
    setExporting(true)
    try {
      const rows = await admin.allBookings({ status, search: query })
      admin.downloadCsv(`foodtrip-dat-phong-${new Date().toISOString().slice(0, 10)}.csv`, rows, BOOKING_CSV_COLUMNS)
    } finally { setExporting(false) }
  }

  return (
    <Panel title={t('Đặt phòng', 'Bookings')} count={list.count}
      actions={<>
        <form onSubmit={(e) => { e.preventDefault(); setQuery(search) }} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5">
          <MagnifyingGlass size={14} className="text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Khách sạn, tên, email, SĐT', 'Hotel, name, email, phone')} className="w-40 bg-transparent text-sm outline-none" />
        </form>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1.5 font-utility text-2xs font-semibold">
          <option value="all">{t('Mọi trạng thái', 'All statuses')}</option>
          {Object.entries(BOOKING_STATUS).map(([id, s]) => <option key={id} value={id}>{s[lang]}</option>)}
        </select>
        <button type="button" onClick={exportCsv} disabled={exporting || !list.count} className={BUTTON}><DownloadSimple size={14} />CSV</button>
      </>}>
      <ActionError error={error} />
      <ListState list={list} t={t} empty={t('Không có đặt phòng nào.', 'No bookings.')}>
        <ul className="divide-y divide-line">
          {list.rows.map((b) => {
            const s = BOOKING_STATUS[b.payment_status] ?? BOOKING_STATUS.pending
            const open = openId === b.id
            return (
              <li key={b.id} className="py-3">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <button type="button" onClick={() => setOpenId(open ? null : b.id)} aria-expanded={open} className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-left">
                    <CaretDown size={14} className={`mt-1 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
                    <span className="min-w-0">
                      <span className="block font-semibold">{b.hotel_name}</span>
                      <span className="block text-2xs text-ink-muted">{b.room_name} · {b.guest_name} · {t(`${b.guests} khách`, `${b.guests} guests`)}</span>
                      <span className="block font-utility text-micro text-ink-faint">{formatDate(b.check_in, false)} → {formatDate(b.check_out, false)} · {b.payment_code}</span>
                    </span>
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="whitespace-nowrap font-utility font-semibold">{formatVnd(b.total_price)}</span>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-utility text-micro font-semibold ${s.style}`}>{s[lang]}</span>
                    {b.payment_status === 'paid' && FULFILLMENT[b.fulfillment_status] && <span title={b.hotel_note ?? ''} className={`whitespace-nowrap rounded-full px-2.5 py-1 font-utility text-micro font-semibold ${FULFILLMENT[b.fulfillment_status].style}`}>{t('KS: ', 'Hotel: ')}{FULFILLMENT[b.fulfillment_status][lang]}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {b.payment_status === 'pending' && <>
                      <button type="button" disabled={busyId === b.id} className={BUTTON} onClick={() => markPaid(b)}><Check size={13} />{t('Đã thu tiền', 'Mark paid')}</button>
                      <button type="button" disabled={busyId === b.id} className={DANGER}
                        onClick={() => run(b.id, t('Huỷ đặt phòng đang chờ thanh toán này?', 'Cancel this pending booking?'), () => admin.cancelPendingBooking(b.id))}>{t('Huỷ', 'Cancel')}</button>
                    </>}
                    {b.payment_status === 'paid' && <button type="button" disabled={busyId === b.id} className={DANGER} onClick={() => markRefunded(b)}><ArrowCounterClockwise size={13} />{t('Đã hoàn tiền', 'Refunded')}</button>}
                  </div>
                </div>
                {open && <div className="mt-3"><BookingDetail booking={b} t={t} lang={lang} /></div>}
              </li>
            )
          })}
        </ul>
      </ListState>
      {dialog}
    </Panel>
  )
}

const PAYMENT_OUTCOME = {
  paid: { vi: 'Đã khớp đơn', en: 'Paid a booking', style: 'bg-herb text-herb-ink' },
  underpaid: { vi: 'Chuyển thiếu', en: 'Underpaid', style: 'bg-chili/15 text-chili' },
  'no-booking': { vi: 'Không khớp đơn', en: 'No booking', style: 'bg-lantern/20 text-lantern' },
  'not-pending': { vi: 'Đơn đã xử lý / huỷ', en: 'Booking not pending', style: 'bg-lantern/20 text-lantern' },
  'wrong-account': { vi: 'Sai tài khoản', en: 'Other account', style: 'bg-paper-2 text-ink-faint' },
  outgoing: { vi: 'Tiền ra', en: 'Outgoing', style: 'bg-paper-2 text-ink-faint' },
  processing: { vi: 'Đang xử lý', en: 'Processing', style: 'bg-paper-2 text-ink-faint' },
}

/**
 * Transfers reported by the SePay webhook. "Cần xem" lists the ones that did
 * not simply pay a booking — short payments, notes with no booking code, money
 * for a booking already paid or cancelled. A transfer with no code can be
 * attached to its booking by hand; one for a closed booking needs a refund.
 */
function PaymentsTab({ t }) {
  const [show, setShow] = useState('attention')
  const load = useCallback((pageIndex) => admin.listPayments({ show, pageIndex }), [show])
  const list = usePagedList(load)
  const { busyId, error, run } = useAction(list, t)
  const [dialog, ask] = useInputDialog(t)
  const lang = t('vi', 'en')

  async function match(p) {
    const code = await ask({
      title: t('Gán giao dịch vào đơn', 'Attach transfer to a booking'),
      body: t(`${formatVnd(p.amount)} · "${p.content}". Nhập mã thanh toán của đơn (FT…) — đơn sẽ được đánh dấu đã thanh toán nếu số tiền đủ.`, `${formatVnd(p.amount)} · "${p.content}". Enter the booking's payment code (FT…) — it is marked paid if the amount covers it.`),
      label: t('Mã thanh toán', 'Payment code'), placeholder: 'FT3B750E1FEC', confirmLabel: t('Gán & xác nhận', 'Attach & confirm'), minLength: 12,
    })
    if (code != null) run(p.id, null, () => admin.matchPayment(p.id, code))
  }

  return (
    <Panel title={t('Giao dịch chuyển khoản (SePay)', 'Bank transfers (SePay)')} count={list.count}
      actions={<select value={show} onChange={(e) => setShow(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1.5 font-utility text-2xs font-semibold">
        <option value="attention">{t('Cần xem', 'Needs attention')}</option>
        <option value="all">{t('Tất cả', 'All')}</option>
      </select>}>
      <ActionError error={error} />
      <ListState list={list} t={t} empty={show === 'attention' ? t('Không có giao dịch nào cần xử lý.', 'Nothing needs attention.') : t('Chưa có giao dịch.', 'No transfers yet.')}>
        <Table head={[t('Thời gian', 'Time'), t('Số tiền', 'Amount'), t('Nội dung', 'Note'), t('Kết quả', 'Outcome'), t('Đơn', 'Booking'), '']}>
          {list.rows.map((p) => {
            const o = PAYMENT_OUTCOME[p.outcome] ?? PAYMENT_OUTCOME.processing
            return (
              <tr key={p.id} className="align-top">
                <td className="px-2 py-2.5 whitespace-nowrap text-ink-muted">{formatDate(p.transaction_date ?? p.created_at)}<div className="font-utility text-micro text-ink-faint">{p.gateway} · #{p.id}</div></td>
                <td className="px-2 py-2.5 whitespace-nowrap font-utility font-semibold">{formatVnd(p.amount)}</td>
                <td className="px-2 py-2.5"><div className="line-clamp-2 text-sm">{p.content}</div>{p.reference_code && <div className="font-utility text-micro text-ink-faint">{p.reference_code}</div>}</td>
                <td className="px-2 py-2.5"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-utility text-micro font-semibold ${o.style}`}>{o[lang]}</span></td>
                <td className="px-2 py-2.5 font-utility text-2xs text-ink-muted">{p.payment_code ?? '—'}{p.booking_id && <div className="text-ink-faint">{p.booking_id.slice(0, 8)}</div>}</td>
                <td className="px-2 py-2.5 text-right">{(p.outcome === 'no-booking' || p.outcome === 'underpaid') && (
                  <button type="button" disabled={busyId === p.id} className={BUTTON} onClick={() => match(p)}>{t('Gán vào đơn', 'Attach')}</button>
                )}</td>
              </tr>
            )
          })}
        </Table>
      </ListState>
      {dialog}
    </Panel>
  )
}

function CommunityTab({ t }) {
  const [view, setView] = useState('posts')
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {[['posts', t('Bài đăng', 'Posts')], ['comments', t('Bình luận', 'Comments')]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`rounded-full px-3.5 py-1.5 font-utility text-2xs font-semibold ${view === id ? 'bg-ink text-paper' : 'border border-line text-ink-muted'}`}>{label}</button>
        ))}
      </div>
      {view === 'posts' ? <PostsList t={t} /> : <CommentsList t={t} />}
    </div>
  )
}

function PostsList({ t }) {
  const load = useCallback((pageIndex) => admin.listPosts({ pageIndex }), [])
  const list = usePagedList(load)
  const { busyId, error, run } = useAction(list, t)
  return (
    <Panel title={t('Bài đăng cộng đồng', 'Community posts')} count={list.count}>
      <ActionError error={error} />
      <ListState list={list} t={t} empty={t('Chưa có bài đăng.', 'No posts yet.')}>
        <ul className="divide-y divide-line">
          {list.rows.map((post) => (
            <li key={post.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold">{post.place_name} <span className="font-normal text-ink-muted">· {post.author_name}</span></div>
                <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{post.body}</p>
                <div className="mt-1 font-utility text-micro text-ink-faint">{formatDate(post.created_at)} · {t(`${post.photo_paths?.length ?? 0} ảnh · ${post.comments} bình luận`, `${post.photo_paths?.length ?? 0} photos · ${post.comments} comments`)}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link to={`/community/${post.id}`} className={BUTTON}><ArrowSquareOut size={13} />{t('Xem', 'View')}</Link>
                <button type="button" disabled={busyId === post.id} className={DANGER}
                  onClick={() => run(post.id, t('Xoá bài đăng này cùng ảnh và bình luận của nó?', 'Delete this post with its photos and comments?'), () => admin.deletePost(post))}><Trash size={13} />{t('Xoá', 'Delete')}</button>
              </div>
            </li>
          ))}
        </ul>
      </ListState>
    </Panel>
  )
}

function CommentsList({ t }) {
  const load = useCallback((pageIndex) => admin.listComments({ pageIndex }), [])
  const list = usePagedList(load)
  const { busyId, error, run } = useAction(list, t)
  return (
    <Panel title={t('Bình luận', 'Comments')} count={list.count}>
      <ActionError error={error} />
      <ListState list={list} t={t} empty={t('Chưa có bình luận.', 'No comments yet.')}>
        <ul className="divide-y divide-line">
          {list.rows.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm"><span className="font-semibold">{c.author_name}</span> <span className="text-ink-faint">· {formatDate(c.created_at)}</span></div>
                <p className="mt-0.5 line-clamp-3 text-sm text-ink-muted">{c.body}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link to={`/community/${c.post_id}`} className={BUTTON}><ArrowSquareOut size={13} />{t('Bài viết', 'Post')}</Link>
                <button type="button" disabled={busyId === c.id} className={DANGER}
                  onClick={() => run(c.id, t('Xoá bình luận này?', 'Delete this comment?'), () => admin.deleteComment(c.id))}><Trash size={13} />{t('Xoá', 'Delete')}</button>
              </div>
            </li>
          ))}
        </ul>
      </ListState>
    </Panel>
  )
}

function VideosTab({ t }) {
  const load = useCallback((pageIndex) => admin.listVideoReviews({ pageIndex }), [])
  const list = usePagedList(load)
  const { busyId, error, run } = useAction(list, t)
  return (
    <Panel title={t('Video review do người dùng chia sẻ', 'Shared video reviews')} count={list.count}>
      <ActionError error={error} />
      <ListState list={list} t={t} empty={t('Chưa có video nào.', 'No videos yet.')}>
        <ul className="divide-y divide-line">
          {list.rows.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold">{v.place_name} <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 font-utility text-micro font-semibold uppercase text-ink-muted">{v.platform}</span></div>
                {v.address && <div className="text-2xs text-ink-muted">{v.address}</div>}
                {v.note && <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{v.note}</p>}
                <div className="mt-1 font-utility text-micro text-ink-faint">{formatDate(v.created_at)}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <a href={v.video_url} target="_blank" rel="noopener noreferrer" className={BUTTON}><ArrowSquareOut size={13} />{t('Mở video', 'Open')}</a>
                <button type="button" disabled={busyId === v.id} className={DANGER}
                  onClick={() => run(v.id, t('Xoá video review này?', 'Delete this video review?'), () => admin.deleteVideoReview(v.id))}><Trash size={13} />{t('Xoá', 'Delete')}</button>
              </div>
            </li>
          ))}
        </ul>
      </ListState>
    </Panel>
  )
}

function MessagesTab({ t }) {
  const [show, setShow] = useState('open')
  const load = useCallback((pageIndex) => admin.listMessages({ show, pageIndex }), [show])
  const list = usePagedList(load)
  const { busyId, error, run } = useAction(list, t)
  return (
    <Panel title={t('Tin nhắn liên hệ', 'Contact messages')} count={list.count}
      actions={<select value={show} onChange={(e) => setShow(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1.5 font-utility text-2xs font-semibold">
        <option value="open">{t('Chưa xử lý', 'Open')}</option>
        <option value="all">{t('Tất cả', 'All')}</option>
      </select>}>
      <ActionError error={error} />
      <ListState list={list} t={t} empty={show === 'open' ? t('Không còn tin nhắn nào chưa xử lý.', 'No open messages.') : t('Chưa có tin nhắn.', 'No messages yet.')}>
        <ul className="divide-y divide-line">
          {list.rows.map((m) => (
            <li key={m.id} className={`py-3 ${m.handled_at ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm"><span className="font-semibold">{m.name}</span> <a href={`mailto:${m.email}`} className="text-chili hover:underline">{m.email}</a></div>
                <span className="font-utility text-micro text-ink-faint">{formatDate(m.created_at)}{m.handled_at && ` · ${t('đã xử lý', 'handled')}`}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{m.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`mailto:${m.email}?subject=${encodeURIComponent('FoodTrip — phản hồi liên hệ')}`} className={BUTTON}><EnvelopeSimple size={13} />{t('Trả lời qua email', 'Reply by email')}</a>
                <button type="button" disabled={busyId === m.id} className={BUTTON} onClick={() => run(m.id, null, () => admin.setMessageHandled(m.id, !m.handled_at))}>
                  {m.handled_at ? <><ArrowCounterClockwise size={13} />{t('Đánh dấu chưa xử lý', 'Mark open')}</> : <><Check size={13} />{t('Đánh dấu đã xử lý', 'Mark handled')}</>}
                </button>
                <button type="button" disabled={busyId === m.id} className={DANGER}
                  onClick={() => run(m.id, t('Xoá tin nhắn này?', 'Delete this message?'), () => admin.deleteMessage(m.id))}><Trash size={13} />{t('Xoá', 'Delete')}</button>
              </div>
            </li>
          ))}
        </ul>
      </ListState>
    </Panel>
  )
}

function SubscribersTab({ t }) {
  const load = useCallback((pageIndex) => admin.listSubscribers({ pageIndex }), [])
  const list = usePagedList(load)
  const { busyId, error, run } = useAction(list, t)
  const [exporting, setExporting] = useState(false)

  async function exportCsv() {
    setExporting(true)
    try {
      const rows = await admin.allSubscriberEmails()
      const blob = new Blob([String.fromCharCode(0xfeff) + admin.toCsv(rows, ['email', 'created_at'])], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: `foodtrip-ban-tin-${new Date().toISOString().slice(0, 10)}.csv` })
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  return (
    <Panel title={t('Người đăng ký bản tin', 'Newsletter subscribers')} count={list.count}
      actions={<button type="button" onClick={exportCsv} disabled={exporting || !list.count} className={BUTTON}><DownloadSimple size={14} />{t('Xuất CSV', 'Export CSV')}</button>}>
      <ActionError error={error} />
      <ListState list={list} t={t} empty={t('Chưa có ai đăng ký.', 'No subscribers yet.')}>
        <Table head={['Email', t('Ngày đăng ký', 'Subscribed'), '']}>
          {list.rows.map((s) => (
            <tr key={s.id}>
              <td className="px-2 py-2.5">{s.email}</td>
              <td className="px-2 py-2.5 text-ink-muted">{formatDate(s.created_at)}</td>
              <td className="px-2 py-2.5 text-right"><button type="button" disabled={busyId === s.id} className={DANGER}
                onClick={() => run(s.id, t(`Xoá ${s.email} khỏi danh sách?`, `Remove ${s.email}?`), () => admin.deleteSubscriber(s.id))}><Trash size={13} />{t('Xoá', 'Remove')}</button></td>
            </tr>
          ))}
        </Table>
      </ListState>
    </Panel>
  )
}

function UsersTab({ t, currentUserId }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const load = useCallback((pageIndex) => admin.listUsers({ search: query, pageIndex }), [query])
  const list = usePagedList(load)
  const { busyId, error, run } = useAction(list, t)

  function toggleAdmin(u) {
    const confirmText = u.is_admin
      ? t(`Gỡ quyền quản trị của ${u.email}?`, `Remove admin rights from ${u.email}?`)
      : t(`Cấp quyền quản trị cho ${u.email}? Người này sẽ xem được mọi đơn đặt phòng, giao dịch và dữ liệu người dùng.`, `Make ${u.email} an admin? They will see every booking, transfer and user record.`)
    run(u.id, confirmText, () => admin.setAdmin(u.id, !u.is_admin))
  }

  return (
    <Panel title={t('Người dùng', 'Users')}
      actions={<form onSubmit={(e) => { e.preventDefault(); setQuery(search) }} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5">
        <MagnifyingGlass size={14} className="text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Tìm theo email', 'Search by email')} className="w-44 bg-transparent text-sm outline-none" />
      </form>}>
      <ActionError error={error} />
      <ListState list={list} t={t} empty={t('Không tìm thấy người dùng.', 'No users found.')}>
        <Table head={['Email', t('Ngày tạo', 'Joined'), t('Đăng nhập gần nhất', 'Last sign-in'), t('Đặt phòng', 'Bookings'), t('Bài đăng', 'Posts'), '']}>
          {list.rows.map((u) => (
            <tr key={u.id}>
              <td className="px-2 py-2.5">{u.email}{u.is_admin && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 font-utility text-micro font-semibold text-paper">admin</span>}{u.id === currentUserId && <span className="ml-1 text-2xs text-ink-faint">({t('bạn', 'you')})</span>}</td>
              <td className="px-2 py-2.5 text-ink-muted">{formatDate(u.created_at)}</td>
              <td className="px-2 py-2.5 text-ink-muted">{formatDate(u.last_sign_in_at)}</td>
              <td className="px-2 py-2.5 font-utility">{u.bookings}</td>
              <td className="px-2 py-2.5 font-utility">{u.posts}</td>
              <td className="px-2 py-2.5 text-right">{u.id !== currentUserId && (
                <button type="button" disabled={busyId === u.id} onClick={() => toggleAdmin(u)} className={u.is_admin ? DANGER : BUTTON}>
                  <ShieldCheck size={13} />{u.is_admin ? t('Gỡ quyền admin', 'Remove admin') : t('Cấp quyền admin', 'Make admin')}
                </button>
              )}</td>
            </tr>
          ))}
        </Table>
      </ListState>
    </Panel>
  )
}

const AUDIT_ACTION = {
  'booking.paid': ['Xác nhận đã thu tiền', 'Confirmed payment'],
  'booking.cancelled': ['Huỷ đơn đặt phòng', 'Cancelled booking'],
  'booking.refunded': ['Đánh dấu đã hoàn tiền', 'Marked refunded'],
  'payment.matched': ['Gán giao dịch vào đơn', 'Matched transfer'],
  'admin.granted': ['Cấp quyền admin', 'Granted admin'],
  'admin.revoked': ['Gỡ quyền admin', 'Removed admin'],
  delete: ['Xoá', 'Deleted'],
  'hotel.confirmed': ['Khách sạn xác nhận đơn', 'Hotel confirmed'],
  'hotel.rejected': ['Khách sạn từ chối đơn', 'Hotel rejected'],
  'hotel.checked_in': ['Khách nhận phòng', 'Guest checked in'],
  'hotel.completed': ['Khách trả phòng', 'Guest checked out'],
  'hotel.no_show': ['Khách không đến', 'No-show'],
  'partner.approved': ['Duyệt đối tác', 'Approved partner'],
  'partner.rejected': ['Từ chối đối tác', 'Rejected partner'],
  'property.created': ['Thêm khách sạn đối tác', 'Added partner hotel'],
  'property.manager.owner': ['Thêm chủ khách sạn', 'Added hotel owner'],
  'property.manager.staff': ['Thêm nhân viên khách sạn', 'Added hotel staff'],
  'property.manager.none': ['Gỡ người quản lý khách sạn', 'Removed hotel manager'],
}
const AUDIT_TABLE = {
  bookings: ['đơn đặt phòng', 'booking'], payment_transactions: ['giao dịch', 'transfer'], admin_users: ['quản trị viên', 'admin'],
  community_posts: ['bài cộng đồng', 'community post'], community_comments: ['bình luận', 'comment'], video_reviews: ['video review', 'video review'],
  contact_messages: ['tin nhắn liên hệ', 'contact message'], newsletter_subscribers: ['người nhận bản tin', 'subscriber'],
  properties: ['khách sạn đối tác', 'partner hotel'], partner_applications: ['đơn đăng ký đối tác', 'partner application'],
}

/** What an admin's action was about, from the details the database logged. */
function auditSummary(entry, t) {
  const d = entry.details ?? {}
  if (d.note) return t(`Ghi chú: ${d.note}`, `Note: ${d.note}`)
  if (d.payment_code) return `${d.payment_code} · ${formatVnd(d.amount)}`
  if (d.email) return d.email
  return d.place_name || d.body || d.name || d.title || d.hotel_name || ''
}

/**
 * Everything an admin has done that changes money, power or other people's
 * content. Written by the database in the same transaction as the action, so
 * an action cannot happen without its entry.
 */
function AuditTab({ t }) {
  const load = useCallback((pageIndex) => admin.listAudit({ pageIndex }), [])
  const list = usePagedList(load)
  return (
    <Panel title={t('Nhật ký thao tác quản trị', 'Admin activity')} count={list.count}>
      <ListState list={list} t={t} empty={t('Chưa có thao tác nào.', 'Nothing yet.')}>
        <ul className="divide-y divide-line">
          {list.rows.map((entry) => {
            const action = AUDIT_ACTION[entry.action]
            const table = AUDIT_TABLE[entry.target_table]
            return (
              <li key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="text-sm"><span className="font-semibold">{action ? t(...action) : entry.action}</span>{table && <span className="text-ink-muted"> · {t(...table)}</span>}</div>
                  <p className="line-clamp-2 text-2xs text-ink-muted">{auditSummary(entry, t)}</p>
                  {entry.target_id && <div className="font-utility text-micro text-ink-faint">{entry.target_id}</div>}
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <div className="text-2xs">{entry.actor_email ?? '—'}</div>
                  <div className="font-utility text-micro text-ink-faint">{formatDate(entry.created_at)}</div>
                </div>
              </li>
            )
          })}
        </ul>
      </ListState>
    </Panel>
  )
}

/**
 * Hotel partners: applications to review, and the properties with the people
 * who run them. Approving an application needs the hotel's id on FoodTrip —
 * what follows /booking/ in its booking page address — so its bookings reach
 * the right partner.
 */
/**
 * Approve from the application itself when it carries a FoodTrip hotel link
 * (the hotel page's "Own this hotel?" button fills it in): one click, with the
 * hotel's id on the button. A hotel that already has managers is never
 * approved in one click — the server would add the applicant as a second
 * owner — so that case goes through the dialog after a warning.
 */
function QuickApprove({ a, t, busy, properties, onApprove, onEdit }) {
  const hotelId = admin.hotelIdFromLink(a.hotel_link)
  const taken = hotelId ? properties.find((p) => p.hotel_place_id === hotelId && p.managers.length) : null
  // A homestay no search finds: it pinned itself, and approving makes it a
  // new FoodTrip id. Check the pin first — it is what travellers will see.
  if (!hotelId && a.lat != null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-herb px-3 py-1.5 font-utility text-2xs font-semibold text-herb-ink disabled:opacity-50" onClick={() => onApprove(null)}>
          <Check size={13} />{t('Duyệt · cấp mã FoodTrip mới', 'Approve · new FoodTrip id')}
        </button>
        <a href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`} target="_blank" rel="noopener noreferrer" className="font-utility text-2xs font-semibold text-chili hover:underline">{t('Xem vị trí đã ghim', 'View the pin')} ↗</a>
      </div>
    )
  }
  if (!hotelId) return <button type="button" disabled={busy} className={BUTTON} onClick={onEdit}><Check size={13} />{t('Duyệt', 'Approve')}</button>
  if (taken) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <p className="max-w-[280px] text-2xs text-chili">{t(`Khách sạn ${hotelId} đã có người quản lý (${taken.managers.map((m) => m.email).join(', ')}). Xác minh kỹ trước khi thêm chủ mới.`, `${hotelId} already has managers (${taken.managers.map((m) => m.email).join(', ')}). Verify before adding another owner.`)}</p>
        <button type="button" disabled={busy} className={BUTTON} onClick={onEdit}><Check size={13} />{t('Vẫn duyệt…', 'Approve anyway…')}</button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-herb px-3 py-1.5 font-utility text-2xs font-semibold text-herb-ink disabled:opacity-50" onClick={() => onApprove(hotelId)}>
        <Check size={13} />{t(`Duyệt · ${hotelId}`, `Approve · ${hotelId}`)}
      </button>
      <a href={`/booking/${encodeURIComponent(hotelId)}`} target="_blank" rel="noopener noreferrer" className="font-utility text-2xs font-semibold text-chili hover:underline">{t('Mở trang khách sạn', 'Open hotel page')} ↗</a>
      <button type="button" disabled={busy} className="font-utility text-2xs text-ink-faint hover:text-chili" onClick={onEdit}>{t('Sửa mã', 'Change id')}</button>
    </div>
  )
}

function PartnersTab({ t }) {
  const [show, setShow] = useState('pending')
  const loadApplications = useCallback(() => admin.listApplications(show), [show])
  const applications = usePagedList(loadApplications)
  const loadProperties = useCallback(() => admin.listProperties(), [])
  const properties = usePagedList(loadProperties)
  const appAction = useAction(applications, t)
  const propAction = useAction(properties, t)
  const [dialog, ask] = useInputDialog(t)

  async function approve(a) {
    const hotelId = await ask({
      title: t(`Duyệt "${a.hotel_name}"`, `Approve "${a.hotel_name}"`),
      body: t('Nhập mã khách sạn trên FoodTrip — phần sau /booking/ trong địa chỉ trang đặt phòng của khách sạn đó. Đơn đặt phòng theo mã này sẽ hiện cho đối tác.', "Enter the hotel's FoodTrip id — what follows /booking/ in its booking page address. Bookings with this id go to the partner."),
      label: t('Mã khách sạn', 'Hotel id'), placeholder: 'hb-123456', initial: admin.hotelIdFromLink(a.hotel_link), confirmLabel: t('Duyệt', 'Approve'), minLength: 2,
    })
    if (hotelId != null) {
      const ok = await appAction.run(a.id, null, () => admin.reviewApplication(a.id, true, hotelId))
      if (ok) properties.reload()
    }
  }
  async function reject(a) {
    const note = await ask({
      title: t(`Từ chối "${a.hotel_name}"`, `Reject "${a.hotel_name}"`),
      body: t('Người đăng ký sẽ thấy lý do này.', 'The applicant will see this reason.'),
      label: t('Lý do', 'Reason'), confirmLabel: t('Từ chối', 'Reject'), minLength: 3, danger: true,
    })
    if (note != null) appAction.run(a.id, null, () => admin.reviewApplication(a.id, false, null, note))
  }
  async function addProperty() {
    const hotelId = await ask({ title: t('Thêm khách sạn đối tác', 'Add a partner hotel'), body: t('Mã khách sạn trên FoodTrip — phần sau /booking/ trong địa chỉ trang đặt phòng.', "The hotel's FoodTrip id — what follows /booking/ in its booking page address."), label: t('Mã khách sạn', 'Hotel id'), placeholder: 'hb-123456', confirmLabel: t('Tiếp', 'Next'), minLength: 2 })
    if (hotelId == null) return
    const name = await ask({ title: t('Tên khách sạn', 'Hotel name'), label: t('Tên', 'Name'), confirmLabel: t('Thêm', 'Add'), minLength: 2 })
    if (name != null) propAction.run('new', null, () => admin.createProperty(hotelId, name))
  }
  async function addManager(p) {
    const email = await ask({ title: t(`Thêm người quản lý cho ${p.name}`, `Add a manager to ${p.name}`), body: t('Người này phải đã có tài khoản FoodTrip. Họ sẽ thấy mọi đơn của khách sạn này, gồm tên và số điện thoại khách.', "They need a FoodTrip account. They will see every booking for this hotel, including guests' names and phones."), label: 'Email', placeholder: 'chu.khachsan@gmail.com', confirmLabel: t('Thêm làm chủ', 'Add as owner'), minLength: 5 })
    if (email != null) propAction.run(p.id, null, () => admin.setPropertyManager(p.id, email, 'owner'))
  }

  return (
    <div className="space-y-4">
      <Panel title={t('Đơn đăng ký làm đối tác', 'Partner applications')} count={applications.count}
        actions={<select value={show} onChange={(e) => setShow(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1.5 font-utility text-2xs font-semibold">
          <option value="pending">{t('Chờ duyệt', 'Pending')}</option>
          <option value="all">{t('Tất cả', 'All')}</option>
        </select>}>
        <ActionError error={appAction.error} />
        <ListState list={applications} t={t} empty={show === 'pending' ? t('Không có đơn nào chờ duyệt.', 'No applications waiting.') : t('Chưa có đơn đăng ký.', 'No applications yet.')}>
          <ul className="divide-y divide-line">
            {applications.rows.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 text-sm">
                  <div className="font-semibold">{a.hotel_name} <span className="font-normal text-ink-muted">· {a.email}</span></div>
                  <div className="text-2xs text-ink-muted">{a.address} · {a.phone}</div>
                  {(a.contact_name || a.room_count) && (
                    <div className="text-2xs text-ink-muted">
                      {[a.contact_name && `${a.contact_name} (${a.contact_role === 'manager' ? t('quản lý', 'manager') : t('chủ', 'owner')})`,
                        a.room_count && t(`${a.room_count} phòng`, `${a.room_count} rooms`),
                        a.star_rating ? `${a.star_rating}★` : null,
                        a.business_license && `GPKD ${a.business_license}`,
                        a.tax_code && `MST ${a.tax_code}`].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {a.terms_accepted_at && <div className="text-2xs text-herb">{t(`Đã đồng ý điều khoản v${a.terms_version} · ${formatDate(a.terms_accepted_at)}`, `Accepted terms v${a.terms_version} · ${formatDate(a.terms_accepted_at)}`)}</div>}
                  {a.lat != null && (
                    <div className="mt-0.5 text-2xs text-herb">
                      {t('Tự khai báo', 'Self-listed')}{a.property_type ? ` · ${PROPERTY_TYPES[a.property_type]?.[t('vi', 'en')] ?? a.property_type}` : ''}{a.city ? ` · ${a.city}` : ''}
                      {a.description && <span className="block text-ink-muted">{a.description}</span>}
                    </div>
                  )}
                  {a.hotel_link && <a href={a.hotel_link} target="_blank" rel="noopener noreferrer" className="break-all text-2xs text-chili hover:underline">{a.hotel_link}</a>}
                  {a.message && <p className="mt-1 text-2xs text-ink-muted">"{a.message}"</p>}
                  <div className="mt-1 font-utility text-micro text-ink-faint">{formatDate(a.created_at)}{a.status !== 'pending' && ` · ${a.status === 'approved' ? t('đã duyệt', 'approved') : t('đã từ chối', 'rejected')}${a.review_note ? ` — ${a.review_note}` : ''}`}</div>
                </div>
                {a.status === 'pending' && (
                  <div className="flex shrink-0 gap-2">
                    <QuickApprove a={a} t={t} busy={appAction.busyId === a.id} properties={properties.rows} onApprove={async (hotelId) => {
                      const ok = await appAction.run(a.id, null, () => admin.reviewApplication(a.id, true, hotelId))
                      if (ok) properties.reload()
                    }} onEdit={() => approve(a)} />
                    <button type="button" disabled={appAction.busyId === a.id} className={DANGER} onClick={() => reject(a)}>{t('Từ chối', 'Reject')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </ListState>
      </Panel>

      <Panel title={t('Khách sạn đối tác', 'Partner hotels')} count={properties.count}
        actions={<button type="button" onClick={addProperty} className={BUTTON}>+ {t('Thêm khách sạn', 'Add hotel')}</button>}>
        <ActionError error={propAction.error} />
        <ListState list={properties} t={t} empty={t('Chưa có khách sạn đối tác nào.', 'No partner hotels yet.')}>
          <ul className="divide-y divide-line">
            {properties.rows.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 text-sm">
                  <div className="font-semibold">{p.name}{p.awaiting > 0 && <span className="ml-2 rounded-full bg-lantern/20 px-2 py-0.5 font-utility text-micro font-semibold text-lantern">{t(`${p.awaiting} chờ xác nhận`, `${p.awaiting} to confirm`)}</span>}</div>
                  <div className="font-utility text-micro text-ink-faint">{p.hotel_place_id} · {t(`${p.bookings} đơn`, `${p.bookings} bookings`)}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.managers.length === 0 && <span className="text-2xs text-chili">{t('Chưa có người quản lý', 'No manager yet')}</span>}
                    {p.managers.map((m) => (
                      <span key={m.user_id} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-2xs">
                        {m.email} <span className="text-ink-faint">({m.role === 'owner' ? t('chủ', 'owner') : t('nhân viên', 'staff')})</span>
                        <button type="button" aria-label={t('Gỡ', 'Remove')} className="text-ink-faint hover:text-chili" disabled={propAction.busyId === p.id}
                          onClick={() => propAction.run(p.id, t(`Gỡ ${m.email} khỏi ${p.name}?`, `Remove ${m.email} from ${p.name}?`), () => admin.setPropertyManager(p.id, m.email, 'none'))}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
                <button type="button" disabled={propAction.busyId === p.id} className={`${BUTTON} shrink-0 self-start`} onClick={() => addManager(p)}>+ {t('Người quản lý', 'Manager')}</button>
              </li>
            ))}
          </ul>
        </ListState>
      </Panel>
      {dialog}
    </div>
  )
}
