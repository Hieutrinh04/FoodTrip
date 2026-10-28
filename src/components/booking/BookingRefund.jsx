import { useState } from 'react'
import { ArrowCounterClockwise, X } from '@phosphor-icons/react'
import { cancelPaidBooking, getRefundQuote, setRefundAccount, CANCELLATION_TEXT } from '../../lib/bookings.js'

const INPUT = 'w-full rounded-lg border-[1.5px] border-line-strong bg-paper px-3 py-2 text-sm outline-none focus:border-chili'
const formatVnd = (n) => `${Number(n ?? 0).toLocaleString('vi-VN')}đ`

const ERRORS = {
  'refund-account-required': ['Nhập đủ ngân hàng, số tài khoản (6–20 chữ số) và tên chủ tài khoản để nhận tiền hoàn.', 'Enter the bank, account number (6–20 digits) and holder to receive the refund.'],
  'cannot-cancel': ['Đơn này không còn huỷ được (đã nhận phòng hoặc đã qua ngày).', 'This booking can no longer be cancelled.'],
}
const explain = (err, t) => {
  const key = Object.keys(ERRORS).find((k) => String(err?.message ?? '').includes(k))
  return key ? t(...ERRORS[key]) : t('Chưa thực hiện được, thử lại sau.', 'That did not work — try again.')
}

/** The bank fields a refund is sent to. */
function AccountFields({ form, setForm, t }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  return (
    <div className="grid gap-2">
      <input value={form.bank} onChange={set('bank')} placeholder={t('Ngân hàng', 'Bank')} aria-label={t('Ngân hàng', 'Bank')} className={INPUT} />
      <input value={form.account} onChange={set('account')} inputMode="numeric" placeholder={t('Số tài khoản', 'Account number')} aria-label={t('Số tài khoản', 'Account number')} className={INPUT} />
      <input value={form.holder} onChange={set('holder')} placeholder={t('Chủ tài khoản', 'Account holder')} aria-label={t('Chủ tài khoản', 'Account holder')} className={INPUT} />
    </div>
  )
}

/**
 * A paid booking's cancellation and refund, on the traveller's booking card:
 * cancel (seeing first what the property's policy refunds), give the account
 * a refund goes to, and follow the refund until it is done.
 */
export default function BookingRefund({ booking: b, lang, onChanged }) {
  const t = (vi, en) => (lang === 'vi' ? vi : en)
  const [quote, setQuote] = useState(null)
  const [mode, setMode] = useState('idle') // idle | quoting | cancel | account
  const [form, setForm] = useState({ bank: '', account: '', holder: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
  const cancellable = b.payment_status === 'paid' && ['awaiting', 'confirmed'].includes(b.fulfillment_status) && b.check_in >= today

  async function startCancel() {
    setMode('quoting'); setError('')
    try { setQuote(await getRefundQuote(b.id)); setMode('cancel') } catch (err) { setError(explain(err, t)); setMode('idle') }
  }
  async function run(fn) {
    setBusy(true); setError('')
    try { await fn(); setMode('idle'); onChanged() } catch (err) { setError(explain(err, t)) }
    setBusy(false)
  }

  return (
    <div className="space-y-2 text-sm">
      {b.refund_status === 'pending' && (
        <p className="rounded-lg bg-lantern/15 px-3 py-2 text-xs">
          <ArrowCounterClockwise size={12} className="mr-1 inline" />
          {t(`Đang hoàn ${formatVnd(b.refund_amount)}`, `Refunding ${formatVnd(b.refund_amount)}`)}
          {b.refund_account ? t(` vào ${b.refund_bank} ••••${b.refund_account.slice(-4)} — thường trong 3 ngày làm việc.`, ` to ${b.refund_bank} ••••${b.refund_account.slice(-4)} — usually within 3 working days.`)
            : <> — <button type="button" onClick={() => setMode('account')} className="font-semibold text-chili hover:underline">{t('nhập tài khoản nhận tiền', 'add the account to refund to')}</button></>}
        </p>
      )}
      {b.refund_status === 'completed' && (
        <p className="rounded-lg bg-herb/10 px-3 py-2 text-xs text-herb">{t(`Đã hoàn ${formatVnd(b.refund_amount)}`, `Refunded ${formatVnd(b.refund_amount)}`)}{b.refund_reference ? ` · ${b.refund_reference}` : ''}</p>
      )}
      {b.fulfillment_status === 'guest_cancelled' && b.refund_status === 'none' && (
        <p className="text-xs text-ink-muted">{t('Bạn đã huỷ đơn này. Theo chính sách huỷ của cơ sở, đơn không được hoàn tiền.', 'You cancelled this booking; under the property’s policy it was not refundable.')}</p>
      )}
      {b.payment_status === 'cancelled' && b.cancel_reason === 'expired' && (
        <p className="text-xs text-ink-muted">{t('Hết hạn thanh toán sau 30 phút — phòng đã được trả lại.', 'Payment window (30 min) expired — the room was released.')}</p>
      )}

      {mode === 'account' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => setRefundAccount(b.id, form)) }}>
          <AccountFields form={form} setForm={setForm} t={t} />
          <div className="flex gap-2"><button disabled={busy} className="rounded-full bg-chili px-4 py-1.5 font-utility text-xs font-semibold text-chili-ink disabled:opacity-60">{t('Lưu tài khoản', 'Save account')}</button><button type="button" onClick={() => setMode('idle')} className="rounded-full border border-line px-4 py-1.5 font-utility text-xs font-semibold">{t('Huỷ', 'Cancel')}</button></div>
        </form>
      )}

      {cancellable && mode === 'idle' && (
        <button type="button" onClick={startCancel} className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-line-strong px-4 py-2 font-utility text-sm font-semibold transition-colors hover:border-chili hover:text-chili">
          <X size={13} /> {t('Huỷ đặt phòng', 'Cancel booking')}
        </button>
      )}
      {mode === 'quoting' && <p className="text-xs text-ink-muted">{t('Đang tính tiền hoàn…', 'Working out the refund…')}</p>}
      {mode === 'cancel' && quote && (
        <form className="space-y-2 rounded-xl border border-line p-3" onSubmit={(e) => {
          e.preventDefault()
          // The database checks this too; saying so here saves a round trip.
          if (quote.refund_amount > 0 && (form.bank.trim().length < 2 || !/^[0-9]{6,20}$/.test(form.account.trim()) || form.holder.trim().length < 2)) { setError(t(...ERRORS['refund-account-required'])); return }
          run(() => cancelPaidBooking(b.id, { ...form, account: form.account.trim() }))
        }}>
          <p className="text-xs text-ink-muted">{CANCELLATION_TEXT[quote.policy]?.[lang] ?? quote.policy} · {t(`còn ${quote.days_before} ngày đến ngày nhận phòng`, `${quote.days_before} days before check-in`)}</p>
          <p className="font-semibold">
            {quote.demo ? t('Đơn thanh toán ở chế độ demo — không có tiền để hoàn.', 'Paid in demo mode — there is no money to refund.')
              : quote.refund_amount > 0 ? t(`Bạn được hoàn ${formatVnd(quote.refund_amount)} (${quote.refund_pct}%).`, `You get ${formatVnd(quote.refund_amount)} back (${quote.refund_pct}%).`)
              : t('Theo chính sách, huỷ lúc này không được hoàn tiền.', 'Under the policy, cancelling now refunds nothing.')}
          </p>
          {quote.refund_amount > 0 && <AccountFields form={form} setForm={setForm} t={t} />}
          <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} maxLength={500} placeholder={t('Lý do huỷ (không bắt buộc)', 'Reason (optional)')} aria-label={t('Lý do huỷ', 'Reason')} className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className="rounded-full bg-chili px-4 py-1.5 font-utility text-xs font-semibold text-chili-ink disabled:opacity-60">{busy ? t('Đang huỷ…', 'Cancelling…') : t('Xác nhận huỷ', 'Confirm cancellation')}</button>
            <button type="button" onClick={() => setMode('idle')} className="rounded-full border border-line px-4 py-1.5 font-utility text-xs font-semibold">{t('Giữ đơn', 'Keep booking')}</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-xs text-chili">{error}</p>}
    </div>
  )
}
