"""Check raw legacy assignment and connected replay quarantine."""
import gzip
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from corpus import file_hash, fingerprint
from kn_build import is_held_out
from legacy_replay_audit import LEARNER, audit, training_index


class LegacyReplayAuditTests(unittest.TestCase):
    def test_exact_source_split_and_connected_group_exclusion(self):
        def text(question, held):
            for i in range(1000):
                result = f'QUESTION [date]: {question}\nREPLY [date]: A reply numbered {i}.'
                if is_held_out(result) == held:
                    return result
            self.fail('Test could not find both legacy partitions')

        train = text('Is this a compact space?', False)
        held = text('Is this metric complete?', True)
        with TemporaryDirectory() as temp:
            path = Path(temp) / 'raw.jsonl.gz'
            with gzip.open(path, 'wt') as output:
                for question_id, value in ((15, train), (27, held)):
                    output.write(json.dumps({'text': value, 'meta': {'set_name': 'stack_exchange',
                                                                    'question_id': question_id}}) + '\n')
            index, counts = training_index(path, file_hash(path), path.stat().st_size)
        self.assertEqual(index[0], {'math.stackexchange.com/questions/15'})
        self.assertEqual(counts['heldOutDocuments'], 1)
        self.assertEqual(counts['trainDocuments'], 1)

        def row(group, source, question, text):
            return {'group': group, 'reference': source, 'question': question, 'text': text,
                    'id': fingerprint(text), 'source': LEARNER['id']}

        candidate = row('connected', 'https://math.stackexchange.com/q/999', 'An alternate wording', 'Different text.')
        alias = row('connected', 'https://math.stackexchange.com/questions/15/new-slug#answer',
                    'A changed question', 'A changed response.')
        same_question = row('mirror', 'https://example.net/15', '  Is this a compact space? ', 'A mirrored page.')
        legacy_held = row('available', 'https://math.stackexchange.com/questions/27/title',
                          'Is this metric complete?', held)
        splits = {'calibration': [candidate, alias, legacy_held], 'validation': [same_question], 'test': []}
        with patch('legacy_replay_audit.documents', side_effect=lambda _corpus, split: splits[split]):
            excluded, report = audit(None, index)
        self.assertEqual(excluded, {'connected', 'mirror'})
        self.assertEqual(report['calibration']['overlapGroups'], 1)
        self.assertEqual(report['calibration']['publisherMatchedDocuments'], 1)
        self.assertEqual(report['validation']['questionMatchedDocuments'], 1)


if __name__ == '__main__':
    unittest.main()
