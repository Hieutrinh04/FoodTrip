"""Kaggle GPU environment for the FoodTrip NER run (the Kaggle notebook pastes this file in).

Same pinned stack as setup_colab.py — Python 3.12 venv via uv, torch 2.6.0 cu124,
requirements-colab.txt — but everything heavy lives under /tmp: /kaggle/working
is kept as the notebook's output, and a multi-GB venv there would be saved too.
Needs the notebook's Internet setting ON (a phone-verified Kaggle account).
"""
import os
import socket
import subprocess
import sys
from pathlib import Path


def run(command, *, cwd=None, env=None):
    """Stream both output channels so installation failures are visible in the notebook."""
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


WORK = Path('/tmp/foodtrip-ner')
if not (WORK / 'requirements-colab.txt').is_file():
    raise RuntimeError('Chạy cell 1 (tìm bộ dữ liệu trong /kaggle/input) trước')
try:
    socket.create_connection(('pypi.org', 443), timeout=10).close()
except OSError:
    raise RuntimeError('Không có Internet. Bật Settings → Internet: On (tài khoản Kaggle cần xác minh số điện thoại), rồi chạy lại.')
run(['nvidia-smi'])
TOOLS = Path('/tmp/foodtrip-uv-tools')
run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
     '--target', str(TOOLS), '--upgrade', 'uv==0.9.5'])
uv_env = dict(os.environ)
uv_env['PYTHONPATH'] = str(TOOLS)
uv_env['UV_PYTHON_INSTALL_DIR'] = '/tmp/foodtrip-uv-python'
UV = [sys.executable, '-m', 'uv']
run(UV + ['python', 'install', '3.12'], env=uv_env)
ENV = Path('/tmp/foodtrip-ner-py312')
PY = str(ENV / 'bin/python')
if not Path(PY).exists():
    run(UV + ['venv', '--python', '3.12', '--seed', str(ENV)], env=uv_env)
run([PY, '-c', 'import sys; print(sys.version); assert sys.version_info[:2] == (3, 12)'])
run([PY, '-m', 'pip', 'install', 'pip==25.0.1', 'setuptools==75.8.0', 'wheel', 'numpy==2.2.6'])
run([PY, '-m', 'pip', 'install', 'torch==2.6.0', '--index-url', 'https://download.pytorch.org/whl/cu124'])
run([PY, '-m', 'pip', 'install', '--no-build-isolation', '-r', str(WORK / 'requirements-colab.txt')])
run([PY, '-m', 'pip', 'check'])
# One GPU, like the baseline run: with "T4 x2" the trainer would otherwise split each
# batch over both cards and the effective batch size would differ from the baseline.
GPU_ENV = dict(os.environ, CUDA_VISIBLE_DEVICES='0')
run([PY, '-c', "import torch; print(torch.__version__); assert torch.cuda.is_available(), 'Chưa có GPU'; print(torch.cuda.get_device_name(0))"], env=GPU_ENV)
print('GPU_SETUP_OK — tiếp tục mục 3. Kiểm tra nhãn/tách từ và smoke test', flush=True)
