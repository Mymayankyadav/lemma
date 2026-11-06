// N61.1: tab-local demo state. No v6 data goes into study/task tables.
import {LemmaError} from '../api';
import type {StudyReceipt} from '../study/contract';
import type {
  NewOverlapAcknowledgement,OverlapAcknowledgement,OverlapAcknowledgementApi,
  OverlapDisposition,OverlapParticipant,OverlapPatch,OverlapQuery,OverlapView,OverlapWindow,
} from './contract';

const KEY='lemma.v6.demo.overlap-acknowledgements.v1';
type Snapshot={schema:1;records:OverlapAcknowledgement[]};
type Key=[string,string];
const clone=<T>(value:T):T=>structuredClone(value);
const fail=(code:'invalid'|'conflict'|'not_found',message:string):never=>{
  throw new LemmaError(code,message);
};
const allowed=(value:object,keys:string[])=>Object.keys(value).every(key=>keys.includes(key));
const instant=(value:string):string=>{
  if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/i.test(value)||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)||!Number.isFinite(Date.parse(value)))
    fail('invalid','Overlap instants require an ISO timestamp with a time zone');
  return new Date(value).toISOString();
};
function windowOf(value:OverlapWindow):OverlapWindow{
  const startsAt=instant(value.startsAt),endsAt=instant(value.endsAt);
  if(endsAt<=startsAt)fail('invalid','Overlap window must have positive duration');
  return {startsAt,endsAt};
}
function participantsOf(value:OverlapParticipant[]):OverlapParticipant[]{
  if(!Array.isArray(value)||value.length<2||value.length>10)
    fail('invalid','An overlap needs two to ten recorded participants');
  const result=value.map(row=>{
    if(!row||typeof row!=='object'||!allowed(row,['kind','id','version'])||
      !['block','entry'].includes(row.kind)||typeof row.id!=='string'||
      !row.id.trim()||row.id.length>128||
      !Number.isSafeInteger(row.version)||row.version<1)
      fail('invalid','Invalid participant identity/version');
    return {kind:row.kind,id:row.id.trim(),version:row.version};
  });
  if(new Set(result.map(p=>p.kind+':'+p.id)).size!==result.length)
    fail('invalid','Duplicate overlap participant');
  return result.sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id));
}
function dispositionOf(value:OverlapDisposition,participants:OverlapParticipant[]):OverlapDisposition{
  if(!value||typeof value!=='object')fail('invalid','Disposition is required');
  if(value.kind==='keep_both'&&allowed(value,['kind']))return {kind:'keep_both'};
  if(value.kind==='attribute_to'&&allowed(value,['kind','participant'])){
    const person=value.participant;
    if(!person||typeof person!=='object'||!allowed(person,['kind','id'])||
      !participants.some(p=>p.kind===person.kind&&p.id===person.id))
      fail('invalid','Attribution must select a participant in this overlap');
    return {kind:'attribute_to',participant:{kind:person.kind,id:person.id}};
  }
  return fail('invalid','Invalid overlap disposition');
}
function reasonOf(value:string|null):string|null{
  if(value!==null&&(typeof value!=='string'||value.length>1000))
    fail('invalid','Reason must be at most 1000 characters');
  return value;
}
function sameIdentities(a:OverlapParticipant[],b:OverlapParticipant[]):boolean{
  return a.length===b.length&&a.every((p,i)=>p.kind===b[i].kind&&p.id===b[i].id);
}
function sameVersions(a:OverlapParticipant[],b:OverlapParticipant[]):boolean{
  return sameIdentities(a,b)&&a.every((p,i)=>p.version===b[i].version);
}
function example():Snapshot{
  const createdAt='2026-11-06T08:00:00.000Z';
  return {schema:1,records:[
    {id:'demo-overlap-1',startsAt:'2026-11-06T09:15:00.000Z',
      endsAt:'2026-11-06T09:45:00.000Z',participants:[
        {kind:'block',id:'demo-block-1',version:1},
        {kind:'entry',id:'demo-entry-1',version:2}],
      disposition:{kind:'keep_both'},reason:'Scheduled work overlaps a focus interval',
      createdAt,updatedAt:createdAt,version:1,source:'app'},
    {id:'demo-overlap-2',startsAt:'2026-11-06T10:00:00.000Z',
      endsAt:'2026-11-06T10:15:00.000Z',participants:[
        {kind:'block',id:'demo-block-2',version:1},
        {kind:'entry',id:'demo-entry-1',version:2}],
      disposition:{kind:'attribute_to',participant:{kind:'entry',id:'demo-entry-1'}},
      reason:null,createdAt,updatedAt:createdAt,version:1,source:'app'},
  ]};
}
let next=0;
function newId():string{
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  return 'demo-overlap-'+Date.now()+'-'+(++next);
}
function storageOf(override:Storage|null|undefined):Storage|null{
  if(override!==undefined)return override;
  try{return typeof sessionStorage==='undefined'?null:sessionStorage;}catch{return null;}
}
function validateSnapshot(value:unknown):value is Snapshot{
  if(!value||typeof value!=='object')return false;
  const data=value as Snapshot;
  if(data.schema!==1||!Array.isArray(data.records)||data.records.length>2000)return false;
  try{
    if(new Set(data.records.map(r=>r.id)).size!==data.records.length)return false;
    for(const row of data.records){
      if(typeof row.id!=='string'||!row.id||
        !Number.isSafeInteger(row.version)||row.version<1||
        row.source!=='app'||!Number.isFinite(Date.parse(row.createdAt))||
        !Number.isFinite(Date.parse(row.updatedAt)))return false;
      windowOf(row);
      const people=participantsOf(row.participants);
      dispositionOf(row.disposition,people);
      reasonOf(row.reason);
    }
    return true;
  }catch{return false;}
}
function key(record:OverlapAcknowledgement):Key{
  return [record.startsAt,record.id];
}
function compare(a:Key,b:Key):number{
  return a[0].localeCompare(b[0])||a[1].localeCompare(b[1]);
}
function parseCursor(value:string):Key{
  try{
    const data=JSON.parse(atob(value)) as {v:number;key:unknown};
    if(data.v!==1||!Array.isArray(data.key)||data.key.length!==2||
      data.key.some(x=>typeof x!=='string'||!x))throw Error();
    return data.key as Key;
  }catch{return fail('invalid','Invalid acknowledgement cursor');}
}
const receipt=<T>(record:T):StudyReceipt<T>=>({record:clone(record),actionNo:null});
/** Persistent within one browser tab. A corrupt snapshot cannot create fake owner history. */
export function createDemoOverlapAcknowledgementApi(
  options:{storage?:Storage|null;clock?:()=>Date}={}
):OverlapAcknowledgementApi{
  const storage=storageOf(options.storage),clock=options.clock??(()=>new Date());
  let state:Snapshot=example();
  try{
    const raw=storage?.getItem(KEY);
    if(raw){
      const loaded:unknown=JSON.parse(raw);
      if(validateSnapshot(loaded))state=clone(loaded);
    }
  }catch{/* private browsing / obsolete snapshot: use independent fixture */}
  const refresh=():Snapshot=>{
    // Multiple adapters in one tab share sessionStorage. Always re-read before
    // an optimistic write; otherwise a stale adapter could overwrite a newer one.
    try{
      const raw=storage?.getItem(KEY);
      if(raw){
        const loaded:unknown=JSON.parse(raw);
        if(validateSnapshot(loaded))state=clone(loaded);
      }
    }catch{/* use the last valid in-memory snapshot */}
    return state;
  };
  const save=(value:Snapshot)=>{
    state=clone(value);
    try{storage?.setItem(KEY,JSON.stringify(state));}catch{/* in-memory remains valid */}
  };
  const transact=<T>(fn:(draft:Snapshot)=>T):StudyReceipt<T>=>{
    // Mutations take place on a copy; invalid updates leave persisted state intact.
    const draft=clone(refresh()),result=fn(draft);
    save(draft);return receipt(result);
  };
  const get=(draft:Snapshot,id:string)=>{
    const row=draft.records.find(r=>r.id===id);
    if(!row)fail('not_found','Overlap acknowledgement not found');
    return row;
  };
  const assertVersion=(row:OverlapAcknowledgement,expected:number)=>{
    if(!Number.isSafeInteger(expected)||row.version!==expected)
      fail('conflict','Overlap acknowledgement version changed');
  };
  const toView=(row:OverlapAcknowledgement,now?:OverlapParticipant[]):OverlapView=>({
    acknowledgement:clone(row),
    stale:now===undefined?null:!sameVersions(row.participants,participantsOf(now))
  });
  const collision=(rows:OverlapAcknowledgement[],candidate:OverlapAcknowledgement)=>{
    if(rows.some(row=>row.id!==candidate.id&&
      row.startsAt===candidate.startsAt&&row.endsAt===candidate.endsAt&&
      sameIdentities(row.participants,candidate.participants)))
      fail('conflict','This exact overlap is already acknowledged');
  };
  return {
    mode:'demo',
    async listAcknowledgements(query:OverlapQuery={}){
      const limit=query.limit??20;
      if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('invalid','Page size must be 1–50');
      const current=query.currentParticipants===undefined?undefined:participantsOf(query.currentParticipants);
      const after=query.cursor?parseCursor(query.cursor):null;
      const sorted=[...refresh().records].sort((a,b)=>compare(key(a),key(b)));
      const visible=after===null?sorted:sorted.filter(row=>compare(key(row),after)>0);
      const items=visible.slice(0,limit);
      return {items:items.map(row=>toView(row,current)),total:sorted.length,
        nextCursor:visible.length>limit?
          btoa(JSON.stringify({v:1,key:key(items[items.length-1])})):null};
    },
    async getAcknowledgement(id,currentParticipants){
      const found=refresh().records.find(row=>row.id===id);
      return found?toView(found,currentParticipants):null;
    },
    async findApplicableOverlap(input){
      const span=windowOf(input),participants=participantsOf(input.participants);
      const row=refresh().records.find(record=>
        record.startsAt===span.startsAt&&record.endsAt===span.endsAt&&
        sameVersions(record.participants,participants));
      return clone(row??null);
    },
    async createAcknowledgement(input:NewOverlapAcknowledgement){
      if(!input||typeof input!=='object'||!allowed(input,[
        'startsAt','endsAt','participants','disposition','reason'
      ]))fail('invalid','Unexpected acknowledgement field');
      const span=windowOf(input),people=participantsOf(input.participants);
      const now=clock().toISOString(),record:OverlapAcknowledgement={
        id:newId(),...span,participants:people,
        disposition:dispositionOf(input.disposition,people),
        reason:reasonOf(input.reason??null),version:1,
        createdAt:now,updatedAt:now,source:'app',
      };
      return transact(draft=>{collision(draft.records,record);draft.records.push(record);return record;});
    },
    async updateAcknowledgement(id,expectedVersion,patch:OverlapPatch){
      if(!patch||typeof patch!=='object'||!allowed(patch,[
        'startsAt','endsAt','participants','disposition','reason'
      ]))fail('invalid','Unexpected acknowledgement patch');
      return transact(draft=>{
        const row=get(draft,id);assertVersion(row,expectedVersion);
        const span=windowOf({startsAt:patch.startsAt??row.startsAt,endsAt:patch.endsAt??row.endsAt});
        const people=participantsOf(patch.participants??row.participants);
        const disposition=dispositionOf(patch.disposition??row.disposition,people);
        const reason=reasonOf(patch.reason===undefined?row.reason:patch.reason);
        const updated:OverlapAcknowledgement={...row,...span,participants:people,disposition,reason,
          updatedAt:clock().toISOString(),version:row.version+1};
        collision(draft.records,updated);
        const at=draft.records.findIndex(r=>r.id===id);draft.records[at]=updated;
        return updated;
      });
    },
    async deleteAcknowledgement(id,expectedVersion){
      return transact(draft=>{
        const row=get(draft,id);assertVersion(row,expectedVersion);
        draft.records=draft.records.filter(r=>r.id!==id);
        return {id};
      });
    },
  };
}
