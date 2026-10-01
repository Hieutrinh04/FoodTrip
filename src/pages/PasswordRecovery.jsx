import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const COPY = {
  vi: { forgot:'Quên mật khẩu?', reset:'Đặt mật khẩu mới', hint:'Nhập email tài khoản FoodTrip để nhận liên kết đặt lại mật khẩu.', email:'Email tài khoản', password:'Mật khẩu mới (ít nhất 6 ký tự)', confirm:'Nhập lại mật khẩu', send:'Gửi liên kết đặt lại', save:'Lưu mật khẩu mới', busy:'Đang xử lý…', sent:'Nếu email này có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu. Hãy kiểm tra cả thư rác.', saved:'Đã đổi mật khẩu thành công.', mismatch:'Hai mật khẩu không trùng nhau.', error:'Chưa thực hiện được. Kiểm tra kết nối hoặc đợi một lát rồi thử lại.', invalid:'Liên kết không hợp lệ, đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu email mới.', home:'Về trang chủ', request:'Yêu cầu liên kết mới', loading:'Đang kiểm tra liên kết…', retry:'Mật khẩu chưa được chấp nhận. Hãy dùng mật khẩu mới khác mật khẩu cũ và đáp ứng yêu cầu bảo mật.' },
  en: { forgot:'Forgot your password?', reset:'Set a new password', hint:'Enter your FoodTrip account email to receive a reset link.', email:'Account email', password:'New password (at least 6 characters)', confirm:'Confirm password', send:'Send reset link', save:'Save new password', busy:'Working…', sent:'If this email has an account, you will receive a password reset link. Please check your spam folder too.', saved:'Your password has been updated.', mismatch:'The passwords do not match.', error:'Could not complete the request. Check your connection or wait and try again.', invalid:'This link is invalid, expired or already used. Please request a new email.', home:'Back to home', request:'Request a new link', loading:'Checking your link…', retry:'This password was not accepted. Choose a new password different from the old one that meets the security requirements.' },
}
const FIELD = 'mt-2 w-full rounded-xl border border-line-strong bg-paper px-4 py-3'

export default function PasswordRecovery({ reset = false }) {
  const { lang } = useLanguage()
  const c = COPY[lang] ?? COPY.vi
  const { recovery, loading, requestPasswordReset, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    if (reset && password !== confirmation) { setError(c.mismatch); return }
    submitting.current = true; setBusy(true)
    try {
      const result = reset ? await resetPassword(password) : await requestPasswordReset(email.trim())
      if (result.error) { setError(reset ? c.retry : c.error); return }
      setDone(true); setPassword(''); setConfirmation('')
    } catch { setError(c.error) }
    finally { submitting.current = false; setBusy(false) }
  }
  return <section className="mx-auto max-w-lg px-5 py-16"><div className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
    <span className="eyebrow">FoodTrip · {lang === 'en' ? 'Account' : 'Tài khoản'}</span>
    <h1 className="my-4 text-3xl font-bold">{reset ? c.reset : c.forgot}</h1>
    {done ? <p role="status" className="text-herb">{reset ? c.saved : c.sent}</p>
      : reset && loading ? <p role="status">{c.loading}</p>
      : reset && !recovery ? <p role="alert">{c.invalid}</p>
      : <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
        {!reset ? <><p className="text-ink-muted">{c.hint}</p><label className="block">{c.email}<input className={FIELD} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label></>
          : <><label className="block">{c.password}<input className={FIELD} type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label><label className="block">{c.confirm}<input className={FIELD} type="password" autoComplete="new-password" required minLength={6} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label></>}
        {error && <p role="alert" className="text-chili">{error}</p>}
        <button className="w-full rounded-full bg-chili px-5 py-3 font-semibold text-chili-ink disabled:opacity-50">{busy ? c.busy : reset ? c.save : c.send}</button>
      </fieldset></form>}
    <div className="mt-6 flex flex-wrap gap-4 text-sm underline"><Link to="/">{c.home}</Link>{reset && !done && <Link to="/forgot-password">{c.request}</Link>}</div>
  </div></section>
}
