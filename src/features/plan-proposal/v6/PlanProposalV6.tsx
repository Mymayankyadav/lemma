import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {useApproveProposal,useProposal,useProject,useRejectProposal} from '../../../data/hooks';
import {getProposalDraftApi} from '../../../data/proposal-drafts';
import {normalizeDraftPayload} from '../../../data/proposal-drafts/model';
import {ProposalDraftError,type ProposalDraftConflict,type ProposalDraftRecord,
 type ProposalEditPayload} from '../../../data/proposal-drafts/contract';
import {proposalComparison} from './comparison';

const control='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50';
function payloadText(payload:ProposalEditPayload):string{return JSON.stringify(payload,null,2)}
function readPayload(text:string):ProposalEditPayload{
 return normalizeDraftPayload(JSON.parse(text) as ProposalEditPayload);
}
export default function PlanProposalV6(){
 const {id=''}=useParams(),navigate=useNavigate(),proposal=useProposal(id);
 const project=useProject(proposal.data?.projectSlug??'');
 const approve=useApproveProposal(),reject=useRejectProposal();
 const [draft,setDraft]=useState<ProposalDraftRecord|null>(null);
 const [editor,setEditor]=useState(false),[text,setText]=useState('');
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [problem,setProblem]=useState(''),[pending,setPending]=useState(false);
 const [conflict,setConflict]=useState<ProposalDraftConflict|null>(null),[reload,setReload]=useState(0);
 const loadedDraftKey=useRef('');
 // React Router reuses this route component between proposal IDs. An open
 // editor must not stay bound to the prior proposal or disable the next
 // proposal's independent approve/reject decision.
 useEffect(()=>{setEditor(false);setText('');setConflict(null)},[id]);
 useEffect(()=>{
  if(!id||!proposal.data)return;
  // Query data may be revalidated while the owner types an unsaved draft.
  // Only an explicit Reload or a different proposal must replace the editor.
  const key=id+'|'+reload;
  if(loadedDraftKey.current===key)return;
  loadedDraftKey.current=key;
  let alive=true;
  setStatus('loading');setProblem('');setConflict(null);setDraft(null);
  void (async()=>{
   const api=getProposalDraftApi(),seen=new Set<string>();
   let cursor:string|null=null,found:ProposalDraftRecord|null=null;
   for(let i=0;i<10;i++){
    const page=await api.listDrafts({proposalId:id,status:['draft','saved','submitted'],limit:50,cursor});
    if(page.items.length>50||!Number.isSafeInteger(page.total)||page.total<0)
     throw Error('Invalid owner draft page');
    for(const candidate of page.items){
     if(candidate.proposalId!==id)throw Error('Draft from unrelated proposal');
     const candidateActive=candidate.status==='draft'||candidate.status==='saved';
     const foundActive=found?.status==='draft'||found?.status==='saved';
     // Keep a currently editable draft ahead of submitted history, but show
     // the latest immutable submission when no active draft exists.
     if(!found||(candidateActive&&!foundActive)||
      (candidateActive===foundActive&&candidate.editedAt>found.editedAt))
      found=candidate;
    }
    if(!page.nextCursor)break;
    if(seen.has(page.nextCursor)||i===9)throw Error('Repeated/unbounded owner draft cursor');
    seen.add(page.nextCursor);cursor=page.nextCursor;
   }
   if(!alive)return;
   setDraft(found);setText(found?payloadText(found.payload):
    payloadText({...((proposal.data!.planChange??proposal.data!.plan??{ops:[]}))}));
   setStatus('ready');
  })().catch(error=>{if(alive){setStatus('error');setProblem(error instanceof Error?error.message:'Could not read drafts');}});
  return ()=>{alive=false};
 },[id,proposal.data,reload]);
 const p=proposal.data;
 const comparisons=useMemo(()=>p?proposalComparison(p,project.data?.checkpoints??[]):null,
  [p,project.data]);
 async function save(){
  if(!draft||pending||!['draft','saved'].includes(draft.status))return;
  setPending(true);setProblem('');setConflict(null);
  try{
   const candidate=readPayload(text);
   const result=await getProposalDraftApi().saveDraft(draft.id,draft.draftVersion,candidate);
   setDraft(result.record);setText(payloadText(result.record.payload));setEditor(false);
  }catch(e){
   if(e instanceof ProposalDraftError&&e.details)setConflict(e.details);
   setProblem(e instanceof Error?e.message:'Could not save draft');
  }finally{setPending(false)}
 }
 async function submit(){
  if(!draft||pending||draft.status!=='saved'||editor)return;
  setPending(true);setProblem('');setConflict(null);
  try{
   const result=await getProposalDraftApi().submitDraft(
    draft.id,draft.draftVersion,draft.baseVersions);
   setDraft(result.record);setEditor(false);
  }catch(e){
   if(e instanceof ProposalDraftError&&e.details)setConflict(e.details);
   setProblem(e instanceof Error?e.message:'Could not submit draft');
  }finally{setPending(false)}
 }
 async function decide(accept:boolean){
  if(!p||pending||editor)return;
  setPending(true);setProblem('');
  try{
   if(accept)await approve.mutateAsync({id:p.id});
   else await reject.mutateAsync(p.id);
   void navigate(accept?'/p/'+p.projectSlug:'/proposals?tab=plan');
  }catch(e){setProblem(e instanceof Error?e.message:'Could not complete proposal decision')}
  finally{setPending(false)}
 }
 const ready=!!p&&!proposal.isPending;
 return <main aria-label="Plan proposal review" className="flex flex-col gap-4 p-4 pb-28 text-ink">
  <h1 className="text-title-s font-semibold">Plan proposal review</h1>
  {proposal.isPending&&<p role="status">Loading proposal…</p>}
  {(proposal.isError||!p&&!proposal.isPending)&&<p role="alert">Proposal unavailable.
   <button type="button" className={control} onClick={()=>{void proposal.refetch()}}>Retry</button>
  </p>}
  {ready&&p&&<>
   <p className="text-label text-ink-2">{p.kind==='plan'?'New plan':'Plan change'} · {p.projectSlug}</p>
   {p.reason?<section aria-label="Proposal rationale">
    <h2 className="text-body font-semibold">Rationale</h2>
    <p className="whitespace-pre-wrap text-label">{p.reason}</p>
   </section>:<p className="text-label text-ink-2">No rationale supplied.</p>}
   {project.isPending&&<p role="status">Loading current plan…</p>}
   {project.isError&&<p role="alert">Current plan unavailable; comparison is incomplete.
    <button type="button" className={control} onClick={()=>{void project.refetch()}}>Retry</button>
   </p>}
   {comparisons&&<div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Before and after plan targets">
    <section aria-label="Before targets" className="rounded-ctl border border-edge p-3">
     <h2 className="text-body font-semibold">Before · {comparisons.before.length} checkpoints</h2>
     <ul>{comparisons.before.map(node=><li key={node.code} className="border-b border-edge py-2 text-label">
      <strong>{node.code}</strong> · {node.title}</li>)}</ul>
     {!comparisons.before.length&&<p className="text-caption">No approved checkpoints yet.</p>}
    </section>
    <section aria-label="After targets" className="rounded-ctl border border-edge p-3">
     <h2 className="text-body font-semibold">After · {comparisons.after.length} checkpoints</h2>
     <ul>{comparisons.after.map(node=><li key={node.code} className="border-b border-edge py-2 text-label">
      <strong>{node.code}</strong> · {node.title}
      {comparisons.adds.includes(node.code)&&<span className="ml-2 text-amber">Added</span>}
      {comparisons.changed.includes(node.code)&&<span className="ml-2 text-amber">Changed</span>}
     </li>)}</ul>
     {!comparisons.after.length&&<p className="text-caption">No checkpoints in the proposed plan.</p>}
    </section>
   </div>}
   {comparisons?.removes.length? <p className="text-label">Removed: {comparisons.removes.join(', ')}</p>:null}
   <section aria-label="Source citations">
    <h2 className="text-body font-semibold">Source citations</h2>
    {comparisons?.citations.length?<ul className="list-disc pl-5 text-label">
     {comparisons.citations.map(s=><li key={s}>{s}</li>)}</ul>:
     <p className="text-label text-ink-2">No cited sources in this proposal.</p>}
   </section>
   <section aria-label="Editable proposal draft" className="flex flex-col gap-3 rounded-ctl border border-edge p-3">
    <h2 className="text-body font-semibold">Editable proposal draft</h2>
    {status==='loading'&&<p role="status">Loading drafts…</p>}
    {status==='error'&&<button type="button" className={control} onClick={()=>setReload(x=>x+1)}>Retry drafts</button>}
    {status==='ready'&&!draft&&<p className="text-label text-ink-2">
     No saved draft exists. Creating one needs authenticated proposal and target versions,
     which this proposal read view does not expose. No version or ownership is guessed.
    </p>}
    {draft&&<>
     <p className="text-caption text-ink-2">Draft {draft.status} · version {draft.draftVersion}
      · base proposal {draft.baseVersions.proposal} / target {draft.baseVersions.target}</p>
     {draft.status==='submitted'&&<p role="status" className="text-label text-ink-2">
      Draft submitted. Its submission is not plan approval; the proposal decision remains separate.
     </p>}
     {!editor?<pre className="max-h-40 overflow-auto rounded-ctl bg-well p-2 text-caption">{payloadText(draft.payload)}</pre>:
      <label className="text-label">Full draft payload (JSON)
       <textarea aria-label="Full draft payload" className="mt-1 min-h-44 w-full rounded-ctl border border-edge bg-well p-2 font-mono text-caption"
        value={text} onChange={e=>setText(e.target.value)}/>
      </label>}
     <div className="flex flex-wrap gap-2">
      {editor?<button className={control} disabled={pending} onClick={()=>{void save()}} type="button">Save draft</button>:
       <button className={control} disabled={pending||!['draft','saved'].includes(draft.status)}
        onClick={()=>setEditor(true)} type="button">Edit draft</button>}
      {editor&&<button className={control} type="button" onClick={()=>{setEditor(false);setText(payloadText(draft.payload))}}>Cancel edit</button>}
      <button type="button" className={control} disabled={pending||draft.status!=='saved'||editor}
       onClick={()=>{void submit()}}>Submit draft</button>
     </div>
    </>}
    {problem&&<p role="alert" className="text-label">{problem}</p>}
    {conflict&&<section aria-label="Draft conflict" className="rounded-ctl border border-edge p-3">
     <h3 className="text-label font-semibold">Draft changed elsewhere · {conflict.kind.replace('_',' ')}</h3>
     <p className="text-caption">Base versions: proposal {conflict.baseVersions.proposal}, target {conflict.baseVersions.target}</p>
     {conflict.currentSourceVersions&&<p className="text-caption" data-current-source-versions="">
      Current source versions: proposal {conflict.currentSourceVersions.proposal},
      target {conflict.currentSourceVersions.target}. Reload before retrying.
     </p>}
     <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {([
       ['Base',conflict.baseVersions],
       ['Current',conflict.current.payload],
       ['Your draft',conflict.attemptedPayload],
      ] as const).map(([label,value])=><section key={label}>
       <h4 className="text-label font-semibold">{label}</h4>
       <pre className="max-h-52 overflow-auto text-caption">{JSON.stringify(value,null,2)}</pre>
      </section>)}
     </div>
     <button type="button" className={control} onClick={()=>setReload(x=>x+1)}>Reload current draft</button>
    </section>}
   </section>
   {editor&&<p className="text-caption text-ink-2">Save or cancel your draft edit before deciding on this plan.</p>}
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={pending||editor} className={control} onClick={()=>{void decide(true)}}>Approve plan</button>
    <button type="button" disabled={pending||editor} className={control} onClick={()=>{void decide(false)}}>Reject proposal</button>
   </div>
  </>}
 </main>;
}
