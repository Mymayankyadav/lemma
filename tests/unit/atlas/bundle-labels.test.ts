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
   expect(edgeGap).toBeGreaterThanOrEqual(8);
  }
 });
 it('is stable regardless of arc paint order and does not hide counts',()=>{
  const first=layoutBundleLabels(arcs,5);
  const reversed=layoutBundleLabels([...arcs].reverse(),5);
  expect([...first.entries()].sort()).toEqual([...reversed.entries()].sort());
  expect([...first.keys()].sort()).toEqual(arcs.map(arc=>arc.key).sort());
 });
});

describe('LOOK-4c painted rectangular badge clearance',()=>{
 it('reserves the diagonal of each 16px-high pill, including its stroke',()=>{
  const labels=layoutBundleLabels(arcs,5);
  for(const arc of arcs){
   const label=labels.get(arc.key)!;
   const width=Math.max(22,12+String(arc.count).length*8);
   // A radius based only on half-width lets diagonal pill corners pass
   // closer than the required eight painted CSS pixels.
   expect(label.radius).toBeGreaterThanOrEqual(Math.hypot((width+1)/2,8));
  }
  for(let i=0;i<arcs.length;i++)for(let j=i+1;j<arcs.length;j++){
   const a=labels.get(arcs[i].key)!,b=labels.get(arcs[j].key)!;
   const wa=Math.max(22,12+String(arcs[i].count).length*8);
   const wb=Math.max(22,12+String(arcs[j].count).length*8);
   const dx=Math.max(0,Math.abs(a.x-b.x)-(wa+wb)/2-1);
   const dy=Math.max(0,Math.abs(a.y-b.y)-16);
   expect(Math.hypot(dx,dy)).toBeGreaterThanOrEqual(8);
  }
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
   expect(Math.hypot(a.x-b.x,a.y-b.y)-a.radius-b.radius).toBeGreaterThanOrEqual(8);
  }
 });
});


describe('LOOK-4b/4c variable-height wire integration',()=>{
 it('aligns orthogonal wire endpoints and bundle anchors with measured row centers',()=>{
  // Field rows are 56px, ordinary rows 44px, and the hierarchy adds gaps.
  // Fixed row-index * 44 geometry would attach these links to empty paper.
  const centers=[28,78,122,166,210];
  const selected=[arcs[0]];
  const positions=layoutBundleLabels(selected,5,centers,250);
  expect(positions.get('long-prereq')?.anchorY).toBe(119);
  const markup=renderToStaticMarkup(createElement(Wires,{
   arcs:selected,rows:5,focus:null,centers,heightPx:250,
  }));
  expect(markup).toContain('data-atlas-wires="true"');
  expect(markup).toContain('height="250"');
  expect(markup).toContain('d="M 8 28 H 78 Q 83 28');
  expect(markup).toContain('cy="28"');
  expect(markup).toContain('V 205 Q 83 210');
 });
});


describe('LOOK-4c physical bundle span ranking',()=>{
 it('anchors the physically longer bundle farther out when Field heights vary',()=>{
  const centers=[0,30,60,70,400,430];
  const links:Arc[]=[
   {key:'three-short-rows',from:0,to:3,kind:'prereq',count:2,links:[]},
   {key:'two-tall-rows',from:2,to:4,kind:'prereq',count:2,links:[]},
  ];
  const placed=layoutBundleLabels(links,6,centers,460);
  expect(placed.get('two-tall-rows')?.anchorX).toBeGreaterThan(placed.get('three-short-rows')!.anchorX);
 });
});
