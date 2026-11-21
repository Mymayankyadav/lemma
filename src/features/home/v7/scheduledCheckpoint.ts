import {getApi} from '../../../data';
import type {AdaptiveData} from '../../../data/adaptive/contract';
import type {CourseAction} from './nextStepModel';

type Checkpoint = {id:string;code:string;title:string;project_id:string;position:number;status:string;plan_state?:string;tier?:string;proposed?:boolean};

export function scheduledConceptCheckpoint(action: CourseAction, rows: Pick<AdaptiveData['rows'],'checkpoints'|'cpConcepts'|'prereqs'>): Checkpoint | undefined {
  const checkpoints: Checkpoint[] = rows.checkpoints.filter(cp=>cp.project_id===action.projectId&&
    !cp.proposed&&(!cp.plan_state||cp.plan_state==='active')).sort((a,b)=>a.position-b.position);
  const pending = checkpoints.filter(cp=>cp.status!=='demonstrated');
  const linked = new Set(rows.cpConcepts.filter(row=>row.concept_id===action.id).map(row=>row.checkpoint_id));
  const next = pending[0];
  // Certification checks are created for the next pending checkpoint's concept.
  if (action.kind==='check') return next&&linked.has(next.id)?next:undefined;
  if (action.kind!=='final'&&action.kind!=='probe') return undefined;
  const eligible = action.kind==='final'?pending.filter(cp=>cp.tier==='core')
    :checkpoints.filter(cp=>rows.prereqs.some(row=>row.checkpoint_id===next?.id&&row.prereq_id===cp.id));
  const matches = eligible.filter(cp=>linked.has(cp.id));
  return matches.length===1?matches[0]:undefined;
}

export async function readScheduledCheckpoint(action: CourseAction, slug: string): Promise<{code:string;title:string} | null> {
  if (action.kind==='teach') {
    const {project,checkpoints}=await getApi().getProject(slug);
    if (project.id!==action.projectId) return null;
    const checkpoint=checkpoints.find(cp=>cp.id===action.id&&(!cp.planState||cp.planState==='active')&&
      cp.ui!=='proposed'&&cp.ui!=='done'&&cp.ui!=='revisit');
    return checkpoint?{code:checkpoint.code,title:checkpoint.title}:null;
  }
  const {rows}=await getApi().getAdaptiveData();
  const checkpoint=scheduledConceptCheckpoint(action,rows);
  return checkpoint?{code:checkpoint.code,title:checkpoint.title}:null;
}
