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
});
