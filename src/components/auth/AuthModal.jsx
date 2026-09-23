import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, EnvelopeSimple, LockSimple, Eye, EyeSlash, ArrowRight, Coffee, ForkKnife, MapPin, BookmarkSimple, CheckCircle, WarningCircle, CircleNotch } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import LogoMark from '../ui/LogoMark.jsx'
import Wordmark from '../ui/Wordmark.jsx'
import './AuthModal.css'

const COPY = {
  vi: {
    eyebrow: 'Ăn ngon. Đi vui. Cùng nhau.', headline: 'Đi đâu cũng có', accent: 'chuyện ngon.',
    intro: 'Lưu những quán bạn mê, lên lịch những chuyến đi bạn muốn. Tất cả ở một nơi.',
    ticket: 'MỘT NGÀY THẬT VỪA Ý', city: 'Dạo một vòng Sài Gòn', stops: ['Cà phê đầu ngày', 'Một quán ngon quen', 'Một góc phố mới'],
    saved: 'Giữ lại điều bạn thích', savedSub: 'Để mỗi chuyến đi đều mang dấu ấn của bạn.',
    signIn: 'Đăng nhập', signUp: 'Đăng ký', titleIn: 'Chào bạn trở lại!', titleUp: 'Bắt đầu chuyến đi của bạn.',
    subIn: 'Những quán ngon và lịch trình đã lưu đang chờ bạn.', subUp: 'Tạo tài khoản để lưu quán và lên lịch trình cùng FoodTrip.',
    email: 'Địa chỉ email', password: 'Mật khẩu', confirm: 'Nhập lại mật khẩu', emailPlaceholder: 'ban@example.com',
    passwordPlaceholder: 'Nhập mật khẩu của bạn', newPasswordPlaceholder: 'Tạo mật khẩu', confirmPlaceholder: 'Nhập lại mật khẩu vừa tạo',
    passwordHint: 'Dùng ít nhất 6 ký tự.', show: 'Hiện mật khẩu', hide: 'Ẩn mật khẩu',
    submitIn: 'Đăng nhập', submitUp: 'Tạo tài khoản', busy: 'Đang xử lý…',
    switchIn: 'Chưa có tài khoản?', switchUp: 'Đã có tài khoản?', switchLinkUp: 'Đăng ký ngay', switchLinkIn: 'Đăng nhập',
    footer: 'Một tài khoản, những hành trình của riêng bạn.', close: 'Đóng',
    success: 'Đã gửi email xác nhận. Mở hộp thư để kích hoạt tài khoản, sau đó quay lại đăng nhập.',
    mismatch: 'Hai mật khẩu chưa trùng nhau. Bạn kiểm tra lại nhé.',
    credentials: 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.',
    unconfirmed: 'Bạn cần xác nhận email trước khi đăng nhập. Hãy kiểm tra hộp thư và thư rác.',
    exists: 'Email này đã được đăng ký. Bạn có thể chuyển sang đăng nhập.',
    rate: 'Bạn đã thử nhiều lần. Vui lòng đợi một lát rồi thử lại.',
    weak: 'Mật khẩu chưa đáp ứng yêu cầu. Hãy dùng mật khẩu dài hơn, kết hợp chữ và số.',
    generic: 'Chưa thể kết nối. Vui lòng thử lại sau; email đã nhập vẫn được giữ.',
  },
  en: {
    eyebrow: 'Good food. Good trips. Together.', headline: 'Every trip has', accent: 'a delicious story.',
    intro: 'Save the places you love and plan the trips you dream of. All in one place.',
    ticket: 'YOUR KIND OF DAY', city: 'A little wander in Saigon', stops: ['A morning coffee', 'A favorite food spot', 'A new street to explore'],
    saved: 'Keep your favorites close', savedSub: 'Make every trip feel a little more like you.',
    signIn: 'Log in', signUp: 'Sign up', titleIn: 'Welcome back!', titleUp: 'Your next trip starts here.',
    subIn: 'Your favorite places and saved itineraries are waiting.', subUp: 'Create an account to save places and plan trips with FoodTrip.',
    email: 'Email address', password: 'Password', confirm: 'Confirm password', emailPlaceholder: 'you@example.com',
    passwordPlaceholder: 'Enter your password', newPasswordPlaceholder: 'Create a password', confirmPlaceholder: 'Enter your new password again',
    passwordHint: 'Use at least 6 characters.', show: 'Show password', hide: 'Hide password',
    submitIn: 'Log in', submitUp: 'Create account', busy: 'Working…',
    switchIn: 'New to FoodTrip?', switchUp: 'Already have an account?', switchLinkUp: 'Sign up', switchLinkIn: 'Log in',
    footer: 'One account. All your own adventures.', close: 'Close',
    success: 'Confirmation email sent. Check your inbox to activate your account, then come back to log in.',
    mismatch: 'The passwords do not match. Please check them again.',
    credentials: 'The email or password is incorrect. Please try again.',
    unconfirmed: 'Confirm your email before logging in. Check your inbox and spam folder.',
    exists: 'This email is already registered. You can switch to log in.',
    rate: 'Too many attempts. Please wait a little before trying again.',
    weak: 'This password does not meet the requirements. Try a longer password with letters and numbers.',
    generic: 'Could not connect. Please try again; your email is still here.',
  },
}

function friendlyError(error, c) {
  const message = String(error || '').toLowerCase()
  if (/invalid.*credentials|invalid login/.test(message)) return c.credentials
  if (/email.*not confirmed/.test(message)) return c.unconfirmed
  if (/already.*registered|already.*exists/.test(message)) return c.exists
  if (/rate|too many|after.*seconds/.test(message)) return c.rate
  if (/password|weak/.test(message)) return c.weak
  return c.generic
}

export default function AuthModal({ onClose }) {
  const { lang } = useLanguage()
  const c = COPY[lang] || COPY.vi
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const dialogRef = useRef(null)
  const emailRef = useRef(null)
  const confirmRef = useRef(null)
  const closeRef = useRef(onClose)
  const mounted = useRef(false)
  const submitting = useRef(false)
  const isSignUp = mode === 'signUp'

  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const lifecycle = mounted
    lifecycle.current = true
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const root = document.getElementById('root')
    const previousInert = root?.inert
    if (root) root.inert = true
    document.body.style.overflow = 'hidden'
    emailRef.current?.focus({ preventScroll: true })
    function onKeyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), [tabindex="0"]') || [])].filter((node) => node.getClientRects().length && node.tabIndex >= 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      lifecycle.current = false
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (root) root.inert = previousInert
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  function switchMode(next) {
    if (submitting.current) return
    setMode(next)
    setPassword(''); setConfirmation(''); setVisible(false)
    setError(''); setSuccess('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting.current) return
    setError(''); setSuccess('')
    if (isSignUp && password !== confirmation) {
      setError(c.mismatch); confirmRef.current?.focus(); return
    }
    submitting.current = true
    setBusy(true)
    try {
      const result = isSignUp ? await signUp(email.trim(), password) : await signIn(email.trim(), password)
      if (!mounted.current) return
      if (result.error) { setError(friendlyError(result.error, c)); return }
      if (!isSignUp || result.signedIn) { closeRef.current(); return }
      setMode('signIn'); setPassword(''); setConfirmation(''); setVisible(false)
      setSuccess(c.success)
      emailRef.current?.focus()
    } catch {
      if (mounted.current) setError(c.generic)
    } finally {
      submitting.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return createPortal(
    <div className="ft-auth-overlay">
      <div className="ft-auth-backdrop" onClick={onClose} aria-hidden="true" />
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" aria-describedby="auth-modal-description" tabIndex={-1}
        initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22 }} className="ft-auth-dialog">
        <button type="button" onClick={onClose} aria-label={c.close} className="ft-auth-close"><X size={19} /></button>
        <div className="ft-auth-content">
        <aside className="ft-auth-story" aria-label="FoodTrip">
          <div className="ft-auth-brand"><LogoMark size={36} /><Wordmark /></div>
          <div className="ft-auth-story-copy"><span className="eyebrow eyebrow-tick">{c.eyebrow}</span><h2>{c.headline}<br /><em>{c.accent}</em></h2><p>{c.intro}</p></div>
          <div className="ft-auth-ticket" aria-hidden="true">
            <span className="ft-auth-ticket-label"><span className="ft-auth-ticket-dot" />{c.ticket}</span>
            <div className="ft-auth-ticket-heading">{c.city}<span>↗</span></div>
            <div className="ft-auth-route">{[Coffee, ForkKnife, MapPin].map((Icon, index) => <div className="ft-auth-stop" key={index}><span className={`ft-auth-stop-icon ft-auth-stop-${index}`}><Icon size={19} /></span><span>{c.stops[index]}</span><small>{['08:00', '12:00', '16:00'][index]}</small></div>)}</div>
            <div className="ft-auth-ticket-bottom"><span>FOODTRIP / {lang === 'vi' ? 'ĐI & THƯỞNG THỨC' : 'GO & SAVOR'}</span><span>✳</span></div>
          </div>
          <div className="ft-auth-story-note"><BookmarkSimple size={21} /><div><strong>{c.saved}</strong><p>{c.savedSub}</p></div></div>
        </aside>
        <section className="ft-auth-form-side">
          <div className="ft-auth-tabs" role="tablist" aria-label={lang === 'vi' ? 'Tài khoản' : 'Account'}>
            {['signIn', 'signUp'].map((item) => <button key={item} type="button" role="tab" id={`auth-tab-${item}`} aria-controls="auth-panel" aria-selected={mode === item} tabIndex={mode === item ? 0 : -1} disabled={busy}
              onClick={() => switchMode(item)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'signIn' : event.key === 'End' ? 'signUp' : mode === 'signIn' ? 'signUp' : 'signIn'; switchMode(next); document.getElementById(`auth-tab-${next}`)?.focus() } }}>{c[item]}</button>)}
          </div>
          <div role="tabpanel" id="auth-panel" aria-labelledby={`auth-tab-${mode}`}>
            <div className="ft-auth-form-heading"><span className="ft-auth-step">{isSignUp ? '01 / LET’S GO' : '01 / WELCOME BACK'}</span><h2 id="auth-modal-title">{isSignUp ? c.titleUp : c.titleIn}</h2><p id="auth-modal-description">{isSignUp ? c.subUp : c.subIn}</p></div>
            <form onSubmit={handleSubmit} className="ft-auth-form" aria-busy={busy}>
              <label className="ft-auth-label" htmlFor="auth-email">{c.email}</label>
              <div className="ft-auth-input"><EnvelopeSimple size={18} aria-hidden="true" /><input ref={emailRef} id="auth-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} placeholder={c.emailPlaceholder} /></div>
              <label className="ft-auth-label" htmlFor="auth-password">{c.password}</label>
              <div className="ft-auth-input"><LockSimple size={18} aria-hidden="true" /><input id="auth-password" name="password" type={visible ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} required minLength={isSignUp ? 6 : undefined} disabled={busy} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} placeholder={isSignUp ? c.newPasswordPlaceholder : c.passwordPlaceholder} aria-describedby={isSignUp ? 'auth-password-hint' : undefined} /><button type="button" aria-label={visible ? c.hide : c.show} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeSlash size={19} /> : <Eye size={19} />}</button></div>
              {isSignUp && <><p id="auth-password-hint" className="ft-auth-hint">{c.passwordHint}</p><label className="ft-auth-label" htmlFor="auth-confirm">{c.confirm}</label><div className="ft-auth-input"><LockSimple size={18} aria-hidden="true" /><input ref={confirmRef} id="auth-confirm" name="confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={6} disabled={busy} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError('') }} placeholder={c.confirmPlaceholder} aria-invalid={error === c.mismatch} aria-describedby={error === c.mismatch ? 'auth-error' : undefined} /></div></>}
              {error && <div id="auth-error" className="ft-auth-message ft-auth-error" role="alert"><WarningCircle size={19} /><p>{error}</p></div>}
              {success && <div className="ft-auth-message ft-auth-success" role="status"><CheckCircle size={19} /><p>{success}</p></div>}
              <button type="submit" disabled={busy} className="ft-auth-submit">{busy ? <><CircleNotch size={19} className="ft-auth-spinner" />{c.busy}</> : <>{isSignUp ? c.submitUp : c.submitIn}<ArrowRight size={19} /></>}</button>
            </form>
            <p className="ft-auth-switch">{isSignUp ? c.switchUp : c.switchIn}{' '}<button type="button" disabled={busy} onClick={() => { switchMode(isSignUp ? 'signIn' : 'signUp'); emailRef.current?.focus() }}>{isSignUp ? c.switchLinkIn : c.switchLinkUp}</button></p>
          </div>
          <p className="ft-auth-footer"><span />{c.footer}<span /></p>
        </section>
        </div>
      </motion.div>
    </div>, document.body,
  )
}
