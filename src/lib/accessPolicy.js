// UI policy only. Database RLS/RPC ownership checks remain authoritative.
// A role is scoped to a property/operator; roles are additive, not a hierarchy.
export const ROLES = {
  guest: { vi: 'Khách chưa đăng nhập', en: 'Guest' },
  member: { vi: 'Người dùng', en: 'Member' },
  hotel_owner: { vi: 'Chủ cơ sở lưu trú', en: 'Property owner' },
  hotel_staff: { vi: 'Nhân viên lưu trú', en: 'Property staff' },
  tour_owner: { vi: 'Chủ đơn vị tour', en: 'Tour operator owner' },
  tour_manager: { vi: 'Quản lý tour', en: 'Tour manager' },
  guide: { vi: 'Hướng dẫn viên', en: 'Guide' },
  admin: { vi: 'Quản trị viên', en: 'Administrator' },
}

export function accountRoles(access) {
  if (!access.userId) return ['guest']
  const roles = new Set(['member'])
  if (access.status !== 'ready') return [...roles]
  if (access.admin === true) roles.add('admin')
  for (const p of access.properties ?? []) {
    if (p.role === 'owner') roles.add('hotel_owner')
    if (p.role === 'staff') roles.add('hotel_staff')
  }
  for (const o of access.operators ?? []) {
    if (o.status !== 'approved') continue
    if (o.role === 'owner') roles.add('tour_owner')
    if (o.role === 'manager') roles.add('tour_manager')
    if (o.role === 'guide') roles.add('guide')
  }
  return [...roles]
}

// Omit the scope only for navigation. Actions on a resource must pass its ID.
export function canAccess(access, capability, scope = {}) {
  if (capability === 'public') return true
  if (!access.userId) return false
  if (capability === 'account') return true
  if (access.status !== 'ready') return false
  if (capability === 'admin') return access.admin === true
  const properties = (access.properties ?? []).filter((p) => !scope.propertyId || p.id === scope.propertyId)
  const operators = (access.operators ?? []).filter((o) => o.status === 'approved' && (!scope.operatorId || o.id === scope.operatorId))
  const hotel = (roles, active = false) => properties.some((p) => roles.includes(p.role) && (!active || p.active === true))
  const tour = (roles) => operators.some((o) => roles.includes(o.role))
  switch (capability) {
    case 'hotel.portal': return hotel(['owner', 'staff'])
    case 'hotel.fulfillment': return hotel(['owner', 'staff'], true)
    case 'hotel.inventory': return hotel(['owner'], true)
    case 'hotel.profile':
    case 'hotel.team': return hotel(['owner'])
    case 'tour.portal': return tour(['owner', 'manager', 'guide'])
    case 'tour.manage': return tour(['owner', 'manager'])
    case 'tour.profile':
    case 'tour.team': return tour(['owner'])
    case 'tour.manifest': return tour(['guide'])
    default: return false
  }
}

const everyone = Object.keys(ROLES)
const members = everyone.filter((r) => r !== 'guest')
const grant = (roles, code = 'yes') => Object.fromEntries(roles.map((r) => [r, code]))
const customer = (code = 'own') => grant(members, code)
const hotel = ['hotel_owner', 'hotel_staff']
const tour = ['tour_owner', 'tour_manager']
const feature = (id, group, vi, en, grants, noteVi, noteEn) => ({ id, group, label: { vi, en }, grants, note: { vi: noteVi, en: noteEn } })

export const ACCESS_LEVELS = {
  yes: { vi: 'Được dùng', en: 'Allowed' },
  preview: { vi: 'Xem trước', en: 'Preview' },
  no: { vi: 'Không được', en: 'Not allowed' },
  own: { vi: 'Của mình', en: 'Own records' },
  local: { vi: 'Trên thiết bị', en: 'On this device' },
  invite: { vi: 'Có liên kết', en: 'With a link' },
  property: { vi: 'Cơ sở được giao', en: 'Assigned property' },
  operator: { vi: 'Đơn vị được giao', en: 'Assigned operator' },
  assigned: { vi: 'Đoàn được giao', en: 'Assigned groups' },
  eligible: { vi: 'Đơn đủ điều kiện', en: 'Eligible own order' },
  admin: { vi: 'Toàn hệ thống', en: 'Platform scope' },
}

export const FEATURE_GROUPS = {
  discover: { vi: 'Khám phá & lịch trình', en: 'Explore & plan' },
  personal: { vi: 'Tài khoản & cộng đồng', en: 'Account & community' },
  hotel: { vi: 'Vận hành lưu trú', en: 'Property operations' },
  tour: { vi: 'Vận hành tour', en: 'Tour operations' },
  admin: { vi: 'Quản trị hệ thống', en: 'Administration' },
}

export const FEATURES = [
  feature('browse', 'discover', 'Khám phá, bản đồ, địa điểm, tour công khai', 'Explore, maps, places, published tours', grant(everyone), 'Thông tin địa điểm và tour công khai vẫn được xem. Có lời mời đăng nhập khi khám phá.', 'Public place and tour information remains accessible, with a sign-in invitation.'),
  feature('feed', 'personal', 'Xem bảng tin, video & thảo luận cộng đồng', 'Browse stories, videos & discussions', { ...grant(members), guest: 'preview' }, 'Khách xem trước 3 bài và nội dung rút gọn; đăng nhập để xem thêm, tìm bài, mở video/bản đồ bài viết và thảo luận.', 'Guests preview 3 shortened posts; sign in for more, search, post videos/maps and discussions.'),
  feature('contact', 'personal', 'Gửi liên hệ & đăng ký bản tin', 'Send an enquiry & subscribe to updates', grant(everyone), 'Không cho phép xem danh sách liên hệ hoặc email của người khác.', 'Does not grant access to other people’s enquiries or email addresses.'),
  feature('plan', 'discover', 'Tạo lịch trình, xem tuyến đường & thời tiết', 'Plan trips, routes & weather', grant(members), 'Khách được điền lựa chọn xem trước; đăng nhập khi bấm tạo lịch trình. Lựa chọn đang điền được giữ.', 'Guests can fill in preferences; generating requires login. Selections are preserved.'),
  feature('export', 'discover', 'Xuất lịch trình Excel / PDF', 'Export itinerary to Excel / PDF', grant(members), 'Đăng nhập để dùng nút xuất lịch trình; dữ liệu riêng của người khác không được mở.', 'Sign in to export through the app; other users’ private trips are not accessible.'),
  feature('saved', 'discover', 'Lưu địa điểm yêu thích', 'Save favourite places', customer(), 'Bấm lưu khi chưa đăng nhập sẽ mở hộp đăng nhập. Địa điểm đã lưu gắn với tài khoản.', 'Saving prompts guests to sign in. Favourites belong to the account.'),
  feature('trip', 'discover', 'Lưu, sửa, xoá lịch trình & bật/tắt chia sẻ', 'Save, edit, delete trips & manage sharing', customer(), 'Chỉ chủ lịch trình quản lý. Admin không tự có quyền sửa lịch trình riêng.', 'Only the trip owner manages it. Admins do not automatically edit private trips.'),
  feature('shared', 'discover', 'Xem lịch trình được chia sẻ', 'View shared trips', grant(everyone, 'invite'), 'Lịch trình phải còn công khai.', 'The itinerary must still be public.'),
  feature('liveCreate', 'discover', 'Bắt đầu hành trình chung', 'Start a live group trip', customer(), 'Tạo liên kết từ lịch trình của mình.', 'Create a link from your own itinerary.'),
  feature('liveJoin', 'discover', 'Tham gia hành trình & chia sẻ GPS', 'Join a live trip & share GPS', grant(members, 'invite'), 'Cần đăng nhập và link mời còn hiệu lực. Máy chủ kiểm tra thành viên từng yêu cầu; không buộc công khai lịch trình. Chủ phòng đổi link, gỡ thành viên hoặc đóng phòng. GPS phải tự bật.', 'Requires login and a valid invite. The server checks membership on every request; the trip can remain private. Owners rotate invites, remove members or close rooms. GPS is opt-in.'),
  feature('book', 'personal', 'Đặt phòng / giữ chỗ tour', 'Book rooms / reserve tours', customer(), 'Theo phòng/chỗ còn trống và giá xác nhận. Giữ chỗ tour chưa phải thanh toán tour.', 'Subject to availability and confirmed prices. Tour reservations are not tour payments.'),
  feature('orders', 'personal', 'Xem đơn cá nhân, thanh toán & yêu cầu huỷ', 'Own orders, payments & cancellations', customer(), 'Chỉ đơn của mình; huỷ và hoàn tiền phụ thuộc trạng thái, thời hạn, chính sách.', 'Own orders only; cancellation/refund eligibility depends on status, deadlines and policy.'),
  feature('mockPayment', 'personal', 'Thử thanh toán SePay mocktest', 'Test SePay payment', customer('eligible'), 'Chỉ đơn chờ thanh toán của mình và khi máy chủ bật chế độ mock. Không chuyển tiền thật; đơn DEMO không được đối soát/hoàn tiền thật hoặc tạo đánh giá khách đã ở.', 'Only your own pending booking while server mock mode is enabled. No real funds; DEMO orders cannot receive real payouts/refunds or verified-stay reviews.'),
  feature('post', 'personal', 'Đăng bài, ảnh, video quán & bình luận', 'Publish posts, photos, videos & comments', customer(), 'Sửa/xoá nội dung của mình. Admin có công cụ gỡ nội dung riêng.', 'Edit/delete your own content. Admins have separate moderation tools.'),
  feature('review', 'personal', 'Đánh giá khách sạn / tour đã trải nghiệm', 'Review a completed stay / tour', customer('eligible'), 'Phải là khách của đơn đủ điều kiện, trong 180 ngày. Vai trò đối tác/admin không bỏ qua điều kiện này.', 'Requires an eligible own order within 180 days. Partner/admin roles do not bypass this.'),
  feature('notifications', 'personal', 'Xem và đánh dấu thông báo', 'Read and mark notifications', customer(), 'Thông báo gửi riêng đến tài khoản.', 'Only notifications addressed to your account.'),
  feature('apply', 'personal', 'Gửi hồ sơ đăng ký đối tác', 'Apply to become a partner', customer(), 'Hồ sơ chờ duyệt chưa có quyền vận hành. Được duyệt hoặc được chủ đơn vị mời mới nhận vai trò.', 'Pending applications grant no operational permissions. Approval or assignment is required.'),
  feature('hotelOrders', 'hotel', 'Xem đơn & xác nhận / nhận / trả phòng', 'View stays & confirm / check in / complete', grant(hotel, 'property'), 'Chỉ cơ sở được giao, đang hoạt động; theo trạng thái đơn. Không tự xác nhận đã thu tiền.', 'Assigned active property only, subject to order state. Does not mark payment received.'),
  feature('hotelInventoryRead', 'hotel', 'Xem loại phòng & lịch phòng', 'View room types & inventory', { ...grant(hotel, 'property'), admin: 'admin' }, 'Nhân viên được xem; chỉ chủ cơ sở đang hoạt động được sửa.', 'Staff can read; only owners of active properties can edit.'),
  feature('hotelInventoryWrite', 'hotel', 'Sửa phòng, giá, số lượng, mở/đóng bán', 'Edit rooms, rates, quantities & sales', grant(['hotel_owner'], 'property'), 'Cơ sở phải đang hoạt động. Không được giảm số lượng dưới chỗ khách đã giữ.', 'Property must be active. Cannot reduce stock below existing reservations.'),
  feature('hotelProfile', 'hotel', 'Sửa hồ sơ, ảnh, chính sách & tài khoản nhận tiền', 'Edit listing, photos, policies & payout account', grant(['hotel_owner'], 'property'), 'Chỉ chủ cơ sở tương ứng.', 'Only the owner of that property.'),
  feature('hotelTeam', 'hotel', 'Thêm / gỡ nhân viên khách sạn', 'Add / remove property staff', grant(['hotel_owner'], 'property'), 'Chủ chỉ quản lý staff; cấp/chuyển quyền owner qua quản trị viên.', 'Owners manage staff; owner assignment is an admin action.'),
  feature('hotelMoney', 'hotel', 'Xem đối soát của khách sạn', 'View property settlements', { ...grant(['hotel_owner'], 'property'), admin: 'admin' }, 'Nhân viên không có quyền báo cáo đối soát; vẫn thấy giá đơn phục vụ vận hành.', 'Staff cannot read settlement reports; operational order prices remain visible.'),
  feature('hotelReply', 'hotel', 'Trả lời đánh giá khách sạn', 'Reply to property reviews', grant(hotel, 'property'), 'Không sửa điểm hoặc nội dung khách viết.', 'Cannot change a guest’s rating or review text.'),
  feature('tourManage', 'tour', 'Tạo/sửa tour, lịch khởi hành, giá & nhận đơn', 'Manage tours, departures, prices & reservations', grant(tour, 'operator'), 'Đơn vị được duyệt; chỉ tour của đơn vị được giao.', 'Approved operator only; limited to assigned operator’s tours.'),
  feature('tourProfile', 'tour', 'Sửa hồ sơ đơn vị & chấp nhận điều khoản', 'Edit operator profile & accept terms', grant(['tour_owner'], 'operator'), 'Quản lý tour không có quyền thay chủ chấp nhận điều khoản.', 'Managers cannot accept terms on the owner’s behalf.'),
  feature('tourTeam', 'tour', 'Thêm / gỡ quản lý & hướng dẫn viên', 'Add / remove managers & guides', grant(['tour_owner'], 'operator'), 'Không tự cấp thêm owner hoặc admin.', 'Cannot create another owner or an admin.'),
  feature('tourMoney', 'tour', 'Xem đối soát đơn vị tour', 'View operator settlements', { ...grant(tour, 'operator'), admin: 'admin' }, 'Chủ và quản lý tour được xem; hướng dẫn viên không được xem.', 'Owners and managers can read; guides cannot.'),
  feature('tourReply', 'tour', 'Trả lời đánh giá tour', 'Reply to tour reviews', grant(tour, 'operator'), 'Chỉ đánh giá tour của đơn vị mình.', 'Only reviews for your operator’s tours.'),
  feature('manifest', 'tour', 'Xem danh sách đoàn hướng dẫn', 'View guide manifests', grant(['guide'], 'assigned'), 'Chỉ chuyến được phân công: tên khách và số người; không có SĐT, doanh thu hay toàn bộ đơn.', 'Assigned departures only: guest names and headcounts, without phones, revenue or all orders.'),
  feature('moderate', 'admin', 'Kiểm duyệt bài viết, video & đánh giá', 'Moderate posts, videos & reviews', grant(['admin'], 'admin'), 'Gỡ nội dung, ẩn/khôi phục đánh giá; không viết lại nội dung thay tác giả.', 'Remove content, hide/restore reviews; not edit an author’s words.'),
  feature('inspectOrders', 'admin', 'Tra cứu đơn lưu trú / tour toàn hệ thống', 'Inspect platform-wide stay / tour orders', grant(['admin'], 'admin'), 'Quyền tra cứu phục vụ quản trị; không tự có quyền xử lý nhận/trả phòng hay nhân sự của đối tác.', 'Administrative read access does not grant partner check-in/out or staffing permissions.'),
  feature('approve', 'admin', 'Duyệt đối tác, cấp vai trò, đình chỉ cơ sở', 'Approve partners, assign roles, suspend properties', grant(['admin'], 'admin'), 'Người dùng không tự chọn vai trò đặc quyền khi đăng ký.', 'Users cannot choose privileged roles during signup.'),
  feature('finance', 'admin', 'Đối soát giao dịch, ghi nhận hoàn tiền / thanh toán', 'Reconcile transactions, record refunds / settlements', grant(['admin'], 'admin'), 'Thao tác theo trạng thái hợp lệ, có nhật ký. Ghi nhận không thay thế giao dịch ngân hàng.', 'Valid transitions and audit logs apply. Recording a transfer does not send bank funds.'),
  feature('support', 'admin', 'Quản lý liên hệ, bản tin, tài khoản & nhật ký', 'Manage contacts, newsletter, accounts & audit logs', grant(['admin'], 'admin'), 'Quyền quản trị được máy chủ xác nhận.', 'Administrator access is verified by the server.'),
  feature('system', 'admin', 'Kiểm tra trạng thái hệ thống', 'Check system readiness', grant(['admin'], 'admin'), 'Chỉ đọc trạng thái cấu hình và tác vụ. Không hiển thị khóa bí mật; không thay thế kiểm thử thực tế.', 'Read-only configuration and job status. No secret values; not a substitute for end-to-end tests.'),
]
