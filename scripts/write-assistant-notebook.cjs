// Generates ml/notebooks/train_assistant.ipynb: train the FoodTrip assistant
// (intent + slots) on a Colab T4 from ml/foodtrip-assistant-colab.zip.
// The GPU environment cell is the NER one (ml/training/setup_colab.py), pointed
// at this notebook's own folder.
const fs = require('fs')
const path = require('path')
const md = (source) => ({ cell_type: 'markdown', metadata: {}, source: source.trim() })
const code = (source) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: source.trim() })

const setup = fs.readFileSync(path.join(__dirname, '..', 'ml', 'training', 'setup_colab.py'), 'utf8')
  .replaceAll('/content/foodtrip-ner-py312', '/content/foodtrip-assistant-py312')
  .replaceAll('/content/foodtrip-ner', '/content/foodtrip-assistant')
  .replace('Chạy cell upload foodtrip-ner-colab.zip trước', 'Chạy cell upload foodtrip-assistant-colab.zip trước')
  .replace('tiếp tục mục 3. Kiểm tra nhãn/tách từ và smoke test', 'tiếp tục mục 3. Kiểm tra và smoke test')

const cells = [
  md(`# FoodTrip — Trợ lý AI: hiểu câu hỏi & yêu cầu lên lịch
Một mô hình PhoBERT, hai đầu ra: **ý định** của câu (lên lịch, sửa lịch, hỏi thanh toán, hoàn tiền, tour…) và **thông tin trong câu** (điểm đến, số ngày, ngày đi, ngân sách, số người, phương tiện, sở thích, món, quán, ngày trong lịch).
Lịch trình vẫn do thuật toán của FoodTrip xếp; mô hình chỉ đọc hiểu câu người dùng.
Chọn **Runtime → Change runtime type → T4 GPU** rồi chạy từng cell. Không cần API key hay đăng nhập Hugging Face.`),
  md('## 1. Upload bộ chạy\nChọn **foodtrip-assistant-colab.zip** (tạo bằng `node scripts/package-assistant-colab.js`). File chỉ có code train và dữ liệu câu mẫu, không có .env hay dữ liệu tài khoản.'),
  code(`from google.colab import files
from pathlib import Path
import io, json, zipfile

uploaded = files.upload()
if len(uploaded) != 1:
    raise ValueError("Chọn đúng một file foodtrip-assistant-colab.zip")
archive_name, archive_bytes = next(iter(uploaded.items()))
if not archive_name.lower().endswith(".zip"):
    raise ValueError("Cần file .zip")
WORK = Path("/content/foodtrip-assistant")
WORK.mkdir(exist_ok=True)
allowed = {"assistant_model.py", "train_assistant.py", "train_retriever.py", "test_assistant.py", "assistant_infer.py", "requirements-colab.txt", "ner_preprocessing.py",
           "data/train.jsonl", "data/validation.jsonl", "data/test.jsonl", "data/real_test.jsonl", "data/labels.json", "data/baseline.json",
           "data/faq_entries.jsonl", "data/faq_train.jsonl", "data/faq_validation.jsonl", "data/faq_test.jsonl", "data/faq_baseline.json"}
with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
    names = {p.filename for p in archive.infolist() if not p.is_dir()}
    if names != allowed or sum(p.file_size for p in archive.infolist()) > 20_000_000:
        raise ValueError(f"Nội dung ZIP không đúng bộ train; thiếu {sorted(allowed - names)}, thừa {sorted(names - allowed)}")
    for name in names:
        target = WORK / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(name))
del uploaded, archive_bytes
for split in ("train", "validation", "test", "real_test"):
    print(split, sum(1 for _ in (WORK / f"data/{split}.jsonl").open(encoding="utf-8")), "câu")
print("Mốc bộ luật:", json.loads((WORK / "data/baseline.json").read_text())["real_test"]["intent_accuracy"])
print("Mốc tìm câu trả lời bằng từ ngữ:", json.loads((WORK / "data/faq_baseline.json").read_text()))
`),
  md('## 2. Môi trường GPU riêng\nCài Python 3.12 và thư viện trong venv riêng (giống notebook NER). Chờ **GPU_SETUP_OK** rồi mới chạy tiếp.'),
  code(setup),
  md('## 3. Kiểm tra và smoke test\nKiểm tra mã hóa/nhãn và dữ liệu, rồi chạy thử 3 bước train — **chưa phải train thật**. Có lỗi thì dừng.'),
  code(`run([PY, str(WORK / "test_assistant.py"), "data"], cwd=WORK)
run([PY, str(WORK / "train_assistant.py"), "--data", "data", "--output", "runs/smoke", "--smoke"], cwd=WORK)
run([PY, str(WORK / "train_retriever.py"), "--data", "data", "--output", "runs/retriever-smoke", "--smoke"], cwd=WORK)
`),
  md('## 4. Train\nTối đa 10 epoch, dừng sớm theo validation (trung bình độ đúng ý định và F1 thông tin). Trên T4 thường khoảng 10–20 phút.'),
  code(`if not (WORK / "runs/smoke/smoke-passed.json").exists():
    raise RuntimeError("Smoke test chưa qua")
run([PY, str(WORK / "train_assistant.py"), "--data", "data", "--output", "runs/assistant", "--export-onnx"], cwd=WORK)
`),
  md('## 5. Kết quả\nSo với bộ luật trên tập test (cách nói chưa gặp khi train) và 100 câu viết tay. Không chỉnh mô hình theo tập test.'),
  code(`RESULT = WORK / "runs/assistant"
print((RESULT / "REPORT.md").read_text())
errors = json.loads((RESULT / "errors.json").read_text())
print(len(errors), "câu sai (ý định hoặc thông tin). 15 câu đầu:")
for e in errors[:15]:
    print("-", e["text"], "| đúng:", e["intent"], "| đoán:", e["predicted"])
`),
  md('## 5b. Train bộ tìm câu trả lời\nTinh chỉnh bộ mã hóa câu tiếng Việt để mỗi câu hỏi tìm đúng mục hỏi–đáp của FoodTrip. Vài phút trên T4. So với cách so khớp từ ngữ đang chạy và với bộ mã hóa chưa tinh chỉnh.'),
  code(`if not (WORK / "runs/retriever-smoke/smoke-passed.json").exists():
    raise RuntimeError("Smoke test của bộ tìm câu trả lời chưa qua")
run([PY, str(WORK / "train_retriever.py"), "--data", "data", "--output", "runs/retriever", "--export-onnx"], cwd=WORK)
print((WORK / "runs/retriever/RETRIEVER.md").read_text())
`),
  md('## 6. Thử một câu'),
  code(`run([PY, str(WORK / "assistant_infer.py"), str(RESULT / "onnx"), "cuối tuần này đi Đà Lạt 2 người, 3 triệu, thích cà phê"], cwd=WORK)
`),
  md('## 7. Tải mô hình về\nGói gồm hai mô hình ONNX (đọc câu, tìm câu trả lời) + tokenizer + cấu hình cho Hugging Face Space, và các báo cáo. Colab có thể xoá file khi hết phiên — tải ngay.'),
  code(`bundle = Path("/content/foodtrip-assistant-trained.zip")
with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for item in (RESULT / "onnx").rglob("*"):
        if item.is_file():
            archive.write(item, Path("onnx") / item.relative_to(RESULT / "onnx"))
    for name in ("metrics.json", "errors.json", "REPORT.md"):
        archive.write(RESULT / name, name)
    RETRIEVER = WORK / "runs/retriever"
    if (RETRIEVER / "onnx/retriever.onnx").exists():
        for item in (RETRIEVER / "onnx").rglob("*"):
            if item.is_file():
                archive.write(item, Path("retriever") / item.relative_to(RETRIEVER / "onnx"))
        for name in ("retriever-metrics.json", "retriever-errors.json", "RETRIEVER.md"):
            archive.write(RETRIEVER / name, name)
files.download(str(bundle))
`),
  md(`## Sau khi train
Giải nén **foodtrip-assistant-trained.zip**, chép thư mục \`onnx\` vào \`ml/assistant/space/model\` rồi làm theo \`ml/assistant/space/README.md\` để đưa lên Hugging Face Space.
FoodTrip vẫn chạy bằng bộ luật cho tới khi Space được cấu hình (\`ASSISTANT_MODEL_URL\`).`),
]
const notebook = { cells: cells.map((c, i) => ({ ...c, id: 'assistant-' + i })), metadata: { accelerator: 'GPU', colab: { provenance: [], gpuType: 'T4' }, kernelspec: { display_name: 'Python 3', name: 'python3' }, language_info: { name: 'python' } }, nbformat: 4, nbformat_minor: 5 }
const out = path.join(__dirname, '..', 'ml', 'notebooks', 'train_assistant.ipynb')
fs.writeFileSync(out, JSON.stringify(notebook, null, 1) + '\n')
console.log('Wrote ' + cells.length + ' cells: ' + out)
