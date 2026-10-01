import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { sepayConfig, sepayQrUrl } from '../_shared/sepay.ts'

/**
 * Transfer details for paying a booking through SePay.
 *
 *   { check: true }  → { status: 'ready' | 'no-key' }
 *   { bookingId }    → { status: 'ok', amount, content, bank, accountNumber,
 *                        accountName, qrUrl, booking } for the caller's own
 *                        pending booking; { status: 'paid' | 'cancelled' | … }
 *                        once it is no longer pending.
 *
 * The amount and the transfer note come from the booking row, so what the QR
 * asks for is exactly what the webhook will check the transfer against.
 *
 * Deployed with --no-verify-jwt so the CORS preflight is answered; the
 * caller's identity is checked below.
 */
Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid-body' }, { status: 400 })
  }

  const config = sepayConfig(Deno.env)
  if (body.check) return jsonResponse({ status: config ? 'ready' : 'no-key' })
  if (!config) return jsonResponse({ status: 'no-key' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'server-misconfigured' }, { status: 500 })
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: userData } = await admin.auth.getUser(token)
  const user = userData?.user
  if (!user) return jsonResponse({ error: 'auth-required' }, { status: 401 })

  const bookingId = String(body.bookingId ?? '')
  if (!bookingId) return jsonResponse({ error: 'missing-booking' }, { status: 400 })

  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, user_id, total_price, payment_status, payment_code, paid_at, hotel_name, room_name, check_in, check_out, nights, guests, created_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (error || !booking) return jsonResponse({ error: 'booking-not-found' }, { status: 404 })
  if (booking.user_id !== user.id) return jsonResponse({ error: 'not-your-booking' }, { status: 403 })

  const summary = {
    id: booking.id,
    hotelName: booking.hotel_name,
    roomName: booking.room_name,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    nights: booking.nights,
    guests: booking.guests,
    paidAt: booking.paid_at,
  }
  if (booking.payment_status !== 'pending') return jsonResponse({ status: booking.payment_status, booking: summary })

  const amount = Number(booking.total_price)
  return jsonResponse({
    status: 'ok',
    amount,
    content: booking.payment_code,
    bank: config.bank,
    accountNumber: config.accountNumber,
    accountName: config.accountName,
    qrUrl: sepayQrUrl({ bank: config.bank, accountNumber: config.accountNumber, amount, content: booking.payment_code }),
    booking: summary,
  })
})
