import {useState} from 'react';
import {Link} from 'react-router';
import {useAtlasModel,useRefreshAtlas,decideLink,setConceptKind} from '../../../data/adaptive/atlas-api';
import {KINDS,type Kind} from '../../../../supabase/functions/_shared/adaptive/kc';
import {ProficiencyValue,IntervalBar,StageStrip,GapBadge,LinkKindChip} from '../../../ui/v7/AtlasValues';
import {Button,Picker} from '../../../ui/v7/components';
import {isFlagOn} from '../../../flags';
import {formatShortDate} from '../../../lib/format';

function Failure({text}:{text:string}){return <p role="alert">{text}</p>;}
function AttemptHistoryPanel({conceptId,sessionId,checkpointId}:{conceptId?:string;sessionId?:string;checkpointId?:string}){
 const q=useAtlasModel();if(!q.data)return null;const v=q.data;
 const attempts=v.attempts.filter(a=>(!sessionId||a.session_id===sessionId)&&(!checkpointId||a.checkpoint_id===checkpointId)&&(!conceptId||(v.model.facts.tags??[]).some(t=>String(t.attempt_id)===String(a.id)&&t.concept_id===conceptId))).slice().reverse().slice(0,5);
 return <section className="v7-atlas-panel" aria-label="Recent attempts"><h3>Recent attempts</h3>{!attempts.length?<p>No attempts yet.</p>:<ul>{attempts.map(a=><li key={a.id}><StageStrip stages={(v.model.facts.tags??[]).filter(t=>String(t.attempt_id)===String(a.id)).map(t=>({...t,stage:t.stage??''}))} legacy={!!a.legacy_outcome} cued={a.cued?.length>0}/><small> {formatShortDate(a.occurred_at)}</small></li>)}</ul>}</section>;
}
function ConceptFacetsPanel({id}:{id:string}){
 const q=useAtlasModel(),refresh=useRefreshAtlas(),[error,setError]=useState(''),[busy,setBusy]=useState(false);const v=q.data,c=v?.model.facts.concepts.find(c=>c.id===id);
 if(q.isPending)return <p role="status">Loading facets…</p>;if(q.isError)return <Failure text="Could not load Atlas estimates."/>;if(!c||!v)return null;
 const fs=v.facets[id]??[],gap=Math.max(.05,...fs.map(f=>f.gap));
 async function editKind(kind:Kind){if(!c)return;setBusy(true);try{await setConceptKind(id,kind,(c as any).version??1);await refresh();setError('');}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <section className="v7-atlas-panel" aria-label="Knowledge facets"><h3 className="v7-subhead">Facets</h3><Picker label="Kind" disabled={busy} value={c.kind??'topic'} options={[...KINDS]} onChange={v=>{void editKind(v as Kind);}}/>
  <dl>{fs.map(f=><div key={f.facet} className="v7-atlas-row"><dt>{f.facet}</dt><dd><ProficiencyValue value={f}/>{f.state!=='none'&&<IntervalBar {...f} label={f.facet}/>}</dd></div>)}</dl>
  <div className="v7-atlas-row"><GapBadge p={gap}/><Button small onClick={()=>{void navigator.clipboard.writeText('Give me an uncued one-minute recall or recognition probe on '+c.name+'. Log the stage and hint level.').catch(()=>setError('Could not copy probe prompt.'));}}>Copy probe prompt</Button></div>
  <h3 className="v7-subhead">Links</h3>{v.links.filter(l=>l.from_id===id||l.to_id===id).map(l=><div key={l.id} className="v7-atlas-row"><span>{v.model.facts.concepts.find(c=>c.id===(l.from_id===id?l.to_id:l.from_id))?.name}<LinkKindChip kind={l.kind} proposed={l.status==='proposed'}/></span>{l.status==='proposed'&&<><Button small onClick={()=>{void decideLink(l.id,true,(l as any).version??1).then(refresh).catch(e=>setError(String(e)));}}>Approve</Button><Button small onClick={()=>{void decideLink(l.id,false,(l as any).version??1).then(refresh).catch(e=>setError(String(e)));}}>Reject</Button></>}</div>)}
  {error&&<Failure text={error}/>}<AttemptHistoryPanel conceptId={id}/>
 </section>;
}

export function ConceptFacets({id}:{id:string}) {
  return isFlagOn('atlasV3')?<ConceptFacetsPanel id={id}/>:null;
}
