import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { VNPAY_SANDBOX_URL, signParams, vnpayKeys } from '../_shared/vnpay.ts'
import { sepayConfig } from '../_shared/sepay.ts'

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

// VNPay expects Vietnam time in yyyyMMddHHmmss; the function runs in UTC.
function vnpDate(d: Date) {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000)
  return `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1)}${pad(vn.getUTCDate())}${pad(vn.getUTCHours())}${pad(vn.getUTCMinutes())}${pad(vn.getUTCSeconds())}`
}

/**
 * Starts payment for a booking.
 *
 *   { check: true }                 → { status: 'ready' | 'no-key' } — lets the
 *                                     booking page show the real button or the
 *                                     demo one, instead of both.
 *   { bookingId }                   → { status: 'ok', paymentUrl } for VNPay's
 *                                     sandbox, or { status: 'no-key' }.
 *   { bookingId, demo: true }       → marks the booking paid with reference
 *                                     "DEMO", only while VNPay is not configured.
 *
 * Everything that decides money happens here, not in the browser:
 * - The amount is read from the booking row. It used to be taken from the
 *   request body, so editing one request paid 1.000đ for a 5.000.000đ room.
 * - The caller must own the booking and it must still be pending.
 * - The demo confirmation is written by this function with the service role.
 *   The client used to update payment_status itself, which the row policy
 *   allowed for any value — including "paid". A trigger now rejects that.
 *
 * Deployed with --no-verify-jwt so the CORS preflight (which carries no token)
 * is answered; the caller's identity is checked below instead.
 */
Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid-body' }, { status: 400 })
  }

  const keys = vnpayKeys()
  if (body.check) return jsonResponse({ status: keys ? 'ready' : 'no-key' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'server-misconfigured' }, { status: 500 })
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Who is asking. A booking belongs to one user; nobody else may pay for it
  // or mark it paid.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: userData } = await admin.auth.getUser(token)
  const user = userData?.user
  if (!user) return jsonResponse({ error: 'auth-required' }, { status: 401 })

  const bookingId = String(body.bookingId ?? '')
  if (!bookingId) return jsonResponse({ error: 'missing-booking' }, { status: 400 })

  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, user_id, total_price, payment_status, hotel_name, room_name')
    .eq('id', bookingId)
    .maybeSingle()
  if (error || !booking) return jsonResponse({ error: 'booking-not-found' }, { status: 404 })
  if (booking.user_id !== user.id) return jsonResponse({ error: 'not-your-booking' }, { status: 403 })
  if (booking.payment_status !== 'pending') return jsonResponse({ error: 'not-pending', status: booking.payment_status }, { status: 409 })

  if (body.demo) {
    // A demo confirmation is only offered while there is no real gateway —
    // otherwise it would be a way to skip paying.
    if (keys || sepayConfig(Deno.env)) return jsonResponse({ error: 'demo-disabled' }, { status: 403 })
    const { error: updateError } = await admin
      .from('bookings')
      .update({ payment_status: 'paid', payment_txn_ref: 'DEMO' })
      .eq('id', booking.id)
    if (updateError) return jsonResponse({ error: 'demo-failed' }, { status: 500 })
    return jsonResponse({ status: 'demo-confirmed' })
  }

  if (!keys) return jsonResponse({ status: 'no-key' })

  const ipAddr = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: keys.tmnCode,
    vnp_Amount: String(Math.round(Number(booking.total_price)) * 100), // VNPay: amount × 100, no decimals
    vnp_CurrCode: 'VND',
    vnp_TxnRef: booking.id,
    // Plain ASCII: VNPay rejects accented characters in the order description.
    vnp_OrderInfo: `Thanh toan dat phong ${booking.id}`.slice(0, 254),
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    // Back through the server-side verifier, never straight to the React app.
    vnp_ReturnUrl: `${supabaseUrl}/functions/v1/vnpay-return`,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: vnpDate(new Date()),
  }
  const { query, hash } = await signParams(params, keys.hashSecret)
  return jsonResponse({ status: 'ok', paymentUrl: `${VNPAY_SANDBOX_URL}?${query}&vnp_SecureHash=${hash}` })
})
