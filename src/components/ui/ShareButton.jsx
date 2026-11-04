import { useEffect, useRef, useState } from 'react'
import { ShareNetwork, Check } from '@phosphor-icons/react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { shareOrCopyLink } from '../../lib/shareLink.js'

const C = {
  vi: { share: 'Chia sẻ', copied: 'Đã sao chép liên kết', failed: 'Chưa sao chép được — hãy copy địa chỉ trên thanh trình duyệt' },
  en: { share: 'Share', copied: 'Link copied', failed: 'Could not copy — copy the address bar instead' },
}

/**
 * Shares a page: the phone's share sheet (Zalo, Messenger…) where there is
 * one, else the link is copied and that is said. `url` defaults to this page.
 */
export default function ShareButton({ url, title, text, className = '', compact = false }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const [state, setState] = useState(null) // 'copied' | 'error'
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function share() {
    const result = await shareOrCopyLink(url ?? window.location.href, { title, text })
    if (result === 'copied' || result === 'error') {
      setState(result === 'copied' ? 'copied' : 'error')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState(null), 2600)
    }
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={share} aria-label={c.share}
        className={className || `inline-flex items-center gap-2 rounded-full border-[1.5px] border-line-strong font-utility font-semibold transition-colors hover:border-chili hover:text-chili ${compact ? 'p-2' : 'px-4 py-2 text-sm'}`}>
        {state === 'copied' ? <Check size={16} weight="bold" /> : <ShareNetwork size={16} />}
        {!compact && c.share}
      </button>
      <span role="status" aria-live="polite" className={state ? 'absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1 font-utility text-2xs font-semibold text-paper shadow-soft' : 'sr-only'}>
        {state === 'copied' ? c.copied : state === 'error' ? c.failed : ''}
      </span>
    </span>
  )
}
