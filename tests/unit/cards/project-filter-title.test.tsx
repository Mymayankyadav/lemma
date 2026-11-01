import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProjectFilterTitle,projectFilterOptionLabel} from '../../../src/features/cards/ProjectFilterTitle';

describe('ST-4 project filters preserve mathematical titles',()=>{
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

 it('FIX #608: plain stress titles avoid rich renderer but retain escaped text and 16px',()=>{
  const html=renderToStaticMarkup(createElement(ProjectFilterTitle,{title:'Mathematics project 12 & analysis'}));
  expect(html).toContain('Mathematics project 12 &amp; analysis');
  expect(html).not.toContain('lemma-tex-inline');
  expect(html).toContain('text-base');
 });
 it('FIX #608: Markdown formatting still uses rich renderer',()=>{
  const html=renderToStaticMarkup(createElement(ProjectFilterTitle,{title:'**Topology**'}));
  expect(html).toContain('<strong>Topology</strong>');
 });
});
