import unittest
from ngram import Model
from student_training_data import DenseScorer, candidates, eligible, load_policy, open_literal, opportunities, split_for_group


class StudentTrainingDataTests(unittest.TestCase):
    def test_natural_candidate_set_and_policy(self):
        vocab = ['<s>', '<m>', '<num>', '<unk>', '</s>', 'example', 'injective', 'therefore', 'case', 'not']
        model = Model([0,0,0,0,0,.3,.3,.2,.1,.1])
        model.rows.extend([{}, {}, {}])
        lookup = {word:i for i,word in enumerate(vocab)}
        policy = load_policy()
        self.assertFalse(eligible('injective', '', '', policy))
        self.assertTrue(eligible('injective', '', 'inj', policy))
        self.assertFalse(eligible('therefore', '', 'the', policy))
        self.assertTrue(eligible('not', '', 'not', policy))
        self.assertTrue(eligible('by', '', 'by', policy))
        self.assertFalse(eligible('example', 'we choose ', '', policy))
        result = candidates(vocab, model, 4, lookup, [5,6,7,8], 'in this ', '', policy)
        self.assertEqual(result, ['example','case'])
        self.assertEqual(candidates(vocab, model, 4, lookup, [5,6,7,8], 'in this ', 'inj', policy), ['injective'])
        self.assertNotIn('not', candidates(vocab, model, 4, lookup, [5,6,7,8,9], 'in this ', 'not', policy))

    def test_dense_probabilities_match_sparse_backoff(self):
        model = Model([.1,.2,.3,.4,.5,.6])
        model.rows.extend([{(2,):({1:.7,4:.8},.6)}, {(1,2):({3:.9},.7)}, {(0,1,2):({5:.75},.8)}])
        dense = DenseScorer(model).probabilities((0,1,2))
        for word, value in enumerate(dense):
            self.assertAlmostEqual(value, model.probability((0,1,2), word), places=12)

    def test_selection_avoids_formula_and_code(self):
        text = 'An ordinary explanation about $alpha beta gamma$ and ```code words here``` continues with several suitable words here. '
        found = opportunities(text, 'example', 20)
        self.assertTrue(found)
        for match in found:
            self.assertFalse(text.index('$') < match.start() < text.rindex('$'))
            self.assertFalse(text.index('```') < match.start() < text.rindex('```'))
        self.assertTrue(open_literal('The student typed "unfinished'))
        self.assertEqual(split_for_group('fixed'), split_for_group('fixed'))


if __name__ == '__main__':
    unittest.main()
