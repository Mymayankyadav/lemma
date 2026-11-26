"""Check exact inline reconstruction and the mounted teacher pin."""
import base64
import hashlib
import lzma
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
        mount.unpack_packet(self.teacher.parent, self.out, self.info, base64.b85encode(self.zipped))
        self.assertEqual({p.name: p.read_bytes() for p in self.out.iterdir()}, dict(self.parts, **{'teacher.pt': self.checkpoint}))

    def test_size_and_digest_are_both_checked_for_teacher(self):
        decoy = self.teacher.parent / 'other'
        decoy.mkdir()
        (decoy / 'best.pt').write_bytes(b'q' * len(self.checkpoint))
        self.assertEqual(mount.locate_teacher(self.teacher.parent, self.info['teacher']), self.teacher / 'best.pt')
        (decoy / 'best.pt').write_bytes(self.checkpoint)
        with self.assertRaisesRegex(ValueError, 'found 2'):
            mount.locate_teacher(self.teacher.parent, self.info['teacher'])

    def test_rejects_changed_envelope(self):
        with self.assertRaisesRegex(ValueError, 'compressed training packet changed'):
            mount.unpack_packet(self.teacher.parent, self.out, self.info, base64.b85encode(self.zipped + b'x'))
        self.assertEqual(list(self.out.iterdir()), [])

    def test_resume_mount_requires_explicit_request_pin_and_distinct_kernels(self):
        fresh = {'kernelId': 'owner/next', 'resumeKernel': None, 'resumeReceiptSha256': None}
        resumed = dict(fresh, resumeKernel='owner/previous', resumeReceiptSha256='a' * 64)
        self.assertEqual(mount.mounted_kernels(fresh, False), [mount.TEACHER_KERNEL])
        self.assertEqual(mount.mounted_kernels(resumed, True), [mount.TEACHER_KERNEL, 'owner/previous'])
        with self.assertRaisesRegex(ValueError, 'explicit --resume'):
            mount.mounted_kernels(resumed, False)
        for prior in (mount.TEACHER_KERNEL, 'OWNER/next'):
            with self.subTest(prior=prior), self.assertRaisesRegex(ValueError, 'must be distinct'):
                mount.mounted_kernels(dict(resumed, resumeKernel=prior), True)
        with self.assertRaisesRegex(ValueError, 'exact receipt SHA-256'):
            mount.mounted_kernels(dict(resumed, resumeReceiptSha256='bad'), True)


if __name__ == '__main__':
    unittest.main()
