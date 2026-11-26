import hashlib
import json
import lzma
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import student_source_refs as refs


class SourceRecipeTests(unittest.TestCase):
    def test_round_trip_without_embedded_passages_and_wrong_manifest_rejected(self):
        with TemporaryDirectory() as temp:
            root = Path(temp); corpus = root/'corpus'; corpus.mkdir()
            (corpus/'manifest.json').write_text('{"fixture":true}\n')
            body = 'UNIQUE SOURCE SECRET and an example first, then an argument follows here. '
            question = 'UNIQUE QUESTION SECRET'
            group = 'group-id'
            document = {'source':'hoskinson-center/proof-pile','group':group,'question':question,'text':body}
            rows = []
            for word in ('example','argument'):
                pos = body.index(word); before = body[max(0,pos-1000):pos]; stem = word[:2]
                for kind,prefix in [('boundary',''),('prefix',stem)]:
                    rows.append({'group':group,'split':refs.split_for_group(group),'kind':kind,'question':question,
                                 'draft':before+prefix,'prefix':prefix,'gold':word,'candidates':[word]})
            data = root/'data.jsonl'
            data.write_text(''.join(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n' for row in rows))
            sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
            with patch.object(refs,'EXPECTED_ROWS',4), patch.object(refs,'EXPECTED_GROUPS',1), \
                 patch.object(refs,'DATA_SHA256',sha(data)), patch.object(refs,'CORPUS_SHA256',sha(corpus/'manifest.json')), \
                 patch.object(refs,'documents',side_effect=lambda _corpus, split: iter([document])):
                recipe = root/'recipe.xz'; output = root/'reconstructed.jsonl'
                refs.encode(data,corpus,recipe)
                self.assertNotIn(b'UNIQUE SOURCE SECRET',lzma.decompress(recipe.read_bytes()))
                self.assertNotIn(b'UNIQUE QUESTION SECRET',lzma.decompress(recipe.read_bytes()))
                refs.reconstruct(recipe,corpus,output)
                self.assertEqual(data.read_bytes(),output.read_bytes())
                (corpus/'manifest.json').write_text('different')
                with self.assertRaises(ValueError):
                    refs.reconstruct(recipe,corpus,root/'bad.jsonl')


if __name__ == '__main__':
    unittest.main()
