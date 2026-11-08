// N63.2: owner-RLS reads; only N49's owner-checked RPC mutates drafts.
import {ProposalDraftError,type ProposalDraftApi,type ProposalDraftRecord,
 type ProposalDraftPage,type ProposalDraftQuery,type NewProposalDraft,
 type ProposalEditPayload,type ProposalBaseVersions,type ProposalDraftSource} from './contract';
import {normalizeDraftQuery,normalizeNewDraft,normalizeDraftPayload,
 normalizeBaseVersions,compareDraftSourceVersions,draftConflictDetails} from './model';
type Row=Record<string,unknown>;
type SqlError={code?:string;message?:string};
type Operation='create'|'save'|'submit'|'discard';
type Envelope={schemaVersion:1;resource:'proposal_drafts';operation:Operation;
 operationId:string;patch:Row;target?:{id:string};expectedVersion?:number};
type Receipt={status?:string;actionNo?:number|null;draft?:Row;
 reason?:string;currentVersion?:number;changed?:{resource:string;id:string;version:number}[]};
type Cursor={v:1;f:string;id:string};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const fail=(code:'invalid'|'not_found'|'conflict',message:string):never=>{
 throw new ProposalDraftError(code,message);
};
async function client(){return (await import('../live/client')).liveClient()}
const clone=<T>(value:T):T=>structuredClone(value);
function id(raw?:unknown):string{
 if(raw!==undefined){
  if(typeof raw!=='string'||!UUID.test(raw))return fail('invalid','Owner record UUID required');
  return raw.toLowerCase();
 }
 const c=globalThis.crypto;if(c?.randomUUID)return c.randomUUID();
 if(!c?.getRandomValues)throw Error('Secure operationId unavailable');
 const bytes=c.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const h=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function positive(value:unknown):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>2147483647)
  return fail('invalid','Positive version required');
 return value;
}
function errorOf(e:SqlError):Error{
 const message=e.message??'Proposal draft request failed';
 if(/not found|not available|owner proposal required/i.test(message))
  return new ProposalDraftError('not_found',message);
 if(e.code==='40001'||e.code==='23505'||
  /stale|newer|conflict|changed|duplicate|reused|overwrit/i.test(message))
  return new ProposalDraftError('conflict',message);
 if(['23503','23514','22P02','22007'].includes(e.code??'')||
  /invalid|unknown|must|unsupported|required|terminal|immutable|already|not pending|not saved/i.test(message))
  return new ProposalDraftError('invalid',message);
 return Error('Live proposal drafts: '+message);
}
function sourceVersions(row:Row):ProposalBaseVersions{
 const target=id(row.target_id),raw=row.base_versions;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw Error('Owner draft target-version snapshot unavailable');
 let actual:number|undefined;
 for(const category of ['projects','notes','checkpoints']){
  const group=(raw as Row)[category];
  if(group&&typeof group==='object'&&!Array.isArray(group)){
   const value=(group as Row)[target];
   if(value!==undefined){
    if(actual!==undefined)throw Error('Ambiguous target source versions');
    actual=positive(value);
   }
  }
 }
 if(actual===undefined)throw Error('Missing owner target-version snapshot');
 return normalizeBaseVersions({proposal:positive(row.base_proposal_version),target:actual});
}
function record(row:Row):ProposalDraftRecord{
 if(!['draft','saved','submitted','discarded'].includes(String(row.status)))
  throw Error('Unexpected proposal draft status');
 const result:ProposalDraftRecord={
  id:id(row.id),proposalId:id(row.proposal_id),targetId:id(row.target_id),
  baseVersions:sourceVersions(row),
  payload:normalizeDraftPayload(row.payload as ProposalEditPayload),
  draftVersion:positive(row.draft_version),
  status:row.status as ProposalDraftRecord['status'],
  editedAt:String(row.edited_at),createdAt:String(row.created_at),
 };
 if(!Number.isFinite(Date.parse(result.editedAt))||
    !Number.isFinite(Date.parse(result.createdAt)))
  throw Error('Invalid owner draft timestamp');
 return clone(result);
}
const encode=(c:Cursor):string=>btoa(JSON.stringify(c))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(raw:string|null,signature:string):Cursor|null{
 if(raw===null)return null;
 try{
  if(!/^[A-Za-z0-9_-]{4,2048}$/.test(raw))return fail('invalid','Invalid draft cursor');
  const c=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4))) as Cursor;
  if(c.v!==1||c.f!==signature||!UUID.test(c.id))
   return fail('invalid','Draft cursor filters changed');
  return c;
 }catch{return fail('invalid','Invalid draft cursor')}
}
type Resource='projects'|'notes'|'checkpoints';
async function target(idValue:string):Promise<{resource:Resource;version:number}>{
 const c=await client();
 for(const resource of ['projects','notes','checkpoints'] as const){
  const response=await c.from(resource).select('id,version').eq('id',id(idValue)).maybeSingle();
  if(response.error)throw errorOf(response.error);
  if(response.data)return {resource,version:positive((response.data as Row).version)};
 }
 return fail('not_found','Owner proposal target unavailable');
}
async function sources(draft:Pick<ProposalDraftRecord,'proposalId'|'targetId'>){
 const c=await client(),response=await c.from('proposals')
  .select('id,version,status,withdrawn_at').eq('id',id(draft.proposalId)).maybeSingle();
 if(response.error)throw errorOf(response.error);
 if(!response.data)return fail('not_found','Owner proposal not found');
 const proposal=response.data as Row;
 if(proposal.status!=='pending'||proposal.withdrawn_at!=null)
  return fail('conflict','Proposal is not active and pending');
 const t=await target(draft.targetId);
 return {resource:t.resource,versions:{proposal:positive(proposal.version),target:t.version}};
}
export function createLiveProposalDraftApi():ProposalDraftApi{
 // An uncertain acknowledgement never creates a new operationId on retry.
 const retries=new Map<string,Envelope>();
 async function getDraft(raw:string):Promise<ProposalDraftRecord|null>{
  const c=await client(),response=await c.from('proposal_drafts')
   .select('*').eq('id',id(raw)).maybeSingle();
  if(response.error)throw errorOf(response.error);
  return response.data?record(response.data as Row):null;
 }
 async function write(op:Operation,fields:{patch:Row;target?:{id:string};
  expectedVersion?:number},attempt?:{draft:ProposalDraftRecord;payload:ProposalEditPayload}){
  const base={schemaVersion:1 as const,resource:'proposal_drafts' as const,
   operation:op,...fields},key=JSON.stringify(base);
  let envelope=retries.get(key);
  if(!envelope){envelope={...base,operationId:id()};retries.set(key,envelope)}
  let receipt:Receipt|null=null;
  for(let n=0;n<2;n++){
   const c=await client(),response=await c.rpc('proposal_drafts_command',{p:envelope});
   if(response.error){
    const mapped=errorOf(response.error);
    if(mapped instanceof ProposalDraftError){
     retries.delete(key);
     if(mapped.code==='conflict'&&attempt){
      const current=await getDraft(attempt.draft.id)??attempt.draft;
      const latest=await sources(current).catch(()=>null);
      throw new ProposalDraftError('conflict',mapped.message,
       draftConflictDetails(current,attempt.payload,latest?.versions));
     }
     throw mapped;
    }
    if(n===0)continue;
    throw mapped; // retry with this same envelope on next invocation
   }
   if(!response.data){
    if(n===0)continue;
    throw Error('Missing owner proposal draft receipt');
   }
   receipt=response.data as Receipt;break;
  }
  if(receipt?.status==='conflict'){
   retries.delete(key);
   if(attempt){
    const current=await getDraft(attempt.draft.id)??attempt.draft;
    throw new ProposalDraftError('conflict',receipt.reason??'Draft changed elsewhere',
     draftConflictDetails(current,attempt.payload));
   }
   return fail('conflict',receipt.reason??'Draft conflict');
  }
  if(receipt?.status!=='ok'||!Number.isSafeInteger(receipt.actionNo)||
   (receipt.actionNo??0)<=0||!receipt.draft||
   !Array.isArray(receipt.changed)||!receipt.changed.some(x=>
    x.resource==='proposal_drafts'&&UUID.test(x.id)&&
     Number.isSafeInteger(x.version)&&x.version>0))
   throw Error('Unaudited proposal draft receipt');
  const value=record(receipt.draft);
  retries.delete(key);
  return {record:value,actionNo:receipt.actionNo!};
 }
 return {
  mode:'live',
  async getSource(raw:string):Promise<ProposalDraftSource|null>{
   const proposalId=id(raw),c=await client();
   const found=await c.from('proposals')
    .select('id,kind,project_id,version,status,withdrawn_at')
    .eq('id',proposalId).maybeSingle();
   if(found.error)throw errorOf(found.error);
   if(!found.data)return null;
   const proposal=found.data as Row;
   // Only real plan proposals have a known, owner-scoped project target.
   // Do not infer note/checkpoint IDs from optional presentation payloads.
   if(!['plan','plan_change'].includes(String(proposal.kind))||
      proposal.status!=='pending'||proposal.withdrawn_at!=null||
      typeof proposal.project_id!=='string'||!UUID.test(proposal.project_id))return null;
   const targetId=id(proposal.project_id);
   const target=await c.from('projects').select('id,version')
    .eq('id',targetId).maybeSingle();
   if(target.error)throw errorOf(target.error);
   if(!target.data)return null;
   return {proposalId,targetId,baseVersions:{
    proposal:positive(proposal.version),target:positive((target.data as Row).version),
   }};
  },
  async listDrafts(query:ProposalDraftQuery={}):Promise<ProposalDraftPage>{
   const q=normalizeDraftQuery(query);
   const f=JSON.stringify([[...q.status].sort(),q.proposalId??null,q.targetId??null]);
   const cursor=decode(q.cursor,f),c=await client();
   // Every table query is already filtered by the signed-in owner's RLS.
   let count=c.from('proposal_drafts').select('id',{count:'exact',head:true})
    .in('status',q.status);
   if(q.proposalId)count=count.eq('proposal_id',q.proposalId);
   if(q.targetId)count=count.eq('target_id',q.targetId);
   const counted=await count;
   if(counted.error)throw errorOf(counted.error);
   if(!Number.isSafeInteger(counted.count)||counted.count===null||counted.count<0)
    throw Error('Owner draft exact count unavailable');
   let page=c.from('proposal_drafts').select('*').in('status',q.status);
   if(q.proposalId)page=page.eq('proposal_id',q.proposalId);
   if(q.targetId)page=page.eq('target_id',q.targetId);
   if(cursor)page=page.gt('id',cursor.id);
   const fetched=await page.order('id',{ascending:true}).limit(q.limit+1);
   if(fetched.error)throw errorOf(fetched.error);
   const rows=(fetched.data??[]) as Row[];
   if(rows.length>q.limit+1)throw Error('Unbounded owner draft page');
   const items=rows.slice(0,q.limit).map(record);
   return {items,total:counted.count,
    nextCursor:rows.length>q.limit&&items.length?
     encode({v:1,f,id:items[items.length-1].id}):null};
  },
  getDraft,
  async createDraft(input:NewProposalDraft){
   const draft=normalizeNewDraft(input),actual=await sources(draft);
   if(!compareDraftSourceVersions(draft.baseVersions,actual.versions).ok)
    return fail('conflict','Proposal or target changed before draft creation');
   return write('create',{patch:{proposal_id:draft.proposalId,
    target_id:draft.targetId,payload:draft.payload,
    base_versions:{[actual.resource]:{[draft.targetId]:draft.baseVersions.target}}}});
  },
  async saveDraft(raw,expected,payload){
   const key=id(raw),version=positive(expected),full=normalizeDraftPayload(payload);
   const old=await getDraft(key);
   if(!old)return fail('not_found','Owner draft not found');
   return write('save',{target:{id:key},expectedVersion:version,patch:{payload:full}},
    {draft:old,payload:full});
  },
  async submitDraft(raw,expected,expectedSources){
   const key=id(raw),version=positive(expected),old=await getDraft(key);
   if(!old)return fail('not_found','Owner draft not found');
   const requested=normalizeBaseVersions(expectedSources);
   if(!compareDraftSourceVersions(old.baseVersions,requested).ok)
    throw new ProposalDraftError('conflict','Draft base versions differ',
     draftConflictDetails(old,old.payload,requested));
   const latest=await sources(old);
   if(!compareDraftSourceVersions(old.baseVersions,latest.versions).ok)
    throw new ProposalDraftError('conflict','Proposal or target changed since draft base',
     draftConflictDetails(old,old.payload,latest.versions));
   return write('submit',{target:{id:key},expectedVersion:version,patch:{}},
    {draft:old,payload:old.payload});
  },
  async discardDraft(raw,expected){
   const key=id(raw),version=positive(expected),old=await getDraft(key);
   if(!old)return fail('not_found','Owner draft not found');
   return write('discard',{target:{id:key},expectedVersion:version,patch:{}},
    {draft:old,payload:old.payload});
  },
 };
}
