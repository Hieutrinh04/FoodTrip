import { supabase, hasSupabase } from './supabaseClient.js'

/**
 * Whether the real VNPay sandbox gateway is configured on the server, so the
 * booking page offers either the payment button or the demo one — not both,
 * which is what it used to do regardless of configuration.
 *
 * Resolves 'ready' | 'no-key' | 'unknown'. 'unknown' (the check itself failed)
 * is treated like 'no-key' by the caller: it is safer to offer a labelled demo
 * than a payment button that may not work.
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

/**
 * Confirms a booking in demo mode. Done by the server with the reference
 * "DEMO", and only while VNPay is not configured — the browser can no longer
 * mark a booking paid itself.
 */
export async function confirmDemoPayment(bookingId) {
  if (!hasSupabase) throw new Error('no-supabase')
  const { data, error } = await supabase.functions.invoke('vnpay-create-payment', { body: { bookingId, demo: true } })
  if (error || data?.status !== 'demo-confirmed') throw new Error('demo-failed')
}
