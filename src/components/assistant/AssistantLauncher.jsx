import { useState } from 'react'
import { ChatCircleDots } from '@phosphor-icons/react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { useGuestBarVisible } from '../auth/GuestLoginBar.jsx'

/** Load conversation/data/map modules only when the visitor opens the assistant. */
export default function AssistantLauncher() {
  const { lang } = useLanguage()
  const guestBar = useGuestBarVisible()
  const [Chat, setChat] = useState(null)
  const [status, setStatus] = useState('idle')
  const vi = lang === 'vi'
  async function open() {
    if (status === 'loading') return
    setStatus('loading')
    try {
      const module = await import('./AssistantChat.jsx')
      setChat(() => module.default)
    } catch { setStatus('error') }
  }
  if (Chat) return <Chat initiallyOpen />
  return <div className="no-print">
    {status === 'error' && <p role="alert" className={`fixed right-4 ${guestBar ? 'bottom-56 md:bottom-44' : 'bottom-20'} z-[60] max-w-64 rounded-xl border border-line bg-surface p-3 text-sm`}>{vi ? 'Chưa tải được trợ lý. Bấm lại để thử.' : 'Could not load the assistant. Press again to retry.'}</p>}
    <button type="button" onClick={open} disabled={status === 'loading'} aria-busy={status === 'loading'} aria-label={vi ? 'Trợ lý FoodTrip' : 'FoodTrip assistant'} className={`fixed right-4 ${guestBar ? 'bottom-40 md:bottom-28' : 'bottom-5'} z-[60] inline-flex items-center gap-2 rounded-full bg-chili px-4 py-3 font-utility text-sm font-semibold text-chili-ink shadow-lifted transition-transform hover:-translate-y-0.5 disabled:opacity-60`}>
      <ChatCircleDots size={20} weight="fill" /><span className="hidden sm:inline">{status === 'loading' ? (vi ? 'Đang tải trợ lý…' : 'Loading assistant…') : (vi ? 'Trợ lý FoodTrip' : 'FoodTrip assistant')}</span>
    </button>
  </div>
}
