import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PlanLabel} from '../../../src/features/plan-proposal/PlanLabel';

describe('FIX #656 plan label renderer',()=>{
 it('renders plain labels as escaped JSX and preserves maths through KaTeX',()=>{
  const plain=renderToStaticMarkup(<PlanLabel source="Limits and continuity"/>);
  expect(plain).toContain('Limits and continuity');
  expect(plain).not.toContain('katex');
  const math=renderToStaticMarkup(<PlanLabel source="$x^2$"/>);
  expect(math).toContain('katex');
  expect(renderToStaticMarkup(<PlanLabel source="$x^2$"/>)).toBe(math);
 });
 it('keeps Markdown/GFM links in the sanitizer-backed path',()=>{
  const link=renderToStaticMarkup(<PlanLabel source="https://example.org"/>);
  expect(link).toContain('href=');
  expect(link).toContain('example.org');
 });
 it('never injects untrusted script markup',()=>{
  const html=renderToStaticMarkup(<PlanLabel source="Unsafe <script>alert(1)</script>"/>);
  expect(html).not.toContain('<script');
 });
});
