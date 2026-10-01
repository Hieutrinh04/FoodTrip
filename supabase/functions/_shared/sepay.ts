// SePay: payment by bank transfer. SePay watches the merchant's bank account
// and posts every transfer to our webhook; there is no card form and no
// redirect. See https://docs.sepay.vn (webhook integration).
//
// Configuration (Supabase secrets):
//   SEPAY_WEBHOOK_KEY      the API key set on the webhook in SePay — SePay sends
//                          it as "Authorization: Apikey <key>"
//   SEPAY_BANK             bank as SePay's QR service names it, e.g. "MBBank",
//                          "Vietcombank", "ACB", "TPBank"
//   SEPAY_ACCOUNT_NUMBER   the receiving account number
//   SEPAY_ACCOUNT_NAME     the account holder, shown to the traveller

export type SepayConfig = {
  webhookKey: string
  bank: string
  accountNumber: string
  accountName: string
}

type Env = { get(name: string): string | undefined }

/** The configuration, or null when anything needed to take a payment is missing. */
export function sepayConfig(env: Env): SepayConfig | null {
  const webhookKey = env.get('SEPAY_WEBHOOK_KEY')?.trim()
  const bank = env.get('SEPAY_BANK')?.trim()
  const accountNumber = env.get('SEPAY_ACCOUNT_NUMBER')?.trim()
  if (!webhookKey || !bank || !accountNumber) return null
  return { webhookKey, bank, accountNumber, accountName: env.get('SEPAY_ACCOUNT_NAME')?.trim() ?? '' }
}

/** SePay's VietQR image: any banking app scans it with the amount and note filled in. */
export function sepayQrUrl({ bank, accountNumber, amount, content }: { bank: string; accountNumber: string; amount: number; content: string }) {
  const params = new URLSearchParams({ acc: accountNumber, bank, amount: String(Math.round(amount)), des: content })
  return `https://qr.sepay.vn/img?${params}`
}

// "FT" + 10 hex characters, as the database issues them. Banks upper-case the
// note, drop punctuation and sometimes glue words together, so the code is
// looked for anywhere in it, in any case.
const PAYMENT_CODE = /FT[0-9A-F]{10}/i

/**
 * The booking code in a SePay transaction: SePay's own detected `code` when
 * it matches our format, otherwise searched for in the transfer note and the
 * bank's description.
 */
export function findPaymentCode(tx: { code?: string | null; content?: string | null; description?: string | null }) {
  for (const text of [tx.code, tx.content, tx.description]) {
    const match = String(text ?? '').replace(/\s+/g, '').match(PAYMENT_CODE)
    if (match) return match[0].toUpperCase()
  }
  return null
}

/** Compares without leaking, through timing, how much of a guessed key was right. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Whether a webhook request carries SePay's "Authorization: Apikey <key>" header with our key. */
export function isSepayRequest(authorization: string | null, webhookKey: string) {
  const match = String(authorization ?? '').match(/^\s*Apikey\s+(.+?)\s*$/i)
  return Boolean(match && webhookKey && safeEqual(match[1], webhookKey))
}

/** SePay reports Vietnam local time without a zone: "2026-09-25 14:02:37". */
export function sepayTime(value: unknown) {
  const text = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return null
  return new Date(`${text.replace(' ', 'T')}+07:00`).toISOString()
}
