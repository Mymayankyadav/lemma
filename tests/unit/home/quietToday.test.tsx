import React from 'react';
import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';

vi.mock('../../../src/features/home/ReviewOutlook',()=>({
 ReviewOutlook:({quiet}:{quiet?:boolean})=> quiet?null:<div aria-label="Seven-day review forecast">forecast</div>,
}));

import {ReviewDesk,TutorHandoff,ResumeCard,estimatedReviewTime} from '../../../src/features/home/Page';
import type {HomeSummary} from '../../../src/data/types';

const html=(due:number)=>renderToStaticMarkup(
 <MemoryRouter><ReviewDesk due={due}/></MemoryRouter>
);

describe('LOOK-5c2 quiet Today review row',()=>{
 it('uses the same 4.5-second fallback as Review and caps at the configured daily round',()=>{
  expect(estimatedReviewTime(23)).toBe('about 2 min');
  expect(estimatedReviewTime(200)).toBe('about 15 min');
  expect(estimatedReviewTime(4000,200)).toBe('about 15 min');
  expect(estimatedReviewTime(4000,400)).toBe('about 30 min');
 });
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
  expect(view).toContain('about 2 min');
  expect(view).toContain('aria-label="Start review of 23 cards"');
  expect(view).toContain('Seven-day review forecast');
  expect(view).not.toContain('Due cards by project');
  expect(view).not.toContain('to approve');
 });
});

describe('LOOK-5c2 tutor handoff',()=>{
 const summary=(pendingProposals:number):HomeSummary=>({
  resume:null,due:0,pendingProposals,projects:[],
 });
 const render=(pending:number)=>renderToStaticMarkup(
  <MemoryRouter><TutorHandoff home={summary(pending)} onCopy={()=>{}}/></MemoryRouter>
 );
 it('hides the empty inbox entirely, retaining only Continue',()=>{
  const view=render(0);
  expect(view).toContain('Continue');
  expect(view).toContain('Study handoff');
  expect(view).not.toContain('From your tutor');
  expect(view).not.toContain('All tutor proposals reviewed');
  expect(view).not.toContain('Review 0 tutor proposals');
 });
 it('places pending tutor proposals and Continue inside the same paper',()=>{
  const view=render(6);
  expect(view).toContain('From your tutor');
  expect(view).toContain('6 tutor proposals awaiting your decision');
  expect(view).toContain('aria-label="Review 6 tutor proposals"');
  expect(view).toContain('Continue');
  expect((view.match(/class="slab /g)??[])).toHaveLength(1);
 });
});

describe('LOOK-5c2 clipped mathematical Continue row',()=>{
 it('keeps an eighty-character checkpoint title inside two explicitly clipped lines',()=>{
  const title='$\\alpha$ '+ 'x'.repeat(71);
  expect(title.length).toBe(80);
  const home:HomeSummary={
   due:0,pendingProposals:0,projects:[],
   resume:{projectSlug:'algebra-1',projectTitle:'Algebra 1',glyph:'∑',
    checkpointCode:'CP1',checkpointTitle:title,step:1,stepsTotal:5,
    question:null,objective:null,pausedAt:null,sessionNumber:1},
  };
  const view=renderToStaticMarkup(<MemoryRouter><ResumeCard home={home} onCopy={()=>{}}/></MemoryRouter>);
  expect(view).toContain('min-h-16');
  expect(view).toContain('data-resume-title=""');
  expect(view).toContain('data-resume-meta=""');
  expect(view).toContain('aria-label="Copy resume prompt"');
  expect((view.match(/overflow:hidden;text-overflow:ellipsis;white-space:nowrap/g)??[])).toHaveLength(2);
  expect(view).toContain('step 1 of 5');
 });
});
