import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Bed, CheckCircle, Copy, Check, Lock, QrCode, SpinnerGap, Warning, XCircle } from '@phosphor-icons/react'
import { getSepayPayment, getBookingPaymentStatus, mockSepayTransfer } from '../lib/sepay.js'
import { cancelBooking } from '../lib/bookings.js'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const C = {
  vi: {
    back: 'Đặt phòng của tôi', eyebrow: 'Thanh toán chuyển khoản', title: 'Quét mã để thanh toán',
    scan: 'Mở app ngân hàng, quét mã QR — số tiền và nội dung đã được điền sẵn.',
    orManual: 'Hoặc chuyển khoản thủ công',
    bank: 'Ngân hàng', account: 'Số tài khoản', holder: 'Chủ tài khoản', amount: 'Số tiền', content: 'Nội dung chuyển khoản',
    contentNote: 'Ghi đúng nội dung này — FoodTrip dựa vào nó để nhận ra đơn của bạn.',
    amountNote: 'Chuyển đúng số tiền. Thiếu tiền thì đơn chưa được xác nhận.',
    copy: 'Sao chép', copied: 'Đã chép',
    waiting: 'Đang chờ tiền về tài khoản…', waitingHint: 'Trang tự cập nhật khi nhận được tiền, thường trong vòng 1 phút. Bạn có thể đóng trang và quay lại sau.',
    paidTitle: 'Đã nhận thanh toán!', paidBody: 'Thanh toán đã được ghi nhận. Xem trạng thái xác nhận của khách sạn trong Đặt chỗ của tôi.',
    cancelledTitle: 'Đơn đặt phòng đã huỷ', expiredTitle: 'Đơn đã hết hạn thanh toán', expiredBody: 'Phòng chỉ được giữ 30 phút khi chưa thanh toán và đã được trả lại. Nếu bạn đã chuyển khoản sau thời hạn, FoodTrip sẽ liên hệ để hoàn tiền.',
    holdUntil: (time, minutes) => `Phòng được giữ đến ${time} (còn ${minutes} phút). Sau đó đơn tự huỷ.`, failedTitle: 'Thanh toán không thành công',
    refundedTitle: 'Đã hoàn tiền', cancelError: 'Chưa hủy được đơn. Đơn có thể vừa nhận thanh toán; hãy kiểm tra lại trong Đặt chỗ của tôi.',
    viewBookings: 'Xem đơn đặt phòng', cancel: 'Huỷ đơn này', confirmCancel: 'Huỷ đơn đặt phòng này? Nếu đã chuyển khoản, hãy liên hệ FoodTrip để được hoàn tiền.',
    loginTitle: 'Đăng nhập để thanh toán', loginCta: 'Đăng nhập',
    notFound: 'Không tìm thấy đơn đặt phòng này.', notYours: 'Đơn này thuộc về tài khoản khác.',
    noKey: 'Thanh toán chuyển khoản chưa được cấu hình trên máy chủ.', error: 'Chưa tải được thông tin thanh toán.', retry: 'Thử lại',
    stay: (n, g) => `${n} đêm · ${g} khách`, lastChecked: (t) => `kiểm tra lúc ${t}`,
  },
  en: {
    back: 'My bookings', eyebrow: 'Bank transfer', title: 'Scan to pay',
    scan: 'Open your banking app and scan the QR code — the amount and note are filled in.',
    orManual: 'Or transfer manually',
    bank: 'Bank', account: 'Account number', holder: 'Account holder', amount: 'Amount', content: 'Transfer note',
    contentNote: 'Use exactly this note — it is how FoodTrip recognises your booking.',
    amountNote: 'Transfer the exact amount. A short payment does not confirm the booking.',
    copy: 'Copy', copied: 'Copied',
    waiting: 'Waiting for the transfer to arrive…', waitingHint: 'This page updates itself when the money arrives, usually within a minute. You can close it and come back.',
    paidTitle: 'Payment received!', paidBody: 'Your payment was recorded. Check My bookings for the hotel’s confirmation status.',
    cancelledTitle: 'This booking was cancelled', expiredTitle: 'This booking expired unpaid', expiredBody: 'Unpaid rooms are held for 30 minutes; this one was released. If you transferred after that, FoodTrip will contact you to refund it.',
    holdUntil: (time, minutes) => `The room is held until ${time} (${minutes} min left), then the booking cancels itself.`, failedTitle: 'Payment failed',
    refundedTitle: 'Payment refunded', cancelError: 'Could not cancel. Payment may have just arrived; check the latest status in My bookings.',
    viewBookings: 'View my bookings', cancel: 'Cancel this booking', confirmCancel: 'Cancel this booking? If you already transferred, contact FoodTrip for a refund.',
    loginTitle: 'Log in to pay', loginCta: 'Log in',
    notFound: 'This booking was not found.', notYours: 'This booking belongs to another account.',
    noKey: 'Bank-transfer payment is not configured on the server.', error: 'Could not load the payment details.', retry: 'Retry',
    stay: (n, g) => `${n} night(s) · ${g} guest(s)`, lastChecked: (t) => `checked ${t}`,
  },
}

// How often the page asks whether the webhook has marked the booking paid.
const POLL_MS = 4000

const formatVnd = (n) => `${Number(n).toLocaleString('vi-VN')}đ`

function CopyRow({ label, value, display = value, note, strong = false, c }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the value is on screen to copy by hand */ }
  }
  return (
    <div className="border-b border-dashed border-line py-3 last:border-0">
      <div className="font-utility text-micro uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className={`min-w-0 break-all ${strong ? 'font-utility text-lg font-bold text-chili' : 'text-md font-semibold'}`}>{display}</span>
        <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold transition-colors hover:border-chili hover:text-chili">
          {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? c.copied : c.copy}
        </button>
      </div>
      {note && <p className="mt-1 text-2xs text-ink-muted">{note}</p>}
    </div>
  )
}

/**
 * Paying a booking by bank transfer through SePay. The page shows the QR and
 * transfer details, then watches the booking: the SePay webhook marks it paid
 * on the server when the money lands, and the page picks that up by polling
 * the booking row. Nothing here can mark it paid itself.
 */
export default function BookingPayment() {
  const { bookingId } = useParams()
  const { user } = useAuth()
  return <BookingPaymentForAccount key={`${user?.id ?? 'guest'}-${bookingId}`} />
}

function BookingPaymentForAccount() {
  const { bookingId } = useParams()
  const { lang } = useLanguage()
  const c = C[lang]
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = useState({ status: 'loading' })
  const [lastChecked, setLastChecked] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(false)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const data = await getSepayPayment(bookingId)
      setState(data.status === 'ok' ? { status: 'waiting', payment: data } : { status: data.status, booking: data.booking })
    } catch (error) {
      setState({ status: error.message })
    }
  }, [bookingId])

  useEffect(() => {
    if (authLoading) return
    if (!user) { setState({ status: 'auth-required' }); return }
    load()
  }, [authLoading, user, load])

  // Watch for the webhook's verdict while waiting, pausing in a hidden tab and
  // checking at once when the traveller comes back from their banking app.
  useEffect(() => {
    if (state.status !== 'waiting' || state.payment?.mock) return undefined
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      try {
        const row = await getBookingPaymentStatus(bookingId)
        setLastChecked(new Date())
        if (!stopped && row && row.payment_status !== 'pending') {
          setState((s) => ({ status: row.payment_status, booking: { ...s.payment?.booking, mock:row.payment_txn_ref==='DEMO' } }))
        }
      } catch { /* a missed poll is retried on the next tick */ }
    }
    pollRef.current = setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      stopped = true
      clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', check)
    }
  }, [state.status, state.payment?.mock, bookingId])

  async function handleCancel() {
    if (cancelling) return
    if (!window.confirm(c.confirmCancel)) return
    setCancelling(true); setCancelError(false)
    try {
      await cancelBooking(bookingId)
      setState((s) => ({ status: 'cancelled', booking: s.payment?.booking }))
    } catch { setCancelError(true) } finally { setCancelling(false) }
  }

  const backLink = (
    <Link to="/bookings" className="mb-6 inline-flex items-center gap-2 font-utility text-md font-semibold text-ink-muted transition-colors hover:text-chili">
      <ArrowLeft size={16} /> {c.back}
    </Link>
  )
  const viewBookings = <Link to="/bookings" className="inline-flex items-center gap-2 rounded-full bg-chili px-6 py-[13px] font-utility text-md font-semibold text-chili-ink shadow-soft">{c.viewBookings}</Link>

  let body
  if (state.status === 'loading' || authLoading) body = <Spinner label="…" />
  else if (state.status === 'auth-required') {
    body = <EmptyState icon={Lock} title={c.loginTitle} action={<button type="button" onClick={() => setAuthOpen(true)} className="rounded-full bg-chili px-6 py-[13px] font-utility text-md font-semibold text-chili-ink">{c.loginCta}</button>} />
  } else if (state.status === 'paid') {
    body = <EmptyState icon={CheckCircle} title={state.booking?.mock ? (lang === 'vi' ? 'Đã ghi nhận thanh toán thử' : 'Test payment recorded') : c.paidTitle} body={state.booking?.mock ? (lang === 'vi' ? 'Đây là giao dịch mô phỏng SePay. Không có tiền thật được chuyển; đơn được gắn nhãn DEMO.' : 'This is a simulated SePay transfer. No real funds were moved; the order is marked DEMO.') : c.paidBody} action={viewBookings} />
  } else if (state.status === 'refunded') {
    body = <EmptyState icon={CheckCircle} title={c.refundedTitle} action={viewBookings} />
  } else if (state.status === 'cancelled' || state.status === 'failed') {
    const expired = state.status === 'cancelled' && state.booking?.cancelReason === 'expired'
    body = <EmptyState icon={XCircle} title={expired ? c.expiredTitle : state.status === 'cancelled' ? c.cancelledTitle : c.failedTitle} body={expired ? c.expiredBody : undefined} action={viewBookings} />
  } else if (state.status === 'no-key') {
    body = <EmptyState icon={Warning} title={c.noKey} action={viewBookings} />
  } else if (state.status === 'not-found' || state.status === 'not-your-booking') {
    body = <EmptyState icon={Bed} title={state.status === 'not-found' ? c.notFound : c.notYours} action={viewBookings} />
  } else if (state.status !== 'waiting') {
    body = <EmptyState icon={Warning} title={c.error} action={<button type="button" onClick={load} className="rounded-full border border-line px-5 py-2.5 font-utility text-sm font-semibold">{c.retry}</button>} />
  } else if (state.payment?.mock) {
    body = <SepayMockPanel bookingId={bookingId} payment={state.payment} lang={lang} onChanged={load} />
  } else {
    const { payment } = state
    const { booking } = payment
    body = (
      <div className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col items-center rounded-2xl border border-line bg-surface p-5 text-center">
          <div className="mb-3 flex items-center gap-2 font-utility text-xs font-bold uppercase tracking-wide text-ink-muted"><QrCode size={16} /> VietQR</div>
          <img src={payment.qrUrl} alt={`VietQR ${formatVnd(payment.amount)} ${payment.content}`} width={260} height={260} className="aspect-square w-full max-w-[260px] rounded-xl bg-white p-2" />
          <p className="mt-3 text-sm text-ink-muted">{c.scan}</p>
          <div className="mt-4 w-full rounded-xl bg-paper-2 px-3 py-2.5 text-left">
            <div className="font-display text-md font-bold">{booking.hotelName}</div>
            <div className="text-xs text-ink-muted">{booking.roomName}</div>
            <div className="mt-1 font-utility text-2xs text-ink-faint">{booking.checkIn} → {booking.checkOut} · {c.stay(booking.nights, booking.guests)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-2xl border border-lantern/40 bg-lantern/10 p-4">
            <SpinnerGap size={20} className="mt-0.5 shrink-0 animate-spin text-lantern" />
            <div>
              <div className="font-semibold">{c.waiting}</div>
              {booking.holdUntil && <HoldCountdown until={booking.holdUntil} c={c} lang={lang} />}
              <p className="text-sm text-ink-muted">{c.waitingHint}{lastChecked && <span className="text-ink-faint"> · {c.lastChecked(lastChecked.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB'))}</span>}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface px-5 py-2">
            <div className="pt-3 font-utility text-xs font-bold uppercase tracking-wide text-ink-muted">{c.orManual}</div>
            <CopyRow c={c} label={c.bank} value={payment.bank} />
            <CopyRow c={c} label={c.account} value={payment.accountNumber} />
            {payment.accountName && <CopyRow c={c} label={c.holder} value={payment.accountName} />}
            <CopyRow c={c} label={c.amount} value={payment.amount} display={formatVnd(payment.amount)} note={c.amountNote} strong />
            <CopyRow c={c} label={c.content} value={payment.content} note={c.contentNote} strong />
          </div>
          {cancelError && <p role="alert" className="text-sm text-chili">{c.cancelError}</p>}
          <button type="button" disabled={cancelling} onClick={handleCancel} className="self-start font-utility text-xs font-semibold text-ink-muted underline-offset-4 hover:text-chili hover:underline disabled:opacity-50">{c.cancel}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[920px] px-5 py-10 md:px-8 md:py-14">
      {backLink}
      <span className="eyebrow eyebrow-tick">{c.eyebrow}</span>
      <h1 className="mb-6 mt-3 text-3xl font-bold leading-[1.15] md:text-4xl">{state.payment?.mock ? (lang === 'vi' ? 'Thử thanh toán SePay' : 'Test SePay payment') : c.title}</h1>
      {body}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

function SepayMockPanel({ bookingId,payment,lang,onChanged }) {
  const t=(vi,en)=>lang==='vi'?vi:en
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState(null)
  const [error,setError]=useState('')
  const lastRequest=useRef(null)
  async function simulate(scenario,repeat=false) {
    if (busy) return
    const request=repeat?lastRequest.current:{key:crypto.randomUUID(),scenario}
    if (!request) return
    lastRequest.current=request;setBusy(true);setError('')
    try {
      const data=await mockSepayTransfer(bookingId,request.key,request.scenario)
      setResult(data)
      // Keep the simulator open so duplicate delivery can be checked after paid.
    } catch(e) { setError(String(e.message).includes('mock-disabled')?t('Chế độ mock đã tắt.', 'Mock mode is off.'):t('Chưa mô phỏng được. Đơn có thể đã hết hạn hoặc không còn chờ thanh toán.', 'Could not simulate. The order may have expired or is no longer pending.')) }
    finally {setBusy(false)}
  }
  const outcomes={paid:t('Đủ tiền: đơn đã thanh toán thử', 'Paid: test payment recorded'),underpaid:t('Thiếu tiền: đơn vẫn chờ thanh toán', 'Underpaid: order remains pending'),'no-booking':t('Sai nội dung: không khớp đơn', 'Wrong note: no matching booking'),'wrong-account':t('Sai tài khoản: không xác nhận đơn', 'Wrong account: not accepted'),'not-pending':t('Đơn không còn chờ thanh toán', 'Order is no longer pending')}
  return <section className="rounded-2xl border border-lantern bg-surface p-5">
    <p className="font-bold text-chili">{t('MOCKTEST — không chuyển tiền thật', 'MOCK TEST — no real transfers')}</p>
    <p className="mt-3">{payment.booking.hotelName} · {formatVnd(payment.amount)}</p>
    <p className="mt-1 font-utility text-sm">{payment.content}</p>
    <p className="mt-3 text-sm text-ink-muted">{t('Chọn tình huống để kiểm tra xử lý webhook. Giao dịch thử được tách khỏi doanh thu/đối soát thật.', 'Choose a webhook scenario. Test transfers are excluded from real settlements.')}</p>
    <div className="mt-5 flex flex-wrap gap-3">
      {['exact','underpaid','remaining','wrong-code','wrong-account'].map((s,i)=><button key={s} disabled={busy} onClick={()=>simulate(s)} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">{[t('Đúng số tiền','Exact amount'),t('Thiếu 1.000đ','1,000 VND short'),t('Nộp phần còn thiếu','Pay remaining balance'),t('Sai nội dung','Wrong note'),t('Sai tài khoản','Wrong account')][i]}</button>)}
      <button disabled={busy||!lastRequest.current} onClick={()=>simulate('',true)} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50">{t('Gửi lại cùng giao dịch','Redeliver same transfer')}</button>
      <button onClick={onChanged} disabled={busy} className="rounded-full bg-chili px-4 py-2 text-sm text-chili-ink">{t('Xem trạng thái đơn','View order status')}</button>
    </div>
    {result&&<p role="status" className="mt-4 text-sm text-herb">{outcomes[result.outcome]??result.outcome}{result.duplicate?t(' · Đã nhận trước đó; không ghi nhận thêm',' · Already processed; no duplicate receipt'):''}</p>}
    {error&&<p role="alert" className="mt-4 text-sm text-chili">{error}</p>}
  </section>
}

/** How long the room is still held, refreshed every 30 seconds. */
function HoldCountdown({ until, c, lang }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const minutes = Math.max(0, Math.ceil((Date.parse(until) - now) / 60000))
  const time = new Date(until).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return <p className={`text-sm font-semibold ${minutes <= 5 ? 'text-chili' : ''}`}>{c.holdUntil(time, minutes)}</p>
}
