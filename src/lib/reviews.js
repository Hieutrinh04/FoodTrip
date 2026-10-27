import { supabase, hasSupabase } from './supabaseClient.js'

// Reviews after a stay or a tour. Everything goes through database functions:
// only the guest who stayed or went can review (after check-out / after the
// tour), partners answer, admins hide. See migration 20261005090000_reviews.

async function rpc(name, args = {}) {
  if (!hasSupabase) throw new Error('no-supabase')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

/** { rating, review_count, breakdown, items } for a hotel ('stay', hotel id) or a tour ('tour', tour id). */
export function reviewsFor(kind, target, { limit = 10, offset = 0 } = {}) {
  return rpc('reviews_for', { p_kind: kind, p_target: String(target), p_limit: limit, p_offset: offset })
}

/** Writes or rewrites the caller's review of their own booking ('stay') or tour reservation ('tour'). */
export function submitReview(kind, ref, rating, comment) {
  return rpc('submit_review', { p_kind: kind, p_ref: ref, p_rating: rating, p_comment: comment?.trim() || null })
}

/** The caller's reviews, as a map from booking / reservation id to review. */
export async function myReviews() {
  const rows = (await rpc('my_reviews')) ?? []
  return new Map(rows.map((review) => [review.booking_id ?? review.reservation_id, review]))
}

/** A property's ('stay', property id) or an operator's ('tour', operator id) reviews, hidden ones included. */
export function partnerReviews(kind, ownerId) {
  return rpc('partner_reviews', { p_kind: kind, p_owner: ownerId })
}

export function replyToReview(reviewId, reply) {
  return rpc('review_reply', { p_review: reviewId, p_reply: reply })
}

export function adminListReviews() {
  return rpc('admin_list_reviews')
}

export function adminSetReviewHidden(reviewId, hidden, note) {
  return rpc('admin_set_review_hidden', { p_review: reviewId, p_hidden: hidden, p_note: note ?? null })
}

const TODAY = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

/** Whether a booking can be reviewed now (the database decides; this only decides whether to offer it). */
export function stayReviewable(b) {
  return b.payment_status === 'paid'
    && b.payment_txn_ref !== 'DEMO'
    && (b.fulfillment_status === 'completed' || (['confirmed', 'checked_in'].includes(b.fulfillment_status) && b.check_out <= TODAY()))
}

export function tourReviewable(r) {
  return r.status === 'completed' || (r.status === 'confirmed' && new Date(r.ends_at) <= new Date())
}

const ERRORS = {
  'mock-booking-not-reviewable': ['Đơn thanh toán thử không thể tạo đánh giá khách đã ở.', 'Test payments cannot create verified-stay reviews.'],
  'not-reviewable-yet': ['Chỉ đánh giá được sau khi trả phòng hoặc sau khi tour kết thúc.', 'You can review after check-out or after the tour ends.'],
  'review-window-closed': ['Đã quá 180 ngày kể từ chuyến đi nên không đánh giá được nữa.', 'Reviews close 180 days after the trip.'],
  'invalid-rating': ['Hãy chọn từ 1 đến 5 sao.', 'Choose 1 to 5 stars.'],
  'comment-too-long': ['Nhận xét tối đa 2000 ký tự.', 'Reviews are limited to 2000 characters.'],
  'reply-too-long': ['Câu trả lời tối đa 1000 ký tự.', 'Replies are limited to 1000 characters.'],
  'note-required': ['Hãy ghi lý do (ít nhất 3 ký tự).', 'Give a reason (at least 3 characters).'],
  'not-your': ['Bạn không có quyền với đánh giá này.', 'You do not have access to this review.'],
}

export function reviewError(error, lang = 'vi') {
  const key = Object.keys(ERRORS).find((k) => String(error?.message ?? '').includes(k))
  const pick = key ? ERRORS[key] : ['Chưa thực hiện được, thử lại sau.', 'That did not work — try again.']
  return lang === 'vi' ? pick[0] : pick[1]
}
