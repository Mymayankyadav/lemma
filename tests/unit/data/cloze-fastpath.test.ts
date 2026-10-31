import {describe,expect,it} from 'vitest';
import legacyRender from '../../../src/lib/render/render.js';
import {clozeOrds} from '../../../src/data/demo/cloze';

/** The demo's card writer must keep the exact legacy cloze ordinal semantics
 * without importing the entire Markdown/KaTeX renderer on Today's cold path. */
describe('FIX #507: lightweight cloze ordinal extraction',()=>{
 it.each([
  '', 'plain prose', '{{c1::one}}', '{{c2::two}} {{c1::one}} {{c2::again}}',
  '{{c01::leading zero}} {{c0::zero}}', '{{c9::nested {{c3::text}}}}',
  '{{c12::valid}} {{C3::not a cloze}} {{c-1::invalid}} {{c4:invalid}}',
 ])('matches the legacy renderer for %s',(source)=>{
  expect(clozeOrds(source)).toEqual(legacyRender.clozeOrds(source));
 });
});
