import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
// @ts-expect-error plain ESM build scripts without type declarations
import {MARK_THEMES, contrast, rasterMark} from '../../../scripts/brand/lemma-mark.mjs';
// @ts-expect-error plain ESM build scripts without type declarations
import {ANDROID_COLOURS, colorsXml, readTokens} from '../../../scripts/brand/android-colors.mjs';
// @ts-expect-error plain ESM build scripts without type declarations
import {expectedOutputs, lintAssets, pngSize} from '../../../scripts/brand/asset-lint.mjs';
import {emblemStrokes} from '../../../src/ui/v7/emblem';
import {Emblem} from '../../../src/ui/v7/Emblem';
import {emblemStrokeOrder, emblemSvg, emblemViewBox, pathLength} from '../../../src/ui/v7/emblemExport';

// N137 · G1 the asset pipeline (v7 UX plan r3, `04` §3): Android colours from the tokens, the adaptive icon in two
// layers, the emblem exporter, and the manifest-driven asset lint.
type Manifest = {checks: {markContrast: {ellOnPage: number; qedOnPage: number}}; assets: {path: string; generated: string; budget: number; size: number[] | null; generator: string}[]};
const manifest = JSON.parse(readFileSync('assets.manifest.json', 'utf8')) as Manifest;
const committed = {...manifest, assets: manifest.assets.filter(entry => entry.generated === 'committed')};

describe('G1 Android colours come from the design tokens', () => {
  it('each colour is the token it names, in Day and Night', () => {
    const tokens = readTokens();
    for (const mode of ['day', 'night'] as const) {
      const xml = colorsXml(tokens, mode);
      for (const [name, key] of ANDROID_COLOURS[mode] as [string, string][])
        expect(xml).toContain(`<color name="${name}">${tokens.raw[mode][key].$value.toUpperCase()}</color>`);
    }
  });
  it('the committed colors.xml files are exactly what the generator writes', () => {
    const tokens = readTokens();
    expect(readFileSync('android/app/src/main/res/values/colors.xml', 'utf8')).toBe(colorsXml(tokens, 'day'));
    expect(readFileSync('android/app/src/main/res/values-night/colors.xml', 'utf8')).toBe(colorsXml(tokens, 'night'));
  });
  it('a token that is not a colour fails loudly', () => {
    const tokens = readTokens();
    expect(() => colorsXml({...tokens, raw: {...tokens.raw, day: {...tokens.raw.day, 'surface.page': {$value: 'paper'}}}}, 'day')).toThrow(/surface\.page/);
  });
});

describe('G1 the adaptive icon in two layers', () => {
  const size = 144;
  const full = rasterMark({size, theme: 'day', layout: 'full'});
  const background = rasterMark({size, theme: 'day', layout: 'full', parts: {ell: false, qed: false}});
  const foreground = rasterMark({size, theme: 'day', layout: 'full', parts: {page: false, grid: false, margin: false}});
  it('composed, the background and foreground are the same picture as the whole mark', () => {
    let worst = 0;
    for (let k = 0; k < size * size; k++) {
      const a = foreground[k * 4 + 3] / 255;
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(foreground[k * 4 + c] * a + background[k * 4 + c] * (1 - a) - full[k * 4 + c]));
    }
    expect(worst).toBeLessThanOrEqual(2);
  });
  it('the foreground holds only the ℓ and ∎: its corners (paper, grid, margin) are transparent', () => {
    for (const [x, y] of [[2, 2], [size - 3, 2], [2, size - 3], [Math.round(size * 0.215), 5]]) expect(foreground[(y * size + x) * 4 + 3]).toBe(0);
    expect(Math.max(...Array.from({length: size * size}, (_, k) => foreground[k * 4 + 3]))).toBe(255);
  });
  it('the background is opaque paper with the grid, and no ℓ', () => {
    for (let k = 0; k < size * size; k++) expect(background[k * 4 + 3]).toBe(255);
    const centre = (Math.round(size * 0.49) * size + Math.round(size * 0.5)) * 4;
    const ink = MARK_THEMES.day.ink.slice(1).match(/../g)!.map((h: string) => parseInt(h, 16));
    expect(Math.abs(background[centre] - ink[0])).toBeGreaterThan(60);
  });
  it('the launcher uses the background layer, and the themed icon stays the ℓ alone (∎ waits for E23)', () => {
    for (const file of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const xml = readFileSync('android/app/src/main/res/mipmap-anydpi-v26/' + file, 'utf8');
      expect(xml).toContain('<background android:drawable="@mipmap/ic_launcher_background"/>');
      expect(xml).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground"/>');
    }
    expect(readFileSync('android/app/src/main/res/drawable/ic_launcher_monochrome.xml', 'utf8').match(/<path /g)).toHaveLength(1);
  });
});

describe('G1 the emblem exporter', () => {
  it('measures path lengths for every command the generator writes', () => {
    expect(pathLength('M0 0L3 4')).toBe(5);
    expect(pathLength('M0 0h10v10z')).toBeCloseTo(20 + Math.SQRT2 * 10);
    expect(pathLength('M100 0a100 100 0 0 1 0 200a100 100 0 0 1 0 -200')).toBeCloseTo(2 * Math.PI * 100, 0);
    expect(() => pathLength('M0 0C1 1 2 2 3 3')).toThrow(/unsupported/);
  });
  it('the SVG has the component’s geometry: same strokes, same frame', () => {
    for (const [subject, size] of [['Analysis', 160], ['Topology', 64], ['Algebra', 20]] as const) {
      const svg = emblemSvg({subject, seed: 'path-' + subject, size});
      const component = renderToStaticMarkup(<Emblem subject={subject} seed={'path-' + subject} size={size} animate={false}/>);
      const ds = (html: string) => [...html.matchAll(/ d="([^"]+)"/g)].map(match => match[1]);
      expect(ds(svg)).toEqual(ds(component));
      expect(svg).toContain(`viewBox="${emblemViewBox(size >= 160 ? 'hero' : size >= 40 ? 'tile' : 'glyph')}"`);
    }
  });
  it('stroke order keeps the generator’s order, times strokes by length and ends at 1', () => {
    const order = emblemStrokeOrder({subject: 'Geometry', seed: 'euclid-1', size: 160});
    const strokes = emblemStrokes('Geometry', 'euclid-1', undefined, 'hero');
    expect(order.map(stroke => stroke.d)).toEqual(strokes.map(stroke => stroke.d));
    expect(order[0].start).toBe(0);
    expect(order.at(-1)!.end).toBe(1);
    for (let i = 1; i < order.length; i++) {expect(order[i].start).toBeCloseTo(order[i - 1].end, 3); expect(order[i].length).toBeGreaterThan(0);}
  });
});

describe('G1 the asset lint', () => {
  it('every committed generated asset in the repository passes', () => {
    expect(lintAssets(committed)).toEqual([]);
  });
  it('every file a committed generator writes is listed in the manifest', () => {
    const listed = new Set(manifest.assets.map(entry => entry.path));
    for (const path of (expectedOutputs() as Map<string, Buffer>).keys()) expect(listed.has(path)).toBe(true);
  });
  it('reports a missing file, a wrong size, a blown budget and drift from the generator', () => {
    const png = (w: number, h: number) => {const b = Buffer.alloc(32); Buffer.from('89504e470d0a1a0a', 'hex').copy(b); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b;};
    const fake: Manifest = {checks: manifest.checks, assets: [
      {path: 'a.png', generated: 'build', budget: 100, size: [96, 96], generator: 'gen'},
      {path: 'b.png', generated: 'build', budget: 100, size: [96, 96], generator: 'gen'},
      {path: 'c.png', generated: 'build', budget: 10, size: null, generator: 'gen'},
      {path: 'd.xml', generated: 'committed', budget: 100, size: null, generator: 'gen'},
    ]};
    const files: Record<string, Buffer> = {'b.png': png(48, 48), 'c.png': Buffer.alloc(64), 'd.xml': Buffer.from('old')};
    const problems = lintAssets(fake, {read: (path: string) => files[path] ?? null, expected: new Map([['d.xml', Buffer.from('new')]])}) as string[];
    expect(problems).toEqual([
      'a.png: missing (run gen)',
      'b.png: 48×48, expected 96×96',
      'c.png: 64 bytes, over its 10-byte budget',
      'd.xml: differs from what gen writes; run it and commit the result',
    ]);
    expect(pngSize(png(512, 256))).toEqual([512, 256]);
  });
  it('holds the mark to its contrast floors in Day and Night', () => {
    for (const colours of Object.values(MARK_THEMES) as {page: string; ink: string; brand: string}[]) {
      expect(contrast(colours.ink, colours.page)).toBeGreaterThanOrEqual(manifest.checks.markContrast.ellOnPage);
      expect(contrast(colours.brand, colours.page)).toBeGreaterThanOrEqual(manifest.checks.markContrast.qedOnPage);
    }
  });
  it('runs after every build', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts.postbuild).toContain('scripts/brand/asset-lint.mjs');
  });
});
