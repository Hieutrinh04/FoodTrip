import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, EnvelopeSimple, LockSimple } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    signInTitle: 'Đăng nhập',
    signUpTitle: 'Tạo tài khoản',
    email: 'Email',
    password: 'Mật khẩu',
    signIn: 'Đăng nhập',
    signUp: 'Đăng ký',
    switchToSignUp: 'Chưa có tài khoản? Đăng ký',
    switchToSignIn: 'Đã có tài khoản? Đăng nhập',
    signUpSuccess: 'Đã tạo tài khoản! Kiểm tra email để xác nhận, sau đó đăng nhập lại.',
    genericError: 'Có lỗi xảy ra, thử lại nhé.',
  },
  en: {
    signInTitle: 'Log in',
    signUpTitle: 'Create account',
    email: 'Email',
    password: 'Password',
    signIn: 'Log in',
    signUp: 'Sign up',
    switchToSignUp: "Don't have an account? Sign up",
    switchToSignIn: 'Already have an account? Log in',
    signUpSuccess: 'Account created! Check your email to confirm, then log in.',
    genericError: 'Something went wrong — please try again.',
  },
}

export default function AuthModal({ onClose }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signIn') // signIn | signUp
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // idle | busy | error
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('busy')
    setErrorMsg('')
    setSuccessMsg('')

    if (mode === 'signIn') {
      const { error } = await signIn(email, password)
      if (error) {
        setStatus('error')
        setErrorMsg(error)
        return
      }
      onClose()
    } else {
      const { error, signedIn } = await signUp(email, password)
      if (error) {
        setStatus('error')
        setErrorMsg(error)
        return
      }
      if (signedIn) {
        onClose()
        return
      }
      setStatus('idle')
      setSuccessMsg(c.signUpSuccess)
      setMode('signIn')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-[380px] bg-surface rounded-2xl shadow-lifted p-6"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-faint hover:text-chili transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="font-display text-[22px] font-bold mb-5">{mode === 'signIn' ? c.signInTitle : c.signUpTitle}</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-4 py-2.5 focus-within:border-chili transition-colors">
            <EnvelopeSimple size={16} className="text-ink-faint shrink-0" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={c.email}
              className="flex-1 min-w-0 outline-none bg-transparent text-[14px]"
            />
          </div>
          <div className="flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-4 py-2.5 focus-within:border-chili transition-colors">
            <LockSimple size={16} className="text-ink-faint shrink-0" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={c.password}
              className="flex-1 min-w-0 outline-none bg-transparent text-[14px]"
            />
          </div>

          {errorMsg && <p className="text-[13px] text-chili">{errorMsg || c.genericError}</p>}
          {successMsg && <p className="text-[13px] text-herb">{successMsg}</p>}

          <button
            type="submit"
            disabled={status === 'busy'}
            className="mt-1 inline-flex items-center justify-center gap-2 font-utility font-semibold text-[14.5px] px-6 py-3 rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow disabled:opacity-60"
          >
            {mode === 'signIn' ? c.signIn : c.signUp}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn')
            setErrorMsg('')
            setSuccessMsg('')
          }}
          className="mt-4 w-full text-center font-utility text-[13px] font-semibold text-ink-muted hover:text-chili transition-colors"
        >
          {mode === 'signIn' ? c.switchToSignUp : c.switchToSignIn}
        </button>
      </motion.div>
    </div>,
    document.body
  )
}
