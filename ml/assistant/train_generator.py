"""Fine-tune a local open-weight model with LoRA, using assistant-only loss.

No paid inference API, Hub uploads, account logs or automatic deployment.
Use a Colab/Kaggle GPU. --smoke performs two steps and exports no production adapter.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path


def read_rows(path):
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]


def encode(row, tokenizer, max_length):
    prompt = tokenizer.apply_chat_template(row['messages'][:-1], tokenize=True, add_generation_prompt=True)
    full = tokenizer.apply_chat_template(row['messages'], tokenize=True, add_generation_prompt=False)
    if full[:len(prompt)] != prompt:
        raise ValueError('Chat template prompt is not an exact prefix')
    if len(full) > max_length:
        raise ValueError(f"Example {row['id']} is too long ({len(full)} tokens); raise --max-length rather than truncate its answer")
    if len(full) <= len(prompt):
        raise ValueError('No assistant tokens to train')
    return {'input_ids': full, 'attention_mask': [1] * len(full), 'labels': [-100] * len(prompt) + full[len(prompt):]}


def audit_splits(splits):
    seen = {}
    for split, rows in splits.items():
        if not rows:
            raise ValueError(f'Empty split: {split}')
        for row in rows:
            if [m['role'] for m in row['messages']] != ['system', 'user', 'assistant']:
                raise ValueError('Expected system/user/assistant roles')
            prompt = row['messages'][1]['content']
            if prompt in seen and seen[prompt] != split:
                raise ValueError('Prompt leakage across splits')
            seen[prompt] = split


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default='sft-data')
    parser.add_argument('--output', default='runs/generator')
    parser.add_argument('--epochs', type=int, default=3)
    parser.add_argument('--max-length', type=int, default=768)
    parser.add_argument('--smoke', action='store_true')
    args = parser.parse_args()
    if args.epochs < 1 or not 256 <= args.max_length <= 2048:
        raise SystemExit('Invalid training arguments')
    data, output = Path(args.data), Path(args.output)
    manifest = json.loads((data / 'manifest.json').read_text(encoding='utf-8'))
    splits = {s: read_rows(data / f'{s}.jsonl') for s in ('train', 'validation', 'test')}
    audit_splits(splits)
    for split, info in manifest['splits'].items():
        if hashlib.sha256((data / f'{split}.jsonl').read_bytes()).hexdigest() != info['sha256']:
            raise ValueError(f'Dataset hash mismatch: {split}')

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, set_seed
    from peft import LoraConfig, TaskType, get_peft_model
    if not torch.cuda.is_available():
        raise SystemExit('GPU required. Select T4 in Colab or Kaggle.')
    set_seed(42)
    tokenizer = AutoTokenizer.from_pretrained(manifest['base'], revision=manifest['revision'])
    tokenizer.pad_token = tokenizer.eos_token
    if args.smoke:
        splits = {s: rows[:4] for s, rows in splits.items()}
    encoded = {s: [encode(r, tokenizer, args.max_length) for r in rows] for s, rows in splits.items()}
    base = AutoModelForCausalLM.from_pretrained(manifest['base'], revision=manifest['revision'], torch_dtype=torch.float16, attn_implementation='sdpa')
    base.config.use_cache = False
    model = get_peft_model(base, LoraConfig(task_type=TaskType.CAUSAL_LM, r=16, lora_alpha=32, lora_dropout=0.05, target_modules=['q_proj', 'v_proj']))
    model.enable_input_require_grads()
    model.print_trainable_parameters()

    def collate(rows):
        width = max(len(r['input_ids']) for r in rows)
        return {key: torch.tensor([r[key] + [pad] * (width - len(r[key])) for r in rows]) for key, pad in [('input_ids', tokenizer.pad_token_id), ('attention_mask', 0), ('labels', -100)]}

    class Rows(torch.utils.data.Dataset):
        def __init__(self, rows): self.rows = rows
        def __len__(self): return len(self.rows)
        def __getitem__(self, i): return self.rows[i]

    training = TrainingArguments(output_dir=str(output / 'checkpoints'), num_train_epochs=args.epochs,
        max_steps=2 if args.smoke else -1, per_device_train_batch_size=1, per_device_eval_batch_size=1,
        gradient_accumulation_steps=8, gradient_checkpointing=True, learning_rate=1e-4,
        fp16=True, warmup_ratio=0.05, weight_decay=0.01, logging_steps=5, eval_strategy='epoch',
        save_strategy='epoch', save_total_limit=1, load_best_model_at_end=not args.smoke,
        metric_for_best_model='eval_loss', greater_is_better=False, report_to='none', seed=42)
    trainer = Trainer(model=model, args=training, train_dataset=Rows(encoded['train']), eval_dataset=Rows(encoded['validation']), data_collator=collate)
    before = trainer.evaluate(Rows(encoded['test'])) if not args.smoke else None
    trainer.train()
    output.mkdir(parents=True, exist_ok=True)
    if args.smoke:
        (output / 'smoke-passed.json').write_text('{"passed":true,"trained_model":false}')
        print('GENERATOR_SMOKE_OK — not a quality result', flush=True)
        return
    after = trainer.evaluate(Rows(encoded['test']))
    target = output / 'adapter'
    model.save_pretrained(target)
    tokenizer.save_pretrained(target)
    (target / 'training-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    model.eval()
    model.config.use_cache = True
    model.gradient_checkpointing_disable()
    samples = []
    with torch.inference_mode():
        for row in splits['test'][:12] + splits['test'][-4:]:
            ids = tokenizer.apply_chat_template(row['messages'][:-1], tokenize=True, add_generation_prompt=True, return_tensors='pt').to(model.device)
            result = model.generate(ids, attention_mask=torch.ones_like(ids), max_new_tokens=180, do_sample=False, pad_token_id=tokenizer.pad_token_id)
            samples.append({'id': row['id'], 'request': json.loads(row['messages'][1]['content']), 'expected': row['messages'][-1]['content'], 'generated': tokenizer.decode(result[0, ids.shape[1]:], skip_special_tokens=True)})
    (output / 'samples.json').write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding='utf-8')
    report = {'base': manifest['base'], 'revision': manifest['revision'], 'dataset': manifest,
        'test_rows': len(splits['test']), 'base_test_loss': before['eval_loss'], 'tuned_test_loss': after['eval_loss'],
        'tuned_perplexity': math.exp(min(after['eval_loss'], 20)), 'smoke': False,
        'deployment_approved': False, 'limitations': ['Small FAQ/synthetic dataset; loss is not factual accuracy', 'Manual Vietnamese review and live-data grounding required before deployment']}
    (output / 'generator-metrics.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'GENERATOR.md').write_text(f"# FoodTrip LoRA training\n\nBase: {manifest['base']}\nTest rows: {len(splits['test'])}\nBase loss: {before['eval_loss']:.4f}\nTuned loss: {after['eval_loss']:.4f}\n\nAdapter saved. Deployment is not approved by this training run. Review samples.json; loss does not measure factual accuracy.\n", encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
