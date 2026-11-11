import type {CheckpointUi,CheckpointView} from '../../../data/types';

/** PLAN §6.9. Pure rules for the Path constellation map, so the five node states are testable from data. */
export type NodeState='demonstrated'|'current'|'proposed'|'up_next'|'locked';
export const nodeStateOf=(ui:CheckpointUi):NodeState=>
 ui==='done'?'demonstrated':ui==='now'?'current':ui==='proposed'?'proposed':ui==='locked'?'locked':'up_next';
/** Node diameters in px: star-dot 20, current ring 28, proposed 20, up next 16, locked 8. */
export const nodeSize:Readonly<Record<NodeState,number>>={demonstrated:20,current:28,proposed:20,up_next:16,locked:8};
export const nodeWord:Readonly<Record<NodeState,string>>={demonstrated:'Demonstrated',current:'In progress',proposed:'Proposed',up_next:'Up next',locked:'Locked'};
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
/** "2 Nov" from an ISO date or instant (day first, whatever the browser locale); empty when missing or invalid. */
export function shortDate(iso:string|null|undefined):string{
 if(!iso)return '';
 const plain=/^\d{4}-\d{2}-\d{2}$/.test(iso),at=new Date(plain?iso+'T12:00:00Z':iso);
 if(!Number.isFinite(at.getTime()))return '';
 return plain?at.getUTCDate()+' '+months[at.getUTCMonth()]:at.getDate()+' '+months[at.getMonth()];
}
/** The nearest earlier checkpoint that is not yet demonstrated: what a locked node is waiting for. */
export function waitingFor(checkpoints:readonly CheckpointView[],index:number):string|null{
 for(let at=index-1;at>=0;at--)if(checkpoints[at].ui!=='done')return checkpoints[at].title;
 return null;
}
export interface NodeText{state:NodeState;label:string;detail:string}
/** The text beside each node. The label always carries the state in words, never the mark alone. */
export function nodeText(checkpoints:readonly CheckpointView[],index:number,step?:string|null):NodeText{
 const cp=checkpoints[index],state=nodeStateOf(cp.ui);
 if(state==='demonstrated')return {state,label:'Demonstrated',detail:shortDate(cp.demonstratedAt)?'Demonstrated '+shortDate(cp.demonstratedAt):'Demonstrated'};
 if(state==='current'){
  const total=Math.max(0,cp.stepsTotal),at=total?Math.min(Math.max(1,cp.currentStep),total):0;
  return {state,label:'In progress',detail:total?'Step '+at+' of '+total+(step?': '+step:''):'Step details are not written yet'};
 }
 if(state==='proposed')return {state,label:'Proposed',detail:'Proposed by your tutor'};
 if(state==='locked'){const need=waitingFor(checkpoints,index);return {state,label:'Locked',detail:need?'Needs '+need:'Locked'};}
 return {state,label:cp.ui==='revisit'?'Revisit':'Up next',detail:cp.ui==='revisit'?'Revisit'+(shortDate(cp.recheckDue)?' · due '+shortDate(cp.recheckDue):''):'Up next'};
}
/** Index of the node where the solid line ends: the current checkpoint, else the first not yet demonstrated, else the last. */
export function lineEnd(checkpoints:readonly CheckpointView[]):number{
 const now=checkpoints.findIndex(cp=>cp.ui==='now');
 if(now>=0)return now;
 const open=checkpoints.findIndex(cp=>cp.ui!=='done');
 return open>=0?open:Math.max(0,checkpoints.length-1);
}
export const stageCount=(stage:readonly CheckpointView[])=>({done:stage.filter(cp=>cp.ui==='done').length,total:stage.length});
export const stageLabel=(name:string,stage:readonly CheckpointView[])=>{const {done,total}=stageCount(stage);return name.toUpperCase()+' · '+done+' of '+total;};
export const dueTotal=(checkpoints:readonly CheckpointView[])=>checkpoints.reduce((sum,cp)=>sum+Math.max(0,cp.dueCards),0);
