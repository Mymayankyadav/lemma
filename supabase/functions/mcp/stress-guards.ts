// Pure validation for the MCP-5 scale limits. Keep approval and database writes in tools/write.ts.
export interface PlanCheckpointShape { code?: string; stage?: string | null }
export interface PlanOperationShape extends PlanCheckpointShape { op: string }

const namedStage=(stage:unknown)=>typeof stage==='string'&&stage.trim().length>0;

export function requireStageStructure(checkpoints:readonly PlanCheckpointShape[]):void {
  if(checkpoints.length>8&&!checkpoints.some(cp=>namedStage(cp.stage)))
    throw Error('A plan with more than 8 checkpoints needs 3–7 named stages. Group the checkpoints into stages before proposing it.');
}

// Validate the resulting plan, not just newly added checkpoints. A stage-free
// 36-checkpoint project can be repaired by a change that assigns stages.
export function projectedPlanCheckpoints(existing:readonly PlanCheckpointShape[],ops:readonly PlanOperationShape[]):PlanCheckpointShape[]{
  const rows=new Map<string,PlanCheckpointShape>();
  existing.forEach((cp,i)=>rows.set(cp.code||'existing-'+i,{...cp}));
  ops.forEach((op,i)=>{
    if(op.op==='remove'&&op.code)rows.delete(op.code);
    if(op.op==='add')rows.set(op.code||'new-'+i,{code:op.code,stage:op.stage});
    if(op.op==='update'&&op.code&&Object.prototype.hasOwnProperty.call(op,'stage')){
      const prior=rows.get(op.code);
      if(prior)rows.set(op.code,{...prior,stage:op.stage});
    }
  });
  return [...rows.values()];
}

export interface IdeaShape { name:string; level?:string; parent?:string|null }
export function requireIdeaHierarchy(ideas:readonly IdeaShape[]):void {
  if(ideas.length<=20)return;
  // Cluster is the top-level node; other levels must point to a parent.
  if(ideas.some(idea=>!idea.level||(idea.level!=='cluster'&&!idea.parent?.trim()))||
     !ideas.some(idea=>!!idea.parent?.trim()))
    throw Error('More than 20 ideas need levels and parent links. Organize ideas into a hierarchy before proposing them.');
}

export function requireLearningGoal(goal:unknown):void {
  if(typeof goal!=='string'||!goal.trim())
    throw Error('Ask the student for a specific learning goal before creating or planning this project.');
}

export function longCardAdvice(cards:readonly {front:string;back?:string}[]):string {
  const count=cards.filter(card=>card.front.length>300||(card.back?.length||0)>1200).length;
  return count?' Advice: '+count+' long card'+(count===1?'':'s')+' (front >300 or back >1200 characters); split into one idea per card where possible.':'';
}
