import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('FIX #636b bounded MCP selftest partitions', () => {
  const source = read('supabase/functions/mcp/selftest.ts');
  const route = read('supabase/functions/mcp/index.ts');
  const smoke = read('tests/mcp/smoke.mjs');

  const group = (part: 1 | 2 | 3 | 4) =>
    Array.from(
      source.matchAll(new RegExp(`if\\(only\\(${part}\\)\\)await check\\('([^']+)'`, 'g')),
      match => match[1],
    );
  const all = Array.from(source.matchAll(/await check\('([^']+)'/g), match => match[1]);

  it('retains all nineteen unique checks and splits both long halves', () => {
    const first = group(1);
    const second = group(2);
    const third = group(3);
    const fourth = group(4);
    const assigned = [...first, ...second, ...third, ...fourth];
    const common = all.filter(name => !assigned.includes(name));

    expect(all).toHaveLength(19);
    expect(new Set(all).size).toBe(19);
    expect(common).toEqual([
      'MCP tool list and size',
      'fixtures',
      'plan proposal and approval',
    ]);
    expect(first).toEqual([
      'planning resume',
      'planning metadata, ETA and undo',
      'study resume bounds',
    ]);
    expect(second).toEqual([
      'session reuse',
      'progress and misconception',
      'PDF reads and search',
      'card proposals and direct card',
      'end session',
      'create, list and decide',
    ]);
    expect(third).toEqual([
      'scan transcription: search, readback, provenance and undo',
      'prompt history undo and redo',
      'repeated new concept references and undo',
    ]);
    expect(fourth).toEqual([
      'direct edits add review grade',
      'adaptive planning diagnostics',
      'idea relationship duplicates, conflicts and undo',
      'delete preview cascade and undo',
    ]);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([common.length + first.length, common.length + second.length, common.length + third.length, common.length + fourth.length])
      .toEqual([6, 9, 6, 7]);
  });

  it('routes all four independent requests and retains full cleanup', () => {
    expect(source).toContain("export type SelftestPart=1|2|3|4|'all'");
    expect(source).toContain('PART_STEPS={1:6,2:9,3:6,4:7,all:19}');
    expect(source).toContain("const only=(n:1|2|3|4)=>part==='all'||part===n");
    expect(source).toContain("console.info('[lemma selftest] START cleanup')");
    expect(source).toContain("await sweepStaleFixtures(c)");
    expect(route).toContain("q==='3'?3:q==='4'?4:'all'");
    expect(smoke).toMatch(/for\(const part of \[1,2,3,4\]\)/);
    expect(smoke).toContain('AbortSignal.timeout(140_000)');
  });
});
