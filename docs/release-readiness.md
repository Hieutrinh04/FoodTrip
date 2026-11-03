# Mức sẵn sàng phát hành — 03/11/2026

Đây là bản ghi trước đợt `chore/release-hardening`. Kết quả mới nhất, các commit, điều kiện còn chặn và sự cố an toàn trong đợt tiếp theo nằm ở [review-20261103.md](review-20261103.md). Chưa deploy hoặc áp dụng migration lên Supabase thật.

## Đã xong

| Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Lỗ hổng thư viện | Xong | `npm audit --omit=dev`: 0 lỗ hổng; `xlsx` 0.20.3 ghim từ nguồn SheetJS |
| Chế độ tối, tiếng Anh, bàn phím, nút nhỏ | Xong với dữ liệu giả lập | `scripts/release-browser-check.mjs`, ảnh trong `docs/screenshots/release-readiness/` |
| Preflight, tài liệu triển khai | Xong | `npm run preflight`, `docs/DEPLOY.md` |
| Toàn bộ migration chạy được theo thứ tự | Xong trên PostgreSQL WASM | `test/fullSchemaPermissions.test.js` |
| Phân quyền theo vai trò ở tầng database | Xong | Cùng bài test trên, cùng `test/ecosystem.test.js`, `test/runtimeCompletion.test.js` |

## Lỗi bảo mật tìm thấy khi chạy đủ migration (đã sửa trong code, chưa áp dụng lên server)

Sửa bằng `supabase/migrations/20261103090000_private_shared_trips_and_team.sql`:

1. **Liệt kê được mọi lịch trình đã chia sẻ.** Policy `itineraries_public_select` cho phép bất kỳ ai, kể cả chưa đăng nhập, đọc toàn bộ lịch trình công khai kèm `user_id`. Nay chỉ mở được khi biết id, qua `shared_itinerary`, và không trả `user_id`.
2. **Nhân viên cơ sở đọc được email cả đội** qua `property_team`, dù giao diện ẩn mục này. Nay chỉ chủ cơ sở và admin đọc được.

Bản đang chạy thật vẫn còn hai lỗi này cho tới khi deploy. Xem thứ tự deploy trong `docs/DEPLOY.md`.

## Chưa kiểm thử

Các mục sau cần Supabase local (Docker) hoặc thiết bị thật:

- Đăng ký, đăng nhập, khôi phục mật khẩu qua giao diện thật; wizard tạo lịch trình đến khi lưu.
- Đặt phòng và thanh toán mock trên giao diện; đăng bài có ảnh.
- Hai kết nối độc lập tranh phòng hoặc chỗ cuối: PostgreSQL WASM chỉ có một kết nối nên không chứng minh được.
- Storage và Auth thật, vì trong bài test chúng là bản giả lập.
- Email thật, GPS trên hai điện thoại, webhook ngân hàng thật.

## Chủ dự án cần quyết định

- Tên miền, hosting, dịch vụ email.
- Cổng thanh toán, thanh toán tour, chính sách cọc, hoàn tiền và đối soát.
- Hotelbeds: giữ để tham khảo, nâng tài khoản thật, hay bỏ.
- Đơn vị đứng tên, liên hệ, thời hạn lưu dữ liệu, có dùng chat để huấn luyện không; rà pháp lý trang Quyền riêng tư.
- Dữ liệu quán thật cho các thành phố còn thiếu và đối tác đầu tiên.
