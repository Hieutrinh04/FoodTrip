import { supabase } from './supabaseClient.js'

export async function tourRpc(name, args = {}) {
  if (!supabase) throw new Error('no-supabase')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}
export async function tourRows(table) {
  if (!supabase) throw new Error('no-supabase')
  const { data, error } = await supabase.from(table).select('*').limit(1000)
  if (error) throw error
  return data
}
export const TOUR_STATUS = {
  requested: { vi: 'Chờ đối tác xác nhận', en: 'Awaiting operator' },
  confirmed: { vi: 'Đã xác nhận chỗ', en: 'Confirmed' },
  cancelled: { vi: 'Đã hủy', en: 'Cancelled' },
  completed: { vi: 'Đã hoàn thành', en: 'Completed' },
}
export const tourStatusLabel = (status, lang = 'vi') => TOUR_STATUS[status]?.[lang] ?? status
export const tourMoney = (n) => Number(n).toLocaleString('vi-VN') + 'đ'
export const tourDate = (s, lang = 'vi') => new Date(s).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })

const TOUR_ERRORS = {
  'PGRST202': ['Tính năng tour đang chờ kích hoạt trên hệ thống. Bạn vẫn có thể sử dụng lịch trình tự túc.', 'Tours are not switched on yet. You can still plan the trip on your own.'],
  '42P01': ['Cổng tour chưa được kích hoạt trên cơ sở dữ liệu. Vui lòng liên hệ quản trị viên.', 'The tour portal is not set up in the database yet. Please contact an administrator.'],
  '23505': ['Yêu cầu hoặc thành viên đã tồn tại. Kiểm tra danh sách trước khi gửi lại.', 'That request or member already exists. Check the list before sending again.'],
  'tour-sold-out': ['Chuyến này vừa hết chỗ. Hãy tải lại danh sách.', 'This departure just sold out. Reload the list.'],
  'price-changed': ['Giá đã thay đổi. Hãy tải lại trước khi đặt.', 'The price changed. Reload before reserving.'],
  'departure-unavailable': ['Chuyến này không còn nhận yêu cầu đặt chỗ.', 'This departure no longer takes reservations.'],
  'account-not-found': ['Email này chưa có tài khoản FoodTrip.', 'There is no FoodTrip account with this email.'],
  'owners-only': ['Chỉ chủ đơn vị được thêm thành viên.', 'Only the owner can add members.'],
  'not-your-operator': ['Bạn không có quyền quản lý đơn vị này hoặc đơn vị chưa được duyệt.', 'You cannot manage this operator, or it is not approved yet.'],
  'note-required': ['Vui lòng ghi lý do hủy cho khách.', 'Please give the guest a reason.'],
  'transition-not-allowed': ['Không thể đổi trạng thái này hoặc đã quá thời hạn.', 'That status change is not allowed, or it is too late.'],
  'invalid-photo-type': ['Chỉ nhận ảnh JPG, PNG hoặc WebP.', 'Only JPG, PNG or WebP photos.'],
  'photo-too-large': ['Ảnh tối đa 3 MB.', 'Photos are limited to 3 MB.'],
  'terms-required': ['Hãy đồng ý điều khoản đối tác tour.', 'Please accept the tour partner terms.'],
  'cities-required': ['Chọn ít nhất một tỉnh / thành phố hoạt động.', 'Choose at least one city you operate in.'],
  'tour-incomplete': ['Tour chưa đủ thông tin để công bố — hoàn thành các mục còn trống trong danh sách kiểm tra.', 'The tour is not ready to publish — complete the open items on the checklist.'],
  'invalid-photo-url': ['Ảnh phải là đường dẫn https hoặc được tải lên từ máy.', 'Photos must be an https link or uploaded from your device.'],
  'tour-not-found': ['Tour này không còn mở bán.', 'This tour is no longer on sale.'],
  'invalid-dates': ['Ngày khởi hành phải ở tương lai, ngày kết thúc phải sau khởi hành.', 'The start must be in the future and the end after the start.'],
  'unpublish-before-edit': ['Hãy ẩn tour trước khi sửa thông tin cơ bản.', 'Unpublish the tour before editing its basics.'],
  'tour-has-reservations': ['Tour đã có lịch sử đặt chỗ. Hãy tạo tour mới để giữ nguyên thông tin của đơn cũ.', 'This tour has reservations. Create a new tour so past bookings keep their details.'],
  'departure-dates-locked': ['Lịch khởi hành đã có đơn đặt nên không thể đổi giờ. Hãy tạo lịch khởi hành khác.', 'This departure has bookings, so its times cannot change. Create another departure.'],
  'capacity-below-reserved': ['Số chỗ mới không được thấp hơn số chỗ khách đã giữ.', 'Capacity cannot go below the seats already reserved.'],
}

export function tourError(e, lang = 'vi') {
  const i = lang === 'vi' ? 0 : 1
  const hit = TOUR_ERRORS[e?.code] ?? Object.entries(TOUR_ERRORS).find(([key]) => e?.message?.includes(key))?.[1]
  return hit?.[i] ?? (lang === 'vi'
    ? 'Chưa thực hiện được. Kiểm tra kết nối, quyền truy cập và migration tour; sau đó thử lại.'
    : 'That did not work. Check your connection and access, then try again.')
}

export * from './tourTrip.js'

/** Whether the user belongs to any tour operator — for the account menu link. */
export async function isTourMember(userId) {
  if (!supabase || !userId) return false
  const { count, error } = await supabase.from('tour_members').select('user_id', { count: 'exact', head: true }).eq('user_id', userId)
  return !error && (count ?? 0) > 0
}

/** The full tour page — photos, programme, inclusions, policies, open departures. */
export async function tourDetail(tourId) {
  const data = await tourRpc('tour_detail', { p_tour: tourId })
  if (!data) throw Object.assign(new Error('tour-not-found'), { code: 'tour-not-found' })
  return data
}

/** Saves the tour page content an operator edits in the partner portal. */
export function updateTourDetails(tourId, details) {
  return tourRpc('tour_update_details', { p_tour: tourId, p_details: details })
}

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Uploads one photo to the operator's folder and returns its public address. */
export async function uploadTourPhoto(operatorId, file) {
  const ext = PHOTO_TYPES[file.type]
  if (!ext) throw Object.assign(new Error('invalid-photo-type'), { code: 'invalid-photo-type' })
  if (file.size > 3 * 1024 * 1024) throw Object.assign(new Error('photo-too-large'), { code: 'photo-too-large' })
  const path = `${operatorId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('tour-photos').upload(path, file, { contentType: file.type })
  if (error) throw error
  return supabase.storage.from('tour-photos').getPublicUrl(path).data.publicUrl
}

/** A tour operator's sign-up: the operator, its contact and papers, and the tour terms accepted. */
export function applyAsOperator(details) {
  return tourRpc('tour_apply_details', { p: details })
}

/** The approved operator's profile, as travellers see it. */
export function updateOperatorProfile(operatorId, profile) {
  return tourRpc('tour_operator_update_profile', { p_operator: operatorId, p: profile })
}

export function acceptTourTerms(operatorId, version) {
  return tourRpc('tour_accept_terms', { p_operator: operatorId, p_version: version })
}

/** A tour's publish checklist: { operator, photos, summary, schedule, includes, cancel_policy, departure } → true/false. */
export async function tourReadiness(tourId) {
  return (await tourRpc('tour_readiness', { p_tour: tourId })) ?? {}
}

export const OPERATOR_TYPES = {
  food_tour: { vi: 'Food tour', en: 'Food tours' },
  experience: { vi: 'Tour trải nghiệm', en: 'Experiences' },
  travel_agency: { vi: 'Công ty lữ hành', en: 'Travel agency' },
  freelance_guide: { vi: 'Hướng dẫn viên tự do', en: 'Freelance guide' },
}

/** The operator's commission: unsettled (owed to FoodTrip), upcoming, past settlements. */
export function operatorStatement(operatorId) {
  return tourRpc('operator_statement', { p_operator: operatorId })
}
