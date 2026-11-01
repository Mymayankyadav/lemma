// @vitest-environment node
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {describe,expect,it} from 'vitest';
import {renderAllReady} from '../../helpers/renderAllReady';
import {FastTex} from '../../../src/ui/FastTex';

// A cold Project Route should not statically evaluate the full Markdown/KaTeX
// renderer merely because it has plain checkpoint titles and stage labels.
describe('FIX-659n direct Project FastTex adoption',()=>{
 it('removes eager Tex imports from all three visible Project entry modules',()=>{
  for(const path of [
   'src/features/project/Page.tsx',
   'src/features/project/PathsView.tsx',
   'src/ui/timeline/Route.tsx',
  ]){
   const source=readFileSync(path,'utf8');
   expect(source,path).toContain('FastTex as Tex');
   expect(source,path).not.toMatch(/import\s*\{\s*Tex\s*\}\s*from\s*['"][^'"]*\/Tex['"]/);
  }
 });
 it('keeps actual mathematical content, escaping and rich markup',async()=>{
  const math=await renderAllReady(createElement(FastTex,{source:'$\\frac{1}{2}$'}));
  expect(math).toContain('katex-html');
  expect(math).not.toContain('Rendering mathematical text');
  const literal=await renderAllReady(createElement(FastTex,{source:'A < B'}));
  expect(literal).not.toContain('<script');
  expect(literal).toContain('&lt;');
 });
});
