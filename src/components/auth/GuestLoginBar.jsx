/* oxlint-disable react/only-export-components -- shared visibility hook */
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useLoginPrompt } from '../../auth/LoginPromptContext.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

export function useGuestBarVisible() {
  const { user, loading, hasAuth } = useAuth()
  const { pathname } = useLocation()
  return !user && !loading && hasAuth && /^\/(explore|community|share|place|plan|tour|nearby)(\/|$)/.test(pathname)
}

export default function GuestLoginBar() {
  const visible = useGuestBarVisible()
  const openLogin = useLoginPrompt()
  const { lang } = useLanguage()
  const t = (vi, en) => lang === 'vi' ? vi : en
  if (!visible) return null
  return <aside aria-label={t('Mời đăng nhập FoodTrip', 'Join FoodTrip')} className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-herb px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] text-herb-ink shadow-lifted">
    <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
      <div><p className="font-bold">{t('Khám phá thêm cùng FoodTrip', 'Discover more with FoodTrip')}</p><p className="text-sm opacity-90">{t('Đăng nhập để lưu địa điểm, tạo lịch trình và tham gia cộng đồng.', 'Sign in to save places, plan trips and join the community.')}</p></div>
      <div className="flex shrink-0 gap-2">
        <button type="button" className="rounded-full border border-current px-4 py-2 text-sm font-semibold" onClick={() => openLogin()}>{t('Đăng nhập', 'Log in')}</button>
        <button type="button" className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-herb" onClick={() => openLogin('', 'signUp')}>{t('Tạo tài khoản', 'Create account')}</button>
      </div>
    </div>
  </aside>
}
