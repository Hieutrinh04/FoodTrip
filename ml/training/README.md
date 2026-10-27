# FoodTrip — train PhoBERT NER trên Colab

Đây là baseline nhận diện BUSINESS/LOC từ caption, không phải AI tự tạo lịch
trình, tọa độ, thời tiết hay giá phòng. Không có khóa bí mật trong bộ chạy.

## Chuẩn bị trên máy

`node scripts/package-ner-colab.js` tạo `ml/colab-package/`, giữ nguyên dữ liệu
gốc. Bản mới dedupe NFC/case, kiểm tra BIO, ghép nhóm tên quán/alias/video và
giữ nhóm trong một partition. Real validation/test có ưu tiên hơn templates.
`dataset-report.json` có số liệu, hash và hạn chế; không coi nhãn tự động là gold.

## Chạy trên Colab

1. Upload `ml/notebooks/train_phobert_ner.ipynb` vào Colab.
2. Người dùng tự đăng nhập, chọn Runtime → Change runtime type → T4 GPU.
   Không cần đăng nhập Hugging Face hoặc đưa API key. Không tự mua GPU trả phí.
3. Cell upload: chọn `foodtrip-ner-colab.zip` (chỉ chứa data và training code).
4. Chạy từng cell. GPU thiếu hoặc smoke test lỗi: dừng, không chạy full train.
   Cell môi trường tạo Python 3.12 riêng bằng uv, không cần ensurepip của Python
   mặc định Colab. Khi notebook cũ lỗi ở `python -m venv`, thay toàn bộ cell mục 2
   bằng nội dung `ml/training/setup_colab.py`; ZIP cũ vẫn dùng được, không cần
   restart runtime. Chờ dòng `GPU_SETUP_OK` mới chạy mục 3.
5. Chạy full train 6 epochs tối đa; early stopping và checkpoint tốt nhất theo
   F1 validation REAL. Smoke chỉ 2 bước, không xuất model/kết luận chất lượng.
6. Đọc metrics.json và *-errors.json. Test thực và template báo riêng, không
   tối ưu lại hyperparameters từ test. Không tự đưa model lên website.
7. Xuất ONNX, kiểm tra logits với PyTorch và tải model + metadata + preprocessing.

Chạy bằng CLI sau khi giải nén:

```
python train_ner.py --data data --output runs/smoke --smoke
python train_ner.py --data data --output runs/baseline --export-onnx
python train_ner.py --data data --output runs/baseline --evaluate-only --export-onnx
```

Nếu ONNX đã có nhưng thiếu `onnx/export-check.json`, upload riêng
`ml/training/check_onnx.py` vào Colab và chạy bằng Python của venv:

```
python check_onnx.py --bundle runs/baseline --write-report
```

Lệnh chỉ so sánh ONNX hiện có với safetensors đã lưu (3 độ dài câu và batch 2),
không train lại hay ghi đè model. In rõ từng bước và chỉ tạo báo cáo khi tất cả
kiểm tra đạt, không ghi đè báo cáo cũ. Cần Colab GPU; không nạp đồng thời hai bản
model trên máy local thiếu RAM. Parity đạt không có nghĩa chất lượng NER đã đạt.

Đã có checkpoint thì dùng `--resume`; không ghi đè model cũ mặc định.
Nếu model đã lưu nhưng lỗi ở báo cáo/ONNX, dùng `--evaluate-only`, không train
lại. Lệnh này kiểm tra hash dữ liệu và đọc model local, không thay weights hay
checkpoint. Báo cáo seqeval có số NumPy; mã mới chuyển đúng sang số JSON.
Runtime Colab có thể hết hạn và file tạm mất khi disconnect; hãy tải kết quả sau khi chạy.
Sao lưu checkpoint vào Drive là lựa chọn riêng, không tự mount/tải dữ liệu lên Drive.

## Chưa đủ để công bố production

- Train phần lớn là templates, real validation/test nhỏ và nhãn còn weak supervision.
- Tách từ cũ gộp nhầm ranh giới BIO ở nhiều câu. Baseline mới giữ markers tách từ
  nhưng BPE theo âm tiết, bảo toàn nhãn và áp dụng y hệt khi inference. Đây không
  phải tokenizer nguyên từ chuẩn PhoBERT; phải benchmark chất lượng thực tế.
- Chưa có tập caption âm human-reviewed; không tự gán O cho caption chưa biết tên.
- Cần review thủ công nhãn, tăng caption thật và benchmark với search hiện tại.
- NER không xác thực quán/tọa độ; giữ bước tra cứu và người dùng xác nhận.
- Serve bằng dịch vụ Python riêng với cùng ner_preprocessing.py; không mặc định
  nạp model 135M parameters trực tiếp vào Supabase Edge.

Thư viện trong venv riêng của runtime: Torch 2.6.0 CUDA 12.4, Transformers 4.57.6,
Underthesea 8.3.0, Accelerate 1.12.0. Phiên bản thực được lưu trong run-info.json.
Model gốc VinAI/PhoBERT (MIT), revision cố định; không trust_remote_code.
