"""Train the FoodTrip answer retriever: a question → the FAQ entry that answers it.

    python train_retriever.py --data data --output runs/retriever --export-onnx
    python train_retriever.py --data data --output runs/retriever-smoke --smoke

A Vietnamese sentence encoder (bkai-foundation-models/vietnamese-bi-encoder,
PhoBERT-based) is fine-tuned so a question lands next to its entry: pairs
(question, entry text) with in-batch negatives (MultipleNegativesRankingLoss).
Reported on data/faq_test.jsonl — phrasings never trained on, and hand-written
questions — next to the word-matching baseline (data/faq_baseline.json) and the
encoder before fine-tuning. The score at which FoodTrip answers outright is
chosen on data/faq_validation.jsonl, never on test.

No app/database keys, external tracking, Hub upload or website deployment.
"""
import argparse
import json
from pathlib import Path

BASE = 'bkai-foundation-models/vietnamese-bi-encoder'
MAX_LENGTH = 128
# FoodTrip answers outright only where validation answers were at least this often right.
TARGET_PRECISION = 0.9


def read_rows(path):
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]


def segment(text, word_tokenize):
    """The encoder was trained on word-segmented Vietnamese ("Đà_Lạt")."""
    return word_tokenize(' '.join(str(text).split()), format='text')


def rank(model, questions, entry_matrix, ids, segmenter):
    import numpy as np
    vectors = model.encode([segment(q, segmenter) for q in questions], normalize_embeddings=True, convert_to_numpy=True, batch_size=64)
    scores = vectors @ entry_matrix.T
    order = np.argsort(-scores, axis=1)
    return [[(ids[j], float(scores[i, j])) for j in order[i, :3]] for i in range(len(questions))]


def measure(ranked, gold):
    top1 = sum(r[0][0] == g for r, g in zip(ranked, gold)) / len(gold)
    top3 = sum(g in [x[0] for x in r] for r, g in zip(ranked, gold)) / len(gold)
    return {'top1': top1, 'top3': top3, 'rows': len(gold)}


def choose_threshold(ranked, gold):
    """The lowest top score at which answered questions are ≥ TARGET_PRECISION right (validation)."""
    pairs = sorted(((r[0][1], r[0][0] == g) for r, g in zip(ranked, gold)), reverse=True)
    best, right = 1.0, 0
    for n, (score, ok) in enumerate(pairs, 1):
        right += ok
        if right / n >= TARGET_PRECISION:
            best = score
    return round(best, 4)


def answered_at(ranked, gold, threshold):
    kept = [(r[0][0] == g) for r, g in zip(ranked, gold) if r[0][1] >= threshold]
    return {'answered': len(kept) / len(gold), 'right_when_answered': (sum(kept) / len(kept)) if kept else None}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default='data')
    parser.add_argument('--output', default='runs/retriever')
    parser.add_argument('--epochs', type=int, default=4)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--lr', type=float, default=2e-5)
    parser.add_argument('--smoke', action='store_true', help='One tiny step; never a model-quality result')
    parser.add_argument('--export-onnx', action='store_true')
    args = parser.parse_args()
    data, output = Path(args.data), Path(args.output)

    import numpy as np
    import torch
    from sentence_transformers import InputExample, SentenceTransformer, losses
    from sentence_transformers.datasets import NoDuplicatesDataLoader
    from underthesea import word_tokenize

    if not torch.cuda.is_available() and not args.smoke:
        raise SystemExit('No GPU. Select Runtime → Change runtime type → T4 GPU, then rerun.')
    torch.manual_seed(42)
    entries = read_rows(data / 'faq_entries.jsonl')
    ids = [e['id'] for e in entries]
    entry_text = {e['id']: segment(e['text'], word_tokenize) for e in entries}
    train = read_rows(data / 'faq_train.jsonl')
    validation = read_rows(data / 'faq_validation.jsonl')
    test = read_rows(data / 'faq_test.jsonl')
    if args.smoke:
        train, validation, test = train[:64], validation[:8], test[:8]

    model = SentenceTransformer(BASE, device='cuda' if torch.cuda.is_available() else 'cpu')
    model.max_seq_length = MAX_LENGTH

    def evaluate(tag):
        matrix = model.encode([entry_text[i] for i in ids], normalize_embeddings=True, convert_to_numpy=True)
        out = {}
        for name, rows in (('validation', validation), ('test', test)):
            ranked = rank(model, [r['question'] for r in rows], matrix, ids, word_tokenize)
            out[name] = (ranked, [r['id'] for r in rows])
        print(tag, {k: measure(*v) for k, v in out.items()}, flush=True)
        return out

    before = evaluate('before fine-tuning')
    examples = [InputExample(texts=[segment(r['question'], word_tokenize), entry_text[r['id']]]) for r in train]
    # No two pairs of the same entry in one batch: they would be each other's false negatives.
    loader = NoDuplicatesDataLoader(examples, batch_size=min(args.batch_size, len(entries)))
    loss = losses.MultipleNegativesRankingLoss(model)
    steps = 1 if args.smoke else None
    model.fit(train_objectives=[(loader, loss)], epochs=1 if args.smoke else args.epochs, warmup_steps=0 if args.smoke else int(0.1 * len(loader) * args.epochs),
              optimizer_params={'lr': args.lr}, show_progress_bar=True, steps_per_epoch=steps)
    if args.smoke:
        output.mkdir(parents=True, exist_ok=True)
        (output / 'smoke-passed.json').write_text('{"passed": true}', encoding='utf-8')
        print('SMOKE_OK — not a trained model', flush=True)
        return

    after = evaluate('after fine-tuning')
    threshold = choose_threshold(*after['validation'])
    baseline = json.loads((data / 'faq_baseline.json').read_text(encoding='utf-8')) if (data / 'faq_baseline.json').exists() else {}
    misses = [{'question': r['question'], 'expected': r['id'], 'got': ranked[0][0], 'score': ranked[0][1]}
              for r, ranked in zip(test, after['test'][0]) if ranked[0][0] != r['id']]
    report = {
        'base': BASE, 'arguments': vars(args), 'threshold': threshold, 'target_precision': TARGET_PRECISION,
        'test': {'words': {k: baseline.get(k) for k in ('top1', 'top3')}, 'encoder_before': measure(*before['test']), 'fine_tuned': measure(*after['test'])},
        'test_at_threshold': answered_at(*after['test'], threshold),
        'validation': {'encoder_before': measure(*before['validation']), 'fine_tuned': measure(*after['validation'])},
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / 'retriever-metrics.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'retriever-errors.json').write_text(json.dumps(misses, ensure_ascii=False, indent=1), encoding='utf-8')
    t = report['test']
    pct = lambda v: '' if v is None else f'{v:.1%}'
    lines = ['# FoodTrip answer retriever — results', '', f"Test: {t['fine_tuned']['rows']} questions never trained on.", '',
             '| Method | Top-1 | Top-3 |', '|---|---|---|',
             f"| Word matching (live baseline) | {pct(t['words']['top1'])} | {pct(t['words']['top3'])} |",
             f"| Encoder, not fine-tuned | {pct(t['encoder_before']['top1'])} | {pct(t['encoder_before']['top3'])} |",
             f"| Encoder, fine-tuned | {pct(t['fine_tuned']['top1'])} | {pct(t['fine_tuned']['top3'])} |", '',
             f"Answers outright at score ≥ {threshold} (chosen on validation for {TARGET_PRECISION:.0%} right): "
             f"{pct(report['test_at_threshold']['answered'])} of test questions, right {pct(report['test_at_threshold']['right_when_answered'])} of the time."]
    (output / 'RETRIEVER.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('\n'.join(lines), flush=True)
    model.save(str(output / 'model'))
    if args.export_onnx:
        export_onnx(model, output, threshold, torch, np)


def export_onnx(model, output, threshold, torch, np):
    """Encoder + mean pooling + L2 normalisation as one ONNX graph, checked against sentence-transformers."""
    import onnx
    import onnxruntime as ort
    transformer = model[0].auto_model.float().cpu().eval()
    tokenizer = model[0].tokenizer

    class Pooled(torch.nn.Module):
        def __init__(self, encoder): super().__init__(); self.encoder = encoder
        def forward(self, input_ids, attention_mask):
            hidden = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            mask = attention_mask.unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
            return torch.nn.functional.normalize(pooled, p=2, dim=1)

    target = output / 'onnx'
    target.mkdir(parents=True, exist_ok=True)
    sample = tokenizer(['thanh_toán bằng cách nào'], return_tensors='pt', truncation=True, max_length=MAX_LENGTH)
    wrapper = Pooled(transformer)
    torch.onnx.export(wrapper, (sample['input_ids'], sample['attention_mask']), str(target / 'retriever.onnx'),
                      input_names=['input_ids', 'attention_mask'], output_names=['embedding'], opset_version=17,
                      dynamic_axes={'input_ids': {0: 'batch', 1: 'sequence'}, 'attention_mask': {0: 'batch', 1: 'sequence'}, 'embedding': {0: 'batch'}})
    onnx.checker.check_model(str(target / 'retriever.onnx'))
    session = ort.InferenceSession(str(target / 'retriever.onnx'), providers=['CPUExecutionProvider'])
    actual = session.run(None, {'input_ids': sample['input_ids'].numpy(), 'attention_mask': sample['attention_mask'].numpy()})[0]
    expected = model.encode(['thanh_toán bằng cách nào'], normalize_embeddings=True, convert_to_numpy=True)
    error = float(np.abs(actual - expected).max())
    if error > 1e-3:
        raise SystemExit(f'ONNX retriever differs from sentence-transformers by {error}')
    tokenizer.save_pretrained(target)
    (target / 'retriever.json').write_text(json.dumps({'base': BASE, 'max_length': MAX_LENGTH, 'threshold': threshold, 'segmented': True}, indent=2), encoding='utf-8')
    (target / 'retriever-check.json').write_text(json.dumps({'passed': True, 'max_abs_error': error}), encoding='utf-8')
    print(f'Retriever ONNX checked (max error {error:.2e}).', flush=True)


if __name__ == '__main__':
    main()
