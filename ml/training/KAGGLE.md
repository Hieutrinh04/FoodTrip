# Train NER trên Kaggle (thay cho Colab)

Kaggle Notebooks cho GPU miễn phí (T4 x2 hoặc P100, khoảng 30 giờ GPU mỗi tuần,
RAM khoảng 30 GB). Mọi thứ chạy trên máy của Kaggle — máy bạn chỉ cần trình duyệt.

## Chuẩn bị (một lần)

1. Tạo tài khoản ở kaggle.com.
2. *Settings* (ảnh đại diện → Settings) → **Phone verification**: xác minh số
   điện thoại. Không xác minh thì không bật được GPU và Internet cho notebook.

## Mỗi lần train

### 1. Tạo gói dữ liệu trên máy

```
node scripts/build-gold-dataset.js --package
```

Tạo `ml/foodtrip-ner-colab-v3.zip` từ các caption **đã duyệt**
(`ml/review/*-reviewed.json`). Chạy thử quy trình khi chưa duyệt:
`--labels suggested --package --allow-silver` → `ml/foodtrip-ner-colab-v3-silver.zip`
(số liệu từ gói này **không** dùng để báo cáo).

### 2. Tải gói lên thành Kaggle Dataset

1. kaggle.com → *Create* → **New Dataset**.
2. Kéo thả file zip vào, đặt tên (ví dụ `foodtrip-ner-v3`), để **Private**.
3. *Create*. Kaggle tự giải nén — không sao, notebook nhận cả hai dạng.

Mỗi lần có dữ liệu mới: mở dataset → *New Version* → tải zip mới lên.

### 3. Mở notebook

1. kaggle.com → *Create* → **New Notebook**.
2. *File* → **Import Notebook** → chọn `ml/notebooks/train_phobert_ner_kaggle.ipynb`.
3. Cột phải *Notebook options* / *Settings*:
   - **Accelerator**: GPU T4 x2 (notebook chỉ dùng 1 GPU, giống lần train baseline).
   - **Internet**: On.
4. *Add Input* → *Your Work / Datasets* → chọn dataset vừa tạo.

### 4. Chạy

- **Cách 1 — theo dõi từng bước:** chạy lần lượt các cell. Cell 2 cài môi
  trường (vài phút, chờ dòng `GPU_SETUP_OK`). Cell 4 là train thật (thường
  30–60 phút trên T4).
- **Cách 2 — chạy nền:** *Save Version* → **Save & Run All (Commit)**. Có thể
  đóng trình duyệt; Kaggle gửi thông báo khi xong. Phiên chạy nền tối đa 12 giờ.

### 5. Lấy kết quả

Tab **Output** của notebook (hoặc của Version nếu chạy nền):
- `metrics.json` — xem nhanh F1 và tỷ lệ bắt nhầm trên caption âm.
- `foodtrip-ner-trained.zip` — model, ONNX, báo cáo lỗi (~0,9 GB).

Tải zip về, giải nén vào `ml/models/<tên-run>/`, rồi làm bước 5–7 trong
`WORKFLOW-V3.md`.

## Gặp lỗi

| Thông báo | Cách xử lý |
| --- | --- |
| `Không có Internet` | Settings → Internet: On (cần xác minh số điện thoại) |
| `Chưa có GPU` | Settings → Accelerator: GPU T4 x2; còn giờ GPU trong tuần không (trang cá nhân → *Quota*) |
| `Không thấy bộ dữ liệu hợp lệ` | *Add Input* chưa chọn dataset, hoặc zip lồng thêm một thư mục bên trong — dùng đúng file do `build-gold-dataset.js` tạo |
| `Data leakage across partitions` | Dữ liệu bị trộn giữa các tập — tạo lại gói bằng `build-gold-dataset.js`, không sửa tay file jsonl |
| Phiên bị ngắt giữa chừng | Chạy lại từ cell 1; checkpoint trong `/tmp` mất khi phiên mới bắt đầu |

## Kiểm tra đã làm trên máy (21/10/2026)

- Notebook tạo từ `scripts/write-ner-kaggle-notebook.cjs`; 7 cell code đều hợp lệ cú pháp.
- Cell 1 thử với `/kaggle/input` giả lập: thư mục đã giải nén ✓, zip nguyên ✓,
  dataset không liên quan → báo lỗi rõ ✓.
- Gói v3 (nhãn gợi ý): `test_preprocessing` 8/8, `check_segmentation` không lỗi,
  `check_tokenization` không cắt câu nào.
- Chưa chạy trên Kaggle thật (cần tài khoản của bạn).
