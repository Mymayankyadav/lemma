"""Exact small cases for corpus isolation, packed probabilities and neural cache behavior."""
from itertools import product
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest

import numpy as np

from corpus import build, file_hash, fingerprint, group_identity, records
from fit import mixture, PRIOR, threshold
from ngram import SPECIAL, accumulate, compile_model, encode, entropy_cost, high_priority, key
from replay_metrics import paired
from score_assets import model_file
from subwords import Encoder, prompt_ids


class PipelineTests(unittest.TestCase):
    def test_groups_and_replay_exclusions_are_connected(self):
        common = ('Let a compact subset of a Hausdorff topological space be closed. Define disjoint '
                  'neighborhoods and choose a finite subcover around this fixed perimeter.')
        near = common.replace('perimeter', 'point')
        other = 'A set is open in this topology whenever it is a union of basic elements.'
        docs = [
            [{'url': 'https://math.stackexchange.com/questions/111/example', 'text': common}],
            [{'url': 'https://example.org/copy', 'text': near},
             {'url': 'https://math.stackexchange.com/questions/222/example', 'text': other},
             {'url': 'https://math.stackexchange.com/q/111#answer', 'text': common}],
        ]
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source_specs = []
            for i, items in enumerate(docs):
                source = root / f'records{i}.jsonl'
                source.write_text(''.join(json.dumps(item) + '\n' for item in items))
                source_specs.append({'id': f'fixture{i}', 'revision': 'fixture', 'register': 'proof',
                                     'license': 'fixture', 'url': 'https://example.net',
                                     'shards': [{'path': source.name, 'sha256': file_hash(source)}]})
            spec = root / 'sources.json'
            spec.write_text(json.dumps(source_specs))
            result = build(spec, root / 'out', 1000, 2, exclusions={fingerprint(near)})
            retained = [doc for shard in result['shards'] for doc in records(root / 'out' / shard['file'])]
            self.assertEqual(result['ingest']['exactDuplicates'], 1)
            self.assertEqual(result['ingest']['nearDuplicateGrouped'], 1)
            self.assertEqual([doc['text'] for doc in retained], [other])
        self.assertEqual(group_identity('https://arxiv.org/pdf/1101.2345v2.pdf'),
                         group_identity('https://arxiv.org/abs/1101.2345v1'))
        self.assertEqual(group_identity('arXiv:1101.2345v7'), group_identity('https://arxiv.org/abs/1101.2345'))

    def test_quantized_rows_preserve_full_support(self):
        vocab = [*SPECIAL, 'a', 'in', 'set', 'open', 'space']
        lookup = {word: i for i, word in enumerate(vocab)}
        source = [['a', 'set', 'in', 'a', 'space'], ['open', 'set', 'in', 'open', 'space'],
                  ['this', 'unknown', 'set', 'in', 'a']]
        with TemporaryDirectory() as temp:
            binary = Path(temp) / 'model.bin'
            for order, pruning in product((3, 4, 5), ('count', 'entropy')):
                with self.subTest(order=order, pruning=pruning), sqlite3.connect(':memory:') as db:
                    accumulate(db, source, lookup, order)
                    model, stats, reference = compile_model(db, vocab, order, 800, pruning)
                    binary.write_bytes(encode(vocab, model))
                    decoded_vocab, decoded, decoded_order = model_file(binary)
                    self.assertEqual(decoded_vocab, vocab)
                    self.assertEqual(decoded_order, order)
                    self.assertLessEqual(binary.stat().st_size, 800)
                    self.assertLess(stats['maxRowMassError'], 1e-6)
                    for length in range(order):
                        for history in product(range(len(vocab)), repeat=length):
                            packed = [decoded.probability(history, word) for word in lookup.values()]
                            full = [reference.probability(key(history), word) for word in lookup.values()]
                            self.assertAlmostEqual(sum(packed), 1, places=6)
                            self.assertAlmostEqual(sum(full), 1, places=10)

    def test_reused_highest_order_counts_match_independent_lower_order(self):
        vocab = [*SPECIAL, 'a', 'in', 'set', 'open', 'space']
        lookup = dict(zip(vocab, range(len(vocab))))
        source = [['a', 'set', 'in', 'a', 'space'], ['open', 'set', 'in', 'open', 'space'],
                  ['this', 'unknown', 'set', 'in', 'a']]
        models = []
        for counted in (3, 5):
            with sqlite3.connect(':memory:') as db:
                accumulate(db, source, lookup, counted)
                model, _, _ = compile_model(db, vocab, 3, 800, 'entropy')
                models.append(encode(vocab, model))
        self.assertEqual(models[0], models[1])

    def test_entropy_priority_uses_empirical_history_frequency(self):
        cost = entropy_cost(.4, .2, .75, .8)
        self.assertGreater(cost, 0)
        candidates = [((1,), 3, .4, cost), ((2,), 3, .4, 10 * cost)]
        chosen = high_priority(candidates, 2, 32)
        self.assertEqual(chosen, {(2,): {3: .4}})

    def test_byte_fallback_and_role_budget(self):
        encoder = Encoder([[ord('a') + 6, ord('u') + 6]])
        text = 'Hausdorff, non-Archimedean. Émile’s \\mathbb{R} meets 𝓍'
        self.assertEqual(encoder.decode(encoder.encode(text)), text)
        prompt = prompt_ids(encoder, 'x' * 100, 'y' * 5, 'z' * 100, 32)
        self.assertEqual(len(prompt), 32)
        self.assertEqual(prompt[:2], [1, 3])
        self.assertEqual(prompt[9], 4)
        self.assertEqual(prompt[15], 5)
        self.assertEqual(encoder.decode(prompt[16:]), 'z' * 16)

    def test_mixtures_and_tied_calibration_thresholds(self):
        fitted = mixture([[.25, .8, 0, 0, .25]] * 300, PRIOR, 100)
        self.assertAlmostEqual(float(fitted.sum()), 1)
        self.assertGreater(fitted[1], fitted[0])
        self.assertEqual(threshold([(.9, True), (.9, False), (.8, True)], 1), {})

    def test_paired_bootstrap_uses_answer_totals(self):
        base = {'short': {'ksr/hits': 0, 'ksr/targets': 2}, 'long': {'ksr/hits': 4, 'ksr/targets': 20}}
        test = {'short': {'ksr/hits': 1, 'ksr/targets': 2}, 'long': {'ksr/hits': 7, 'ksr/targets': 20}}
        result = paired(base, test, 7)['ksr']
        self.assertAlmostEqual(result['difference'], 4 / 22)
        np.testing.assert_allclose(result['pairedAnswerBootstrap95'], [.15, .5])


class NeuralTests(unittest.TestCase):
    def test_cache_and_native_graph_attention_match_full_context(self):
        try:
            import torch
        except ImportError:
            self.skipTest('Install the offline training dependencies')
        from neural import Config, Decoder
        torch.manual_seed(7)
        torch.set_num_threads(1)
        model = Decoder(Config(32, 2, 4, 16, 263)).eval()
        with torch.no_grad():
            tokens = torch.arange(5, 21).reshape(1, -1)
            for length in (1, 2, 8, 16):
                native = model.next(tokens[:, :length])[0]
                actual = model.next(tokens[:, :length], graph=True)[0]
                torch.testing.assert_close(native, actual, rtol=1e-5, atol=1e-6)
                if length > 1:
                    _, cache = model.next(tokens[:, :length - 1])
                    cached = model.next(tokens[:, length - 1:length], cache)[0]
                    expanded = model.next(tokens[:, length - 1:length], cache, graph=True)[0]
                    torch.testing.assert_close(native, cached, rtol=1e-5, atol=1e-6)
                    torch.testing.assert_close(native, expanded, rtol=1e-5, atol=1e-6)


if __name__ == '__main__':
    unittest.main()
