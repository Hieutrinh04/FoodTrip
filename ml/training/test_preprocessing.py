import json
import unittest
from pathlib import Path
from ner_preprocessing import align_segmented_labels, encode_words, segment_words, segmented_syllables, tokenize_caption


class Tokenizer:
    cls_token_id, sep_token_id, unk_token_id = 0, 2, 3
    def encode(self, word, add_special_tokens=False):
        return [10, 11] if word == 'compound' else [12]


class PreprocessingTest(unittest.TestCase):
    def test_alignment(self):
        self.assertEqual(align_segmented_labels(['Đà', 'Lạt', 'ngon'], ['B-LOC', 'I-LOC', 'O'], ['Đà_Lạt', 'ngon']), ['B-LOC', 'O'])

    def test_crossing_is_rejected_not_silently_relabelled(self):
        for tags in [['O', 'B-LOC'], ['B-LOC', 'B-LOC']]:
            with self.assertRaisesRegex(ValueError, 'boundary'):
                align_segmented_labels(['A', 'B'], tags, ['A_B'])

    def test_label_independent_fallback(self):
        words, fallback = segment_words(['Đà', 'Lạt'], lambda *a, **k: 'Đà khác')
        self.assertTrue(fallback); self.assertEqual(words, ['Đà', 'Lạt'])

    def test_bpe_special_padding_and_whole_word_truncation(self):
        encoded, first, included = encode_words(['compound', 'next'], Tokenizer(), 4, ['B-LOC', 'O'])
        self.assertEqual(encoded['labels'], [-100, 3, -100, -100])
        self.assertEqual(first, [False, True, False, False]); self.assertEqual(included, 1)

    def test_caption_tokens(self):
        self.assertEqual(tokenize_caption('Đi Đà Lạt, ngon!'), ['Đi', 'Đà', 'Lạt', ',', 'ngon', '!'])

    def test_caption_tokens_match_javascript_cases(self):
        # The same cases scripts/lib/captionTokens.js is tested with (test/captionTokens.test.js).
        cases = json.loads((Path(__file__).parent / 'tokenizer-cases.json').read_text(encoding='utf8'))
        for text, expected in cases:
            self.assertEqual(tokenize_caption(text), expected, text)

    def test_version_1_still_available_for_older_models(self):
        self.assertEqual(tokenize_caption('To/Đà Lạt', 1), ['To/Đà', 'Lạt'])

    def test_syllable_encoding_preserves_boundary_without_using_gold_to_segment(self):
        segmenter = lambda *a, **k: 'Hi_Coffee_nha'
        words, tags, _ = segmented_syllables(['Hi', 'Coffee', 'nha'], segmenter, ['B-BUSINESS','I-BUSINESS','O'])
        self.assertEqual(words, ['Hi','_Coffee','_nha'])
        self.assertEqual(tags, ['B-BUSINESS','I-BUSINESS','O'])
        self.assertEqual(segmented_syllables(['Hi','Coffee','nha'],segmenter)[0],words)


if __name__ == '__main__':
    unittest.main()
