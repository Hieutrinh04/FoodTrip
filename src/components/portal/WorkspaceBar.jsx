import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, SquaresFour } from '@phosphor-icons/react'
import { useAccess } from '../../auth/AccessContext.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { accountWorkspaces, currentWorkspace, workspaceRole } from '../../lib/workspaces.js'

export default function WorkspaceBar() {
  const access = useAccess()
  const { lang } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const t = (vi, en) => lang === 'vi' ? vi : en
  const visible = ['/account', '/admin', '/partner', '/partner/tours', '/trips', '/saved', '/bookings', '/permissions'].includes(location.pathname)
  if (!access.userId || !visible) return null
  const entries = accountWorkspaces(access)
  const current = currentWorkspace(entries, location.pathname, location.search)
  return <div className="no-print border-b border-line bg-surface/80">
    <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-8">
      <Link to="/account" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-ink-muted hover:text-chili"><SquaresFour size={18} />{t('Tài khoản & công việc', 'Account & workspaces')}</Link>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
        {access.status === 'ready' && entries.length > 1 && <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
          <span className="sr-only">{t('Chuyển khu vực làm việc', 'Switch workspace')}</span>
          <select value={current?.id ?? 'personal'} onChange={(e) => { const entry = entries.find((item) => item.id === e.target.value); if (entry) navigate(entry.to) }} className="min-h-10 max-w-full rounded-xl border border-line-strong bg-paper px-3 py-2 sm:max-w-80">
            {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.label[lang]} · {workspaceRole(entry, lang)}{entry.suspended ? t(' · Tạm khoá', ' · Suspended') : ''}</option>)}
          </select>
        </label>}
        {access.status === 'error' && <Link to="/account" className="text-sm text-chili">{t('Kiểm tra lại quyền', 'Verify access')}</Link>}
        <Link to="/explore" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-ink-muted hover:text-chili"><ArrowLeft size={15} />{t('Khám phá', 'Explore')}</Link>
      </div>
    </div>
  </div>
}
