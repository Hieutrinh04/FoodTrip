import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { sepayConfig } from '../_shared/sepay.ts'
import { vnpayKeys } from '../_shared/vnpay.ts'

// Read-only diagnostics. Never returns keys, account numbers, email addresses
// or cron commands. Auth identity and the administrator role are both checked.
Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error:'method' }, { status:405 })
  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !service || !anon) return jsonResponse({ error:'server-misconfigured' }, { status:503 })
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') ?? ''
  const admin = createClient(url,service,{auth:{persistSession:false}})
  const {data:userData,error:authError} = await admin.auth.getUser(token)
  if (authError || !userData.user) return jsonResponse({error:'auth-required'},{status:401})
  const caller = createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}})
  const access = await caller.rpc('is_admin')
  if (access.error || access.data !== true) return jsonResponse({error:'not-admin'},{status:403})
  const {data,error} = await caller.rpc('admin_runtime_status')
  if (error) return jsonResponse({error:'diagnostics-unavailable'},{status:503})
  let publicSite = false
  try {
    const site = new URL(Deno.env.get('SITE_URL') ?? '')
    publicSite = site.protocol === 'https:' && !['localhost','127.0.0.1','[::1]'].includes(site.hostname)
  } catch { /* unset or malformed */ }
  const present = (name:string) => Boolean(Deno.env.get(name)?.trim())
  return jsonResponse({ ...data, checked_at:new Date().toISOString(), configuration:{
    sepay_real:Boolean(sepayConfig(Deno.env)), vnpay_sandbox:Boolean(vnpayKeys()),
    notification_email:present('RESEND_API_KEY') && present('EMAIL_FROM') && publicSite,
    email_key:present('RESEND_API_KEY'), email_sender:present('EMAIL_FROM'), public_site:publicSite,
    cron_secret:present('CRON_SECRET'),
  } })
})
