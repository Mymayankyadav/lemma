import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #651: cold deep links should show the first real card immediately;
// only transitions between already-visible cards need the 480ms entrance.
// The strict first-usable paint clock must not be made to wait for motion.
describe('FIX #651 cold first card has no entrance animation',()=>{
 it('skips initial card transform but keeps subsequent card motion',()=>{
  const source=readFileSync('src/features/review-run/Page.tsx','utf8');
  expect(source).toContain('const firstCard=useRef(true)');
  expect(source).toContain('firstCard.current=false');
  expect(source).toContain('initial={firstCard.current?false:');
  expect(source).toContain('transition={{duration:reduce?0:.48}}');
 });
});
