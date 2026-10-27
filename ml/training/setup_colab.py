"""Paste this entire file into Colab's GPU environment cell (not a local run)."""
import os
import subprocess
import sys
from pathlib import Path


def run(command, *, cwd=None, env=None):
    """Stream both output channels so installation failures are visible in Colab."""
    process_env = dict(os.environ if env is None else env)
    process_env['PYTHONUNBUFFERED'] = '1'
    with subprocess.Popen(command, cwd=cwd, env=process_env,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          text=True, bufsize=1) as process:
        for line in process.stdout:
            print(line, end='', flush=True)
        status = process.wait()
    if status:
        raise subprocess.CalledProcessError(status, command)


WORK = Path('/content/foodtrip-ner')
if not (WORK / 'requirements-colab.txt').is_file():
    raise RuntimeError('Chạy cell upload foodtrip-ner-colab.zip trước')
run(['nvidia-smi'])
TOOLS = Path('/content/foodtrip-uv-tools')
run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
     '--target', str(TOOLS), '--upgrade', 'uv==0.9.5'])
uv_env = dict(os.environ)
uv_env['PYTHONPATH'] = str(TOOLS)
UV = [sys.executable, '-m', 'uv']
run(UV + ['python', 'install', '3.12'], env=uv_env)
# A different path preserves the incomplete environment from the failed cell.
ENV = Path('/content/foodtrip-ner-py312')
PY = str(ENV / 'bin/python')
if not Path(PY).exists():
    run(UV + ['venv', '--python', '3.12', '--seed', str(ENV)], env=uv_env)
run([PY, '-c', 'import sys; print(sys.version); assert sys.version_info[:2] == (3, 12)'])
run([PY, '-m', 'pip', 'install', 'pip==25.0.1', 'setuptools==75.8.0', 'wheel', 'numpy==2.2.6'])
run([PY, '-m', 'pip', 'install', 'torch==2.6.0', '--index-url', 'https://download.pytorch.org/whl/cu124'])
run([PY, '-m', 'pip', 'install', '--no-build-isolation', '-r', str(WORK / 'requirements-colab.txt')])
run([PY, '-m', 'pip', 'check'])
run([PY, '-c', "import torch; print(torch.__version__); assert torch.cuda.is_available(), 'Chưa có GPU'; print(torch.cuda.get_device_name(0))"])
print('GPU_SETUP_OK — tiếp tục mục 3. Kiểm tra nhãn/tách từ và smoke test', flush=True)
