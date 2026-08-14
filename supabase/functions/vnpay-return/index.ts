import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleOptions } from '../_shared/cors.ts'

async function hmacSha512Hex(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// VNPay redirects the customer's browser here after the sandbox payment
// page. This request carries no Supabase auth (it comes straight from
// VNPay's servers/browser redirect), so the booking's status is updated
// using the service-role key — trust comes from verifying VNPay's own
// HMAC-SHA512 signature on the callback params, not from RLS.
//
// Note: a return-URL-only flow is not fully reliable in production (the
// browser might never come back if the user closes the tab) — a real
// deployment should also register an IPN (server-to-server) webhook with
// VNPay. Out of scope here; documented as a known limitation.
Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const url = new URL(req.url)
  const params = url.searchParams
  const hashSecret = Deno.env.get('VNPAY_HASH_SECRET')
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
  const bookingId = params.get('vnp_TxnRef')
  const receivedHash = params.get('vnp_SecureHash')

  const redirectTo = (status: string) =>
    Response.redirect(`${appUrl}/booking/return?bookingId=${encodeURIComponent(bookingId ?? '')}&status=${status}`, 302)

  if (!hashSecret || !bookingId || !receivedHash) return redirectTo('error')

  const signParams = new URLSearchParams(params)
  signParams.delete('vnp_SecureHash')
  signParams.delete('vnp_SecureHashType')
  const sortedKeys = [...signParams.keys()].sort()
  const signData = sortedKeys.map((k) => `${k}=${encodeURIComponent(signParams.get(k) ?? '')}`).join('&')
  const expectedHash = await hmacSha512Hex(hashSecret, signData)

  if (expectedHash.toLowerCase() !== receivedHash.toLowerCase()) return redirectTo('invalid-signature')

  const responseCode = params.get('vnp_ResponseCode')
  const paymentStatus = responseCode === '00' ? 'paid' : 'failed'

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await supabase
      .from('bookings')
      .update({ payment_status: paymentStatus, payment_txn_ref: params.get('vnp_TransactionNo') })
      .eq('id', bookingId)
  } catch (err) {
    console.error('vnpay-return: failed to update booking:', (err as Error).message)
    return redirectTo('error')
  }

  return redirectTo(paymentStatus)
})
