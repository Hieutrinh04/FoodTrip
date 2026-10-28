import { useLoginPrompt } from '../../auth/LoginPromptContext.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

export default function GuestLoginWall({ title, body, compact = false }) {
  const openLogin = useLoginPrompt()
  const { lang } = useLanguage()
  const t = (vi, en) => lang === 'vi' ? vi : en
  const heading = title || t('Đăng nhập để tiếp tục khám phá', 'Sign in to keep exploring')
  return <section className={`no-print rounded-2xl border border-line bg-surface text-center ${compact ? 'p-4' : 'p-6 md:p-8'}`} aria-label={heading}>
    <h2 className="text-xl font-bold">{heading}</h2>
    <p className="mt-2 text-sm text-ink-muted">{body || t('Xem đầy đủ câu chuyện, tham gia thảo luận và lưu những nơi bạn thích.', 'See more stories, join discussions and save your favourite places.')}</p>
    <div className="mt-4 flex flex-wrap justify-center gap-3">
      <button type="button" className="rounded-full bg-chili px-5 py-2.5 font-utility text-sm font-semibold text-chili-ink" onClick={() => openLogin(heading)}>{t('Đăng nhập', 'Log in')}</button>
      <button type="button" className="rounded-full border border-line-strong px-5 py-2.5 font-utility text-sm font-semibold" onClick={() => openLogin(heading, 'signUp')}>{t('Tạo tài khoản', 'Create account')}</button>
    </div>
  </section>
}
