# Quyền chức năng FoodTrip

Ngày rà soát: 13/10/2026. Bảng chi tiết có trên `/permissions`, tiếng Việt/Anh,
có lọc chức năng và so sánh vai trò. Dữ liệu bảng ở `src/lib/accessPolicy.js`.

## Mô hình

Có 8 nhóm quyền hiển thị, gồm khách chưa đăng nhập và 7 vai trò khi đăng nhập.
Không có một cột role toàn cục thay thế tất cả quyền:

| Nhóm | Nguồn xác nhận | Phạm vi |
| --- | --- | --- |
| Khách | Không có phiên đăng nhập | Khám phá địa điểm/tour, xem trước 3 bài rút gọn, điền lựa chọn chuyến đi |
| Người dùng | Phiên Supabase | Đơn, lịch trình, thông báo, nội dung của mình |
| Chủ lưu trú | `property_managers.role = owner` | Từng cơ sở được giao |
| Nhân viên lưu trú | `property_managers.role = staff` | Từng cơ sở được giao |
| Chủ tour | `tour_members.role = owner` | Từng đơn vị có trạng thái approved |
| Quản lý tour | `tour_members.role = manager` | Từng đơn vị có trạng thái approved |
| Hướng dẫn viên | `tour_members.role = guide` | Chuyến được phân công tại đơn vị approved |
| Admin | `is_admin()` / `admin_users` | Công cụ quản trị được cấp |

Vai trò cộng dồn. Chủ khách sạn A có thể là nhân viên B, nhưng không được dùng
quyền owner của A tại B. Admin không mặc nhiên được gọi RPC dành riêng cho owner.
Vai trò khai trong metadata đăng ký hay lựa chọn bộ lọc không cấp quyền.
Hồ sơ đối tác pending/rejected không cấp quyền vận hành tour.

## Ranh giới theo chức năng

- Công khai: khám phá, bản đồ, chi tiết địa điểm/tour công bố, đọc đánh giá,
  gửi liên hệ/đăng ký bản tin, xem lịch trình công khai từ link.
- Cộng đồng/video: khách xem trước tối đa 3 bài rút gọn trên giao diện. Xem thêm,
  tìm bài, mở video/bản đồ bài cộng đồng, đọc/bình luận thảo luận cần đăng nhập.
  Không tải thêm trang tiếp theo hoặc subscribe bình luận khi còn là khách.
- Tạo lịch trình: khách điền các lựa chọn được; bấm tạo hoặc dùng nút xuất file
  yêu cầu đăng nhập và giữ lựa chọn đang điền. Không tự gửi hành động đặt chỗ sau login.
- Lưu địa điểm: yêu cầu tài khoản; dữ liệu khách cũ được nhập một lần rồi bỏ bản
  local để không trộn địa điểm tài khoản này vào tài khoản tiếp theo trên cùng thiết bị.
- Đăng nhập: lưu/xoá/chia sẻ lịch trình của mình, bắt đầu hành trình chung, đặt phòng,
  giữ chỗ tour, thanh toán đơn của mình, đăng bài/ảnh/video/bình luận, gửi hồ sơ đối tác.
- Nội dung: người viết sửa/xoá của mình; admin có công cụ gỡ nội dung. Quyền partner
  không cho phép sửa nội dung của khách hay tự thay đổi điểm đánh giá.
- Đánh giá: phải có đơn của mình đủ trạng thái/thời hạn (180 ngày). Partner và admin
  vẫn cần đáp ứng điều kiện khi đánh giá như khách hàng.
- Nhân viên lưu trú: xem đơn, xử lý lưu trú hợp lệ, xem lịch phòng, trả lời đánh giá.
  Không sửa tồn phòng/giá, hồ sơ, tài khoản nhận tiền, nhân sự hoặc báo cáo đối soát.
  Nhân viên vẫn thấy giá đơn và liên hệ khách cần cho công việc.
- Chủ lưu trú: thêm quyền sửa phòng/giá/tồn, thông tin cơ sở, nhân viên và xem đối soát.
  Cơ sở bị đình chỉ không nhận đặt mới; RPC sửa tồn phòng và xử lý lưu trú yêu cầu active.
- Quản lý tour: tạo/sửa/công bố tour, lịch khởi hành, giá/chỗ, phân công guide,
  xử lý giữ chỗ, trả lời đánh giá, xem đối soát trong đơn vị approved của mình.
- Chủ tour: thêm sửa hồ sơ/điều khoản và thêm/gỡ manager/guide. Không tự cấp owner/admin.
- Guide: danh sách chuyến được giao, tên và số khách đã xác nhận. Không xem điện thoại,
  doanh thu, toàn bộ đơn; không sửa giá, lịch tour hay thành viên.
- Admin: duyệt đối tác, phân quyền admin/lưu trú, kiểm duyệt nội dung, quản lý giao dịch,
  hoàn tiền/đối soát, liên hệ, bản tin, tài khoản và nhật ký. Các RPC kiểm tra trạng thái
  và điều kiện nghiệp vụ; không đồng nghĩa được sửa mọi bảng.

## Liên kết chia sẻ và GPS

`/trip/:id` đọc lịch trình còn công khai. `/live/:id?room=…` yêu cầu đăng nhập
trước khi mở giao diện hành trình. Người dùng phải tự bật chia sẻ vị trí và cho phép
trình duyệt định vị. Tên hiển thị trong phòng là tên tự khai.

Từ 13/10/2026, GPS không dùng Presence công khai. Máy chủ tạo link mời đã băm,
kiểm tra auth.uid và membership mỗi lần đọc/ghi; lịch trình có thể giữ riêng tư.
Chủ phòng đổi link, gỡ thành viên hoặc đóng phòng. Link cũ không mời được người mới
sau khi đổi; thành viên đã tham gia vẫn được giữ, trừ khi bị gỡ hoặc phòng đóng.
Vị trí được gửi tối đa mỗi 2 giây, đọc mỗi 3 giây khi kết nối tốt. Chỉ giữ fix cuối;
ẩn sau 15 giây và dọn fix cũ bằng tác vụ mỗi phút. Dừng chia sẻ xóa fix.
Dữ liệu đã xem/tải không thể thu hồi; website không bảo đảm GPS chạy nền khi
điện thoại khóa màn hình hoặc trình duyệt bị hệ điều hành tạm dừng.

## Chốt quyền và giao diện

- `AccessContext` đọc quyền từ máy chủ với user_id hiện tại; không đọc role tự khai.
  Lỗi tải không cấp quyền đặc biệt. Kết quả tài khoản cũ bị bỏ ngay khi đổi tài khoản.
- Trang công khai không bị khởi tạo lại khi đăng nhập để giữ lịch trình đang soạn.
  Trang riêng đổi tài khoản thì khởi tạo lại và tải dữ liệu mới.
- `/saved`, `/trips`, `/live/:id`, `/bookings`, `/pay/:bookingId`, `/partner`, `/partner/tours` yêu cầu đăng nhập.
  Hai cổng partner vẫn cho người dùng thường gửi hồ sơ đăng ký; dữ liệu vận hành
  tiếp tục chịu RLS/RPC. `/admin` cần admin được máy chủ xác nhận.
- Menu desktop/mobile dùng cùng kết quả quyền. Có thể kiểm tra lại ở `/permissions`;
  chuyển focus về cửa sổ cũng tải lại quyền. RPC/RLS kiểm tra lại từng yêu cầu dữ liệu.
- Bảng quyền là hướng dẫn và điều khiển giao diện, không thay thế RLS/RPC phía máy chủ.
- Giao diện khách có thanh mời đăng nhập ở các trang khám phá và tường đăng nhập
  ở cuối phần xem trước. `LoginPromptProvider` mở login/signup tại trang hiện tại,
  tự đóng sau đăng nhập và giữ vị trí/cuộn/lựa chọn. Giới hạn 3 bài là lựa chọn của
  FoodTrip, không phải khẳng định Facebook dùng con số đó.
- Bài công khai và ảnh công khai vẫn public trong cơ sở dữ liệu/storage. Phần rút
  gọn là trải nghiệm giao diện; không phải biến nội dung public thành dữ liệu riêng.
  GPS dùng RPC kiểm tra quyền phía máy chủ; các bảng phòng/thành viên/vị trí
  không cho anon/authenticated truy cập trực tiếp.

## SePay mocktest và chẩn đoán

- Chế độ mock do máy chủ bật rõ ràng, không tự bật vì thiếu khóa thanh toán.
- Thành viên chỉ mô phỏng đơn đang chờ của mình. Không tự gửi số tiền tùy ý;
  giá và nội dung được máy chủ tính từ đơn. Gửi lại cùng request key không cộng tiền lần hai.
- Giao dịch mock không gán vào đơn như tiền thật, không tạo doanh thu/đối soát/hoàn
  tiền thật và không tạo đánh giá khách đã ở. Đơn/giao dịch hiển thị nhãn DEMO/mocktest.
- Admin đọc trạng thái cấu hình, dữ liệu mở bán và tác vụ; API từ chối khách chưa
  đăng nhập hoặc tài khoản không phải admin, không trả giá trị bí mật.

## Nguồn và kiểm tra

Nguồn máy chủ: migrations `auth_backed_tables`, `itinerary_sharing_and_hotels`,
`video_review_ownership`, `community`, `admin`, `admin_actions`, `hotel_partners`,
`room_inventory`, `tour_marketplace`, `ecosystem_function_permissions`,
`partner_onboarding`, `tour_operator_onboarding`, `partner_operations`,
`notifications_jobs_refunds`, `reviews`.

`test/accessPolicy.test.js` kiểm tra guest, đa vai trò theo cơ sở, pending,
guide/manager, admin không tự là owner và lỗi tải quyền. `test/ecosystem.test.js`
thực thi SQL trong PostgreSQL/WASM để kiểm tra chặn khác đơn vị, manager không cấp
vai trò, thu hồi membership và admin không kế thừa owner. Bộ fixture SQL này không
bao phủ tất cả migrations mới và không thay cho chạy đầy đủ UI bằng từng tài khoản.

Đã kiểm tra metadata môi trường Supabase liên kết: 11 RPC đặt chỗ, sửa phòng,
xử lý lưu trú, nhân sự, đánh giá, duyệt/cấp quyền và hoàn tiền đều từ chối EXECUTE
cho anon. authenticated được gọi RPC, nhưng điều kiện role/ownership vẫn do thân
hàm xác minh, không phải mọi người đăng nhập đều có quyền hoàn tất thao tác.
Lượt này không thay đổi quyền tài khoản hay dữ liệu nghiệp vụ trên máy chủ.
