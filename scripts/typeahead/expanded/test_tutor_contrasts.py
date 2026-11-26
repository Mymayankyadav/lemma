import json
from pathlib import Path
import unittest


class ContrastFixtures(unittest.TestCase):
    def test_group_scope_and_controls(self):
        data = json.loads((Path(__file__).parent / 'fixtures/tutor_contrasts.json').read_text())
        self.assertIn('Synthetic', data['status'])
        families = data['families']
        self.assertEqual(len({item['id'] for item in families}), len(families))
        self.assertEqual({item['split'] for item in families}, {'fit', 'calibration', 'challenge'})
        for item in families:
            self.assertTrue(item['question'] and item['draft'])
            self.assertEqual(set(item['scope']), {'subject', 'step', 'mode'})
            self.assertEqual(len(item['candidates']), 2)
            self.assertEqual(len(item['variants']), 3)
            self.assertEqual(item['variants'][0]['hint'], 'none')
            for variant in item['variants']:
                self.assertIn(variant['expected'], item['candidates'] + ['no_preference', 'withhold_both'])


if __name__ == '__main__':
    unittest.main()
