# Quy trình train NER phiên bản 3

Tiêu chí: `CRITERIA.md`. Cách gán nhãn: `ANNOTATION-GUIDE.md`.

| # | Bước | Lệnh / công cụ | Trạng thái 14/10/2026 |
| --- | --- | --- | --- |
| 0 | Tiêu chí đạt | `CRITERIA.md` | Đã viết — chờ chủ dự án xác nhận các ngưỡng |
| 1 | Thu thập caption | `node scripts/crawl-caption-candidates.js --venues N --queries M` | Chạy thử: 215 caption mới (34 TikTok, 181 caption chung), ≈60 credit |
| 2 | Gợi ý nhãn + người duyệt | `ml/review/suggestions/*.json` → `node ml/review/build-review-set.mjs <split> <prefix>` → mở `ml/review/review.html` | 437 caption có nhãn gợi ý — **chờ người duyệt** |
| 3 | Đóng gói | `node scripts/build-gold-dataset.js --package` | Chạy thử bằng nhãn gợi ý; chờ nhãn đã duyệt |
| 4 | Train trên Kaggle (hoặc Colab) | `ml/notebooks/train_phobert_ner_kaggle.ipynb` + `foodtrip-ner-colab-v3.zip` — xem `KAGGLE.md` | Chờ bước 3 |
| 5 | Đánh giá, phân tích lỗi | `node ml/review/rescore.mjs <run> test --labels gold` | Công cụ xong; đã phân tích baseline |
| 6 | ONNX | tự chạy trong notebook (`check_onnx.py`) | Như baseline |
| 7 | So với luồng hiện tại | `node scripts/benchmark-detect-place.js --data … --errors <run>/test-errors.json` | Công cụ xong; chạy thử 10 caption |
| 8 | Lặp lại | quay lại bước 1–2 | — |
| 9 | Dịch vụ | `ml/service/ner_service.py` | Đã viết + test; **không** nối vào website khi chưa đạt bước 0 |

## Duyệt nhãn (bước 2)

1. Mở `ml/review/review.html` bằng trình duyệt (bấm đúp file).
2. Nhập tên người duyệt, chọn file `test-review.json` (rồi `val`, `new`, `train`).
3. Mỗi caption: sửa nhãn nếu cần — bấm token đầu, Shift + bấm token cuối,
   phím `B` tên quán, `L` địa danh, `O` bỏ nhãn — rồi `Enter` (duyệt),
   `R` (cần xem lại) hoặc `X` (loại bỏ).
4. Bấm **Xuất file đã duyệt**, lưu thành `ml/review/<tập>-reviewed.json`.

Tiến độ được trình duyệt nhớ; có thể duyệt nhiều lần. Ưu tiên `test` và `val`
trước (đó là thước đo), rồi `new`, cuối cùng `train`.

## Đóng gói và train (bước 3–4)

```
node scripts/build-gold-dataset.js --package
```

Chỉ caption *Đã duyệt* được dùng. Lệnh tạo luôn `ml/foodtrip-ner-colab-v3.zip`.
Train trên Kaggle theo `KAGGLE.md` (hoặc upload vào notebook Colab như baseline).

## Sau khi train (bước 5–7)

Giải nén `foodtrip-ner-trained.zip` vào `ml/models/<tên-run>/`, rồi:

```
node scripts/benchmark-detect-place.js --data ml/datasets/v3/test.jsonl --errors ml/models/<tên-run>/test-errors.json
```

`metrics.json` có thêm `negative_captions` (tỷ lệ bắt nhầm trên caption
không có quán). Ghi kết quả vào `REPORT-<ngày>.md` theo mẫu `BASELINE-20261014.md`.

## Thay đổi kỹ thuật trong v3

- Tokenizer v2 (JS `scripts/lib/captionTokens.js`, Python
  `tokenize_caption`): tách cả dấu nằm giữa từ (`To/Đà`, `Nẵng,ăn`,
  `Hạnh-Huế`, `XOFA_Xofa`). Cùng bộ ca `tokenizer-cases.json`. Model ghi
  `caption_tokenizer: 2` vào `preprocessing.json`; model cũ vẫn chạy bản 1.
- Validation/test nhận mọi nguồn caption thật (`youtube-real`,
  `tiktok-real`, `video-real`).
- `metrics.json` đo thêm tỷ lệ bắt nhầm trên caption âm.
- Chia tập theo nhóm quán (bỏ dấu, bỏ "quán / nhà hàng…"), video và nhóm cũ;
  kiểm tra rò rỉ trước khi ghi.
