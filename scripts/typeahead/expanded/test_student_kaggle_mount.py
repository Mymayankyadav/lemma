"""Check exact inline reconstruction and the mounted teacher pin."""
import base64
import hashlib
import lzma
import os
from pathlib import Path
import tempfile
import unittest

import student_kaggle_mount as mount


def signature(blob):
    return {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}


class MountTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name)
        self.teacher, self.out = base / 'inputs' / 'training', base / 'stage'
        self.teacher.mkdir(parents=True)
        self.out.mkdir()
        self.checkpoint = b'deterministic checkpoint bytes'
        (self.teacher / 'best.pt').write_bytes(self.checkpoint)
        self.parts = {name: (name + '\n π\n').encode() for name in mount.PACKED_FILES}
        self.zipped = lzma.compress(b''.join(self.parts.values()))
        self.info = {'files': {k: signature(v) for k, v in self.parts.items()}, 'teacher': signature(self.checkpoint),
                     'compressedBytes': len(self.zipped), 'compressedSha256': signature(self.zipped)['sha256']}

    def test_exact_round_trip(self):
        mount.unpack_members(self.out, self.info, base64.b85encode(self.zipped))
        self.assertEqual({p.name: p.read_bytes() for p in self.out.iterdir()}, self.parts)
        self.assertNotIn('data.jsonl', mount.PACKED_FILES)

    def test_size_and_digest_are_both_checked_for_teacher(self):
        decoy = self.teacher.parent / 'other'
        decoy.mkdir()
        (decoy / 'best.pt').write_bytes(b'q' * len(self.checkpoint))
        sig = self.info['teacher']
        locate = lambda: mount.locate_attachment(self.teacher.parent, mount.TEACHER_KERNEL, 'best.pt', sig['sha256'], sig['bytes'])
        self.assertEqual(locate(), self.teacher / 'best.pt')
        (decoy / 'best.pt').unlink()
        os.link(self.teacher / 'best.pt', decoy / 'best.pt')
        self.assertTrue(locate().samefile(self.teacher / 'best.pt'))
        (decoy / 'best.pt').unlink()
        (decoy / 'best.pt').write_bytes(self.checkpoint)
        with self.assertRaisesRegex(ValueError, 'found 2'):
            locate()

    def test_rejects_changed_envelope(self):
        with self.assertRaisesRegex(ValueError, 'compressed training packet changed'):
            mount.unpack_members(self.out, self.info, base64.b85encode(self.zipped + b'x'))
        self.assertEqual(list(self.out.iterdir()), [])

    def test_resume_mount_requires_explicit_request_pin_and_distinct_kernels(self):
        fresh = {'kernelId': 'owner/next', 'resumeKernel': None, 'resumeReceiptSha256': None}
        resumed = dict(fresh, resumeKernel='owner/previous', resumeReceiptSha256='a' * 64)
        self.assertEqual(mount.mounted_kernels(fresh, False), [mount.TEACHER_KERNEL, mount.CORPUS_KERNEL])
        self.assertEqual(mount.mounted_kernels(resumed, True), [mount.TEACHER_KERNEL, mount.CORPUS_KERNEL, 'owner/previous'])
        with self.assertRaisesRegex(ValueError, 'explicit --resume'):
            mount.mounted_kernels(resumed, False)
        for prior in (mount.TEACHER_KERNEL, mount.CORPUS_KERNEL, 'OWNER/next'):
            with self.subTest(prior=prior), self.assertRaisesRegex(ValueError, 'must be distinct'):
                mount.mounted_kernels(dict(resumed, resumeKernel=prior), True)
        with self.assertRaisesRegex(ValueError, 'exact receipt SHA-256'):
            mount.mounted_kernels(dict(resumed, resumeReceiptSha256='bad'), True)
        with self.assertRaisesRegex(ValueError, 'new kernel must be distinct'):
            mount.mounted_kernels(dict(fresh, kernelId=mount.CORPUS_KERNEL), False)

    def test_source_limit_counts_utf8_bytes_and_is_strict(self):
        mount.check_source_size('a' * (mount.SCRIPT_MAX_BYTES - 1))
        with self.assertRaisesRegex(ValueError, 'reaching the 1000000-byte limit'):
            mount.check_source_size('π' * (mount.SCRIPT_MAX_BYTES // 2))

    def test_uses_scoped_provider_mount(self):
        inputs = self.out
        replica = inputs / 'notebooks' / mount.CORPUS_KERNEL
        replica.mkdir(parents=True)
        self.assertEqual(mount.mounted_output(inputs, mount.CORPUS_KERNEL), replica)
        alias = inputs / mount.CORPUS_KERNEL.split('/')[-1]
        alias.symlink_to(replica, target_is_directory=True)
        self.assertEqual(mount.mounted_output(inputs, mount.CORPUS_KERNEL), replica)


if __name__ == '__main__':
    unittest.main()
