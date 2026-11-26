"""Verify full-corpus encoding cannot claim coverage after truncating its stream."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from corpus import file_hash
from subwords import audit_full_encoding


class FullPoolTests(unittest.TestCase):
    def test_raw_document_membership_and_word_registers(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            raw = root / 'raw'
            raw.mkdir()
            encoded = root / 'encoded'
            encoded.mkdir()
            documents = [
                {'id': 'first', 'group': 'g1', 'register': 'proof', 'words': 70},
                {'id': 'second', 'group': 'g2', 'register': 'learner', 'words': 30},
            ]
            raw_manifest = raw / 'manifest.json'
            registers = {'proof': 70, 'learner': 30}
            raw_manifest.write_text(json.dumps({'counts': {'train': {
                'documents': 2, 'words': 100, 'registers': registers,
            }}}))
            trace = encoded / 'train.documents.jsonl'
            manifest = {'corpus': file_hash(raw_manifest), 'counts': {'train': {
                'documents': 2, 'words': 100, 'wordRegisters': registers.copy(),
            }}, 'files': {trace.name: {}}}

            def write_trace(rows):
                trace.write_text(''.join(json.dumps({'id': row['id'], 'group': row['group']}) + '\n'
                                         for row in rows))
                manifest['files'][trace.name]['sha256'] = file_hash(trace)

            write_trace(documents)
            with patch('subwords.documents', return_value=documents):
                self.assertEqual(audit_full_encoding(raw, encoded, manifest),
                                 {'documents': 2, 'words': 100, 'wordRegisters': registers})
                write_trace(documents[:1])
                with self.assertRaises(ValueError):
                    audit_full_encoding(raw, encoded, manifest)
                write_trace(documents[::-1])
                with self.assertRaisesRegex(ValueError, 'reordered'):
                    audit_full_encoding(raw, encoded, manifest)
                write_trace(documents)
                manifest['counts']['train']['wordRegisters'] = {'proof': 69, 'learner': 31}
                with self.assertRaisesRegex(ValueError, 'register word counts'):
                    audit_full_encoding(raw, encoded, manifest)


if __name__ == '__main__':
    unittest.main()
