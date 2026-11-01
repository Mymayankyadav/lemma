// @vitest-environment jsdom
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it,vi} from 'vitest';

// FIX #657: cold Today must not evaluate the four unrelated GraphSketch
// curves before the first visible goal is painted under 4× CPU.
describe('FIX #657 GraphSketch cold-route work',()=>{
 afterEach(()=>{vi.restoreAllMocks()});
 it('does not sample off-route exponential or sine curves during module evaluation',async()=>{
  vi.resetModules();
  const exp=vi.spyOn(Math,'exp');
  const sin=vi.spyOn(Math,'sin');
  const {GraphSketch}=await import('../../../src/ui/backgrounds/graph/GraphSketch');
  expect(GraphSketch).toBeTypeOf('function');
  expect(exp).not.toHaveBeenCalled();
  expect(sin).not.toHaveBeenCalled();
 });
 it('keeps the approved Today letterhead geometry and aria-hidden SVG',async()=>{
  document.documentElement.dataset.theme='graph';
  const {GraphSketch}=await import('../../../src/ui/backgrounds/graph/GraphSketch');
  const html=renderToStaticMarkup(createElement(GraphSketch,{path:'/'}));
  expect(html).toContain('data-graph-sketch="today"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('M34.00 161.00');
  expect(html).toContain('stroke="var(--accent)"');
 });
});
