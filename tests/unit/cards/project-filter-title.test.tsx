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
  expect(option).not.toContain('\\\\');
 });
});
