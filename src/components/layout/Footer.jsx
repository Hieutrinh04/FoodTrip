import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { EnvelopeSimple, FacebookLogo, InstagramLogo, TiktokLogo, CheckCircle } from '@phosphor-icons/react'
import LogoMark from '../ui/LogoMark.jsx'
import Wordmark from '../ui/Wordmark.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { supabase, hasSupabase } from '../../lib/supabaseClient.js'

const CONTENT = {
  vi: {
    blurb: 'Ăn ngon, đi vui, lịch trình vừa ý — cùng cộng đồng yêu ẩm thực Việt.',
    newsletterPlaceholder: 'Email của bạn',
    newsletterSuccess: 'Đã đăng ký! Cảm ơn bạn.',
    newsletterError: 'Có lỗi xảy ra, thử lại nhé.',
    newsletterDuplicate: 'Email này đã đăng ký rồi.',
    cols: [
      { title: 'Sản phẩm', links: [{ to: '/explore', label: 'Khám phá' }, { to: '/plan', label: 'Lịch trình AI' }] },
      { title: 'Công ty', links: [{ to: '#', label: 'Về chúng tôi' }, { to: '#', label: 'Tuyển dụng' }, { to: '#', label: 'Blog ẩm thực' }] },
      { title: 'Hỗ trợ', links: [{ to: '#', label: 'Trung tâm trợ giúp' }, { to: '#', label: 'Liên hệ' }, { to: '#', label: 'Điều khoản' }] },
    ],
    bottom: '© 2026 FoodTrip. Made with vị giác tại Việt Nam.',
  },
  en: {
    blurb: 'Eat well, travel happy, itinerary just right — for Vietnam’s food-loving community.',
    newsletterPlaceholder: 'Your email',
    newsletterSuccess: "You're subscribed! Thanks.",
    newsletterError: 'Something went wrong — please try again.',
    newsletterDuplicate: 'That email is already subscribed.',
    cols: [
      { title: 'Product', links: [{ to: '/explore', label: 'Explore' }, { to: '/plan', label: 'AI Itinerary' }] },
      { title: 'Company', links: [{ to: '#', label: 'About us' }, { to: '#', label: 'Careers' }, { to: '#', label: 'Food blog' }] },
      { title: 'Support', links: [{ to: '#', label: 'Help center' }, { to: '#', label: 'Contact' }, { to: '#', label: 'Terms' }] },
    ],
    bottom: '© 2026 FoodTrip. Made with vị giác in Vietnam.',
  },
}

export default function Footer() {
  const { lang } = useLanguage()
  const c = CONTENT[lang]
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | busy | success | error | duplicate

  async function handleSubscribe(e) {
    e.preventDefault()
    if (!hasSupabase || !email.trim()) return
    setStatus('busy')
    const { error } = await supabase.from('newsletter_subscribers').insert({ email: email.trim() })
    if (error) {
      setStatus(error.code === '23505' ? 'duplicate' : 'error')
      return
    }
    setStatus('success')
    setEmail('')
  }

  return (
    <footer className="no-print border-t border-line pt-12 pb-8">
      <div className="max-w-[1180px] mx-auto px-5 md:px-8">
        <div className="grid gap-10 grid-cols-2 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 font-display font-bold text-[19px] mb-3">
              <LogoMark size={26} />
              <Wordmark />
            </div>
            <p className="text-[14px] text-ink-muted max-w-[32ch] mb-4">{c.blurb}</p>
            <form className="flex gap-2 max-w-[340px]" onSubmit={handleSubscribe}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={c.newsletterPlaceholder}
                aria-label={c.newsletterPlaceholder}
                className="flex-1 min-w-0 px-3.5 py-[11px] rounded-full border-[1.5px] border-line-strong bg-transparent text-[14px] placeholder:text-ink-faint"
              />
              <button
                type="submit"
                disabled={status === 'busy'}
                aria-label="Đăng ký nhận tin"
                className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-chili text-chili-ink disabled:opacity-60"
              >
                {status === 'success' ? <CheckCircle size={16} /> : <EnvelopeSimple size={16} />}
              </button>
            </form>
            {status === 'success' && <p className="text-[12.5px] text-herb font-medium mt-2">{c.newsletterSuccess}</p>}
            {status === 'duplicate' && <p className="text-[12.5px] text-lantern font-medium mt-2">{c.newsletterDuplicate}</p>}
            {status === 'error' && <p className="text-[12.5px] text-chili font-medium mt-2">{c.newsletterError}</p>}
          </div>

          {c.cols.map((col) => (
            <div key={col.title}>
              <h4 className="font-utility text-[12px] uppercase tracking-wider text-ink-faint mb-4">{col.title}</h4>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <NavLink to={l.to} className="text-[14.5px] opacity-85 hover:opacity-100 hover:text-chili transition-colors">
                      {l.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center flex-wrap gap-3 mt-12 pt-5 border-t border-line text-[13px] text-ink-faint">
          <span>{c.bottom}</span>
          <div className="flex gap-3">
            {[FacebookLogo, InstagramLogo, TiktokLogo].map((Icon, i) => (
              <a
                key={i}
                href="#"
                aria-label={Icon.displayName || 'social'}
                className="w-9 h-9 rounded-full border-[1.5px] border-line-strong flex items-center justify-center hover:border-chili hover:text-chili transition-colors"
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
