import {describe,it,expect} from 'vitest';
import type {Proposal,ProjectDetail} from '../../../src/data/types';
import {preparePlanProposal} from '../../../src/features/plan-proposal/prepared';

const proposal=()=>({
 id:'p',kind:'plan',projectSlug:'analysis',projectGlyph:'∫',
 plan:{checkpoints:[
  {code:'CP1',title:'Limits',criterion:'Proof',steps:[],prereqs:[],concepts:['Limits']},
  {code:'CP2',title:'Compactness',criterion:'Proof',steps:[],prereqs:['CP1'],concepts:['Compactness']},
 ],concepts:[{name:'Limits'},{name:'Compactness',prereqs:['Limits']}]},
 planChange:null,
}) as unknown as Proposal;
const project=()=>({subject:{name:'Analysis'},checkpoints:[]}) as unknown as ProjectDetail;

describe('FIX #656 immutable plan preparation cache',()=>{
 it('reuses the exact derived graph and stages for StrictMode render replay',()=>{
  const p=proposal(),detail=project();
  const first=preparePlanProposal(p,detail);
  const second=preparePlanProposal(p,detail);
  expect(second).toBe(first);
  expect(second.ideaTree).toBe(first.ideaTree);
  expect(first.nodes.map(n=>n.code)).toEqual(['CP1','CP2']);
  expect(first.ideaCount).toBe(2);
  expect(first.ideaTree?.links.some(l=>l.kind==='prereq')).toBe(true);
 });
 it('invalidates on a new proposal or project snapshot, preserving titles and subjects',()=>{
  const p=proposal(),a=project();
  const first=preparePlanProposal(p,a);
  const b=project();b.subject.name='Real Analysis';
  const second=preparePlanProposal(p,b);
  expect(second).not.toBe(first);
  expect(second.ideaTree?.roots.length).toBeGreaterThan(0);
  expect(preparePlanProposal(proposal(),b)).not.toBe(second);
  expect(preparePlanProposal(null,b).nodes).toEqual([]);
 });
 it('does not mutate the source proposal when preparing stages and links',()=>{
  const p=proposal(),before=JSON.stringify(p);
  preparePlanProposal(p,project());
  expect(JSON.stringify(p)).toBe(before);
 });
});
