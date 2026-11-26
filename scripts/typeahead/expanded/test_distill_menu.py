"""Fast checks for exact native scoring and matched menu objectives."""
import json
from pathlib import Path
import tempfile
import unittest

import torch
from torch.nn import functional as F

from distill_menu import boundary_ids, build_cache, encode_slate, equal_budget_merge, listwise_loss, score_teacher_bucket
from neural import Config, Decoder
from subwords import BYTE_OFFSET, MERGE_OFFSET, Encoder, prompt_ids


class DistillMenuTest(unittest.TestCase):
    @staticmethod
    def encoder():
        return Encoder([[ord('c') + BYTE_OFFSET, ord('o') + BYTE_OFFSET],
                        [MERGE_OFFSET, ord('n') + BYTE_OFFSET]])

    @staticmethod
    def example(**overrides):
        return dict(dict(group='fit-a', split='fit', kind='prefix', question='Explain the term.',
                         draft='We use co', prefix='co', gold='constant', candidates=['cone', 'constant', 'compact']),
                    **overrides)

    def test_whole_words_retokenize_prefix_and_match_native_cached_likelihood(self):
        torch.manual_seed(4)
        encoder = self.encoder()
        one = encode_slate(self.example(), encoder, encoder.encode, 56, 64)
        two = encode_slate(self.example(candidates=['constant', 'coil']), encoder, encoder.encode, 56, 64)
        self.assertEqual(one.base, prompt_ids(encoder, 'Explain the term.', '', 'We use ', 64 - 36))
        self.assertEqual(one.prompt, prompt_ids(encoder, 'Explain the term.', '', 'We use co', 56))
        self.assertEqual(one.paths[1], encoder.encode('constant'))
        self.assertNotEqual(one.paths[1], encoder.encode('co') + encoder.encode('nstant'))
        self.assertEqual(one.target, 1)
        with self.assertRaisesRegex(ValueError, 'full words'):
            encode_slate(self.example(candidates=['co']), encoder, encoder.encode, 56, 64)
        teacher = Decoder(Config(width=16, layers=1, heads=2, context=64, vocab=len(encoder.pieces))).eval()
        boundaries = boundary_ids(encoder)
        candidates = [one, two]
        cached = score_teacher_bucket(teacher, [row.base for row in candidates], [row.paths for row in candidates],
                                      boundaries, torch.device('cpu'), candidate_batch=3, logit_chunk=2)
        with torch.inference_mode():
            for row, scored in zip(candidates, cached):
                for path, actual in zip(row.paths, scored):
                    logits = teacher(torch.tensor([row.base + path]))[0].log_softmax(-1)
                    start = len(row.base) - 1
                    expected = sum(logits[start + i, token].item() for i, token in enumerate(path))
                    expected += logits[-1, boundaries].logsumexp(-1).item()
                    self.assertAlmostEqual(expected, actual, places=5)

    def test_only_eligible_words_enter_kl_and_outside_keeps_gold_supervision(self):
        scores = torch.tensor([[2., 1., -torch.inf, .8], [-torch.inf, -torch.inf, -torch.inf, .2],
                               [.2, -torch.inf, -torch.inf, 1.3]], requires_grad=True)
        gold = torch.tensor([0, 3, 3])
        teacher = torch.tensor([[0., 1., 100., 0.], [0., 0., 0., 0.], [0., 0., 0., 0.]])[:, :3]
        logits = scores[:, :-1]
        eligible = torch.isfinite(logits)
        supervised = F.cross_entropy(scores, gold, reduction='none')
        expected_kl = F.kl_div((logits[0, :2] / 2).log_softmax(-1),
                               (teacher[0, :2] / 2).softmax(-1), reduction='sum') * 4
        actual = listwise_loss(scores, gold, teacher, eligible, 2., .35)
        expected = (.65 * supervised[0] + .35 * expected_kl + supervised[1:].sum()) / 3
        torch.testing.assert_close(actual, expected)
        torch.testing.assert_close(listwise_loss(scores, gold, teacher, eligible, 2., 0.), supervised.mean())
        actual.backward()
        self.assertTrue(torch.isfinite(scores.grad).all())
        self.assertNotEqual(scores.grad[2, -1].item(), 0.)

    def test_equal_budget_interleaves_and_backfills_without_duplicates(self):
        self.assertEqual(equal_budget_merge(['a', 'b', 'c'], ['a', 'd', 'e', 'f'], 5), ['a', 'b', 'd', 'c', 'e'])
        self.assertEqual(equal_budget_merge([], ['a', 'b'], 5), ['a', 'b'])

    def test_input_index_rejects_groups_reused_for_calibration(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'rows.jsonl'
            source.write_text('\n'.join(json.dumps(row) for row in [self.example(), self.example(split='calibration')]))
            cache = Path(directory) / 'cache.sqlite3'
            with self.assertRaisesRegex(ValueError, 'group occurs in both'):
                build_cache(cache, 'test', source, self.encoder(), {'studentContext': 56, 'teacherConfig': {'context': 64}})
            self.assertFalse(cache.exists())


if __name__ == '__main__':
    unittest.main()
