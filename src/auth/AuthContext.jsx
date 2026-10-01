/* oxlint-disable react/only-export-components -- provider and its hook intentionally share one private context */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(hasSupabase)
  const [recovery, setRecovery] = useState(false)
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    if (!hasSupabase) return

    let active = true
    let eventReceived = false
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      eventReceived = true
      setUser(session?.user ?? null)
      setLoading(false)
      setAuthError(false)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || eventReceived) return
      setUser(data.session?.user ?? null)
      setAuthError(Boolean(error))
      setLoading(false)
    }).catch(() => { if (active && !eventReceived) { setAuthError(true); setLoading(false) } })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      recovery,
      authError,
      hasAuth: hasSupabase,
      async signUp(email, password) {
        if (!hasSupabase) return { error: 'no-supabase' }
        const { data, error } = await supabase.auth.signUp({ email, password })
        return { error: error?.message ?? null, signedIn: Boolean(data.session) }
      },
      async signIn(email, password) {
        if (!hasSupabase) return { error: 'no-supabase' }
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error: error?.message ?? null }
      },
      async signOut() {
        if (!hasSupabase) return
        await supabase.auth.signOut()
      },
      async requestPasswordReset(email) {
        if (!hasSupabase) return { error: 'no-supabase' }
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        return { error: error?.message ?? null }
      },
      async resetPassword(password) {
        if (!hasSupabase || !recovery) return { error: 'recovery-required' }
        const { error } = await supabase.auth.updateUser({ password })
        if (!error) setRecovery(false)
        return { error: error?.message ?? null }
      },
    }),
    [user, loading, recovery, authError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
