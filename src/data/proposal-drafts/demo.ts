// N63.2 demo drafts: owner-safe fixtures and isolated, reloadable edit lifecycle.
import {ProposalDraftError,type ProposalDraftApi,type ProposalDraftRecord,
 type ProposalDraftQuery,type NewProposalDraft,type ProposalEditPayload,
 type ProposalBaseVersions,type ProposalDraftSource} from './contract';
import {normalizeNewDraft,normalizeDraftQuery,normalizeDraftPayload,
 normalizeBaseVersions,nextDraftState,draftConflictDetails,
 compareDraftSourceVersions} from './model';
const KEY='lemma.v6.demo.proposal-drafts.v1';
export const DEMO_DRAFT_SOURCE={proposalId:'11111111-1111-4111-8111-111111111111',
 targetId:'22222222-2222-4222-8222-222222222222',
 baseVersions:{proposal:1,target:1}} as const;
type Row=ProposalDraftRecord&{sequence:number};
type State={schema:1;next:number;rows:Row[];sources:Record<string,ProposalBaseVersions>};
type Cursor={v:1;f:string;id:string};
const clone=<T>(value:T):T=>structuredClone(value);
const key=(p:string,t:string)=>p+'/'+t;
const initial=():State=>({schema:1,next:1,rows:[],sources:{
 [key(DEMO_DRAFT_SOURCE.proposalId,DEMO_DRAFT_SOURCE.targetId)]:{proposal:1,target:1}
}});
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
 throw new ProposalDraftError(code,message);
};
function read():State|null{
 try{
  const raw=sessionStorage.getItem(KEY);if(!raw)return null;
  const x=JSON.parse(raw) as State;
  if(x.schema!==1||!Number.isSafeInteger(x.next)||!Array.isArray(x.rows)||
   !x.sources||typeof x.sources!=='object'||new Set(x.rows.map(r=>r.id)).size!==x.rows.length)
   return null;
  for(const r of x.rows){
   if(!r.id||!Number.isSafeInteger(r.sequence)||!Number.isSafeInteger(r.draftVersion)||
    !['draft','saved','submitted','discarded'].includes(r.status))return null;
   normalizeDraftPayload(r.payload);normalizeBaseVersions(r.baseVersions);
  }
  return x;
 }catch{return null}
}
function persist(s:State){try{sessionStorage.setItem(KEY,JSON.stringify(s))}catch{/* private tab */}}
function id():string{
 const c=globalThis.crypto;if(c?.randomUUID)return c.randomUUID();
 if(!c?.getRandomValues)return fail('invalid','Secure draft ID unavailable');
 const b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
const publicRow=(r:Row):ProposalDraftRecord=>{
 const {sequence:unused,...rest}=r;void unused;return clone(rest);
};
const encode=(c:Cursor)=>btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(raw:string,f:string):Cursor{
 try{
  if(raw.length>2048||!/^[A-Za-z0-9_-]+$/.test(raw))return fail('invalid','Bad cursor');
  const c=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
   '='.repeat((4-raw.length%4)%4))) as Cursor;
  if(c.v!==1||c.f!==f||typeof c.id!=='string'||!/^[0-9a-f-]{36}$/.test(c.id))
   return fail('invalid','Draft cursor filters changed');
  return c;
 }catch{return fail('invalid','Invalid draft cursor')}
}
/** Test-only owner source change, persisted across adapter instances. */
export function setDemoDraftSourceVersionsForTests(p:string,t:string,v:ProposalBaseVersions){
 const s=read()??initial();s.sources[key(p,t)]=normalizeBaseVersions(v);persist(s);
}
export function createDemoProposalDraftApi():ProposalDraftApi{
 let memory=read()??initial();persist(memory);
 const state=()=>{memory=read()??memory;return memory};
 const put=(s:State)=>{memory=s;persist(s)};
 const owned=(i:string):Row=>state().rows.find(x=>x.id===i)??fail('not_found','Draft not found');
 const source=(r:Pick<ProposalDraftRecord,'proposalId'|'targetId'>)=>
  state().sources[key(r.proposalId,r.targetId)]??null;
 const change=(i:string,v:number,op:'save'|'submit'|'discard',
  payload?:ProposalEditPayload,versions?:ProposalBaseVersions)=>{
  const old=owned(i),attempt=payload??old.payload;
  if(!Number.isSafeInteger(v)||v<1)return fail('invalid','Bad draft version');
  if(old.draftVersion!==v||state().rows.some(x=>x.sequence>old.sequence&&
    x.proposalId===old.proposalId&&['draft','saved'].includes(x.status)))
   throw new ProposalDraftError('conflict','Newer draft exists',
    draftConflictDetails(publicRow(old),attempt));
  const actual=source(old);
  if(op==='submit'&&(!actual||!compareDraftSourceVersions(old.baseVersions,actual).ok))
   throw new ProposalDraftError('conflict','Source changed since draft base',
    draftConflictDetails(publicRow(old),attempt,actual??undefined));
  const next=nextDraftState(old,op,v,new Date().toISOString(),payload,versions);
  const s=state();put({...s,rows:s.rows.map(r=>r.id===i?{...next,sequence:r.sequence}:r)});
  return {record:publicRow({...next,sequence:old.sequence}),actionNo:null};
 };
 return {
  mode:'demo',
  async getSource(proposalId:string):Promise<ProposalDraftSource|null>{
   if(proposalId!==DEMO_DRAFT_SOURCE.proposalId)return null;
   const current=source(DEMO_DRAFT_SOURCE);
   return current?{proposalId,targetId:DEMO_DRAFT_SOURCE.targetId,
    baseVersions:clone(current)}:null;
  },
  async listDrafts(raw:ProposalDraftQuery={}){
   const q=normalizeDraftQuery(raw),f=JSON.stringify([[...q.status].sort(),
    q.proposalId??null,q.targetId??null]),cursor=q.cursor?decode(q.cursor,f):null;
   const all=state().rows.filter(r=>q.status.includes(r.status)&&
    (q.proposalId===undefined||r.proposalId===q.proposalId)&&
    (q.targetId===undefined||r.targetId===q.targetId)).sort((a,b)=>a.id.localeCompare(b.id));
   const remaining=cursor?all.filter(r=>r.id>cursor.id):all;
   const rows=remaining.slice(0,q.limit);
   return {items:rows.map(publicRow),total:all.length,
    nextCursor:remaining.length>q.limit&&rows.length?
     encode({v:1,f,id:rows[rows.length-1].id}):null};
  },
  async getDraft(i:string){const r=state().rows.find(x=>x.id===i);return r?publicRow(r):null},
  async createDraft(input:NewProposalDraft){
   const v=normalizeNewDraft(input),actual=source(v);
   if(!actual)return fail('not_found','Unknown demo proposal/target fixture');
   if(!compareDraftSourceVersions(v.baseVersions,actual).ok)
    return fail('conflict','Stale proposal or target');
   const s=state(),now=new Date().toISOString();
   const row:Row={...v,id:id(),sequence:s.next,draftVersion:1,status:'draft',
    editedAt:now,createdAt:now};
   put({...s,next:s.next+1,rows:[...s.rows,row]});
   return {record:publicRow(row),actionNo:null};
  },
  async saveDraft(i,v,p){return change(i,v,'save',normalizeDraftPayload(p))},
  async submitDraft(i,v,versions){
   const r=owned(i),check=normalizeBaseVersions(versions);
   if(!compareDraftSourceVersions(r.baseVersions,check).ok)
    throw new ProposalDraftError('conflict','Requested source base changed',
     draftConflictDetails(publicRow(r),r.payload,check));
   return change(i,v,'submit',undefined,check);
  },
  async discardDraft(i,v){return change(i,v,'discard')},
 };
}
