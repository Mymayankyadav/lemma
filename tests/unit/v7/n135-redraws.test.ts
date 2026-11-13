import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// N135 · v7 UX audit r3, P2: three drawings redrawn in the same hand (docs/v7/ux-audit-2026-11-12/06_…, §5 P2).
const source=readFileSync('src/ui/v7/Illustration.tsx','utf8');
const art=Object.fromEntries([...source.matchAll(/^ {2}(\w+): `([\s\S]*?)`,$/gm)].map(match=>[match[1],match[2]]));
const r3=JSON.parse(readFileSync('docs/v7/ux-audit-2026-11-12/visuals/src/r3/r3-art.json','utf8')) as Record<string,string>;

describe('P2 · IL2 Cards, no match no longer reads "zoom out"',()=>{
 it('the lens sits over an empty dashed card, with no minus sign',()=>{
  expect(art.cards).toBe(r3.cards);
  expect(art.cards).toContain('stroke-dasharray="5 7"');
  expect(art.cards).not.toContain('M100 82H124');
 });
});
describe('P2 · IL8 Progress, no time yet is an hourglass',()=>{
 it('sand that has not started to fall, and no clock hands',()=>{
  expect(art.progress).toBe(r3.progress);
  expect(art.progress).not.toMatch(/r="34"/);
  expect(art.progress).not.toContain('V90l10 8');
 });
});
describe('P2 · IL3 Day closed sits on the disc\'s centre, and its animation moves with it',()=>{
 it('the still is moved up 8 and right 4',()=>{
  expect(art.closed).toBe(r3.closed);
  expect(art.closed).toContain('<g transform="translate(4 -8)">');
 });
 it('the moon, stars and ∎ layers of the animation carry the same offset; the backdrop does not',()=>{
  const data=JSON.parse(readFileSync('src/ui/v7/lottie/day-closed.json','utf8')) as {layers:{nm:string;ks:{p:{k:number[]}}}[]};
  const at=Object.fromEntries(data.layers.map(layer=>[layer.nm,layer.ks.p.k]));
  for(const name of ['moon','stars','qed'])expect(at[name],name).toEqual([4,-8,0]);
  expect(at.backdrop).toEqual([0,0,0]);
 });
});
