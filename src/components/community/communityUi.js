import { useLanguage } from '../../i18n/LanguageContext.jsx'

export function useCommunityText() {
  const { lang } = useLanguage()
  return (vi, en) => lang === 'vi' ? vi : en
}
export function communityError(error, t) {
  const messages = {
    'auth-required': ['Vui lòng đăng nhập để tiếp tục. Bản nháp vẫn được giữ.', 'Please log in to continue. Your draft is preserved.'],
    'permission-denied': ['Bạn không có quyền thay đổi nội dung này. Hãy kiểm tra tài khoản đăng nhập.', 'You cannot change this content. Check your signed-in account.'],
    'invalid-content': ['Kiểm tra tên hiển thị, nội dung, tên địa điểm và địa chỉ.', 'Check your display name, text, place name and address.'],
    'invalid-location': ['Chọn địa điểm hoặc nhập đúng vĩ độ (-90…90), kinh độ (-180…180).', 'Choose a place or enter valid latitude (-90…90) and longitude (-180…180).'],
    'invalid-photo': ['Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB/ảnh và 4 ảnh/bài. Ảnh phải đọc được.', 'Choose readable JPG, PNG or WebP images, up to 10 MB each and 4 per post.'],
    'rate-limit': ['Bạn đang đăng quá nhanh. Vui lòng chờ một phút rồi thử lại.', 'You are posting too quickly. Please wait a minute and retry.'],
    'not-found': ['Bài viết không tồn tại hoặc đã bị xóa.', 'This post does not exist or was deleted.'],
  }
  return t(...(messages[error?.message] || ['Chưa hoàn tất được. Kiểm tra kết nối và thử lại; bản nháp vẫn được giữ.', 'Could not complete the request. Check your connection and retry; your draft is preserved.']))
}
export function readCommunityName(user) {
  if (!user) return ''
  try { return localStorage.getItem(`ft-community-name:${user.id}`) || '' } catch { return '' }
}
export function rememberCommunityName(user, name) {
  if (!user) return
  try { localStorage.setItem(`ft-community-name:${user.id}`, name.trim()) } catch { /* Storage is optional. */ }
}
