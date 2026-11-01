import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {GraphSketch} from '../../../src/ui/backgrounds/graph/GraphSketch';

// FIX #657b: a cold Today entry must sample only its own letterhead curve.
// Other routes must retain exactly the owner-approved SVG path coordinates.
const pathFrom=(points:[number,number][])=>points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
const sample=(fn:(x:number)=>number,min:number,max:number,scale:(x:number,y:number)=>[number,number])=>
 pathFrom(Array.from({length:101},(_,i)=>{const x=min+(max-min)*i/100;return scale(x,fn(x));}));
const expected=[
 ['/',sample(x=>x*x*x-3*x,-2,2,(x,y)=>[150+x*58,115-y*23])],
 ['/projects',sample(x=>1/(1+Math.exp(-x)),-5,5,(x,y)=>[150+x*25,185-y*122])],
 ['/review',sample(x=>Math.exp(-x/3),0,6,(x,y)=>[30+x*42,185-y*122])],
 ['/insights',sample(x=>Math.exp(-x*x/2),-3,3,(x,y)=>[150+x*42,185-y*122])],
 ['/settings',sample(x=>Math.sin(x),0,Math.PI*2,(a,y)=>[150+74*Math.cos(a),111-74*y])],
] as const;

describe('FIX #657b lazy graph letterheads',()=>{
 it('does not eagerly sample unrelated graph paths during module evaluation',()=>{
  const source=readFileSync('src/ui/backgrounds/graph/GraphSketch.tsx','utf8');
  expect(source).toContain('const getSketch=');
  expect(source).not.toContain('const sketches:Record<Sketch,');
 });
 it('uses an exact precomputed Today curve rather than sampling on the critical entry',()=>{
  const source=readFileSync('src/ui/backgrounds/graph/GraphSketch.tsx','utf8');
  expect(source).toContain('today:()=>({path:TODAY_PATH');
  expect(source).not.toContain('today:()=>({path:sample(');
 });
 it.each(expected)('keeps the exact SVG curve for %s', (path,d)=>{
  document.documentElement.dataset.theme='graph';
  const html=renderToStaticMarkup(createElement(GraphSketch,{path}));
  expect(html).toContain('d="'+d+'"');
 });
});
