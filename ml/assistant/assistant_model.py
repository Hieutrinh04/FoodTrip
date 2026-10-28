"""FoodTrip assistant — what a message asks for (intent) and the pieces of
information in it (BIO slots), read by one PhoBERT encoder with two heads.

Shared by training (train_assistant.py) and the service (assistant_infer.py).
No torch or network imports here: the service runs the ONNX export.

Words are split exactly as the dataset generator split them
(ner_preprocessing.tokenize_caption = scripts/lib/captionTokens.js), then
word-segmented with underthesea the way the NER baseline does
(segmented_syllables): every syllable keeps its own position, so a slot
boundary never disappears inside a segmented word.
"""
import json
from pathlib import Path

from ner_preprocessing import segmented_syllables, tokenize_caption

MODEL = 'vinai/phobert-base'
REVISION = '01daacda68afe13d83023d16ec647239e344a1e6'
MAX_TOKENS = 80


def load_labels(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    return data['intents'], data['slots']


def encode(syllables, tokenizer, max_length, tag_ids=None):
    """PhoBERT pieces of each syllable; the slot label sits on the first piece.

    Returns (input_ids, slot_labels, first_piece_mask, syllables_included).
    A syllable is never cut in half: what does not fit is left out whole.
    """
    ids, labels, first = [tokenizer.cls_token_id], [-100], [False]
    included = 0
    for i, syllable in enumerate(syllables):
        pieces = tokenizer.encode(syllable, add_special_tokens=False) or [tokenizer.unk_token_id]
        if len(ids) + len(pieces) + 1 > max_length:
            break
        ids.extend(pieces)
        first.extend([True] + [False] * (len(pieces) - 1))
        labels.extend([tag_ids[i] if tag_ids is not None else -100] + [-100] * (len(pieces) - 1))
        included += 1
    ids.append(tokenizer.sep_token_id)
    labels.append(-100)
    first.append(False)
    return ids, labels, first, included


def prepare(tokens, tokenizer, segmenter, max_length, tags=None, slot_labels=None):
    """Tokens (and gold tags) of one message → model inputs."""
    tokens = tokens[:MAX_TOKENS]
    syllables, aligned, _ = segmented_syllables(tokens, segmenter, tags[:MAX_TOKENS] if tags else None)
    tag_ids = [slot_labels.index(t) for t in aligned] if aligned is not None else None
    ids, labels, first, included = encode(syllables, tokenizer, max_length, tag_ids)
    return {'input_ids': ids, 'attention_mask': [1] * len(ids), 'slot_labels': labels}, first, included


def first_piece_tags(first, slot_ids, slot_labels):
    """Predicted label of each included syllable, from the first-piece positions."""
    return [slot_labels[int(label)] for keep, label in zip(first, slot_ids) if keep]


def spans(tokens, tags):
    """BIO tags → [{'type', 'text', 'start', 'end'}]; an I- without its B- starts a span."""
    found, current = [], None
    for i, (token, tag) in enumerate(zip(tokens, tags)):
        kind = tag[2:] if tag != 'O' else None
        if kind and (tag.startswith('B-') or current is None or current['type'] != kind):
            current = {'type': kind, 'start': i, 'end': i + 1, 'parts': [token]}
            found.append(current)
        elif kind:
            current['end'] = i + 1
            current['parts'].append(token)
        else:
            current = None
    return [{'type': s['type'], 'text': ' '.join(s['parts']), 'start': s['start'], 'end': s['end']} for s in found]


def softmax(values):
    import math
    top = max(values)
    exps = [math.exp(v - top) for v in values]
    total = sum(exps)
    return [e / total for e in exps]


def read_message(text):
    """The words of a message, as the dataset generator split them."""
    return tokenize_caption(' '.join(str(text or '').split())[:600])
