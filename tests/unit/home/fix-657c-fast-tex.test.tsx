import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {FastTex,canRenderPlainFastTex} from '../../../src/ui/FastTex';

// FIX #657c: keep the heavy Markdown/KaTeX renderer off the cold Today entry
// while preserving all ambiguous math, Markdown, HTML entities and GFM links.
describe('FIX #657c eager-route mathematical labels',()=>{
 it('renders only provably literal text synchronously',()=>{
  for(const name of ['Analysis','Topology and Algebra','A + B','Éléments de géométrie','Idea 7: Definition'])
   expect(canRenderPlainFastTex(name),name).toBe(true);
  const html=renderToStaticMarkup(createElement(FastTex,{source:'A + B',className:'project-name'}));
  expect(html).toContain('class="lemma-math lemma-tex-inline project-name"');
  expect(html).toContain('>A + B</span>');
 });
 it('uses full rich rendering for math, markdown, entities and auto-links',()=>{
  for(const name of ['$x^2$','\\(x\\)','**strong**','&frac12;','example.org','www.example.org',
   'name@example.org','https://example.org','<em>idea</em>','Line\\nTwo','\\alpha'])
   expect(canRenderPlainFastTex(name),name).toBe(false);
 });
 it('does not statically import the rich Tex renderer from eager Paths/Atlas modules',()=>{
  for(const file of [
   'src/features/projects/Page.tsx',
   'src/features/atlas/Page.tsx',
   'src/features/atlas/Outline.tsx',
   'src/features/atlas/DetailsMath.tsx',
   'src/features/atlas/IdeaGraph.tsx',
  ]){
   const source=readFileSync(file,'utf8');
   expect(source,file).toContain("from '../../ui/FastTex'");
   expect(source,file).not.toContain("from '../../ui/Tex'");
  }
  const fast=readFileSync('src/ui/FastTex.tsx','utf8');
  expect(fast).toContain("lazy(()=>import('./Tex')");
 });
});
