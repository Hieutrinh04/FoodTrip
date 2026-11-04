import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Nav from './Nav.jsx'
import Footer from './Footer.jsx'
import { pageVariants } from '../../motion/variants.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import GuestLoginBar, { useGuestBarVisible } from '../auth/GuestLoginBar.jsx'
import AssistantLauncher from '../assistant/AssistantLauncher.jsx'
import WorkspaceBar from '../portal/WorkspaceBar.jsx'
import '../portal/Portal.css'

export default function Layout() {
  const location = useLocation()
  const { authError } = useAuth()
  const guestBar = useGuestBarVisible()
  const isExplore = location.pathname === '/explore'
  const mainRef = useRef(null)

  useEffect(() => {
    mainRef.current?.focus()
    const behavior = 'instant' in window ? 'instant' : 'auto'
    const id = location.hash.slice(1)
    if (!id) {
      window.scrollTo({ top: 0, behavior })
      return undefined
    }
    // "/#thanh-pho": land on that section. Pages load lazily, so the target may
    // appear a few frames after the route changes; give it up to two seconds.
    let frame = 0
    const started = performance.now()
    const seek = () => {
      const target = document.getElementById(decodeURIComponent(id))
      if (target) target.scrollIntoView({ behavior })
      else if (performance.now() - started < 2000) frame = requestAnimationFrame(seek)
      else window.scrollTo({ top: 0, behavior })
    }
    seek()
    return () => cancelAnimationFrame(frame)
  }, [location.pathname, location.hash])

  return (
    <div className={`min-h-dvh flex flex-col relative z-10 ${guestBar ? 'pb-36 md:pb-24' : ''}`}>
      <a href="#main-content" className="sr-only z-[60] rounded-xl bg-surface px-5 py-3 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-3">Đến nội dung / Skip to content</a>
      <Nav />
      <WorkspaceBar />
      {authError && <div role="alert" className="border-b border-line bg-paper-2 px-5 py-3 text-center text-sm">Chưa kiểm tra được phiên đăng nhập. / Could not check your session. <button className="underline" onClick={() => window.location.reload()}>Tải lại / Retry</button></div>}
      <motion.main
        id="main-content"
        key={location.pathname}
        ref={mainRef}
        tabIndex={-1}
        initial="initial"
        animate="animate"
        variants={pageVariants}
        className="flex-1 outline-none"
      >
        <Outlet />
      </motion.main>
      {!isExplore && <Footer />}
      <GuestLoginBar />
      <AssistantLauncher />
    </div>
  )
}
