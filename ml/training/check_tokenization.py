"""Checks real PhoBERT BPE/labels without loading its weights or using a GPU."""
import argparse
import json
from collections import Counter
from pathlib import Path
from transformers import AutoTokenizer
from underthesea import word_tokenize
from ner_preprocessing import encode_words, segmented_syllables
from train_ner import MODEL, REVISION, read_rows

parser = argparse.ArgumentParser()
parser.add_argument('--data', required=True)
args = parser.parse_args()
tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, use_fast=False, trust_remote_code=False)
report = {}
for name in ['train','val','test','val_template','test_template']:
    counts = Counter()
    for row in read_rows(Path(args.data) / (name + '.jsonl')):
        words, tags, fallback = segmented_syllables(row['tokens'], word_tokenize, row['ner_tags'])
        encoded, first, included = encode_words(words, tokenizer, 256, tags)
        assert len(encoded['input_ids']) == len(encoded['labels']) == len(encoded['attention_mask'])
        assert sum(first) == included
        assert sum(label != -100 for label in encoded['labels']) == included
        counts['checked'] += 1
        counts['truncated'] += int(included < len(words))
        counts['max_bpe_length'] = max(counts['max_bpe_length'],len(encoded['input_ids']))
    if name in ('val','test') and counts['truncated']:
        raise SystemExit('Real evaluation split is truncated; full-text evaluation required')
    report[name] = dict(counts)
print(json.dumps(report,indent=2))
