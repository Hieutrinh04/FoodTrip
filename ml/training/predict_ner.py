"""Offline, experimental ONNX caption test. No web API, GPU or database writes."""
import argparse
import ctypes
import importlib.metadata
import json
import sys
import time
from pathlib import Path
from ner_preprocessing import LABELS, tokenize_caption, segmented_syllables, encode_words, entity_spans


def free_memory_mb():
    if sys.platform == 'win32':
        class MemoryStatus(ctypes.Structure):
            _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
                (name, ctypes.c_ulonglong) for name in
                ['total_phys', 'avail_phys', 'total_page', 'avail_page', 'total_virtual', 'avail_virtual', 'extended']]
        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            raise RuntimeError('Cannot check free RAM')
        return status.avail_phys / 1024 ** 2
    info = Path('/proc/meminfo')
    if info.exists():
        for line in info.read_text().splitlines():
            if line.startswith('MemAvailable:'):
                return int(line.split()[1]) / 1024
    raise RuntimeError('Cannot check available RAM; do not load a large model blindly')


def decode_logits(words, first, included, logits):
    import numpy as np
    array = np.asarray(logits)
    if array.shape != (1, len(first), len(LABELS)) or not np.isfinite(array).all():
        raise ValueError('Invalid logits shape or non-finite output')
    if sum(first) != included:
        raise ValueError('First-subtoken mask does not align with included syllables')
    tags = [LABELS[int(label)] for label, keep in zip(array.argmax(axis=2)[0], first) if keep]
    entities = entity_spans(words[:included], tags)
    return {'entities':entities, 'syllables':words[:included], 'tags':tags,
            'truncated':included < len(words), 'requires_confirmation':True,
            'production_ready':False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--text')
    # Batch mode (benchmarks): JSON lines with "id" and "text"; the model is loaded once.
    source.add_argument('--file')
    parser.add_argument('--out', help='with --file: where to write one JSON result per line')
    args = parser.parse_args()
    if args.file:
        items = [json.loads(line) for line in Path(args.file).read_text(encoding='utf8').splitlines() if line.strip()]
    else:
        items = [{'id': 'text', 'text': args.text}]
    for item in items:
        if not str(item.get('text', '')).strip() or len(item['text']) > 2000:
            raise SystemExit(f"Caption {item.get('id')} must have 1–2000 characters")
    root = Path(args.bundle).resolve()
    metadata = json.loads((root / 'model/preprocessing.json').read_text(encoding='utf8'))
    config = json.loads((root / 'model/config.json').read_text(encoding='utf8'))
    if metadata.get('labels') != LABELS or config.get('id2label') != {str(i):label for i,label in enumerate(LABELS)}:
        raise SystemExit('Model and preprocessing label mappings differ')
    if metadata.get('tokenization') != 'syllable-preserving-segmented-BPE' or metadata.get('normalization') != 'NFC':
        raise SystemExit('Unsupported preprocessing')
    if metadata.get('version') != importlib.metadata.version('underthesea'):
        raise SystemExit('Underthesea version differs from training')
    available = free_memory_mb()
    if available < 2048:
        raise SystemExit(f'RAM guard: {available:.0f} MB available; at least 2048 MB required. Close unused apps, then retry. Model was not loaded.')
    import numpy as np
    import onnxruntime as ort
    from underthesea import word_tokenize
    from transformers import PhobertTokenizer
    tokenizer = PhobertTokenizer.from_pretrained(str(root / 'model'), local_files_only=True)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    started = time.perf_counter()
    session = ort.InferenceSession(str(root / 'onnx/model.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    if {item.name for item in session.get_inputs()} != {'input_ids','attention_mask'}:
        raise SystemExit('Unexpected ONNX inputs')
    loaded = time.perf_counter()
    results = []
    for item in items:
        began = time.perf_counter()
        words, _, fallback = segmented_syllables(tokenize_caption(item['text'], metadata.get('caption_tokenizer', 1)), word_tokenize)
        encoded, first, included = encode_words(words, tokenizer, int(metadata['max_length']))
        logits = session.run(['logits'], {name:np.array([encoded[name]],dtype=np.int64) for name in ['input_ids','attention_mask']})[0]
        result = decode_logits(words, first, included, logits)
        result.update({'id':item.get('id'),'text':item['text'],'raw_segmenter_fallback':fallback,
                       'load_seconds':round(loaded-started,3),'inference_seconds':round(time.perf_counter()-began,3),
                       'onnx_parity_report_present':(root / 'onnx/export-check.json').is_file()})
        results.append(result)
    if args.out:
        Path(args.out).write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in results), encoding='utf8')
        times = sorted(r['inference_seconds'] for r in results)
        print(json.dumps({'captions':len(results),'out':args.out,'median_seconds':times[len(times)//2],'max_seconds':times[-1]}, ensure_ascii=False))
    else:
        for result in results:
            print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
