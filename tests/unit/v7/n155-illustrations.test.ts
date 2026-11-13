import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

// N155 · v7 UX audit r3, P2 and P3 (Owner decision E19): Round complete's own ∎ still and ending (IL6), and the rules for
// the set: live area (IL3, checked in the browser by tests/e2e/v7-n155-illustrations.spec.ts), accents (IL4), first
// viewport (IL5, also in the browser) and two sizes (IL7).
const source = readFileSync('src/ui/v7/Illustration.tsx', 'utf8');
const art = Object.fromEntries([...source.matchAll(/^ {2}(\w+): `([\s\S]*?)`,$/gm)].map(match => [match[1], match[2]]));
const css = readFileSync('src/ui/v7/illustration.css', 'utf8');
function files(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, found);
    else if (path.endsWith('.tsx')) found.push(path);
  }
  return found;
}

describe('IL6 · ✓ means nothing is waiting, ∎ means you finished something', () => {
  it('Round complete has its own still: Review\'s cards with a ∎ badge instead of a tick', () => {
    expect(art.round).toBeDefined();
    expect(art.round).toContain('<rect class="w" x="151" y="111" width="6" height="6" rx="1"/>');
    expect(art.round).not.toContain('l4 4 8-8');
    expect(art.round.replace(/<rect class="w"[^>]*>/, '')).toBe(art.review.replace(/<path class="w"[^>]*>/, ''));
    expect(css).toContain('.v7-il rect.w {fill:var(--v7-role-surface-page);}');
  });
  it('the review round ends on it, and its animation draws a ∎ on the same frame, in the same place', () => {
    expect(readFileSync('src/features/review-done/v7/RoundCompleteV7.tsx', 'utf8')).toContain('<LottieMoment name="round" animation="round-complete" width={160}');
    const data = JSON.parse(readFileSync('src/ui/v7/lottie/round-complete.json', 'utf8')) as {layers: {nm: string; shapes: unknown[]}[]};
    const badge = JSON.stringify(data.layers.find(layer => layer.nm === 'badge')!.shapes);
    // The ∎: one straight stroke as wide as the square (9 units), with square ends, centred where the still's ∎ is.
    expect(badge).toContain('"v":[[149.5,114],[158.5,114]]');
    expect(badge).toMatch(/"w":\{"a":0,"k":9\},"lc":1/);
    expect(badge).not.toContain('[148,114],[152,118],[160,110]');
  });
});

describe('IL4 · accents', () => {
  it('a badge is always the brand indigo; the subject colour stays on the object', () => {
    for (const name of ['calendar', 'review', 'inbox', 'tasks', 'round']) {
      expect(art[name].match(/<circle class="f" data-badge="" [^>]*r="13"/g), name).toHaveLength(1);
      expect(art[name], name).not.toMatch(/<circle class="f" cx/);
    }
    expect(css).toContain('.v7-il [data-badge] {fill:var(--v7-role-selection-fg);}');
  });
  it('by day, topology and number theory take 20% ink so they clear 3 : 1 on the disc', () => {
    expect(css).toMatch(/:where\(html\[data-v7\]:not\(\[data-theme="graph-night"\]\)\) :is\(\.v7-subject-3,\.v7-subject-4\) \.v7-il,/);
    expect(css).toContain('--v7-il-accent:color-mix(in srgb,var(--v7-subject) 80%,var(--v7-role-text-primary));');
  });
});

describe('IL7 · two sizes', () => {
  it('every drawing is 160 px (a page\'s only empty state) or 120 px (inline); the defaults are 160', () => {
    const widths: string[] = [];
    for (const path of files('src/features')) {
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(/<(?:Illustration|LottieMoment)\b[^>]*?\bwidth=\{(\d+)\}/g)) widths.push(path + ' ' + match[1]);
    }
    expect(widths.length).toBeGreaterThan(3);
    for (const entry of widths) expect(['120', '160'], entry).toContain(entry.split(' ').at(-1));
    expect(source).toContain('export function Illustration({name, width = 160, className}');
    expect(readFileSync('src/ui/v7/LottieMoment.tsx', 'utf8')).toContain("width = 160, className, feel = false");
    expect(readFileSync('src/ui/v7/EmptyMoment.tsx', 'utf8')).toMatch(/<Illustration name=\{art\} className="v7-empty-art"\/>/);
  });
});

describe('IL5 · empty states in the first viewport', () => {
  it('Progress shows one empty state in place of the hero, the chart and the stats when nothing was studied', () => {
    const progress = readFileSync('src/features/insights/v7/ProgressV7.tsx', 'utf8');
    expect(progress).toContain("tab==='overview'&&total<=0&&<>{nothing}");
    expect(progress).toContain("tab==='overview'&&total>0&&<>");
    expect(progress).toContain('{total<=0?nothing:<>{hero}');
    expect(progress).toContain('<Illustration name="progress" width={160} className="v7-progress-art"/>');
  });
  it('Calendar Day lays its empty state over the grid, and taps pass through to the grid', () => {
    expect(readFileSync('src/features/calendar/v7/V7CalendarDay.tsx', 'utf8')).toContain('<div className="v7-cal-day-stack">');
    expect(readFileSync('src/features/calendar/v7/calendar.css', 'utf8')).toContain('.v7-cal-day-stack > .v7-cal-empty-state {position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);padding:0;pointer-events:none;}');
  });
});
