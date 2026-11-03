# Prompt cho Codex — Cải tiến FoodTrip theo gợi ý từ cmap.vn (03/11/2026)

Chạy **sau** đợt `docs/codex-prompt-20261103.md`, vì đợt đó tạo nhánh `chore/release-hardening` và commit phần việc đang dở. Dán toàn bộ phần dưới đường kẻ vào Codex, chạy tại `D:\Tripfood`.

---

Bạn tiếp tục dự án **FoodTrip** (React 19 + Vite 8 SPA, Supabase Postgres/Auth/Edge Functions, MapLibre với nền bản đồ Track-Asia, Serper). Trả lời và viết báo cáo bằng tiếng Việt.

## 0. Điều kiện bắt đầu

- Nhánh `chore/release-hardening` phải tồn tại và `git status` phải sạch. Nếu không, **dừng lại** và báo cho tôi; không tự commit công việc dở của người khác.
- Tạo nhánh `feat/cmap-inspired` từ `chore/release-hardening`.
- Đọc trước: `README.md`, `docs/release-readiness.md`, `docs/DEPLOY.md`, `test/ECOSYSTEM.md`, `test/PERMISSIONS.md`, `test/fullSchemaPermissions.test.js`, `src/components/map/ExploreMap.jsx`, `src/pages/Explore.jsx`, `src/pages/PlaceDetail.jsx`, `src/pages/Landing.jsx`.

## 1. Bối cảnh: cmap.vn làm gì tốt

cmap.vn ("Bản đồ văn hóa – Ngày Văn hóa Việt Nam 24/11") là bản đồ sự kiện văn hóa toàn quốc. Những điểm đáng học, đã đối chiếu với code FoodTrip hiện tại:

| cmap.vn có | FoodTrip hiện tại |
|---|---|
| Nhãn **Quần đảo Hoàng Sa** và **Quần đảo Trường Sa** vẽ riêng trên bản đồ | Không có nhãn riêng; chưa kiểm tra nền Track-Asia có hiện hay không |
| Gom điểm (cluster) có số đếm khi thu nhỏ | Vẽ từng điểm bằng layer circle; không gom |
| Trang riêng từng tỉnh (giới thiệu, ảnh, số sự kiện, "Xem trên bản đồ"); trang chủ có lưới tỉnh thành | Chỉ có bộ lọc `?city=` trong Khám phá; không có trang thành phố |
| Bản đồ lọc theo tỉnh qua URL (`?tinh=`); danh sách gom theo nhóm, có tìm kiếm | Có `?city=`; chưa đưa từ khoá, loại, quán đang chọn lên URL |
| Sự kiện có thời gian bắt đầu/kết thúc, nhãn **Đang diễn ra / Sắp diễn ra / Đã diễn ra**, mục "Sự kiện gần tôi" | Không có sự kiện, lễ hội ẩm thực hay chợ đêm |
| Trang **Ưu đãi**: miễn phí, giảm giá, lọc theo loại | Không có |
| Chi tiết có: địa chỉ, thời gian, trang chính thức, phương tiện công cộng, "Quan tâm", chia sẻ mạng xã hội, bình luận và đánh giá của người dùng | Có giờ mở, đánh giá Google và nhận xét minh hoạ; chưa có nút chia sẻ, số người đã lưu, đánh giá của người dùng FoodTrip |
| Mỗi trang có og:title, og:image, canonical, hreflang riêng | `index.html` dùng chung một og; chia sẻ link quán hay lịch trình chỉ hiện xem trước chung |
| Bản đồ nền đi qua proxy riêng (`/fe_api/vietmap/...`), không lộ khoá | `VITE_TRACK_ASIA_API_KEY` nằm trong bundle (giới hạn theo domain) |

Không sao chép giao diện, nội dung hay dữ liệu của cmap.vn. Chỉ học ý tưởng tính năng và làm theo phong cách FoodTrip.

## 2. Quy tắc bắt buộc

1. Không đọc, in hay sửa `.env*` hoặc secret. Không push, không deploy, không chạy migration hay ghi dữ liệu lên Supabase thật (`bnxqxraqmyemxfdunhar`). Không gọi API trả phí trong test. Migration mới chỉ viết file và kiểm thử bằng `test/fullSchemaPermissions.test.js` (PGlite).
2. **Dữ liệu phải trung thực.** Không tạo sự kiện, ưu đãi, đánh giá, số lượt quan tâm hay tuyến xe buýt giả. Bảng mới bắt đầu rỗng; giao diện có trạng thái rỗng tử tế. Số đếm lấy từ DB thật qua RPC. Dữ liệu mẫu cho test để trong fixture của test, không nằm trong migration.
3. Quyền: mọi bảng mới bật RLS. Ai được đọc, ghi, duyệt phải ghi trong `test/PERMISSIONS.md` và có test PGlite (khách, người dùng, đối tác đúng hoặc sai cơ sở, admin).
4. Viết code theo phong cách sẵn có: chuỗi VI/EN trong object `C`; token màu và chữ trong `src/index.css` (`.eyebrow`, `--text-*`); chế độ sáng/tối; JS dùng chung đặt ở `supabase/functions/_shared/*.js`.
5. Sau mỗi hạng mục chạy `npm run lint`, `npm test`, `npm run build`. Kiểm tra giao diện ở 375px và 1280px, sáng và tối, VI và EN; console không có lỗi. Trên trình duyệt chỉ dùng chế độ khách hoặc dữ liệu giả lập; không gửi form hay ghi DB thật.
6. Mỗi hạng mục một commit tiếng Việt trên `feat/cmap-inspired`. Không nới hay xoá test để cho qua.

## 3. Việc cần làm, theo thứ tự ưu tiên

### P1-a. Hoàng Sa, Trường Sa trên mọi bản đồ (làm trước)

Bản đồ lãnh thổ Việt Nam xuất bản công khai phải thể hiện hai quần đảo này.

- Kiểm tra nền Track-Asia ở zoom 4–7 trên mọi bản đồ của app: `ExploreMap`, `LiveTripMap`, `PlaceMiniMap`, bản đồ trong planner và tour (tìm mọi chỗ `new Map(`). Ghi lại nền có tự hiện nhãn hay không, kèm ảnh chụp.
- Thêm một module dùng chung (ví dụ `src/lib/mapSovereignty.js`). Module thêm source và layer symbol cho "Quần đảo Hoàng Sa" và "Quần đảo Trường Sa", có bản VI/EN ("Hoang Sa Archipelago (Viet Nam)" / "Truong Sa Archipelago (Viet Nam)"). Hiện ở zoom thấp; không đè lên nhãn của nền nếu nền đã có đúng tên. Toạ độ đặt gần tâm mỗi quần đảo, ghi nguồn toạ độ trong comment.
- Gọi module này ở mọi chỗ tạo bản đồ. Test kiểm tra mọi file khởi tạo `Map` đều gọi module.

### P1-b. Gom điểm trên bản đồ Khám phá

- Source GeoJSON của `ExploreMap` bật `cluster: true` (đặt `clusterMaxZoom` và `clusterRadius` hợp lý). Thêm layer vòng tròn kèm số đếm. Bấm vào cụm thì zoom tới `getClusterExpansionZoom`.
- Khi đã tách thành điểm lẻ, giữ nguyên huy hiệu điểm, nhãn tên, màu theo điểm và hành vi chọn quán hiện có. Không làm hỏng route, vị trí người dùng và `fitBounds`.
- Hàm đổi danh sách quán thành GeoJSON có unit test. Kiểm tra trên trình duyệt với một thành phố có nhiều quán.

### P1-c. Trang thành phố và lưới thành phố ở trang chủ

- Route mới `/thanh-pho/:cityId` (giữ nguyên `cityId` hiện có trong `src/data/destinations.js`). Trang gồm:
  - tên, ảnh và mô tả đã có trong dữ liệu thành phố (không viết thêm mô tả không có nguồn);
  - **số quán thật** của thành phố, đếm qua RPC công khai mới từ `known_places` cộng dữ liệu curated (chỉ trả số đếm, không lộ dữ liệu riêng);
  - món tiêu biểu nếu dữ liệu có sẵn;
  - nút "Xem trên bản đồ" mở `/explore?city=<id>`, "Lên lịch ở đây" mở `/plan` điền sẵn điểm đến, và danh sách tour hoặc khách sạn đối tác đang mở bán ở thành phố (nếu có).
- Trang chủ (`Landing.jsx`): mục "FoodTrip ở các thành phố", lưới thẻ dẫn tới từng trang thành phố, hiện số quán thật. Trước khi tải xong thì không hiện số; lỗi thì ẩn số. Giữ các test của `test/publicContent.test.js`: không có số không nguồn.
- Liên kết trang thành phố từ footer và từ Khám phá.

### P1-d. Đưa trạng thái bản đồ lên URL, chia sẻ, tiêu đề trang

- Explore ghi lên URL: `city`, `q`, `category`, `place` (quán đang mở). Mở một link như vậy phải khôi phục đúng trạng thái. Back/Forward hoạt động, không thêm một mục lịch sử cho mỗi phím gõ.
- Nút **Chia sẻ** dùng chung (component mới): `navigator.share` nếu có, nếu không thì sao chép link và báo "Đã sao chép". Gắn vào trang quán, trang thành phố, trang tour, lịch trình đã chia sẻ và panel quán trên bản đồ. Có thể dùng sẵn `src/lib/shareLink.js` nếu phù hợp.
- Hook `usePageMeta({ title, description, image })` đặt `document.title` và cập nhật thẻ meta description/og ở phía client cho các trang: quán, thành phố, tour, lịch trình đã chia sẻ, cộng đồng. Ghi rõ trong báo cáo: Facebook, Zalo và crawler **không chạy JS**, nên muốn có xem trước khi chia sẻ link thì cần render phía server. Việc đó để ở mục P3-a.

### P2-a. Sự kiện và lễ hội ẩm thực

- Migration mới: bảng `food_events`. Các cột: tiêu đề VI/EN, mô tả, `city_id`, địa chỉ, toạ độ, `starts_at`, `ends_at`, lặp hằng tuần (cho chợ đêm, phố đi bộ: ngày trong tuần và khung giờ), miễn phí hoặc có phí kèm ghi chú giá **do người đăng nhập**, link trang chính thức, ảnh, người tạo, trạng thái duyệt (`pending` / `published` / `hidden`).
- Quyền:
  - admin tạo, sửa, duyệt;
  - đối tác lưu trú hoặc tour được đề xuất sự kiện ở thành phố của mình (vào trạng thái `pending`);
  - công chúng chỉ đọc bản `published`.
- Hàm thuần `eventStatus(event, now)` trả `ongoing` / `upcoming` / `past`, tính theo giờ Việt Nam, xử lý cả sự kiện lặp hằng tuần. Có unit test đầy đủ cho các mốc biên.
- Giao diện:
  - trang `/su-kien`: lọc theo thành phố và trạng thái, mặc định ẩn sự kiện đã qua;
  - lớp sự kiện bật/tắt được trên bản đồ Khám phá, biểu tượng khác với quán;
  - mục "Sự kiện gần bạn" ở trang chủ và trang thành phố, chỉ hỏi vị trí khi người dùng bấm;
  - trang chi tiết có thời gian, địa chỉ, "Xem trên bản đồ", "Thêm vào lịch trình", chia sẻ;
  - tab quản trị để duyệt sự kiện.
- Không thêm sự kiện mẫu vào DB. Khi chưa có sự kiện nào: trạng thái rỗng kèm lời mời đối tác đề xuất.
- Trợ lý chat: thêm hiểu câu "có lễ hội/chợ đêm gì ở X" và trả lời từ `food_events` đã duyệt. Thêm ý định và FAQ theo cách `supabase/functions/_shared/assistant/` đang làm, có test. Không làm giảm số liệu của `node scripts/eval-assistant.js`.

### P2-b. Ưu đãi từ đối tác

- Bảng `partner_offers`: tiêu đề, điều kiện, thời gian hiệu lực, loại (`free` / `discount` / `combo`), gắn với một cơ sở lưu trú hoặc đơn vị tour; chủ đơn vị tạo, admin có thể ẩn.
- Trang `/uu-dai`: chỉ hiện ưu đãi còn hiệu lực, lọc theo thành phố và loại. Thẻ cơ sở hoặc tour trong planner và Khám phá có huy hiệu "Có ưu đãi".
- Ưu đãi chỉ là thông tin. **Không** đổi giá đặt phòng hay số tiền thanh toán trong đợt này; ghi rõ trên giao diện "áp dụng theo xác nhận của cơ sở".
- Thêm mục quản lý ưu đãi vào cổng đối tác (theo `docs/role-portals.md`). Nhân viên chỉ xem; chủ đơn vị được tạo và sửa.

### P2-c. Trang quán: số người đã lưu, đánh giá của người dùng FoodTrip

- RPC công khai trả **số người đã lưu** một quán (chỉ trả số đếm, không trả danh sách người lưu). Hiện "N người đã lưu" khi N ≥ 1, ẩn khi 0.
- Đánh giá của người dùng FoodTrip cho quán: 1–5 sao kèm nhận xét, phải đăng nhập, mỗi người một đánh giá mỗi quán, sửa và xoá được, admin ẩn được. Tên hiển thị rút gọn như phần đánh giá đặt phòng ("Mai T."). Đặt ba nguồn tách bạch: đánh giá FoodTrip, đánh giá Google và nhận xét minh hoạ của dữ liệu mẫu. Không trộn điểm các nguồn với nhau.
- Hiện "Trang chính thức" nếu quán có website. **Không** thêm tuyến xe buýt khi chưa có nguồn dữ liệu.

### P3. Thiết kế trước, chưa bật (cần chủ dự án quyết định hosting)

- **P3-a. Xem trước khi chia sẻ link (OG):** viết thiết kế trong `docs/og-preview.md`. Một endpoint render HTML có thẻ og cho `/place/:id`, `/thanh-pho/:id`, `/tour/:id`, `/trip/:id` (shared), gồm cách nối vào từng phương án hosting (Vercel, Netlify, Cloudflare Pages, Nginx). Có thể viết sẵn function và test của nó, nhưng không bật và không deploy.
- **P3-b. Proxy bản đồ nền:** đánh giá việc chuyển tile và style Track-Asia qua proxy (Edge Function hoặc CDN) để không lộ khoá. Ghi chi phí, độ trễ và quota vào `docs/map-proxy.md`; chưa đổi code chạy thật.

## 4. Không làm

- Không thêm ngôn ngữ thứ ba. Không đổi luồng thanh toán, giá phòng hay giữ chỗ.
- Không cào dữ liệu hay ảnh từ cmap.vn hoặc trang khác.

## 5. Báo cáo khi xong

Ghi `docs/review-cmap-<ngày>.md`:

- Mỗi hạng mục: tệp đã sửa, migration, quyền, test đã thêm, ảnh trước và sau (`docs/screenshots/cmap-<ngày>/`), kết quả lệnh.
- Tách rõ **đã kiểm chứng**, **chưa kiểm chứng** và **cần chủ dự án làm hoặc quyết định**. Danh sách migration mới và thứ tự deploy (frontend trước hay migration trước).
- Riêng P1-a ghi rõ: nền Track-Asia có tự hiện hai quần đảo hay không, và bản đồ nào đã được bổ sung nhãn.
