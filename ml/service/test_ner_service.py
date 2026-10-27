"""The service's HTTP contract, with a stand-in model (no ONNX or RAM needed)."""
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer

from ner_service import make_handler

TOKEN = 'test-token-0123456789abcdef'


def fake_predict(text):
    if text == 'oom':
        raise MemoryError('500 MB free')
    return {'entities': [{'label': 'BUSINESS', 'text': 'Phở Thìn'}], 'requires_confirmation': True, 'inference_seconds': 0.01}


class ServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), make_handler(fake_predict, TOKEN, 'test-bundle'))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def call(self, path, body=None, token=TOKEN):
        data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        req = urllib.request.Request(self.base + path, data=data, method='POST' if data is not None else 'GET')
        if token:
            req.add_header('authorization', f'Bearer {token}')
        try:
            with urllib.request.urlopen(req) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read())

    def test_health_needs_no_token(self):
        self.assertEqual(self.call('/health', token=None), (200, {'ok': True, 'model': 'test-bundle', 'loaded': False}))

    def test_tags_a_caption(self):
        status, body = self.call('/ner', {'text': 'Ăn Phở Thìn ở Hà Nội'})
        self.assertEqual(status, 200)
        self.assertTrue(body['requires_confirmation'])
        self.assertEqual(body['entities'][0]['text'], 'Phở Thìn')

    def test_refuses_without_the_token(self):
        self.assertEqual(self.call('/ner', {'text': 'x'}, token=None)[0], 401)
        self.assertEqual(self.call('/ner', {'text': 'x'}, token='wrong-token-0123456789abcd')[0], 401)

    def test_rejects_bad_input(self):
        self.assertEqual(self.call('/ner', {'text': ''})[0], 400)
        self.assertEqual(self.call('/ner', {'text': 'a' * 2001})[0], 400)
        self.assertEqual(self.call('/ner', b'not json')[0], 400)
        self.assertEqual(self.call('/nope', {'text': 'x'})[0], 404)

    def test_low_memory_is_a_503_not_a_crash(self):
        self.assertEqual(self.call('/ner', {'text': 'oom'})[0], 503)


if __name__ == '__main__':
    unittest.main()
