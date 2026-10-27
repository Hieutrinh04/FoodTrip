/* oxlint-disable react/only-export-components -- context and hook */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from './AuthContext.jsx'
import { accountRoles, canAccess } from '../lib/accessPolicy.js'

const AccessContext = createContext(null)

export function AccessProvider({ children }) {
  const { user } = useAuth()
  return <AccountAccess userId={user?.id ?? null}>{children}</AccountAccess>
}

function AccountAccess({ userId, children }) {
  const [state, setState] = useState({ userId, status: userId ? 'loading' : 'ready', admin: false, properties: [], operators: [] })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!userId) {
      setState({ userId: null, status: 'ready', admin: false, properties: [], operators: [] })
      return undefined
    }
    let active = true
    setState({ userId, status: 'loading', admin: false, properties: [], operators: [] })
    Promise.all([
      supabase.rpc('is_admin'),
      supabase.from('property_managers').select('role, property:properties(id,name,active)').eq('user_id', userId),
      supabase.from('tour_members').select('role, operator:tour_operators(id,name,status)').eq('user_id', userId),
    ]).then(([admin, properties, operators]) => {
      if (admin.error || properties.error || operators.error) throw new Error('access-unavailable')
      if (active) setState({
        userId, status: 'ready', admin: admin.data === true,
        properties: (properties.data ?? []).filter((m) => m.property).map((m) => ({ ...m.property, role: m.role })),
        operators: (operators.data ?? []).filter((m) => m.operator).map((m) => ({ ...m.operator, role: m.role })),
      })
    }).catch(() => { if (active) setState({ userId, status: 'error', admin: false, properties: [], operators: [] }) })
    return () => { active = false }
  }, [userId, version])
  useEffect(() => {
    if (!userId) return undefined
    const refresh = () => setVersion((v) => v + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [userId])
  // Discard grants synchronously on an account change without remounting
  // public pages: signing in must not erase an itinerary being composed.
  const access = userId && state.userId === userId ? state
    : { userId, status: userId ? 'loading' : 'ready', admin: false, properties: [], operators: [] }
  return <AccessContext.Provider value={{ ...access, roles: accountRoles(access), can: (capability, scope) => canAccess(access, capability, scope), refresh: () => setVersion((v) => v + 1) }}>{children}</AccessContext.Provider>
}

export function useAccess() {
  const context = useContext(AccessContext)
  if (!context) throw new Error('useAccess requires AccessProvider')
  return context
}
