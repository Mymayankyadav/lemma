import {Sparkles} from 'lucide-react';
import {useMemo} from 'react';
import {useNavigate,useParams} from 'react-router';
import {useApproveProposal,useProposal,useProject,useRejectProposal} from '../../../data/hooks';
import {payloadText,useProposalDraft} from '../useProposalDraft';
import {proposalComparison} from './comparison';

const control='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50';
/** "Adds 3 checkpoints · changes 2 · removes 1". */
export function changeSummary(adds:number,changes:number,removes:number):string{
 const parts=[adds?'Adds '+adds+(adds===1?' checkpoint':' checkpoints'):'',changes?'changes '+changes:'',removes?'removes '+removes:'']
  .filter(Boolean).join(' · ');
 return parts?parts.charAt(0).toUpperCase()+parts.slice(1):'No checkpoint changes';
}
export default function PlanProposalV6(){
 const {id=''}=useParams(),navigate=useNavigate(),proposal=useProposal(id);
 const project=useProject(proposal.data?.projectSlug??'');
 const approve=useApproveProposal(),reject=useRejectProposal();
 const {draft,editor,setEditor,text,setText,status,problem,setProblem,pending,setPending,conflict,setReload,draftSupported,routeRef,create,save,submit}=useProposalDraft(id,proposal.data);
 const p=proposal.data;
 // Empty approved checkpoints are meaningful only after the owner's project
 // read succeeds; do not present missing or failed data as a blank base plan.
 const comparisons=useMemo(()=>p&&project.data&&!project.isPending&&!project.isError?
  proposalComparison(p,project.data.checkpoints??[]):null,
  [p,project.data,project.isPending,project.isError]);
 async function decide(accept:boolean){
  if(!p||pending||editor||project.isPending||project.isError||!project.data)return;
  const decisionFor=id;
  setPending(true);setProblem('');
  try{
   if(accept)await approve.mutateAsync({id:p.id});
   else await reject.mutateAsync(p.id);
   if(routeRef.current!==decisionFor)return;
   void navigate(accept?'/p/'+p.projectSlug:'/proposals?tab=plan');
  }catch(e){
   if(routeRef.current===decisionFor)
    setProblem(e instanceof Error?e.message:'Could not complete proposal decision');
  }finally{if(routeRef.current===decisionFor)setPending(false)}
 }
 const ready=!!p&&!proposal.isPending;
 const decisionUnavailable=pending||editor||project.isPending||project.isError||!project.data;
 return <main aria-label="Plan proposal review" className="flex min-w-0 flex-col gap-4 pb-28 text-ink [overflow-wrap:anywhere]">
  <h1 className="sr-only">Plan proposal review</h1>
  {proposal.isPending&&<p role="status">Loading proposal…</p>}
  {(proposal.isError||!p&&!proposal.isPending)&&<p role="alert">Proposal unavailable.
   <button type="button" className={control} onClick={()=>{void proposal.refetch()}}>Retry</button>
  </p>}
  {ready&&p&&<>
   {/* N113 (mockup `13__Page`): kind heading, meta row, stage tiles and one decision row. */}
   <h2 className="text-ink">{p.kind==='plan'?'New plan':'Plan change'}</h2>
   <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-2"><Sparkles size={16} aria-hidden="true"/>Tutor proposal
    <span>· {project.data?.project?.title??'Your learning path'}</span>{comparisons&&<span>· {comparisons.after.length} checkpoints</span>}</p>
   {p.reason?<section aria-label="Proposal rationale">
    <h2 className="text-body font-semibold">Rationale</h2>
    <p className="whitespace-pre-wrap text-label">{p.reason}</p>
   </section>:<p className="text-label text-ink-2">No rationale supplied.</p>}
   {project.isPending&&<p role="status">Loading current plan…</p>}
   {project.isError&&<p role="alert">Current plan unavailable; comparison is incomplete.
    <button type="button" className={control} onClick={()=>{void project.refetch()}}>Retry</button>
   </p>}
   {comparisons&&<section aria-label="What changes" className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
    <h2 className="text-body font-semibold">What changes</h2>
    <p className="text-label text-ink-2">{changeSummary(comparisons.adds.length,comparisons.changed.length,comparisons.removes.length)}</p>
    {comparisons.adds.length+comparisons.changed.length>0&&<ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
     {comparisons.after.filter(node=>comparisons.adds.includes(node.code)||comparisons.changed.includes(node.code)).map(node=>
      <li key={node.code} className="min-w-0 rounded-[8px] border border-[var(--accent)] bg-[var(--paper-2)] px-3 py-2 text-label">
       <span className="text-caption text-ink-2">{comparisons.adds.includes(node.code)?'Added':'Changed'}</span>
       <strong className="block font-medium">{node.title}</strong><span className="text-caption text-ink-2">{node.code}</span></li>)}
    </ul>}
    {comparisons.removes.length>0&&<p className="mt-2 text-label">Removed: {comparisons.removes.join(', ')}</p>}
   </section>}
   {comparisons&&<details className="lemma-disclosure"><summary className="min-h-11 cursor-pointer text-label font-semibold">Compare whole plan</summary>
   <div className="mt-2 flex flex-col gap-3" aria-label="Before and after plan targets">
    <section aria-label="Before targets" className="min-w-0 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
     <div className="proposal-stage-toolbar"><div className="proposal-stage-heading"><h2>Current plan</h2><p>Before · {comparisons.before.length} checkpoints</p></div></div>
     <ul className="grid grid-cols-2 gap-2">{comparisons.before.map(node=><li key={node.code} className="min-w-0 rounded-[8px] border border-[var(--edge)] bg-[var(--paper-2)] px-3 py-2 text-label">
      <strong>{node.code}</strong> · {node.title}</li>)}</ul>
     {!comparisons.before.length&&<p className="text-caption">No approved checkpoints yet.</p>}
    </section>
    <section aria-label="After targets" className="min-w-0 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
     <div className="proposal-stage-toolbar"><div className="proposal-stage-heading"><h2>Plan stages</h2><p>After · {comparisons.after.length} checkpoints</p></div></div>
     <ul className="grid grid-cols-2 gap-2">{comparisons.after.map(node=><li key={node.code} className="min-w-0 rounded-[8px] border border-[var(--edge)] bg-[var(--paper-2)] px-3 py-2 text-label">
      <strong>{node.code}</strong> · {node.title}
      {comparisons.adds.includes(node.code)&&<span className="ml-2 text-amber">Added</span>}
      {comparisons.changed.includes(node.code)&&<span className="ml-2 text-amber">Changed</span>}
     </li>)}</ul>
     {!comparisons.after.length&&<p className="text-caption">No checkpoints in the proposed plan.</p>}
    </section>
   </div></details>}
   <section aria-label="Source citations">
    <h2 className="text-body font-semibold">Source citations</h2>
    {comparisons?.citations.length?<ul className="list-disc pl-5 text-label">
     {comparisons.citations.map(s=><li key={s}>{s}</li>)}</ul>:
     <p className="text-label text-ink-2">No cited sources in this proposal.</p>}
   </section>
   {draftSupported&&<details className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
    <summary className="min-h-11 cursor-pointer text-label font-semibold">Edit before approving (advanced)</summary>
    <section aria-label="Editable proposal draft" className="mt-3 flex flex-col gap-3">
    <h2 className="sr-only">Editable proposal draft</h2>
    {status==='loading'&&<p role="status">Loading drafts…</p>}
    {status==='error'&&<button type="button" className={control} onClick={()=>setReload(x=>x+1)}>Retry drafts</button>}
    {status==='ready'&&!draft&&<>
     <p className="text-label text-ink-2">No saved draft exists. The owner proposal and target versions
      will be checked before creating one. No version or ownership is guessed.
      New drafts start with an empty edit list; enter the change you intend to submit.</p>
     {editor?<>
      <label className="text-label">Full draft payload (JSON)
       <textarea aria-label="Full draft payload" className="mt-1 min-h-44 w-full rounded-ctl border border-edge bg-well p-2 font-mono text-caption"
        value={text} onChange={e=>setText(e.target.value)}/>
      </label>
      <div className="flex flex-wrap gap-2">
       <button type="button" className={control} disabled={pending} onClick={()=>{void create()}}>Create draft</button>
       <button type="button" className={control} disabled={pending} onClick={()=>setEditor(false)}>Cancel edit</button>
      </div>
     </>:<button type="button" className={control} disabled={pending} onClick={()=>setEditor(true)}>Start draft</button>}
    </>}
    {draft&&<>
     <p className="text-caption text-ink-2">Draft {draft.status} · version {draft.draftVersion}
      · base proposal {draft.baseVersions.proposal} / target {draft.baseVersions.target}</p>
     {draft.status==='submitted'&&<p role="status" className="text-label text-ink-2">
      Draft submitted. Its submission is not plan approval; the proposal decision remains separate.
     </p>}
     {!editor?<pre className="max-h-40 max-w-full overflow-auto rounded-ctl bg-well p-2 text-caption">{payloadText(draft.payload)}</pre>:
      <label className="text-label">Full draft payload (JSON)
       <textarea aria-label="Full draft payload" className="mt-1 min-h-44 w-full rounded-ctl border border-edge bg-well p-2 font-mono text-caption"
        value={text} onChange={e=>setText(e.target.value)}/>
      </label>}
     <div className="flex flex-wrap gap-2">
      {editor?<button className={control} disabled={pending} onClick={()=>{void save()}} type="button">Save draft</button>:
       <button className={control} disabled={pending||!['draft','saved'].includes(draft.status)}
        onClick={()=>setEditor(true)} type="button">Edit draft</button>}
      {editor&&<button className={control} type="button" disabled={pending} onClick={()=>{setEditor(false);setText(payloadText(draft.payload))}}>Cancel edit</button>}
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
       <pre className="max-h-52 max-w-full overflow-auto text-caption">{JSON.stringify(value,null,2)}</pre>
      </section>)}
     </div>
     <button type="button" className={control} onClick={()=>setReload(x=>x+1)}>Reload current draft</button>
    </section>}
    </section>
   </details>}
   {editor&&<p className="text-caption text-ink-2">Save or cancel your draft edit before deciding on this plan.</p>}
   <div className="lemma-plan-decisions">
    <button type="button" disabled={decisionUnavailable} className="ui-button ghost px-4" data-ui="proposal-reject" onClick={()=>{void decide(false)}}>Reject proposal</button>
    <button type="button" disabled={decisionUnavailable} className="ui-button px-4 font-semibold" onClick={()=>{void decide(true)}}>Approve plan</button>
   </div>
  </>}
 </main>;
}
