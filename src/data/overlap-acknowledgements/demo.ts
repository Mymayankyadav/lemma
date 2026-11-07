// N61.2.1: tab-local overlap acknowledgements. The live RPC adapter is N61.2.2.
// Never persist derived staleness or a caller-owned user ID.
import {getStudyApi} from '../study';
import {OverlapError} from './contract';
import type {NewOverlapAcknowledgement,OverlapAcknowledgement,OverlapApi,
  OverlapPage,OverlapParticipant,OverlapPatch,OverlapQuery,ValidatedOverlap} from './contract';
import {overlapIsStale,validateNewOverlap,validateOverlapPatch,
  validateOverlapQuery} from './validate';

type Saved=Omit<OverlapAcknowledgement,'stale'>;
type Snapshot={schema:1;rows:Saved[]};
type Cursor={v:1;filter:string;start:string;id:string};
type ResolveCurrent=(row:ValidatedOverlap)=>Promise<OverlapParticipant[]>;
const KEY='lemma.v6.demo.overlap-acknowledgements.v1';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const clone=<T>(value:T):T=>structuredClone(value);
const fail=(code:'invalid'|'not_found'|'conflict',message:string):never=>{
  throw new OverlapError(code,message);
};
const participantA:OverlapParticipant={
  kind:'block',id:'11111111-1111-4111-8111-111111111111',version:1,
};
const participantB:OverlapParticipant={
  kind:'entry',id:'22222222-2222-4222-8222-222222222222',version:1,
};
const participantC:OverlapParticipant={
  kind:'block',id:'33333333-3333-4333-8333-333333333333',version:1,
};
function seed():Snapshot {
  const created='2026-11-07T08:00:00.000Z';
  const first:Saved={
    id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    participants:[participantA,participantB],startsAt:'2026-11-07T09:00:00.000Z',
    endsAt:'2026-11-07T09:30:00.000Z',reason:'Plan overlap',
    disposition:'keep_both',attributedTo:null,version:1,source:'app',
    createdAt:created,updatedAt:created,
  };
  const second:Saved={
    ...first,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    participants:[participantA,participantC],startsAt:'2026-11-07T11:00:00.000Z',
    endsAt:'2026-11-07T11:20:00.000Z',reason:'Protect study time',
    disposition:'attribute_to',attributedTo:{kind:'block',id:participantC.id},
  };
  return {schema:1,rows:[first,second]};
}

/**
 * Build demo examples from owner-visible StudyApi records, not fictional IDs.
 * On the pristine study demo only, introduce two visible busy blocks that
 * genuinely overlap saved focus intervals. No production or injected live
 * adapter is ever written; later loads only read the persisted study records.
 */
async function seedFromStudy():Promise<Snapshot>{
  const api=getStudyApi();
  if(api.mode!=='demo')return {schema:1,rows:[]};
  const center=Date.now(),windowMs=14*24*60*60*1000;
  const range={start:new Date(center-windowMs).toISOString(),
    end:new Date(center+windowMs).toISOString()};
  const [entries,initialBlocks]=await Promise.all([
    api.listStudyEntries(range),api.listCalendarBlocks(range),
  ]);
  const saved=entries.filter(e=>e.status==='saved');
  const blocks=[...initialBlocks];
  type Match={entry:typeof saved[number];block:typeof blocks[number];
    start:number;end:number};
  const match=(entry:typeof saved[number]):Match|undefined=>{
    for(const span of entry.intervals){
      if(span.kind!=='focus'||!span.end)continue;
      for(const block of blocks){
        const start=Math.max(Date.parse(span.start),Date.parse(block.startsAt));
        const end=Math.min(Date.parse(span.end),Date.parse(block.endsAt));
        if(start<end)return {entry,block,start,end};
      }
    }
    return undefined;
  };
  const pristine=saved.length===3&&entries.length===3&&blocks.length===2&&
    entries.every(e=>e.version===1)&&blocks.every(b=>b.version===1);
  const matches:Match[]=[];
  for(const entry of saved){
    if(matches.length===2)break;
    let found=match(entry);
    if(!found&&pristine){
      const span=entry.intervals.find(i=>i.kind==='focus'&&i.end&&
        Date.parse(i.end)>Date.parse(i.start));
      if(span?.end){
        const start=Date.parse(span.start),end=Date.parse(span.end);
        const inside=start+Math.min(60_000,Math.floor((end-start)/4));
        if(inside<end){
          const created=await api.createCalendarBlock({
            kind:'busy',title:'Demo: overlapping commitment',
            startsAt:new Date(inside).toISOString(),
            endsAt:new Date(Math.min(end,inside+10*60_000)).toISOString(),
            timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',
          });
          blocks.push(created.record);
          found=match(entry);
        }
      }
    }
    if(found)matches.push(found);
  }
  const created=new Date().toISOString();
  const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
  return {schema:1,rows:matches.map((m,index)=>{
    const participants:OverlapParticipant[]=[
      {kind:'block',id:m.block.id,version:m.block.version},
      {kind:'entry',id:m.entry.id,version:m.entry.version},
    ];
    return {
      id:ids[index],participants,startsAt:new Date(m.start).toISOString(),
      endsAt:new Date(m.end).toISOString(),
      reason:index===0?'Plan overlap':'Protect study time',
      disposition:index===0?'keep_both':'attribute_to',
      attributedTo:index===0?null:{kind:'block' as const,id:m.block.id},
      version:1,source:'app' as const,createdAt:created,updatedAt:created,
    };
  })};
}
// Coordinate simultaneous first reads from independently created adapters.
let pendingStudySeed:Promise<Snapshot>|null=null;

function newId():string {
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  if(!globalThis.crypto?.getRandomValues)
    return fail('invalid','Secure overlap ID generation unavailable');
  const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),
    hex.slice(16,20),hex.slice(20)].join('-');
}
function id(value:string):string {
  if(typeof value!=='string'||!UUID.test(value))
    return fail('invalid','Expected overlap UUID');
  return value.toLowerCase();
}
function inputOf(row:Saved):ValidatedOverlap {
  return {participants:row.participants,startsAt:row.startsAt,
    endsAt:row.endsAt,reason:row.reason,disposition:row.disposition,
    attributedTo:row.attributedTo};
}
function validRow(value:unknown):value is Saved {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const row=value as Partial<Saved>&Record<string,unknown>;
  if(Object.keys(row).some(k=>!['id','participants','startsAt','endsAt',
    'reason','disposition','attributedTo','version','source','createdAt',
    'updatedAt'].includes(k)))return false;
  if(typeof row.id!=='string'||!UUID.test(row.id)||
    typeof row.version!=='number'||!Number.isInteger(row.version)||row.version<1||
    row.version>2147483647||!['app','mcp','worker'].includes(row.source as string)||
    typeof row.createdAt!=='string'||typeof row.updatedAt!=='string'||
    !Number.isFinite(Date.parse(row.createdAt))||
    !Number.isFinite(Date.parse(row.updatedAt)))return false;
  try {
    const normalized=validateNewOverlap(inputOf(row as Saved));
    return JSON.stringify(normalized)===JSON.stringify({
      participants:row.participants,startsAt:row.startsAt,endsAt:row.endsAt,
      reason:row.reason,disposition:row.disposition,attributedTo:row.attributedTo,
    });
  }catch{return false}
}
function storage():Snapshot|null {
  try {
    const raw=sessionStorage.getItem(KEY);
    if(!raw)return null;
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
    const value=parsed as Partial<Snapshot>;
    if(value.schema!==1||!Array.isArray(value.rows)||
      !value.rows.every(validRow))return null;
    if(new Set(value.rows.map(r=>r.id)).size!==value.rows.length)return null;
    return value as Snapshot;
  }catch{return null}
}
function persist(snapshot:Snapshot):void {
  try{sessionStorage.setItem(KEY,JSON.stringify(snapshot))}
  catch{/* Private browsing or disabled storage: retain this adapter's snapshot. */}
}
function compare(a:Pick<Saved,'startsAt'|'id'>,
  b:Pick<Saved,'startsAt'|'id'>):number {
  return a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id);
}
function encode(cursor:Cursor):string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g,'-').replace(/\//g,'_')
    .replace(/=+$/,'');
}
function decode(raw:string|null|undefined,filter:string):Cursor|null {
  if(raw==null)return null;
  try {
    if(typeof raw!=='string'||raw.length<4||raw.length>4096||
      !/^[A-Za-z0-9_-]+$/.test(raw))return fail('invalid','Invalid overlap cursor');
    const value:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+
      '='.repeat((4-raw.length%4)%4)));
    if(!value||typeof value!=='object'||Array.isArray(value))
      return fail('invalid','Invalid overlap cursor');
    const cursor=value as Cursor;
    if(cursor.v!==1||cursor.filter!==filter||typeof cursor.id!=='string'||
      !UUID.test(cursor.id)||typeof cursor.start!=='string'||
      !Number.isFinite(Date.parse(cursor.start)))
      return fail('invalid','Cursor belongs to different overlap filters');
    return cursor;
  }catch{return fail('invalid','Invalid overlap cursor')}
}
function nowAfter(previous?:string):string {
  return new Date(Math.max(Date.now(),previous?Date.parse(previous)+1:0)).toISOString();
}
async function fromStudy(row:ValidatedOverlap):Promise<OverlapParticipant[]> {
  // StudyApi is itself owner-scoped; no owner ID or client DML is passed.
  const api=getStudyApi();
  const range={start:row.startsAt,end:row.endsAt};
  const [blocks,entries]=await Promise.all([
    api.listCalendarBlocks(range),api.listStudyEntries(range),
  ]);
  return [...blocks.map(b=>({kind:'block' as const,id:b.id,version:b.version})),
    ...entries.map(e=>({kind:'entry' as const,id:e.id,version:e.version}))];
}
function receipt<T>(record:T):{record:T;actionNo:null} {
  return {record:clone(record),actionNo:null};
}
export function createDemoOverlapApi(resolveCurrent:ResolveCurrent=fromStudy):OverlapApi {
  // Injected-resolver tests retain their deterministic static fixture.
  // The default resolver cannot treat hard-coded UUIDs as real study rows.
  const stored=storage();
  const dynamic=resolveCurrent===fromStudy&&!stored;
  let snapshot=stored??(dynamic?{schema:1 as const,rows:[]}:seed());
  if(!dynamic)persist(snapshot);
  let initialized=!dynamic;
  let initializing:Promise<void>|null=null;
  const ready=async():Promise<void>=>{
    if(initialized)return;
    if(!initializing)initializing=(async()=>{
      const existing=storage();
      if(existing){snapshot=existing;return}
      if(!pendingStudySeed){
        pendingStudySeed=seedFromStudy().finally(()=>{pendingStudySeed=null});
      }
      const seeded=await pendingStudySeed;
      snapshot=storage()??seeded;
      persist(snapshot);
    })().then(()=>{initialized=true},error=>{
      initializing=null;throw error;
    });
    await initializing;
  };
  const current=():Snapshot=>{snapshot=storage()??snapshot;return snapshot};
  const save=(rows:Saved[]):void=>{snapshot={schema:1,rows};persist(snapshot)};
  const lookup=(key:string):Saved=>{
    const target=id(key),row=current().rows.find(r=>r.id===target);
    if(!row)return fail('not_found','Overlap acknowledgement not found');
    return row;
  };
  const version=(row:Saved,expected:number):void=>{
    if(!Number.isInteger(expected)||expected<1||expected>2147483647)
      fail('invalid','Expected version must be a positive int32');
    if(row.version!==expected)fail('conflict','Acknowledgement changed elsewhere');
  };
  const stale=async(row:Saved):Promise<boolean>=>{
    return overlapIsStale(row.participants,await resolveCurrent(inputOf(row)));
  };
  const view=async(row:Saved):Promise<OverlapAcknowledgement>=>{
    return clone({...row,stale:await stale(row)});
  };
  const requireCurrent=async(row:Saved):Promise<void>=>{
    if(await stale(row))
      fail('conflict','Overlap participants have changed or are no longer owned');
  };
  return {
    mode:'demo',
    async listAcknowledgements(query:OverlapQuery={}):Promise<OverlapPage<OverlapAcknowledgement>> {
      await ready();
      const q=validateOverlapQuery(query),limit=q.limit??20;
      const filter=JSON.stringify({from:q.from??null,to:q.to??null,stale:q.stale??null});
      const cursor=decode(q.cursor,filter);
      const within=current().rows.filter(r=>
        (!q.from||r.endsAt>q.from)&&(!q.to||r.startsAt<q.to)).sort(compare);
      // Filter against *current* versions, never against cached stale flags.
      const viewed=await Promise.all(within.map(view));
      const matching=viewed.filter(r=>q.stale===undefined||r.stale===q.stale);
      const after=matching.filter(r=>!cursor||compare(r,{
        startsAt:cursor.start,id:cursor.id})>0);
      const items=after.slice(0,limit);
      const last=items.at(-1);
      return {items:clone(items),total:matching.length,
        nextCursor:last&&after.length>limit?
          encode({v:1,filter,start:last.startsAt,id:last.id}):null};
    },
    async getAcknowledgement(key:string){
      await ready();
      const target=id(key),row=current().rows.find(r=>r.id===target);
      return row?view(row):null;
    },
    async createAcknowledgement(input:NewOverlapAcknowledgement){
      await ready();
      const normalized=validateNewOverlap(input);
      const at=nowAfter();
      const row:Saved={...normalized,id:newId(),source:'app',
        version:1,createdAt:at,updatedAt:at};
      await requireCurrent(row);
      save([...current().rows,row]);
      return receipt(await view(row));
    },
    async updateAcknowledgement(key:string,expected:number,patch:OverlapPatch){
      await ready();
      const row=lookup(key);version(row,expected);
      const validated=validateOverlapPatch(inputOf(row),patch);
      const normalized=validateNewOverlap({...inputOf(row),...validated});
      const updated:Saved={...row,...normalized,source:'app',
        version:row.version+1,updatedAt:nowAfter(row.updatedAt)};
      await requireCurrent(updated);
      // An independent adapter may have written while version checks awaited.
      version(lookup(key),expected);
      save(current().rows.map(r=>r.id===row.id?updated:r));
      return receipt(await view(updated));
    },
    async deleteAcknowledgement(key:string,expected:number){
      await ready();
      const row=lookup(key);version(row,expected);
      save(current().rows.filter(r=>r.id!==row.id));
      return receipt({id:row.id});
    },
  };
}
