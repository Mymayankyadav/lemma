import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {buildAtlasModel} from '../../../src/features/atlas/v7/model';
import {layoutAtlas,layoutKey,type LayoutInput} from '../../../src/features/atlas/v7/layout';
import {clearLayoutCache,computeLayout,layoutInput} from '../../../src/features/atlas/v7/layoutClient';

describe('v7 Atlas seeded layout',()=>{
 it('is deterministic, keeps pins and separates constellations',async()=>{
  const model=buildAtlasModel(await new DemoAdapter().getAtlas());
  const input=layoutInput(model);
  const first=layoutAtlas(input),second=layoutAtlas(input);
  expect(second).toEqual(first);
  expect(first.x).toHaveLength(82);
  expect(first.x.every(Number.isFinite)).toBe(true);
  const [a,b,c]=first.centres;
  for(const [p,q] of [[a,b],[b,c],[a,c]])expect(Math.hypot(p[0]-q[0],p[1]-q[1])).toBeGreaterThan(200);
  const pinned:LayoutInput={...input,pins:input.pins.map((pin,i)=>i===5?[40,-30]:pin)};
  const moved=layoutAtlas(pinned);
  expect([moved.x[5],moved.y[5]]).toEqual([40,-30]);
  expect(layoutKey(pinned)).not.toBe(layoutKey(input));
  expect(layoutKey({...input,seed:'other'})).not.toBe(layoutKey(input));
 });
 it('handles the heavy profile (600 concepts, 1,500 links) and an empty graph',()=>{
  let seed=7;const random=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
  const ids=Array.from({length:600},(_,i)=>'c'+i);
  const input:LayoutInput={ids,clusters:ids.map((_,i)=>i%5),clusterCount:5,radii:ids.map(()=>3+random()*4),
   edges:Array.from({length:1500},()=>{const from=Math.floor(random()*600);return [from,(from+1+Math.floor(random()*598))%600,random()<.7?1:0];}),
   pins:ids.map(()=>null),seed:'heavy'};
  const result=layoutAtlas(input);
  expect(result.x.every(Number.isFinite)&&result.y.every(Number.isFinite)).toBe(true);
  expect(result.centres).toHaveLength(5);
  const empty=layoutAtlas({ids:[],clusters:[],clusterCount:0,radii:[],edges:[],pins:[],seed:'x'});
  expect(empty.bounds).toEqual({minX:-1,minY:-1,maxX:1,maxY:1});
 });
 it('falls back to the main thread without workers and caches until the data changes',async()=>{
  clearLayoutCache();
  const model=buildAtlasModel(await new DemoAdapter().getAtlas());
  const input=layoutInput(model);
  const first=await computeLayout(input);
  expect(first.source).toBe(typeof Worker==='undefined'?'main':'worker');
  const again=await computeLayout(input);
  expect(again.source).toBe('cache');
  expect(again.result).toBe(first.result);
 });
});
