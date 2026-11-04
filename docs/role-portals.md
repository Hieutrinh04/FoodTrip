# Kiểm tra giao diện theo vai trò

Các màn hình vận hành dùng quyền theo từng cơ sở/đơn vị; quyền trên máy chủ vẫn là nguồn quyết định cuối cùng.

## Luồng dùng chung

- Menu tài khoản trên máy tính và điện thoại có mục **Tài khoản & công việc** (`/account`). Đăng nhập tại một trang cần quyền sẽ tiếp tục ngay tại trang đó, giữ mục đích ban đầu của người dùng.
- Trang tài khoản luôn có lịch trình, địa điểm đã lưu và đặt chỗ cá nhân. Các thẻ công việc chỉ xuất hiện từ quyền đã xác minh: admin, từng cơ sở lưu trú, từng đơn vị tour và đoàn hướng dẫn.
- Thanh chuyển khu vực trên các trang cá nhân/cổng vận hành cho phép quay về tài khoản, đổi cơ sở/đơn vị hoặc về Khám phá. Vai trò chủ tại một cơ sở không biến thành quyền chủ tại cơ sở khác.
- Admin, chủ/nhân viên lưu trú, chủ/quản lý tour và hướng dẫn viên dùng chung khung điều hướng; mục đang mở nằm trên URL, hỗ trợ tải lại và Back/Forward. Menu dài cuộn được theo chiều cao màn hình, thanh mục nằm ngang trên điện thoại.
- Tài khoản kiêm quản lý tour và hướng dẫn viên có lối vào riêng `?view=guide`, không bị đưa nhầm về đơn vị quản lý. Hồ sơ đăng ký đối tác có lối vào riêng `?view=application`.
- Kho phòng dẫn trực tiếp đến Hồ sơ cơ sở để mở bán, thay cho hướng dẫn đến một nút ở tab khác. Lịch giá phân biệt đang tải, lỗi, chưa có điều chỉnh riêng.
- Các cổng dùng chung kích thước điều khiển, trạng thái vô hiệu hoá, focus bàn phím, màu và nền theo giao diện sáng/tối. Menu tài khoản hỗ trợ phím mũi tên, Home/End và Escape; có liên kết bỏ qua điều hướng đến nội dung.

| Vai trò | Giao diện và thay đổi đã kiểm tra |
| --- | --- |
| Quản trị viên | Giữ mục quản trị qua URL, hỗ trợ Back/Forward, tải lại khi kiểm tra quyền thất bại; chặn chuyển trang danh sách khi đang tải. |
| Chủ cơ sở lưu trú | Giữ cơ sở đang chọn qua URL; tải đặt phòng, kho phòng, tài chính, nhân sự và hồ sơ với trạng thái tải/lỗi rõ ràng; có nút thử lại. |
| Nhân viên lưu trú | Không hiện thẻ tổng doanh thu, mục đối soát hoặc nhân sự; kho phòng chỉ đọc. |
| Chủ đơn vị tour | Giữ đơn vị đang chọn qua URL; hồ sơ, điều khoản và checklist công bố phân biệt lỗi tải với chưa hoàn thiện. |
| Quản lý tour | Chỉ vận hành đơn vị được giao; không sửa hồ sơ/điều khoản hoặc quản lý nhân sự như chủ đơn vị. |
| Hướng dẫn viên | Tìm đoàn theo tên tour, điểm hẹn hoặc tên khách; lọc hôm nay theo giờ Việt Nam, gồm đoàn qua đêm đang diễn ra; chỉ xem đoàn được giao. |

Khi đổi cơ sở/đơn vị, dữ liệu tải bất đồng bộ và trạng thái biểu mẫu được tách theo phạm vi, tránh hiện kết quả của đơn vị trước. Các lỗi tải không bị chuyển thành danh sách trống hoặc checklist 0 mục. Đăng ký đối tác yêu cầu tải được điều khoản trước khi đồng ý và gửi hồ sơ.

## Xác minh

- `npm test`: kiểm thử quyền theo tenant, kho phòng, tour, dữ liệu riêng của hướng dẫn viên và các chức năng hiện có.
- `test/rolePortals.test.js`: kiểm thử chọn tab/cơ sở hợp lệ, ngày Việt Nam, tìm kiếm không dấu và render HTML thật của các thành phần theo vai trò. Kiểm tra nhân viên không hiện doanh thu/thêm phòng; lỗi có nút thử lại; checklist chưa tải không báo 0 mục.
- `test/workspaces.test.js`: kiểm thử đủ các vai trò, quyền chưa xác minh, scope URL, cơ sở tạm khoá và tài khoản kiêm quản lý/hướng dẫn viên. Render thẻ công việc bằng tiếng Việt/Anh trong kiểm thử giao diện.
- `npm run lint` và `npm run build`.

Chưa xác minh trực quan trên trình duyệt bằng phiên đăng nhập thật của từng vai trò. Browser automation đang bị tắt trong Work settings; kiểm thử render HTML không thay thế kiểm tra bố cục, focus và thao tác trên thiết bị thật.
