import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {MemoWires,Wires} from '../../../src/features/atlas/Outline';
import type {Arc} from '../../../src/features/atlas/tree';

// FIX #647: a scroll/ResizeObserver state update must not recompute the
// unchanged 60-arc lane and badge layout. The memoized component must still
// render precisely the same semantic SVG and overflow disclosures.
describe('FIX #647 stable Atlas wire layout across row-window updates',()=>{
 it('uses the memoized wire component in the Atlas tree',()=>{
  const page=readFileSync('src/features/atlas/Page.tsx','utf8');
  expect(page).toContain('<MemoWires arcs={arcBudget.visible}');
 });
 it('renders identical wires and badge disclosures to the original component',()=>{
  const arcs:Arc[]=[
   {key:'prereq:0:3',from:0,to:3,kind:'prereq',count:3,links:[]},
   {key:'related:1:4',from:1,to:4,kind:'related',count:2,links:[]},
  ];
  const props={arcs,rows:5,focus:null,centers:[22,66,110,154,198],heightPx:220};
  expect(renderToStaticMarkup(createElement(MemoWires,props)))
   .toBe(renderToStaticMarkup(createElement(Wires,props)));
 });
});
