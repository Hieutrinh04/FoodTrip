"""Lightweight label audit, without loading PhoBERT or torch."""
import argparse
import json
from collections import Counter
from pathlib import Path
from underthesea import word_tokenize
from ner_preprocessing import segmented_syllables

parser = argparse.ArgumentParser()
parser.add_argument('--data', required=True)
args = parser.parse_args()
report = {}
errors = []
for name in ['train', 'val', 'test', 'val_template', 'test_template']:
    counts = Counter()
    for index, line in enumerate((Path(args.data) / (name + '.jsonl')).read_text(encoding='utf-8').splitlines()):
        if not line.strip(): continue
        row = json.loads(line)
        try:
            words, _, fallback = segmented_syllables(row['tokens'], word_tokenize, row['ner_tags'])
            counts['ok'] += 1
            counts['deterministic_raw_fallback'] += int(fallback)
        except ValueError as err:
            errors.append({'split': name, 'row': index, 'reason': str(err), 'tokens': row['tokens'], 'tags': row['ner_tags']})
            counts['failed'] += 1
    report[name] = dict(counts)
print(json.dumps({'counts': report, 'errors': errors}, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)
