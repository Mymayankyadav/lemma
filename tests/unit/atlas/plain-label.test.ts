import {describe,expect,it} from 'vitest';
import {isPlainAtlasLabel} from '../../../src/features/atlas/tree';

describe('LOOK-4b Atlas cold-render label safety',()=>{
 it('uses the fast JSX-escaped path for ordinary notebook labels',()=>{
  for(const label of ['Metric spaces','Compactness (sequential)','Idea 42','Proof: 1 + 1'])
   expect(isPlainAtlasLabel(label)).toBe(true);
 });
 it('retains the full Tex parser for mathematical or markup-rich names',()=>{
  for(const label of [String.raw`$L^p$`,String.raw`\mathbb{R}^n`,'<script>alert(1)</script>','**Bold**','x_y'])
   expect(isPlainAtlasLabel(label)).toBe(false);
 });
 it('does not bypass GFM autolinks for bare domains',()=>{
  for(const label of ['example.org','www.example.com','Read example.org today',
   '(example.org)','example.org:443','a.edu'])
   expect(isPlainAtlasLabel(label)).toBe(false);
  for(const label of ['Proof: 1.2','Cauchy-Schwarz','Topic 2.5'])
   expect(isPlainAtlasLabel(label)).toBe(true);
 });
});
