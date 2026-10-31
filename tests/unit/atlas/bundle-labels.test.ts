import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {GUTTER,ROW,OVERFLOW_BUNDLE_KEY,Wires,layoutBundleLabels} from '../../../src/features/atlas/Outline';
import type {Arc} from '../../../src/features/atlas/tree';

const arcs:Arc[]=[
 {key:'long-prereq',from:0,to:4,kind:'prereq',count:12,links:[]},
 {key:'short-prereq',from:1,to:3,kind:'prereq',count:18,links:[]},
 {key:'long-related',from:0,to:4,kind:'related',count:32,links:[]},
 {key:'reverse-prereq',from:4,to:0,kind:'prereq',count:15,links:[]},
 {key:'nearby',from:2,to:4,kind:'related',count:7,links:[]},
];

describe('FIX #483 Atlas bundle label placement',()=>{
 it('separates badges that have the same original midpoint',()=>{
  const positions=layoutBundleLabels(arcs,5);
  expect(positions.size).toBe(arcs.length);
  const labels=[...positions.values()];
  for(const label of labels){
   expect(label.x-label.radius).toBeGreaterThanOrEqual(0);
   expect(label.x+label.radius).toBeLessThanOrEqual(GUTTER);
   expect(label.y-label.radius).toBeGreaterThanOrEqual(0);
   expect(label.y+label.radius).toBeLessThanOrEqual(5*ROW);
  }
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
   const a=labels[i],b=labels[j];
   const edgeGap=Math.hypot(a.x-b.x,a.y-b.y)-a.radius-b.radius;
   expect(edgeGap).toBeGreaterThanOrEqual(8-1e-6);
  }
 });
 it('is stable regardless of arc paint order and does not hide counts',()=>{
  const first=layoutBundleLabels(arcs,5);
  const reversed=layoutBundleLabels([...arcs].reverse(),5);
  expect([...first.entries()].sort()).toEqual([...reversed.entries()].sort());
  expect([...first.keys()].sort()).toEqual(arcs.map(arc=>arc.key).sort());
 });
});

describe('FIX #483 density fallback',()=>{
 it('keeps an accessible overflow summary even in a one-row gutter',()=>{
  const sameRow:Arc[]=Array.from({length:8},(_,i)=>({key:'row:'+i,from:0,to:0,kind:'related',count:2,links:[]}));
  const labels=layoutBundleLabels(sameRow,1);
  const summary=labels.get(OVERFLOW_BUNDLE_KEY);
  expect(summary).toBeDefined();
  expect(summary?.hiddenKeys?.length).toBeGreaterThan(0);
  expect(new Set([...labels.keys()].filter(key=>key!==OVERFLOW_BUNDLE_KEY).concat(summary?.hiddenKeys??[]))).toEqual(new Set(sameRow.map(a=>a.key)));
  expect(summary!.y-summary!.radius).toBeGreaterThanOrEqual(0);
  expect(summary!.y+summary!.radius).toBeLessThanOrEqual(ROW);
 });
 it('keeps a 20-bundle five-row DAG readable and every hidden count discoverable',()=>{
  const dense:Arc[]=[];
  for(let from=0;from<5;from++)for(let to=from+1;to<5;to++){
   for(const kind of ['prereq','related'] as const)
    dense.push({key:kind+':'+from+':'+to,from,to,kind,count:2,links:[]});
  }
  expect(dense).toHaveLength(20);
  const positions=layoutBundleLabels(dense,5);
  const summary=positions.get(OVERFLOW_BUNDLE_KEY);
  const markup=renderToStaticMarkup(createElement(Wires,{arcs:dense,rows:5,focus:null}));
  expect(markup).toContain('data-atlas-hidden-bundles="true"');
  expect(markup).toContain('Show '+(summary?.hiddenKeys?.length??0)+' hidden Atlas link bundles');
  for(const key of summary?.hiddenKeys??[]){const arc=dense.find(a=>a.key===key)!;
   expect(markup).toContain('rows '+(arc.from+1)+'–'+(arc.to+1)+': '+arc.count+' links');
  }
  expect(summary,'congested five-row gutter must switch to a summary').toBeDefined();
  expect(summary?.hiddenKeys?.length).toBeGreaterThan(0);
  const visible=[...positions].filter(([key])=>key!==OVERFLOW_BUNDLE_KEY);
  const hidden=new Set(summary?.hiddenKeys??[]);
  expect(new Set([...visible.map(([key])=>key),...hidden])).toEqual(new Set(dense.map(arc=>arc.key)));
  const labels=[...positions.values()];
  for(const label of labels){
   expect(label.x-label.radius).toBeGreaterThanOrEqual(0);
   expect(label.x+label.radius).toBeLessThanOrEqual(GUTTER);
   expect(label.y-label.radius).toBeGreaterThanOrEqual(0);
   expect(label.y+label.radius).toBeLessThanOrEqual(5*ROW);
  }
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
   const a=labels[i],b=labels[j];
   expect(Math.hypot(a.x-b.x,a.y-b.y)-a.radius-b.radius).toBeGreaterThanOrEqual(8-1e-6);
  }
 });
});
