"""Train the FoodTrip assistant (intent + slots) on a GPU runtime (Colab T4).

    python train_assistant.py --data data --output runs/assistant --export-onnx
    python train_assistant.py --data data --output runs/smoke --smoke

No app/database keys, external tracking, Hub upload or website deployment.
Reports intent accuracy and slot F1 on the unseen-phrasing test split and on
the hand-written messages, beside the rule baseline (data/baseline.json).
"""
import argparse
import hashlib
import json
from pathlib import Path

from assistant_model import MODEL, REVISION, first_piece_tags, load_labels, prepare, spans


def read_rows(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default='data')
    parser.add_argument('--output', default='runs/assistant')
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--lr', type=float, default=3e-5)
    parser.add_argument('--max-length', type=int, default=96)
    parser.add_argument('--smoke', action='store_true', help='A few steps only; never a model-quality result')
    parser.add_argument('--export-onnx', action='store_true')
    args = parser.parse_args()
    if not 32 <= args.max_length <= 256 or min(args.epochs, args.batch_size) < 1:
        raise SystemExit('Invalid training arguments')
    data, output = Path(args.data), Path(args.output)

    import numpy as np
    import torch
    from seqeval.metrics import f1_score, classification_report
    from seqeval.scheme import IOB2
    from underthesea import word_tokenize
    from transformers import AutoModel, AutoTokenizer, EarlyStoppingCallback, Trainer, TrainingArguments, set_seed

    if not torch.cuda.is_available() and not args.smoke:
        raise SystemExit('No GPU. Select Runtime → Change runtime type → T4 GPU, then rerun.')
    set_seed(42)
    intents, slot_labels = load_labels(data / 'labels.json')
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, use_fast=False)

    splits = {name: read_rows(data / f'{name}.jsonl') for name in ('train', 'validation', 'test', 'real_test')}
    if args.smoke:
        splits = {name: rows[:48] for name, rows in splits.items()}

    def encode_rows(rows):
        out = []
        for row in rows:
            features, first, included = prepare(row['tokens'], tokenizer, word_tokenize, args.max_length, row['tags'], slot_labels)
            features['intent_labels'] = intents.index(row['intent'])
            out.append({'features': features, 'first': first, 'included': included, 'row': row})
        return out

    encoded = {name: encode_rows(rows) for name, rows in splits.items()}
    print({name: len(rows) for name, rows in encoded.items()}, flush=True)

    class Joint(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = AutoModel.from_pretrained(MODEL, revision=REVISION)
            size = self.encoder.config.hidden_size
            self.dropout = torch.nn.Dropout(0.1)
            self.intent_head = torch.nn.Linear(size, len(intents))
            self.slot_head = torch.nn.Linear(size, len(slot_labels))

        def forward(self, input_ids, attention_mask, intent_labels=None, slot_labels=None):
            hidden = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            intent_logits = self.intent_head(self.dropout(hidden[:, 0]))
            slot_logits = self.slot_head(self.dropout(hidden))
            out = {'intent_logits': intent_logits, 'slot_logits': slot_logits}
            if intent_labels is not None and slot_labels is not None:
                ce = torch.nn.CrossEntropyLoss(ignore_index=-100)
                out['loss'] = ce(intent_logits, intent_labels) + ce(slot_logits.reshape(-1, slot_logits.size(-1)), slot_labels.reshape(-1))
            return out

    def collate(items):
        width = max(len(i['input_ids']) for i in items)
        pad = tokenizer.pad_token_id
        return {
            'input_ids': torch.tensor([i['input_ids'] + [pad] * (width - len(i['input_ids'])) for i in items]),
            'attention_mask': torch.tensor([i['attention_mask'] + [0] * (width - len(i['attention_mask'])) for i in items]),
            'slot_labels': torch.tensor([i['slot_labels'] + [-100] * (width - len(i['slot_labels'])) for i in items]),
            'intent_labels': torch.tensor([i['intent_labels'] for i in items]),
        }

    class Rows(torch.utils.data.Dataset):
        def __init__(self, rows): self.rows = [r['features'] for r in rows]
        def __len__(self): return len(self.rows)
        def __getitem__(self, index): return self.rows[index]

    def sequences(slot_logits, slot_gold):
        predicted = slot_logits.argmax(-1)
        gold_seqs, pred_seqs = [], []
        for p_row, g_row in zip(predicted, slot_gold):
            keep = g_row != -100
            gold_seqs.append([slot_labels[int(x)] for x in g_row[keep]])
            pred_seqs.append([slot_labels[int(x)] for x in p_row[keep]])
        return gold_seqs, pred_seqs

    def metrics(prediction):
        intent_logits, slot_logits = prediction.predictions
        intent_gold, slot_gold = prediction.label_ids
        accuracy = float((intent_logits.argmax(-1) == intent_gold).mean())
        gold, pred = sequences(slot_logits, slot_gold)
        f1 = float(f1_score(gold, pred, mode='strict', scheme=IOB2, zero_division=0))
        return {'intent_accuracy': accuracy, 'slot_f1': f1, 'score': (accuracy + f1) / 2}

    model = Joint()
    output.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(output / 'checkpoints'), learning_rate=args.lr, num_train_epochs=1 if args.smoke else args.epochs,
        max_steps=3 if args.smoke else -1, per_device_train_batch_size=args.batch_size, per_device_eval_batch_size=32,
        warmup_ratio=0.1, weight_decay=0.01, eval_strategy='epoch', save_strategy='epoch', save_total_limit=2,
        load_best_model_at_end=not args.smoke, metric_for_best_model='score', greater_is_better=True,
        label_names=['intent_labels', 'slot_labels'], fp16=torch.cuda.is_available(), report_to='none',
        logging_steps=25, seed=42, dataloader_num_workers=0, save_safetensors=True,
    )
    trainer = Trainer(model=model, args=training_args, train_dataset=Rows(encoded['train']), eval_dataset=Rows(encoded['validation']),
                      data_collator=collate, compute_metrics=metrics,
                      callbacks=[] if args.smoke else [EarlyStoppingCallback(early_stopping_patience=2)])
    trainer.train()
    if args.smoke:
        (output / 'smoke-passed.json').write_text('{"passed": true}', encoding='utf-8')
        print('SMOKE_OK — not a trained model', flush=True)
        return

    # Held-out evaluation: the unseen-phrasing test split and the hand-written messages.
    report, errors = {}, []
    for name in ('test', 'real_test'):
        result = trainer.predict(Rows(encoded[name]))
        intent_logits, slot_logits = result.predictions
        gold, pred = sequences(slot_logits, result.label_ids[1])
        per_intent = {}
        for item, logit, p_tags in zip(encoded[name], intent_logits, pred):
            row = item['row']
            guess = intents[int(logit.argmax())]
            entry = per_intent.setdefault(row['intent'], {'n': 0, 'ok': 0})
            entry['n'] += 1
            entry['ok'] += guess == row['intent']
            tokens = row['tokens'][:item['included']]
            if guess != row['intent'] or p_tags != row['tags'][:len(p_tags)]:
                errors.append({'split': name, 'text': row['text'], 'intent': row['intent'], 'predicted': guess,
                               'gold_slots': spans(tokens, row['tags'][:len(tokens)]), 'predicted_slots': spans(tokens, p_tags)})
        report[name] = {
            'intent_accuracy': float((intent_logits.argmax(-1) == result.label_ids[0]).mean()),
            'slot_f1': float(f1_score(gold, pred, mode='strict', scheme=IOB2, zero_division=0)),
            'slot_report': classification_report(gold, pred, mode='strict', scheme=IOB2, zero_division=0, output_dict=True),
            'per_intent_accuracy': {k: v['ok'] / v['n'] for k, v in per_intent.items()},
            'rows': len(encoded[name]),
        }
    baseline = json.loads((data / 'baseline.json').read_text(encoding='utf-8')) if (data / 'baseline.json').exists() else {}
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(data.glob('*.jsonl'))}
    (output / 'metrics.json').write_text(json.dumps({'model': MODEL, 'revision': REVISION, 'arguments': vars(args), 'dataset_sha256': hashes,
                                                     'results': report, 'rule_baseline': baseline}, ensure_ascii=False, indent=2, default=float), encoding='utf-8')
    (output / 'errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=1), encoding='utf-8')
    lines = ['# FoodTrip assistant — results', '', '| Set | Model intent accuracy | Rule baseline | Model slot F1 |', '|---|---|---|---|']
    for name in ('test', 'real_test'):
        rule = baseline.get(name, {}).get('intent_accuracy')
        lines.append(f"| {name} ({report[name]['rows']}) | {report[name]['intent_accuracy']:.1%} | {'' if rule is None else f'{rule:.1%}'} | {report[name]['slot_f1']:.1%} |")
    (output / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('\n'.join(lines), flush=True)

    target = output / 'model'
    target.mkdir(exist_ok=True)
    torch.save(model.state_dict(), target / 'joint.pt')
    tokenizer.save_pretrained(target)
    config = {'intents': intents, 'slots': slot_labels, 'max_length': args.max_length, 'caption_tokenizer': 2, 'model': MODEL, 'revision': REVISION}
    (target / 'assistant.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.export_onnx:
        export_onnx(model, tokenizer, encoded['test'][0]['features'], output, config, torch, np)


def export_onnx(model, tokenizer, example, output, config, torch, np):
    import onnx
    import onnxruntime as ort

    class Wrapper(torch.nn.Module):
        def __init__(self, joint): super().__init__(); self.joint = joint
        def forward(self, input_ids, attention_mask):
            out = self.joint(input_ids=input_ids, attention_mask=attention_mask)
            return out['intent_logits'], out['slot_logits']

    model = model.float().cpu().eval()
    wrapper = Wrapper(model)
    target = output / 'onnx'
    target.mkdir(exist_ok=True)
    tensors = (torch.tensor([example['input_ids']]), torch.tensor([example['attention_mask']]))
    torch.onnx.export(wrapper, tensors, str(target / 'model.onnx'), input_names=['input_ids', 'attention_mask'],
                      output_names=['intent_logits', 'slot_logits'], opset_version=17,
                      dynamic_axes={'input_ids': {0: 'batch', 1: 'sequence'}, 'attention_mask': {0: 'batch', 1: 'sequence'},
                                    'intent_logits': {0: 'batch'}, 'slot_logits': {0: 'batch', 1: 'sequence'}})
    onnx.checker.check_model(str(target / 'model.onnx'))
    session = ort.InferenceSession(str(target / 'model.onnx'), providers=['CPUExecutionProvider'])
    with torch.no_grad():
        expected = [t.numpy() for t in wrapper(*tensors)]
    actual = session.run(None, {'input_ids': tensors[0].numpy(), 'attention_mask': tensors[1].numpy()})
    error = max(float(np.abs(a - e).max()) for a, e in zip(actual, expected))
    if error > 1e-3:
        raise SystemExit(f'ONNX differs from PyTorch by {error}')
    tokenizer.save_pretrained(target)
    (target / 'assistant.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    (target / 'export-check.json').write_text(json.dumps({'passed': True, 'max_abs_error': error}), encoding='utf-8')
    print(f'ONNX export checked against PyTorch (max error {error:.2e}).', flush=True)


if __name__ == '__main__':
    main()
