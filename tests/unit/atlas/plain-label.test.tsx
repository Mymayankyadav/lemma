import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {AtlasLabel,Row,isPlainAtlasLabel} from '../../../src/features/atlas/Outline';
import type {AtlasNode} from '../../../src/features/atlas/tree';

// Regression-first: the 4x CPU Atlas C2 transition need not parse, typeset,
// and sanitize a plain title for each mounted outline row. Rich content must
// retain the existing LaTeX/Markdown pipeline and its sanitization.
describe('FIX #611 Atlas plain-name render path',()=>{
 it('uses escaped React text and the existing typography classes for ordinary titles',()=>{
  const html=renderToStaticMarkup(createElement(AtlasLabel,{source:'Real Analysis (Part 2)'}));
  expect(isPlainAtlasLabel('Real Analysis (Part 2)')).toBe(true);
  expect(html).toContain('data-atlas-plain-label="true"');
  expect(html).toContain('lemma-math lemma-tex-inline');
  expect(html).toContain('Real Analysis (Part 2)');
  expect(html).not.toContain('katex-html');
 });
 it('uses the plain path in the real Atlas outline row',()=>{
  const node={id:'idea',name:'Topology',depth:2,children:[],status:'not_started',
   glyph:null,done:0,total:1,revisit:0} as unknown as AtlasNode;
  const html=renderToStaticMarkup(createElement(Row,{
   node,open:false,tone:'none',match:false,onToggle:()=>{},onSelect:()=>{},
  }));
  expect(html).toContain('data-atlas-plain-label="true"');
  expect(html).toContain('Topology');
  expect(html).toContain('role="treeitem"');
 });
 it('keeps real LaTeX typesetting for mathematical names',()=>{
  const source=String.raw`$\\frac{a}{b}$`;
  expect(isPlainAtlasLabel(source)).toBe(false);
  const html=renderToStaticMarkup(createElement(AtlasLabel,{source}));
  expect(html).toContain('katex-html');
  expect(html).toContain('mfrac');
  expect(html).not.toContain('data-atlas-plain-label');
 });
 it('preserves Markdown emphasis, links and HTML sanitization',()=>{
  for(const source of ['**Proof**','[Reference](https://example.org)','<img src=x onerror=alert(1)>']){
   expect(isPlainAtlasLabel(source)).toBe(false);
  }
  const bold=renderToStaticMarkup(createElement(AtlasLabel,{source:'**Proof**'}));
  expect(bold).toContain('<strong>Proof</strong>');
  const link=renderToStaticMarkup(createElement(AtlasLabel,{source:'[Reference](https://example.org)'}));
  expect(link).toContain('href="https://example.org"');
  const unsafe=renderToStaticMarkup(createElement(AtlasLabel,{source:'<img src=x onerror=alert(1)>'}));
  expect(unsafe).not.toContain('onerror=');
 });
 it('routes ambiguous entities and autolinks through the rich renderer',()=>{
  for(const source of ['R & D','A\\\\B','www.example.org','person@example.org','x_y','a * b']){
   expect(isPlainAtlasLabel(source)).toBe(false);
  }
 });
});
