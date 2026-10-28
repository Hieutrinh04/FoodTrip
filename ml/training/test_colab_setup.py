"""Offline orchestration tests; do not download Python, Torch or use a GPU."""
import contextlib
import io
from pathlib import Path
import subprocess
import unittest
from unittest.mock import MagicMock, patch

SOURCE = Path(__file__).with_name('setup_colab.py').read_text(encoding='utf8')


class SetupTests(unittest.TestCase):
    def execute(self, *, uploaded=True, environment_exists=False, failed_command=None):
        commands = []

        def launch(command, **kwargs):
            commands.append(command)
            self.assertEqual(kwargs['stderr'], subprocess.STDOUT)
            self.assertEqual(kwargs['env']['PYTHONUNBUFFERED'], '1')
            process = MagicMock()
            process.__enter__.return_value = process
            process.stdout = iter(['visible installation log\n'])
            process.wait.return_value = int(failed_command is not None and len(commands) == failed_command)
            return process

        output = io.StringIO()
        with patch.object(Path, 'is_file', return_value=uploaded), \
                patch.object(Path, 'exists', return_value=environment_exists), \
                patch.object(subprocess, 'Popen', side_effect=launch), \
                contextlib.redirect_stdout(output):
            try:
                exec(compile(SOURCE, 'setup_colab.py', 'exec'), {})
            except (RuntimeError, subprocess.CalledProcessError) as error:
                return commands, output.getvalue(), error
        return commands, output.getvalue(), None

    def test_no_upload_stops_before_gpu_or_downloads(self):
        commands, _, error = self.execute(uploaded=False)
        self.assertEqual(commands, [])
        self.assertIsInstance(error, RuntimeError)

    def test_no_gpu_stops_before_any_install(self):
        commands, output, error = self.execute(failed_command=1)
        self.assertEqual(commands, [['nvidia-smi']])
        self.assertIsInstance(error, subprocess.CalledProcessError)
        self.assertIn('visible installation log', output)
        self.assertNotIn('GPU_SETUP_OK', output)

    def test_setup_uses_uv_and_separate_py312_path(self):
        commands, output, error = self.execute()
        self.assertIsNone(error)
        self.assertTrue(any(command[-3:] == ['python', 'install', '3.12'] for command in commands))
        self.assertTrue(any('venv' in command and '3.12' in command and '--seed' in command for command in commands))
        self.assertTrue(any('/content/foodtrip-ner-py312/bin/python' == command[0].replace('\\', '/') for command in commands))
        self.assertFalse(any(command[1:3] == ['-m', 'venv'] for command in commands))
        self.assertIn('GPU_SETUP_OK', output)

    def test_install_failure_cannot_claim_ready(self):
        commands, output, error = self.execute(failed_command=2)
        self.assertEqual(len(commands), 2)
        self.assertIsInstance(error, subprocess.CalledProcessError)
        self.assertNotIn('GPU_SETUP_OK', output)

    def test_reuse_does_not_recreate_or_delete_environment(self):
        commands, _, error = self.execute(environment_exists=True)
        self.assertIsNone(error)
        self.assertFalse(any('venv' in command for command in commands))
        self.assertTrue(any('check' in command for command in commands))


if __name__ == '__main__':
    unittest.main()
