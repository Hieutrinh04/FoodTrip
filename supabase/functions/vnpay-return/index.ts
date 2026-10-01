import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleOptions } from '../_shared/cors.ts'
import { signParams } from '../_shared/vnpay.ts'

/**
 * VNPay redirects the customer's browser here after the sandbox payment page.
 * The request carries no Supabase auth — it comes straight from VNPay's
 * redirect — so trust comes from VNPay's HMAC-SHA512 signature on the callback,
 * and the booking is updated with the service role.
 *
 * Two checks before a booking is marked paid:
 * - the signature, computed the same way the payment URL was signed (shared
 *   canonicalQuery — the old copy here encoded spaces as %20 and would have
 *   rejected every genuine callback whose fields contained a space);
 * - the amount VNPay actually charged, against the booking's own total. A
 *   valid signature only proves VNPay sent this; it does not prove the right
 *   sum was paid for this booking.
 *
 * Known limitation: a return-URL-only flow is not fully reliable (the browser
 * may never come back if the tab is closed). A production deployment should
 * also register VNPay's IPN server-to-server webhook.
 */
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

  const signed: Record<string, string> = {}
  for (const [key, value] of params) {
    if (key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType' && key.startsWith('vnp_')) signed[key] = value
  }
  const { hash } = await signParams(signed, hashSecret)
  if (hash.toLowerCase() !== receivedHash.toLowerCase()) return redirectTo('invalid-signature')

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, total_price, payment_status')
      .eq('id', bookingId)
      .maybeSingle()
    if (!booking) return redirectTo('error')

    const charged = Number(params.get('vnp_Amount'))
    const expected = Math.round(Number(booking.total_price)) * 100
    const paymentStatus = params.get('vnp_ResponseCode') === '00' && charged === expected ? 'paid' : 'failed'
    if (charged !== expected) console.error(`vnpay-return: amount mismatch for ${bookingId}: ${charged} vs ${expected}`)

    await supabase
      .from('bookings')
      .update({ payment_status: paymentStatus, payment_txn_ref: params.get('vnp_TransactionNo') })
      .eq('id', bookingId)
    return redirectTo(paymentStatus)
  } catch (err) {
    console.error('vnpay-return: failed to update booking:', (err as Error).message)
    return redirectTo('error')
  }
})
