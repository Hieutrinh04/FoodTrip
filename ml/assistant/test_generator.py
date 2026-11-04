import json
import unittest

from train_generator import audit_splits, encode, read_rows


class FakeTokenizer:
    def apply_chat_template(self, messages, tokenize=True, add_generation_prompt=False):
        tokens = []
        for message in messages:
            tokens += [1] + [ord(c) for c in message['role']] + [2] + [ord(c) for c in message['content']] + [3]
        if add_generation_prompt:
            tokens += [1] + [ord(c) for c in 'assistant'] + [2]
        return tokens


def row(name, request='test'):
    return {'id': name, 'messages': [{'role': 'system', 'content': 'facts only'}, {'role': 'user', 'content': request}, {'role': 'assistant', 'content': 'answer'}]}


class GeneratorTests(unittest.TestCase):
    def test_assistant_only_loss_and_eos(self):
        sample = row('a')
        tokenizer = FakeTokenizer()
        features = encode(sample, tokenizer, 200)
        prefix = tokenizer.apply_chat_template(sample['messages'][:-1], add_generation_prompt=True)
        self.assertEqual(features['labels'][:len(prefix)], [-100] * len(prefix))
        self.assertEqual(features['labels'][len(prefix):], features['input_ids'][len(prefix):])
        self.assertEqual(features['labels'][-1], 3)

    def test_no_silent_truncation(self):
        with self.assertRaisesRegex(ValueError, 'too long'):
            encode(row('a'), FakeTokenizer(), 4)

    def test_prompt_leakage_fails(self):
        with self.assertRaisesRegex(ValueError, 'leakage'):
            audit_splits({'train': [row('a')], 'test': [row('b')]})
        audit_splits({'train': [row('a')], 'test': [row('b', 'unseen')]})

    def test_generated_dataset_hashes_and_schema(self):
        import hashlib
        from pathlib import Path
        data = Path(__file__).parent / 'sft-data'
        manifest = json.loads((data / 'manifest.json').read_text(encoding='utf-8'))
        splits = {split: read_rows(data / f'{split}.jsonl') for split in manifest['splits']}
        audit_splits(splits)
        for split, info in manifest['splits'].items():
            self.assertEqual(len(splits[split]), info['rows'])
            self.assertEqual(hashlib.sha256((data / f'{split}.jsonl').read_bytes()).hexdigest(), info['sha256'])


if __name__ == '__main__':
    unittest.main()
