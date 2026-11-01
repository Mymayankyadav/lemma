import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {renderAllReady} from '../../helpers/renderAllReady';
import {describe,expect,it} from 'vitest';
import {FastTex,canRenderPlainFastTex} from '../../../src/ui/FastTex';

// Independent primitive split from FIX #657c. Parent #677 still owns
// eager Paths/Atlas adoption and its separate five-route regression.
describe('FIX-657ca conservative FastTex primitive',()=>{
 it('renders provably literal names synchronously with escaped React text',()=>{
  for(const name of ['Analysis','Topology and Algebra','A + B','Éléments de géométrie','Idea 7: Definition'])
   expect(canRenderPlainFastTex(name),name).toBe(true);
  const html=renderToStaticMarkup(createElement(FastTex,{source:'A + B',className:'project-name'}));
  expect(html).toContain('class="lemma-math lemma-tex-inline project-name"');
  expect(html).toContain('>A + B</span>');
 });
 it('routes mathematical, Markdown, entity and auto-link text to rich Tex',()=>{
  for(const name of ['$x^2$','\\(x\\)','**strong**','&frac12;','example.org','www.example.org',
   'name@example.org','https://example.org','example.org/path','example.org#proof','<em>idea</em>','Line\\nTwo','\\alpha'])
   expect(canRenderPlainFastTex(name),name).toBe(false);
 });
 it('preserves real KaTeX when streamed rich rendering completes',async()=>{
  const html=await renderAllReady(createElement(FastTex,{source:'$\\frac{1}{2}$'}));
  expect(html).toContain('katex-html');
  expect(html).not.toContain('Rendering mathematical text');
 });
 it('keeps the 16px Atlas breadcrumb math floor without an eager rich CSS import',()=>{
  const css=readFileSync('src/ui/FastTex.css','utf8');
  expect(css).toMatch(/\[aria-label="Idea path"\] \.lemma-tex-inline \.katex\s*\{[^}]*font-size:\s*max\(16px,\s*1em\)/);
  expect(css).toContain('overflow-wrap:anywhere');
  const fast=readFileSync('src/ui/FastTex.tsx','utf8');
  expect(fast).toContain("lazy(()=>import('./Tex')");
  expect(fast).toContain("import './FastTex.css'");
 });
});
