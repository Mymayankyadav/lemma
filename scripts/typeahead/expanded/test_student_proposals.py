import unittest
import torch
from student_proposals import (blind_union, build_vocabulary, encode_vocabulary, evaluate_blind_pools,
                               prepare_retrieval_vectors, retrieve, retrieve_batch, sample_negatives, sampled_retrieval_loss)


class StudentProposalsTests(unittest.TestCase):
    def setUp(self):
        self.fit = [dict(group='fit-a',split='fit',kind='boundary',gold=x) for x in ['alpha','alpha','Algebra','beta','beta']]
        self.fit.append(dict(group='fit-a',split='fit',kind='prefix',gold='beta'))
        self.vocab = build_vocabulary(self.fit, min_count=1)
        self.words = [entry['text'] for entry in self.vocab['words']]
        # Reversed scores and ties exercise stable, exact-case ordering.
        self.mapping = {'alpha':[1,2], 'Algebra':[3], 'beta':[4,5]}
        self.cache = encode_vocabulary(self.words, self.mapping.__getitem__)
        self.embedding = torch.nn.Embedding(8, 2, padding_idx=0)
        with torch.no_grad():
            self.embedding.weight.zero_()
            self.embedding.weight[1:] = torch.tensor([[1.,0.],[1.,0.],[1.,0.],[0.,1.],[0.,1.],[0.,0.],[0.,0.]])

    def test_fit_only_vocabulary_and_group_guard(self):
        self.assertEqual(self.vocab['words'], [{'text':'alpha','count':2}, {'text':'beta','count':2}, {'text':'Algebra','count':1}])
        with self.assertRaisesRegex(ValueError, 'fitting rows'):
            build_vocabulary(self.fit + [dict(group='other',split='validation',kind='boundary',gold='leaked')], min_count=1)
        with self.assertRaises(ValueError):
            encode_vocabulary(self.words, lambda word: [1]*65)

    def test_batched_matches_single_chunked_and_preserves_case_and_ties(self):
        vectors = prepare_retrieval_vectors(self.embedding, self.cache, chunk_size=2)
        queries = torch.tensor([[1.,0.], [1.,0.], [0.,1.]])
        prefixes = ['', 'A', 'missing']
        batched = retrieve_batch(queries, vectors, self.words, prefixes, batch_size=2)
        for i in range(len(queries)):
            self.assertEqual(batched[i], retrieve(queries[i], self.embedding, self.cache, self.words, prefixes[i], chunk_size=1, vectors=vectors))
        self.assertEqual([row['text'] for row in batched[0]], ['Algebra','alpha','beta'])
        self.assertEqual([row['text'] for row in batched[1]], ['Algebra'])
        self.assertEqual(batched[2], [])

    def test_exact_stem_is_excluded_before_top_k_without_gold(self):
        words = ['the', 'theorem', 'then']
        cache = encode_vocabulary(words, {'the':[1], 'theorem':[2], 'then':[3]}.__getitem__)
        embedding = torch.nn.Embedding(4, 2, padding_idx=0)
        with torch.no_grad():
            embedding.weight.copy_(torch.tensor([[0.,0.],[100.,0.],[2.,0.],[1.,0.]]))
        vectors = prepare_retrieval_vectors(embedding, cache)
        query = torch.tensor([1.,0.])
        single = retrieve(query, embedding, cache, words, 'the', limit=1, vectors=vectors)
        batch = retrieve_batch(query[None, :], vectors, words, ['the'], limit=1)
        self.assertEqual([item['text'] for item in single], ['theorem'])
        self.assertEqual(batch[0], single)
        with self.assertRaisesRegex(ValueError, 'strictly advancing'):
            blind_union(['the'], ['theorem'], prefix='the')
        with self.assertRaisesRegex(ValueError, 'strictly advancing'):
            blind_union(['theorem'], ['the'], prefix='the')

    def test_frequency_negatives_exclude_gold_and_gradients_flow(self):
        counts = [entry['count'] for entry in self.vocab['words']]
        positives = torch.tensor([0,1])
        a = sample_negatives(counts, positives, 8, torch.Generator().manual_seed(42))
        b = sample_negatives(counts, positives, 8, torch.Generator().manual_seed(42))
        self.assertTrue(torch.equal(a,b))
        self.assertFalse(torch.eq(a, positives[:,None]).any())
        query = torch.tensor([[1.,.2],[.2,1.]],requires_grad=True)
        loss = sampled_retrieval_loss(query, positives, self.embedding, self.cache, a)
        loss.backward()
        self.assertTrue(torch.isfinite(loss))
        self.assertGreater(query.grad.abs().sum().item(),0)
        self.assertGreater(self.embedding.weight.grad.abs().sum().item(),0)
        with self.assertRaises(ValueError):
            sampled_retrieval_loss(query, positives, self.embedding, self.cache, positives[:,None])

    def test_blind_union_and_explicit_outside_vocabulary(self):
        original = ['other','alpha']; learned = ['beta','alpha']
        union = blind_union(original, learned)
        self.assertEqual(union, ['other','alpha','beta'])
        observations = [dict(eventId='a',group='new',split='calibration',kind='boundary',prefix='',original=original,
                             learned=learned,union=union,rankedUnion=['beta','other','alpha']),
                        dict(eventId='b',group='new',split='calibration',kind='prefix',prefix='o',original=['other'],learned=[],union=['other'])]
        report = evaluate_blind_pools(observations, [dict(eventId='a',gold='beta'),dict(eventId='b',gold='other')], self.vocab)
        self.assertEqual(report['lanes']['all']['opportunities'],2)
        self.assertEqual(report['lanes']['all']['outsideVocabulary'],1)
        self.assertEqual(report['lanes']['boundary']['unionTop1'],1)
        self.assertEqual(report['lanes']['boundary']['originalTop32'],0)
        self.assertEqual(report['lanes']['boundary']['learnedTop32'],1)
        self.assertEqual(report['mode'],'offline-word-only-no-ui-policy-or-latency')
        with self.assertRaises(ValueError):
            evaluate_blind_pools([{**observations[0], 'group':'fit-a'}], [dict(eventId='a',gold='beta')], self.vocab)
        with self.assertRaises(ValueError):
            evaluate_blind_pools([{**observations[0], 'gold':'beta'}], [dict(eventId='a',gold='beta')], self.vocab)
        self.assertEqual(len(blind_union([str(i) for i in range(32)], ['new'])),32)


if __name__ == '__main__':
    unittest.main()
