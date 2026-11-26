"""Regression cases for typed edits, post-capture scoring, and question-only tutor hints."""
import tempfile
import unittest
from pathlib import Path

from menu_evaluation import identity, paired, score
from replay_sample import jsonl
from run_cohort import fixture_open_timed_out, with_tutor


class MenuEvaluationTests(unittest.TestCase):
    def test_visible_edit_needs_exact_range_spacing_and_selection(self):
        edit = dict(start=3, end=5, insert='term ', caret=8)
        outcome = dict(answerId='thread', eventId='event', prefixSha256='sha', edit=edit,
                       kind='word', boundary=False, exactGhost='term follows')
        row = dict(eventId='event', prefixSha256='sha', slate=[{**edit,'caret':7}],
                   trace={'raw':[{**edit,'eligible':True}], 'eligible':[edit]}, ghost={'text':'term'}, ghostEligible=True)
        with tempfile.TemporaryDirectory() as directory:
            gold, impressions = (Path(directory)/name for name in ('gold','observed'))
            jsonl(gold,[outcome]); jsonl(impressions,[row])
            result = score(gold,impressions,{'thread'})
            self.assertEqual(result['firstLoss'],{'outside-visible-three':1})
            self.assertEqual(result['visibleGhost'],{'eligible':1,'shown':1,'exact':1})
            jsonl(impressions,[{**row,'slate':[edit]}])
            self.assertEqual(score(gold,impressions)['totals']['prefixHits'],1)
            jsonl(impressions,[row,row])
            with self.assertRaisesRegex(ValueError,'repeated'):
                score(gold,impressions)
        self.assertIsNone(identity({**edit,'selectionEnd':-1}))

    def test_paired_savings_uses_all_manual_keys_and_validates_groups(self):
        rows = [dict(answerId='a', manualKeys=10, assistedKeys=8, costDefinition='full-answer-v1'),
                dict(answerId='b', manualKeys=90, assistedKeys=80, costDefinition='full-answer-v1')]
        with tempfile.TemporaryDirectory() as directory:
            base, candidate = (Path(directory)/name for name in ('base','cand'))
            jsonl(base,rows); jsonl(candidate,[rows[0],{**rows[1],'assistedKeys':70}])
            self.assertAlmostEqual(paired(base,candidate)['gain'],.10)
            jsonl(candidate,rows[:1])
            with self.assertRaisesRegex(ValueError,'Paired'):
                paired(base,candidate)

    def test_visible_changes_match_event_ids_and_resample_whole_threads(self):
        edit = dict(start=0, end=1, insert='word', caret=4)
        gold = [dict(answerId=thread, eventId=event, prefixSha256=event, edit=edit,
                     kind='word', boundary=False, exactGhost='') for thread, event in [('a','e1'),('a','e2'),('b','e3')]]
        def observed(row, hit):
            return dict(eventId=row['eventId'], prefixSha256=row['prefixSha256'], slate=[edit] if hit else [])
        with tempfile.TemporaryDirectory() as folder:
            target, old, new = (Path(folder)/file for file in ('gold','before','after'))
            jsonl(target,gold)
            jsonl(old,[observed(row,row['answerId']=='b') for row in reversed(gold)])
            jsonl(new,[observed(row,row['answerId']=='a') for row in gold])
            changes = score(target,new,baseline=old)['pairedTopThree']['word']
            self.assertEqual(changes,dict(opportunities=3,gained=2,lost=1,delta=1/3,ci95=[-1.,1.]))

    def test_tutor_overlay_uses_only_matching_question_words(self):
        ctx = {'question':'Explain the upper bound.', 'answer':'Use the lower limit.'}
        hints = with_tutor(ctx)['aid']['ranking']['hints']
        self.assertEqual([(h['entry'],h['priority']) for h in hints],
                         [('upper bound','prefer'),('upper limit','deemphasize')])
        for question in ('xupper bound','an upper boundary','upper bound and upper limit'):
            self.assertNotIn('aid',with_tutor({**ctx,'question':question}))

    def test_only_the_unopened_editor_fixture_is_retryable(self):
        failure = 'Error: expect(locator).toBeVisible() failed\nLocator: {}\nError: element(s) not found'
        opener = "getByRole('button', {name: 'Write a question'}).or(getByRole('textbox', {name: 'Your answer'}))"
        self.assertTrue(fixture_open_timed_out(failure.format(opener)))
        self.assertFalse(fixture_open_timed_out(failure.format("getByRole('button', {name: 'Insert notation'})") + '\n' + opener))
