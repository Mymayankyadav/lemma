import unittest
from data_audit import clean, connected_groups, utf16_spans
from sealed_data_check import report


class DataAuditTests(unittest.TestCase):
    def test_math_extraction_and_offset_mapping(self):
        source = '<p>Δ😀 <math alttext="\\alpha_{i}"><mi>α</mi></math> &amp; <b>A</b></p>'
        text, spans, reason = clean(source)
        self.assertIsNone(reason)
        self.assertIn('$\\alpha_{i}$ & A', text)
        self.assertEqual(len(text), len(spans))
        index = text.index('😀')
        self.assertEqual(source[slice(*spans[index])], '😀')
        utf16 = utf16_spans(source, spans)[index]
        self.assertEqual(utf16[1] - utf16[0], 2)
        index = text.index('\\alpha')
        self.assertEqual(source[slice(*spans[index])], '\\')
        self.assertEqual(clean('<math><mi>x</mi></math>')[2], 'mathml_without_alttext')
        self.assertEqual(clean('broken \ufffd')[2], 'corrupt_character')

    def test_masked_alt_self_closing_suppression_and_entity_map(self):
        source = '<p><img alt="$x_i$"/> <math alttext="$y_j$"><mi>y</mi></math><nav/> &amp next</p>'
        text, spans, reason = clean(source)
        self.assertIsNone(reason)
        self.assertIn('$x_i$ $y_j$ & next', text)
        self.assertNotIn('xx', text)
        amp = text.index('&')
        self.assertEqual(source[slice(*spans[amp])], '&amp')
        next_char = text.index('next')
        self.assertEqual(source[slice(*spans[next_char])], 'n')

    def test_math_with_markup_characters_survives_html(self):
        source = '<p>Keep $a<b \u0026 c>d$ together.</p>'
        text, _, reason = clean(source)
        self.assertIsNone(reason)
        self.assertIn('$a<b \u0026 c>d$', text)

    def test_tex_environment_in_html_is_not_parsed_as_markup(self):
        formula = r'\begin{align} a<b \u0026 c=d \end{align}'.replace('\\u0026', '&')
        text, _, reason = clean('<p>' + formula + '</p>')
        self.assertIsNone(reason)
        self.assertIn(formula, text)

    def test_grouping_copies_and_standard_definition_false_merge(self):
        definition = 'A group is a set with an associative binary operation an identity and inverse elements'
        texts = [definition + ' and is commutative.', definition + ' and need not be commutative.',
                 'A vector space over a field is a set with addition and scalar multiplication.']
        groups, links = connected_groups([{'text':s, 'group':str(i)} for i, s in enumerate(texts)])
        self.assertNotEqual(groups[0], groups[1])  # polarity changes cannot be merged
        self.assertNotEqual(groups[0], groups[2])
        exact = texts[0] + ' More detail.'
        grouped, links = connected_groups([{'text':texts[0], 'group':'a'}, {'text':exact, 'group':'b'}])
        self.assertEqual(grouped[0], grouped[1])
        self.assertIn('containment', [link[2] for link in links])
        changed_case = texts[0].replace('A group', 'a group')
        grouped, _ = connected_groups([{'text':texts[0], 'group':'a'}, {'text':changed_case, 'group':'b'}])
        self.assertNotEqual(grouped[0], grouped[1])

    def test_short_paraphrase_is_a_known_miss(self):
        docs = [{'text':r'The function $f(x)=x^2$ has derivative $2x$.', 'group':'a'},
                {'text':r'The derivative of $x^2$ is $2x$.', 'group':'b'}]
        groups, links = connected_groups(docs)
        self.assertNotEqual(groups[0], groups[1])
        self.assertEqual(links, [])  # Limitation, not evidence of non-duplication.

    def test_same_publisher_is_partition_link_only(self):
        docs = [{'text':'Find the derivative of x squared.', 'group':'publisher'},
                {'text':'Calculate the sum of the first twenty terms.', 'group':'publisher'}]
        groups, duplicate_links = connected_groups(docs)
        self.assertEqual(groups[0], groups[1])
        self.assertEqual(duplicate_links, [])

    def test_near_revision_keeps_notation_and_polarity_guard(self):
        original = ' '.join('term' + str(i) for i in range(70))
        revision = original.replace('term35', 'modified')
        grouped, links = connected_groups([{'text':original, 'group':'a'}, {'text':revision, 'group':'b'}])
        self.assertEqual(grouped[0], grouped[1])
        self.assertEqual(links[0][2], 'near')
        changed = revision + ' not'
        grouped, _ = connected_groups([{'text':original, 'group':'a'}, {'text':changed, 'group':'b'}])
        self.assertNotEqual(grouped[0], grouped[1])

    def test_custodian_reports_only_aggregate_for_copies_and_revision(self):
        secret = 'the first twelve words of this demonstration form a copied passage for our detector to find'
        copied = 'Prefix. ' + secret + ' Suffix.'
        unrelated = 'Completely distinct theorem about primes, rings, and ideals.'
        result = report([secret], [secret, copied, unrelated])
        self.assertEqual(result['counts']['exactCandidateCount'], 1)
        self.assertEqual(result['counts']['containmentCandidateCount'], 2)
        self.assertEqual(result['counts']['candidatesWithAnyMatch'], 2)
        self.assertNotIn(secret, str(result))

    def test_plain_math_surface_is_untouched(self):
        source = r'Let $A_i = \\alpha$ and $a_i = \\beta$; {x}.'
        text, spans, reason = clean(source)
        self.assertEqual(text, source)
        self.assertIsNone(reason)
        self.assertEqual(len(text), len(spans))


if __name__ == '__main__':
    unittest.main()
