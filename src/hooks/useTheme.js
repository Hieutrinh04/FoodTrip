import { useEffect, useState } from 'react'

const STORAGE_KEY = 'foodtrip-theme'

function getInitial() {
  if (typeof window === 'undefined') return 'system'
  return window.localStorage.getItem(STORAGE_KEY) || 'system'
}

function getSystemPref() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitial)
  const [systemPref, setSystemPref] = useState(getSystemPref)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setSystemPref(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      document.documentElement.setAttribute('data-theme', theme)
      window.localStorage.setItem(STORAGE_KEY, theme)
    }
  }, [theme])

  const effectiveTheme = theme === 'system' ? systemPref : theme

  const toggleTheme = () => {
    setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')
  }

  return { theme, effectiveTheme, toggleTheme }
}
