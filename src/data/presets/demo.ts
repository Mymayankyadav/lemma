// N55: isolated, tab-scoped demo preset fixture. Never reads the live database.
import { LemmaError } from '../api';
import type { NewPreset, PresetApi, PresetPatch, PresetQuery, PresetRecord } from './contract';
import { checkId, checkPosition, checkVersion, compareCursor, decodeCursor,
  encodeCursor, invalid, modes, normalize, normalizeQuery } from './validate';

const KEY = 'lemma.v6.demo.presets.v1';
type Snapshot = {schema:1; presets:PresetRecord[]};
let idCounter=0;
const clone=<T>(value:T):T=>structuredClone(value);
function newId():string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  return 'demo-preset-'+Date.now()+'-'+(++idCounter);
}
function fixture():Snapshot {
  const created='2026-11-06T08:00:00.000Z';
  const preset=(id:string,label:string,mode:PresetRecord['mode'],position:number,
    subjectId:string|null,projectId:string|null,archivedAt:string|null):PresetRecord=>({
    id,label,mode,position,subjectId,projectId,checkpointId:null,
    focusMinutes:25,breakMinutes:5,longBreakMinutes:15,cycles:4,
    archivedAt,version:1,createdAt:created,updatedAt:created,
  });
  return {schema:1,presets:[
    preset('demo-preset-1','Proof workshop','pomodoro',0,'subject-analysis','project-analysis',null),
    preset('demo-preset-2','Focused reading','flowtime',1,'subject-topology','project-topology',null),
    preset('demo-preset-3','Open-ended study','open',2,null,null,null),
    preset('demo-preset-4','Retired routine','pomodoro',3,null,null,'2026-11-06T09:00:00.000Z'),
  ]};
}
function isRecord(x:unknown):x is PresetRecord {
  if (!x || typeof x!=='object') return false;
  const p=x as PresetRecord;
  return typeof p.id==='string' && !!p.id && typeof p.label==='string' && !!p.label.trim() &&
    modes.includes(p.mode) && p.label.trim().length<=120 &&
    Number.isSafeInteger(p.position) && p.position>=0 && p.position<=2147483647 &&
    Number.isSafeInteger(p.version) && p.version>0 &&
    Number.isSafeInteger(p.focusMinutes) && p.focusMinutes>=1 && p.focusMinutes<=480 &&
    Number.isSafeInteger(p.breakMinutes) && p.breakMinutes>=1 && p.breakMinutes<=180 &&
    Number.isSafeInteger(p.longBreakMinutes) && p.longBreakMinutes>=1 && p.longBreakMinutes<=240 &&
    Number.isSafeInteger(p.cycles) && p.cycles>=1 && p.cycles<=24 &&
    [p.subjectId,p.projectId,p.checkpointId].every(v=>v===null || typeof v==='string'&&!!v) &&
    typeof p.createdAt==='string' && Number.isFinite(Date.parse(p.createdAt)) &&
    typeof p.updatedAt==='string' && Number.isFinite(Date.parse(p.updatedAt)) &&
    (p.archivedAt===null || typeof p.archivedAt==='string' && Number.isFinite(Date.parse(p.archivedAt)));
}
function load():Snapshot|null {
  try {
    const value:unknown=JSON.parse(sessionStorage.getItem(KEY)??'null');
    if (!value || typeof value!=='object') return null;
    const s=value as Snapshot;
    if (s.schema!==1 || !Array.isArray(s.presets) || !s.presets.every(isRecord) ||
        new Set(s.presets.map(p=>p.id)).size!==s.presets.length) return null;
    return s;
  }catch{return null;}
}
function store(snapshot:Snapshot):void {
  try { sessionStorage.setItem(KEY,JSON.stringify(snapshot)); }
  catch { /* Private mode: keep in-memory snapshot for this instance. */ }
}
function nowAfter(old?:string):string {
  return new Date(Math.max(Date.now(),old?Date.parse(old)+1:0)).toISOString();
}
function receipt<T>(record:T){return {record:clone(record),actionNo:null};}

/** isReferenced is a demo-only relationship fixture hook; no hidden cross-module store. */
export function createDemoPresetApi(options:{isReferenced?:(id:string)=>boolean}={}):PresetApi {
  let snapshot=load()??fixture();
  store(snapshot);
  const current=()=>{snapshot=load()??snapshot;return snapshot.presets;};
  const save=(records:PresetRecord[])=>{
    snapshot={schema:1,presets:records};
    store(snapshot);
  };
  function changed(id:string,expectedVersion:number,modify:(old:PresetRecord)=>PresetRecord){
    checkId(id);checkVersion(expectedVersion);
    const all=current(),old=all.find(p=>p.id===id);
    if(!old) throw new LemmaError('not_found','Preset not found');
    if(old.version!==expectedVersion)
      throw new LemmaError('conflict','Preset changed elsewhere (current version '+old.version+')');
    const record=modify(old);
    save(all.map(p=>p.id===id?record:p));
    return receipt(record);
  }
  return {
    mode:'demo',
    async listPresets(query:PresetQuery={}){
      const {archived,limit}=normalizeQuery(query);
      const cursor=decodeCursor(query.cursor,archived);
      const matches=current().filter(p=>archived==='all' ||
        (archived==='archived'?p.archivedAt!==null:p.archivedAt===null)).sort(compareCursor);
      const following=cursor?matches.filter(p=>compareCursor(p,cursor)>0):matches;
      const items=following.slice(0,limit);
      return {items:clone(items),total:matches.length,nextCursor:following.length>limit&&items.length?
        encodeCursor(items[items.length-1],archived):null};
    },
    async getPreset(id:string){
      checkId(id);
      return clone(current().find(p=>p.id===id)??null);
    },
    async createPreset(input:NewPreset){
      const patch=normalize(input,true);
      const at=nowAfter();
      const record:PresetRecord={
        id:newId(),label:patch.label!,mode:patch.mode??'pomodoro',
        focusMinutes:patch.focusMinutes??25,breakMinutes:patch.breakMinutes??5,
        longBreakMinutes:patch.longBreakMinutes??15,cycles:patch.cycles??4,
        subjectId:patch.subjectId??null,projectId:patch.projectId??null,
        checkpointId:patch.checkpointId??null,position:patch.position??0,
        archivedAt:null,version:1,createdAt:at,updatedAt:at,
      };
      save([...current(),record]);
      return receipt(record);
    },
    async updatePreset(id:string,expectedVersion:number,patch:PresetPatch){
      const changes=normalize(patch,false);
      return changed(id,expectedVersion,old=>({
        ...old,...changes,version:old.version+1,updatedAt:nowAfter(old.updatedAt),
      }));
    },
    async reorderPreset(id:string,expectedVersion:number,position:number){
      const next=checkPosition(position);
      return changed(id,expectedVersion,old=>({
        ...old,position:next,version:old.version+1,updatedAt:nowAfter(old.updatedAt),
      }));
    },
    async archivePreset(id:string,expectedVersion:number){
      return changed(id,expectedVersion,old=>{
        if(old.archivedAt!==null)invalid('Preset is already archived');
        const now=nowAfter(old.updatedAt);
        return {...old,archivedAt:now,version:old.version+1,updatedAt:now};
      });
    },
    async restorePreset(id:string,expectedVersion:number){
      return changed(id,expectedVersion,old=>{
        if(old.archivedAt===null)invalid('Preset is already active');
        return {...old,archivedAt:null,version:old.version+1,updatedAt:nowAfter(old.updatedAt)};
      });
    },
    async deletePreset(id:string,expectedVersion:number){
      checkId(id);checkVersion(expectedVersion);
      const all=current(),old=all.find(p=>p.id===id);
      if(!old)throw new LemmaError('not_found','Preset not found');
      if(old.version!==expectedVersion)throw new LemmaError('conflict','Preset changed elsewhere');
      if(options.isReferenced?.(id))
        throw new LemmaError('conflict','Preset is used by study entries; archive it instead');
      save(all.filter(p=>p.id!==id));
      return receipt({id});
    },
  };
}
