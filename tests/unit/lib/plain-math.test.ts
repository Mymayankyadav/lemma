import {describe,it,expect} from 'vitest';
import {plainMath} from '../../../src/lib/plain-math';
import {renderMarkdown} from '../../../src/lib/render';

describe('non-card mathematical content',()=>{
 it('produces readable SVG and aria labels without TeX source',()=>{
  expect(plainMath('Galois $H\\mapsto K^H$ over $\\mathbb{R}$'))
   .toBe('Galois H↦ Kᴴ over ℝ');
  expect(plainMath('A $\\subseteq$ B; $x_1\\in\\mathbb{C}$'))
   .toBe('A ⊆ B; x₁∈ℂ');
  expect(plainMath('From \\(x^2\\) to \\[\\alpha\\]')).toBe('From x² to α');
  expect(plainMath('$\\unknown{a}$')).not.toMatch(/[\\$]/);
  expect(plainMath('Why is $\\mathbb R$ not compact?')).toBe('Why is ℝ not compact?');
  expect(plainMath('Let $x\\in\\mathbb C$')).toBe('Let x∈ℂ');
 });
 it('renders inline LaTeX without wrapping it in block paragraphs',()=>{
  const html=renderMarkdown('Galois $H\\mapsto K^H$',{inline:true});
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('<p>');
  expect(html).not.toContain('$H');
  expect(renderMarkdown('$x^2$',{inline:true})).toContain('katex-mathml');
 });
});
