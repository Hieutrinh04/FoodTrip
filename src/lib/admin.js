import { supabase, hasSupabase } from './supabaseClient.js'

// Everything the /admin page reads or changes. None of it is trusted on this
// side: the database answers only admins (see the admin migration), so these
// calls simply come back empty or refused for anyone else.

export const PAGE_SIZE = 50

/**
 * 'admin' | 'not-admin' | 'not-installed' (the admin migration has not been
 * applied, so the check itself does not exist yet) | 'error'.
 */
export async function getAdminStatus() {
  if (!hasSupabase) return 'not-installed'
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return error.code === 'PGRST202' || error.code === '42883' ? 'not-installed' : 'error'
  return data ? 'admin' : 'not-admin'
}

export async function getOverview() {
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw error
  return data
}

function page(query, pageIndex) {
  return query.range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1)
}

export async function listBookings({ status = 'all', search = '', pageIndex = 0 } = {}) {
  let query = supabase.from('bookings').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('payment_status', status)
  const term = search.trim().replace(/[%,()]/g, ' ')
  if (term) query = query.or(`hotel_name.ilike.%${term}%,guest_name.ilike.%${term}%,guest_email.ilike.%${term}%,guest_phone.ilike.%${term}%`)
  const { data, error, count } = await page(query, pageIndex)
  if (error) throw error
  return { rows: data, count: count ?? 0 }
}

/**
 * pending → paid (money taken outside the webhook), pending → cancelled,
 * paid → refunded. The database checks the transition, asks for a note on
 * anything involving money, and writes the audit log.
 */
export async function setBookingStatus(id, status, note = '') {
  const { error } = await supabase.rpc('admin_set_booking_status', { p_booking_id: id, p_status: status, p_note: note })
  if (error) throw error
}

export function cancelPendingBooking(id) {
  return setBookingStatus(id, 'cancelled')
}

/** Transfers SePay recorded against a booking, including short and late ones. */
export async function getBookingTransactions(bookingId) {
  const { data, error } = await supabase.from('payment_transactions')
    .select('id, amount, content, outcome, transaction_date, reference_code, gateway')
    .eq('booking_id', bookingId).order('transaction_date', { ascending: false })
  if (error) throw error
  return data
}

/** Every booking matching the filters, for export — up to 5,000. */
export async function allBookings({ status = 'all', search = '' } = {}) {
  let query = supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(5000)
  if (status !== 'all') query = query.eq('payment_status', status)
  const term = search.trim().replace(/[%,()]/g, ' ')
  if (term) query = query.or(`hotel_name.ilike.%${term}%,guest_name.ilike.%${term}%,guest_email.ilike.%${term}%,guest_phone.ilike.%${term}%`)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function listPosts({ pageIndex = 0 } = {}) {
  const query = supabase.from('community_posts')
    .select('id, author_name, body, place_name, address, photo_paths, created_at, community_comments(count)', { count: 'exact' })
    .order('created_at', { ascending: false })
  const { data, error, count } = await page(query, pageIndex)
  if (error) throw error
  return { rows: data.map((post) => ({ ...post, comments: post.community_comments?.[0]?.count ?? 0 })), count: count ?? 0 }
}

/** Removes a post, its comments (by cascade) and its photos. */
export async function deletePost(post) {
  const { error } = await supabase.from('community_posts').delete().eq('id', post.id)
  if (error) throw error
  if (post.photo_paths?.length) await supabase.storage.from('community-photos').remove(post.photo_paths)
}

export async function listComments({ pageIndex = 0 } = {}) {
  const query = supabase.from('community_comments')
    .select('id, post_id, author_name, body, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
  const { data, error, count } = await page(query, pageIndex)
  if (error) throw error
  return { rows: data, count: count ?? 0 }
}

export async function deleteComment(id) {
  const { error } = await supabase.from('community_comments').delete().eq('id', id)
  if (error) throw error
}

export async function listMessages({ show = 'open', pageIndex = 0 } = {}) {
  let query = supabase.from('contact_messages').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  if (show === 'open') query = query.is('handled_at', null)
  const { data, error, count } = await page(query, pageIndex)
  if (error) throw error
  return { rows: data, count: count ?? 0 }
}

export async function setMessageHandled(id, handled) {
  const { error } = await supabase.from('contact_messages')
    .update({ handled_at: handled ? new Date().toISOString() : null }).eq('id', id)
  if (error) throw error
}

export async function deleteMessage(id) {
  const { error } = await supabase.from('contact_messages').delete().eq('id', id)
  if (error) throw error
}

export async function listSubscribers({ pageIndex = 0 } = {}) {
  const query = supabase.from('newsletter_subscribers').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  const { data, error, count } = await page(query, pageIndex)
  if (error) throw error
  return { rows: data, count: count ?? 0 }
}

export async function allSubscriberEmails() {
  const { data, error } = await supabase.from('newsletter_subscribers').select('email, created_at').order('created_at')
  if (error) throw error
  return data
}

export async function deleteSubscriber(id) {
  const { error } = await supabase.from('newsletter_subscribers').delete().eq('id', id)
  if (error) throw error
}

export async function listVideoReviews({ pageIndex = 0 } = {}) {
  const query = supabase.from('video_reviews')
    .select('id, platform, video_url, place_name, address, note, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
  const { data, error, count } = await page(query, pageIndex)
  if (error) throw error
  return { rows: data, count: count ?? 0 }
}

export async function deleteVideoReview(id) {
  const { error } = await supabase.from('video_reviews').delete().eq('id', id)
  if (error) throw error
}

export async function listUsers({ search = '', pageIndex = 0 } = {}) {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: search.trim(), p_limit: PAGE_SIZE, p_offset: pageIndex * PAGE_SIZE,
  })
  if (error) throw error
  return { rows: data, count: null }
}

/** A CSV the admin downloads — quoted so commas and quotes in fields survive. */
export function toCsv(rows, columns) {
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [columns.map(cell).join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))].join('\r\n')
}

/** Every transfer SePay reported, newest first — "attention" leaves out the ones that paid a booking. */
export async function listPayments({ show = 'all', pageIndex = 0 } = {}) {
  let query = supabase.from('payment_transactions')
    .select('id, booking_id, payment_code, amount, content, reference_code, gateway, transaction_date, outcome, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (show === 'attention') query = query.in('outcome', ['underpaid', 'no-booking', 'not-pending', 'wrong-account'])
  const { data, error, count } = await page(query, pageIndex)
  if (error) throw error
  return { rows: data, count: count ?? 0 }
}

/** Attaches a transfer SePay could not match to the booking with this payment code, marking it paid. */
export async function matchPayment(transactionId, paymentCode) {
  const { error } = await supabase.rpc('admin_match_payment', { p_transaction_id: transactionId, p_payment_code: paymentCode })
  if (error) throw error
}

/** Grants or withdraws admin rights. Nobody can withdraw their own. */
export async function setAdmin(userId, isAdmin) {
  const { error } = await supabase.rpc('admin_set_admin', { p_user_id: userId, p_admin: isAdmin })
  if (error) throw error
}

export async function listAudit({ pageIndex = 0 } = {}) {
  const query = supabase.from('admin_audit').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  const { data, error, count } = await page(query, pageIndex)
  if (error) throw error
  return { rows: data, count: count ?? 0 }
}

/** Saves text as a file the admin downloads — CSV with a BOM so Excel reads Vietnamese. */
export function downloadCsv(filename, rows, columns) {
  const blob = new Blob([String.fromCharCode(0xfeff) + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export async function listApplications(status = 'pending') {
  const { data, error } = await supabase.rpc('admin_list_applications', { p_status: status })
  if (error) throw error
  return { rows: data, count: data.length }
}

/** Approving needs the hotel's id on FoodTrip — the one in its /booking/<id> address. */
export async function reviewApplication(id, approve, hotelPlaceId = null, note = '') {
  const { error } = await supabase.rpc('admin_review_application', { p_application_id: id, p_approve: approve, p_hotel_place_id: hotelPlaceId, p_note: note })
  if (error) throw error
}

export async function listProperties() {
  const { data, error } = await supabase.rpc('admin_list_properties')
  if (error) throw error
  return { rows: data, count: data.length }
}

export async function createProperty(hotelPlaceId, name) {
  const { error } = await supabase.rpc('admin_create_property', { p_hotel_place_id: hotelPlaceId, p_name: name })
  if (error) throw error
}

/** role: 'owner' | 'staff' | 'none' (removes them). */
export async function setPropertyManager(propertyId, email, role) {
  const { error } = await supabase.rpc('admin_set_property_manager', { p_property_id: propertyId, p_email: email, p_role: role })
  if (error) throw error
}

/** The hotel id in a FoodTrip booking link, if the text holds one. */
export function hotelIdFromLink(text) {
  const match = String(text ?? '').match(/\/booking\/([^/?#\s]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}
