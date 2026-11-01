import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('FIX #636b bounded MCP selftest partitions', () => {
  const source = read('supabase/functions/mcp/selftest.ts');
  const route = read('supabase/functions/mcp/index.ts');
  const smoke = read('tests/mcp/smoke.mjs');

  const group = (part: 1 | 2 | 3) =>
    Array.from(
      source.matchAll(new RegExp(`if\\(only\\(${part}\\)\\)await check\\('([^']+)'`, 'g')),
      match => match[1],
    );
  const all = Array.from(source.matchAll(/await check\('([^']+)'/g), match => match[1]);

  it('retains all nineteen unique checks and splits the expensive second half', () => {
    const first = group(1);
    const second = group(2);
    const third = group(3);
    const assigned = [...first, ...second, ...third];
    const common = all.filter(name => !assigned.includes(name));

    expect(all).toHaveLength(19);
    expect(new Set(all).size).toBe(19);
    expect(common).toEqual([
      'MCP tool list and size',
      'fixtures',
      'plan proposal and approval',
    ]);
    expect(first).toHaveLength(9);
    expect(second).toHaveLength(5);
    expect(third).toEqual([
      'idea relationship duplicates, conflicts and undo',
      'delete preview cascade and undo',
    ]);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([common.length + first.length, common.length + second.length, common.length + third.length])
      .toEqual([12, 8, 5]);
  });

  it('routes all three independent requests and retains full cleanup', () => {
    expect(source).toContain("export type SelftestPart=1|2|3|'all'");
    expect(source).toContain('PART_STEPS={1:12,2:8,3:5,all:19}');
    expect(source).toContain("const only=(n:1|2|3)=>part==='all'||part===n");
    expect(source).toContain("console.info('[lemma selftest] START cleanup')");
    expect(source).toContain("await sweepStaleFixtures(c)");
    expect(route).toContain("q==='3'?3:'all'");
    expect(smoke).toMatch(/for\(const part of \[1,2,3\]\)/);
    expect(smoke).toContain('AbortSignal.timeout(140_000)');
  });
});
