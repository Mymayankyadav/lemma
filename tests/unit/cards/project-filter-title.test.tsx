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
 it('FIX #608: GFM www domains and email addresses retain autolinks',()=>{
  for(const title of ['www.example.org','person@example.org']){
   const html=renderToStaticMarkup(createElement(ProjectFilterTitle,{title}));
   expect(html,'expected rich link for '+title).toContain('href=');
  }
  // Marked 18's GFM tokenizer does not autolink bare example.org, but keep
  // domain-like labels on the conservative rich path for parser parity.
  const bare=renderToStaticMarkup(createElement(ProjectFilterTitle,{title:'example.org'}));
  expect(bare).toContain('lemma-tex-inline');
 });
 it('FIX #608: encoded HTML entities are not double escaped by the fast path',()=>{
  const html=renderToStaticMarkup(createElement(ProjectFilterTitle,{title:'Proof &amp; logic'}));
  expect(html).toContain('Proof &amp; logic');
  expect(html).not.toContain('&amp;amp;');
 });

 it('FIX #608: numbered named HTML entities in project titles use the rich parser',()=>{
  // HTML named references such as &frac12; and &sup2; are valid mathematics
  // labels. A plain React text node would escape the ampersand a second time.
  for(const title of ['Fraction &frac12;','Powers &sup2;']){
   const html=renderToStaticMarkup(createElement(ProjectFilterTitle,{title}));
   expect(html,'named entity must retain rich rendering for '+title).toContain('lemma-tex-inline');
   expect(html,'named entity must not become literal text for '+title).not.toContain('&amp;frac12;');
   expect(html,'named entity must not become literal text for '+title).not.toContain('&amp;sup2;');
  }
 });

});
