#!/usr/bin/env node
/**
 * N137 · G1 the emblem exporter from the command line (v7 UX plan r3, `04` §3.2 generator 2):
 *   npm run emblem -- --subject Analysis --seed real-analysis [--size 160] [--colour '#121B31'] [--out docs/brand/emblems]
 * writes <out>/<seed>.svg (the same geometry as the app's Emblem component) and <out>/<seed>.strokes.json (the strokes
 * in drawing order with their lengths and draw-in timing). PNGs are made in the browser by `emblemPng`
 * (src/ui/v7/emblemExport.ts), so the app and any page share one implementation.
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {emblemStrokeOrder, emblemSvg} from '../../src/ui/v7/emblemExport.ts';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
  value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs, []));
if (!args.subject || !args.seed) {
  console.error('Usage: npm run emblem -- --subject <Subject> --seed <seed> [--size 160] [--colour #RRGGBB] [--out dir]');
  process.exit(2);
}
const spec = {subject: args.subject, seed: args.seed, size: Number(args.size) || 160, colour: args.colour || '#121B31'};
const out = args.out || join('docs', 'brand', 'emblems');
const name = args.seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'emblem';
mkdirSync(out, {recursive: true});
writeFileSync(join(out, name + '.svg'), emblemSvg(spec));
writeFileSync(join(out, name + '.strokes.json'), JSON.stringify({...spec, strokes: emblemStrokeOrder(spec)}, null, 1) + '\n');
console.log(`Wrote ${join(out, name)}.svg and .strokes.json (${emblemStrokeOrder(spec).length} strokes)`);
