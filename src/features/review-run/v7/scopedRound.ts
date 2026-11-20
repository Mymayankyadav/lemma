import {getApi} from '../../../data';
import {authGeneration,authOwner} from '../../../data/authBoundary';
import {getMode} from '../../../data/mode';
import {reviewTarget,type ReviewDomainTarget,type ReviewTarget} from '../../../data/review-target';
import {demoScopedRun,demoStart} from '../v6/demo';
import {getRun,unpauseRun,type DurableRun} from '../v6/adapter';

/** The stored operation covers creating a scoped snapshot and resuming the matching one after lost ACK. */
export async function openStudyTarget(target:ReviewTarget):Promise<DurableRun|null>{
 if(target.kind==='round'){
  const run=await getRun(target.id);
  return run?.status==='paused'?unpauseRun(run):run;
 }
 const domain=target as ReviewDomainTarget;
 if(getMode()==='demo'){
  const existing=demoScopedRun(domain);
  if(existing)return existing;
  const api=getApi(),selected=await api.getReviewTargetItems?.(domain);
  if(!selected)throw Error('Review target unavailable');
  if(!selected.length)return null;
  const run=demoStart({selectedDeckIds:[],filters:{target:domain,targetLabel:api.getReviewTargetLabel?.(domain),...(domain.kind==='card'?{cardId:domain.id}:{})},
   cardBudget:1440,minuteBudget:1440,schedulerVersion:'fsrs-v6',settingsVersion:1},selected);
  return run.items.length?run:null;
 }
 const {liveClient}=await import('../../../data/live/client');
 const {owner,checked}=await import('../../../data/live/helpers');
 const generation=authGeneration(),db=liveClient(),uid=await owner(db);
 const sameOwner=()=>{if(authOwner()!==uid||authGeneration()!==generation)throw Error('The signed-in account changed.');};
 sameOwner();
 const key=['lemma.study.target.v1',uid,domain.kind,domain.id].join('.');
 const operationId=sessionStorage.getItem(key)??crypto.randomUUID();
 sessionStorage.setItem(key,operationId);
 const receipt=checked(await db.rpc('start_study_target',{p_operation_id:operationId,p_kind:domain.kind,p_id:domain.id}));
 sameOwner();
 if(receipt.operationId!==operationId)throw Error('Could not confirm the requested review target.');
 if(receipt.status==='empty'){sessionStorage.removeItem(key);return null;}
 if(receipt.status!=='applied'||typeof receipt.runId!=='string')throw Error('The requested review changed. Reopen the target.');
 const run=await getRun(receipt.runId);
 sameOwner();
 if(run?.target?.id!==domain.id||run.target.kind!==domain.kind||!run.items.length)throw Error('Could not verify the requested review scope.');
 sessionStorage.removeItem(key);
 return run;
}

export async function targetFromLink(search:URLSearchParams):Promise<ReviewTarget|null>{
 if(search.has('run'))return reviewTarget('round',search.get('run'));
 if(search.has('target')||search.has('id'))return reviewTarget(search.get('target'),search.get('id'));
 // Older shared links used only a concept slug. Ambiguous slugs cannot identify a subject.
 if(search.has('concept')){
  const rows=(await getApi().getAtlas()).concepts.filter(row=>row.slug===search.get('concept'));
  if(rows.length!==1)throw Error('Choose the concept in Atlas to open its review.');
  return reviewTarget('concept',rows[0].id);
 }
 return null;
}

export async function skipChangedStudyItem(run:DurableRun,itemId:string):Promise<DurableRun>{
 const {liveClient}=await import('../../../data/live/client');
 const {owner,checked}=await import('../../../data/live/helpers');
 const db=liveClient(),uid=await owner(db),generation=authGeneration();
 if(uid!==authOwner())throw Error('The signed-in account changed.');
 const key=['lemma.study.skip.v1',uid,run.id,itemId,run.version].join('.');
 const operationId=sessionStorage.getItem(key)??crypto.randomUUID();sessionStorage.setItem(key,operationId);
 const result=checked(await db.rpc('skip_changed_study_item',{p_operation_id:operationId,p_run:run.id,p_item:itemId,p_version:run.version}));
 if(result.operationId!==operationId||result.status!=='applied'&&result.status!=='conflict')throw Error('Could not confirm the changed item.');
 const saved=await getRun(run.id);
 if(!saved||authGeneration()!==generation||authOwner()!==uid)throw Error('Reload the signed-in review round.');
 sessionStorage.removeItem(key);
 if(result.status==='conflict'&&saved.version===run.version)throw Error('This card is still available in the current review.');
 return saved;
}
