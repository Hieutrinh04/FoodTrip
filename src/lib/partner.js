import { supabase, hasSupabase } from './supabaseClient.js'

// The hotel partner's side of FoodTrip. The database decides what a partner
// may see and do (row policies and manager_set_fulfillment); these calls only
// ask.

/** The properties the signed-in user runs, with their role at each. */
export async function getMyProperties(userId) {
  if (!hasSupabase || !userId) return []
  const { data, error } = await supabase
    .from('property_managers')
    .select('role, property:properties(*)')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []).filter((row) => row.property?.active).map((row) => ({ ...row.property, role: row.role }))
}

/** Whether the user runs any property — for showing the partner link. */
export async function isPartner(userId) {
  if (!hasSupabase || !userId) return false
  const { count, error } = await supabase.from('property_managers').select('property_id', { count: 'exact', head: true }).eq('user_id', userId)
  return !error && (count ?? 0) > 0
}

/** Bookings for one of the user's properties, by check-in date. Cancelled and unpaid ones included, so nothing is hidden. */
export async function getPropertyBookings(hotelPlaceId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, hotel_place_id, room_name, check_in, check_out, nights, guests, total_price, guest_name, guest_phone, guest_email, payment_status, payment_code, paid_at, fulfillment_status, hotel_note, fulfillment_updated_at, created_at')
    .eq('hotel_place_id', hotelPlaceId)
    .order('check_in', { ascending: true })
    .limit(1000)
  if (error) throw error
  return data
}

/**
 * The hotel's side of a booking: confirmed, rejected, checked_in, no_show,
 * completed. The database checks the move and logs it.
 */
export async function setFulfillment(bookingId, status, note = '') {
  const { error } = await supabase.rpc('manager_set_fulfillment', { p_booking_id: bookingId, p_status: status, p_note: note })
  if (error) throw error
}

export async function updatePropertyContact(propertyId, { phone, email, note }) {
  const { error } = await supabase.rpc('manager_update_property', { p_property_id: propertyId, p_phone: phone, p_email: email, p_note: note })
  if (error) throw error
}

export async function getMyApplications(userId) {
  if (!hasSupabase || !userId) return []
  const { data, error } = await supabase.from('partner_applications').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/**
 * A partner application. A property FoodTrip already lists sends its link;
 * one no search finds (a homestay, a small guesthouse) describes itself
 * instead — type, city, a pin and a few words — and is given a FoodTrip id
 * when approved.
 */
export async function submitApplication({ hotelName, address, phone, hotelLink, message, listing = null, contact, termsVersion }) {
  const { error } = await supabase.from('partner_applications').insert({
    hotel_name: hotelName.trim(), address: address.trim(), phone: phone.trim(),
    hotel_link: listing ? null : hotelLink.trim() || null, message: message.trim() || null,
    contact_name: contact.name.trim(), contact_role: contact.role,
    room_count: Number(contact.roomCount) || null, star_rating: contact.stars === '' ? null : Number(contact.stars),
    business_license: contact.license.trim() || null, tax_code: contact.taxCode.trim() || null,
    terms_version: termsVersion,
    ...(listing ? {
      property_type: listing.propertyType, city: listing.city.trim() || null,
      lat: listing.lat, lng: listing.lng, description: listing.description.trim() || null,
    } : {}),
  })
  if (error) throw error
}

/** Kinds of place a partner can be, as travellers read them. */
export const PROPERTY_TYPES = {
  homestay: { vi: 'Homestay', en: 'Homestay' },
  guesthouse: { vi: 'Nhà nghỉ', en: 'Guesthouse' },
  hotel: { vi: 'Khách sạn', en: 'Hotel' },
  villa: { vi: 'Villa', en: 'Villa' },
  hostel: { vi: 'Hostel', en: 'Hostel' },
}

/** What the owner shows travellers: photo, description, type, city, pin. */
export async function updateListing(propertyId, l) {
  const { error } = await supabase.rpc('manager_update_listing', {
    p_property_id: propertyId,
    p_details: {
      gallery: l.gallery ?? [], description: l.description || '', property_type: l.propertyType || '', city: l.city || '',
      lat: l.lat ?? null, lng: l.lng ?? null, amenities: l.amenities ?? [],
      check_in_time: l.checkIn || '', check_out_time: l.checkOut || '', cancellation_policy: l.cancellation || '', house_rules: l.houseRules || '',
    },
  })
  if (error) throw error
}

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Uploads the property's photo to its own folder and returns the public address. */
export async function uploadPropertyPhoto(propertyId, file) {
  const ext = PHOTO_TYPES[file.type]
  if (!ext) throw Object.assign(new Error('invalid-photo-type'), { code: 'invalid-photo-type' })
  if (file.size > 3 * 1024 * 1024) throw Object.assign(new Error('photo-too-large'), { code: 'photo-too-large' })
  const path = `${propertyId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('property-photos').upload(path, file, { contentType: file.type })
  if (error) throw error
  return supabase.storage.from('property-photos').getPublicUrl(path).data.publicUrl
}

/** Today's date in Vietnam, as the database compares check-in dates. */
export function vietnamToday() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

/** The hotel's side of a booking, as partners, travellers and admins see it. */
export const FULFILLMENT = {
  awaiting: { vi: 'Chờ xác nhận', en: 'To confirm', style: 'bg-lantern/20 text-lantern' },
  confirmed: { vi: 'Đã xác nhận', en: 'Confirmed', style: 'bg-herb/15 text-herb' },
  rejected: { vi: 'Đã từ chối', en: 'Rejected', style: 'bg-chili/15 text-chili' },
  checked_in: { vi: 'Đang ở', en: 'In house', style: 'bg-[#2583d8]/15 text-[#2583d8]' },
  completed: { vi: 'Đã trả phòng', en: 'Checked out', style: 'bg-paper-2 text-ink-muted' },
  no_show: { vi: 'Khách không đến', en: 'No-show', style: 'bg-paper-2 text-ink-muted' },
}

/** The partner terms currently offered to places to stay ('stay') or tour operators ('tour'): the highest version of that kind. */
export async function getCurrentTerms(kind = 'stay') {
  const { data, error } = await supabase.from('partner_terms').select('*').eq('kind', kind).order('version', { ascending: false }).limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

export async function acceptTerms(propertyId, version) {
  const { error } = await supabase.rpc('manager_accept_terms', { p_property_id: propertyId, p_version: version })
  if (error) throw error
}

/** The go-live checklist: { listing, amenities, policies, rooms, payout, terms } → true/false. */
export async function getReadiness(propertyId) {
  const { data, error } = await supabase.rpc('property_readiness', { p_property_id: propertyId })
  if (error) throw error
  return data ?? {}
}

/** Where FoodTrip pays the property — only its owner and admins can read it. */
export async function getPayout(propertyId) {
  const { data, error } = await supabase.from('property_payouts').select('*').eq('property_id', propertyId).maybeSingle()
  if (error) throw error
  return data
}

export async function setPayout(propertyId, { bank, account, holder }) {
  const { error } = await supabase.rpc('manager_set_payout', { p_property_id: propertyId, p_bank: bank, p_account: account, p_holder: holder })
  if (error) throw error
}

/** Facilities a property can tick (the database accepts these codes only). */
export const AMENITIES = {
  wifi: { vi: 'Wi-Fi miễn phí', en: 'Free Wi-Fi' },
  aircon: { vi: 'Điều hoà', en: 'Air conditioning' },
  parking: { vi: 'Chỗ đậu xe', en: 'Parking' },
  breakfast: { vi: 'Bữa sáng', en: 'Breakfast' },
  kitchen: { vi: 'Bếp chung', en: 'Shared kitchen' },
  pool: { vi: 'Hồ bơi', en: 'Pool' },
  laundry: { vi: 'Giặt ủi', en: 'Laundry' },
  airport_shuttle: { vi: 'Đưa đón sân bay', en: 'Airport shuttle' },
  front_desk_24h: { vi: 'Lễ tân 24 giờ', en: '24-hour front desk' },
  elevator: { vi: 'Thang máy', en: 'Elevator' },
  family_rooms: { vi: 'Phòng gia đình', en: 'Family rooms' },
  pets: { vi: 'Cho phép thú cưng', en: 'Pets allowed' },
  non_smoking: { vi: 'Phòng không hút thuốc', en: 'Non-smoking rooms' },
  motorbike_rental: { vi: 'Thuê xe máy', en: 'Motorbike rental' },
  garden: { vi: 'Sân vườn', en: 'Garden' },
  bbq: { vi: 'Khu nướng BBQ', en: 'BBQ area' },
}

/** Cancellation policies a property chooses from, as travellers read them. */
export const CANCELLATION = {
  flexible: { vi: 'Linh hoạt — huỷ miễn phí đến 24 giờ trước ngày nhận phòng', en: 'Flexible — free cancellation up to 24 hours before check-in' },
  moderate: { vi: 'Vừa phải — huỷ miễn phí đến 5 ngày trước ngày nhận phòng', en: 'Moderate — free cancellation up to 5 days before check-in' },
  strict: { vi: 'Nghiêm ngặt — hoàn 50% nếu huỷ trước 7 ngày', en: 'Strict — 50% refund if cancelled 7+ days before' },
  non_refundable: { vi: 'Không hoàn tiền', en: 'Non-refundable' },
}
