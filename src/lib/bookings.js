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
