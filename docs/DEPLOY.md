# Triển khai FoodTrip

Tài liệu vận hành, không tự chạy migration/deploy hoặc thay secret. Các bước dưới đây dành cho người vận hành đã xác nhận đúng môi trường đích. Chưa chốt hosting, domain, người chịu trách nhiệm dữ liệu hay chính sách lưu/xóa dữ liệu. Không coi build/unit test/mocked UI là chứng nhận sẵn sàng thu tiền.

## Build và kiểm tra trước triển khai

1. Dùng Node/npm tương thích Vite 8 (đợt kiểm tra dùng Node 24). Chạy `npm ci` từ lockfile.
2. Cung cấp các biến frontend qua môi trường build/CI. Mọi biến `VITE_*` sẽ công khai trong bundle; chỉ dùng public/anon hoặc browser-restricted keys.
3. Chạy `npm run lint`, `npm test`, `npm run build`, `npm audit --omit=dev`, `npm run preflight`.
4. Preflight **không đọc `.env` hoặc `.env.local`**, không kết nối mạng, không ghi file; chỉ đọc source, `dist` và biến tiến trình. Vì vậy biến đã có trong một file env không tự làm preflight báo có. Chạy từ môi trường CI đã cấp đúng biến cho cả build và preflight; không in chúng trong log. Biến preflight có mặt không chứng minh cùng giá trị đã được dùng để tạo artifact: lưu provenance build trong CI riêng.
5. Thiếu hai biến Supabase hoặc `dist`, hoặc có marker nghi secret: exit 1. Thiếu browser key tùy chọn được báo thiếu nhưng không gây exit 1. Marker `HOTELBEDS`, `SERPER`, `SERVICE_ROLE`, `ANTHROPIC`, `sk-ant` chỉ là cảnh báo nghi vấn: xem artifact riêng tư để phân biệt text vô hại với credential, không đăng đoạn khớp vào log/chat. Quét tĩnh không bảo đảm bắt mọi secret.
6. Lưu artifact immutable, lockfile, mã nguồn/phiên bản và báo cáo kiểm tra cho bản phát hành.

### Phụ thuộc Excel

`xlsx` ghim tarball **0.20.3** tại nguồn SheetJS chính thức, lockfile có integrity. `npm ci` cần truy cập npm registry và CDN SheetJS (hoặc cache npm đã xác thực integrity); nếu CDN bị chặn, dừng build, không tự chuyển sang một republish không được duyệt. Không tải thư viện từ CDN ở runtime trình duyệt. Xem [hướng dẫn chính thức](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) và [advisory ReDoS](https://cdn.sheetjs.com/advisories/CVE-2024-22363). Giữ test workbook hiện có nguyên vẹn.

## Biến frontend — đầy đủ theo source hiện tại

Nguồn: `src/lib/supabaseClient.js`, `trackAsia.js`, `streetView.js`. Không có biến frontend chứa secret server.

| Tên | Yêu cầu | Dùng cho / nếu thiếu |
|---|---|---|
| `VITE_SUPABASE_URL` | Bắt buộc cho dịch vụ backend | URL project; thiếu URL hoặc anon key làm `hasSupabase=false`, trang có thể hiện dữ liệu mẫu nhưng không có Auth/DB/Edge Function. Không bán hàng trong trạng thái này. |
| `VITE_SUPABASE_ANON_KEY` | Bắt buộc cùng URL | Public anon/publishable credential; quyền phải do RLS/RPC quyết định. Tuyệt đối không thay bằng service-role key. |
| `VITE_TRACK_ASIA_API_KEY` | Cần cho bản đồ/định vị địa danh/routing; tùy chọn đối với build | Key trình duyệt có giới hạn domain/quota. Thiếu cả key chính và backup thì `hasMapsKey=false`; bản đồ/Track-Asia search không chạy, UI fallback hoặc dùng catalogue/nguồn khác nếu có. |
| `VITE_TRACK_ASIA_API_KEY_BACKUP` | Tùy chọn | Key dự phòng, thử khi key trước bị từ chối/hết quota. Có thể là key duy nhất nhưng nên vận hành rõ key chính/dự phòng. |
| `VITE_GOOGLE_MAPS_EMBED_KEY` | Tùy chọn | Maps Embed API cho Street View 360°, giới hạn HTTP referrer/API. Thiếu thì bỏ chức năng 360°, không thay thế basemap. |

## Biến/secret Edge Function — đầy đủ theo code

Đối chiếu `Deno.env.get(...)`, các truy cập tên động trong `serper.ts`, `sepay.ts` và `system-readiness`. Chỉ đặt trong môi trường server. URL/model ID/sender không nhất thiết là secret nhưng vẫn thuộc cấu hình server, không cần đưa vào frontend.

| Tên | Yêu cầu/phạm vi | Nếu thiếu / hành vi hiện tại |
|---|---|---|
| `SUPABASE_URL` | Bắt buộc cho chức năng DB/Auth; runtime Supabase cấp | Nhiều function trả misconfigured; cache/remember có thể bỏ qua; không có luồng đặt chỗ tin cậy. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bắt buộc cho payment, thông báo, catalogue/cache/telemetry server | Quyền cao, chỉ Edge Function; thiếu làm payment lỗi hoặc không lưu cache/telemetry. Không bao giờ dùng `VITE_`. |
| `SUPABASE_ANON_KEY` | Runtime cấp; dùng `system-readiness` kiểm tra quyền ẩn danh | Chẩn đoán không đầy đủ nếu thiếu; không phải service key. |
| `SERPER_API_KEY` | Cần cho tìm Google Maps/web/hotel/photo/review qua Serper | Nếu cả chính/dự phòng thiếu, web discovery không khả dụng hoặc trả fallback/không kết quả; catalogue cục bộ/đã lưu vẫn là nguồn riêng. |
| `SERPER_API_KEY_BACKUP` | Tùy chọn | Chuyển key khi nguồn chính hết credit; thiếu không có dự phòng. Nguồn: `_shared/serper.ts` lấy tên động. |
| `HOTELBEDS_API_KEY` | Tùy chọn, cần cùng secret cho dữ liệu nhà cung cấp | Thiếu một trong cặp thì không dùng Hotelbeds. Host vẫn `api.test.hotelbeds.com`; có key cũng không biến giá thành giá đặt được. |
| `HOTELBEDS_SECRET` | Cùng key Hotelbeds | Dùng ký request, không đưa vào browser. |
| `ANTHROPIC_API_KEY` | Tùy chọn | `parse-trip-request` trả missing-api-key, frontend có bộ đọc mẫu cục bộ; trợ lý giữ quy tắc/FAQ và tổng hợp dữ liệu nếu không có prose từ mô hình. Có key có thể phát sinh chi phí, chủ dự án phải duyệt. |
| `ASSISTANT_CHAT_MODEL` | Tùy chọn khi dùng Anthropic | Chọn model cho generate/place assessment; code có mặc định, cần rà giá/quota trước khi bật. |
| `ASSISTANT_MODEL_URL` | Tùy chọn, đi cùng token | Endpoint mô hình intent/slots và retriever (`/predict`, `/answer`). Thiếu cặp hoặc lỗi/timeout/không đủ tự tin: dùng rules/word matching. |
| `ASSISTANT_MODEL_TOKEN` | Cùng model URL | Bearer token truy cập mô hình; thiếu thì không gọi model. |
| `ASSISTANT_GENERATOR_URL` | Tùy chọn, đi cùng token | Endpoint mô hình sinh câu trả lời tự host. Thiếu hoặc lỗi thì giữ câu trả lời có sẵn; không khẳng định mô hình đã triển khai. |
| `ASSISTANT_GENERATOR_TOKEN` | Cùng generator URL | Token chỉ server, không gửi secret xuống browser. |
| `YOUTUBE_API_KEY` | Tùy chọn, cho YouTube metadata/shorts | `youtube-oembed` có phương án metadata công khai khi không có key; thông tin sâu/Shorts có thể thiếu hoặc báo no-key. Không suy rằng xem toàn bộ video. |
| `GOOGLE_VISION_KEY` | Tùy chọn | OCR khung ảnh video; thiếu thì thử `GOOGLE_CUSTOM_SEARCH_KEY`; không có cả hai thì không OCR. |
| `GOOGLE_CUSTOM_SEARCH_KEY` | Tùy chọn / legacy | Hiện được OCR dùng làm key dự phòng và health kiểm tra; discovery web hiện dùng Serper, không phải Custom Search. Key phải được cấp quyền Vision nếu dùng cho OCR. |
| `GOOGLE_CUSTOM_SEARCH_CX` | Legacy, không bắt buộc | Hiện health chỉ báo cặp Custom Search đã có, không thấy luồng web discovery tiêu thụ CX. Không cần bật chỉ để health xanh. |
| `GOOGLE_PLACES_SERVER_KEY` | Legacy, không bắt buộc | Hiện health chỉ báo có/thiếu; place lookup hiện dùng Serper. Không thêm key chỉ để đáp ứng chỉ số health cũ. |
| `VNPAY_TMN_CODE` | Cần cùng hash secret nếu bật VNPay | Thiếu một trong cặp: không tạo URL thanh toán. Endpoint code vẫn **sandbox**. |
| `VNPAY_HASH_SECRET` | Cùng TMN code | Ký/xác minh callback; thiếu không thể xác minh thanh toán. |
| `APP_URL` | Cần đặt rõ cho callback VNPay của môi trường triển khai | `vnpay-return` mặc định localhost khi thiếu; phải là origin HTTPS đã chốt, không dùng mặc định trong production. |
| `SEPAY_WEBHOOK_KEY` | Bắt buộc cho nhận tiền SePay thật | Webhook xác thực Apikey. Thiếu thì config real không đủ; không tự bật mock. |
| `SEPAY_BANK` | Bắt buộc cho SePay real | Mã ngân hàng tạo VietQR; thiếu thì real config không sẵn sàng. |
| `SEPAY_ACCOUNT_NUMBER` | Bắt buộc cho SePay real | Tài khoản nhận tiền; webhook kiểm tra đúng tài khoản. Không ghi số tài khoản vào tài liệu này. |
| `SEPAY_ACCOUNT_NAME` | Tùy chọn theo code; cần chủ dự án xác nhận khi vận hành | Tên người nhận hiển thị; code mặc định rỗng. Không để giao diện mơ hồ khi mở bán. |
| `CRON_SECRET` | Bắt buộc cho `send-notifications` | Xác thực header x-cron-secret; thiếu/sai trả unauthorized. Scheduler cần đồng bộ bằng cơ chế secret riêng được bảo vệ. |
| `RESEND_API_KEY` | Cần nếu gửi email thông báo | Không có: email đã claim bị đánh skipped; thông báo trong app không đồng nghĩa email đã gửi. |
| `EMAIL_FROM` | Cần cấu hình sender đã xác minh trước gửi thật | Mặc định sender onboarding của Resend chỉ phù hợp thử nghiệm, không phải setup production. |
| `SITE_URL` | Cần HTTPS public cho link email và diagnostics | Thiếu khiến email link không đầy đủ, readiness chưa đạt. Khác với Auth Site URL trong dashboard và APP_URL của VNPay; cần cùng origin đã duyệt. |

Danh sách này mô tả cấu hình trong source, **không kiểm tra hay khẳng định secret nào đã có trên server**. `private.settings.payment_mode` và cấu hình lịch cron là trạng thái DB, không phải biến môi trường. Cấu hình Supabase Auth SMTP riêng, không phải RESEND_API_KEY của function gửi notification.

## Thứ tự triển khai (chưa thực hiện trong đợt này)

1. Chốt project staging/production, domain HTTPS, người phê duyệt, backup và thời gian phát hành. Lấy snapshot DB và kiểm tra phục hồi trước thay đổi schema. Không đưa seed/demo/mock SQL vào production.
2. **Migration trước**: so migration history với toàn bộ `supabase/migrations` theo timestamp; thử trên local/staging trước, rà RLS/RPC/Storage/grants và cron. `test/fullSchemaPermissions.test.js` đã chạy lại đủ migration theo thứ tự trên PostgreSQL WASM với auth/storage/cron giả lập; chưa chạy trên Supabase local thật vì Docker chưa sẵn sàng.
   **Ngoại lệ về thứ tự:** deploy frontend mới **trước** migration `20261103090000_private_shared_trips_and_team.sql`, vì migration này bỏ quyền đọc trực tiếp lịch trình chia sẻ mà trang cũ đang dùng. Frontend mới chỉ gọi shared_itinerary, không quay về đọc bảng; trong khoảng chưa có RPC, link chia sẻ hiện trạng thái không mở được. Chọn cửa sổ triển khai ngắn và thông báo gián đoạn link chia sẻ. Không dùng reset trên production; người vận hành áp dụng migration đã review bằng quy trình Supabase của dự án.
3. Cấp secret server được duyệt. **Deploy Edge Function sau schema**, trước frontend. Deploy từng function trong `supabase/functions` (trừ `_shared`):
   `assistant`, `detect-place`, `health`, `hotel-availability`, `hotel-photos`, `map-place-search`, `parse-trip-request`, `place-details`, `place-reviews`, `place-web-content`, `search-hotel-listings`, `send-notifications`, `sepay-create-payment`, `sepay-webhook`, `system-readiness`, `tiktok-oembed`, `tiktok-web-search`, `verify-place`, `vnpay-create-payment`, `vnpay-return`, `youtube-oembed`, `youtube-shorts`.
4. **`assistant` cần deploy lại để nhận shared rules, bộ nhận diện món và FAQ mới**. Build frontend không cập nhật code Edge Function hoặc intent telemetry phía server.
5. Rà cơ chế Auth/JWT cho từng function. Không tắt JWT verification hàng loạt để sửa lỗi gateway. Callback ngân hàng và cron cần cơ chế xác thực riêng đúng code; `system-readiness` phải kiểm tra admin, thao tác tài khoản phải kiểm tra identity/ownership. Các function public vẫn có thể ghi cache/catalogue/telemetry và tốn API quota: cần quyết định rate limit, giám sát và ngân sách trước public launch. CORS hiện cho origin `*`; CORS không thay Auth/RLS.
6. Tạo frontend production artifact với biến public của đúng môi trường, chạy bộ kiểm tra, upload **nội dung dist**. Không upload source secret, `.env*`, báo cáo riêng tư, SQL admin hay node_modules lên public root. Không deploy dev server.

## Yêu cầu hosting / Auth

- Host hỗ trợ static assets, HTTPS và SPA fallback: đường dẫn không trùng asset thực như `/plan`, `/privacy`, `/trip/:id`, `/partner/tours`, `/reset-password` phải trả `index.html`; asset không có không được giả làm JavaScript bằng HTML.
- Cấu hình MIME/ES modules và worker MapLibre đúng; không cache index.html quá lâu. Assets có hash có thể cache immutable. Giữ asset bản trước khi rollout để các tab đang mở không mất lazy chunks.
- Supabase Auth **Site URL** là origin public đã duyệt. Redirect allowlist gồm origin cần dùng và URL chính xác `/reset-password` cho production/staging; không mở wildcard tuỳ tiện. `requestPasswordReset` hiện dùng window.location.origin/reset-password.
- Rà SMTP/confirmation/reset email trên tài khoản thử được duyệt; không thử bằng email khách. Trang reset chỉ cập nhật password khi có recovery session hợp lệ.
- Chốt CSP cho Supabase, Track-Asia tiles/workers, ảnh/video nhúng và Street View nếu bật; không áp CSP thử nghiệm làm hỏng map/iframe trong giờ bán. Không vô hiệu hoá bảo vệ trình duyệt để chạy kiểm tra.

## Tắt SePay mock trước khi nhận tiền thật

Đây là hướng dẫn vận hành, **không phải lệnh đã chạy**. Dựa trên `sepay-create-payment`, `_shared/sepay.ts`, migration `20261013100000_sepay_mock_atomic.sql`, `scripts/enable-sepay-mock.sql`, `test/COMPLETION-20261013.md`.

1. Chủ dự án xác nhận tài khoản/ngân hàng/người nhận, webhook, hỗ trợ hoàn tiền và phạm vi mở bán. Khóa luồng thu tiền công khai trong thời gian chuyển đổi.
2. Không chạy `enable-sepay-mock.sql` ở production. Người vận hành có quyền DB xóa setting `payment_mode=sepay-mock` trong schema private, bằng thay đổi được phê duyệt/audit. Không thêm việc này vào migration tự động. Không xóa hàng DEMO để làm đẹp doanh thu và không chuyển DEMO thành tiền thật.
3. Cấu hình đủ SEPAY_WEBHOOK_KEY/BANK/ACCOUNT_NUMBER, xác minh ACCOUNT_NAME. Cấu hình webhook đến function sepay-webhook; khớp Apikey, tài khoản và quy tắc mã FT. Secret không đưa vào frontend.
4. Deploy/kiểm tra function. Chạy check readiness bằng tài khoản/quy trình được duyệt: sepay-create-payment `{check:true}` phải trả `ready`, không phải `mock`, `no-key` hoặc trạng thái lỗi. Đơn mock phải vẫn mang DEMO, không tính doanh thu/đối soát/đánh giá thật.
5. Trên **staging/local có quyền**, kiểm tra thiếu tiền rồi bù, duplicate, sai mã/tài khoản, hết hạn/late payment, rollback và ownership; cần hai kết nối DB riêng cho tranh phòng cuối. Kết quả unit/PGlite đơn kết nối không thay thế concurrency thật.
6. Webhook/ngân hàng thật chỉ thử sau khi chủ dự án cấp phép giao dịch cụ thể, theo quy trình hoàn tiền/đối soát. Chưa làm ở đợt này. Không mở bán khi chưa xác minh end-to-end.
7. VNPay đang sandbox, **không có biến env chuyển sang real** trong code; cần thay đổi tích hợp/endpoint được review riêng, không chỉ đặt key production. Hotelbeds cũng test host và không phải inventory có hợp đồng. Tour hiện là giữ chỗ/quote, chưa phải checkout SePay hoàn chỉnh.

## Checklist sau triển khai

- Trên staging trước: deep links/refresh, dark/light, VI/EN, mobile/desktop, keyboard Escape/focus, bản đồ/worker và xuất Excel giữ sheet/numeric cells/merges.
- Kiểm tra đăng ký/confirmation/recovery, đăng nhập tiếp tục đúng trang, đăng xuất và thay tài khoản bằng test accounts được duyệt. Chạy các luồng E2E trong `docs/e2e-report.md`; báo cáo hiện vẫn chưa chứng nhận chúng.
- Role isolation: guest/admin/staff/owner/manager/guide, quyền từng cơ sở/đơn/đoàn. Mocked browser checks chỉ chứng minh UI, không chứng minh RLS server.
- Kiểm tra assistant với bộ câu đã duyệt ở môi trường thử, giới hạn telemetry; không bắn test tùy ý vào DB khách. Xác nhận phiên bản shared rules và FAQ được deploy.
- Kiểm tra cron hết hạn đơn/nhắc lịch/dọn vị trí/gửi email có chạy, theo dõi lỗi; không suy thành công từ việc cron đã tồn tại. Kiểm tra status admin chỉ hiện có/thiếu, không lộ secret.
- Kiểm tra CORS/Auth/RLS, Storage upload/loại file, quota API, cảnh báo lỗi và dữ liệu công khai; không thử ghi ở production nếu chưa được ủy quyền riêng.
- Rà Privacy/Terms với người có chuyên môn, danh tính đơn vị vận hành, thời hạn giữ/xóa dữ liệu, support contact, email/domain, chính sách đối tác và bản dịch nội dung pháp lý.

## Quay lại bản trước

- Frontend: chuyển trỏ về artifact bất biến trước đó và giữ assets hash cũ; xác minh SPA/Auth callback. Không rebuild mã cũ với biến môi trường không rõ nguồn gốc.
- Edge Functions: redeploy phiên bản source đã lưu, nhưng kiểm tra tương thích với schema hiện tại. Không hạ version function xử lý tiền nếu gây mất idempotency/ownership.
- DB: không chạy down migration phá dữ liệu theo phản xạ. Chọn forward fix hoặc restore backup/PITR theo kế hoạch được duyệt, bảo toàn đơn/giao dịch/audit và đối soát số tiền trước mở lại. Không xóa dữ liệu mới để khớp giao diện cũ.
- Secret: không in/lưu vào artifact rollback. Nếu có lộ khóa thật, chủ dự án cần quy trình rotate/revoke độc lập; đợt chuẩn bị này không tự đổi khóa.


## Thứ tự deploy 20261103090000

Các lệnh sau để **chủ dự án** chạy, chưa được agent thực hiện. Hai lỗi lịch trình liệt kê công khai và email đội ngũ vẫn còn ở server cho tới khi migration này được áp dụng; frontend không thay RLS.

1. Backup và xác nhận đúng project đích bằng công cụ quản trị, không in secret. Thử migration trên local/staging và kiểm tra rollback/phục hồi. Đợt này PGlite chạy mọi migration; không chứng minh Supabase Auth/Storage thật hoặc concurrency.
2. Build/deploy frontend chứa getPublicItinerary chỉ gọi RPC shared_itinerary. SharedTrip dùng hàm này; Community không liệt kê itineraries. LiveTrip dùng live_trip_join/live room RPC có kiểm tra membership để đọc cả chuyến riêng tư, không biến thành đọc công khai. HotelTeam chỉ mount ở mục Nhân sự khi owner, staff không cần email đồng nghiệp.
3. Trong cửa sổ giữa frontend mới và migration: RPC chưa tồn tại sẽ trả null/trạng thái không mở được, **không fallback select bảng**. Không khôi phục nhánh đọc bảng để che gián đoạn. Hạn chế phát link mới trong cửa sổ này.
4. Chủ dự án chạy `supabase db push --linked --dry-run`, xem danh sách pending. Chỉ khi đúng migration đã duyệt (hiện dự kiến 20261103090000) mới chạy `supabase db push --linked`. Nếu có migration khác, dừng đối chiếu thay vì áp dụng mù. Refresh schema cache bằng quy trình quản trị nếu gateway chưa thấy RPC.
5. Bằng tài khoản thử được duyệt: guest và tài khoản khác không thể select/list itineraries kể cả biết id; mở RPC với id public vẫn được và JSON không có user_id; private/deleted/thu hồi link trả null. Owner vẫn xem/sửa chuyến của mình. Staff gọi property_team cho cơ sở mình/khác trả [] trong khi owner/admin đọc đúng đội; UI staff không có tab Nhân sự/Doanh thu. Không tạo dữ liệu khách thật để test.
6. Kiểm tra trang /trip/:id và /live/:id: public link mở đúng ticket, link thu hồi không mở, live room riêng tư vẫn đòi membership. Các tab frontend cũ cần tải lại; sau migration, code cũ có thể không đọc được bảng, đây là fail-closed chứ không phải lý do mở lại policy.
7. Deploy assistant cùng shared modules khi cập nhật rules/FAQ, rồi xác nhận bản frontend mới. Nếu có lỗi, ưu tiên forward fix tương thích RPC; không rollback bằng cách phục hồi policy public listing hoặc mở property_team cho staff. Không xóa migration history.
