import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const workflow=readFileSync('.github/workflows/ci.yml','utf8');

describe('AUDIT #540: cold 4x matrix and full sharded Playwright coexist',()=>{
 it('keeps all seven fail-closed base jobs and all eight independent cold CPU cells',()=>{
  for(const job of ['  check:','  e2e:','  qa3-screens:','  mcp-sql:','  cpu-matrix:','  cpu-aggregate:'])
   expect(workflow).toContain(job);
  expect(workflow).toContain('shard: [1, 2, 3, 4]');
  expect(workflow).toContain('profile: [stress, extreme]');
  expect(workflow).toContain('theme: [graph, graph-night]');
  expect(workflow).toContain('width: [360, 390]');
  expect(workflow).toContain('needs: [cpu-matrix]');
  expect(workflow).toContain('npx tsx scripts/qa3-cpu-report.ts');
 });
 it('runs cold 4x tests exactly in the dedicated matrix, never drops them',()=>{
  expect(workflow).toContain('npx playwright test tests/e2e/stress-cpu.spec.ts');
  expect(workflow).toContain('--grep "AUDIT #540 cold 4x');
  // Four regular shards cover every *other* Playwright test once; the
  // dedicated 2x2x2 matrix covers all 144 cold-route cases exactly once.
  expect(workflow).toContain('--shard=${{ matrix.shard }}/4');
  // A # inside a YAML plain scalar starts a comment, even when shell-quoted.
  // The folded block must preserve the full grep pattern in Actions.
  expect(workflow).toContain(`      - run: >-
          npm run e2e -- --shard=\${{ matrix.shard }}/4 --pass-with-no-tests
          --grep-invert 'AUDIT #540 cold 4x'`);
  expect(workflow).toContain('test "$count" -eq 18');
  expect(workflow).toContain('name: e2e-${{ matrix.shard }}-of-4');
  expect(workflow).toContain('needs: e2e');
 });
});
