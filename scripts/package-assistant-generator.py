"""Package only allowlisted public/synthetic training sources, never environment files."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
files = ['train_generator.py', 'requirements-generator.txt'] + [f'sft-data/{name}' for name in ['train.jsonl', 'validation.jsonl', 'test.jsonl', 'manifest.json']]
target = root / 'ml/foodtrip-generator-colab.zip'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / 'ml/assistant' / name, name)
print(json.dumps({'archive': str(target), 'files': files, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}, indent=2))
