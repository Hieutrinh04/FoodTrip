"""Assemble a self-hosted generator service from the Colab adapter bundle."""
import argparse
import json
from pathlib import Path
import shutil
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('archive')
parser.add_argument('--output', default='ml/generator-space')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = Path(args.output).resolve()
if not output.is_relative_to(root / 'ml') or output.exists():
    raise SystemExit('Output must be a new directory inside this project\'s ml folder')
with zipfile.ZipFile(args.archive) as archive:
    names = {i.filename for i in archive.infolist() if not i.is_dir()}
    if not {'adapter/adapter_model.safetensors', 'adapter/adapter_config.json', 'adapter/training-manifest.json', 'generator-metrics.json', 'samples.json'} <= names:
        raise SystemExit('Missing adapter or evaluation files')
    for name in names:
        if not (output / name).resolve().is_relative_to(output):
            raise SystemExit('Unsafe archive path')
    report = json.loads(archive.read('generator-metrics.json'))
    if report.get('smoke') is not False:
        raise SystemExit('A smoke artifact is not a trained model')
    shutil.copytree(root / 'ml/assistant/generator-space', output)
    archive.extractall(output)
print(f'Service assembled at {output}. Review samples.json and configure GENERATOR_TOKEN before hosting.')
