"""CPU-only tests for numeric reports and no-retrain recovery guards."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
from train_ner import json_text, validate_evaluation_inputs


class ReportTests(unittest.TestCase):
    def test_numpy_support_is_numeric_json(self):
        report = {'support':np.int64(12),'f1':np.float32(0.5),'rows':np.array([1,2]),'ok':np.bool_(True)}
        saved = json.loads(json_text(report))
        self.assertEqual(saved, {'support':12,'f1':0.5,'rows':[1,2],'ok':True})
        self.assertIsInstance(saved['support'], int)

    def test_unknown_types_and_nonfinite_metrics_are_not_silently_strings(self):
        with self.assertRaises(TypeError): json_text(object())
        with self.assertRaises(ValueError): json_text({'f1':float('nan')})

    def test_actual_seqeval_report_can_be_saved(self):
        from seqeval.metrics import classification_report
        from seqeval.scheme import IOB2
        labels = [['B-BUSINESS','I-BUSINESS','O','B-LOC']]
        report = classification_report(labels, labels, mode='strict', scheme=IOB2, output_dict=True, zero_division=0)
        saved = json.loads(json_text(report))
        self.assertEqual(saved['BUSINESS']['support'], 1)
        self.assertEqual(saved['LOC']['f1-score'], 1.0)

    def test_evaluation_refuses_changed_data_or_wrong_length(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); data = root / 'data'; output = root / 'run'
            data.mkdir(); (output / 'model').mkdir(parents=True)
            (output / 'model/config.json').write_text('{}')
            item = data / 'test.jsonl'; item.write_text('{}\n')
            info = {'arguments':{'max_length':256}, 'dataset_sha256':{'test.jsonl':hashlib.sha256(item.read_bytes()).hexdigest()}}
            (output / 'run-info.json').write_text(json.dumps(info))
            validate_evaluation_inputs(data, output, 256)
            with self.assertRaises(SystemExit): validate_evaluation_inputs(data, output, 128)
            item.write_text('{"changed":true}\n')
            with self.assertRaises(SystemExit): validate_evaluation_inputs(data, output, 256)

    def test_evaluation_without_model_never_falls_back_to_training(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(SystemExit): validate_evaluation_inputs(root, root, 256)


if __name__ == '__main__':
    unittest.main()
