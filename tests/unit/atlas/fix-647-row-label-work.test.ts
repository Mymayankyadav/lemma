import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {Row} from '../../../src/features/atlas/Outline';
import type {AtlasNode} from '../../../src/features/atlas/tree';
import {plainMath} from '../../../src/lib/plain-math';

// FIX #647: on the first 2,500-idea mount, plain labels must not each run
// the multi-pass TeX fallback twice (aria and title) plus the plain detector.
// Keep accessible labels and rendered mathematical names unchanged.
const node=(name:string):AtlasNode=>({
 id:'idea',slug:'idea',name,subjectId:'math',level:'planet',parentId:null,
 children:[],depth:1,synthetic:false,glyph:null,total:1,done:0,revisit:0,due:0,rank:0,
 status:'not_started',blurb:null,pinX:null,pinY:null,checkpointRefs:[],dueCards:0,
});
describe('FIX #647 Atlas row label cold-render work',()=>{
 it('reuses one computed accessible name for title and button, with a plain fast path',()=>{
  const source=readFileSync('src/features/atlas/Outline.tsx','utf8');
  expect(source).toContain('const accessibleName=plain?node.name:plainMath(node.name)');
  expect(source).toContain('title={accessibleName}');
  expect(source).toContain('aria-label={accessibleName+');
 });
 it.each(['Elementary Algebra','\\mathbb{R} \\to \\mathbb{C}'])('keeps the exact accessible mathematical label for %s',name=>{
  const html=renderToStaticMarkup(createElement(Row,{
   node:node(name),open:false,tone:'none',match:false,onToggle:()=>{},onSelect:()=>{},
  }));
  const expected=plainMath(name);
  expect(html).toContain('title="'+expected.replaceAll('&','&amp;')+'"');
  expect(html).toContain('aria-label="'+expected.replaceAll('&','&amp;')+', Not started"');
 });
});
