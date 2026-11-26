import unittest
from compare_kn_events import history, suggestions
from ngram import Model


class CompareEventsTests(unittest.TestCase):
    def test_history_and_prefix_scoring(self):
        vocab = ['<s>', '<m>', '<num>', '<unk>', '</s>', 'the', 'then', 'case', 'example']
        lookup = {word:i for i, word in enumerate(vocab)}
        model = Model([0, 0, 0, 0, 0, .3, .2, .1, .05])
        model.rows.extend([{}, {}, {}])
        ids = history('In this ', lookup, 3)
        model.rows[3][ids] = ({7:.8, 8:.1}, .2)
        words = suggestions(vocab, model, 4, lookup, 'In this ', '', [5,6,7,8])
        self.assertEqual(words[0], 'case')
        words = suggestions(vocab, model, 4, lookup, 'In this ', 'ex', [5,6,7,8])
        self.assertEqual(words, ['example'])


if __name__ == '__main__':
    unittest.main()
