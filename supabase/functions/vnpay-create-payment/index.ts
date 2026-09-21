import { jsonResponse, handleOptions } from '../_shared/cors.ts'

const VNPAY_SANDBOX_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

function vnpDate(d: Date) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function hmacSha512Hex(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// VNPay sandbox integration — builds a signed payment URL following VNPay's
// documented "pay" API (sort params alphabetically, HMAC-SHA512 sign the
// query string with the merchant's hash secret). Needs VNPAY_TMN_CODE and
// VNPAY_HASH_SECRET from a sandbox merchant account registered at
// https://sandbox.vnpayment.vn/devreg/ — until those are set, this returns
// { status: 'no-key' } so the client can fall back to a labeled demo flow
// instead of silently faking a real payment.
Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const tmnCode = Deno.env.get('VNPAY_TMN_CODE')
    const hashSecret = Deno.env.get('VNPAY_HASH_SECRET')
    if (!tmnCode || !hashSecret) return jsonResponse({ status: 'no-key' })

    const { bookingId, amount, orderInfo } = await req.json()
    if (!bookingId || !amount) return jsonResponse({ error: 'missing-params' }, { status: 400 })

    // VNPay must return through the server-side verifier, not directly to the
    // React app. The verifier checks VNPay's signature, updates the booking,
    // then redirects the customer to /booking/return with a trusted status.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) return jsonResponse({ error: 'missing-supabase-url' }, { status: 500 })
    const verifiedReturnUrl = `${supabaseUrl}/functions/v1/vnpay-return`

    const ipAddr = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Amount: String(Math.round(amount) * 100), // VNPay expects amount x100 (no decimals)
      vnp_CurrCode: 'VND',
      vnp_TxnRef: String(bookingId),
      vnp_OrderInfo: (orderInfo || `Thanh toan dat phong ${bookingId}`).toString().slice(0, 254),
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: verifiedReturnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: vnpDate(new Date()),
    }

    const sortedKeys = Object.keys(params).sort()
    const signData = sortedKeys.map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&')
    const secureHash = await hmacSha512Hex(hashSecret, signData)

    const paymentUrl = `${VNPAY_SANDBOX_URL}?${signData}&vnp_SecureHash=${secureHash}`
    return jsonResponse({ status: 'ok', paymentUrl })
  } catch (err) {
    console.error('vnpay-create-payment failed:', (err as Error).message)
    return jsonResponse({ error: 'create-payment-failed', message: (err as Error).message }, { status: 502 })
  }
})
