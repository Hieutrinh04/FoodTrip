"""A Colab cell, run after the intent/retriever notebook has created PY and run()."""
from pathlib import Path
import json
import zipfile

SFT = Path('/content/foodtrip-generator')
SFT.mkdir(exist_ok=True)
with zipfile.ZipFile('/content/foodtrip-generator-colab.zip') as archive:
    for item in archive.infolist():
        if not (SFT / item.filename).resolve().is_relative_to(SFT.resolve()):
            raise ValueError('Unsafe archive path')
    archive.extractall(SFT)
run([PY, '-m', 'pip', 'install', '-r', str(SFT / 'requirements-generator.txt')])
run([PY, str(SFT / 'train_generator.py'), '--data', 'sft-data', '--output', 'runs/generator-smoke', '--smoke'], cwd=SFT)
run([PY, str(SFT / 'train_generator.py'), '--data', 'sft-data', '--output', 'runs/generator'], cwd=SFT)
print((SFT / 'runs/generator/GENERATOR.md').read_text())
print((SFT / 'runs/generator/samples.json').read_text())
generator_bundle = Path('/content/foodtrip-generator-trained.zip')
with zipfile.ZipFile(generator_bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
    for item in (SFT / 'runs/generator').rglob('*'):
        if item.is_file() and 'checkpoints' not in item.parts:
            archive.write(item, item.relative_to(SFT / 'runs/generator'))
files.download(str(generator_bundle))
