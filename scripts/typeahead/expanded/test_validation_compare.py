import sys
import unittest
from unittest.mock import patch
import validation_compare


class ValidationCompareTests(unittest.TestCase):
    def test_refuses_reserved_split_before_reading_any_input(self):
        args = ['validation_compare.py', '--split', '/does-not-exist/final', '--allocation', '/does-not-exist/allocation',
                '--control-build', '/does-not-exist/control', '--control-config', '/does-not-exist/control-config',
                '--candidate-build', '/does-not-exist/candidate', '--candidate-config', '/does-not-exist/candidate-config',
                '--out', '/does-not-exist/out', '--model-sha', 'x', '--menu-trial', 'm2']
        with patch.object(sys, 'argv', args), self.assertRaisesRegex(ValueError, 'staged validation'):
            validation_compare.main()


if __name__ == '__main__':
    unittest.main()
