import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(hasSupabase)

  useEffect(() => {
    if (!hasSupabase) return

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
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
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
