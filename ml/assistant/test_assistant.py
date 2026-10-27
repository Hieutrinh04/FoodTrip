"""Checks run before training (no torch, no network): input encoding keeps one
labelled position per syllable, slot spans read back as written, and the
dataset is consistent with labels.json.

    python test_assistant.py [data]
"""
import json
import sys
from pathlib import Path

from assistant_model import encode, first_piece_tags, load_labels, read_message, softmax, spans


class FakeTokenizer:
    """Two pieces for long syllables, one for short — enough to test alignment."""
    cls_token_id, sep_token_id, unk_token_id, pad_token_id = 0, 2, 3, 1

    def encode(self, text, add_special_tokens=False):
        return [10, 11] if len(text) > 3 else [12]


def test_encoding_and_spans():
    syllables = ['đi', 'Đà', '_Lạt', '3', 'ngày']
    ids, labels, first, included = encode(syllables, FakeTokenizer(), 32, [0, 1, 2, 3, 4])
    assert included == 5
    assert ids[0] == 0 and ids[-1] == 2
    assert [l for l in labels if l != -100] == [0, 1, 2, 3, 4], labels
    assert sum(first) == 5
    # Too short a window drops whole syllables, never half of one.
    _, labels_short, first_short, kept = encode(syllables, FakeTokenizer(), 5, [0, 1, 2, 3, 4])
    assert kept == 2 and sum(first_short) == 2, (kept, first_short)
    slot_labels = ['O', 'B-DEST', 'I-DEST', 'B-DURATION', 'I-DURATION']
    # A model that predicts every first piece right: its label there, anything elsewhere.
    predicted = [label if label != -100 else 0 for label in labels]
    tags = first_piece_tags(first, predicted, slot_labels)
    assert tags == slot_labels, tags
    assert spans(['đi', 'Đà', 'Lạt', '3', 'ngày'], tags) == [
        {'type': 'DEST', 'text': 'Đà Lạt', 'start': 1, 'end': 3},
        {'type': 'DURATION', 'text': '3 ngày', 'start': 3, 'end': 5},
    ]
    # An I- with no B- before it still starts a span.
    assert spans(['a', 'b'], ['I-PREF', 'I-PREF']) == [{'type': 'PREF', 'text': 'a b', 'start': 0, 'end': 2}]
    assert abs(sum(softmax([1.0, 2.0, 3.0])) - 1) < 1e-9
    assert read_message('  Đà Lạt,  2 người! ') == ['Đà', 'Lạt', ',', '2', 'người', '!']


def test_dataset(data):
    intents, slot_labels = load_labels(data / 'labels.json')
    for name in ('train', 'validation', 'test', 'real_test'):
        rows = [json.loads(line) for line in (data / f'{name}.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
        assert rows, name
        for row in rows:
            assert row['intent'] in intents, row
            assert len(row['tokens']) == len(row['tags']), row
            assert all(t in slot_labels for t in row['tags']), row
            assert read_message(row['text']) == row['tokens'], ('tokenizer differs from the generator', row['text'])
    texts = {name: {json.loads(l)['text'] for l in (data / f'{name}.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()} for name in ('train', 'test')}
    assert not texts['train'] & texts['test'], 'a test message is also in train'


def test_retriever_scoring():
    from train_retriever import answered_at, choose_threshold, measure
    ranked = [[('a', 0.9), ('b', 0.5)], [('b', 0.8), ('a', 0.2)], [('a', 0.6), ('c', 0.5)], [('c', 0.3), ('b', 0.2)]]
    gold = ['a', 'a', 'a', 'b']
    assert measure(ranked, gold) == {'top1': 0.5, 'top3': 1.0, 'rows': 4}
    # Highest score first: 0.9 right, 0.8 wrong (50%), 0.6 right (67%), 0.3 wrong — none reaches 90% below 0.9.
    assert choose_threshold(ranked, gold) == 0.9
    assert answered_at(ranked, gold, 0.6) == {'answered': 0.75, 'right_when_answered': 2 / 3}
    assert answered_at(ranked, gold, 0.95) == {'answered': 0.0, 'right_when_answered': None}


def test_faq_data(data):
    rows = lambda name: [json.loads(l) for l in (data / name).read_text(encoding='utf-8').splitlines() if l.strip()]
    ids = {e['id'] for e in rows('faq_entries.jsonl')}
    train, validation, test = rows('faq_train.jsonl'), rows('faq_validation.jsonl'), rows('faq_test.jsonl')
    assert all(r['id'] in ids for r in train + validation + test)
    assert not {r['question'] for r in train} & {r['question'] for r in test}, 'a test question is also in training'
    assert not {r['question'] for r in train} & {r['question'] for r in validation}, 'a validation question is also in training'


if __name__ == '__main__':
    test_encoding_and_spans()
    test_retriever_scoring()
    if len(sys.argv) > 1:
        test_dataset(Path(sys.argv[1]))
        test_faq_data(Path(sys.argv[1]))
    print('ASSISTANT_TESTS_OK')
