/**
 * N248 · Generates src/features/pad/latentInk/symbolGrids.json: every catalogue symbol as an n × n occupancy grid,
 * the smallest n at which different-looking glyphs never share a grid, and which symbols can be extended into which.
 *
 *   npx tsx scripts/latent-ink-grids.ts
 *
 * Glyphs are drawn by the pre-installed Chromium with the app's own KaTeX fonts (FreeSerif and DejaVu Sans for
 * the few code points KaTeX's fonts lack), centred on their ink horizontally and on the baseline vertically.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {SYMBOL_CATALOG, TUTOR_SYMBOL_CATALOG_VERSION} from '../src/features/tutor/input/symbolCatalog';
import {
  aliasGroups, collisionsAt, extensionTable, MINIMUM_PART_SHARE, gridKey, occupancyGrid, smallestInjectiveN, type GlyphBitmap, type Grid,
} from '../src/features/pad/latentInk/symbolGrid';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright') as typeof import('playwright');
const SIZE = 96;
const fontsDir = fileURLToPath(new URL('../node_modules/katex/dist/fonts/', import.meta.url));
const font = (family: string, file: string) =>
  `@font-face{font-family:${family};src:url(data:font/woff2;base64,${readFileSync(fontsDir + file).toString('base64')}) format('woff2')}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(`<style>${font('KMain', 'KaTeX_Main-Regular.woff2')}${font('KAMS', 'KaTeX_AMS-Regular.woff2')}
    ${font('KMath', 'KaTeX_Math-Italic.woff2')}${font('KSize1', 'KaTeX_Size1-Regular.woff2')}</style>
    <span style="font-family:KMain">a</span><span style="font-family:KAMS">a</span><span style="font-family:KMath">a</span>`);
  await page.evaluate(() => document.fonts.ready);
  const glyphs = SYMBOL_CATALOG.map(({id, glyph}) => ({id, glyph}));
  const bitmaps = await page.evaluate(({glyphs, size}) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * 3;
    const context = canvas.getContext('2d', {willReadFrequently: true})!;
    const em = size / 1.25;
    return glyphs.map(({id, glyph}) => {
      context.resetTransform();
      context.fillStyle = 'black';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'white';
      context.font = `${em}px KMain, KAMS, KMath, FreeSerif, 'DejaVu Sans', serif`;
      context.textBaseline = 'alphabetic';
      const metrics = context.measureText(glyph);
      const inkCentre = (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2;
      // The em box: 1.25 em tall, from 0.95 em above the baseline to 0.3 em below; centred on the ink.
      context.fillText(glyph, size * 1.5 - inkCentre, size + .95 * em);
      const data = context.getImageData(size, size, size, size).data;
      const bitmap: number[] = [];
      for (let index = 0; index < size * size; index++) bitmap.push(data[index * 4]);
      return {id, bitmap};
    });
  }, {glyphs, size: SIZE});
  const drawn: GlyphBitmap[] = bitmaps.filter(({bitmap}) => bitmap.some(value => value > 0));
  const blank = bitmaps.filter(({bitmap}) => !bitmap.some(value => value > 0)).map(({id}) => id);
  const n = smallestInjectiveN(drawn, SIZE);
  if (!n) throw new Error('No grid size up to 24 separates every glyph');
  const grids: Record<string, Grid> = Object.fromEntries(drawn.map(({id, bitmap}) => [id, occupancyGrid(bitmap, SIZE, n)]));
  const output = {
    version: 'lemma-latent-ink-grids-v1',
    catalogueVersion: TUTOR_SYMBOL_CATALOG_VERSION,
    bitmapSize: SIZE,
    n,
    collisionsBelow: collisionsAt(drawn, SIZE, n - 1).map(({ids}) => ids),
    aliases: aliasGroups(drawn).filter(group => group.length > 1),
    blank,
    grids: Object.fromEntries(Object.entries(grids).map(([id, grid]) => [id, gridKey(grid)])),
    minimumPartShare: MINIMUM_PART_SHARE,
    extends: extensionTable(grids),
  };
  writeFileSync(new URL('../src/features/pad/latentInk/symbolGrids.json', import.meta.url), JSON.stringify(output, null, 1) + '\n');
  console.log(`n = ${n}; ${drawn.length} glyphs, ${blank.length} blank; ${Object.keys(output.extends).length} extendable`);
} finally {
  await browser.close();
}
