// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {MARK_THEMES, contrast, markSvg, rasterMark, strokes, ellPolygons, polygonCoverage} from '../../../scripts/brand/lemma-mark.mjs';

/** Release plan R2 §1 (app icon, Compass): the rules every generated size must keep. */
describe('Compass app mark', () => {
  it('keeps the ℓ at 7:1 or more on its page in Day and Night', () => {
    for (const t of Object.values(MARK_THEMES)) expect(contrast(t.ink, t.page)).toBeGreaterThanOrEqual(7);
  });

  it('never draws the circle thinner than 1.5 px, down to 16 px', () => {
    for (const size of [16, 32, 64, 180, 192, 512, 1024]) {
      const layout = size < 64 ? 'simple' : 'full';
      expect(strokes(size, layout).ring * size).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('keeps all meaningful art inside the maskable safe zone (central 80% circle)', () => {
    const size = 256, pixels = rasterMark({size, theme: 'night', layout: 'full'});
    const page = [9, 16, 35];
    let outside = 0;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const o = (j * size + i) * 4, d = Math.hypot(i + 0.5 - size / 2, j + 0.5 - size / 2) / size;
      const differs = Math.abs(pixels[o] - page[0]) + Math.abs(pixels[o + 1] - page[1]) + Math.abs(pixels[o + 2] - page[2]) > 6;
      if (differs && d > 0.4) outside++;
    }
    expect(outside).toBe(0);
  });

  it('centres the ℓ optically on the circle', () => {
    for (const layout of ['full', 'simple'] as const) {
      const size = 128, cov = polygonCoverage(ellPolygons(layout), size);
      let sx = 0, sy = 0, n = 0, minX = size, maxX = 0;
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const c = cov[j * size + i];
        if (c > 0.5) { minX = Math.min(minX, i); maxX = Math.max(maxX, i); }
        sx += c * i; sy += c * j; n += c;
      }
      expect(n).toBeGreaterThan(0);
      expect(Math.abs((minX + maxX) / 2 / size - 0.5)).toBeLessThan(0.03);
      expect(Math.abs(sy / n / size - 0.5)).toBeLessThan(0.08);
    }
  });

  it('writes a favicon that follows the device theme, ℓ and circle only, without gradients or text', () => {
    const svg = markSvg({theme: 'auto', layout: 'simple', background: 'disc', size: 32});
    expect(svg).toContain('@media (prefers-color-scheme: dark)');
    expect(svg).toContain(MARK_THEMES.day.page);
    expect(svg).toContain(MARK_THEMES.night.page);
    expect(svg).not.toMatch(/<line|stroke-dasharray|Gradient|<text/);
    expect(markSvg({theme: 'night'})).not.toMatch(/Gradient|<text/);
  });

  it('is deterministic', () => {
    expect(Buffer.from(rasterMark({size: 48})).equals(Buffer.from(rasterMark({size: 48})))).toBe(true);
  });
});
