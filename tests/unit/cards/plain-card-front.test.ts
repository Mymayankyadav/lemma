import {describe,expect,it} from 'vitest';
import {canRenderPlainCardFront} from '../../../src/features/cards/plainCardFront';

// ST-4: the 30k-card list has many ordinary prose fronts. Parsing and
// sanitizing every plain preview delays the 4x CPU first interactive frame.
// Only truly markup-free strings may bypass the existing LaTeX renderer.
describe('ST-4 plain card-front fast path',()=>{
 it('accepts plain synthetic and authored prose without changing visible text',()=>{
  expect(canRenderPlainCardFront('Recall the definition in card 29999?')).toBe(true);
  expect(canRenderPlainCardFront('State the theorem: all cases (1, 2, 3).')).toBe(true);
  expect(canRenderPlainCardFront('')).toBe(false);
 });
 it.each([
  '$x^2$', String.raw`\\(\\mathbb{R}\\)`, '**strong**', '*emphasis*',
  '[source](https://example.com)', '<em>HTML</em>', 'A &amp; B',
  'line one\\nline two', 'a_b', '## Heading', '`code`',
 ])('retains full Markdown/LaTeX rendering for %s',(value)=>{
  expect(canRenderPlainCardFront(value)).toBe(false);
 });
});
