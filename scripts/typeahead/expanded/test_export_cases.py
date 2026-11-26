"""Audit the common held-out inputs independently of a checkpoint's training pool."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

from corpus import file_hash


class CommonExportCasesTests(unittest.TestCase):
    def setUp(self):
        try:
            from export import context_source
        except ImportError:
            self.skipTest('Install the offline training dependencies')
        self.context_source = context_source
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.common = self.root / 'shared-heldout'
        self.raw = ['tokenizer.json', 'validation.tokens', 'validation.index']
        self.roles = ['adapt-512-validation.tokens', 'adapt-512-validation.index',
                      'adapt-512-validation.partial.jsonl']
        self.write_manifest(self.common, self.raw + self.roles, {'validation': {}},
                            {'512': {'validation': {}}})
        self.first = self.root / 'first'
        self.second = self.root / 'second'
        for pool in (self.first, self.second):
            self.write_manifest(pool, self.raw, {'train': {'pool': pool.name}, 'validation': {}}, {},
                                file_hash(self.common / 'manifest.json'))

    def write_manifest(self, path, files, counts, adaptation, heldout=None):
        path.mkdir(exist_ok=True)
        entries = {}
        for name in files:
            asset = path / name
            asset.write_bytes(name.encode())
            entries[name] = {'bytes': asset.stat().st_size, 'sha256': file_hash(asset)}
        (path / 'manifest.json').write_text(json.dumps({'files': entries, 'counts': counts, 'adaptation': adaptation,
                                                       'sharedHeldoutSha256': heldout}))

    def verify(self, pool, common, adapted=False):
        return self.context_source(pool, common, 512, 'validation', adapted, True)

    def test_different_training_pools_share_one_train_free_context_source(self):
        first_hash, first_tokenizer, first_cases = self.verify(self.first, self.common)
        second_hash, second_tokenizer, second_cases = self.verify(self.second, self.common, adapted=True)
        self.assertNotEqual(first_hash, second_hash)
        self.assertEqual(first_tokenizer, second_tokenizer)
        self.assertEqual(first_cases, second_cases)
        self.assertEqual(first_cases, file_hash(self.common / 'manifest.json'))

    def test_audited_export_requires_the_matching_common_manifest(self):
        with self.assertRaisesRegex(ValueError, 'requires the frozen'):
            self.verify(self.first, None)
        manifest_path = self.common / 'manifest.json'
        manifest_path.write_text(manifest_path.read_text() + '\n')
        with self.assertRaisesRegex(ValueError, 'exact train-free'):
            self.verify(self.first, self.common)
        self.write_manifest(self.common, self.raw + self.roles, {'validation': {}},
                            {'512': {'validation': {}, 'train': {}}})
        self.write_manifest(self.first, self.raw, {'train': {}, 'validation': {}}, {},
                            file_hash(self.common / 'manifest.json'))
        with self.assertRaisesRegex(ValueError, 'exact train-free'):
            self.verify(self.first, self.common)

    def test_common_role_case_bytes_are_verified_for_base_models(self):
        (self.common / self.roles[-1]).write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'partial.jsonl'):
            self.verify(self.first, self.common)

    def test_role_cases_include_capped_input_with_separate_next_target(self):
        from export import role_cases

        context = 512
        lengths = [90] * 120 + [context + 1] * 25
        start = 0
        documents, stream = [], []
        for index, length in enumerate(lengths):
            documents.append((start, length, 4))
            stream.extend([index + 1000, *range(1, length)])
            start += length
        stream = SimpleNamespace(docs=np.asarray(documents), stream=np.asarray(stream))
        partial = []
        for index in range(50):
            partial.append({'ids': [4000 + index, 5, 6, 7], 'target': 8,
                            'previousIds': [4000 + index, 5, 6, 3], 'stablePrefix': 3,
                            'documentId': str(index), 'layout': 'roles',
                            'wholeWordBase': [5000 + index, 5, 6], 'wholeWordPieces': [7, 9],
                            'wholeWordNextToken': 11})
        with patch('export.Stream', return_value=stream), patch('export.records', return_value=partial):
            cases = role_cases(self.common, context, 150, 'validation')[:150]
        self.assertEqual(len({case['ids'] for case in cases}), 150)
        self.assertEqual(sum('previousIds' in case for case in cases), 50)
        self.assertEqual(sum('sharedWholeWordPrefix' in case for case in cases), 50)
        capped = [case for case in cases if len(case['ids']) == context]
        self.assertTrue(capped)
        self.assertTrue(all(case['target'] == context for case in capped))


if __name__ == '__main__':
    unittest.main()
