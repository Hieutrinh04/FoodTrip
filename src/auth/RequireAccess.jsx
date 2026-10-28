import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useAccess } from './AccessContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'

export default function RequireAccess({ capability = 'account', children }) {
  const { user, loading, hasAuth, authError } = useAuth()
  const access = useAccess()
  const { lang } = useLanguage()
  const [authOpen, setAuthOpen] = useState(false)
  const t = (vi, en) => lang === 'vi' ? vi : en
  const checking = loading || (user && capability !== 'account' && access.status === 'loading')
  if (checking) return <p role="status" className="p-12 text-center">{t('Đang kiểm tra quyền truy cập…', 'Checking access…')}</p>
  if (!authError && access.can(capability)) return <Fragment key={user?.id ?? 'guest'}>{children}</Fragment>
  const error = authError || (user && access.status === 'error')
  return <section className="mx-auto max-w-2xl px-5 py-16 text-center">
    <h1 className="text-3xl font-bold">{error ? t('Chưa kiểm tra được quyền', 'Could not verify access') : !user ? t('Đăng nhập để sử dụng chức năng này', 'Sign in to use this feature') : t('Tài khoản chưa có quyền truy cập', 'This account does not have access')}</h1>
    <p className="mt-4 text-ink-muted">{t('Bạn có thể xem chức năng của từng vai trò trong bảng quyền truy cập.', 'See what each role can do in the access guide.')}</p>
    <div className="mt-6 flex flex-wrap justify-center gap-4">
      {error ? <button className="rounded-full bg-chili px-5 py-3 text-chili-ink" onClick={() => authError ? window.location.reload() : access.refresh()}>{t('Thử lại', 'Retry')}</button> : !user && hasAuth && <button className="rounded-full bg-chili px-5 py-3 text-chili-ink" onClick={() => setAuthOpen(true)}>{t('Đăng nhập / Đăng ký', 'Sign in / Sign up')}</button>}
      <Link className="rounded-full border border-line px-5 py-3" to="/permissions">{t('Vai trò & quyền truy cập', 'Roles & permissions')}</Link>
    </div>
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
  </section>
}
