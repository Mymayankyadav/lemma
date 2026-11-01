import {describe,expect,it} from 'vitest';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StatusMark} from '../../../src/features/atlas/Outline';
import type {AtlasNode} from '../../../src/features/atlas/tree';

function mark(status:AtlasNode['status']):SVGElement{
 const node:AtlasNode={
  id:'status',slug:'status',name:'Status',subjectId:'s',level:'planet',
  parentId:null,children:[],depth:1,synthetic:false,glyph:null,
  total:0,done:0,revisit:0,due:0,rank:0,status,blurb:null,
  pinX:null,pinY:null,checkpointRefs:[],dueCards:0,
 };
 const host=document.createElement('div');
 host.innerHTML=renderToStaticMarkup(h(StatusMark,{node}));
 return host.querySelector('svg')!;
}

describe('LOOK-4c preserves owner-approved Atlas status colours through lane integration',()=>{
 it('uses neutral ink for demonstrated and in-progress, never the primary-action accent',()=>{
  const done=mark('demonstrated');
  expect(done.querySelector('circle')?.getAttribute('fill')).toBe('var(--ink-2)');
  const progress=mark('in_progress');
  expect(progress.querySelector('circle')?.getAttribute('stroke')).toBe('var(--ink-2)');
  expect(progress.querySelector('path')?.getAttribute('fill')).toBe('var(--ink-2)');
  expect(progress.outerHTML).not.toContain('var(--accent)');
 });
 it('uses semantic lateness ochre for re-check, never hard danger red',()=>{
  const revisit=mark('revisit');
  expect(revisit.querySelector('circle')?.getAttribute('stroke')).toBe('var(--late)');
  expect(revisit.outerHTML).not.toContain('var(--hard)');
 });
 it('keeps future/not-started outlines quiet',()=>{
  expect(mark('not_started').querySelector('circle')?.getAttribute('stroke')).toBe('var(--ink-3)');
 });
});
