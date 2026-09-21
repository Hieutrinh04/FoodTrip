import { supabase, hasSupabase } from './supabaseClient.js'

/**
 * Asks the vnpay-create-payment Edge Function for a signed VNPay sandbox
 * payment URL, then redirects the browser there. Returns 'no-key' if the
 * project hasn't set VNPAY_TMN_CODE/VNPAY_HASH_SECRET yet — the caller
 * should fall back to a clearly-labeled demo confirmation instead of
 * silently pretending a real payment happened.
 */
export async function startVnpayPayment({ bookingId, amount, orderInfo }) {
  if (!hasSupabase) return 'no-key'
  const { data, error } = await supabase.functions.invoke('vnpay-create-payment', {
    body: { bookingId, amount, orderInfo },
  })
  if (error) throw new Error('payment-failed')
  if (data.status === 'no-key') return 'no-key'
  if (data.status !== 'ok' || !data.paymentUrl) throw new Error('payment-failed')
  window.location.href = data.paymentUrl
  return 'redirecting'
}
