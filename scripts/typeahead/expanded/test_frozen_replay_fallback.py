"""Exercise the pre-test fallback decision and rejection of accidental neural observations."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import run_frozen_replay as replay


class FrozenReplayFallbackTests(unittest.TestCase):
    def setUp(self):
        scratch = TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name)
        procedure = Path(replay.__file__).with_name('primary-precision-selection.md')
        provenance = {'checkpointSha256': '1' * 64, 'preparedManifestSha256': '2' * 64,
                      'sharedHeldoutManifestSha256': '3' * 64, 'validationCasesSha256': '4' * 64,
                      'trainingLedgerSha256': '5' * 64, 'tokenizerSha256': '6' * 64}
        self.selection = {**provenance, 'version': 1, 'procedureSha256': replay.hash_file(procedure), 'selected': None,
                          'status': 'fallback-no-native-and-byte-qualified-candidate',
                          'validationBrowser': 'unavailable', 'finalReplayStatus': 'unqualified', 'validationCases': 300,
                          'variants': [{'precision': precision, 'eligible': False, 'contextSplit': 'validation',
                                        'rejectionReasons': ['native-or-layout-parity'],
                                        'checkpointSha256': provenance['checkpointSha256'],
                                        'trainingDataSha256': provenance['preparedManifestSha256'],
                                        'dataSha256': provenance['preparedManifestSha256'],
                                        'caseDataSha256': provenance['sharedHeldoutManifestSha256'],
                                        'casesSha256': provenance['validationCasesSha256']}
                                       for precision in replay.PRIMARY_PRECISIONS]}

    def record(self, name, data):
        path = self.root / name
        path.write_text(json.dumps(data))
        return {'path': str(path), 'sha256': replay.hash_file(path)}

    def test_rejects_models_and_changed_pinned_receipt(self):
        receipt = self.record('selection.json', self.selection)
        config = {'assets': {}, 'neuralFallbackSelection': receipt}
        outcome = replay.checked_fallback(config)
        self.assertEqual(outcome['reason'], self.selection['status'])
        self.assertEqual(outcome['weightContrasts'], 'unavailable')
        self.assertEqual(outcome['selectionProvenance']['checkpointSha256'], self.selection['checkpointSha256'])
        self.assertEqual(replay.FALLBACK_ARMS, ('corrected-v1', 'expanded-kn', 'tutor', 'personal'))
        with self.assertRaisesRegex(ValueError, 'cannot install neural artifacts'):
            replay.checked_fallback({**config, 'assets': {'neural-v2': '/unused'}})
        non_candidate = self.selection['variants'][0]
        non_candidate['eligible'] = True
        with self.assertRaisesRegex(ValueError, 'Invalid pre-test no-candidate'):
            replay.checked_fallback({**config, 'neuralFallbackSelection': self.record('rejected-selection.json', self.selection)})
        Path(receipt['path']).write_text('{}')
        with self.assertRaisesRegex(ValueError, 'evidence changed'):
            replay.checked_fallback(config)

    def test_selected_candidate_requires_its_validation_failure(self):
        fingerprint = ':'.join(digit * 64 for digit in '1234')
        winner = self.selection['variants'][0]
        winner.update(eligible=True, modelFingerprint=fingerprint)
        selection = self.record('selection.json', {**self.selection, 'status': 'selected-for-validation-browser',
                                'selected': {'modelFingerprint': fingerprint, 'precision': winner['precision']}, 'validationBrowser': 'pending'})
        evidence = self.record('browser-evidence.json', {'cause': 'fixture no supported adapter'})
        decision = {'version': 1, 'contextSplit': 'validation', 'selectionSha256': selection['sha256'],
                    'modelFingerprint': fingerprint, 'status': 'unavailable', 'evidenceSha256': evidence['sha256']}
        config = {'assets': {}, 'neuralFallbackSelection': selection,
                  'neuralFallbackValidation': {**self.record('validation.json', decision), 'evidence': evidence['path']}}
        self.assertEqual(replay.checked_fallback(config)['reason'], 'validation-browser-unavailable')
        for changes in ({'contextSplit': 'test'}, {'status': 'passed'}, {'modelFingerprint': 'other'}):
            with self.subTest(changes=changes):
                config['neuralFallbackValidation'].update(self.record('validation.json', {**decision, **changes}))
                with self.assertRaisesRegex(ValueError, 'does not match'):
                    replay.checked_fallback(config)

    def test_observation_guard_rejects_a_neural_slate_or_ghost(self):
        audit = {'graphTrial': False, 'strictGraphTrial': False, 'ghostCalibration': False,
                 'assetCounts': {'neural': 0}, 'neuralResults': {'observedFingerprints': [], 'admissions': [],
                   'deliveredOnTimeScoredReplies': 0, 'deliveredOnTimeContinuationReplies': 0, 'lateReplies': 0}}
        self.record('tutor.assets.json', audit)
        impressions = self.root / 'tutor.impressions.jsonl'
        coverage = self.root / 'tutor.neural-coverage.jsonl'
        coverage.write_text('')
        stable = {'ghostEligible': False, 'assets': {}}
        impressions.write_text(json.dumps(stable))
        replay.assert_fallback_observations(self.root / 'tutor')
        for changed in ({'assets': {'neural': 'model'}}, {'ghostEligible': True}, {'ghost': {'text': 'offer'}}):
            impressions.write_text(json.dumps({**stable, **changed}))
            with self.assertRaisesRegex(ValueError, 'unexpectedly observed'):
                replay.assert_fallback_observations(self.root / 'tutor')
        impressions.write_text(json.dumps(stable))
        audit['neuralResults']['lateReplies'] = 1
        self.record('tutor.assets.json', audit)
        with self.assertRaisesRegex(ValueError, 'unexpectedly observed'):
            replay.assert_fallback_observations(self.root / 'tutor')
        audit['neuralResults']['lateReplies'] = 0
        self.record('tutor.assets.json', audit)
        coverage.write_text(json.dumps({'late': True, 'provider': 'wasm', 'attempted': 1}))
        with self.assertRaisesRegex(ValueError, 'unexpectedly observed'):
            replay.assert_fallback_observations(self.root / 'tutor')


if __name__ == '__main__':
    unittest.main()
