import {useMemo,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {Link as LinkIcon,Minus,MoveRight,Pencil,Plus,Unlink} from 'lucide-react';
import {useApproveProposal,useProject,useProjects,useProposal,useRejectProposal} from '../../../data/hooks';
import type {CheckpointView} from '../../../data/types';
import {DetailHeader} from '../../../app/v7/V7Shell';
import {Button,Skeleton} from '../../../ui/v7/components';
import {MetaChip,StatusBadge} from '../../../ui/v7/Status';
import {subjectClass} from '../../../ui/v7/Subject';
import {useMinWidth} from '../../../app/v7/useMinWidth';
import {kitSubject} from '../../atlas/v7/model';
import {nodeStateOf,nodeWord} from '../../project/v7/pathModel';
import {changeRows,type ChangeIcon} from '../../proposals/v7/inboxModel';
import {proposalComparison} from '../v6/comparison';
import {changeSummary} from '../v6/PlanProposalV6';
import {payloadText,useProposalDraft} from '../useProposalDraft';
import type {ReviewNode} from '../nodes';
import '../../project/v7/path.css';
import '../../project/v7/learning.css';
import '../../proposals/v7/inbox.css';

const changeIcon:Record<ChangeIcon,typeof Plus>={add:Plus,link:LinkIcon,unlink:Unlink,edit:Pencil,remove:Minus,move:MoveRight};

/** The plan as the path map of §6.9, with "Added" and "Changed" on the affected nodes. */
function PlanMap({title,nodes,existing,adds,changed}:{title:string;nodes:readonly ReviewNode[];existing:Map<string,CheckpointView>;adds:readonly string[];changed:readonly string[]}){
 return <section className="v7-plan-map" aria-label={title}><h2 className="v7-learn-h2">{title} · {nodes.length}</h2>
  {nodes.length?<ol className="v7-path-map">{nodes.map(node=>{
   const cp=existing.get(node.code),added=adds.includes(node.code),edit=!added&&changed.includes(node.code);
   const state=added||!cp?'proposed':nodeStateOf(cp.ui);
   return <li key={node.code} className="v7-path-row" data-state={state} data-reached="false">
    <svg className="v7-path-node" data-state={state} width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
     {state==='demonstrated'?<path d="M10 2.2l2.2 5 5.4.5-4.1 3.6 1.2 5.3L10 13.9l-4.7 2.7 1.2-5.3-4.1-3.6 5.4-.5z" className="v7-path-demonstrated"/>
      :state==='proposed'?<circle cx="10" cy="10" r="7" className="v7-path-dashed"/>:state==='current'?<circle cx="10" cy="10" r="6.5" className="v7-path-ring"/>
      :state==='locked'?<circle cx="10" cy="10" r="4" className="v7-path-dim"/>:<circle cx="10" cy="10" r="6.5" className="v7-path-hollow"/>}
    </svg>
    <span className="v7-path-body"><strong>{node.title}</strong><small>{node.code}{node.stage?' · '+node.stage:''}{cp&&!added?' · '+nodeWord[nodeStateOf(cp.ui)]:''}</small></span>
    {added?<MetaChip kind="added">Added</MetaChip>:edit?<MetaChip kind="changed">Changed</MetaChip>:<span/>}
   </li>;})}</ol>:<p className="v7-learn-empty">No checkpoints.</p>}
 </section>;
}

/** PLAN §6.10 Plan proposal: what changes first, the whole plan as a path map (before and after side by side on desktop),
 *  sources, the advanced draft editor (#1343) and Reject / Approve in a sticky bar (Reject on the left, V17). */
export default function PlanProposalV7(){
 const {id=''}=useParams(),navigate=useNavigate(),proposal=useProposal(id),projects=useProjects();
 const p=proposal.data,project=useProject(p?.projectSlug??'');
 const approve=useApproveProposal(),reject=useRejectProposal(),wide=useMinWidth(900);
 const draft=useProposalDraft(id,p);
 const [problem,setProblem]=useState(''),[busy,setBusy]=useState(false);
 const comparison=useMemo(()=>p&&project.data?proposalComparison(p,project.data.checkpoints??[]):null,[p,project.data]);
 const existing=useMemo(()=>new Map((project.data?.checkpoints??[]).map(cp=>[cp.code,cp])),[project.data]);
 const summary=projects.data?.find(row=>row.slug===p?.projectSlug),subject=kitSubject(summary?.subject.name??project.data?.subject.name??'');
 const back='/proposals?tab=plan';
 async function decide(accept:boolean){
  if(!p||busy||draft.editor||!project.data)return;
  setBusy(true);setProblem('');
  try{
   if(accept)await approve.mutateAsync({id:p.id});else await reject.mutateAsync(p.id);
   navigate(accept?'/p/'+encodeURIComponent(p.projectSlug):back);
  }catch(error){setProblem(error instanceof Error?error.message:'Could not complete the decision.');}
  finally{setBusy(false);}
 }
 if(proposal.isPending)return <main id="main-content" className="v7-page v7-learn" aria-label="Plan proposal"><DetailHeader title="Plan proposal" back={back}/><Skeleton/></main>;
 if(proposal.isError||!p)return <main id="main-content" className="v7-page v7-learn" aria-label="Plan proposal"><DetailHeader title="Plan proposal" back={back}/>
  <div role="alert" className="v7-learn-empty"><p>Proposal unavailable.</p><Button onClick={()=>{void proposal.refetch();}}>Try again</Button></div></main>;
 const title=summary?.title??project.data?.project.title??p.projectSlug;
 const rows=p.planChange?changeRows(p.planChange.ops,code=>existing.get(code)?.title??code):[];
 const unavailable=busy||draft.editor||!project.data;
 return <main id="main-content" className={'v7-page v7-learn v7-planp '+subjectClass(subject)} aria-label="Plan proposal">
  <DetailHeader title="Plan proposal" back={back}/>
  <header className="v7-learn-head">
   <p className="v7-eyebrow">{(p.kind==='plan'?'New plan':'Plan change')+' · '+title+(p.sessionNumber!==null?' · Session '+p.sessionNumber:'')}</p>
   <h1 className="v7-learn-title">What changes</h1>
   {comparison&&<p className="v7-meta">{changeSummary(comparison.adds.length,comparison.changed.length,comparison.removes.length)}</p>}
  </header>
  {project.isPending&&<Skeleton/>}
  {project.isError&&<div role="alert" className="v7-learn-empty"><p>The current plan is unavailable, so the comparison is incomplete.</p><Button onClick={()=>{void project.refetch();}}>Try again</Button></div>}
  {rows.length>0&&<ul className="v7-inbox-changes v7-learn-card" aria-label="Changes">{rows.map((row,index)=>{const Icon=changeIcon[row.icon];return <li key={index}><Icon aria-hidden="true"/><span>{row.text}</span></li>;})}</ul>}
  {comparison&&comparison.removes.length>0&&<p className="v7-meta">{'Removed: '+comparison.removes.map(code=>existing.get(code)?.title??code).join(', ')}</p>}
  {p.reason&&<section className="v7-learn-card" aria-label="Why"><p className="v7-eyebrow">Why</p><p>{p.reason}</p></section>}
  {comparison&&<div className={wide?'v7-planp-split':'v7-planp-stack'}>
   {wide&&<PlanMap title="Before" nodes={comparison.before} existing={existing} adds={[]} changed={[]}/>}
   <PlanMap title={wide?'After':'The whole plan'} nodes={comparison.after} existing={existing} adds={comparison.adds} changed={comparison.changed}/>
  </div>}
  {comparison&&comparison.citations.length>0&&<section aria-label="Sources"><h2 className="v7-learn-h2">Sources</h2>
   <div className="v7-learn-chiprow">{comparison.citations.map(item=><span key={item} className="v7-learn-chip">{item}</span>)}</div></section>}
  {draft.draftSupported&&<details className="v7-learn-card v7-planp-draft">
   <summary>Edit before approving (advanced)</summary>
   {draft.status==='loading'&&<Skeleton/>}
   {draft.status==='error'&&<Button onClick={()=>draft.setReload(value=>value+1)}>Retry drafts</Button>}
   {draft.status==='ready'&&<>
    {draft.draft?<p className="v7-meta">{'Draft '+draft.draft.status+' · version '+draft.draft.draftVersion}</p>:<p className="v7-meta">No saved edit yet. Write the change you want your tutor's plan to include, then send it.</p>}
    {draft.draft?.status==='submitted'&&<p role="status">Edit sent. Sending it does not approve the plan; that decision stays below.</p>}
    {draft.editor?<label className="v7-field-group"><span>Edit (JSON)</span><textarea aria-label="Full draft payload" className="v7-field v7-planp-json" value={draft.text} onChange={event=>draft.setText(event.target.value)}/></label>
     :draft.draft&&<pre className="v7-planp-json">{payloadText(draft.draft.payload)}</pre>}
    <div className="v7-learn-chips">
     {!draft.draft&&(draft.editor?<><Button onClick={()=>{void draft.create();}} loading={draft.pending}>Save edit</Button><Button variant="ghost" onClick={()=>draft.setEditor(false)}>Cancel</Button></>
      :<Button onClick={()=>draft.setEditor(true)}>Start an edit</Button>)}
     {draft.draft&&(draft.editor?<><Button onClick={()=>{void draft.save();}} loading={draft.pending}>Save edit</Button><Button variant="ghost" onClick={()=>{draft.setEditor(false);draft.setText(payloadText(draft.draft!.payload));}}>Cancel</Button></>
      :<Button disabled={!['draft','saved'].includes(draft.draft.status)} onClick={()=>draft.setEditor(true)}>Change edit</Button>)}
     {draft.draft&&<Button disabled={draft.pending||draft.draft.status!=='saved'||draft.editor} onClick={()=>{void draft.submit();}}>Send edit</Button>}
    </div>
   </>}
   {draft.problem&&<p role="alert" className="v7-error">{draft.problem}</p>}
   {draft.conflict&&<div role="alert" className="v7-learn-empty"><p>This edit changed elsewhere. Reload it before trying again.</p><Button onClick={()=>draft.setReload(value=>value+1)}>Reload edit</Button></div>}
  </details>}
  {draft.editor&&<p className="v7-meta">Save or cancel your edit before deciding on this plan.</p>}
  {problem&&<p role="alert" className="v7-error">{problem}</p>}
  {/* V17: Reject left, Approve right, as in the Inbox and the kit's rule; Approve keeps the wide column. */}
  <div className="v7-learn-bar v7-learn-bar-decide" role="group" aria-label="Plan decision">
   <Button disabled={unavailable} loading={busy&&reject.isPending} onClick={()=>{void decide(false);}}>Reject</Button>
   <Button variant="primary" disabled={unavailable} loading={busy&&approve.isPending} onClick={()=>{void decide(true);}}>Approve</Button>
  </div>
 </main>;
}
