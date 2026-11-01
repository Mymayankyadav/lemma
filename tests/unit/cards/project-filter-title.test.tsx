import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProjectFilterTitle,projectFilterOptionLabel} from '../../../src/features/cards/ProjectFilterTitle';

describe('ST-4 project filters preserve mathematical titles',()=>{
 it('prints plain stress project names as one escaped text node without invoking rich Markdown',()=>{
  const html=renderToStaticMarkup(createElement(ProjectFilterTitle,{title:'Mathematics project 42'}));
  expect(html).toBe('<span class="whitespace-nowrap text-base"><span class="lemma-math lemma-tex-inline">Mathematics project 42</span></span>');
  // FIX #523 requires the same visible math wrapper in every filter chip.
  expect(html).toContain('lemma-tex-inline');
  const escaped=renderToStaticMarkup(createElement(ProjectFilterTitle,{title:'Proof <script>alert(1)</script>'}));
  expect(escaped).not.toContain('<script>');
  expect(escaped).toContain('Proof');
 });
 it('renders KaTeX in visible chips and readable plain text in native options',()=>{
  const title='Algebra $\\frac{a}{b}$ over $\\mathbb{F}_p$';
  const html=renderToStaticMarkup(createElement(ProjectFilterTitle,{title}));
  expect(html).toContain('katex');
  expect(html).toContain('mfrac');
  expect(html).not.toContain('Algebra $');
  const option=projectFilterOptionLabel(title);
  expect(option).toContain('(a/b)');
  expect(option).toContain('𝔽');
  expect(option).not.toContain('$');
  expect(option).not.toContain('\\');
 });
});
