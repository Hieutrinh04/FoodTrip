/* oxlint-disable react/only-export-components -- provider and language hooks intentionally share one private context */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const LanguageContext = createContext(null)

const STORAGE_KEY = 'foodtrip-lang'

function getInitialLang() {
  if (typeof window === 'undefined') return 'vi'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'vi' || stored === 'en') return stored
  return 'vi'
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang: () => setLang((prev) => (prev === 'vi' ? 'en' : 'vi')),
    }),
    [lang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

export function usePick(content) {
  const { lang } = useLanguage()
  return content[lang] ?? content.vi
}
