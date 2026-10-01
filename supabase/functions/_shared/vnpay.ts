/**
 * VNPay request signing, shared by the function that builds the payment URL
 * and the one that verifies VNPay's redirect. They used to each carry their own
 * copy — kept in one place so the two can never sign differently.
 */

export const VNPAY_SANDBOX_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'

async function hmacSha512Hex(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * VNPay 2.1.0's canonical query: keys sorted, values URL-encoded with spaces as
 * "+" (what its reference implementation's form encoding produces). Plain
 * encodeURIComponent gives "%20" instead, which is a different string to sign —
 * any order description with a space in it ("FoodTrip - Khách sạn - Phòng")
 * came back from VNPay as an invalid signature.
 */
export function canonicalQuery(params: Record<string, string>) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
    .join('&')
}

export async function signParams(params: Record<string, string>, secret: string) {
  const query = canonicalQuery(params)
  return { query, hash: await hmacSha512Hex(secret, query) }
}

export function vnpayKeys() {
  const tmnCode = Deno.env.get('VNPAY_TMN_CODE')
  const hashSecret = Deno.env.get('VNPAY_HASH_SECRET')
  return tmnCode && hashSecret ? { tmnCode, hashSecret } : null
}
