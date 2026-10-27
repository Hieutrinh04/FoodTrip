import { supabase, hasSupabase } from './supabaseClient.js'

/** Explicit test mode or bank transfer configuration: 'mock' | 'ready' | 'no-key' | 'unknown'. */
export async function getSepayMode() {
  if (!hasSupabase) return 'no-key'
  try {
    const { data, error } = await supabase.functions.invoke('sepay-create-payment', { body: { check: true } })
    if (error) return 'unknown'
    if (data?.status === 'mock') return 'mock'
    return data?.status === 'ready' ? 'ready' : 'no-key'
  } catch {
    return 'unknown'
  }
}

/**
 * The transfer details for one of the traveller's bookings: QR, account,
 * amount and note — or its status, once it is no longer waiting for payment.
 */
export async function getSepayPayment(bookingId) {
  const { data, error } = await supabase.functions.invoke('sepay-create-payment', { body: { bookingId } })
  if (error) {
    const status = error.context?.status
    throw new Error(status === 401 ? 'auth-required' : status === 403 ? 'not-your-booking' : status === 404 ? 'not-found' : 'failed')
  }
  return data
}

/** The booking's payment status as the database has it — the webhook's word, not the browser's. */
export async function getBookingPaymentStatus(bookingId) {
  const { data, error } = await supabase.from('bookings').select('payment_status, paid_at, payment_txn_ref').eq('id', bookingId).maybeSingle()
  if (error) throw error
  return data
}

export async function mockSepayTransfer(bookingId, key, scenario) {
  const { data,error } = await supabase.rpc('mock_sepay_transfer',{p_booking:bookingId,p_key:key,p_scenario:scenario})
  if (error) throw error
  return data
}
