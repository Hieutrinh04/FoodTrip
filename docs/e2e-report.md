# Báo cáo kiểm thử E2E FoodTrip — 02/11/2026

## Trạng thái: chưa chạy được — Supabase local không khởi động

Đã dừng theo yêu cầu an toàn: nếu không chạy được `supabase start`, không tiếp tục thiết lập/chạy E2E và không sử dụng project Supabase thật thay thế.

### Kiểm tra thực tế

Trong `D:\Tripfood`:

1. `docker version`: có Docker CLI 29.6.2, context `desktop-linux`; không kết nối được Docker engine, exit 1.
2. `supabase start`: exit 1; không inspect được container `supabase_db_Tripfood` vì không có named pipe `//./pipe/dockerDesktopLinuxEngine`.

Docker CLI đã cài, nhưng Docker Desktop Linux engine chưa chạy hoặc không truy cập được tại thời điểm kiểm tra. Chưa đủ bằng chứng kết luận lỗi nghiệp vụ của FoodTrip.

## Cách tái hiện lỗi môi trường

1. Mở PowerShell tại repo.
2. Chạy `docker version`.
3. Chạy `supabase start`.
4. Quan sát lỗi `failed to inspect service` / không tìm thấy `dockerDesktopLinuxEngine`; Supabase local không khởi động thành công.

Mức độ: **chặn toàn bộ kiểm thử E2E local**, không phải mức độ lỗi nghiệp vụ đã xác nhận. Cần Docker Desktop hoạt động với Linux engine và Docker API truy cập được trước khi tiếp tục.

## Bảng luồng kiểm thử

| Luồng | 1280px | 375px | Ghi nhận |
|---|---|---|---|
| Đăng ký, đăng nhập, đăng xuất; quay lại trang sau đăng nhập | Chưa chạy được | Chưa chạy được | Supabase local chưa sẵn sàng |
| Wizard lịch trình; lưu, mở lại, chia sẻ, thu hồi link | Chưa chạy được | Chưa chạy được | Chưa có Auth/DB local |
| SePay mock: đủ tiền, thiếu rồi bù, gửi trùng | Chưa chạy được | Chưa chạy được | Chưa có đơn hoặc dịch vụ thanh toán mock local |
| Nhãn DEMO; giao dịch mock không tính doanh thu thật | Chưa chạy được | Chưa chạy được | Chưa tạo giao dịch |
| Giữ chỗ tour; xem trong đặt chỗ của tôi | Chưa chạy được | Chưa chạy được | Chưa seed tour/lịch khởi hành |
| Hai kết nối tranh phòng cuối, chỉ một thành công | Chưa chạy được | Chưa chạy được | Chưa có inventory/DB local |
| Nhân viên không thấy doanh thu | Chưa chạy được | Chưa chạy được | Chưa có tài khoản local |
| Quản lý tour không sửa điều khoản | Chưa chạy được | Chưa chạy được | Chưa có tài khoản local |
| Hướng dẫn viên chỉ thấy đoàn được giao | Chưa chạy được | Chưa chạy được | Chưa có phân công local |
| Tài khoản thường không vào /admin | Chưa chạy được | Chưa chạy được | Chưa có tài khoản local |
| Không xem dữ liệu cơ sở khác | Chưa chạy được | Chưa chạy được | Chưa có dữ liệu phân quyền local |
| Bài cộng đồng có ảnh, bình luận; admin ẩn bài | Chưa chạy được | Chưa chạy được | Chưa có Auth/Storage/DB local |

Không có luồng nào được đánh dấu đạt; chưa phát hiện hoặc xác nhận lỗi nghiệp vụ bằng E2E trong đợt này. Không xóa/bỏ qua/nới test để tạo kết quả đạt.

## Cách tiếp tục và chạy sau khi môi trường sẵn sàng

1. Khởi động Docker Desktop với Linux engine; xác nhận `docker version` trả cả Client và Server thành công.
2. Chạy `supabase start` trong repo. Nếu thất bại, tiếp tục dừng để xử lý môi trường.
3. Sau khi local khởi động được, mới tiếp tục các việc chưa thực hiện: cài Playwright dev dependency, script `test:e2e`, cấu hình browser mocks, seed E2E riêng ngoài migrations và kiểm tra toàn bộ migration local.
4. Tạo `.env.e2e.local` từ thông số Supabase **local**, không sao chép hoặc đọc `.env.local`. Chạy Vite với `--mode e2e`.
5. Trước khi chạy test, kiểm tra hostname của URL Supabase chỉ là `localhost` hoặc `127.0.0.1`; chốt kiểm tra phải dừng ngay nếu khác. Chưa chạy Vite/test khi chốt này chưa được thiết lập và xác minh.
6. Khi cấu hình và seed hoàn tất mới chạy `npm run test:e2e` cho cả 1280px/375px. **Script này chưa được thêm, hiện chưa thể dùng để chạy kiểm thử.** `npm test` chưa bị thay đổi.

Danh sách trên là công việc còn lại, không phải hướng dẫn đã được kiểm chứng thành công. Chưa khẳng định migration hiện tại áp dụng được trên local.

## Phạm vi thay đổi và an toàn

- Chỉ thêm báo cáo này; chưa thêm dependency, cấu hình Playwright, `.env.e2e.local`, seed hay test E2E vì đã chạm điều kiện phải dừng.
- Không đọc/in/chỉnh `.env.local`; không chạy Vite hoặc browser test trong đợt này.
- Không gọi project Supabase thật, API trả phí hoặc cổng thanh toán thật; không ghi dữ liệu thật.
- Không commit, push, deploy, chạy migration hoặc sửa lỗi nghiệp vụ. Các thay đổi có sẵn được giữ nguyên.
- Chưa chạy lại lint/unit test/build: không sửa source/package, chỉ thêm tài liệu và dừng ở kiểm tra tiền điều kiện.

## Những gì local không xác nhận được

- Gửi/nhận email thật và khả năng email đến hộp thư: mail catcher local chỉ kiểm tra luồng tạo email khi được cấu hình.
- GPS trên hai thiết bị vật lý và điều kiện mạng thực: browser contexts chỉ mô phỏng vị trí/phiên.
- Webhook ngân hàng thật, tiền thật, chữ ký/thông báo của nhà cung cấp trong môi trường vận hành: chỉ được mô phỏng khi tiếp tục E2E local.
- Hiện chưa chạy được cả các mô phỏng trên do Docker/Supabase local chưa sẵn sàng.
