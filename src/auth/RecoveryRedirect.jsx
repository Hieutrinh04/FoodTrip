import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

// Supabase can redirect to the site root when a callback is not allowlisted.
// Trust the SDK recovery event, never a user-controlled URL parameter.
export default function RecoveryRedirect() {
  const { recovery } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => { if (recovery && pathname !== '/reset-password') navigate('/reset-password', { replace: true }) }, [recovery, pathname, navigate])
  return null
}
