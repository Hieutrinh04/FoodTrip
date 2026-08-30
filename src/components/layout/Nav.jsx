import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { List, X, SunDim, MoonStars, Translate, UserCircle, SignOut } from '@phosphor-icons/react'
import LogoMark from '../ui/LogoMark.jsx'
import Wordmark from '../ui/Wordmark.jsx'
import AuthModal from '../auth/AuthModal.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { useTheme } from '../../hooks/useTheme.js'
import { easeOut } from '../../motion/variants.js'

const AUTH_LABELS = {
  vi: { login: 'Đăng nhập', logout: 'Đăng xuất' },
  en: { login: 'Log in', logout: 'Log out' },
}

const NAV_LINKS = [
  { to: '/', label: { vi: 'Trang chủ', en: 'Home' } },
  { to: '/explore', label: { vi: 'Khám phá', en: 'Explore' } },
  { to: '/nearby', label: { vi: 'Ăn gì gần đây?', en: 'Eat nearby' } },
  { to: '/plan', label: { vi: 'Lịch trình AI', en: 'AI Itinerary' } },
  { to: '/share', label: { vi: 'Chia sẻ quán', en: 'Share a place' } },
]

const MY_TRIPS_LINK = { to: '/trips', label: { vi: 'Lịch trình của tôi', en: 'My trips' } }
const MY_BOOKINGS_LINK = { to: '/bookings', label: { vi: 'Đặt phòng của tôi', en: 'My bookings' } }

const CTA = { vi: 'Tạo lịch trình', en: 'Plan a trip' }

export default function Nav() {
  const [open, setOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const { lang, toggleLang } = useLanguage()
  const { effectiveTheme, toggleTheme } = useTheme()
  const { user, hasAuth, signOut } = useAuth()
  const location = useLocation()
  const al = AUTH_LABELS[lang]
  const navLinks = user ? [...NAV_LINKS, MY_TRIPS_LINK, MY_BOOKINGS_LINK] : NAV_LINKS

  return (
    <header className="no-print sticky top-0 z-50 border-b border-line bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-5 md:px-8">
        <NavLink to="/" className="flex items-center gap-2 font-display font-bold text-[21px]" onClick={() => setOpen(false)}>
          <LogoMark />
          <Wordmark />
        </NavLink>

        <nav className="hidden items-center gap-5 whitespace-nowrap font-utility text-[13px] font-semibold lg:flex xl:gap-7" aria-label="Điều hướng chính">
          {navLinks.map((link) => {
            const active = location.pathname === link.to
            return (
              <NavLink key={link.to} to={link.to} className="relative py-2 opacity-90 hover:opacity-100 transition-opacity">
                {link.label[lang]}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-chili rounded-full"
                    transition={{ duration: 0.35, ease: easeOut }}
                  />
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            aria-label="Đổi ngôn ngữ / Switch language"
            className="hidden sm:flex items-center gap-1.5 font-utility text-[12.5px] font-bold px-3 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
          >
            <Translate size={15} />
            {lang.toUpperCase()}
          </button>
          <button
            onClick={toggleTheme}
            aria-label="Đổi giao diện sáng / tối"
            className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
          >
            {effectiveTheme === 'dark' ? <MoonStars size={17} /> : <SunDim size={17} />}
          </button>
          {hasAuth && (
            user ? (
              <button
                onClick={signOut}
                title={user.email}
                aria-label={al.logout}
                className="hidden max-w-[120px] items-center gap-1.5 rounded-full border-[1.5px] border-line-strong px-3 py-2 font-utility text-[12px] font-bold transition-colors hover:border-chili sm:flex"
              >
                <UserCircle size={16} className="shrink-0" />
                <span className="truncate">{user.email}</span>
                <SignOut size={14} className="shrink-0" />
              </button>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                aria-label={al.login}
                className="hidden sm:flex items-center gap-1.5 font-utility text-[12.5px] font-bold px-3 py-2 rounded-full border-[1.5px] border-line-strong hover:border-chili transition-colors"
              >
                <UserCircle size={16} />
                {al.login}
              </button>
            )
          )}
          <NavLink
            to="/plan"
            className="hidden items-center gap-2 whitespace-nowrap rounded-full bg-chili px-5 py-3 font-utility text-[13px] font-semibold text-chili-ink shadow-soft transition-shadow hover:shadow-lifted lg:inline-flex"
          >
            {CTA[lang]}
          </NavLink>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={open}
            className="inline-flex p-2 lg:hidden"
          >
            {open ? <X size={24} /> : <List size={24} />}
          </button>
        </div>
      </div>

      {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={{ duration: 0.3, ease: easeOut }}
            className="overflow-hidden border-t border-line lg:hidden"
            aria-label="Điều hướng di động"
          >
            <div className="max-w-[1180px] mx-auto px-5 py-3 flex flex-col font-utility font-semibold">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="py-3 border-b border-dashed border-line"
                >
                  {link.label[lang]}
                </NavLink>
              ))}
              <div className="flex items-center gap-3 py-3">
                <button
                  onClick={toggleLang}
                  className="flex items-center gap-1.5 text-[12.5px] font-bold px-3 py-2 rounded-full border-[1.5px] border-line-strong"
                >
                  <Translate size={15} />
                  {lang.toUpperCase()}
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center w-10 h-10 rounded-full border-[1.5px] border-line-strong"
                  aria-label="Đổi giao diện sáng / tối"
                >
                  {effectiveTheme === 'dark' ? <MoonStars size={17} /> : <SunDim size={17} />}
                </button>
                {hasAuth && (
                  user ? (
                    <button
                      onClick={() => { signOut(); setOpen(false) }}
                      className="flex items-center gap-1.5 text-[12.5px] font-bold px-3 py-2 rounded-full border-[1.5px] border-line-strong"
                    >
                      <SignOut size={14} /> {al.logout}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setAuthOpen(true); setOpen(false) }}
                      className="flex items-center gap-1.5 text-[12.5px] font-bold px-3 py-2 rounded-full border-[1.5px] border-line-strong"
                    >
                      <UserCircle size={16} /> {al.login}
                    </button>
                  )
                )}
              </div>
              <NavLink
                to="/plan"
                onClick={() => setOpen(false)}
                className="mt-1 inline-flex items-center justify-center gap-2 font-semibold text-[14px] px-6 py-[13px] rounded-full bg-chili text-chili-ink"
              >
                {CTA[lang]}
              </NavLink>
            </div>
          </motion.nav>
        )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </header>
  )
}
