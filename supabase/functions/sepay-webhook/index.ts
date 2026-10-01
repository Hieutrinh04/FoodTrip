import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import { findPaymentCode, isSepayRequest, sepayConfig, sepayTime } from '../_shared/sepay.ts'

/**
 * SePay's webhook: called once for every transfer into (or out of) the
 * merchant's bank account. Configure it in SePay as
 *   URL:  https://<project>.supabase.co/functions/v1/sepay-webhook
 *   Auth: API Key — the same value as the SEPAY_WEBHOOK_KEY secret
 *
 * For each incoming transfer:
 * 1. The request must carry our key, or nothing happens (401).
 * 2. The transfer is recorded in payment_transactions under SePay's own id.
 *    If that id is already there, this is a redelivery: answer success and
 *    stop, so one transfer can never pay twice.
 * 3. The booking is found by the payment code in the transfer note.
 * 4. It is marked paid only if it is still pending and the amount covers the
 *    total the database holds — never a figure from the browser. A short
 *    payment is recorded as "underpaid" and the booking stays pending.
 * Transfers that match nothing are kept for an admin to reconcile.
 *
 * SePay retries until it gets a 2xx with {"success": true}, so every outcome
 * that was handled — including "not ours" — answers success. Only a server
 * error answers 500, which makes SePay try again later.
 *
 * Deployed with --no-verify-jwt: SePay sends no Supabase token.
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'method' }, { status: 405 })

  const config = sepayConfig(Deno.env)
  const webhookKey = Deno.env.get('SEPAY_WEBHOOK_KEY')?.trim() ?? ''
  if (!webhookKey || !isSepayRequest(req.headers.get('authorization'), webhookKey)) {
    return jsonResponse({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let tx: Record<string, unknown>
  try {
    tx = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'invalid-body' }, { status: 400 })
  }
  const transactionId = Number(tx.id)
  const amount = Math.round(Number(tx.transferAmount))
  if (!Number.isSafeInteger(transactionId) || !Number.isFinite(amount)) {
    return jsonResponse({ success: false, error: 'invalid-transaction' }, { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return jsonResponse({ success: false, error: 'server-misconfigured' }, { status: 500 })
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const paymentCode = findPaymentCode(tx as { code?: string; content?: string; description?: string })
  const record = {
    id: transactionId,
    provider: 'sepay',
    payment_code: paymentCode,
    amount,
    content: String(tx.content ?? ''),
    reference_code: tx.referenceCode ? String(tx.referenceCode) : null,
    account_number: tx.accountNumber ? String(tx.accountNumber) : null,
    gateway: tx.gateway ? String(tx.gateway) : null,
    transaction_date: sepayTime(tx.transactionDate),
    raw: tx,
    outcome: 'processing',
  }

  // Claim the transaction first. A second delivery of the same id finds it
  // taken and stops here.
  const { data: claimed, error: claimError } = await admin
    .from('payment_transactions')
    .upsert(record, { onConflict: 'id', ignoreDuplicates: true })
    .select('id')
  if (claimError) {
    console.error('sepay-webhook: could not record transaction', claimError.message)
    return jsonResponse({ success: false, error: 'storage' }, { status: 500 })
  }
  if (!claimed?.length) return jsonResponse({ success: true, duplicate: true })

  const finish = async (outcome: string, bookingId: string | null = null) => {
    await admin.from('payment_transactions').update({ outcome, booking_id: bookingId }).eq('id', transactionId)
    return jsonResponse({ success: true, outcome })
  }

  if (tx.transferType !== 'in') return finish('outgoing')
  // Another account on the same SePay login is not where bookings are paid.
  if (config && record.account_number && record.account_number !== config.accountNumber) return finish('wrong-account')
  if (!paymentCode) return finish('no-booking')

  const { data: booking } = await admin
    .from('bookings')
    .select('id, total_price, payment_status')
    .eq('payment_code', paymentCode)
    .maybeSingle()
  if (!booking) return finish('no-booking')
  if (booking.payment_status !== 'pending') return finish('not-pending', booking.id)
  if (amount < Number(booking.total_price)) return finish('underpaid', booking.id)

  // Conditional on still being pending, so two different transfers for the
  // same booking arriving together cannot both "pay" it.
  const { data: updated, error: updateError } = await admin
    .from('bookings')
    .update({
      payment_status: 'paid',
      payment_provider: 'sepay',
      payment_txn_ref: `SEPAY-${transactionId}`,
      paid_at: record.transaction_date ?? new Date().toISOString(),
    })
    .eq('id', booking.id)
    .eq('payment_status', 'pending')
    .select('id')
  if (updateError) {
    console.error('sepay-webhook: could not mark booking paid', updateError.message)
    await admin.from('payment_transactions').delete().eq('id', transactionId) // let SePay's retry try again
    return jsonResponse({ success: false, error: 'storage' }, { status: 500 })
  }
  return finish(updated?.length ? 'paid' : 'not-pending', booking.id)
})
