// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {LAYOUTS, MARK_THEMES, contrast, markSvg, rasterMark, strokes, ellPolygons, polygonCoverage} from '../../../scripts/brand/lemma-mark.mjs';

/** Release plan R2 §1 (app icon, D3 = C · Notebook): the rules every generated size must keep. */
describe('Notebook app mark', () => {
  it('keeps the ℓ at 7:1 or more on its paper in Day and Night', () => {
    for (const t of Object.values(MARK_THEMES)) expect(contrast(t.ink, t.page)).toBeGreaterThanOrEqual(7);
  });

  it('never draws the grid thinner than 1 px or the margin rule thinner than 1.5 px', () => {
    for (const size of [16, 32, 64, 180, 192, 512, 1024]) {
      const w = strokes(size, size < 64 ? 'simple' : 'full');
      expect(w.grid * size).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(w.margin * size).toBeGreaterThanOrEqual(1.5 - 1e-9);
    }
  });

  it('keeps the ℓ and the ∎ inside the maskable safe zone (central 80% circle)', () => {
    for (const polygon of ellPolygons('full')) for (const [x, y] of polygon) expect(Math.hypot(x - 0.5, y - 0.5)).toBeLessThan(0.4);
    const [x, y, q] = LAYOUTS.full.qed!;
    for (const [cx, cy] of [[x, y], [x + q, y], [x, y + q], [x + q, y + q]]) expect(Math.hypot(cx - 0.5, cy - 0.5)).toBeLessThan(0.4);
  });

  it('centres the ℓ optically on the page', () => {
    for (const layout of ['full', 'simple'] as const) {
      const size = 128, cov = polygonCoverage(ellPolygons(layout), size);
      let sy = 0, n = 0, minX = size, maxX = 0;
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const c = cov[j * size + i];
        if (c > 0.5) { minX = Math.min(minX, i); maxX = Math.max(maxX, i); }
        sy += c * j; n += c;
      }
      expect(Math.abs((minX + maxX) / 2 / size - 0.5)).toBeLessThan(0.03);
      expect(Math.abs(sy / n / size - 0.5)).toBeLessThan(0.08);
    }
  });

  it('draws graph paper: the installed icon is paper-coloured with grid lines, a margin rule, the ℓ and the ∎', () => {
    const size = 512, px = rasterMark({size, theme: 'day', layout: 'full'});
    const at = (x: number, y: number) => Array.from(px.slice((Math.round(y * size) * size + Math.round(x * size)) * 4, (Math.round(y * size) * size + Math.round(x * size)) * 4 + 3));
    const page = [0xF8, 0xF5, 0xF0], dist = (a: number[], b: number[]) => a.reduce((s, v, k) => s + Math.abs(v - b[k]), 0);
    expect(dist(at(0.03, 0.03), page)).toBeLessThan(8);
    expect(dist(at(LAYOUTS.full.margin!, 0.1), page)).toBeGreaterThan(30);
    const [qx, qy, q] = LAYOUTS.full.qed!;
    expect(dist(at(qx + q / 2, qy + q / 2), [0x42, 0x46, 0xC2])).toBeLessThan(6);
  });

  it('writes a favicon that follows the device theme: ℓ on graph paper, no margin rule, ∎, gradient or text', () => {
    const svg = markSvg({theme: 'auto', layout: 'simple', background: 'rounded', size: 32});
    expect(svg).toContain('@media (prefers-color-scheme: dark)');
    expect(svg).toContain(MARK_THEMES.day.page);
    expect(svg).toContain(MARK_THEMES.night.page);
    expect(svg).not.toMatch(/class="m"|<rect class="bf"|Gradient|<text/);
    expect(markSvg({theme: 'day'})).not.toMatch(/Gradient|<text/);
  });

  it('is deterministic', () => {
    expect(Buffer.from(rasterMark({size: 48})).equals(Buffer.from(rasterMark({size: 48})))).toBe(true);
  });
});
