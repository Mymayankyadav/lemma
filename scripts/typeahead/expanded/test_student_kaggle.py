"""Portable-input, checkpoint and offline-session checks for the N253 packet."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import student_kaggle as pack


class PacketTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.data, self.manifest = self.root / 'data.jsonl', self.root / 'data-manifest.json'

    def rows(self):
        return [dict(group='first', split='fit', kind='boundary', question='', draft='Read ', prefix='', gold='here', candidates=[]),
                dict(group='second', split='calibration', kind='prefix', question='', draft='Read h', prefix='h', gold='here', candidates=['hope'])]

    def manifest_for(self, rows):
        self.data.write_text(''.join(json.dumps(row) + '\n' for row in rows))
        pack.write_json(self.manifest, dict(sourceSplit='train', sourceManifestSha256=pack.CORPUS_SHA,
            countModelSha256=pack.COUNT_SHA, dataSha256=pack.digest(self.data), rows=2, groups=2,
            groupsBySplit={'fit': 1, 'calibration': 1}, rowsBySplitAndKind={'fit|boundary': 1, 'calibration|prefix': 1},
            sources=[dict(id='sample/study', url='https://huggingface.co/datasets/sample/study', revision='a' * 40, license='CC BY-SA')]))
        return pack.digest(self.manifest)

    def test_train_split_accepts_empty_natural_slates_and_pins_attribution(self):
        expected = self.manifest_for(self.rows())
        stats = pack.validate_data(self.data, self.manifest, expected)
        self.assertEqual(stats['splitRows'], {'fit': 1, 'calibration': 1})
        self.assertEqual(stats['sources'][0]['license'], 'CC BY-SA')
        with self.data.open('a') as changed:
            changed.write(' ')
        with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
            pack.validate_data(self.data, self.manifest, expected)

    def test_refuses_reserve_labels_and_cross_split_groups(self):
        for updates, message in [({'split': 'final'}, 'outside the permitted'),
                                 ({'group': 'first'}, 'Group crosses'),
                                 ({'candidates': ['other']}, 'typed stem'),
                                 ({'fullAnswer': 'bad'}, 'Unexpected fields')]:
            rows = self.rows()
            rows[-1].update(updates)
            expected = self.manifest_for(rows)
            with self.subTest(updates=updates), self.assertRaisesRegex(ValueError, message):
                pack.validate_data(self.data, self.manifest, expected)

    def test_refuses_nonroster_archive_even_if_container_digest_matches(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('../outside.py', '')
        value = archive.getvalue()
        with self.assertRaisesRegex(ValueError, 'archive roster'):
            pack.verify_sources(value, hashlib.sha256(value).hexdigest(), self.root)

    def test_offline_child_verifies_and_enforces_its_internet_socket_guard(self):
        child = self.root / 'trainer.py'
        child.write_text('import socket\nimport sys\nassert sys.argv[1:] == ["proof"]\nsocket.getaddrinfo("example.invalid", 443)\n')
        run = subprocess.run([sys.executable, '-c', pack.OFFLINE_CHILD, str(child), 'proof'], capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('socket guard verified', run.stdout)
        self.assertIn('does not resolve internet hostnames', run.stderr)

    def test_resume_requires_the_same_training_identity_and_hashed_artifacts(self):
        old = self.root / 'previous' / pack.RUN_DIR
        out = self.root / 'current'
        old.mkdir(parents=True)
        out.mkdir()
        for name in pack.RESUME_FILES:
            (old / name).write_text(name)
        settings = {'packetSha256': 'b' * 64, 'train': pack.DEFAULT_TRAIN}
        receipt_file = old.parent / pack.RECEIPT_FILE
        pack.write_json(receipt_file, {'trainingIdentity': pack.training_identity(settings), 'status': 'resumable-time-cap',
                                      'outputs': {name: pack.describe_file(old / name) for name in pack.RESUME_FILES}})
        settings['resumeReceiptSha256'] = pack.digest(receipt_file)
        pack.copy_resume(old.parent, settings, out)
        self.assertEqual({path.name for path in out.iterdir()}, set(pack.RESUME_FILES))
        (old / 'latest.pt').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'Resume artifact changed'):
            pack.copy_resume(old.parent, settings, out)

    def test_source_archive_is_deterministic(self):
        source = self.root / 'model.py'
        source.write_text('value = 1\n')
        with patch.object(pack, '__file__', str(self.root / 'expanded' / 'wrap.py')), patch.object(pack, 'SOURCES', ('model.py',)):
            first = pack.source_archive()
            self.assertEqual(first, pack.source_archive())
            pack.verify_sources(first, hashlib.sha256(first).hexdigest())


if __name__ == '__main__':
    unittest.main()
