import { supabase } from './supabaseClient.js'

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}
export async function quoteRooms(hotel, checkIn, checkOut, guests) {
  try {
    return await rpc('hotel_room_quote', { p_hotel: hotel, p_in: checkIn, p_out: checkOut, p_guests: guests })
  } catch (error) {
    // Additive rollout: an absent migration retains the old booking flow.
    // Network, permission and validation failures must NOT fall back to it.
    if (error.code === 'PGRST202') return { managed: false, rooms: [] }
    throw error
  }
}
export const createRoom = (property, form) => rpc('manager_save_room', { p_property: property, p_name: form.name, p_capacity: Number(form.capacity), p_quantity: Number(form.quantity), p_price: Number(form.price) })
export const updateRoom = (room, form) => rpc('manager_update_room', { p_room: room, p_name: form.name, p_capacity: Number(form.capacity), p_quantity: Number(form.quantity), p_price: Number(form.price), p_active: form.active })
export const resetRoomDates = (room, form) => rpc('manager_reset_room_dates', { p_room: room, p_start: form.start, p_end: form.end })
export const saveRoomDates = (room, form) => rpc('manager_set_room_dates', { p_room: room, p_start: form.start, p_end: form.end, p_quantity: Number(form.quantity), p_price: Number(form.price) })
export const enableInventory = (property) => rpc('manager_enable_inventory', { p_property: property })
export async function listRooms(property) {
  const { data, error } = await supabase.from('room_inventory').select('*').eq('property_id', property).order('name')
  if (error) throw error
  return data
}
export async function listRoomDates(room, from) {
  const { data, error } = await supabase.from('room_calendar').select('*').eq('room_id', room).gte('stay_date', from).order('stay_date').limit(366)
  if (error) throw error
  return data
}
export function inventoryError(error) {
  const messages = {
    'owners-only': 'Chỉ chủ cơ sở được sửa kho phòng.',
    'rooms-required': 'Hãy tạo ít nhất một loại phòng trước.',
    'listing-incomplete': 'Hồ sơ chưa đủ để mở bán — hoàn thành các mục còn trống trong "Hoàn thiện hồ sơ để mở bán".',
    'legacy-bookings-need-reconciliation': 'Còn đơn cũ chưa kết thúc. Cần đối soát các đơn này trước khi bật kho phòng; không tự động hủy đơn của khách.',
    'below-reserved-quantity': 'Số lượng mới thấp hơn số phòng đã giữ cho khách.',
    'calendar-exceeds-quantity': 'Có ngày đang mở bán nhiều hơn tổng số phòng mới. Hãy điều chỉnh lịch bán theo ngày trước.',
    'capacity-below-booked-guests': 'Không thể giảm sức chứa dưới số khách của đơn đang giữ phòng.',
    'invalid-quantity': 'Số phòng mở bán phải từ 0 đến tổng số phòng của loại này.',
    'invalid-dates': 'Kiểm tra ngày, số khách; mỗi lượt đặt tối đa 30 đêm.',
    'room-sold-out': 'Phòng vừa hết chỗ. Hãy tải lại giá và chọn phòng khác.',
    'room-unavailable': 'Loại phòng này hiện không nhận đặt chỗ.',
    'price-changed': 'Giá vừa thay đổi. Hãy tải lại giá trước khi đặt.',
  }
  return Object.entries(messages).find(([key]) => error?.message?.includes(key))?.[1]
    ?? 'Chưa thực hiện được. Kiểm tra kết nối và việc cài đặt migration kho phòng rồi thử lại.'
}
