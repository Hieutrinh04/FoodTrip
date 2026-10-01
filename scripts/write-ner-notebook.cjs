// Writes ml/notebooks/train_phobert_ner.ipynb.
//
// Kept as a generator rather than hand-edited JSON so the notebook's code can
// be reviewed as plain Python in one place.  node scripts/write-ner-notebook.cjs
const fs = require('fs')
const path = require('path')

const md = (text) => ({ cell_type: 'markdown', metadata: {}, source: text.trim() })
const code = (text) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: text.trim() })

const cells = [
md(String.raw`
# FoodTrip — PhoBERT nhận diện tên quán và địa danh trong caption video

**Bài toán.** Cho caption của một video review (YouTube, TikTok…), gán nhãn BIO cho các cụm là **tên quán** (\`BUSINESS\`) và **địa danh** (\`LOC\`) — đúng việc mà \`supabase/functions/detect-place\` đang giao cho Anthropic.

**Dữ liệu** (\`ml/ner-dataset/\`, sinh bởi \`scripts/build-real-ner-dataset.js\`):
- **Tên quán thật** từ Google Maps (\`scripts/crawl-via-supabase.js\`), ghép vào các mẫu câu caption → phần lớn tập huấn luyện.
- **Caption YouTube thật** về các quán đó, gán nhãn tự động bằng cách đối chiếu tên quán (distant supervision).

**Cách chia tập — để kết quả phản ánh đúng khả năng thật.**
- Chia theo **quán**, không chia ngẫu nhiên: một quán chỉ nằm ở một tập, nên mô hình không thể đạt điểm bằng cách nhớ tên.
- \`test.jsonl\` chỉ gồm **caption YouTube thật** về các quán **chưa từng xuất hiện** trong train/val. **Đây là con số để báo cáo.**
- \`test_template.jsonl\`: câu mẫu về các quán chưa thấy — để so sánh văn bản sạch với văn bản thật.

**Chạy trên Google Colab**: Runtime → Change runtime type → **T4 GPU**. Toàn bộ mất khoảng 10–15 phút.
`),
code(String.raw`
# Pinned so the run is reproducible: the Trainer/tokenizer APIs used below
# changed across transformers releases.
!pip install -q "transformers==4.46.3" "datasets==3.1.0" "accelerate==1.1.1" evaluate seqeval underthesea "optimum[exporters]==1.23.3"
`),
md(String.raw`
## 1. Tải dữ liệu
Chọn **5 file** trong \`ml/ner-dataset/\` của repo: \`train.jsonl\`, \`val.jsonl\`, \`test.jsonl\`, \`test_template.jsonl\`, \`labels.json\`.
`),
code(String.raw`
from google.colab import files
import os

os.makedirs('data', exist_ok=True)
uploaded = files.upload()
for name in uploaded:
    os.replace(name, f'data/{name}')

required = {'train.jsonl', 'val.jsonl', 'test.jsonl', 'test_template.jsonl', 'labels.json'}
missing = required - set(os.listdir('data'))
assert not missing, f'Thiếu file: {missing}'
print(sorted(os.listdir('data')))
`),
md(String.raw`
## 2. Đọc nhãn và dữ liệu
`),
code(String.raw`
import json
from collections import Counter
from datasets import load_dataset

with open('data/labels.json') as f:
    label_list = json.load(f)
label2id = {l: i for i, l in enumerate(label_list)}
id2label = {i: l for i, l in enumerate(label_list)}
print('Nhãn:', label_list)

raw = load_dataset('json', data_files={
    'train': 'data/train.jsonl',
    'validation': 'data/val.jsonl',
    'test': 'data/test.jsonl',
    'test_template': 'data/test_template.jsonl',
})
for split in raw:
    print(f'{split:14} {len(raw[split]):5} câu  ', dict(Counter(raw[split]['source'])))

raw = raw.map(lambda ex: {'ner_tags': [label2id[t] for t in ex['ner_tags']]})
`),
md(String.raw`
## 3. Tách từ tiếng Việt

PhoBERT được huấn luyện trên văn bản **đã tách từ** (từ ghép nối bằng \`_\`, ví dụ \`Hội_An\`). \`underthesea\` tách lại từng câu, và mỗi từ ghép nhận nhãn của âm tiết đầu tiên của nó.

Nếu \`underthesea\` tách khác với cách tách ban đầu (dấu câu, dấu gạch nối…) thì nhãn của cả phần sau câu sẽ lệch. Vì vậy câu nào tách ra **không ghép lại khớp** với câu gốc thì giữ nguyên bản chưa tách, thay vì huấn luyện trên nhãn lệch.
`),
code(String.raw`
from underthesea import word_tokenize

realigned = Counter()

def resegment(example):
    tokens, tags = example['tokens'], example['ner_tags']
    # format='text' joins a compound's syllables with '_' (the form PhoBERT
    # was trained on); the default returns them joined by a space instead.
    segmented = word_tokenize(' '.join(tokens), format='text').split()
    # The segmentation must cover exactly the original tokens, in order.
    if [p for seg in segmented for p in seg.split('_')] != [p for tok in tokens for p in tok.split()]:
        realigned['kept_original'] += 1
        return example
    new_tokens, new_tags, pos = [], [], 0
    for seg in segmented:
        n = len(seg.split('_'))
        span = tags[pos:pos + n]
        # A compound never straddles two entities; if it would, keep the
        # original split for this sentence.
        kinds = {id2label[t][2:] for t in span if id2label[t] != 'O'}
        if len(kinds) > 1 or (kinds and 'O' in {id2label[t] for t in span}):
            realigned['kept_original'] += 1
            return example
        new_tokens.append(seg)
        new_tags.append(span[0])
        pos += n
    realigned['segmented'] += 1
    return {'tokens': new_tokens, 'ner_tags': new_tags}

raw = raw.map(resegment)
print(dict(realigned))
print(raw['train'][0])
`),
md(String.raw`
## 4. Chuyển sang token của PhoBERT

PhoBERT chỉ có tokenizer bản *slow* nên không có \`word_ids()\`; việc căn nhãn được làm thủ công. Mỗi từ được tách thành các mảnh BPE, **chỉ mảnh đầu tiên mang nhãn**, các mảnh sau là \`-100\` để không tính vào loss và không bị seqeval đếm thành thực thể thừa.
`),
code(String.raw`
from transformers import AutoTokenizer

MODEL_CHECKPOINT = 'vinai/phobert-base'
MAX_LEN = 256  # PhoBERT has 258 positions
tokenizer = AutoTokenizer.from_pretrained(MODEL_CHECKPOINT)

def encode_words(words):
    ids, first = [tokenizer.cls_token_id], [False]
    for w in words:
        pieces = tokenizer.encode(w, add_special_tokens=False) or [tokenizer.unk_token_id]
        ids.extend(pieces)
        first.extend([True] + [False] * (len(pieces) - 1))
    ids, first = ids[:MAX_LEN - 1], first[:MAX_LEN - 1]
    return ids + [tokenizer.sep_token_id], first + [False]

def tokenize_and_align(batch):
    out = {'input_ids': [], 'attention_mask': [], 'labels': []}
    for words, tags in zip(batch['tokens'], batch['ner_tags']):
        ids, first = encode_words(words)
        word_tags = iter(tags)
        labels = [next(word_tags) if f else -100 for f in first]
        out['input_ids'].append(ids)
        out['attention_mask'].append([1] * len(ids))
        out['labels'].append(labels)
    return out

tokenized = raw.map(tokenize_and_align, batched=True, remove_columns=raw['train'].column_names)
print(tokenized)
`),
md(String.raw`
## 5. Huấn luyện
`),
code(String.raw`
import numpy as np
import evaluate
from transformers import (
    AutoModelForTokenClassification, DataCollatorForTokenClassification, TrainingArguments, Trainer,
)

seqeval = evaluate.load('seqeval')

def to_label_sequences(predictions, labels):
    preds, refs = [], []
    for p_row, l_row in zip(predictions, labels):
        p_seq = [id2label[p] for p, l in zip(p_row, l_row) if l != -100]
        l_seq = [id2label[l] for l in l_row if l != -100]
        preds.append(p_seq)
        refs.append(l_seq)
    return preds, refs

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds, refs = to_label_sequences(np.argmax(logits, axis=2), labels)
    r = seqeval.compute(predictions=preds, references=refs)
    out = {'precision': r['overall_precision'], 'recall': r['overall_recall'], 'f1': r['overall_f1']}
    for kind in ('BUSINESS', 'LOC'):
        if kind in r:
            out[f'f1_{kind}'] = r[kind]['f1']
    return out

model = AutoModelForTokenClassification.from_pretrained(
    MODEL_CHECKPOINT, num_labels=len(label_list), id2label=id2label, label2id=label2id,
)

args = TrainingArguments(
    output_dir='checkpoints',
    eval_strategy='epoch',
    save_strategy='epoch',
    save_total_limit=2,
    learning_rate=3e-5,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=32,
    num_train_epochs=6,
    weight_decay=0.01,
    warmup_ratio=0.1,
    load_best_model_at_end=True,
    metric_for_best_model='f1',
    seed=42,
    report_to='none',
)

trainer = Trainer(
    model=model,
    args=args,
    train_dataset=tokenized['train'],
    eval_dataset=tokenized['validation'],
    data_collator=DataCollatorForTokenClassification(tokenizer=tokenizer),
    tokenizer=tokenizer,
    compute_metrics=compute_metrics,
)
trainer.train()

# Save the best model where the export step expects it.
trainer.save_model('phobert-ner-place')
tokenizer.save_pretrained('phobert-ner-place')
`),
md(String.raw`
## 6. Đánh giá

- **test** — caption YouTube thật, quán chưa từng thấy. **Con số báo cáo.**
- **test_template** — câu mẫu, quán chưa từng thấy. Chênh lệch giữa hai con số cho thấy văn bản thật khó hơn câu mẫu bao nhiêu.
`),
code(String.raw`
from seqeval.metrics import classification_report

results = {}
for split in ('test', 'test_template'):
    pred = trainer.predict(tokenized[split])
    preds, refs = to_label_sequences(np.argmax(pred.predictions, axis=2), pred.label_ids)
    results[split] = pred.metrics
    print(f'===== {split} ({len(refs)} câu) =====')
    print(classification_report(refs, preds, digits=3))
`),
md(String.raw`
### Mốc so sánh: tra từ điển

Cách đơn giản nhất là giữ một danh sách tên quán đã biết (tất cả tên trong tập train) rồi dò chuỗi khớp trong caption. Vì các quán trong tập test **chưa từng có** trong train, cách này gần như không tìm được tên quán nào. Khoảng cách giữa nó và PhoBERT chính là phần mô hình **tự khái quát hoá** được, chứ không nhớ.
`),
code(String.raw`
def entity_spans(tokens, tags):
    spans, cur = [], None
    for tok, tag in zip(tokens, tags):
        lab = id2label[tag]
        if lab.startswith('B-'):
            cur = [lab[2:], [tok]]
            spans.append(cur)
        elif lab.startswith('I-') and cur and cur[0] == lab[2:]:
            cur[1].append(tok)
        else:
            cur = None
    return [(kind, ' '.join(words)) for kind, words in spans]

gazetteer = {}
for ex in raw['train']:
    for kind, text in entity_spans(ex['tokens'], ex['ner_tags']):
        gazetteer.setdefault(text.lower(), kind)

def tag_with_gazetteer(tokens):
    tags = ['O'] * len(tokens)
    lower = [t.lower() for t in tokens]
    for name, kind in sorted(gazetteer.items(), key=lambda kv: -len(kv[0].split())):
        words = name.split()
        for i in range(len(tokens) - len(words) + 1):
            if lower[i:i + len(words)] == words and all(t == 'O' for t in tags[i:i + len(words)]):
                tags[i] = f'B-{kind}'
                for j in range(1, len(words)):
                    tags[i + j] = f'I-{kind}'
    return tags

refs = [[id2label[t] for t in ex['ner_tags']] for ex in raw['test']]
preds = [tag_with_gazetteer(ex['tokens']) for ex in raw['test']]
print('Tra từ điển trên test (caption thật, quán chưa thấy):')
print(classification_report(refs, preds, digits=3, zero_division=0))
`),
md(String.raw`
## 7. Thử tay
`),
code(String.raw`
import torch

def extract(caption):
    words = word_tokenize(caption, format='text').split()
    ids, first = encode_words(words)
    model.eval()
    with torch.no_grad():
        logits = model(torch.tensor([ids], device=model.device)).logits[0]
    labels = [id2label[int(i)] for i, f in zip(logits.argmax(-1), first) if f]
    return entity_spans(words, [label2id[l] for l in labels])

for caption in [
    'Đi Hội An nhớ ghé Cao Lầu Bà Bé nha mọi người, ngon lắm',
    'Review Bún Chả Hương Liên ở Hà Nội, quán Obama từng ăn',
    'Quán cà phê Tiệm Nhà Mây view săn mây siêu đẹp tại Đà Lạt',
]:
    print(caption, '→', extract(caption))
`),
md(String.raw`
## 8. Xuất ONNX để chạy không cần API key
`),
code(String.raw`
!optimum-cli export onnx --model phobert-ner-place --task token-classification phobert-ner-onnx/

import shutil
with open('phobert-ner-onnx/metrics.json', 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
shutil.make_archive('phobert-ner-onnx', 'zip', 'phobert-ner-onnx')
files.download('phobert-ner-onnx.zip')
`),
md(String.raw`
## Bước tiếp theo trong repo FoodTrip
1. Giải nén \`phobert-ner-onnx.zip\` vào \`ml/models/phobert-ner-onnx/\` (kèm \`metrics.json\` — số liệu cho báo cáo).
2. Thay lệnh gọi Anthropic trong \`supabase/functions/detect-place/index.ts\` bằng suy luận ONNX (\`onnxruntime-node\` trong edge function, hoặc \`onnxruntime-web\` phía trình duyệt). Đầu vào phải được tách từ giống lúc huấn luyện.
3. Giữ nguyên \`verify-place\`: bước tra cứu địa điểm là tra cứu xác định, không cần học.
4. Khi \`video_reviews\` có thêm caption thật do người dùng gửi, gộp vào dataset và chạy lại notebook.
`),
]

const notebook = {
  cells,
  metadata: {
    accelerator: 'GPU',
    colab: { provenance: [], gpuType: 'T4' },
    kernelspec: { display_name: 'Python 3', name: 'python3' },
    language_info: { name: 'python' },
  },
  nbformat: 4,
  nbformat_minor: 0,
}

const out = path.join(__dirname, '..', 'ml', 'notebooks', 'train_phobert_ner.ipynb')
fs.writeFileSync(out, JSON.stringify(notebook, null, 1) + '\n', 'utf8')
console.log(`Wrote ${cells.length} cells → ${path.relative(process.cwd(), out)}`)
