import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Nav from './Nav.jsx'
import Footer from './Footer.jsx'
import { pageVariants } from '../../motion/variants.js'

export default function Layout() {
  const location = useLocation()
  const mainRef = useRef(null)

  useEffect(() => {
    mainRef.current?.focus()
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  }, [location.pathname])

  return (
    <div className="min-h-dvh flex flex-col relative z-10">
      <Nav />
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
      <Footer />
    </div>
  )
}
