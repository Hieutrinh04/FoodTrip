# Prompt cho Codex — FoodTrip, đợt tiếp theo (03/11/2026)

Dán toàn bộ phần dưới đường kẻ vào Codex, chạy tại `D:\Tripfood`.

---

Bạn đang tiếp tục dự án **FoodTrip** (React 19 + Vite 8, Supabase Postgres/Auth/Edge Functions Deno, MapLibre/Track-Asia, Serper). Giao diện và tài liệu viết bằng tiếng Việt; trả lời và viết báo cáo bằng tiếng Việt.

## 1. Đọc trước khi làm

Đọc hết các tệp sau, rồi mới sửa code:

- `README.md` — tổng quan, cấu trúc thư mục.
- `docs/release-readiness.md` — đã xong gì, lỗi bảo mật chưa deploy, chưa kiểm thử gì.
- `docs/review-20261102.md` — đợt sửa gần nhất và giới hạn của nó.
- `docs/e2e-report.md` — vì sao E2E chưa chạy được.
- `docs/DEPLOY.md` — thứ tự deploy, danh sách biến môi trường.
- `docs/role-portals.md`, `docs/assistant-chat.md`, `test/ECOSYSTEM.md`, `test/PERMISSIONS.md` — nghiệp vụ và phân quyền.
- `test/fullSchemaPermissions.test.js` — chạy lại **toàn bộ migration trên PGlite** (Postgres WASM). Đây là cách kiểm thử quyền DB khi không có Docker.

## 2. Hiện trạng đã kiểm chứng (03/11/2026)

- `npm test`: 237/237 qua. `npm run lint` và `npm run build` không lỗi; build còn cảnh báo chunk bản đồ lớn hơn 500 kB.
- Nhánh `main` = `origin/main` = `7dd534b`. **Phần lớn công việc sau ngày 28/10 chưa commit**: 59 tệp sửa và khoảng 50 tệp mới (cổng vai trò, `/account`, trợ lý, preflight, privacy/terms, tài liệu, test).
- 46 migration; `20261103090000_private_shared_trips_and_team.sql` **chưa áp dụng lên Supabase thật**. Mọi migration trước đó đã áp dụng.
- Docker Desktop không có Linux engine, nên `supabase start` không chạy được và chưa có E2E nào.
- Trợ lý chạy bằng rules, FAQ và dữ liệu thật; Edge Function `assistant` đã deploy. Các mô hình tự train (PhoBERT, retriever, LoRA Qwen) **chưa train xong và chưa deploy**; `ASSISTANT_MODEL_URL` và `ASSISTANT_GENERATOR_URL` chưa cấu hình.
- Thanh toán: VNPay sandbox, SePay có chế độ mock. Hotelbeds dùng host test, giá chỉ để tham khảo.

## 3. Quy tắc bắt buộc

1. **Không** đọc, in hay sửa `.env`, `.env.local` hoặc bất kỳ secret nào. Không đưa khóa server vào biến `VITE_*`.
2. **Không** push, deploy Edge Function, chạy `supabase db push`, `supabase db query --linked` hay bất cứ lệnh ghi nào vào project Supabase thật (`bnxqxraqmyemxfdunhar`). Không gọi API trả phí (Serper, Anthropic, Hotelbeds) trong test. Mọi thao tác với server thật để lại cho chủ dự án, kèm hướng dẫn.
3. Chỉ commit trên nhánh mới (mục 4.0), không commit lên `main`. Commit message bằng tiếng Việt theo kiểu của repo.
4. Dữ liệu phải trung thực: không bịa giá, giờ mở cửa, đánh giá, số liệu người dùng hay lời chứng thực. Thiếu dữ liệu thì ghi "chưa có" (xem `test/publicContent.test.js`).
5. Không xóa, `skip` hay nới assertion để test qua. Test sai thì sửa test kèm giải thích; code sai thì sửa code.
6. Viết code giống code xung quanh: JS thuần ở `supabase/functions/_shared/*.js` dùng chung cho Deno, Node và trình duyệt; chuỗi giao diện VI/EN để trong object `C` của từng component; dùng token màu và chữ trong `src/index.css`.
7. Sau mỗi hạng mục chạy `npm run lint`, `npm test`, `npm run build`. Hạng mục có giao diện thì chạy `npm run dev`, kiểm tra ở 375px và 1280px, sáng và tối, VI và EN, và xác nhận console không có lỗi.
8. Trên trình duyệt chỉ dùng chế độ khách hoặc dữ liệu giả lập. Không gửi form, chat, đặt phòng hay thanh toán tới backend thật.

## 4. Việc cần làm, theo thứ tự ưu tiên

### 4.0 Giữ an toàn công việc chưa commit

- Tạo nhánh `chore/release-hardening` từ trạng thái hiện tại.
- Commit phần chưa commit thành vài nhóm hợp lý: (a) cổng vai trò và `/account`; (b) trợ lý (món ăn, ngữ cảnh quán, launcher, generator); (c) migration privacy kèm test PGlite; (d) nội dung công khai, privacy/terms, SEO; (e) preflight, tài liệu, ảnh chụp kiểm tra; (f) pipeline ML.
- Trước khi commit, quét secret (`git diff --cached`) và bảo đảm không có tệp ML lớn hoặc tệp zip lọt vào (xem `.gitignore`).

### 4.1 Lỗi bảo mật: lịch trình chia sẻ và email đội ngũ

Migration `20261103090000` chặn liệt kê lịch trình công khai và chặn nhân viên đọc email cả đội. **Frontend phải deploy trước migration.**

- Rà mọi chỗ đọc lịch trình của người khác (`src/lib/itineraries.js` dòng ~85 vẫn có nhánh `select ... eq('is_public', true)`; `SharedTrip.jsx`, `LiveTrip.jsx`, Community). Tất cả phải đi qua RPC `shared_itinerary`. Sau khi migration áp dụng, nhánh đọc trực tiếp sẽ trả lỗi hoặc rỗng; xử lý gọn, không làm vỡ trang.
- Rà mọi chỗ đọc `property_team` ở cổng lưu trú: nhân viên không được cần email đồng nghiệp ở bất kỳ màn nào.
- Thêm test vào `test/fullSchemaPermissions.test.js` cho cả hai lỗi: khách và người dùng khác không liệt kê được, mở theo id vẫn được, `user_id` không lộ.
- Viết mục "Thứ tự deploy 20261103090000" trong `docs/DEPLOY.md`: các bước cụ thể và cách kiểm tra sau deploy.

### 4.2 Khám phá theo thành phố không có GPS trả rỗng từ Google

Đã đo ngày 28/10: hàm `map-place-search` gọi Serper Maps với "món + tên thành phố" mà không có toạ độ, trả 0 kết quả. Cùng từ khoá kèm toạ độ trung tâm Hà Nội và bán kính 5 km trả 17 quán.

- `searchExplorePlaces` (`src/lib/explorePlaceSearch.js`) gọi `searchMapArea` chỉ với `area`. Kết quả rỗng còn bị ghi cache phía client (`writeCache` trong `src/lib/mapAreaSearch.js`), nên ô tìm kiếm rỗng mãi.
- Sửa theo cách trợ lý đang làm (`locateArea` trong `src/lib/assistantAnswers.js`): tâm thành phố lấy từ `destinationWeatherLocation(cityId)`, nếu không có thì geocode bằng `searchPlaces`, rồi truyền làm `origin` với bán kính hợp lý. Không ghi cache kết quả rỗng.
- Thêm unit test với `search`/`locate` giả lập. Kiểm tra trên trình duyệt chỉ khi đã được chủ dự án cho phép tốn credit Serper; nếu chưa, ghi rõ là chưa kiểm tra trực tiếp.

### 4.3 Hạ tầng E2E, chặn chạy nhầm vào server thật

Docker hiện không chạy, nên làm theo hai tầng:

1. **Chạy được ngay:**
   - Thêm Playwright (devDependency) và script `npm run test:e2e:ui`.
   - Chạy trên `vite` với chế độ `--mode e2e`. Mọi request tới Supabase và API ngoài bị chặn bằng `page.route` và trả dữ liệu giả lập có kiểm soát (fixtures trong `e2e/fixtures/`).
   - Luồng cần phủ:
     - **Khách:** trang chủ → wizard lịch trình đến bước xem lịch; Khám phá (tìm, mở chi tiết quán); `/share` dán link (fixture của `tiktok-oembed` và `detect-place`); trợ lý chat (fixture của function `assistant`): tìm món, hỏi lại điểm đến, form chuyển nhân viên (chặn insert, chỉ kiểm tra payload và transcript).
     - **Đăng nhập giả lập** bằng session giả: lưu lịch trình, mở `/account`; cổng nhân viên lưu trú không hiện doanh thu; tài khoản thường bị chặn khỏi `/admin`.
   - Chạy ở 375px và 1280px.
2. **Chỉ chạy khi có Supabase local:**
   - Script `npm run test:e2e` dùng `supabase start`, seed riêng trong `e2e/seed.sql` (không đặt trong `supabase/migrations`).
   - Có chốt dừng ngay nếu hostname của `VITE_SUPABASE_URL` khác `localhost` hoặc `127.0.0.1`. Viết test cho chính chốt này.
   - Luồng: đăng ký/đăng nhập, SePay mock (đủ tiền, thiếu rồi bù, gửi trùng), giữ chỗ tour, hai kết nối tranh phòng cuối (chỉ một thành công).
   - Khi Docker không có, script báo rõ và thoát mã khác 0. Không giả vờ là đã qua.
3. Cập nhật `docs/e2e-report.md`: luồng nào chạy được, luồng nào còn chờ Docker.

### 4.4 Trợ lý: hoàn thiện phần chạy không cần mô hình

- Chạy `node scripts/eval-assistant.js` và `node scripts/check-assistant.mjs`, ghi lại số liệu baseline. Các thay đổi sau không được làm giảm số liệu này.
- Mỗi trang có câu gợi ý riêng trong `src/lib/assistantSuggestions.js`. Mỗi câu phải được rules đọc đúng ý định (đã có test). Viết thêm câu hỏi thật vào `ml/assistant/real-test.json` cho các ý định còn yếu: `booking_how`, `booking_status`, `saved_trips`, `contact_support`, `modify_plan`, `find_food`. Sửa `rules.js` hoặc `faq.js` cho đúng, không học thuộc lòng câu test.
- Rà `AssistantChat.jsx` về khả năng tiếp cận: focus vào ô nhập khi mở, Escape đóng và trả focus về nút mở, đọc màn hình (`aria-live`), điều khiển hoàn toàn bằng bàn phím.
- Không bật Anthropic và không thêm mô hình sinh vào đường chạy mặc định.

### 4.5 Rà soát nhỏ trước phát hành

- Không còn chuỗi kỹ thuật (mã lỗi, tên bảng, tên migration) hiện cho người dùng thường. Admin thì được. Ví dụ cần sửa: thông báo lỗi trong `src/components/admin/AdminAssistant.jsx` có nhắc tên migration, đây là màn admin nên giữ được; hãy rà các màn khác.
- Trang 404, trang lỗi và trạng thái rỗng đều có `h1`, hiển thị đúng ở chế độ tối.
- Chạy `npm audit --omit=dev` và `npm run preflight`, ghi kết quả.

## 5. Không làm trong đợt này (cần chủ dự án quyết định)

- Tên miền, hosting, email gửi đi, sitemap và canonical (cần domain).
- Bật cổng thanh toán thật, thanh toán tour, chính sách cọc và đối soát.
- Giữ hay bỏ Hotelbeds; nội dung pháp lý chính thức của Privacy/Terms; dùng chat để huấn luyện hay không.
- Train và deploy mô hình (Colab, Hugging Face Space), đặt secret.

## 6. Báo cáo khi xong

Ghi `docs/review-<ngày>.md` theo mẫu `docs/review-20261102.md`:

- Mỗi hạng mục: tệp đã sửa, nguyên nhân, cách sửa, test đã thêm, bằng chứng (lệnh kèm kết quả, ảnh trong `docs/screenshots/<ngày>/`).
- Tách rõ **đã kiểm chứng**, **chưa kiểm chứng** và **cần chủ dự án làm hoặc quyết định**.
- Danh sách commit trên nhánh `chore/release-hardening` và các lệnh deploy chủ dự án cần chạy, đúng thứ tự.
