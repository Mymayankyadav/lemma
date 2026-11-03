import {execFileSync} from 'node:child_process';
import {expect, it} from 'vitest';

it('passes control, claim, admission and independent-release adversarial scenarios', () => {
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/agents/protocol.test.mjs'], {encoding:'utf8'});
  expect(output).toContain('# fail 0');
});
