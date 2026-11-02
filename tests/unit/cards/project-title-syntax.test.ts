import {describe,expect,it} from 'vitest';
import {needsRichTitle} from '../../../src/features/cards/projectTitleSyntax';

describe('FIX-648b cold Cards project-title syntax parity',()=>{
 it('keeps ordinary stress labels, including standalone ampersands, on the cheap text path',()=>{
  for(const title of ['Mathematics project 12','Mathematics project 12 & analysis','Linear Algebra 1','A (B)']){
   expect(needsRichTitle(title),title).toBe(false);
  }
 });
 it('sends mathematical, Markdown, HTML entity and GFM labels through canonical rich rendering',()=>{
  for(const title of [
   'Algebra $x^2$',
   'Topology \\(\\pi_1\\)',
   '**Topology**','[Notes](https://example.org)','Proof &amp; logic',
   'Fraction &frac12;','Powers &sup2;',
   'www.example.org','person@example.org','example.org',
   '<em>Geometry</em>','Topic\nNext',
  ]){
   expect(needsRichTitle(title),title).toBe(true);
  }
 });
});
