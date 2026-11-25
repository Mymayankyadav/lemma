"""Check that matched neural controls cannot substitute a deployment quantization."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from run_frozen_replay import hash_file, verify_control


class FrozenReplayControlTests(unittest.TestCase):
    def test_non_int8_metrics_cannot_enter_even_an_unavailable_control(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            checkpoint = '1' * 64
            prepared_sha = '2' * 64
            heldout = '3' * 64
            metrics = {'precision': 'int8-weight-only', 'checkpointSha256': checkpoint, 'trainingDataSha256': prepared_sha,
                       'dataSha256': prepared_sha, 'caseDataSha256': heldout, 'casesSha256': '4' * 64,
                       'layouts': {'prose': {'contexts': 150}, 'roles': {'contexts': 150}},
                       'contextSplit': 'validation', 'exportParityPassed': False}
            ledger_path = root / 'ledger.json'
            ledger_path.write_text(json.dumps({'checkpointFiles': {'tokens-100000000.pt': {'sha256': checkpoint}},
                                               'checkpoint': {'tokens': 100_000_000}, 'requestedTargets': 100_000_000,
                                               'milestoneValidation': {'tokens-100000000': {'tokens': 100_000_000}},
                                               'candidate': 'primary', 'stopReason': 'target-exposure'}))
            metrics_path = root / 'metrics.json'
            bundle = root / 'bundle'

            def verify():
                metrics_path.write_text(json.dumps(metrics))
                spec = {'validationMetrics': str(metrics_path), 'validationMetricsSha256': hash_file(metrics_path),
                        'trainingLedger': str(ledger_path), 'trainingLedgerSha256': hash_file(ledger_path),
                        'providerStatus': 'COMPLETE'}
                prepared = {'preparedManifestSha256': {'prepared-dev': prepared_sha}}
                return verify_control('dev-100m', spec, prepared, heldout, bundle, None)

            evidence, accepted_checkpoint = verify()
            self.assertEqual(evidence['status'], 'unavailable-native-parity')
            self.assertIsNone(accepted_checkpoint)
            for precision in ('int4', 'int4-int8-head'):
                metrics['precision'] = precision
                for parity in (False, True):
                    metrics['exportParityPassed'] = parity
                    with self.subTest(precision=precision, parity=parity):
                        with self.assertRaisesRegex(ValueError, 'requires int8-weight-only'):
                            verify()
            self.assertFalse(bundle.exists())


if __name__ == '__main__':
    unittest.main()
