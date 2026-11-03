const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const notebook = JSON.parse(fs.readFileSync(path.join(root, 'ml/notebooks/train_assistant.ipynb'), 'utf8'))
notebook.cells[0].source = '# FoodTrip — Train đọc hiểu, FAQ và sinh câu trả lời\n\nChọn T4 GPU. Kết nối runtime, mở thanh **Files → Upload to session storage**, tải cả `foodtrip-assistant-colab.zip` và `foodtrip-generator-colab.zip`. Sau đó Run all. Không cần khóa API thương mại.\n\nĐây là đợt huấn luyện ban đầu: kết quả loss không chứng minh chất lượng hội thoại. Cần đọc báo cáo và kiểm tra câu trả lời trước khi đưa lên website.'
notebook.cells[1].source = '## 1. Nạp hai bộ train đã tải qua thanh Files\nTệp không chứa .env hoặc dữ liệu khách hàng. Chỉ có FAQ công khai và dữ liệu mẫu.'
notebook.cells[2].source = `from google.colab import files
from pathlib import Path
import json, zipfile
WORK = Path('/content/foodtrip-assistant')
WORK.mkdir(exist_ok=True)
if not Path('/content/foodtrip-generator-colab.zip').exists():
    raise RuntimeError('Tải cả hai tệp ZIP qua Files trước khi Run all')
with zipfile.ZipFile('/content/foodtrip-assistant-colab.zip') as archive:
    for item in archive.infolist():
        if not (WORK / item.filename).resolve().is_relative_to(WORK.resolve()):
            raise ValueError('Unsafe archive path')
    archive.extractall(WORK)
print('TRAIN_DATA_READY')`
notebook.cells.push({ cell_type: 'markdown', metadata: {}, id: 'generator-info', source: '## 8. Fine-tune mô hình sinh bằng LoRA\nQwen2.5-1.5B-Instruct, trọng số nền cố định theo revision. Chỉ tối ưu phần trả lời của assistant. Gói tải về gồm adapter và báo cáo; chưa gồm phê duyệt triển khai.' })
notebook.cells.push({ cell_type: 'code', metadata: {}, id: 'generator-train', source: fs.readFileSync(path.join(root, 'ml/assistant/run_generator_colab.py'), 'utf8'), execution_count: null, outputs: [] })
const output = path.join(root, 'ml/notebooks/train_foodtrip_full.ipynb')
fs.writeFileSync(output, JSON.stringify(notebook, null, 1) + '\n')
console.log(output)
