"""Run the exported assistant (ONNX) on one message — for the Hugging Face
Space (space/app.py) and for checking an export by hand:

    python assistant_infer.py runs/assistant/onnx "3 ngày ở Đà Lạt, 2 người, 3 triệu"
"""
import json
import sys
from pathlib import Path

from assistant_model import first_piece_tags, prepare, read_message, softmax, spans


class Assistant:
    def __init__(self, model_dir):
        import onnxruntime as ort
        from transformers import AutoTokenizer
        from underthesea import word_tokenize
        model_dir = Path(model_dir)
        config = json.loads((model_dir / 'assistant.json').read_text(encoding='utf-8'))
        if config.get('caption_tokenizer') != 2:
            raise SystemExit('This model was trained with another word splitter')
        self.intents, self.slots, self.max_length = config['intents'], config['slots'], config['max_length']
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, use_fast=False)
        self.segmenter = word_tokenize
        self.session = ort.InferenceSession(str(model_dir / 'model.onnx'), providers=['CPUExecutionProvider'])

    def predict(self, text):
        """{'intent', 'confidence', 'intents': [{'id', 'p'}×3], 'slots': [{'type', 'text', 'start', 'end'}], 'tokens'}"""
        import numpy as np
        tokens = read_message(text)
        if not tokens:
            return {'intent': 'out_of_scope', 'confidence': 1.0, 'intents': [], 'slots': [], 'tokens': []}
        features, first, included = prepare(tokens, self.tokenizer, self.segmenter, self.max_length)
        intent_logits, slot_logits = self.session.run(None, {
            'input_ids': np.array([features['input_ids']], dtype=np.int64),
            'attention_mask': np.array([features['attention_mask']], dtype=np.int64),
        })
        probabilities = softmax([float(v) for v in intent_logits[0]])
        ranked = sorted(range(len(probabilities)), key=lambda i: -probabilities[i])
        tags = first_piece_tags(first, slot_logits[0].argmax(-1), self.slots)
        kept = tokens[:included]
        return {
            'intent': self.intents[ranked[0]], 'confidence': round(probabilities[ranked[0]], 4),
            'intents': [{'id': self.intents[i], 'p': round(probabilities[i], 4)} for i in ranked[:3]],
            'slots': spans(kept, tags), 'tokens': kept,
        }


class Retriever:
    """The fine-tuned answer retriever (train_retriever.py): a question → the closest FAQ entries."""

    def __init__(self, model_dir, entries_path):
        import numpy as np
        import onnxruntime as ort
        from transformers import AutoTokenizer
        from underthesea import word_tokenize
        model_dir = Path(model_dir)
        config = json.loads((model_dir / 'retriever.json').read_text(encoding='utf-8'))
        self.threshold, self.max_length = config['threshold'], config['max_length']
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.segmenter = word_tokenize
        self.session = ort.InferenceSession(str(model_dir / 'retriever.onnx'), providers=['CPUExecutionProvider'])
        entries = [json.loads(line) for line in Path(entries_path).read_text(encoding='utf-8').splitlines() if line.strip()]
        self.ids = [e['id'] for e in entries]
        self.matrix = np.vstack([self.embed(e['text']) for e in entries])

    def embed(self, text):
        import numpy as np
        segmented = self.segmenter(' '.join(str(text).split()), format='text')
        encoded = self.tokenizer([segmented], truncation=True, max_length=self.max_length, return_tensors='np')
        return self.session.run(None, {'input_ids': encoded['input_ids'].astype(np.int64), 'attention_mask': encoded['attention_mask'].astype(np.int64)})[0][0]

    def answer(self, text, top=3):
        """{'hits': [{'id', 'score'}×top], 'threshold'} — FoodTrip answers outright at score ≥ threshold."""
        scores = self.matrix @ self.embed(text)
        order = scores.argsort()[::-1][:top]
        return {'hits': [{'id': self.ids[i], 'score': round(float(scores[i]), 4)} for i in order], 'threshold': self.threshold}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: assistant_infer.py <onnx dir> "<message>"')
    print(json.dumps(Assistant(sys.argv[1]).predict(sys.argv[2]), ensure_ascii=False, indent=2))
