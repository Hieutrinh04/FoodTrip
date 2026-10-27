# Bước 0 — Bài toán và tiêu chí đạt (NER caption)

## Bài toán

Đầu vào: caption/tiêu đề một video ẩm thực – du lịch (TikTok, YouTube,
Facebook), tiếng Việt, có thể lẫn tiếng Anh, emoji, hashtag.

Đầu ra: các cụm từ được gán nhãn

| Nhãn | Nghĩa | Ví dụ |
| --- | --- | --- |
| BUSINESS | Tên riêng của một cơ sở kinh doanh có địa điểm (quán, nhà hàng, cafe, tiệm, khách sạn, homestay, cửa hàng) | *Bánh Xèo 7 Tới*, *Phở Thìn Bờ Hồ*, *Highlands Coffee* |
| LOC | Tên địa danh: tỉnh/thành, quận/huyện, phường, đường, khu, địa danh nổi tiếng, quốc gia | *Cần Thơ*, *Cái Răng*, *Lê Văn Hưu*, *Hồ Gươm* |

Cách gán chi tiết: `ANNOTATION-GUIDE.md`.

Model chỉ **gợi ý** tên quán. Website vẫn tra cứu để xác minh quán có thật
và người dùng xác nhận; model không tự chốt quán hay tọa độ.

## Tập đánh giá chuẩn (gold)

- Caption thật, **đã được người kiểm tra nhãn** theo `ANNOTATION-GUIDE.md`.
- Tối thiểu 150 caption cho test, trong đó ít nhất 30% là caption âm
  (không nhắc tên quán nào) để đo việc bắt nhầm.
- Tách theo nhóm: cùng một video hoặc cùng một quán không được nằm cả ở
  train lẫn test.
- Tập test được **đóng băng** sau khi duyệt (lưu SHA256). Không dùng test để
  chọn tham số; mọi lựa chọn dựa trên validation. Nếu buộc phải nhìn test để
  quyết định, phải tạo tập test mới cho lần đánh giá cuối.

## Tiêu chí đạt (đề xuất — chủ dự án xác nhận)

| Chỉ số (trên test gold) | Baseline 14/10 (nhãn tự động) | Mức đạt |
| --- | ---: | ---: |
| F1 BUSINESS (theo cụm, seqeval) | 12,5% | **≥ 70%** |
| F1 LOC | 65,8% | **≥ 80%** |
| Caption âm bị bắt nhầm ≥ 1 BUSINESS | chưa đo | **≤ 10%** |
| So với luồng hiện tại (`detect-place`): tìm đúng quán trong 3 gợi ý đầu | chưa đo | **không thấp hơn** luồng hiện tại |
| Thời gian suy luận CPU / caption ≤ 256 token | chưa đo | **≤ 500 ms** |
| ONNX khớp PyTorch (logits, rtol/atol 1e-3) | đạt | đạt |

Chưa đạt toàn bộ bảng trên thì model chỉ dùng thử nghiệm, không thay luồng
đang chạy trên website.

## Quy trình mỗi phiên bản

1. Dữ liệu: thu thập → gán nhãn gợi ý → người duyệt → đóng gói (hash).
2. Train trên Colab (T4), chọn checkpoint theo F1 validation thật.
3. Đánh giá trên test gold, phân tích lỗi, ghi `REPORT-<ngày>.md`.
4. Xuất ONNX + kiểm tra khớp; benchmark với `detect-place`.
5. So với phiên bản trước; chỉ giữ bản tốt hơn trên test gold.
