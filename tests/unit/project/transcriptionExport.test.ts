import {describe,it,expect} from 'vitest';
import {sourceMarkdown,sourceTex} from '../../../src/features/project/transcriptionExport';
import type {TranscribedSourcePage} from '../../../src/data/types';

const pages:TranscribedSourcePage[]=[
 {sourceId:'s',page:10,label:'10',body:'An equation: $$x^2+y^2=z^2$$',transcribedBy:'claude',confidence:'check'},
 {sourceId:'s',page:2,label:'2',body:'A & B. We know $x<y$.\n# Example',transcribedBy:'claude',confidence:'high'},
];

describe('transcribed source export',()=>{
 it('keeps exact Markdown text and numeric page order',()=>{
  const md=sourceMarkdown('My lecture',pages);
  expect(md).toMatch(/^# My lecture\n/);
  expect(md.indexOf('% page 2')).toBeLessThan(md.indexOf('% page 10'));
  expect(md).toContain('A & B.');
  expect(md).toContain('$$x^2+y^2=z^2$$');
 });
 it('includes standard amsmath/amssymb preamble, page separators and preserved math',()=>{
  const tex=sourceTex('My & lecture',pages);
  expect(tex).toContain('\\documentclass{article}');
  expect(tex).toContain('\\usepackage{amsmath,amssymb}');
  expect(tex).toContain('\\title{My \\& lecture}');
  expect(tex).toContain('A \\& B.');
  expect(tex).toContain('$x<y$');
  expect(tex).toContain('$$x^2+y^2=z^2$$');
  expect(tex).toContain('\\section*{Example}');
  expect(tex.indexOf('% page 2')).toBeLessThan(tex.indexOf('% page 10'));
  expect(tex).toMatch(/\\end\{document\}\s*$/);
 });
 it('preserves backslash-delimited inline and display maths alongside dollar maths',()=>{
  const mixed:TranscribedSourcePage[]=[{
    sourceId:'s',page:1,label:'1',
    body:String.raw`Let \\(x^2\\) be positive; \\[\\frac{1}{2}\\] and $a+b$ are maths. A & B.`,
    transcribedBy:'claude',confidence:'high'
  }];
  const tex=sourceTex('Math',mixed);
  expect(tex).toContain(String.raw`\\(x^2\\)`);
  expect(tex).toContain(String.raw`\\[\\frac{1}{2}\\]`);
  expect(tex).toContain('$a+b
  const before=pages.map(p=>p.body);
  sourceMarkdown('Notes',pages);sourceTex('Notes',pages);
  expect(pages.map(p=>p.body)).toEqual(before);
 });
});
);
  expect(tex).toContain('A \\& B.');
  expect(tex).not.toContain(String.raw`\\textbackslash{}(x`);
  expect(tex).not.toContain(String.raw`\\textbackslash{}[\\frac`);
 });
 it('leaves page bodies unmodified during export',()=>{
  const before=pages.map(p=>p.body);
  sourceMarkdown('Notes',pages);sourceTex('Notes',pages);
  expect(pages.map(p=>p.body)).toEqual(before);
 });
});
