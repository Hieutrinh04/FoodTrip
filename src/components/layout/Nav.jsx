import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  List, X, SunDim, MoonStars, Translate, UserCircle, SignOut, CaretDown, MapTrifold, Bed, Sparkle,
} from '@phosphor-icons/react'
import LogoMark from '../ui/LogoMark.jsx'
import Wordmark from '../ui/Wordmark.jsx'
import AuthModal from '../auth/AuthModal.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { useTheme } from '../../hooks/useTheme.js'
import { easeOut } from '../../motion/variants.js'

const LABELS = {
  vi: {
    login: 'Đăng nhập', logout: 'Đăng xuất', account: 'Tài khoản', signedInAs: 'Đang đăng nhập',
    openMenu: 'Mở menu', closeMenu: 'Đóng menu', lang: 'Đổi ngôn ngữ', theme: 'Đổi giao diện sáng / tối',
    mainNav: 'Điều hướng chính', mobileNav: 'Điều hướng di động',
  },
  en: {
    login: 'Log in', logout: 'Log out', account: 'Account', signedInAs: 'Signed in as',
    openMenu: 'Open menu', closeMenu: 'Close menu', lang: 'Switch language', theme: 'Toggle light / dark',
    mainNav: 'Main navigation', mobileNav: 'Mobile navigation',
  },
}

// "Lịch trình AI" is not here on purpose: it pointed at /plan, the same page
// as the "Tạo lịch trình" button beside it, so the bar carried the one link
// twice and ran out of room for the rest.
const NAV_LINKS = [
  { to: '/', label: { vi: 'Trang chủ', en: 'Home' } },
  { to: '/explore', label: { vi: 'Khám phá', en: 'Explore' } },
  { to: '/nearby', label: { vi: 'Ăn gì gần đây?', en: 'Eat nearby' } },
  { to: '/share', label: { vi: 'Chia sẻ quán', en: 'Share a place' } },
  { to: '/community', label: { vi: 'Cộng đồng', en: 'Community' } },
  { to: '/saved', label: { vi: 'Đã lưu', en: 'Saved' } },
]

// Pages that only mean something once signed in live in the account menu
// rather than the main bar.
const ACCOUNT_LINKS = [
  { to: '/trips', icon: MapTrifold, label: { vi: 'Lịch trình của tôi', en: 'My trips' } },
  { to: '/bookings', icon: Bed, label: { vi: 'Đặt phòng của tôi', en: 'My bookings' } },
]

const CTA = { vi: 'Tạo lịch trình', en: 'Plan a trip' }

const ICON_BUTTON = 'flex h-10 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-line-strong font-utility text-sm font-bold transition-colors hover:border-chili hover:text-chili'

/**
 * The account control. It used to be a pill showing the email that signed the
 * user out the moment it was clicked — the most natural thing to click on to
 * see one's account was the one thing that ended the session. Now it opens a
 * menu, and signing out is a deliberate item inside it.
 */
function AccountMenu({ user, onSignOut, lang }) {
  const l = LABELS[lang]
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()

  // Close on navigation, on a click anywhere else, and on Escape.
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (user.email?.[0] ?? '?').toUpperCase()

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={l.account}
        title={user.email}
        className={`${ICON_BUTTON} pl-1 pr-2.5`}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-chili text-2xs text-chili-ink">{initial}</span>
        <CaretDown size={12} weight="bold" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: easeOut }}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-lifted"
        >
          <div className="border-b border-line px-4 py-3">
            <div className="font-utility text-micro uppercase tracking-wide text-ink-faint">{l.signedInAs}</div>
            <div className="mt-0.5 truncate text-sm font-semibold">{user.email}</div>
          </div>
          <div className="py-1.5">
            {ACCOUNT_LINKS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                role="menuitem"
                className={({ isActive }) => `flex items-center gap-2.5 px-4 py-2.5 font-utility text-sm font-semibold transition-colors hover:bg-paper-2 ${isActive ? 'text-chili' : ''}`}
              >
                <Icon size={16} />
                {label[lang]}
              </NavLink>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onSignOut() }}
            className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 font-utility text-sm font-semibold text-ink-muted transition-colors hover:bg-paper-2 hover:text-chili"
          >
            <SignOut size={16} />
            {l.logout}
          </button>
        </motion.div>
      )}
    </div>
  )
}

export default function Nav() {
  const [open, setOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const { lang, toggleLang } = useLanguage()
  const { effectiveTheme, toggleTheme } = useTheme()
  const { user, hasAuth, signOut } = useAuth()
  const location = useLocation()
  const l = LABELS[lang]
  const navigate = useNavigate()
  const onPlanner = location.pathname === '/plan'

  // From anywhere else this is an ordinary link. On the planner itself a link
  // to the same URL does nothing, which read as a broken button; instead it
  // hands the planner a fresh token, and the planner starts a new itinerary.
  function planTrip(event) {
    if (!onPlanner) return
    event.preventDefault()
    // The path does not change, so the mobile sheet would otherwise stay open.
    setOpen(false)
    navigate('/plan', { state: { startOver: Date.now() } })
  }

  // The mobile sheet closes itself on navigation instead of relying on every
  // link to remember an onClick.
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <header className="no-print sticky top-0 z-50 border-b border-line bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center gap-6 px-5 md:px-8">
        <NavLink to="/" className="flex shrink-0 items-center gap-2 font-display text-xl font-bold">
          <LogoMark />
          <Wordmark />
        </NavLink>

        {/* Shown only where the links and the controls fit on one line;
            below that the hamburger takes over rather than letting the bar
            squeeze links into the logo and the buttons. */}
        <nav className="hidden flex-1 items-center justify-center gap-4 whitespace-nowrap font-utility text-sm font-semibold xl:flex" aria-label={l.mainNav}>
          {NAV_LINKS.map((link) => {
            const active = location.pathname === link.to || (link.to === '/community' && location.pathname.startsWith('/community/'))
            return (
              <NavLink key={link.to} to={link.to} className={`relative py-2 transition-colors hover:text-chili ${active ? 'text-ink' : 'text-ink-muted'}`}>
                {link.label[lang]}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full bg-chili"
                    transition={{ duration: 0.35, ease: easeOut }}
                  />
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
          <button onClick={toggleLang} aria-label={l.lang} className={`${ICON_BUTTON} hidden px-3 sm:flex`}>
            <Translate size={15} />
            {lang.toUpperCase()}
          </button>
          <button onClick={toggleTheme} aria-label={l.theme} className={`${ICON_BUTTON} hidden w-10 sm:flex`}>
            {effectiveTheme === 'dark' ? <MoonStars size={17} /> : <SunDim size={17} />}
          </button>
          {hasAuth && (
            user ? (
              <AccountMenu user={user} onSignOut={signOut} lang={lang} />
            ) : (
              <button onClick={() => setAuthOpen(true)} className={`${ICON_BUTTON} hidden px-3.5 sm:flex`}>
                <UserCircle size={16} />
                {l.login}
              </button>
            )
          )}
          <NavLink
            to="/plan"
            onClick={planTrip}
            className="hidden h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-chili px-5 font-utility text-sm font-semibold text-chili-ink shadow-soft transition-shadow hover:shadow-lifted lg:inline-flex"
          >
            <Sparkle size={14} weight="fill" />
            {CTA[lang]}
          </NavLink>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? l.closeMenu : l.openMenu}
            aria-expanded={open}
            className="inline-flex p-2 xl:hidden"
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
          className="overflow-hidden border-t border-line xl:hidden"
          aria-label={l.mobileNav}
        >
          <div className="mx-auto flex max-w-[1400px] flex-col px-5 py-3 font-utility font-semibold md:px-8">
            {[...NAV_LINKS, ...(user ? ACCOUNT_LINKS : [])].map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `border-b border-dashed border-line py-3 ${isActive ? 'text-chili' : ''}`}
              >
                {link.label[lang]}
              </NavLink>
            ))}
            {user && (
              <div className="flex items-center gap-2 border-b border-dashed border-line py-3 text-sm text-ink-muted">
                <UserCircle size={16} className="shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 py-3">
              <button onClick={toggleLang} aria-label={l.lang} className={`${ICON_BUTTON} px-3`}>
                <Translate size={15} />
                {lang.toUpperCase()}
              </button>
              <button onClick={toggleTheme} aria-label={l.theme} className={`${ICON_BUTTON} w-10`}>
                {effectiveTheme === 'dark' ? <MoonStars size={17} /> : <SunDim size={17} />}
              </button>
              {hasAuth && (
                user ? (
                  <button onClick={() => { signOut(); setOpen(false) }} className={`${ICON_BUTTON} ml-auto px-3.5`}>
                    <SignOut size={14} /> {l.logout}
                  </button>
                ) : (
                  <button onClick={() => { setAuthOpen(true); setOpen(false) }} className={`${ICON_BUTTON} ml-auto px-3.5`}>
                    <UserCircle size={16} /> {l.login}
                  </button>
                )
              )}
            </div>
            <NavLink
              to="/plan"
              onClick={planTrip}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-chili px-6 py-[13px] text-md font-semibold text-chili-ink lg:hidden"
            >
              <Sparkle size={15} weight="fill" />
              {CTA[lang]}
            </NavLink>
          </div>
        </motion.nav>
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </header>
  )
}
