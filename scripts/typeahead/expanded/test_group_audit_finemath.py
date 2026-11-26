"""Check archived FineMath publisher aliases without loosening the split audit."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from corpus import audit_groups, file_hash, finemath_audit_identity, group_preflight, split_for, text_hash


class FineMathGroupAuditTests(unittest.TestCase):
    def test_bare_host_and_qualified_aliases_follow_the_archived_policy(self):
        bare = finemath_audit_identity('WwW.Maths.Example', archived_query_policy=True)
        qualified = finemath_audit_identity('http://maths.example/?tag=proof#ref', archived_query_policy=True)
        self.assertEqual(bare, ('maths.example', True))
        self.assertEqual(qualified, ('maths.example', False))
        self.assertEqual(finemath_audit_identity('maths.example.'), ('maths.example', True))
        self.assertEqual(finemath_audit_identity('https://MATHS.Example.:443/'), ('maths.example:443', False))
        self.assertEqual(finemath_audit_identity('https://www.maths.example/path/?tag=proof'),
                         ('maths.example/path?tag=proof', False))
        self.assertEqual(finemath_audit_identity('https://WWW.Maths.Example/path/?tag=proof',
                                                 archived_query_policy=True), ('maths.example/path', False))
        for invalid in ('plain text', 'somehost', 'maths.example/path', '-maths.example', 'https://[',
                        'https://user@maths.example/', 'https://maths.example:99999/', 'https://maths.example:/',
                        'https://maths.exa\nmple/', 'https://maths.example/\\other'):
            self.assertEqual(finemath_audit_identity(invalid), ('', False))

    def test_qualified_underscore_is_unambiguous_but_bare_underscore_is_not_inferred(self):
        self.assertEqual(finemath_audit_identity('https://proof_site.maths.example/article/'),
                         ('proof_site.maths.example/article', False))
        self.assertEqual(finemath_audit_identity('proof_site.maths.example'), ('', False))

    def test_modern_preflight_groups_bare_host_but_preserves_page_queries(self):
        source = {'id': 'HuggingFaceTB/finemath', 'groupField': 'url'}
        records = [{'url': ref} for ref in ('www.maths.example.', 'https://maths.example/',
                                           'https://maths.example/?lesson=1', 'https://maths.example/?lesson=2')]
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / 'source.jsonl'
            path.write_text(''.join(json.dumps(record) + '\n' for record in records))
            self.assertEqual(group_preflight(path, source)['distinctGroups'], 3)

    def test_archived_union_keeps_physical_counts_and_never_unions_heldouts(self):
        source = 'HuggingFaceTB/finemath'
        train = [f'group-{n}' for n in range(30) if split_for(f'group-{n}') == 'train'][:3]
        test = [f'group-{n}' for n in range(1000) if split_for(f'group-{n}') == 'test'][:2]

        def doc(ref, group, name):
            return {'source': source, 'reference': ref, 'group': group, 'id': name}

        first = doc('www.maths.example', train[0], 'first')
        second = doc('https://maths.example/', train[1], 'second')
        third = doc('https://maths.example/?tag=proof', train[2], 'third')
        with TemporaryDirectory() as tmp:
            pool, dev = Path(tmp) / 'pool', Path(tmp) / 'dev'
            pool.mkdir()
            dev.mkdir()
            for path in (pool, dev):
                (path / 'manifest.json').write_text('{"shards":[]}')
            pinned = {'sourceArchiveSha256': 'archive', 'corpusSha256': file_hash(pool / 'manifest.json'),
                      'developmentSha256': file_hash(dev / 'manifest.json')}
            by_split = {'train': [first, second, third]}
            with patch('corpus.ARCHIVED_FINE_MATH', pinned), patch(
                'corpus.documents', side_effect=lambda _pool, split: by_split.get(split, []),
            ):
                with self.assertRaisesRegex(ValueError, 'inconsistent connected groups'):
                    audit_groups(pool, dev, tmp)
                with self.assertRaisesRegex(ValueError, 'exact pinned'):
                    audit_groups(pool, dev, tmp, archived_recovery='wrong')
                result = audit_groups(pool, dev, tmp, archived_recovery='archive')
                self.assertEqual(result['fineMathBarePublisherRefs'], 1)
                self.assertEqual(result['fineMathQualifiedPublisherRefs'], 2)
                self.assertEqual(result['archivedTrainPublisherAliases'], 1)
                report = result['archiveRecovery']
                self.assertEqual(report['physicalGroupCounts']['train'], 3)
                self.assertEqual(report['canonicalGroupCounts']['train'], 1)
                mapping = {group: min(train) for group in train if group != min(train)}
                self.assertEqual(report['canonicalTrainGroupMapping'], mapping)
                self.assertEqual(report['canonicalTrainGroupMappingSha256'],
                                 text_hash(json.dumps(mapping, sort_keys=True, separators=(',', ':'))))
                by_split['test'] = [doc('https://maths.example/', test[0], 'test')]
                with self.assertRaisesRegex(ValueError, 'inconsistent connected groups'):
                    audit_groups(pool, dev, tmp, archived_recovery='archive')
                by_split['train'] = []
                by_split['test'].append(doc('maths.example', test[1], 'other-test'))
                with self.assertRaisesRegex(ValueError, 'inconsistent connected groups'):
                    audit_groups(pool, dev, tmp, archived_recovery='archive')


if __name__ == '__main__':
    unittest.main()
