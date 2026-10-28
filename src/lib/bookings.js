import { supabase, hasSupabase } from './supabaseClient.js'

export async function createBooking({
  userId, hotel, room, checkIn, checkOut, nights, guests, guestName, guestEmail, guestPhone, requestKey,
}) {
  if (!hasSupabase) throw new Error('no-supabase')
  if (room.managed) {
    const { data, error } = await supabase.rpc('reserve_partner_room', {
      p_room: room.key, p_in: checkIn, p_out: checkOut, p_guests: guests,
      p_name: guestName, p_phone: guestPhone, p_email: guestEmail,
      p_total: room.totalPrice, p_key: requestKey,
    })
    if (error) throw error
    return data
  }
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      user_id: userId,
      hotel_place_id: hotel.id,
      hotel_name: hotel.name,
      hotel_address: hotel.address,
      room_key: room.key,
      room_name: room.name.vi,
      price_per_night: room.pricePerNight,
      check_in: checkIn,
      check_out: checkOut,
      nights,
      guests,
      total_price: room.totalPrice ?? room.pricePerNight * nights,
      guest_name: guestName,
      guest_email: guestEmail || null,
      guest_phone: guestPhone || null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function getMyBookings(userId) {
  if (!hasSupabase) throw new Error('no-supabase')
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getBooking(id) {
  if (!hasSupabase) return null
  const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function cancelBooking(id) {
  if (!hasSupabase) throw new Error('no-supabase')
  // A successful HTTP request affecting zero rows is not a successful cancel.
  const { data, error } = await supabase.from('bookings').update({ payment_status: 'cancelled' }).eq('id', id).eq('payment_status', 'pending').select('id,payment_status').single()
  if (error) throw error
  return data
}

/** What cancelling a paid booking now would refund, by the property's policy. */
export async function getRefundQuote(id) {
  const { data, error } = await supabase.rpc('booking_refund_quote', { p_booking: id })
  if (error) throw error
  return data
}

/** Cancels a paid booking; a refund needs the account to send it to. */
export async function cancelPaidBooking(id, { reason, bank, account, holder }) {
  const { data, error } = await supabase.rpc('guest_cancel_booking', { p_booking: id, p_reason: reason, p_bank: bank || null, p_account: account || null, p_holder: holder || null })
  if (error) throw error
  return data
}

/** Where to send a refund owed (e.g. after the hotel rejected the booking). */
export async function setRefundAccount(id, { bank, account, holder }) {
  const { error } = await supabase.rpc('guest_set_refund_account', { p_booking: id, p_bank: bank, p_account: account, p_holder: holder })
  if (error) throw error
}

/** The cancellation policies a guest may meet, as they read them. */
export const CANCELLATION_TEXT = {
  flexible: { vi: 'Linh hoạt — hoàn 100% nếu huỷ trước ngày nhận phòng ít nhất 1 ngày', en: 'Flexible — full refund up to the day before check-in' },
  moderate: { vi: 'Vừa phải — hoàn 100% nếu huỷ trước ngày nhận phòng ít nhất 5 ngày', en: 'Moderate — full refund up to 5 days before check-in' },
  strict: { vi: 'Nghiêm ngặt — hoàn 50% nếu huỷ trước ngày nhận phòng ít nhất 7 ngày', en: 'Strict — 50% refund up to 7 days before check-in' },
  non_refundable: { vi: 'Không hoàn tiền', en: 'Non-refundable' },
}
