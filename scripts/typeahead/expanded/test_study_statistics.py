import json
from pathlib import Path
import tempfile
import unittest
from study_statistics import analyze


def write(path, rows):
    path.write_text(''.join(json.dumps(row)+'\n' for row in rows))
    return path


class PairedStudyTests(unittest.TestCase):
    def test_stratified_matched_ratio_and_profile_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            allocation = write(root/'allocation', [dict(answerId=str(i), stratum='s', profileBlock=str(i//2)) for i in range(4)])
            gold = write(root/'gold', [dict(eventId=str(i), answerId=str(i), prefixSha256='p', boundary=True,
                edit=dict(start=0,end=0,insert='x',caret=1)) for i in range(4)])
            left = write(root/'left', [dict(eventId=str(i),prefixSha256='p',slate=[]) for i in range(4)])
            right = write(root/'right', [dict(eventId=str(i),prefixSha256='p',slate=[dict(start=0,end=0,text='x',caret=1)]) for i in range(4)])
            base = write(root/'base', [dict(answerId=str(i),manualKeys=10,assistedKeys=8,costDefinition='full-answer-v1') for i in range(4)])
            candidate = write(root/'candidate', [dict(answerId=str(i),manualKeys=10,assistedKeys=7,costDefinition='full-answer-v1') for i in range(4)])
            result = analyze(allocation,gold,left,right,base,candidate,simulations=50)
            self.assertEqual(result['gain'], [.1,1.])
            self.assertEqual(result['pairedBootstrap95'], [[.1,.1],[1.,1.]])
            self.assertEqual(result['blocks'],2)
            self.assertIsNone(result['planning'])
            invalid = write(root/'invalid', [dict(answerId=str(i),manualKeys=10,assistedKeys=7,costDefinition='full-answer-punctuation-pairs-v1') for i in range(4)])
            with self.assertRaises(ValueError):
                analyze(allocation,gold,left,right,base,invalid,simulations=50)


if __name__ == '__main__':
    unittest.main()
