import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import { findPaymentCode, isSepayRequest, sepayConfig, sepayTime } from '../_shared/sepay.ts'

// Validate the bank request here; receipt, duplicate handling and booking
// settlement are committed atomically by one database transaction.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'method' }, { status: 405 })
  const config = sepayConfig(Deno.env)
  const key = Deno.env.get('SEPAY_WEBHOOK_KEY')?.trim() ?? ''
  if (!key || !isSepayRequest(req.headers.get('authorization'), key)) return jsonResponse({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!config) return jsonResponse({ success: false, error: 'payment-not-configured' }, { status: 503 })
  let tx: Record<string, unknown>
  try { tx = await req.json() } catch { return jsonResponse({ success: false, error: 'invalid-body' }, { status: 400 }) }
  if (!tx || typeof tx !== 'object' || Array.isArray(tx) || tx.id == null || tx.transferAmount == null) {
    return jsonResponse({ success: false, error: 'invalid-body' }, { status: 400 })
  }
  const id = Number(tx.id), amount = Math.round(Number(tx.transferAmount))
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000000) {
    return jsonResponse({ success: false, error: 'invalid-transaction' }, { status: 400 })
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('apply_sepay_transfer', {
    p_tx: { ...tx, id, transferAmount: amount, code: findPaymentCode(tx), transactionDate: sepayTime(tx.transactionDate) },
    p_expected_account: config.accountNumber, p_mock: false,
  })
  if (error) { console.error('sepay settlement failed', error.code); return jsonResponse({ success: false, error: 'storage' }, { status: 500 }) }
  return jsonResponse(data)
})
