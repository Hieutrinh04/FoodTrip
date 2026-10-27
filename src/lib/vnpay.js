import { supabase, hasSupabase } from './supabaseClient.js'

/**
 * Whether the real VNPay sandbox gateway is configured on the server, so the
 * booking page can offer that gateway only when configuration is verified.
 * Resolves 'ready' | 'no-key' | 'unknown'; missing keys never imply free payment.
 */
export async function getPaymentMode() {
  if (!hasSupabase) return 'no-key'
  try {
    const { data, error } = await supabase.functions.invoke('vnpay-create-payment', { body: { check: true } })
    if (error) return 'unknown'
    return data?.status === 'ready' ? 'ready' : 'no-key'
  } catch {
    return 'unknown'
  }
}

/**
 * Asks the server for a signed VNPay sandbox payment URL for this booking and
 * redirects the browser there. The server reads the amount from the booking
 * itself — nothing about the price is sent from here.
 *
 * Returns 'no-key' if VNPay is not configured.
 */
export async function startVnpayPayment({ bookingId }) {
  if (!hasSupabase) return 'no-key'
  const { data, error } = await supabase.functions.invoke('vnpay-create-payment', { body: { bookingId } })
  if (error) throw new Error('payment-failed')
  if (data.status === 'no-key') return 'no-key'
  if (data.status !== 'ok' || !data.paymentUrl) throw new Error('payment-failed')
  window.location.href = data.paymentUrl
  return 'redirecting'
}
