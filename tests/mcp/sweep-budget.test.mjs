import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../supabase/functions/mcp/selftest.ts', import.meta.url), 'utf8');

describe('selftest stale-fixture preflight is bounded', () => {
  it('caps project and subject scans before any selftest step', () => {
    expect(source).toMatch(/const MAX_STALE_SWEEP_ROWS\s*=\s*4\b/);
    const sweep = source.slice(source.indexOf('async function sweepStaleFixtures'));
    expect(sweep).toContain(".order('created_at',{ascending:true}).limit(MAX_STALE_SWEEP_ROWS)");
    expect(sweep.match(/\.limit\(MAX_STALE_SWEEP_ROWS\)/g)).toHaveLength(2);
  });

  it('retains owner, system and exact selftest-name guards for deletion', () => {
    const sweep = source.slice(source.indexOf('async function sweepStaleFixtures'));
    expect(sweep).toContain(".eq('user_id',c.userId).eq('system',true)");
    expect(sweep).toContain('FIXTURE_PROJECT.test(row.slug)');
    expect(sweep).toContain('FIXTURE_SUBJECT.test(row.name)');
    expect(sweep).toContain(".lt('created_at',before)");
  });
});
