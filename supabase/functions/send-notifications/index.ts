// Emails the notifications the database has queued (see the notifications
// migration). Called every minute by pg_cron through pg_net, with the shared
// secret in x-cron-secret.
//
// Secrets:
//   CRON_SECRET      the shared secret (also in private.settings)
//   RESEND_API_KEY   optional — without it notifications stay in-app only and
//                    are marked 'skipped' (never sent later in a burst)
//   EMAIL_FROM       optional sender, e.g. "FoodTrip <thongbao@yourdomain.vn>"
//                    (Resend's test sender only reaches the account owner)
//   SITE_URL         optional, e.g. https://foodtrip.vn — makes links absolute
import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import { safeEqual } from '../_shared/sepay.ts'

const MAX_ATTEMPTS = 3

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function emailHtml(title: string, body: string, link: string | null) {
  return `<!doctype html><html><body style="margin:0;background:#f4ede1;font-family:Arial,sans-serif;color:#2a2018">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px">
    <div style="font-size:20px;font-weight:bold;color:#d8481f;margin-bottom:18px">FoodTrip</div>
    <div style="background:#fffdf8;border-radius:14px;padding:22px">
      <h1 style="font-size:18px;margin:0 0 10px">${escapeHtml(title)}</h1>
      <p style="font-size:15px;line-height:1.55;margin:0 0 18px;color:#5b4d40">${escapeHtml(body)}</p>
      ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:#d8481f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold">Xem trên FoodTrip</a>` : ''}
    </div>
    <p style="font-size:12px;color:#8a7b6c;margin-top:16px">Bạn nhận email này vì có tài khoản FoodTrip. Thông báo cũng hiển thị trong mục chuông trên website.</p>
  </div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 })
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  if (!secret || !safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) return jsonResponse({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: batch, error } = await admin.rpc('claim_notification_emails', { p_limit: 50 })
  if (error) return jsonResponse({ error: 'claim-failed', message: error.message }, { status: 500 })
  if (!batch?.length) return jsonResponse({ status: 'idle' })

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    await admin.from('notifications').update({ email_status: 'skipped' }).in('id', batch.map((n: { id: string }) => n.id))
    return jsonResponse({ status: 'skipped', count: batch.length })
  }

  const from = Deno.env.get('EMAIL_FROM') ?? 'FoodTrip <onboarding@resend.dev>'
  const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')
  const emails = new Map<string, string | null>()
  let sent = 0, failed = 0

  for (const n of batch as { id: string; user_id: string; title: string; body: string; link: string | null; email_attempts: number }[]) {
    if (!emails.has(n.user_id)) {
      const { data } = await admin.auth.admin.getUserById(n.user_id)
      emails.set(n.user_id, data?.user?.email ?? null)
    }
    const to = emails.get(n.user_id)
    if (!to) { await admin.from('notifications').update({ email_status: 'skipped', email_error: 'no-email' }).eq('id', n.id); continue }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject: n.title, html: emailHtml(n.title, n.body, site && n.link ? `${site}${n.link}` : null), text: `${n.title}\n\n${n.body}${site && n.link ? `\n\n${site}${n.link}` : ''}` }),
      })
      if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
      await admin.from('notifications').update({ email_status: 'sent', email_error: null }).eq('id', n.id)
      sent++
    } catch (err) {
      const final = n.email_attempts >= MAX_ATTEMPTS
      await admin.from('notifications').update({ email_status: final ? 'failed' : 'pending', email_error: String(err).slice(0, 300), email_claimed_at: null }).eq('id', n.id)
      failed++
    }
  }
  return jsonResponse({ status: 'ok', sent, failed })
})
