"""Compare existing ONNX and safetensors on Colab; never export or train again."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
from ner_preprocessing import LABELS, tokenize_caption, segmented_syllables, encode_words


def compare_outputs(expected, actual, prediction_mask):
    import numpy as np
    expected, actual = np.asarray(expected), np.asarray(actual)
    mask = np.asarray(prediction_mask, dtype=bool)
    if expected.shape != actual.shape or expected.ndim != 3 or expected.shape[:2] != mask.shape:
        raise ValueError('ONNX/PyTorch shapes do not align')
    if not np.isfinite(expected).all() or not np.isfinite(actual).all():
        raise ValueError('Non-finite logits')
    np.testing.assert_allclose(actual, expected, rtol=1e-3, atol=1e-3)
    agreement = np.array_equal(actual.argmax(axis=2)[mask], expected.argmax(axis=2)[mask])
    if not agreement:
        raise ValueError('First-syllable predicted labels differ despite close logits')
    return {'shape':list(actual.shape),'max_abs_error':float(np.abs(actual-expected).max()),
            'prediction_labels_agree':True}


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 ** 2), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--write-report', action='store_true', help='Write export-check.json only after every check passes; never overwrite it')
    args = parser.parse_args()
    root = Path(args.bundle).resolve()
    report_path = root / 'onnx/export-check.json'
    model_file, onnx_file = root / 'model/model.safetensors', root / 'onnx/model.onnx'
    if not model_file.is_file() or not onnx_file.is_file():
        raise SystemExit('Saved safetensors/ONNX missing; nothing trained or exported')
    if args.write_report and report_path.exists():
        raise SystemExit('Report already exists; nothing overwritten')
    metadata = json.loads((root / 'model/preprocessing.json').read_text(encoding='utf8'))
    if metadata.get('labels') != LABELS or metadata.get('tokenization') != 'syllable-preserving-segmented-BPE':
        raise SystemExit('Unexpected preprocessing metadata')
    if importlib.metadata.version('underthesea') != metadata.get('version'):
        raise SystemExit('Underthesea version differs from training')
    import numpy as np
    import torch
    import onnx
    import onnxruntime as ort
    from underthesea import word_tokenize
    from transformers import PhobertTokenizer, AutoModelForTokenClassification
    if not torch.cuda.is_available():
        raise SystemExit('Run on Colab T4; do not load both full models on the low-RAM local computer')
    print('STEP 1: checking existing ONNX graph', flush=True)
    onnx.checker.check_model(str(onnx_file))
    print('STEP 2: loading saved safetensors on GPU (no train)', flush=True)
    tokenizer = PhobertTokenizer.from_pretrained(str(root / 'model'), local_files_only=True)
    model = AutoModelForTokenClassification.from_pretrained(str(root / 'model'), local_files_only=True,
              trust_remote_code=False, use_safetensors=True, attn_implementation='eager').float().cuda().eval()
    if model.config.id2label != dict(enumerate(LABELS)):
        raise SystemExit('Saved model label order differs')
    print('STEP 3: loading existing ONNX on CPU', flush=True)
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    session = ort.InferenceSession(str(onnx_file), sess_options=options, providers=['CPUExecutionProvider'])
    if {item.name for item in session.get_inputs()} != {'input_ids','attention_mask'}:
        raise SystemExit('Unexpected ONNX inputs')
    texts = ['Đà Nẵng', 'The Orange Coffee ở Bình Dương.',
             'Hôm nay mình ở nhà đọc sách và không giới thiệu địa điểm nào.']
    examples = []
    for text in texts:
        words, _, _ = segmented_syllables(tokenize_caption(text, metadata.get('caption_tokenizer', 1)), word_tokenize)
        encoded, first, included = encode_words(words, tokenizer, metadata['max_length'])
        if included != len(words):
            raise SystemExit('Parity example unexpectedly truncated')
        examples.append((encoded, first))
    results = []
    for index, batch in enumerate([[example] for example in examples] + [examples[:2]]):
        length = max(len(example[0]['input_ids']) for example in batch)
        feeds = {name:np.array([example[name] + [tokenizer.pad_token_id if name == 'input_ids' else 0] *
                                (length-len(example[name])) for example, _ in batch],dtype=np.int64)
                 for name in ['input_ids','attention_mask']}
        mask = [first + [False] * (length-len(first)) for _, first in batch]
        with torch.inference_mode():
            expected = model(**{name:torch.from_numpy(array).cuda() for name,array in feeds.items()}).logits.float().cpu().numpy()
        actual = session.run(['logits'], feeds)[0]
        result = compare_outputs(expected, actual, mask)
        results.append(result)
        print('CASE',index+1,json.dumps(result),flush=True)
    report = {'passed':True,'method':'existing-safetensors-vs-existing-onnx',
              'rtol':1e-3,'atol':1e-3,'cases':results,'max_abs_error':max(item['max_abs_error'] for item in results),
              'sha256':{'model.safetensors':file_hash(model_file),'model.onnx':file_hash(onnx_file)},
              'packages':{name:importlib.metadata.version(name) for name in ['torch','transformers','onnx','onnxruntime','underthesea']},
              'quality_notice':'Numerical parity checks, not proof of NER quality or production readiness.'}
    if args.write_report:
        with report_path.open('x',encoding='utf8') as handle:
            json.dump(report,handle,ensure_ascii=False,indent=2,allow_nan=False)
    print('ONNX_CHECK_PASSED',json.dumps(report,ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
