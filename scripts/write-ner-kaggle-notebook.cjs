// Generate the Kaggle notebook (same training as the Colab one, see
// write-ner-notebook.cjs). Differences: the data comes in as a Kaggle Dataset
// under /kaggle/input instead of an upload prompt, the environment and the run
// live under /tmp, one GPU is used, and the trained bundle is written to
// /kaggle/working so "Save Version → Save & Run All" keeps it as output.
const fs = require('fs')
const path = require('path')
const md = (source) => ({ cell_type: 'markdown', metadata: {}, source: source.trim() })
const code = (source) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: source.trim() })

const cells = [
md(`# FoodTrip — PhoBERT NER trên Kaggle GPU
Nhận diện tên quán (BUSINESS) và địa danh (LOC) trong caption video, **không phải AI tạo lịch trình**.

**Trước khi chạy** (cột phải → *Settings*):
1. *Accelerator*: **GPU T4 x2** (notebook chỉ dùng 1 GPU, giống lần train baseline).
2. *Internet*: **On** — cần tài khoản Kaggle đã xác minh số điện thoại.
3. *Add Input* → chọn dataset chứa **foodtrip-ner-colab-v3.zip** (bạn tải lên ở bước chuẩn bị).

Chạy lần lượt từng cell, hoặc *Save Version → Save & Run All* để chạy nền (tắt trình duyệt vẫn chạy).
Kết quả nằm ở tab *Output*: **foodtrip-ner-trained.zip** và **metrics.json**.
Không cần API key, không đăng nhập Hugging Face. Dữ liệu chỉ gồm caption công khai và code train.
`),
md('## 1. Tìm bộ dữ liệu trong /kaggle/input\nKaggle tự giải nén file zip khi tạo dataset; cell này nhận cả thư mục đã giải nén lẫn file zip còn nguyên, và từ chối nếu nội dung không đúng bộ train cho phép.'),
code(`from pathlib import Path
import io, json, os, shutil, sys, subprocess, zipfile

INPUT, WORK, OUT = Path("/kaggle/input"), Path("/tmp/foodtrip-ner"), Path("/kaggle/working")
required = {"ner_preprocessing.py", "test_preprocessing.py", "check_segmentation.py", "check_tokenization.py", "train_ner.py", "requirements-colab.txt", "README.md",
            "data/train.jsonl", "data/val.jsonl", "data/test.jsonl", "data/val_template.jsonl", "data/test_template.jsonl",
            "data/labels.json", "data/quarantine.jsonl", "data/dataset-report.json"}
allowed = required | {"tokenizer-cases.json", "check_onnx.py"}
LIMIT = 20_000_000

def listing(root):
    return {p.relative_to(root).as_posix(): p.stat().st_size for p in root.rglob("*") if p.is_file()}

source = None
for root in sorted({p.parent for p in INPUT.rglob("train_ner.py")}):
    files = listing(root)
    if required <= set(files) <= allowed and sum(files.values()) <= LIMIT:
        source = ("dir", root); break
if source is None:
    for archive_path in sorted(INPUT.rglob("*.zip")):
        with zipfile.ZipFile(archive_path) as archive:
            files = {i.filename: i.file_size for i in archive.infolist() if not i.is_dir()}
        if required <= set(files) <= allowed and sum(files.values()) <= LIMIT:
            source = ("zip", archive_path); break
if source is None:
    raise ValueError("Không thấy bộ dữ liệu hợp lệ trong /kaggle/input. Add Input → dataset chứa foodtrip-ner-colab-v3.zip "
                     "(nội dung zip phải là các file train, không lồng thêm thư mục).")

if WORK.exists():
    shutil.rmtree(WORK)
WORK.mkdir(parents=True)
if source[0] == "dir":
    for name in files:
        (WORK / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source[1] / name, WORK / name)
else:
    with zipfile.ZipFile(source[1]) as archive:
        for name in files:
            (WORK / name).parent.mkdir(parents=True, exist_ok=True)
            (WORK / name).write_bytes(archive.read(name))
print("Bộ dữ liệu:", source[1])
report = json.loads((WORK / "data/dataset-report.json").read_text())
print(json.dumps({k: report.get(k) for k in ["version", "labels", "counts", "negative_captions", "caption_tokenizer"]}, ensure_ascii=False, indent=2))
if str(report.get("labels", "")).startswith("SILVER"):
    print("⚠ Nhãn SILVER (chưa người duyệt): chỉ chạy thử quy trình, không dùng số liệu để báo cáo chất lượng.")
`),
md('## 2. Môi trường GPU riêng\nPython 3.12 riêng bằng uv, cùng phiên bản thư viện như lần train baseline. Mất vài phút. Chờ dòng **GPU_SETUP_OK**.'),
code(fs.readFileSync(path.join(__dirname, '..', 'ml', 'training', 'setup_kaggle.py'), 'utf8')),
md('## 3. Kiểm tra nhãn/tách từ và smoke test\nSmoke chỉ hai bước, **không phải train xong**. Có lỗi thì dừng, không chạy cell tiếp theo.'),
code(`run([PY, str(WORK / "test_preprocessing.py")], cwd=WORK)
run([PY, str(WORK / "check_segmentation.py"), "--data", "data"], cwd=WORK)
run([PY, str(WORK / "check_tokenization.py"), "--data", "data"], cwd=WORK)
run([PY, str(WORK / "train_ner.py"), "--data", "data", "--output", "runs/smoke", "--smoke"], cwd=WORK, env=GPU_ENV)
`),
md('## 4. Full fine-tune\nBatch 4 × accumulation 4; FP16 và gradient checkpointing; tối đa 6 epochs, early stopping theo validation thật. Trên T4 thường khoảng 30–60 phút.'),
code(`if not (WORK / "runs/smoke/smoke-passed.json").exists():
    raise RuntimeError("Smoke test chưa qua")
command = [PY, str(WORK / "train_ner.py"), "--data", "data", "--output", "runs/v3", "--export-onnx"]
RESUME = False  # Đổi True chỉ khi tiếp tục checkpoint của chính phiên này (phiên mới thì /tmp đã mất).
if RESUME:
    command.append("--resume")
run(command, cwd=WORK, env=GPU_ENV)
`),
md('## 5. Kiểm tra ONNX khớp PyTorch\nNếu bước xuất ONNX chưa tạo được báo cáo đối chiếu, chạy lại riêng phần so sánh (không train lại).'),
code(`RESULT = WORK / "runs/v3"
if not (RESULT / "onnx/export-check.json").exists() and (WORK / "check_onnx.py").exists():
    run([PY, str(WORK / "check_onnx.py"), "--bundle", str(RESULT), "--write-report"], cwd=WORK, env=GPU_ENV)
check = RESULT / "onnx/export-check.json"
print("ONNX:", json.loads(check.read_text()).get("passed") if check.exists() else "chưa có báo cáo đối chiếu")
`),
md('## 6. Kết quả\nBáo riêng test caption thật và test câu mẫu. `negative_captions.rate` = tỷ lệ caption không có quán mà model vẫn bắt ra một quán (mục tiêu ≤ 10%). Không điều chỉnh model theo test.'),
code(`metrics = json.loads((RESULT / "metrics.json").read_text())
for split, result in metrics.items():
    entities = result.get("entities", {})
    line = {k: round(entities[k]["f1-score"], 4) for k in ["BUSINESS", "LOC", "micro avg"] if k in entities}
    print(split, result.get("sentences"), "câu", line, "caption âm:", result.get("negative_captions"))
shutil.copyfile(RESULT / "metrics.json", OUT / "metrics.json")
`),
md('## 7. Đóng gói model\nGhi **foodtrip-ner-trained.zip** vào /kaggle/working (không kèm checkpoint/optimizer). Tải ở tab *Output* của notebook, hoặc của Version nếu chạy nền.'),
code(`bundle = OUT / "foodtrip-ner-trained.zip"
with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for item in RESULT.rglob("*"):
        if item.is_file() and "checkpoints" not in item.relative_to(RESULT).parts:
            archive.write(item, item.relative_to(RESULT))
    archive.write(WORK / "ner_preprocessing.py", "ner_preprocessing.py")
    archive.write(WORK / "requirements-colab.txt", "requirements-colab.txt")
    archive.write(WORK / "data/dataset-report.json", "dataset-report.json")
print(bundle, round(bundle.stat().st_size / 1e6), "MB")
`),
md(`## Sau khi train
Giải nén foodtrip-ner-trained.zip vào \`ml/models/<tên-run>/\` trong dự án, rồi chạy (xem \`ml/training/WORKFLOW-V3.md\`):

\`\`\`
node scripts/benchmark-detect-place.js --data ml/datasets/v3/test.jsonl --errors ml/models/<tên-run>/test-errors.json
\`\`\`

Không nạp model vào Supabase Edge. Giữ bước tra cứu địa điểm thật và người dùng xác nhận.
`),
]
const notebook = {
  cells: cells.map((c, i) => ({ ...c, id: 'foodtrip-kaggle-' + i })),
  metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' }, kaggle: { accelerator: 'nvidiaTeslaT4', isInternetEnabled: true, isGpuEnabled: true } },
  nbformat: 4, nbformat_minor: 5,
}
const out = path.join(__dirname, '..', 'ml', 'notebooks', 'train_phobert_ner_kaggle.ipynb')
fs.writeFileSync(out, JSON.stringify(notebook, null, 1) + '\n')
console.log('Wrote ' + cells.length + ' cells: ' + out)
