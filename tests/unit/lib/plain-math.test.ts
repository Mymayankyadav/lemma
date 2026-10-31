import {describe,it,expect} from 'vitest';
import {plainMath,hasMathPreview} from '../../../src/lib/plain-math';
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
 it('keeps nested TeX braces inside a cloze card preview',()=>{
  const html=renderMarkdown(String.raw`State {{c1::$\frac{a}{b}$::fraction}}`,{inline:true});
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('{{c1::');
  expect(html).not.toContain('::fraction');
 });

 it('recognizes all supported TeX delimiters for unclipped card previews',()=>{
  expect(hasMathPreview('$\\operatorname{verylongexpression}$')).toBe(true);
  expect(hasMathPreview('$$\\sum_{n=1}^{100}n$$')).toBe(true);
  expect(hasMathPreview('\\(\\operatorname{verylongexpression}\\)')).toBe(true);
  expect(hasMathPreview('\\[\\operatorname{verylongexpression}\\]')).toBe(true);
  expect(hasMathPreview('Plain text without a formula')).toBe(false);
 });
});
