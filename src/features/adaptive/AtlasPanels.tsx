import {useContext,useState} from 'react';
import {QueryClientContext} from '@tanstack/react-query';
import {Link} from 'react-router';
import {useAtlasModel,useRefreshAtlas,decideLink,setConceptKind,updateAtlasSettings} from '../../data/adaptive/atlas-api';
import {KINDS,type Kind} from '../../../supabase/functions/_shared/adaptive/kc';
import {ATLAS_DEFAULTS} from '../../../supabase/functions/_shared/adaptive/policy';
import {ProficiencyValue,IntervalBar,StageStrip,GapBadge,LinkKindChip,FitMeter,CardBudget,EstimateRange} from '../../ui/v7/AtlasValues';
import {Button,Picker} from '../../ui/v7/components';
import {ATLAS_FILTERS,type AtlasFilter} from '../atlas/v7/filters';
import {isFlagOn} from '../../flags';
import {getStudyApi} from '../../data/study';
import {groupProposals} from '../../../supabase/functions/_shared/adaptive/links';
import {reliabilityBins} from '../../../supabase/functions/_shared/adaptive/diagnostics';
import type {ComponentType} from 'react';
function Failure({text}:{text:string}){return <p role="alert">{text}</p>;}
function AttemptHistoryPanel({conceptId,sessionId,checkpointId}:{conceptId?:string;sessionId?:string;checkpointId?:string}){
 const q=useAtlasModel();if(!q.data)return null;const v=q.data;
 const attempts=v.attempts.filter(a=>(!sessionId||a.session_id===sessionId)&&(!checkpointId||a.checkpoint_id===checkpointId)&&(!conceptId||(v.model.facts.tags??[]).some(t=>String(t.attempt_id)===String(a.id)&&t.concept_id===conceptId))).slice().reverse().slice(0,5);
 return <section className="v7-atlas-panel" aria-label="Recent attempts"><h3>Recent attempts</h3>{!attempts.length?<p>No attempts yet.</p>:<ul>{attempts.map(a=><li key={a.id}><StageStrip stages={(v.model.facts.tags??[]).filter(t=>String(t.attempt_id)===String(a.id)).map(t=>({...t,stage:t.stage??''}))} legacy={!!a.legacy_outcome} cued={a.cued?.length>0}/><small> {String(a.occurred_at).slice(0,10)}</small></li>)}</ul>}</section>;
}
function ConceptFacetsPanel({id}:{id:string}){
 const q=useAtlasModel(),refresh=useRefreshAtlas(),[error,setError]=useState(''),[busy,setBusy]=useState(false);const v=q.data,c=v?.model.facts.concepts.find(c=>c.id===id);
 if(q.isPending)return <p role="status">Loading facets…</p>;if(q.isError)return <Failure text="Could not load Atlas estimates."/>;if(!c||!v)return null;
 const fs=v.facets[id]??[],gap=Math.max(.05,...fs.map(f=>f.gap));
 async function editKind(kind:Kind){if(!c)return;setBusy(true);try{await setConceptKind(id,kind,(c as any).version??1);await refresh();setError('');}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <section className="v7-atlas-panel" aria-label="Knowledge facets"><h3>Facets</h3><Picker label="Kind" disabled={busy} value={c.kind??'topic'} options={[...KINDS]} onChange={v=>{void editKind(v as Kind);}}/>
  <div className="v7-atlas-scroll"><table><thead><tr><th>Facet</th><th>Clean pass · 80% interval</th></tr></thead><tbody>{fs.map(f=><tr key={f.facet}><th scope="row">{f.facet}</th><td><ProficiencyValue value={f}/>{f.state!=='none'&&<IntervalBar {...f} label={f.facet}/>}</td></tr>)}</tbody></table></div>
  <div className="v7-atlas-row"><GapBadge p={gap}/><Button small onClick={()=>{void navigator.clipboard.writeText('Give me an uncued one-minute recall or recognition probe on '+c.name+'. Log the stage and hint level.').catch(()=>setError('Could not copy probe prompt.'));}}>Copy probe prompt</Button></div>
  <h3>Links</h3>{v.links.filter(l=>l.from_id===id||l.to_id===id).map(l=><div key={l.id} className="v7-atlas-row"><span>{v.model.facts.concepts.find(c=>c.id===(l.from_id===id?l.to_id:l.from_id))?.name}<LinkKindChip kind={l.kind} proposed={l.status==='proposed'}/></span>{l.status==='proposed'&&<><Button small onClick={()=>{void decideLink(l.id,true,(l as any).version??1).then(refresh).catch(e=>setError(String(e)));}}>Approve</Button><Button small onClick={()=>{void decideLink(l.id,false,(l as any).version??1).then(refresh).catch(e=>setError(String(e)));}}>Reject</Button></>}</div>)}
  {error&&<Failure text={error}/>}<AttemptHistory conceptId={id}/>
 </section>;
}
function AtlasExplorePanel({view,onView}:{view:'map'|'themes'|'bridges';onView:(v:'map'|'themes'|'bridges')=>void}){
 const q=useAtlasModel();
 return <section className="v7-atlas-explore" aria-label="Atlas views"><nav aria-label="Atlas model views">{(['map','themes','bridges'] as const).map(v=><button key={v} type="button" aria-pressed={view===v} onClick={()=>onView(v)}>{v[0].toUpperCase()+v.slice(1)}</button>)}</nav>
  {view!=='map'&&<div className="v7-atlas-panel">{q.isPending?<p>Loading Atlas…</p>:q.isError?<Failure text="Could not load Atlas views."/>:q.data&&<>{view==='themes'?<><h2>Themes</h2>{q.data.themes.length?q.data.themes.map(t=><details key={t.id}><summary>{t.name}</summary>{t.instances.map(id=><p key={id}><Link to={'/atlas?id='+id}>{q.data!.model.facts.concepts.find(c=>c.id===id)?.name}</Link> {q.data!.facets[id]?.[0]&&<ProficiencyValue value={q.data!.facets[id][0]}/>}</p>)}</details>):<p>No themes yet.</p>}</>:<><h2>Bridges</h2>{q.data.bridges.length?q.data.bridges.map((b,i)=>{const from=q.data!.model.facts.concepts.find(c=>c.id===b.from)?.name,to=q.data!.model.facts.concepts.find(c=>c.id===b.to)?.name;return <details key={i} className="v7-atlas-bridge" data-dashed={b.strength.dashed} data-thick={b.strength.thick}><summary><span>{from} → {to}</span> <small>{b.strength.u} uses · {b.strength.o} opportunities</small></summary><p>{b.strength.dashed?'No opportunities yet: nothing you have done in another subject has needed '+from+'. When both ends are secure it becomes a stretch candidate.':b.strength.o+' uncued attempts in other subjects needed '+from+'; you used it unprompted and correctly in '+b.strength.u+'. Strength '+b.strength.mean.toFixed(2)+(b.strength.thick?' (thick)':' (thin)')+'.'}</p></details>;}):<p>No bridges yet.</p>}</>}</>}</div>}
 </section>;
}
function CalibrationChart({rows}:{rows:{p:number;y:number}[]}){
 const bins=reliabilityBins(rows);if(!bins.length)return <p>Calibration chart: insufficient data</p>;
 const size=160,x=(v:number)=>8+v*(size-16),y=(v:number)=>size-8-v*(size-16);
 return <figure aria-label="Calibration: predicted against observed"><svg viewBox={'0 0 '+size+' '+size} role="img" aria-label="Predicted probability against observed rate; the diagonal is perfect calibration" width="100%" style={{maxWidth:'20rem'}}><line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="currentColor" strokeDasharray="3 3" opacity=".5" vectorEffect="non-scaling-stroke"/>{bins.map(b=><circle key={b.lo} cx={x(b.predicted)} cy={y(b.observed)} r={2+Math.min(4,Math.sqrt(b.n)/2)} fill="currentColor" opacity=".8"/>)}</svg><figcaption><small>Each dot is a bin of predictions; on the dashed line a prediction of 0.7 comes true 70% of the time.</small></figcaption><table className="v7-atlas-scroll"><caption className="v7-sr-only">Calibration bins</caption><thead><tr><th>Predicted</th><th>Observed</th><th>n</th></tr></thead><tbody>{bins.map(b=><tr key={b.lo}><td>{b.predicted.toFixed(2)}</td><td>{b.observed.toFixed(2)}</td><td>{b.n}</td></tr>)}</tbody></table></figure>;
}
function AtlasFiltersPanel({filter,onFilter,kind,onKind,floating=false}:{filter:AtlasFilter;onFilter:(f:AtlasFilter)=>void;kind:string;onKind:(k:string)=>void;floating?:boolean}){
 return <nav aria-label="Atlas filters" className={'v7-atlas-filters'+(floating?' v7-atlas-filters-floating':'')}>{ATLAS_FILTERS.map(f=><button key={f} type="button" aria-pressed={filter===f} onClick={()=>onFilter(f)}>{f[0].toUpperCase()+f.slice(1)}</button>)}<Picker label="Kind" value={kind==='any'?'Any':kind} options={['Any',...KINDS]} onChange={v=>onKind(v==='Any'?'any':v)}/></nav>;
}
function AtlasProgressPanel(){const q=useAtlasModel();if(!q.data)return null;const v=q.data,systems=v.model.facts.concepts.filter(c=>c.level==='system');return <section className="v7-atlas-panel" aria-label="Atlas model health"><h2>Atlas</h2><div className="v7-atlas-scroll"><table><thead><tr><th>Area</th><th>Knowledge</th><th>Select</th><th>Execute</th><th>Transfer</th></tr></thead><tbody>{systems.slice(0,20).map(c=><tr key={c.id}><th><Link to={'/atlas?id='+c.id}>{c.name}</Link></th>{['understand','select','execute','transfer'].map(f=>{const value=v.facets[c.id]?.find(x=>x.facet===f);return <td key={f}>{value?<ProficiencyValue value={value}/>:<span>—</span>}</td>;})}</tr>)}</tbody></table></div>
 <h3>Track record</h3><CalibrationChart rows={v.model.trace.filter(x=>x.stream==='attempt')}/>{v.health.some(h=>h.tests.D1===false)&&<p role="status">Model below baseline — simple estimates in use</p>}<ul>{v.health.map(h=><li key={h.stream}><strong>{h.stream}</strong> · {h.n} predictions · {h.status}{h.n>=50&&<span> · log loss {h.loss.toFixed(3)} / PFA {h.pfa.toFixed(3)} / base {h.baseline.toFixed(3)} · slope {h.b.toFixed(2)}</span>}<p>{Object.entries(h.tests).map(([k,v])=>k+': '+(v===null?'insufficient data':v?'pass':'fail')).join(' · ')}</p>{h.actions.map(a=><p key={a}>{a}</p>)}</li>)}</ul></section>;}
function AtlasTodayPanel(){const q=useAtlasModel();if(!q.data)return null;const v=q.data;return <section className="v7-atlas-panel" aria-label="Study model"><h2>Checks → Learn → Practice → Close</h2>{v.capacity===null?<p>Set minutes per weekday to plan your time.</p>:<>{Object.entries(v.fits).slice(0,4).map(([id,f])=><div key={id} className="v7-atlas-row"><FitMeter {...f}/></div>)}<CardBudget {...v.budget}/></>}{v.frustration.active&&<p role="status">Easing off — next 3 practice</p>}<ol>{v.queue.items.slice(0,8).map(a=><li key={a.id}>{a.kind} · {v.model.facts.concepts.find(c=>c.id===a.concept_id)?.name} <small>{a.reason}</small></li>)}</ol></section>;}
function CheckpointReadyPanel({checkpointId}:{checkpointId:string}){const q=useAtlasModel();if(!q.data)return null;const v=q.data,ids=v.checkpointConcepts.filter(c=>c.checkpoint_id===checkpointId).map(c=>c.concept_id as string);return <section className="v7-atlas-panel" aria-label="Ready"><h2>Ready</h2>{[...new Set(ids)].map(id=><div key={id}>{v.model.facts.concepts.find(c=>c.id===id)?.name}{v.facets[id]?.slice(0,1).map(f=><p key={f.facet}><ProficiencyValue value={f}/> · {f.status}</p>)}</div>)}{!ids.length&&<p>Not yet · needs a criterion attempt.</p>}</section>;}
function PathEstimatesPanel({projectId}:{projectId:string}){const q=useAtlasModel();if(!q.data)return null;const v=q.data;return <section className="v7-atlas-panel" aria-label="Plan estimates"><h2>Plan estimates</h2>{v.fits[projectId]&&<FitMeter {...v.fits[projectId]}/>}<ul>{Object.entries(v.durations).filter(([id])=>v.checkpoints.some(c=>c.id===id&&c.project_id===projectId)).slice(0,8).map(([id,d])=><li key={id}><EstimateRange {...d}/></li>)}</ul></section>;}
function AtlasSettingsPanel(){const q=useAtlasModel(),refresh=useRefreshAtlas(),[error,setError]=useState(''),[busy,setBusy]=useState(false);const settings=ATLAS_DEFAULTS;
 const current:Record<string,unknown>=q.data?.settings??{};const [patch,setPatch]=useState<Record<string,unknown>>({});
 async function save(){setBusy(true);try{await updateAtlasSettings(patch);await refresh();setError('');}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <section className="v7-atlas-panel" aria-label="Atlas settings"><h2>Atlas</h2>{([['threshold_p','Mastery threshold',.8,.95,.01],['stretch_share','Stretch share',0,.25,.01],['plan_first_min','Plan-first minimum minutes',0,120,1],['card_quota_share','Card quota share',.25,1,.05],['card_cap','Card share of a block',.05,.4,.025],['card_weight','Card weight in exam utility',0,1,.1]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input type="number" min={min} max={max} step={step} value={Number(patch[key]??current[key]??settings[key])} onChange={e=>setPatch(p=>({...p,[key]:e.target.valueAsNumber}))}/></label>)}<label>Ask confidence before problems<input type="checkbox" checked={Boolean(patch.ask_confidence??current.ask_confidence??true)} onChange={e=>setPatch(p=>({...p,ask_confidence:e.target.checked}))}/></label><Button loading={busy} onClick={()=>{void save();}}>Save Atlas settings</Button>{error&&<Failure text={error}/>}</section>;
}
function AtlasSlotSuggestionsPanel(){
 const q=useAtlasModel(),[made,setMade]=useState<Record<string,{id:string;version:number}|null>>({}),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
 if(!q.data?.slots.length)return null;
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 async function add(slot:{id:string;starts_at:string;ends_at:string}){setBusy(slot.id);setError('');try{const receipt=await getStudyApi().createCalendarBlock({kind:'study',title:'Study block',startsAt:slot.starts_at,endsAt:slot.ends_at,timeZone:zone});setMade(m=>({...m,[slot.id]:{id:receipt.record.id,version:receipt.record.version}}));}catch(e){setError(String(e));}finally{setBusy(null);}}
 async function undo(slotId:string){const m=made[slotId];if(!m)return;setBusy(slotId);setError('');try{await getStudyApi().deleteCalendarBlock(m.id,m.version);setMade(x=>({...x,[slotId]:null}));}catch(e){setError(String(e));}finally{setBusy(null);}}
 return <section className="v7-atlas-panel" aria-label="Suggested study times"><h2>Suggested study times</h2><p><small>Ranked by when you usually keep a block. You choose; nothing is added until you do.</small></p>{q.data.slots.map(({slot,evidence})=><div key={slot.id} className="v7-atlas-row"><span><Link to={'/calendar?date='+slot.starts_at.slice(0,10)+'&view=day'}>{new Date(slot.starts_at).toLocaleString()} · {slot.minutes} min</Link><small> · {evidence}</small></span>{made[slot.id]?<span role="status">Added <Button loading={busy===slot.id} onClick={()=>{void undo(slot.id);}}>Undo</Button></span>:<Button loading={busy===slot.id} onClick={()=>{void add(slot);}}>Add study block</Button>}</div>)}{error&&<Failure text={error}/>}</section>;
}
function LinkProposalsPanel(){const client=useContext(QueryClientContext);return client?<ConnectedLinkProposals/>:null;}
function ConnectedLinkProposals(){const q=useAtlasModel(),refresh=useRefreshAtlas(),[error,setError]=useState(''),[busy,setBusy]=useState(false);const links=q.data?.links.filter(l=>l.status==='proposed')??[];if(!links.length)return null;
 const name=(id:string)=>q.data!.model.facts.concepts.find(c=>c.id===id)?.name;
 async function decide(group:typeof links,approve:boolean){setBusy(true);setError('');try{for(const l of group)await decideLink(l.id,approve,(l as any).version??1);await refresh();}catch(e){setError(String(e));await refresh();}finally{setBusy(false);}}
 return <section className="v7-atlas-panel" aria-label="Link proposals"><h2>Atlas links</h2>{groupProposals(links).map(g=><div key={g.kind} role="group" aria-label={g.kind+' links'}><div className="v7-atlas-row"><h3>{g.kind.replace(/_/g,' ')} · {g.links.length}</h3><span><Button loading={busy} onClick={()=>{void decide(g.links,true);}}>{'Approve all '+g.links.length+' '+g.kind.replace(/_/g,' ')}</Button><Button loading={busy} onClick={()=>{void decide(g.links,false);}}>{'Reject all '+g.links.length+' '+g.kind.replace(/_/g,' ')}</Button></span></div>{g.links.map(l=><article key={l.id}><p>{name(l.from_id)} → {name(l.to_id)} <LinkKindChip kind={l.kind} proposed/></p><p>{l.rationale} · {Math.round((l.confidence??0)*100)}%</p><Button onClick={()=>{void decide([l],true);}}>Approve link</Button><Button onClick={()=>{void decide([l],false);}}>Reject link</Button></article>)}</div>)}{error&&<Failure text={error}/>}</section>;}

/** The Atlas v3 panels are Build-stage work behind the `atlasV3` flag (default off): with it off nothing renders, so every existing screen is unchanged. */
function gated<P extends object>(Panel:ComponentType<P>):ComponentType<P>{return function Gated(props:P){return isFlagOn('atlasV3')?<Panel {...props}/>:null;};}
export const AttemptHistory=gated(AttemptHistoryPanel);
export const ConceptFacets=gated(ConceptFacetsPanel);
export const AtlasExplore=gated(AtlasExplorePanel);
export const AtlasProgress=gated(AtlasProgressPanel);
export const AtlasToday=gated(AtlasTodayPanel);
export const CheckpointReady=gated(CheckpointReadyPanel);
export const PathEstimates=gated(PathEstimatesPanel);
export const AtlasSettings=gated(AtlasSettingsPanel);
export const AtlasSlotSuggestions=gated(AtlasSlotSuggestionsPanel);
export const LinkProposals=gated(LinkProposalsPanel);
export const AtlasFilters=gated(AtlasFiltersPanel);
