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
export const TOUR_STATUS = { requested: 'Chờ đối tác xác nhận', confirmed: 'Đã xác nhận chỗ', cancelled: 'Đã hủy', completed: 'Đã hoàn thành' }
export const tourMoney = (n) => Number(n).toLocaleString('vi-VN') + 'đ'
export const tourDate = (s) => new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })
export function tourError(e) {
  const errors = {
    'PGRST202': 'Tính năng tour đang chờ kích hoạt trên hệ thống. Bạn vẫn có thể sử dụng lịch trình tự túc.',
    '42P01': 'Cổng tour chưa được kích hoạt trên cơ sở dữ liệu. Vui lòng liên hệ quản trị viên.',
    '23505': 'Yêu cầu hoặc thành viên đã tồn tại. Kiểm tra danh sách trước khi gửi lại.',
    'tour-sold-out': 'Chuyến này vừa hết chỗ. Hãy tải lại danh sách.',
    'price-changed': 'Giá đã thay đổi. Hãy tải lại trước khi đặt.',
    'departure-unavailable': 'Chuyến này không còn nhận yêu cầu đặt chỗ.',
    'account-not-found': 'Email này chưa có tài khoản FoodTrip.',
    'owners-only': 'Chỉ chủ đơn vị được thêm thành viên.',
    'not-your-operator': 'Bạn không có quyền quản lý đơn vị này hoặc đơn vị chưa được duyệt.',
    'note-required': 'Vui lòng ghi lý do hủy cho khách.',
    'transition-not-allowed': 'Không thể đổi trạng thái này hoặc đã quá thời hạn.',
    'invalid-photo-type': 'Chỉ nhận ảnh JPG, PNG hoặc WebP.',
    'photo-too-large': 'Ảnh tối đa 3 MB.',
    'terms-required': 'Hãy đồng ý điều khoản đối tác tour.',
    'cities-required': 'Chọn ít nhất một tỉnh / thành phố hoạt động.',
    'tour-incomplete': 'Tour chưa đủ thông tin để công bố — hoàn thành các mục còn trống trong danh sách kiểm tra.',
    'invalid-photo-url': 'Ảnh phải là đường dẫn https hoặc được tải lên từ máy.',
    'tour-not-found': 'Tour này không còn mở bán.',
    'invalid-dates': 'Ngày khởi hành phải ở tương lai, ngày kết thúc phải sau khởi hành.',
    'unpublish-before-edit': 'Hãy ẩn tour trước khi sửa thông tin cơ bản.',
    'tour-has-reservations': 'Tour đã có lịch sử đặt chỗ. Hãy tạo tour mới để giữ nguyên thông tin của đơn cũ.',
    'departure-dates-locked': 'Lịch khởi hành đã có đơn đặt nên không thể đổi giờ. Hãy tạo lịch khởi hành khác.',
    'capacity-below-reserved': 'Số chỗ mới không được thấp hơn số chỗ khách đã giữ.',
  }
  return errors[e?.code] ?? Object.entries(errors).find(([key]) => e?.message?.includes(key))?.[1]
    ?? 'Chưa thực hiện được. Kiểm tra kết nối, quyền truy cập và migration tour; sau đó thử lại.'
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
