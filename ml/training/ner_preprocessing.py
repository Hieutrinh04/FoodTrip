"""Shared training/inference preprocessing. No torch or network imports here."""
import unicodedata

LABELS = ['O', 'B-BUSINESS', 'I-BUSINESS', 'B-LOC', 'I-LOC']


# Caption tokenizer. Version 2 matches scripts/lib/captionTokens.js; both are
# checked against tokenizer-cases.json. Version 1 is kept for models trained
# before it (their preprocessing.json has no "caption_tokenizer").
CAPTION_TOKENIZER = 2
SEPARATORS = set('/,;|()[]"“”«»!?…')


def _category(c):
    return unicodedata.category(c)[0] if c is not None else ''


def _peel(piece):
    start, end = 0, len(piece)
    while start < end and _category(piece[start]) not in ('L', 'N'):
        start += 1
    while end > start and _category(piece[end - 1]) not in ('L', 'N'):
        end -= 1
    return [part for part in (piece[:start], piece[start:end], piece[end:]) if part]


def tokenize_caption(text, version=CAPTION_TOKENIZER):
    text = unicodedata.normalize('NFC', text)
    if version == 1:
        return [part for raw in text.split() for part in _peel(raw)]
    tokens = []
    # Underscores join words in hashtags and file-like titles; they never carry meaning.
    for raw in text.replace('_', ' ').split():
        piece = ''
        for i, c in enumerate(raw):
            prev = raw[i - 1] if i > 0 else None
            nxt = raw[i + 1] if i + 1 < len(raw) else None
            split = (c in SEPARATORS
                     or (c == ':' and not (_category(prev) == 'N' and _category(nxt) == 'N'))
                     or (c in '-–' and _category(prev) == 'L' and _category(nxt) == 'L'))
            if split:
                tokens.extend(_peel(piece))
                piece = ''
                tokens.append(c)
            else:
                piece += c
        tokens.extend(_peel(piece))
    return tokens


def segment_words(tokens, segmenter):
    words = segmenter(' '.join(tokens), format='text').split()
    original = [part for token in tokens for part in token.split('_')]
    reconstructed = [part for word in words for part in word.split('_')]
    # Same deterministic fallback in training AND inference, not based on labels.
    if original != reconstructed:
        return tokens[:], True
    return words, False


def align_segmented_labels(tokens, tags, words):
    expanded = [tag if i == 0 or tag == 'O' else 'I-' + tag[2:]
                for token, tag in zip(tokens, tags) for i, _ in enumerate(token.split('_'))]
    result, pos = [], 0
    for word in words:
        size = len(word.split('_'))
        span = expanded[pos:pos + size]
        if len(span) != size:
            raise ValueError('incomplete-label-alignment')
        if size > 1:
            expected = [span[0]] + [('O' if span[0] == 'O' else 'I-' + span[0][2:])] * (size - 1)
            if span != expected:
                raise ValueError('segment-crosses-entity-boundary')
        result.append(span[0])
        pos += size
    if pos != len(expanded):
        raise ValueError('incomplete-label-alignment')
    return result


def segmented_syllables(tokens, segmenter, tags=None):
    """Keep segmenter word-join markers but BPE-encode each syllable separately.
    This gives original BIO boundaries their own prediction positions even if
    the segmenter joins a venue with a following word. Never uses gold labels
    to decide the model input. It is an experimental syllable-level baseline,
    not canonical whole-word PhoBERT tokenization; benchmark before deploying.
    """
    words, fallback = segment_words(tokens, segmenter)
    syllables = [part if index == 0 else '_' + part
                 for word in words for index, part in enumerate(word.split('_'))]
    aligned = None
    if tags is not None:
        aligned = [tag if index == 0 or tag == 'O' else 'I-' + tag[2:]
                   for token, tag in zip(tokens, tags) for index, _ in enumerate(token.split('_'))]
        if len(aligned) != len(syllables):
            raise ValueError('incomplete-label-alignment')
    return syllables, aligned, fallback


def encode_words(words, tokenizer, max_length=256, tags=None):
    """Slow PhoBERT BPE: label the first subtoken, ignore others/specials.
    Never truncate halfway through a word. Returns the included word count.
    """
    ids, labels, first = [tokenizer.cls_token_id], [-100], [False]
    included = 0
    for i, word in enumerate(words):
        pieces = tokenizer.encode(word, add_special_tokens=False) or [tokenizer.unk_token_id]
        if len(ids) + len(pieces) + 1 > max_length:
            break
        ids.extend(pieces)
        first.extend([True] + [False] * (len(pieces) - 1))
        labels.extend([LABELS.index(tags[i]) if tags is not None else -100] + [-100] * (len(pieces) - 1))
        included += 1
    ids.append(tokenizer.sep_token_id); labels.append(-100); first.append(False)
    return {'input_ids': ids, 'attention_mask': [1] * len(ids), 'labels': labels}, first, included


def entity_spans(words, tags):
    entities, current = [], None
    for word, tag in zip(words, tags):
        if tag.startswith('B-'):
            current = {'label': tag[2:], 'parts': [word]}
            entities.append(current)
        elif tag.startswith('I-') and current and current['label'] == tag[2:]:
            current['parts'].append(word)
        else:
            current = None
    return [{'label': e['label'], 'text': ' '.join(' '.join(e['parts']).replace('_', ' ').split())} for e in entities]
