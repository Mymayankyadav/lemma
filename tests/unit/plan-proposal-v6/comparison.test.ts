import {describe,it,expect} from 'vitest';
import {proposalComparison} from '../../../src/features/plan-proposal/v6/comparison';
import type {Proposal,CheckpointView} from '../../../src/data/types';
const before:CheckpointView[]=[
 {id:'c1',code:'CP1',title:'Old goal',stage:'Original',position:1,ui:'now',
  currentStep:0,stepsTotal:2,recheckDue:null,dueCards:0},
 {id:'c2',code:'CP2',title:'To remove',stage:null,position:2,ui:'next',
  currentStep:0,stepsTotal:1,recheckDue:null,dueCards:0},
];
const blank={id:'11111111-1111-4111-8111-111111111111',kind:'plan_change' as const,
 projectSlug:'math',projectGlyph:'sum' as const,sessionNumber:null,
 origin:'chatgpt' as const,reason:'Clarify proof order',
 createdAt:'2026-11-08T00:00:00Z',card:null,cardEdit:null,plan:null,planChange:null};
describe('N85 plan proposal read-only comparison',()=>{
 it('preserves input checkpoints and displays before/after changed, new and removed targets',()=>{
  const proposal={...blank,planChange:{ops:[
   {op:'update' as const,code:'CP1',title:'New goal'},
   {op:'remove' as const,code:'CP2'},
   {op:'add' as const,code:'CP3',title:'Third',objective:'Learn',criterion:'Proof',
    steps:['Prove'],source:'Proof notes',pages:'5–8'},
  ]}};
  const frozen=JSON.stringify(before),out=proposalComparison(proposal,before);
  expect(out.before.map(c=>c.code)).toEqual(['CP1','CP2']);
  expect(out.after.map(c=>c.code)).toEqual(['CP1','CP3']);
  expect(out.adds).toEqual(['CP3']);
  expect(out.removes).toEqual(['CP2']);
  expect(out.changed).toContain('CP1');
  expect(out.citations).toEqual(['Proof notes pp. 5–8']);
  expect(JSON.stringify(before)).toBe(frozen);
 });
 it('counts new plan and source references without claiming a phantom approved base',()=>{
  const proposal:Pick<Proposal,'plan'|'planChange'>={plan:{checkpoints:[
   {code:'CP1',title:'Intro',objective:'Learn',criterion:'Explain',steps:[],
    sources:[{source:'Textbook',pages:'12'}]},
   {code:'CP2',title:'Review',objective:'Recall',criterion:'Solve',steps:[],
    sources:[{source:'Textbook',pages:'12'}]},
  ]},planChange:null};
  const out=proposalComparison(proposal,[]);
  expect(out.before).toHaveLength(0);
  expect(out.after).toHaveLength(2);
  expect(out.citations).toEqual(['Textbook pp. 12']);
 });
 it('never treats a pending proposed checkpoint as an approved before target',()=>{
  const out=proposalComparison({plan:null,planChange:{ops:[{op:'remove',code:'CP1'}]}},
   [{...before[0],ui:'proposed'},before[1]]);
  expect(out.before.map(c=>c.code)).toEqual(['CP2']);
  expect(out.after.map(c=>c.code)).toEqual(['CP2']);
 });
});
