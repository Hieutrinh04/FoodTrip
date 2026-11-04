import { ArrowClockwise, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

export default function PortalLoadState({ status, onRetry }) {
  const { lang } = useLanguage()
  if (status === 'ready') return null
  const error = status === 'error'
  return <div role={error ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm ${error ? 'border-chili/40 bg-chili/5 text-chili' : 'border-line bg-surface text-ink-muted'}`}>
    <div className="flex items-center gap-2">{error ? <WarningCircle size={18} /> : <SpinnerGap size={18} className="animate-spin" />}
      <span>{lang === 'vi' ? (error ? 'Chưa tải được dữ liệu. Vui lòng thử lại.' : 'Đang tải dữ liệu…') : (error ? 'Could not load data. Please retry.' : 'Loading data…')}</span>
    </div>
    {error && onRetry && <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-current px-4 py-2 font-semibold"><ArrowClockwise size={14} />{lang === 'vi' ? 'Thử lại' : 'Retry'}</button>}
  </div>
}
