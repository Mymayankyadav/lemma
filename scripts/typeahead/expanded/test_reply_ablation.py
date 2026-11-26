import unittest
from reply_ablation import first_reply


class ReplyAblationTests(unittest.TestCase):
    def test_known_wrapper_first_answer_preserves_tex_and_question_is_absent(self):
        text = ('TITLE: Problem\nQUESTION [1 upvotes]: Prove a claim.\n'
                'COMMENT [0 votes]: Prior comment.\nREPLY [4 votes]: Let $A_i=\\alpha$.\n'
                'Then $A_i > 0$.\nCOMMENT [1 votes]: Thank you.\nREPLY [0 votes]: Other proof.')
        answer, matched = first_reply({'source':'hoskinson-center/proof-pile','question':''}, text)
        self.assertTrue(matched)
        self.assertEqual(answer, 'Let $A_i=\\alpha$.\nThen $A_i > 0$.')
        self.assertNotIn('Prove a claim', answer)

    def test_unrecognized_ambiguous_or_empty_falls_back(self):
        wrapper = 'TITLE: T\nQUESTION [1 upvotes]: Q?\nREPLY [0 votes]: A.'
        for document, text in [({'source':'other'}, wrapper),
                               ({'source':'hoskinson-center/proof-pile'}, 'QUESTION [1]: Q\nREPLY [1]: A'),
                               ({'source':'hoskinson-center/proof-pile'}, wrapper+'\nQUESTION [2]: Another?'),
                               ({'source':'hoskinson-center/proof-pile'}, 'TITLE: T\nQUESTION [1]: Q\nREPLY [1]: '),
                               ({'source':'hoskinson-center/proof-pile','question':'independent'}, wrapper)]:
            self.assertEqual(first_reply(document, text), (text, False))


if __name__ == '__main__':
    unittest.main()
