import {useEffect,useRef,useState} from 'react';
import {getProposalDraftApi} from '../../data/proposal-drafts';
import {normalizeDraftPayload} from '../../data/proposal-drafts/model';
import {ProposalDraftError,type ProposalDraftConflict,type ProposalDraftRecord,
 type ProposalEditPayload} from '../../data/proposal-drafts/contract';

export function payloadText(payload:ProposalEditPayload):string{return JSON.stringify(payload,null,2)}
function readPayload(text:string):ProposalEditPayload{
 return normalizeDraftPayload(JSON.parse(text) as ProposalEditPayload);
}
/** N121 E2: validator text never reaches the owner; JSON parse and schema errors become sentences. */
function draftProblem(error:unknown,fallback:string):string{
 const message=error instanceof Error?error.message:'';
 if(error instanceof SyntaxError||/JSON|Unexpected token/i.test(message))return 'The edit is not valid. Check the brackets and quotes, then save again.';
 if(/uuid|expected|invalid|schema|required/i.test(message))return 'This edit is not in a form Lemma can save. Check the changes and try again.';
 return message&&message.length<120&&!/[{}[\]]/.test(message)?message:fallback;
}
/** The owner's saved edit of a plan proposal (#1343): load the newest active draft, create, save and submit it, with
 *  conflicts surfaced. Shared by the v6 screen and the v7 plan proposal; submitting a draft never approves the plan. */
/** `data` is the loaded proposal itself: a refetch that cancels a pending draft read must start it again. */
export function useProposalDraft(id:string,data:object|null|undefined){
 const [draft,setDraft]=useState<ProposalDraftRecord|null>(null);
 const [editor,setEditor]=useState(false),[text,setText]=useState('');
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [problem,setProblem]=useState(''),[pending,setPending]=useState(false);
 const [conflict,setConflict]=useState<ProposalDraftConflict|null>(null),[reload,setReload]=useState(0);
 const loadedDraftKey=useRef('');
 const draftSupported=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
 const routeRef=useRef(id);
 // React Router reuses this route component between proposal IDs. An open
 // editor must not stay bound to the prior proposal or disable the next
 // proposal's independent approve/reject decision.
 useEffect(()=>{
  routeRef.current=id;
  // A -> B -> A navigation may return before B's draft load completes.
  // Invalidate the old key so revisiting A fetches its draft again.
  loadedDraftKey.current='';
  setEditor(false);setText('');setConflict(null);setPending(false);
 },[id]);
 useEffect(()=>{
  if(!id||!data)return;
  if(!draftSupported){setDraft(null);setProblem('');setStatus('ready');return;}
  // Query data may be revalidated while the owner types an unsaved draft.
  // Only an explicit Reload or a different proposal must replace the editor.
  const key=id+'|'+reload;
  if(loadedDraftKey.current===key)return;
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
   // Mark as loaded only after a successful fetch. A proposal query refetch
   // while the draft request is pending cancels that request; it must be
   // allowed to start the replacement rather than strand Loading forever.
   loadedDraftKey.current=key;
   // A proposal preview may contain provenance/citation keys (notably
   // 'source') that the audited edit payload intentionally forbids. Never
   // silently strip those fields or claim the preview is a writable edit.
   // Start a new explicit edit; the unchanged preview stays visible above.
   setDraft(found);setText(found?payloadText(found.payload):payloadText({ops:[]}));
   setStatus('ready');
  })().catch(error=>{if(alive){setStatus('error');setProblem(draftProblem(error,'Could not read your saved edits. Try again.'));}});
  return ()=>{alive=false};
 },[id,data,reload,draftSupported]);
 async function create(){
  if(draft||!editor||pending||status!=='ready'||!data)return;
  const createFor=id;
  setPending(true);setProblem('');setConflict(null);
  try{
   const payload=readPayload(text),api=getProposalDraftApi();
   const source=await api.getSource(id);
   if(routeRef.current!==createFor)return;
   if(!source||source.proposalId!==id)
    throw new ProposalDraftError('not_found','No editable owner proposal target is available');
   const created=await api.createDraft({...source,payload});
   if(routeRef.current!==createFor)return;
   setDraft(created.record);setText(payloadText(created.record.payload));setEditor(false);
  }catch(e){
   if(routeRef.current!==createFor)return;
   if(e instanceof ProposalDraftError&&e.details)setConflict(e.details);
   setProblem(draftProblem(e,'Could not start your edit. Try again.'));
  }finally{if(routeRef.current===createFor)setPending(false)}
 }
 async function save(){
  if(!draft||pending||!['draft','saved'].includes(draft.status))return;
  const saveFor=id;
  setPending(true);setProblem('');setConflict(null);
  try{
   const candidate=readPayload(text);
   const result=await getProposalDraftApi().saveDraft(draft.id,draft.draftVersion,candidate);
   if(routeRef.current!==saveFor)return;
   setDraft(result.record);setText(payloadText(result.record.payload));setEditor(false);
  }catch(e){
   if(routeRef.current!==saveFor)return;
   if(e instanceof ProposalDraftError&&e.details)setConflict(e.details);
   setProblem(draftProblem(e,'Could not save your edit. Try again.'));
  }finally{if(routeRef.current===saveFor)setPending(false)}
 }
 async function submit(){
  if(!draft||pending||draft.status!=='saved'||editor)return;
  const submitFor=id;
  setPending(true);setProblem('');setConflict(null);
  try{
   const result=await getProposalDraftApi().submitDraft(
    draft.id,draft.draftVersion,draft.baseVersions);
   if(routeRef.current!==submitFor)return;
   setDraft(result.record);setEditor(false);
  }catch(e){
   if(routeRef.current!==submitFor)return;
   if(e instanceof ProposalDraftError&&e.details)setConflict(e.details);
   setProblem(draftProblem(e,'Could not send your edit. Try again.'));
  }finally{if(routeRef.current===submitFor)setPending(false)}
 }
 return {draft,editor,setEditor,text,setText,status,problem,setProblem,pending,setPending,conflict,setReload,draftSupported,routeRef,create,save,submit};
}
