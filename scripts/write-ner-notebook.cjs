// Generate the Colab notebook from reviewed source. Training runs only after
// the human selects a GPU and uploads the explicitly packaged public dataset.
const fs = require('fs')
const path = require('path')
const md = (source) => ({cell_type:'markdown',metadata:{},source:source.trim()})
const code = (source) => ({cell_type:'code',metadata:{},execution_count:null,outputs:[],source:source.trim()})
const cells = [
md(`# FoodTrip — PhoBERT NER baseline trên GPU
Nhận diện tên quán (BUSINESS) và địa danh (LOC), **không phải AI tạo lịch trình**.
Dùng dữ liệu v2: không trùng tên/câu/video giữa các partition; validation/test chỉ caption thật.
Nhãn vẫn weak supervision, chưa chứng nhận production. Dữ liệu gốc trên máy giữ nguyên.
Chọn **Runtime → Change runtime type → T4 GPU** rồi chạy từng cell.
Không tự mua GPU, không cần API key/Hugging Face login, không mount Drive.
Notebook cài thư viện trong venv riêng để không phá thư viện có sẵn của Colab.
`),
md('## 1. Upload bộ chạy\nChọn **foodtrip-ner-colab-v3.zip** (hoặc bản cũ foodtrip-ner-colab.zip). File chỉ có training code và caption public, không có .env hoặc dữ liệu tài khoản.'),
code(`from google.colab import files
from pathlib import Path
import io, json, sys, subprocess, zipfile

uploaded = files.upload()
if len(uploaded) != 1:
    raise ValueError("Chọn đúng một file foodtrip-ner-colab-v3.zip")
archive_name, archive_bytes = next(iter(uploaded.items()))
if not archive_name.lower().endswith(".zip"):
    raise ValueError("Cần file .zip, không phải notebook hoặc thư mục")
WORK = Path("/content/foodtrip-ner")
WORK.mkdir(exist_ok=True)
required = {"ner_preprocessing.py", "test_preprocessing.py", "check_segmentation.py", "check_tokenization.py", "train_ner.py", "requirements-colab.txt", "README.md",
            "data/train.jsonl", "data/val.jsonl", "data/test.jsonl", "data/val_template.jsonl", "data/test_template.jsonl",
            "data/labels.json", "data/quarantine.jsonl", "data/dataset-report.json"}
# v3 also ships the tokenizer test cases and the ONNX parity check.
allowed = required | {"tokenizer-cases.json", "check_onnx.py"}
with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
    names = {p.filename for p in archive.infolist() if not p.is_dir()}
    if not (required <= names <= allowed) or sum(p.file_size for p in archive.infolist()) > 20_000_000:
        raise ValueError("Nội dung ZIP không đúng bộ train cho phép; không giải nén")
    for name in names:
        target = WORK / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(name))
del uploaded, archive_bytes
print(json.dumps(json.loads((WORK / "data/dataset-report.json").read_text()), ensure_ascii=False, indent=2))
`),
md('## 2. Môi trường GPU riêng\nDùng uv tạo Python 3.12 riêng, không phụ thuộc venv/ensurepip của Python mặc định Colab. Nếu Colab yêu cầu đăng nhập hoặc kết nối, bạn thực hiện. Không chọn mua compute. Chờ GPU_SETUP_OK trước khi tiếp tục.'),
code(fs.readFileSync(path.join(__dirname,'..','ml','training','setup_colab.py'),'utf8')),
md('## 3. Kiểm tra nhãn/tách từ và smoke test\nSmoke chỉ hai bước, **không phải train xong**. Có lỗi thì không chạy cell tiếp theo.'),
code(`run([PY, str(WORK / "test_preprocessing.py")], cwd=WORK)
run([PY, str(WORK / "check_segmentation.py"), "--data", "data"], cwd=WORK)
run([PY, str(WORK / "check_tokenization.py"), "--data", "data"], cwd=WORK)
run([PY, str(WORK / "train_ner.py"), "--data", "data", "--output", "runs/smoke", "--smoke"], cwd=WORK)
`),
md('## 4. Full fine-tune\nBatch 4 × accumulation 4; FP16 và gradient checkpointing. Tối đa 6 epochs, early stopping theo real validation. Thời gian tùy GPU; không bảo đảm 10–15 phút.'),
code(`if not (WORK / "runs/smoke/smoke-passed.json").exists():
    raise RuntimeError("Smoke test chưa qua")
command = [PY, str(WORK / "train_ner.py"), "--data", "data", "--output", "runs/baseline", "--export-onnx"]
RESUME = False  # Đổi True chỉ khi muốn tiếp tục checkpoint của chính lần chạy này.
if RESUME:
    command.append("--resume")
run(command, cwd=WORK)
`),
md('## 5. Xem kết quả\nBáo riêng test caption thật và test_template. Không điều chỉnh mô hình theo test. Kiểm tra BUSINESS/LOC precision, recall, F1 và file lỗi.'),
code(`RESULT = WORK / "runs/baseline"
metrics_path = RESULT / "metrics.json"
if not metrics_path.exists():
    raise RuntimeError("Chưa có kết quả full train")
print(json.dumps(json.loads(metrics_path.read_text()), ensure_ascii=False, indent=2))
print("Model:", RESULT / "model")
print("ONNX:", RESULT / "onnx")
`),
md('## 6. Tải model và báo cáo\nKhông kèm optimizer/checkpoint để tránh ZIP quá lớn. Colab có thể mất file khi runtime hết hạn; tải sau khi chạy. Chưa tự triển khai lên FoodTrip.'),
code(`bundle = Path("/content/foodtrip-ner-trained.zip")
with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for item in RESULT.rglob("*"):
        if item.is_file() and "checkpoints" not in item.relative_to(RESULT).parts:
            archive.write(item, item.relative_to(RESULT))
    archive.write(WORK / "ner_preprocessing.py", "ner_preprocessing.py")
    archive.write(WORK / "requirements-colab.txt", "requirements-colab.txt")
    archive.write(WORK / "data/dataset-report.json", "dataset-report.json")
files.download(str(bundle))
`),
md(`## Sau khi train
Mang foodtrip-ner-trained.zip về dự án để kiểm tra metrics, lỗi, tốc độ và tích hợp API Python.
Không nạp thẳng model này vào Supabase Edge. detect-place hiện dùng search, không gọi Anthropic như notebook cũ mô tả.
Giữ bước tra cứu địa điểm thật và người dùng xác nhận. Model không cung cấp tọa độ thật.
Không coi baseline weak-supervised là chất lượng đã duyệt; cần thêm caption thật/âm và kiểm tra nhãn.
`),
]
const notebook = {cells:cells.map((c,i)=>({...c,id:'foodtrip-'+i})),metadata:{accelerator:'GPU',colab:{provenance:[],gpuType:'T4'},kernelspec:{display_name:'Python 3',name:'python3'},language_info:{name:'python'}},nbformat:4,nbformat_minor:5}
const out = path.join(__dirname,'..','ml','notebooks','train_phobert_ner.ipynb')
fs.writeFileSync(out,JSON.stringify(notebook,null,1)+'\n')
console.log('Wrote '+cells.length+' cells: '+out)
