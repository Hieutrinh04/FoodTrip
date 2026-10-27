/* oxlint-disable react/only-export-components -- context and hook */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'

const LoginPromptContext = createContext(null)

export function LoginPromptProvider({ children }) {
  const { user } = useAuth()
  const [prompt, setPrompt] = useState(null)
  const openLogin = useCallback((reason = '', mode = 'signIn') => setPrompt({ reason, mode }), [])
  useEffect(() => { if (user) setPrompt(null) }, [user])
  return <LoginPromptContext.Provider value={openLogin}>
    {children}
    {!user && prompt && <AuthModal key={prompt.mode} initialMode={prompt.mode} reason={prompt.reason} onClose={() => setPrompt(null)} />}
  </LoginPromptContext.Provider>
}

export function useLoginPrompt() {
  const openLogin = useContext(LoginPromptContext)
  if (!openLogin) throw new Error('useLoginPrompt requires LoginPromptProvider')
  return openLogin
}
