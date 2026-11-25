import {useHome} from '../../../data/hooks';
import {Link} from 'react-router';
import {useAtlasModel,useRefreshAtlas} from '../../../data/adaptive/atlas-api';
import {useAgenda} from '../../../data/adaptive/agenda-api';
import {authGeneration} from '../../../data/authBoundary';
import {isFlagOn} from '../../../flags';
import {formatShortDate} from '../../../lib/format';
import {Disclosure} from '../../../ui/v7/Disclosure';
import {CardBudget,EstimateRange,FitMeter,ProficiencyValue,StageStrip} from '../../../ui/v7/AtlasValues';
import {PracticeQuestion} from '../PracticeQuestion';
import {TodayScheduler} from '../Views';

/** Details remain reachable without turning the home screen into a diagnostics report. */
export function StudyModelDetailsContent(){
 const atlas=useAtlasModel(),agenda=useAgenda(),home=useHome();
 const model=atlas.data;
 return <>
  <TodayScheduler/>
  {isFlagOn('atlasV3')&&model&&<div className="v7-learning-details">
   {Object.entries(model.fits).map(([id,fit])=><section key={id}>
    <h3 className="v7-subhead">{home.data?.projects.find(project=>project.id===id)?.title??'Plan fit'}</h3>
    <FitMeter {...fit}/>
   </section>)}
   <CardBudget {...model.budget}/>
   {model.frustration.active&&<p role="status">Easier practice for your next three questions.</p>}
   <Link to="/practice?question=1">Open practice question</Link>
   <Link to="/settings?section=advanced">Decision details</Link>
   {!agenda.enabled&&<ol>{model.queue.items.slice(0,8).map(item=><li key={item.id}>
    {model.model.facts.concepts.find(concept=>concept.id===item.concept_id)?.name} · {item.kind} · {item.reason}
   </li>)}</ol>}
  </div>}
 </>;
}

export function AdaptivePractice(){
 const atlas=useAtlasModel(),agenda=useAgenda(),refresh=useRefreshAtlas();
 if(!isFlagOn('atlasV3')||!atlas.data)return null;
 return <Disclosure label="Practice question" defaultOpen={new URLSearchParams(window.location.hash.split('?')[1]).get('question')==='1'}>
  <PracticeQuestion kit key={authGeneration()} canOpen={agenda.enabled&&agenda.query.data?.practice?.status==='available'&&!agenda.query.isError}
   sessions={atlas.data.sessions??[]} onSaved={()=>{void refresh();void agenda.query.refetch();}}/>
  {agenda.query.data?.practice?.status!=='available'&&<p>A question will appear when your study plan has eligible practice.</p>}
 </Disclosure>;
}

export function AttemptHistory({sessionId}:{sessionId:string}){
 const {data}=useAtlasModel();
 const attempts=data?.attempts.filter(attempt=>attempt.session_id===sessionId).slice().reverse()??[];
 if(!isFlagOn('atlasV3')||!data||!attempts.length)return null;
 return <Disclosure label="Attempt details"><ol className="v7-learning-details">
  {attempts.map(attempt=><li key={attempt.id}><time dateTime={attempt.occurred_at}>{formatShortDate(attempt.occurred_at)}</time>
   <StageStrip stages={(data.model.facts.tags??[]).filter(tag=>String(tag.attempt_id)===String(attempt.id)).map(tag=>({...tag,stage:tag.stage??''}))}
    legacy={!!attempt.legacy_outcome} cued={attempt.cued?.length>0}/>
  </li>)}
 </ol></Disclosure>;
}

export function CheckpointReadiness({checkpointId}:{checkpointId:string}){
 const {data}=useAtlasModel();
 if(!isFlagOn('atlasV3')||!data)return null;
 const ids=[...new Set(data.checkpointConcepts.filter(item=>item.checkpoint_id===checkpointId).map(item=>item.concept_id))];
 if(!ids.length)return null;
 return <Disclosure label="Readiness details"><ul className="v7-learning-details">{ids.map(id=><li key={id}>
  <Link to={'/atlas?id='+encodeURIComponent(id)}>{data.model.facts.concepts.find(concept=>concept.id===id)?.name??'Concept'}</Link>
  {(data.facets[id]??[]).map(facet=><div key={facet.facet}><span>{facet.facet} </span><ProficiencyValue value={facet}/></div>)}
 </li>)}</ul></Disclosure>;
}

export function PathEstimateDetails({projectId}:{projectId:string}){
 const {data}=useAtlasModel();
 if(!isFlagOn('atlasV3')||!data)return null;
 const checkpoints=data.checkpoints.filter(checkpoint=>checkpoint.project_id===projectId&&data.durations[checkpoint.id]);
 if(!checkpoints.length&&!data.fits[projectId])return null;
 return <Disclosure label="Plan estimates"><div className="v7-learning-details">
  {data.fits[projectId]&&<FitMeter {...data.fits[projectId]}/>}
  <ul>{checkpoints.map(checkpoint=><li key={checkpoint.id}><strong>{checkpoint.title}</strong> <EstimateRange {...data.durations[checkpoint.id]}/></li>)}</ul>
 </div></Disclosure>;
}
