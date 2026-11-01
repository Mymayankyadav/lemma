import React from 'react';
import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';

vi.mock('../../../src/features/home/ReviewOutlook',()=>({
 ReviewOutlook:()=> <div aria-label="Seven-day review forecast">forecast</div>,
}));

import {ReviewDesk} from '../../../src/features/home/Page';

const html=(due:number)=>renderToStaticMarkup(
 <MemoryRouter><ReviewDesk due={due}/></MemoryRouter>
);

describe('LOOK-5c2 quiet Today review row',()=>{
 it('shows one neutral All clear row and no empty charts or zero tiles',()=>{
  const view=html(0);
  expect(view).toContain('All clear');
  expect(view).toContain('Nothing due right now.');
  expect(view).not.toContain('Seven-day review forecast');
  expect(view).not.toContain('Due cards by project');
  expect(view).not.toContain('inbox clear');
  expect(view).not.toContain('all reviewed');
  expect(view).toContain('aria-label="Open review"');
 });
 it('keeps one review action, due count, estimated time and spark',()=>{
  const view=html(23);
  expect(view).toContain('23');
  expect(view).toContain('about 12 min');
  expect(view).toContain('aria-label="Start review of 23 cards"');
  expect(view).toContain('Seven-day review forecast');
  expect(view).not.toContain('Due cards by project');
  expect(view).not.toContain('to approve');
 });
});
