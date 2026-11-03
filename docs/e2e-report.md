# Báo cáo kiểm thử E2E FoodTrip — cập nhật 03/11/2026

**Mới nhất:** 22/22 UI mock qua; local thật vẫn chờ Docker. Xem mục cập nhật 03/11 ở cuối; phần 02/11 bên dưới là lịch sử.

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
# Cập nhật 03/11/2026 — hai tầng kiểm thử

Phần lịch sử ngày 02/11 phía trên mô tả lần Docker bị chặn trước đây. Trạng thái mới nhất nằm trong mục cập nhật này.

## Cách chạy hiện tại

- `npm ci`, `npx playwright install chromium`, `npm run test:e2e:ui`: Vite `--mode e2e`, không đọc tệp env; backend fixture tại `127.0.0.1:54329`. Mọi request khác origin bị chặn. Đã chạy cùng cấu hình bằng `npx playwright test --config=e2e/playwright.ui.config.js --workers=2`: **22/22 qua**, 2,7 phút.
- `npm run test:e2e`: kiểm tra hostname trước mọi thao tác, yêu cầu Docker Linux và Supabase CLI; `supabase start`, `supabase migration up --local`, seed bằng `docker exec` đúng container `supabase_db_Tripfood`, rồi Playwright local. Không có fallback production. **Đã chạy và thoát 1 tại `docker info`**, không chạy migration/seed. Không tạo `.env.e2e.local`; cấu hình local truyền trong process, mode e2e có `envDir:false` để không thể đọc `.env.local` ngoài ý muốn.
- `npm test` tiếp tục chạy Node unit/PGlite, độc lập Playwright. Chốt hostname có unit test cho localhost/127, remote, lookalike, URL lỗi, URL chứa credential và IPv6.
- Seed riêng `e2e/seed.sql`: 8 tài khoản local (khách thứ hai cho tranh phòng), admin, owner/staff lưu trú, owner/manager/guide tour; phòng cuối và departure có UUID mới mỗi lần runner chạy. Mật khẩu công khai chỉ dùng local trong seed. Không tự reset/xóa DB local của người phát triển. Các fixture cũ có thể tích lũy trong local.

## Kết quả thực tế mới nhất

| Luồng | 375px | 1280px | Phạm vi đã chứng minh |
|---|---|---|---|
| Khách đi qua wizard | Đạt | Đạt | Chốt đăng nhập trước tạo lịch; chưa có xem lịch cho khách |
| Session giả: tạo/xem/lưu/chia sẻ lịch và /account | Đạt | Đạt | Payload ngày và user; đọc link bằng RPC; chưa phủ thu hồi bằng UI |
| Khám phá tìm thành phố, chi tiết | Đạt | Đạt | Fixture map-place-search; không gọi Serper |
| /share link TikTok | Đạt | Đạt | Fixture oembed/detect-place, không đăng bài |
| Chat tìm món, hỏi địa điểm, đổi món, chuyển nhân viên | Đạt | Đạt | Fixture assistant, kiểm tra contact_messages payload/transcript |
| Nhân viên lưu trú không thấy doanh thu/nhân sự | Đạt | Đạt | Không gọi property_team |
| Tài khoản thường bị chặn /admin | Đạt | Đạt | Session giả |
| Bàn phím, Escape, trả focus; trang link lỗi và 404 | Đạt | Đạt | Sáng/tối, VI/EN, h1 và không tràn ngang |
| Auth local thật | Chưa chạy | Chưa chạy | Có test đăng ký SDK + đăng nhập/đăng xuất UI, giữ /account; chờ Docker |
| SePay local exact/underpaid/remaining/duplicate, DEMO, admin revenue | Chưa chạy | Chưa chạy | Có test RPC thật local; chưa phải test UI thanh toán đầy đủ |
| Tranh phòng cuối hai client/session độc lập | Chưa chạy | Chưa chạy | Có Promise.all hai HTTP client; chưa xác nhận concurrency DB local |
| Giữ chỗ tour và đọc lại đơn của mình | Chưa chạy | Chưa chạy | Có test RPC/RLS local; chưa phủ trang My bookings bằng UI |
| Manager tour, guide, tenant khác | Chưa chạy UI | Chưa chạy UI | Có PGlite trong bộ unit; không đồng nghĩa E2E |
| Cộng đồng ảnh/bình luận/admin ẩn | Chưa chạy | Chưa chạy | Chưa có spec, thuộc phạm vi E2E rộng đợt trước |

Các case UI bắt `pageerror` và đều không có exception. Request ảnh/API ngoài bị abort có thể tạo lỗi tài nguyên bị chặn trong console; không coi đây là xác nhận mọi console message đều sạch. Có warning Reduced Motion dự kiến. Tắt HMR/watch ở mode e2e để việc ghi báo cáo/fixture không reload trang giữa lượt chat; dùng reduced motion để kiểm tra ổn định, không ép click và không bỏ assertion.

## Lỗi phát hiện và tái hiện

1. **P2, đã sửa và kiểm tra lại:** mở trợ lý, nhập `tìm quán bún chả`, sau câu hỏi địa điểm nhập `quán phở ở Hà Nội`. Trước sửa vẫn tìm bún chả. `answersPending` nay nhận món mới là tìm kiếm mới; trả lời chỉ `Hà Nội` vẫn hoàn tất câu cũ. Test unit và UI cả hai viewport đã qua. Ảnh trước sửa: `screenshots/20261103/assistant-before-fix-375px.png`.
2. **Chặn E2E local:** chạy `npm run test:e2e`, `docker info` không truy cập được Linux engine, runner thoát 1. Không đánh dấu seed/Auth/RPC/concurrency local đã đạt.
3. **P1 cần kiểm chứng thêm, chưa sửa nghiệp vụ:** đọc `HotelOverview` trong `src/pages/Partner.jsx` thấy công thức doanh thu tháng cộng đơn paid và chưa loại `payment_txn_ref='DEMO'`. Cần dùng đơn DEMO có check-in trong tháng để tái hiện trên owner UI; chưa chạy case này. Test local mới kiểm tra admin_overview, không chứng minh doanh thu owner đúng.

Ảnh giao diện: `docs/screenshots/20261103/home-{light|dark}-{vi|en}-{375px|1280px}.png`. Đã xem ảnh EN tối cả hai viewport; không thấy tràn chữ hero. Email thật, GPS hai thiết bị vật lý, webhook ngân hàng thật, giá/credit Serper và thanh toán tiền thật đều không được xác nhận bằng fixture/local.

Sự cố an toàn riêng trong lần làm việc này được ghi đầy đủ tại `review-20261103.md`; các spec Playwright mới chỉ dùng fixture/local và không tạo request production.

---
