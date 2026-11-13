import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {FLAG_DEFAULTS} from '../../../src/flags';
import {PLOT_MAX, PLOT_MIN, plotWidth} from '../../../src/ui/v7/Chart';

// N157 · v7 UX audit r3, U1 (large screens). The layouts themselves are measured in tests/e2e/v7-n157-u1.spec.ts.
const tokens = readFileSync('src/ui/v7/tokens.css', 'utf8');

describe('V23 · control heights follow the pointer, not the width', () => {
  it('40 px buttons and fields only for a fine pointer from 700 px; the width breakpoints keep the touch size', () => {
    expect(tokens).toContain('@media(min-width:700px) and (pointer:fine){[data-v7]{\n  --v7-button: 40px;\n  --v7-field: 40px;\n}}');
    for (const width of [700, 1100]) {
      const block = tokens.split(`@media(min-width:${width}px){[data-v7]{`)[1].split('}}')[0];
      expect(block, String(width)).not.toMatch(/--v7-(button|field):/);
    }
    expect(tokens).toMatch(/\[data-v7\] \{[^}]*--v7-button: 48px;/);
  });
});

describe('V08 · charts drawn at their measured width', () => {
  it('the drawing width is the measured width, kept between 280 and 640; 360 until measured', () => {
    expect([PLOT_MIN, PLOT_MAX]).toEqual([280, 640]);
    expect(plotWidth(0)).toBe(360);
    expect(plotWidth(200)).toBe(280);
    expect(plotWidth(458.4)).toBe(458);
    expect(plotWidth(1200)).toBe(640);
    expect(readFileSync('src/ui/v7/chart.css', 'utf8')).toContain(':where(html[data-v7]) svg.v7-plot {max-width:640px;}');
  });
});

describe('V09 · the reading measure', () => {
  it('is 34 em, and every block of prose or mathematics keeps to it', () => {
    expect(tokens).toContain('--v7-reading: 34em;');
    expect(readFileSync('src/ui/v7/kit-system.css', 'utf8')).toContain(':where(html[data-v7] main .lemma-math) {max-width:var(--v7-reading);}');
  });
  it('the spread and the margin are flags, off by default', () => {
    expect(FLAG_DEFAULTS.v7Spread).toBe(false);
    expect(FLAG_DEFAULTS.v7Margin).toBe(false);
    expect(readFileSync('src/features/review-run/v7/review.css', 'utf8')).toContain('@media (min-width:840px), (horizontal-viewport-segments:2)');
  });
});

describe('S11 · the margin key', () => {
  it('M toggles the margin, but not while typing or with a modifier', async () => {
    const {isMarginKey} = await import('../../../src/app/v7/Margin');
    const target = (selector: string | null) => ({closest: (query: string) => selector && query.split(',').some(part => part.startsWith(selector)) ? {} : null}) as unknown as EventTarget;
    const key = (over: Partial<KeyboardEvent>) => ({key: 'm', altKey: false, ctrlKey: false, metaKey: false, target: target(null), ...over});
    expect(isMarginKey(key({}))).toBe(true);
    expect(isMarginKey(key({key: 'M'}))).toBe(true);
    expect(isMarginKey(key({key: 'n'}))).toBe(false);
    expect(isMarginKey(key({metaKey: true}))).toBe(false);
    expect(isMarginKey(key({target: target('input')}))).toBe(false);
    expect(isMarginKey(key({target: target('textarea')}))).toBe(false);
  });
});
