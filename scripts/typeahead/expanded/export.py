"""Export prefill and incremental graphs, then qualify against the native model."""
import argparse
from collections import defaultdict
import hashlib
import json
import logging
import math
from pathlib import Path
import shutil
import time

import numpy as np
import torch

from corpus import file_hash, records
from neural import Config, Decoder
from train import Stream
from subwords import verify_prepared


class Prefill(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids):
        logits, cache = self.model.next(input_ids, graph=True)
        return (logits, *(tensor for layer in cache for tensor in layer))


class Incremental(Prefill):
    def forward(self, input_ids, *past):
        cache = tuple(zip(past[::2], past[1::2]))
        logits, cache = self.model.next(input_ids, cache, graph=True)
        return (logits, *(tensor for layer in cache for tensor in layer))


def names(prefix, layers):
    return [f'{prefix}_{kind}_{index}' for index in range(layers) for kind in ('key', 'value')]


def export_float(model, out):
    cfg = model.cfg
    inp = ['input_ids']
    past = names('past', cfg.layers)
    present = names('present', cfg.layers)
    outputs = ['logits', *present]
    example = torch.tensor([[5, 6, 7, 8]], dtype=torch.int64)
    with torch.no_grad():
        _, cache = model.next(example)
    torch.onnx.export(Prefill(model), (example,), out / 'prefill.onnx',
                      input_names=inp, output_names=outputs, opset_version=17, dynamo=False,
                      dynamic_axes={'input_ids': {1: 'input_length'},
                                    **{name: {2: 'input_length'} for name in present}})
    torch.onnx.export(Incremental(model), (example[:, -1:], *(x for layer in cache for x in layer)),
                      out / 'incremental.onnx', input_names=inp + past, output_names=outputs,
                      opset_version=17, dynamo=False,
                      dynamic_axes={**{name: {2: 'past_length'} for name in past},
                                    **{name: {2: 'present_length'} for name in present}})
    return [out / 'prefill.onnx', out / 'incremental.onnx']


def quantize(paths, out, precision):
    if precision == 'int8':
        from onnxruntime.quantization import QuantType, quantize_dynamic
        for path in paths:
            quantize_dynamic(str(path), str(out / path.name), per_channel=True,
                             weight_type=QuantType.QInt8, op_types_to_quantize=['MatMul', 'Gather'],
                             extra_options={'MatMulConstBOnly': True})
            share_int8_embeddings(out / path.name)
    elif precision == 'int8-weight-only':
        for path in paths:
            quantize_weight_only(path, out / path.name)
    elif precision == 'int4':
        import onnx
        logging.getLogger('onnxruntime.quantization.matmul_nbits_quantizer').setLevel(logging.WARNING)
        try:
            from onnxruntime.quantization.matmul_nbits_quantizer import (
                DefaultWeightOnlyQuantConfig,
                MatMulNBitsQuantizer,
            )
        except ImportError:
            from onnxruntime.quantization.matmul_4bits_quantizer import (
                DefaultWeightOnlyQuantConfig,
                MatMul4BitsQuantizer as MatMulNBitsQuantizer,
            )
        from onnxruntime.quantization.quant_utils import QuantFormat
        config = DefaultWeightOnlyQuantConfig(block_size=64, is_symmetric=True,
                                               quant_format=QuantFormat.QOperator, bits=4,
                                               op_types_to_quantize=('MatMul', 'Gather'), quant_axes=(('MatMul', 0), ('Gather', 1)))
        for path in paths:
            model = MatMulNBitsQuantizer(onnx.load(path), algo_config=config)
            model.process()
            model.model.save_model_to_file(str(out / path.name), False)
            share_int4_embeddings(out / path.name)
    else:
        raise ValueError(f'Unsupported quantization: {precision}')


def share_int8_embeddings(path):
    # ORT's quantizer otherwise serializes the input embedding and tied output
    # projection twice, in different layouts. Gather columns from the output
    # matrix and apply the exact same per-token scale used by the output head.
    import onnx
    from onnx import helper, numpy_helper, TensorProto
    model = onnx.load(path)
    graph = model.graph
    tensors = {tensor.name: tensor for tensor in graph.initializer}
    gather = next((node for node in graph.node if node.op_type == 'Gather' and
                   list(node.input) == ['model.tok.weight_quantized', 'input_ids']), None)
    projection = next((node for node in graph.node if node.op_type == 'MatMulInteger' and
                       list(node.output) == ['logits_output_quantized']), None)
    if gather is None or projection is None:
        raise ValueError('Cannot verify quantized tied embedding and output projection')
    dequantize = next(node for node in graph.node if node.op_type == 'DequantizeLinear' and
                      node.input[0] == gather.output[0])
    weight, zero = projection.input[1], projection.input[3]
    scale = weight.removesuffix('_quantized') + '_scale'
    if np.any(numpy_helper.to_array(tensors[zero])):
        raise ValueError('Tied embedding expects symmetric output quantization')
    nodes = [
        helper.make_node('Gather', [weight, 'input_ids'], ['tied_embed_gather'], axis=1),
        helper.make_node('Transpose', ['tied_embed_gather'], ['tied_embed_transposed'], perm=[1, 2, 0]),
        helper.make_node('Cast', ['tied_embed_transposed'], ['tied_embed_float'], to=TensorProto.FLOAT),
        helper.make_node('Gather', [scale, 'input_ids'], ['tied_embed_scale_gather'], axis=0),
        helper.make_node('Unsqueeze', ['tied_embed_scale_gather', 'tied_embed_axis'], ['tied_embed_scale']),
        helper.make_node('Mul', ['tied_embed_float', 'tied_embed_scale'], [dequantize.output[0]]),
    ]
    graph.initializer.append(numpy_helper.from_array(np.asarray([2], dtype='int64'), 'tied_embed_axis'))
    remaining = []
    for node in graph.node:
        if node == gather:
            remaining.extend(nodes)
        elif node != dequantize:
            remaining.append(node)
    used = {name for node in remaining for name in node.input}
    initializers = [tensor for tensor in graph.initializer if tensor.name in used]
    del graph.node[:]
    graph.node.extend(remaining)
    del graph.initializer[:]
    graph.initializer.extend(initializers)
    onnx.checker.check_model(model)
    onnx.save(model, path)


def share_int4_embeddings(path):
    # MatMulNBits stores unsigned nibbles centered at 8. GatherBlockQuantized
    # supports that same representation when given an explicit zero point.
    # Retain its logical [vocab,width] view of the output matrix bytes.
    import onnx
    from onnx import TensorProto, helper
    model = onnx.load(path)
    graph = model.graph
    tensors = {tensor.name: tensor for tensor in graph.initializer}
    gather = next(node for node in graph.node if node.op_type == 'GatherBlockQuantized' and node.input[1] == 'input_ids')
    projection = next(node for node in graph.node if node.op_type == 'MatMulNBits' and 'logits' in node.output)
    embed = tensors[gather.input[0]]
    old_scales, new_scales = tensors[gather.input[2]], tensors[projection.input[2]]
    new_weight = tensors[projection.input[1]]
    signed_as_unsigned = bytes(value ^ 0x88 for value in embed.raw_data)
    if len(gather.input) != 3 or len(projection.input) != 3 or signed_as_unsigned != new_weight.raw_data:
        raise ValueError('Int4 embedding and output must share equivalent symmetric block weights')
    if old_scales.raw_data != new_scales.raw_data or list(old_scales.dims) != list(new_scales.dims):
        raise ValueError('Int4 embedding and output block scales differ')
    embed.data_type = TensorProto.UINT4
    embed.raw_data = new_weight.raw_data
    gather.input[2] = new_scales.name
    zeros = helper.make_tensor('tied_embed_uint4_zero_points', TensorProto.UINT4, new_scales.dims,
                               bytes([0x88]) * ((math.prod(new_scales.dims) + 1) // 2), raw=True)
    graph.initializer.append(zeros)
    gather.input.append(zeros.name)
    used = {name for node in graph.node for name in node.input}
    keep = [tensor for tensor in graph.initializer if tensor.name in used]
    del graph.initializer[:]
    graph.initializer.extend(keep)
    onnx.checker.check_model(model)
    onnx.save(model, path)


def quantize_weight_only(source, target):
    """Use the tied sampled int8 embedding for both lookup and projection."""
    import onnx
    from onnx import helper, numpy_helper, TensorProto

    model = onnx.load(source)
    graph = model.graph
    tensors = {tensor.name: tensor for tensor in graph.initializer}
    head = next(node for node in graph.node if node.op_type == 'MatMul' and 'logits' in node.output)
    head_weight = head.input[1]
    new_nodes = []
    tensor_map = {}

    def pack(name, *, per_channel=True):
        if name in tensor_map:
            return tensor_map[name]
        weights = numpy_helper.to_array(tensors[name])
        maximum = np.max(np.abs(weights), axis=0) if per_channel else np.max(np.abs(weights))
        scale = np.maximum(maximum / 127, np.finfo('float32').tiny).astype('float32')
        values = np.clip(np.rint(weights / scale), -127, 127).astype('int8')
        encoded, scales = name + '_int8', name + '_scales'
        graph.initializer.extend((numpy_helper.from_array(values, encoded), numpy_helper.from_array(scale, scales)))
        tensor_map[name] = (encoded, scales)
        return encoded, scales

    packed_head = pack(head_weight)
    for node in graph.node:
        if node.op_type == 'Gather' and node.input[0] == 'model.tok.weight':
            q, scale = packed_head
            graph.initializer.append(numpy_helper.from_array(np.asarray([2], dtype='int64'), 'tied_embed_axis'))
            new_nodes.extend((
                helper.make_node('Gather', [q, 'input_ids'], ['tied_embed_gather'], axis=1),
                helper.make_node('Transpose', ['tied_embed_gather'], ['tied_embed_transposed'], perm=[1, 2, 0]),
                helper.make_node('Cast', ['tied_embed_transposed'], ['tied_embed_float'], to=TensorProto.FLOAT),
                helper.make_node('Gather', [scale, 'input_ids'], ['tied_embed_scale_gather'], axis=0),
                helper.make_node('Unsqueeze', ['tied_embed_scale_gather', 'tied_embed_axis'], ['tied_embed_scale']),
                helper.make_node('Mul', ['tied_embed_float', 'tied_embed_scale'], [node.output[0]]),
            ))
            continue
        weight_index = (1 if node.op_type == 'MatMul' else 0 if node.op_type == 'Gather' and
                        node.input[0] == 'model.pos.weight' else None)
        if weight_index is not None and node.input[weight_index] in tensors:
            original = node.input[weight_index]
            q, scale = pack(original, per_channel=weight_index == 1)
            dequantized = original + '_decoded'
            new_nodes.append(helper.make_node('DequantizeLinear', [q, scale], [dequantized],
                                              **({'axis': 1} if weight_index == 1 else {})))
            node.input[weight_index] = dequantized
        new_nodes.append(node)
    used_names = {name for node in new_nodes for name in node.input}
    kept = [tensor for tensor in graph.initializer if tensor.name in used_names]
    del graph.node[:]
    graph.node.extend(new_nodes)
    del graph.initializer[:]
    graph.initializer.extend(kept)
    onnx.checker.check_model(model)
    onnx.save(model, target)


def consolidate(out):
    """Store identical graph initializers once, and inspect embedding/output storage."""
    import onnx
    from onnx import external_data_helper, numpy_helper
    seen = {}
    graphs = {}
    path = out / 'weights.bin'
    with path.open('wb') as weights:
        for file in (out / 'prefill.onnx', out / 'incremental.onnx'):
            model = onnx.load(file)
            types = defaultdict(int)
            operators = defaultdict(int)
            for node in model.graph.node:
                operators[node.op_type] += 1
            for tensor in model.graph.initializer:
                if not tensor.raw_data:
                    data = numpy_helper.from_array(numpy_helper.to_array(tensor), name=tensor.name)
                    tensor.CopyFrom(data)
                raw = tensor.raw_data
                types[onnx.TensorProto.DataType.Name(tensor.data_type)] += len(raw)
                if len(raw) < 1024:
                    continue
                digest = hashlib.sha256(raw).digest()
                offset = seen.get(digest)
                if offset is None:
                    alignment = -weights.tell() % 64
                    weights.write(b'\0' * alignment)
                    offset = weights.tell()
                    weights.write(raw)
                    seen[digest] = offset
                external_data_helper.set_external_data(tensor, path.name, offset=offset, length=len(raw))
                tensor.ClearField('raw_data')
            file.write_bytes(model.SerializeToString())
            onnx.checker.check_model(str(file))
            graphs[file.name] = {'initializerBytesByType': dict(types), 'operators': dict(operators)}
    return graphs


def context_cases(data, context, minimum, split='test'):
    stream = Stream(data, split, context)
    lengths = sorted(set((1, 2, 48, context // 2, context)))
    limit = minimum * 2
    # A hashed document order is already frozen in the source manifest.
    doc_ids = np.arange(len(stream.docs))
    np.random.default_rng(86173).shuffle(doc_ids)
    seen = set()
    cases = []
    for target_size in lengths:
        quota = math.ceil(minimum / len(lengths))
        if target_size <= 2:
            # One-token inputs need not always be sentence starts.
            skip_bos = 1
        else:
            skip_bos = 0
        found = 0
        for doc_id in doc_ids:
            start, length = map(int, stream.docs[doc_id, :2])
            if length < target_size + skip_bos + 1:
                continue
            available = length - target_size - skip_bos
            offset = skip_bos + int(doc_id) % available
            ids = tuple(map(int, stream.stream[start + offset:start + offset + target_size]))
            if ids in seen:
                continue
            target = int(stream.stream[start + offset + target_size])
            seen.add(ids)
            cases.append({'ids': ids, 'target': target, 'documentIndex': int(doc_id), 'start': offset, 'layout': 'prose'})
            found += 1
            if found >= quota or len(cases) >= limit:
                break
    if len(cases) < minimum:
        raise ValueError(f'Need {minimum} unique contexts, found {len(cases)}')
    return cases


def role_cases(data, context, minimum, split):
    stream = Stream(data, f'adapt-{context}-{split}', context)
    ordered = np.arange(len(stream.docs))
    np.random.default_rng(65731).shuffle(ordered)
    candidates = list(records(data / f'adapt-{context}-{split}.partial.jsonl'))
    target_partial = max(50, minimum // 3)
    if len(candidates) < target_partial:
        raise ValueError(f'Need {target_partial} partial-word retokenization contexts, found {len(candidates)}')
    results = candidates[:target_partial]
    for case in results:
        case['ids'] = tuple(case['ids'])
    seen = {case['ids'] for case in results}
    using_whole_words = 0
    for case in results[:]:
        base, pieces = case.pop('wholeWordBase'), case.pop('wholeWordPieces')
        next_id = case.pop('wholeWordNextToken')
        ids = tuple(base + pieces)
        if not pieces or len(ids) > context or ids in seen:
            continue
        seen.add(ids)
        results.append({'ids': ids, 'target': next_id, 'documentId': case['documentId'], 'layout': 'roles',
                        'candidateTokens': len(pieces), 'sharedWholeWordPrefix': len(base)})
        using_whole_words += 1
    if using_whole_words < target_partial // 2:
        raise ValueError('Too few distinct whole-word candidate paths')
    for fraction in (0., .5, .9):
        stop = len(results) + math.ceil(max(0, minimum - target_partial - using_whole_words) / 3)
        for doc_index in ordered:
            start, length, first_gold = map(int, stream.docs[doc_index])
            partial = first_gold + round(fraction * (length - first_gold - 1))
            for candidate in (partial, first_gold):
                ids = tuple(map(int, stream.stream[start:start + candidate]))
                if ids in seen or len(ids) > context:
                    continue
                seen.add(ids)
                results.append({'ids': ids, 'target': int(stream.stream[start + candidate]),
                                'documentIndex': int(doc_index), 'start': 0, 'layout': 'roles'})
                break
            if len(results) >= stop:
                break
    if len(results) < minimum:
        raise ValueError(f'Need {minimum} distinct role prompts, found {len(results)}')
    return results


def session(path):
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    return ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])


def probabilities(logits):
    logits = logits.astype('float64')
    logits -= np.max(logits)
    probs = np.exp(logits)
    return probs / probs.sum()


def top_three(logits):
    return np.argsort(-logits, kind='stable')[:3]


def run_retokenized(prefill, step, names, previous, ids, stable):
    # The cached draft suffix may have used a different BPE segmentation. Carry
    # only the unchanged IDs forward and decode every replacement ID in order.
    old = prefill.run(None, {'input_ids': np.asarray([previous], dtype='int64')})[1:]
    state = [part[:, :, :stable, :].copy() for part in old]
    for index in range(stable, ids.shape[1]):
        logits, *state = step.run(None, {'input_ids': ids[:, index:index + 1],
                                         **dict(zip(names, state))})
    return logits[0]


def qualify(model, float_paths, packed, cases):
    full, float_step = [session(path) for path in float_paths]
    quant, quant_step = [session(packed / name) for name in ('prefill.onnx', 'incremental.onnx')]
    layers = model.cfg.layers
    past_names = names('past', layers)
    metrics = defaultdict(float)
    by_length = defaultdict(int)
    layouts = defaultdict(lambda: defaultdict(int))
    step_times, prefill_times = [], []
    # Check cold prefill once before collecting warm timing data.
    cold = time.perf_counter()
    first_ids = np.array([cases[0]['ids']], dtype='int64')
    quant.run(None, {'input_ids': first_ids})
    cold_ms = (time.perf_counter() - cold) * 1000
    with torch.no_grad():
        for index, case in enumerate(cases):
            ids = np.array([case['ids']], dtype='int64')
            target = case['target']
            length = ids.shape[1]
            by_length[length] += 1
            track = layouts[case.get('layout', 'prose')]
            track['contexts'] += 1
            if 'previousIds' in case:
                previous = case['previousIds']
                stable = case['stablePrefix']
                if previous[:stable] != ids[0, :stable].tolist() or previous[stable] == ids[0, stable]:
                    raise ValueError('Stored retokenization prefix is inconsistent')
                track['partialRetokenizationCases'] += 1
            native_tensor, _ = model.next(torch.from_numpy(ids))
            native = native_tensor.numpy()[0]
            float_logits = full.run(['logits'], {'input_ids': ids})[0][0]
            now = time.perf_counter()
            quant_logits = quant.run(['logits'], {'input_ids': ids})[0][0]
            prefill_times.append((time.perf_counter() - now) * 1000)
            if length > 1:
                prior = ids[:, :-1]
                new = ids[:, -1:]
                native_prior = model.next(torch.from_numpy(prior))[1]
                native_cached = model.next(torch.from_numpy(new), native_prior)[0].numpy()[0]
                float_prior = full.run(None, {'input_ids': prior})[1:]
                quant_prior = quant.run(None, {'input_ids': prior})[1:]
                full_cached = float_step.run(['logits'], {'input_ids': new, **dict(zip(past_names, float_prior))})[0][0]
                now = time.perf_counter()
                quant_cached = quant_step.run(['logits'], {'input_ids': new, **dict(zip(past_names, quant_prior))})[0][0]
                step_times.append((time.perf_counter() - now) * 1000)
                metrics['nativeCachedMaxLogitError'] = max(metrics['nativeCachedMaxLogitError'],
                                                          float(np.max(np.abs(native_cached - native))))
                metrics['floatCachedMaxLogitError'] = max(metrics['floatCachedMaxLogitError'],
                                                         float(np.max(np.abs(full_cached - native))))
                cached_match = set(top_three(quant_cached)) == set(top_three(native))
                metrics['quantCachedTopThreeSetMatches'] += cached_match
                metrics['quantCachedCases'] += 1
                track['cachedMatches'] += cached_match
                track['cachedContexts'] += 1
            if 'previousIds' in case:
                retokenized = run_retokenized(full, float_step, past_names, previous, ids, stable)
                error = float(np.max(np.abs(retokenized - native)))
                metrics['floatRetokenizedMaxLogitError'] = max(metrics['floatRetokenizedMaxLogitError'], error)
                quant_retokenized = run_retokenized(quant, quant_step, past_names, previous, ids, stable)
                track['partialMatches'] += set(top_three(quant_retokenized)) == set(top_three(native))
            if 'sharedWholeWordPrefix' in case:
                base = case['sharedWholeWordPrefix']
                prefix = ids[0, :base].tolist()
                path = run_retokenized(quant, quant_step, past_names, prefix, ids, base)
                track['wholeWordCases'] += 1
                track['wholeWordMatches'] += set(top_three(path)) == set(top_three(native))
            p_native, p_float, p_quant = map(probabilities, (native, float_logits, quant_logits))
            t_native, t_float, t_quant = map(top_three, (native, float_logits, quant_logits))
            metrics['floatMaxLogitError'] = max(metrics['floatMaxLogitError'], float(np.max(np.abs(native - float_logits))))
            metrics['floatTopThreeSetMatches'] += set(t_native) == set(t_float)
            quant_match = set(t_native) == set(t_quant)
            metrics['quantTopThreeSetMatches'] += quant_match
            track['matches'] += quant_match
            metrics['quantTopOneMatches'] += t_native[0] == t_quant[0]
            metrics['quantMeanTotalVariation'] += float(np.abs(p_native - p_quant).sum()) / 2
            for label, probability in (('native', p_native), ('float', p_float), ('quant', p_quant)):
                metrics[label + 'Nll'] -= math.log(max(float(probability[target]), 1e-300))
            if (index + 1) % 25 == 0:
                print('EXPORT CASES', index + 1, '/', len(cases), flush=True)
    count = len(cases)
    report = {**metrics, 'contexts': count, 'contextLengths': dict(by_length), 'coldPrefillMs': cold_ms,
              'warmPrefillP95Ms': float(np.percentile(prefill_times, 95)),
              'layouts': {name: dict(values) for name, values in layouts.items()},
              'incrementalP95Ms': float(np.percentile(step_times, 95)) if step_times else None}
    for label in ('native', 'float', 'quant'):
        report[label + 'Perplexity'] = math.exp(metrics[label + 'Nll'] / count)
    report['quantMeanTotalVariation'] /= count
    report['quantTopThreeSetAgreement'] = metrics['quantTopThreeSetMatches'] / count
    report['quantCachedTopThreeSetAgreement'] = metrics['quantCachedTopThreeSetMatches'] / metrics['quantCachedCases']
    return report


def run(args):
    model_state = torch.load(args.checkpoint, map_location='cpu', weights_only=False)
    settings = model_state['settings']
    cfg = Config(**settings['config'])
    adapted = settings.get('adapt', False)
    role_split = f'adapt-{cfg.context}-{args.split}'
    streams = [args.split, role_split] if adapted else [args.split]
    role_case_files = [role_split + '.partial.jsonl'] if adapted else []
    data_hash, tokenizer_hash = verify_prepared(args.data, streams, role_case_files)
    expected_tokenizer = settings.get('tokenizerSha256')
    if (expected_tokenizer is not None and expected_tokenizer != tokenizer_hash or
            expected_tokenizer is None and settings.get('dataSha256') != data_hash):
        raise ValueError('Export tokenizer or legacy prepared data does not match the checkpoint')
    model = Decoder(cfg).eval()
    model.load_state_dict(model_state['model'])
    torch.set_num_threads(args.threads)
    args.out.mkdir(parents=True, exist_ok=False)
    float_dir = args.out / 'float'
    float_dir.mkdir()
    packed = args.out / 'candidate'
    packed.mkdir()
    float_paths = export_float(model, float_dir)
    quantize(float_paths, packed, args.precision)
    graph_report = consolidate(packed)
    shutil.copyfile(args.data / 'tokenizer.json', packed / 'tokenizer.json')
    cases = context_cases(args.data, cfg.context, args.contexts // 2 if adapted else args.contexts, args.split)
    if adapted:
        cases.extend(role_cases(args.data, cfg.context, args.contexts - args.contexts // 2, args.split))
    if len({case['ids'] for case in cases}) != len(cases):
        raise ValueError('Frozen exporter contexts must be distinct across layouts')
    context_file = args.out / 'cases.json'
    context_file.write_text(json.dumps(cases, separators=(',', ':')) + '\n')
    metrics = qualify(model, float_paths, packed, cases)
    assets = {path.name: {'bytes': path.stat().st_size, 'sha256': file_hash(path)}
              for path in sorted(packed.iterdir())}
    filenames = {'tokenizer': 'tokenizer.json', 'prefill': 'prefill.onnx',
                 'incremental': 'incremental.onnx', 'weights': 'weights.bin'}
    files = {name: {'path': filename, **assets[filename]} for name, filename in filenames.items()}
    manifest = {'version': 2, 'kind': 'neural', 'precision': args.precision.split('-')[0],
                'quantization': args.precision, 'vocabSize': cfg.vocab, 'context': cfg.context,
                'layers': cfg.layers, 'heads': cfg.heads, 'headDim': cfg.width // cfg.heads, 'files': files,
                'qualification': {'parity': True, 'replay': False, 'wasm': False, 'webgpu': False}}
    serialized_manifest = (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode('utf8')
    bytes_total = sum(value['bytes'] for value in assets.values())
    download_bytes = bytes_total + len(serialized_manifest)
    passed = (metrics['floatMaxLogitError'] <= .001 and metrics['nativeCachedMaxLogitError'] <= .001
              and metrics['floatCachedMaxLogitError'] <= .001
              and metrics['quantTopThreeSetAgreement'] >= .95
              and metrics['quantCachedTopThreeSetAgreement'] >= .95 and download_bytes <= args.max_bytes
              and metrics.get('floatRetokenizedMaxLogitError', 0.) <= .001
              and all(track['matches'] / track['contexts'] >= .95 and
                      track.get('cachedMatches', 0) / track['cachedContexts'] >= .95
                      and (not track.get('partialRetokenizationCases') or
                           track.get('partialMatches', 0) / track['partialRetokenizationCases'] >= .95)
                      and (not track.get('wholeWordCases') or
                           track.get('wholeWordMatches', 0) / track['wholeWordCases'] >= .95)
                      for track in metrics['layouts'].values()))
    report = {'version': 1, 'checkpointSha256': file_hash(args.checkpoint), 'casesSha256': file_hash(context_file),
              'dataSha256': data_hash, 'precision': args.precision, 'contextSplit': args.split,
              'nativeDevice': 'CPU', 'onnxProvider': 'CPUExecutionProvider', 'graph': graph_report,
              'graphBytes': bytes_total, 'downloadBytes': download_bytes, 'exportParityPassed': passed, **metrics}
    (args.out / 'metrics.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    print('EXPORT METRICS', json.dumps(report, sort_keys=True), flush=True)
    if not passed:
        raise SystemExit('Export parity or size gate failed')
    if args.split != 'test':
        return
    (packed / 'manifest.json').write_bytes(serialized_manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--precision', choices=('int8', 'int8-weight-only', 'int4'), required=True)
    parser.add_argument('--max-bytes', type=int, required=True)
    parser.add_argument('--split', choices=('validation', 'calibration', 'test'), default='test')
    parser.add_argument('--contexts', type=int, default=300)
    parser.add_argument('--threads', type=int, default=4)
    args = parser.parse_args()
    if args.contexts < 300:
        parser.error('Qualification requires at least 300 distinct contexts')
    run(args)


if __name__ == '__main__':
    main()
