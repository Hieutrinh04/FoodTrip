"""Step 9 of ml/training/CRITERIA.md — the NER model as a small HTTP service.

Not wired into the website. It exists so that, once a model meets the
criteria, detect-place can ask it for venue names before searching. It runs
apart from Supabase Edge (a 135M-parameter model does not belong there), with
the same preprocessing as training, and returns suggestions only: every
answer says `requires_confirmation: true`.

    POST /ner     {"text": "..."}  ->  {"entities": [...], "inference_seconds": ...}
    GET  /health  ->  {"ok": true, "model": "<bundle>", "loaded": false|true}

Requests need `Authorization: Bearer $NER_SERVICE_TOKEN`. Standard library
only, one request at a time, CPU, one thread.

    NER_SERVICE_TOKEN=... python ml/service/ner_service.py --bundle ml/models/<run> [--port 8765]
"""
import argparse
import hmac
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'training'))
from ner_preprocessing import LABELS, tokenize_caption, segmented_syllables, encode_words  # noqa: E402
from predict_ner import decode_logits, free_memory_mb  # noqa: E402

MAX_TEXT = 2000
MAX_BODY = 16_384
MIN_FREE_MB = 2048


class OnnxNer:
    """Loads the bundle on first use (after a RAM check) and tags one caption at a time."""

    def __init__(self, bundle):
        self.root = Path(bundle).resolve()
        self.metadata = json.loads((self.root / 'model/preprocessing.json').read_text(encoding='utf8'))
        if self.metadata.get('labels') != LABELS:
            raise SystemExit('Model and preprocessing label mappings differ')
        self.session = None

    def load(self):
        if self.session is not None:
            return
        available = free_memory_mb()
        if available < MIN_FREE_MB:
            raise MemoryError(f'{available:.0f} MB free; {MIN_FREE_MB} MB needed to load the model')
        import onnxruntime as ort
        from transformers import PhobertTokenizer
        from underthesea import word_tokenize
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.tokenizer = PhobertTokenizer.from_pretrained(str(self.root / 'model'), local_files_only=True)
        self.segmenter = word_tokenize
        self.session = ort.InferenceSession(str(self.root / 'onnx/model.onnx'), sess_options=options, providers=['CPUExecutionProvider'])

    def __call__(self, text):
        import numpy as np
        self.load()
        started = time.perf_counter()
        words, _, _ = segmented_syllables(tokenize_caption(text, self.metadata.get('caption_tokenizer', 1)), self.segmenter)
        encoded, first, included = encode_words(words, self.tokenizer, int(self.metadata['max_length']))
        logits = self.session.run(['logits'], {name: np.array([encoded[name]], dtype=np.int64) for name in ['input_ids', 'attention_mask']})[0]
        result = decode_logits(words, first, included, logits)
        return {'entities': result['entities'], 'truncated': result['truncated'], 'requires_confirmation': True,
                'production_ready': False, 'inference_seconds': round(time.perf_counter() - started, 3)}


def make_handler(predict, token, bundle_name):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status, body):
            data = json.dumps(body, ensure_ascii=False).encode('utf8')
            self.send_response(status)
            self.send_header('content-type', 'application/json; charset=utf-8')
            self.send_header('content-length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _authorised(self):
            given = self.headers.get('authorization', '')
            return bool(token) and hmac.compare_digest(given, f'Bearer {token}')

        def do_GET(self):
            if self.path != '/health':
                return self._send(404, {'error': 'not-found'})
            self._send(200, {'ok': True, 'model': bundle_name, 'loaded': getattr(predict, 'session', None) is not None})

        def do_POST(self):
            if self.path != '/ner':
                return self._send(404, {'error': 'not-found'})
            if not self._authorised():
                return self._send(401, {'error': 'unauthorised'})
            length = int(self.headers.get('content-length') or 0)
            if length <= 0 or length > MAX_BODY:
                return self._send(413, {'error': 'body-size'})
            try:
                text = json.loads(self.rfile.read(length).decode('utf8')).get('text', '')
            except (ValueError, AttributeError):
                return self._send(400, {'error': 'invalid-json'})
            if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
                return self._send(400, {'error': 'text-must-have-1-2000-characters'})
            try:
                return self._send(200, predict(text))
            except MemoryError as err:
                return self._send(503, {'error': 'not-enough-memory', 'detail': str(err)})

        def log_message(self, fmt, *args):  # captions are not logged
            sys.stderr.write(f'{self.address_string()} {self.command} {self.path} {args[1] if len(args) > 1 else ""}\n')

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    token = os.environ.get('NER_SERVICE_TOKEN', '')
    if len(token) < 24:
        raise SystemExit('Set NER_SERVICE_TOKEN (at least 24 characters) before starting the service')
    model = OnnxNer(args.bundle)
    server = HTTPServer((args.host, args.port), make_handler(model, token, Path(args.bundle).name))
    print(f'NER service on http://{args.host}:{args.port} (model loads on the first request)', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
