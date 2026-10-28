import { createClient } from '@supabase/supabase-js'

// No Vite env under Node (tests import modules that import this one): no backend there.
const env = import.meta.env ?? {}
const url = env.VITE_SUPABASE_URL || ''
const anonKey = env.VITE_SUPABASE_ANON_KEY || ''

export const hasSupabase = Boolean(url && anonKey)

export const supabase = hasSupabase ? createClient(url, anonKey) : null
