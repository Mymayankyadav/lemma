import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {Proposal} from '../../../src/data/types';
import ProposalEvidence,{proposalCitations} from '../../../src/features/proposals/v6/Evidence';

const base:Proposal={
  id:'proposal-1',kind:'card',projectSlug:'analysis',projectGlyph:'∑',
  sessionNumber:3,origin:'chatgpt',reason:null,
  createdAt:'2026-11-06T08:00:00Z',
  card:{front:'State the lemma',back:'A proof',type:'basic',kind:'proof',
    source:'Lecture notes',page:'37'},
  cardEdit:null,plan:null,planChange:null
};
const render=(proposal:Proposal)=>renderToStaticMarkup(createElement(ProposalEvidence,{proposal}));
describe('N32.1 v6 Inbox proposal evidence',()=>{
  it('shows the actual reason and source/page without invented links',()=>{
    const html=render({...base,reason:'Derived from the proof in the assigned notes.'});
    expect(html).toContain('Why this proposal');
    expect(html).toContain('Derived from the proof');
    expect(html).toContain('Source references');
    expect(html).toContain('Lecture notes');
    expect(html).toContain('37');
    expect(html).not.toContain('Rationale unavailable');
    expect(html).not.toContain('href=');
  });
  it('uses explicit Rationale unavailable and never fabricates citations',()=>{
    const proposal:Proposal={...base,reason:'  ',card:{...base.card!,source:undefined,page:undefined}};
    const html=render(proposal);
    expect(html).toContain('Rationale unavailable');
    expect(html).not.toContain('Source references');
    expect(proposalCitations(proposal)).toEqual([]);
  });
  it('shows unique plan checkpoint citations, preserving named pages without synthesizing sources',()=>{
    const proposal:Proposal={...base,kind:'plan',card:null,reason:'Plan follows the syllabus',
      plan:{checkpoints:[
        {title:'Limits',objective:'Master limits',criterion:'Show work',steps:['Study'],
          sources:[{source:'Book',pages:'pp. 9–11'},{source:'Slides',pages:'week 2'}],
          source:'Book',pages:'pp. 9–11'},
        {title:'Continuity',objective:'Learn continuity',criterion:'Explain',steps:['Read'],
          sources:[{source:'Book',pages:'pp. 9–11'},{source:'Notes'}]},
      ]}};
    expect(proposalCitations(proposal)).toEqual([
      {source:'Book',pages:'pp. 9–11'},
      {source:'Slides',pages:'week 2'},
      {source:'Notes',pages:null}
    ]);
    const html=render(proposal);
    expect(html).toContain('Plan follows the syllabus');
    expect(html.match(/pp. 9–11/g)??[]).toHaveLength(1);
  });
  it('does not claim absent plan-change rationale or unsupported sources',()=>{
    const proposal:Proposal={...base,kind:'plan_change',card:null,plan:null,
      planChange:{ops:[]},reason:null};
    const html=render(proposal);
    expect(html).toContain('Rationale unavailable');
    expect(html).not.toContain('Source references');
  });
  it('escapes untrusted reason text rather than injecting markup or URLs',()=>{
    const html=render({...base,reason:'<img src=x onerror=bad()>'});
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });
  it('renders evidence only in the existing v6 branch, retaining legacy choices and previews',()=>{
    const code=readFileSync('src/features/proposals/Page.tsx','utf8');
    // #1318: the card's evidence now opens from "Why this card?" inside PendingCard, still v6-only.
    expect(code).toContain('{isFlagOn("v6Shell") ? (');
    expect(code).toContain('<ProposalEvidence proposal={proposal} />');
    expect(code).toContain('Why this card?');
    expect(code).toContain('{v6&&<ProposalEvidence proposal={p}/> }'.replace(' />','/>').replace('/> }','/>}'));
    expect(code).toContain('{!v6 && p.reason && (');
    expect(code).toContain('<PendingCard');
    expect(code).toContain('See the whole plan');
  });
});