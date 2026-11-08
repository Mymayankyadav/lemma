import type {CheckpointView,PlanChangePayload,PlanPayload,Proposal} from '../../../data/types';
import {planReviewNodes,type ReviewNode} from '../nodes';

export interface ProposalChangeComparison{
 before:ReviewNode[];after:ReviewNode[];adds:string[];removes:string[];
 changed:string[];citations:string[];
}
/** Pure read-only comparison: never mutates source data or approves a proposal. */
export function proposalComparison(proposal:Pick<Proposal,'plan'|'planChange'>,
 existing:readonly CheckpointView[]):ProposalChangeComparison{
 const before=existing.filter(c=>c.ui!=='proposed').map(c=>({
  code:c.code,title:c.title,stage:c.stage??undefined,objective:'',criterion:'',
  steps:[],prereqs:[],dueOn:c.dueOn??null,
 })) as ReviewNode[];
 const after=planReviewNodes(proposal.plan,proposal.planChange,existing);
 const previous=new Map(before.map(c=>[c.code,c]));
 const next=new Map(after.map(c=>[c.code,c]));
 const adds=after.filter(c=>!previous.has(c.code)).map(c=>c.code);
 const removes=before.filter(c=>!next.has(c.code)).map(c=>c.code);
 const changed=after.filter(c=>{
  const old=previous.get(c.code);
  return old&&((old.title!==c.title)||(old.stage!==c.stage)||
   c.change==='updated'||c.change==='added');
 }).map(c=>c.code);
 const citations=new Set<string>();
 const original=(proposal.plan?.checkpoints??[]) as PlanPayload['checkpoints'];
 const additions=(proposal.planChange?.ops??[]).filter((o):o is Extract<PlanChangePayload['ops'][number],{op:'add'}>=>o.op==='add');
 for(const cp of [...original,...additions]){
  if(cp.source)citations.add(cp.source+(cp.pages?' pp. '+cp.pages:''));
  if(cp.pages&&!cp.source)citations.add('Pages '+cp.pages);
  for(const s of cp.sources??[])citations.add(s.source+(s.pages?' pp. '+s.pages:''));
 }
 // Sparse UPDATEs can change only page references. Preserve the real
 // checkpoint code and pages, never fabricate an absent source title.
 for(const op of proposal.planChange?.ops??[])
  if(op.op==='update'&&op.pages)citations.add(op.code+' pages '+op.pages);
 return {before,after,adds,removes,changed,citations:[...citations]};
}
