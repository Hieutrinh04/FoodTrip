"""PhoBERT NER baseline. Train only on an explicitly selected GPU runtime.
No app/database keys, external tracking, Hub upload or website deployment.
"""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
from collections import Counter

from ner_preprocessing import CAPTION_TOKENIZER, LABELS, encode_words, segmented_syllables, entity_spans

MODEL = 'vinai/phobert-base'
REVISION = '01daacda68afe13d83023d16ec647239e344a1e6'


# Real captions, by where they came from. Validation and test hold only these.
REAL_SOURCES = {'youtube-real', 'tiktok-real', 'video-real'}


def read_rows(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]


def json_text(value, **kwargs):
    # seqeval reports include numpy int64 support counts, not native JSON ints.
    def default(item):
        import numpy as np
        if isinstance(item, np.generic):
            return item.item()
        if isinstance(item, np.ndarray):
            return item.tolist()
        raise TypeError(f'Not JSON serializable: {type(item).__name__}')
    return json.dumps(value, default=default, allow_nan=False, **kwargs)


def validate_evaluation_inputs(data, output, max_length):
    if not (output / 'model/config.json').is_file():
        raise SystemExit('No saved model; evaluate-only never starts training')
    info = json.loads((output / 'run-info.json').read_text(encoding='utf-8'))
    if info.get('arguments', {}).get('max_length') != max_length:
        raise SystemExit('Evaluation max_length differs from training')
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in data.glob('*.jsonl')}
    if not hashes or hashes != info.get('dataset_sha256'):
        raise SystemExit('Evaluation data differs from the saved training run')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default='data')
    parser.add_argument('--output', default='runs/baseline')
    parser.add_argument('--epochs', type=int, default=6)
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--accumulation', type=int, default=4)
    parser.add_argument('--max-length', type=int, default=256)
    parser.add_argument('--smoke', action='store_true', help='Two batches only; never a production/model-quality result')
    parser.add_argument('--export-onnx', action='store_true')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--evaluate-only', action='store_true', help='Evaluate the saved model; never call train or overwrite weights')
    args = parser.parse_args()
    if not 16 <= args.max_length <= 256 or min(args.epochs, args.batch_size, args.accumulation) < 1:
        raise SystemExit('Invalid training arguments')
    if args.evaluate_only and (args.smoke or args.resume):
        raise SystemExit('evaluate-only cannot be combined with smoke or resume')
    data, output = Path(args.data), Path(args.output)
    if args.evaluate_only:
        validate_evaluation_inputs(data, output, args.max_length)

    import torch
    import numpy as np
    from underthesea import word_tokenize
    from seqeval.metrics import classification_report, f1_score, precision_score, recall_score
    from seqeval.scheme import IOB2
    from transformers import (AutoTokenizer, AutoModelForTokenClassification, DataCollatorForTokenClassification,
                              TrainingArguments, Trainer, EarlyStoppingCallback, set_seed)
    from transformers.trainer_utils import get_last_checkpoint
    if not torch.cuda.is_available():
        raise SystemExit('No GPU. Select Runtime → Change runtime type → T4 GPU, then rerun. CPU training is intentionally disabled.')
    print('GPU:', torch.cuda.get_device_name(0), flush=True)
    if (output / 'model' / 'config.json').exists() and not (args.resume or args.evaluate_only):
        raise SystemExit('Model already exists. Choose another output folder; nothing overwritten.')
    output.mkdir(parents=True, exist_ok=True)
    label_list = json.loads((data / 'labels.json').read_text(encoding='utf-8'))
    if label_list != LABELS:
        raise SystemExit('Label order differs from preprocessing code')
    raw = {name: read_rows(data / (name + '.jsonl')) for name in ['train', 'val', 'test', 'val_template', 'test_template']}
    if any(not raw[name] for name in ['train', 'val', 'test']):
        raise SystemExit('Required data split is empty')
    for name in ['val', 'test']:
        if any(row['source'] not in REAL_SOURCES for row in raw[name]):
            raise SystemExit('Validation/test must contain real captions only')
    texts, groups, names, videos = {}, {}, {}, {}
    for split, rows in raw.items():
        partition = split.split('_')[0]
        for row in rows:
            if not row.get('group_id') or len(row['tokens']) != len(row['ner_tags']):
                raise SystemExit('Missing grouping or invalid alignment; prepare the v2 data first')
            business = [e['text'].casefold() for e in entity_spans(row['tokens'], row['ner_tags']) if e['label'] == 'BUSINESS']
            for mapping, keys in [(texts, [' '.join(row['tokens']).casefold()]), (groups, [row['group_id']]),
                                  (names, business), (videos, row.get('video_ids', []))]:
                for key in keys:
                    if key in mapping and mapping[key] != partition:
                        raise SystemExit('Data leakage across partitions; training refused')
                    mapping[key] = partition

    set_seed(42)
    source = str(output / 'model') if args.evaluate_only else MODEL
    source_options = {'local_files_only':True} if args.evaluate_only else {'revision':REVISION}
    tokenizer = AutoTokenizer.from_pretrained(source, use_fast=False, trust_remote_code=False, **source_options)
    encoded, preprocess_report = {}, {}
    for name, rows in raw.items():
        encoded[name] = []; counts = Counter()
        for index, row in enumerate(rows):
            # Never silently replace conflicting gold labels or drop hard test cases.
            try:
                words, tags, fallback = segmented_syllables(row['tokens'], word_tokenize, row['ner_tags'])
            except ValueError as err:
                raise SystemExit(f'Alignment failed at {name}:{index}: {err}. Audit labels before training.') from err
            item, _, included = encode_words(words, tokenizer, args.max_length, tags)
            counts['sentences'] += 1; counts['raw_fallback'] += int(fallback)
            counts['truncated'] += int(included < len(words))
            if included < len(words) and name in ('val', 'test'):
                raise SystemExit(f'Test/validation caption truncated at {name}:{index}; evaluate full text before reporting quality.')
            encoded[name].append(item)
        preprocess_report[name] = dict(counts)

    class Dataset(torch.utils.data.Dataset):
        def __init__(self, rows): self.rows = rows
        def __len__(self): return len(self.rows)
        def __getitem__(self, index): return self.rows[index]

    id2label = dict(enumerate(LABELS))
    def sequences(logits, labels):
        guesses = np.argmax(logits, axis=2)
        return ([[id2label[int(p)] for p, label in zip(pred, ref) if label != -100] for pred, ref in zip(guesses, labels)],
                [[id2label[int(label)] for label in ref if label != -100] for ref in labels])

    def metrics(prediction):
        guesses, refs = sequences(prediction.predictions, prediction.label_ids)
        return {'precision': precision_score(refs, guesses, mode='strict', scheme=IOB2, zero_division=0),
                'recall': recall_score(refs, guesses, mode='strict', scheme=IOB2, zero_division=0),
                'f1': f1_score(refs, guesses, mode='strict', scheme=IOB2, zero_division=0)}

    classifier_options = {} if args.evaluate_only else {'num_labels':len(LABELS),
              'id2label':id2label, 'label2id':{label:i for i,label in id2label.items()}}
    model = AutoModelForTokenClassification.from_pretrained(source, trust_remote_code=False,
              attn_implementation='eager', **source_options, **classifier_options)
    if model.config.id2label != id2label:
        raise SystemExit('Saved model label mapping differs from this dataset')
    checkpoint_dir = output / 'checkpoints'
    only_predict = args.smoke or args.evaluate_only
    training_args = TrainingArguments(output_dir=str(output / 'evaluation-runtime' if args.evaluate_only else checkpoint_dir), learning_rate=3e-5,
          per_device_train_batch_size=args.batch_size, per_device_eval_batch_size=args.batch_size,
          gradient_accumulation_steps=args.accumulation if not args.smoke else 1,
          num_train_epochs=args.epochs, max_steps=2 if args.smoke else -1,
          weight_decay=0.01, warmup_ratio=0.1, fp16=True,
          gradient_checkpointing=not args.evaluate_only, gradient_checkpointing_kwargs={'use_reentrant':False},
          eval_strategy='no' if only_predict else 'epoch', save_strategy='no' if only_predict else 'epoch',
          save_total_limit=2, load_best_model_at_end=not only_predict, metric_for_best_model='f1',
          logging_steps=1 if args.smoke else 20, seed=42, data_seed=42, report_to='none',
          dataloader_num_workers=0, save_safetensors=True)
    trainer = Trainer(model=model, args=training_args, train_dataset=None if args.evaluate_only else Dataset(encoded['train'][:32] if args.smoke else encoded['train']),
          eval_dataset=Dataset(encoded['val']), processing_class=tokenizer,
          data_collator=DataCollatorForTokenClassification(tokenizer), compute_metrics=metrics,
          callbacks=[] if only_predict else [EarlyStoppingCallback(early_stopping_patience=2)])
    packages = ['torch', 'transformers', 'accelerate', 'underthesea', 'numpy', 'seqeval']
    run_info = {'model':MODEL, 'revision':REVISION, 'smoke_only':args.smoke,
          'gpu':torch.cuda.get_device_name(0), 'seed':42, 'arguments':vars(args),
          'packages':{p:importlib.metadata.version(p) for p in packages}, 'preprocessing':preprocess_report,
          'dataset_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in data.glob('*.jsonl')},
          'quality_notice':'Weakly labelled syllable-preserving baseline, not canonical whole-word PhoBERT tokenization or a human-reviewed production certification.'}
    info_name = 'evaluation-run-info.json' if args.evaluate_only else 'run-info.json'
    (output / info_name).write_text(json_text(run_info, ensure_ascii=False, indent=2), encoding='utf-8')
    if not args.evaluate_only:
        resume = get_last_checkpoint(str(checkpoint_dir)) if args.resume and checkpoint_dir.exists() else None
        trainer.train(resume_from_checkpoint=resume)
    if args.smoke:
        (output / 'smoke-passed.json').write_text(json.dumps({'passed':True,'steps':trainer.state.global_step}),encoding='utf-8')
        print('SMOKE PASSED. No final model or quality score produced.', flush=True)
        return
    destination = output / 'model'
    if not args.evaluate_only:
        trainer.save_model(str(destination)); tokenizer.save_pretrained(str(destination))
    else:
        print('EVALUATE ONLY: reusing saved model; no training or weight overwrite.', flush=True)
    model.eval(); results = {}
    for name in ['val', 'test', 'val_template', 'test_template']:
        if not encoded[name]: continue
        print('Evaluating split:', name, flush=True)
        prediction = trainer.predict(Dataset(encoded[name]), metric_key_prefix=name)
        guesses, refs = sequences(prediction.predictions, prediction.label_ids)
        report = classification_report(refs, guesses, output_dict=True, mode='strict', scheme=IOB2, zero_division=0)
        results[name] = {'sentences':len(refs),'metrics':prediction.metrics,'entities':report}
        # Captions naming no business: how often the model invents one (CRITERIA.md: at most 10%).
        negatives = [guess for ref, guess in zip(refs, guesses) if not any(tag.endswith('BUSINESS') for tag in ref)]
        alarms = sum(any(tag.endswith('BUSINESS') for tag in guess) for guess in negatives)
        results[name]['negative_captions'] = {'count': len(negatives), 'false_alarms': alarms,
                                              'rate': alarms / len(negatives) if negatives else None}
        print(name, json_text(results[name], ensure_ascii=False), flush=True)
        errors = [{'row':i,'tokens':raw[name][i]['tokens'],'reference':ref,'prediction':guess}
                  for i,(ref,guess) in enumerate(zip(refs,guesses)) if ref != guess]
        (output / (name + '-errors.json')).write_text(json_text(errors, ensure_ascii=False, indent=2),encoding='utf-8')
        (output / 'metrics.partial.json').write_text(json_text(results, ensure_ascii=False, indent=2),encoding='utf-8')
    (output / 'metrics.json').write_text(json_text(results, ensure_ascii=False, indent=2),encoding='utf-8')
    print('METRICS_OK:', output / 'metrics.json', flush=True)
    (destination / 'preprocessing.json').write_text(json.dumps({'segmenter':'underthesea','version':'8.3.0',
          'max_length':args.max_length,'normalization':'NFC','tokenization':'syllable-preserving-segmented-BPE','labels':LABELS,
          'caption_tokenizer':CAPTION_TOKENIZER},ensure_ascii=False,indent=2),encoding='utf-8')
    if args.export_onnx:
        export_onnx(model, tokenizer, encoded['test'][0], output, torch, np)


def export_onnx(model, tokenizer, example, output, torch, np):
    import onnx
    import onnxruntime as ort
    model.cpu().eval()
    class Wrapper(torch.nn.Module):
        def __init__(self, classifier): super().__init__(); self.classifier = classifier
        def forward(self, input_ids, attention_mask):
            return self.classifier(input_ids=input_ids, attention_mask=attention_mask).logits
    tensors = tuple(torch.tensor([example[name]], dtype=torch.long) for name in ['input_ids','attention_mask'])
    target = output / 'onnx'; target.mkdir(exist_ok=True)
    wrapper = Wrapper(model)
    torch.onnx.export(wrapper, tensors, str(target / 'model.onnx'), input_names=['input_ids','attention_mask'],
          output_names=['logits'], dynamic_axes={name:{0:'batch',1:'sequence'} for name in ['input_ids','attention_mask','logits']},
          opset_version=17, dynamo=False)
    onnx.checker.check_model(str(target / 'model.onnx'))
    session = ort.InferenceSession(str(target / 'model.onnx'), providers=['CPUExecutionProvider'])
    actual = session.run(None,{name:value.numpy() for name,value in zip(['input_ids','attention_mask'],tensors)})[0]
    with torch.no_grad(): expected = wrapper(*tensors).numpy()
    np.testing.assert_allclose(actual,expected,rtol=1e-3,atol=1e-3)
    tokenizer.save_pretrained(str(target))
    (target / 'export-check.json').write_text(json.dumps({'passed':True,'max_abs_error':float(np.abs(actual-expected).max())}),encoding='utf-8')
    print('ONNX export checked against PyTorch logits.', flush=True)


if __name__ == '__main__':
    main()
