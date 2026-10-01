import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Nav from './Nav.jsx'
import Footer from './Footer.jsx'
import { pageVariants } from '../../motion/variants.js'
import { useAuth } from '../../auth/AuthContext.jsx'

export default function Layout() {
  const location = useLocation()
  const { authError } = useAuth()
  const isExplore = location.pathname === '/explore'
  const mainRef = useRef(null)

  useEffect(() => {
    mainRef.current?.focus()
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  }, [location.pathname])

  return (
    <div className="min-h-dvh flex flex-col relative z-10">
      <Nav />
      {authError && <div role="alert" className="border-b border-line bg-paper-2 px-5 py-3 text-center text-sm">Chưa kiểm tra được phiên đăng nhập. / Could not check your session. <button className="underline" onClick={() => window.location.reload()}>Tải lại / Retry</button></div>}
      <motion.main
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
    </div>
  )
}
