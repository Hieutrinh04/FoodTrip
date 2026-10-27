# FoodTrip — trạng thái hoàn thiện ngày 13/10/2026

Chưa chuyển sang train AI. Đây là bằng chứng triển khai/kiểm thử, không phải
khẳng định toàn bộ website đã sẵn sàng nhận khách hoặc thanh toán thật.

## Đã triển khai trong đợt này

- Phòng GPS riêng: chủ lịch trình tạo phòng máy chủ, token mời được băm;
  từng RPC kiểm tra tài khoản/thành viên/phòng còn mở. Không tự công khai lịch
  trình khi bắt đầu hành trình; không gửi vị trí qua Presence công khai.
- Chủ phòng đổi link, gỡ thành viên, đóng phòng. Chia sẻ vị trí do người dùng
  tự bật và cấp quyền trên trình duyệt. Dừng chia sẻ xóa fix; mỗi người chỉ giữ
  fix cuối, ẩn sau 15 giây, dọn sau một phút bằng job mỗi phút (thực tế có thể
  gần hai phút tùy thời điểm job). Phòng hết hạn sau 15 ngày, tối đa 50 người.
- Gửi fix tối đa mỗi 2 giây, đọc trạng thái mỗi 3 giây khi mạng tốt; không gắn
  timestamp mới vào fix GPS cũ. Poll thành viên không tái dựng lịch trình/tuyến
  bản đồ khi dữ liệu chuyến đi chưa thay đổi. Không bảo đảm chạy nền khi máy
  khóa màn hình hoặc trình duyệt bị hệ điều hành dừng.
- SePay **mocktest nội bộ**, không phải giao dịch ngân hàng hay xác nhận đã
  kiểm thử sandbox do SePay vận hành. Chế độ được bật rõ ràng trong cấu hình DB,
  không tự bật khi thiếu khóa; frontend không nhận QR/tài khoản thật ở chế độ mock.
- Mô phỏng đúng tiền, thiếu 1.000đ, nộp phần còn thiếu, sai nội dung, sai tài khoản,
  gửi lại giao dịch. Chỉ đơn đang chờ của chính tài khoản; số tiền do máy chủ tính.
- Mock và webhook thật dùng cùng xử lý biên nhận nguyên tử: lỗi lưu rollback;
  giao dịch trùng không cộng lần hai; tiền từng phần đã cộng không gán sang đơn
  khác. Mock được tách bằng provider/ID âm; đơn gắn DEMO.
- Đơn DEMO không vào doanh thu thực, đối soát/hoàn tiền thực hoặc đánh giá khách
  đã ở. Thông báo và giao diện khách/đối tác/admin có nhãn thử. Bỏ lối xác nhận
  demo cũ từ VNPay khi thiếu cấu hình.
- Admin có mục Trạng thái hệ thống: SePay, GPS, email, tác vụ, số cơ sở mở bán
  và tour xuất bản. Chỉ đọc, kiểm tra admin cả Edge/SQL, không trả khóa bí mật.
- Bảng quyền và tài liệu quyền đã cập nhật theo cơ chế máy chủ mới.

## Bằng chứng kiểm thử

- `npm test`: 113/113 kiểm thử qua; `npm run lint` và `npm run build` qua.
  Build vẫn cảnh báo bundle bản đồ lớn; chưa chứng nhận tốc độ trên mọi thiết bị.
- PostgreSQL/WASM: chủ sở hữu, thành viên, anon, admin; thu hồi quyền; vị trí
  cũ/dọn dữ liệu; mock bật/tắt; tiền thiếu/lặp/sai; rollback khi lỗi lưu;
  chống tái dùng tiền từng phần; doanh thu không tính DEMO; cấm đánh giá đơn mock.
- `test/runtimeRemoteRollback.sql` chạy trên schema Supabase đang liên kết:
  tạo fixture tạm trong transaction; đặt phòng qua kho thật; trả thiếu/bù/lặp;
  trigger thông báo ghi nhãn mock; đọc GPS phải có membership; gỡ người mất quyền;
  người thường không đọc chẩn đoán admin. Tất cả fixture/thông báo rollback.
  Sequence mock có thể tiêu thụ ID, nhưng không giữ đơn/tài khoản thử.
- HTTP máy chủ: kiểm tra SePay trả `status: mock`; anon không được tạo phòng,
  mô phỏng thanh toán, đọc chẩn đoán admin; webhook không có API key bị từ chối.
- Browser local: `/permissions` hiển thị; `/pay/:id`, `/admin` yêu cầu đăng nhập.
  Không đăng nhập bằng tài khoản của người dùng, không gửi email hoặc cấp GPS
  trong kiểm thử. UI đăng nhập đầy đủ và GPS giữa hai điện thoại chưa được chứng nhận.

## Trạng thái máy chủ sau triển khai

- Migration mới: `20261013090000`, `20261013100000`, `20261013110000` đã áp dụng.
- Bốn Edge Functions cập nhật: `sepay-create-payment`, `sepay-webhook`,
  `vnpay-create-payment`, `system-readiness`. Không deploy chức năng không liên quan.
- SePay mock đã bật theo yêu cầu. 7 job FoodTrip đang active, gồm dọn GPS.
- Snapshot: 0 đơn đặt phòng, 0 phòng hành trình còn lưu, 0 cơ sở đã bật kho
  phòng, 0 tour xuất bản từ đối tác được duyệt. Không để lại danh mục QA giả.
- Vite local tại `http://localhost:5173`, chỉ bind loopback.

## Cách kiểm thử

1. Dùng tài khoản đối tác được phép, nhập loại phòng/giá/số lượng và bật kho.
   Hiện không có cơ sở mở bán; kết quả tìm kiếm khách sạn tham khảo không phải kho.
2. Dùng tài khoản khách đặt phòng đó. Trong trang thanh toán, chọn các tình huống
   mock. Thử thiếu rồi bù, bấm gửi lại; kiểm tra đơn DEMO và doanh thu thật không đổi.
3. Hai tài khoản riêng mở cùng link hành trình; từng người tự bật GPS. Kiểm tra
   tắt chia sẻ, rời phòng, đổi link, gỡ thành viên và đóng phòng trên thiết bị thật.
4. Admin mở Trạng thái hệ thống, xem trạng thái và lỗi tác vụ 24 giờ qua.

Chỉ bật mock tại môi trường thử đã xác định: `scripts/enable-sepay-mock.sql`
(từ chối nếu đã có đơn paid không phải DEMO). Trước khi mở thanh toán thật,
người vận hành phải tắt mock bằng cách xóa setting `payment_mode=sepay-mock`,
cấu hình tài khoản SePay, rồi kiểm thử webhook/ngân hàng/callback thực tế.
Không đặt khóa bí mật trong frontend hoặc chat.

## Còn phải hoàn thiện trước khi chuyển sang AI / mở cho khách thật

- Chốt và triển khai thanh toán tour trực tuyến/tiền cọc/hoàn tiền theo chính sách;
  giữ chỗ và ghi nhận thanh toán vận hành hiện không phải checkout SePay cho tour.
- Tên miền, hosting, Supabase Auth redirect allowlist, SMTP đăng ký/khôi phục;
  cấu hình Resend/sender/SITE_URL cho email thông báo. Chưa có thông tin nhà
  cung cấp/email/domain để kích hoạt và kiểm thử thư thực.
- Nhập dữ liệu đối tác hợp lệ, kiểm thử giao diện có đăng nhập theo từng vai trò,
  tải ảnh, hoàn tiền/đối soát và vòng đời đơn đầy đủ bằng tài khoản QA được chỉ định.
- Kiểm thử tranh phòng/chỗ cuối bằng hai kết nối PostgreSQL độc lập; kiểm thử
  GPS hai thiết bị, mạng yếu, mất mạng/khóa màn hình. WASM một kết nối và test
  rollback schema thật không chứng nhận hành vi đồng thời giữa nhiều kết nối.
- Thiết lập vận hành: hỗ trợ, quyền riêng tư/lưu dữ liệu, backup/khôi phục,
  giám sát/lỗi cron và điều khoản đối tác. Nhà hàng/vận chuyển là sản phẩm mở rộng,
  chưa được xem là đã có chỉ vì có hệ sinh thái lưu trú và tour.

Chưa train hoặc triển khai mô hình AI mới trong đợt này.
