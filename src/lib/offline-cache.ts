import type {QueryClient} from '@tanstack/react-query'
import type {Settings} from '../data/types'

/** AND-8: a bounded, read-only snapshot. Never persist auth, connector or push state. */
export const OFFLINE_MAX_BYTES=2_000_000
export const OFFLINE_MAX_AGE_MS=7*24*60*60*1000
export const OFFLINE_DB_PREFIX='lemma-offline:'
const STORE='snapshot'
const SLOT='latest'
const encoder=new TextEncoder()

export interface OfflineSettings {
 v:1
 timeZone:string
 rolloverHour:number
 ui:{mode?:'auto'|'day'|'night'}|null
 preferredChat:'claude'|'chatgpt'
 defaultStyle:string
 mixDecks:boolean
 newPerDay:number
}
/** Reject unknown or malformed persisted fields before hydration, not just on write. */
export function isOfflineSettings(value:unknown):value is OfflineSettings {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const data=value as Record<string,unknown>
 const keys=['v','timeZone','rolloverHour','ui','preferredChat','defaultStyle','mixDecks','newPerDay']
 if(Object.keys(data).length!==keys.length||!keys.every(key=>Object.hasOwn(data,key)))return false
 if(data.v!==1||typeof data.timeZone!=='string'||typeof data.rolloverHour!=='number'||!Number.isFinite(data.rolloverHour)||
  typeof data.defaultStyle!=='string'||typeof data.mixDecks!=='boolean'||
  (typeof data.newPerDay!=='number'||!Number.isFinite(data.newPerDay))||!['claude','chatgpt'].includes(String(data.preferredChat)))return false
 if(data.ui===null)return true
 if(!data.ui||typeof data.ui!=='object'||Array.isArray(data.ui))return false
 const ui=data.ui as Record<string,unknown>
 // The owner removed density and motion controls; old snapshots carrying
 // either key must not be hydrated into live Settings.
 if(Object.keys(ui).some(key=>key!=='mode'))return false
 if(ui.mode!==undefined&&!['auto','day','night'].includes(String(ui.mode)))return false
 return true
}
export type OfflineKey=readonly string[]
export interface OfflineEntry {key:string[];data:unknown;savedAt:number}
export interface OfflineSnapshot {v:1;savedAt:number;entries:OfflineEntry[]}

/** The UI object has an index signature; do not copy it wholesale. */
export function projectOfflineSettings(settings:Settings):OfflineSettings {
 const ui=settings.ui
 return {
  v:1,timeZone:settings.timeZone,rolloverHour:settings.rolloverHour,
  ui:ui?{
   ...(ui.mode==='auto'||ui.mode==='day'||ui.mode==='night'?{mode:ui.mode}:{})
  }:null,
  preferredChat:settings.preferredChat,defaultStyle:settings.defaultStyle,
  mixDecks:settings.mixDecks,newPerDay:settings.newPerDay
 }
}
export function isOfflineKey(key:readonly unknown[]):key is OfflineKey {
 if(!key.every(part=>typeof part==='string'))return false
 if(key.length===1)return ['home','projects','decks','styles','settings'].includes(key[0] as string)
 if(key.length===2)return key[0]==='project'&&typeof key[1]==='string'&&!!key[1]
 if(key.length===3)return key[0]==='checkpoint'&&typeof key[1]==='string'&&!!key[1]&&typeof key[2]==='string'&&!!key[2]
 return false
}
const privateKey=/^(?:.*(?:connector|secret|token|authorization|credential|subscription|pushkey|widgetkey|sessionkey|password|apikey|refreshkey).*)$/i
const privateValue=/(?:\/functions\/v1\/mcp\/|\/mcp\/[^\s/]+|bearer\s+\S+|SENTINEL-SECRET|sb_secret_|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b)/i
/** Defense in depth for non-Settings records: only allowlisted queries, then redact. */
export function scrubOfflineData(value:unknown):unknown {
 const seen=new WeakSet<object>()
 const clean=(input:unknown,depth:number):unknown=>{
  if(depth>32)return null
  if(typeof input==='string')return privateValue.test(input)?null:input
  if(input===null||typeof input==='number'||typeof input==='boolean')return input
  if(Array.isArray(input))return input.map(item=>clean(item,depth+1))
  if(typeof input!=='object'||input instanceof Date)return null
  if(seen.has(input))return null
  seen.add(input)
  const result:Record<string,unknown>={}
  for(const [key,item] of Object.entries(input)){
   if(privateKey.test(key))continue
   result[key]=clean(item,depth+1)
  }
  return result
 }
 return clean(value,0)
}
function sizeOf(value:unknown):number{return encoder.encode(JSON.stringify(value)).byteLength}
function projectSlug(entry:OfflineEntry):string|null {
 return entry.key[0]==='project'||entry.key[0]==='checkpoint'?entry.key[1]??null:null
}
/** Oldest project/checkpoint entries go first; keep at most five project slugs. */
export function boundOfflineEntries(entries:OfflineEntry[],now=Date.now(),maxBytes=OFFLINE_MAX_BYTES):OfflineEntry[]{
 const valid=entries.filter(e=>isOfflineKey(e.key)&&Number.isFinite(e.savedAt)&&e.savedAt<=now&&now-e.savedAt<=OFFLINE_MAX_AGE_MS)
  // Validate before redaction too: a tampered projection with a secret field
  // must be rejected, not silently normalized into an apparently valid record.
  .filter(e=>e.key[0]!=='settings'||isOfflineSettings(e.data))
  .map(e=>({...e,data:scrubOfflineData(e.data)}))
  .filter(e=>e.key[0]!=='settings'||isOfflineSettings(e.data))
 const latest=new Map<string,OfflineEntry>()
 for(const entry of valid){
  const key=JSON.stringify(entry.key),previous=latest.get(key)
  if(!previous||entry.savedAt>=previous.savedAt)latest.set(key,entry)
 }
 let result=[...latest.values()]
 const slugs=[...new Set(result.filter(e=>projectSlug(e)).sort((a,b)=>b.savedAt-a.savedAt).map(e=>projectSlug(e)!))]
 const keep=new Set(slugs.slice(0,5))
 result=result.filter(e=>!projectSlug(e)||keep.has(projectSlug(e)!))
 const total=()=>sizeOf({v:1,savedAt:now,entries:result})
 while(result.length&&total()>maxBytes){
  const projectEntries=result.filter(e=>projectSlug(e)).sort((a,b)=>a.savedAt-b.savedAt)
  const candidate=projectEntries[0]??result.slice().sort((a,b)=>a.savedAt-b.savedAt)[0]
  result=result.filter(e=>e!==candidate)
 }
 return result
}
export function snapshotFromClient(client:QueryClient,now=Date.now()):OfflineSnapshot {
 const entries:OfflineEntry[]=[]
 for(const query of client.getQueryCache().findAll()){
  if(query.state.status!=='success'||!isOfflineKey(query.queryKey))continue
  const data=query.queryKey[0]==='settings'
   ?projectOfflineSettings(query.state.data as Settings):query.state.data
  entries.push({key:[...query.queryKey],data,savedAt:query.state.dataUpdatedAt||now})
 }
 return {v:1,savedAt:now,entries:boundOfflineEntries(entries,now)}
}
function openDb(userId:string):Promise<IDBDatabase>{
 if(!userId||!/^[-\w]{1,128}$/.test(userId))return Promise.reject(Error('Invalid offline user'))
 if(typeof indexedDB==='undefined')return Promise.reject(Error('IndexedDB unavailable'))
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(OFFLINE_DB_PREFIX+userId,1)
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)}
  req.onsuccess=()=>{
   // A sign-out in another tab must be able to delete this owner's database.
   // Otherwise a long-lived connection can block deleteDatabase indefinitely.
   req.result.onversionchange=()=>req.result.close()
   resolve(req.result)
  }
  req.onerror=()=>reject(req.error??Error('Cannot open offline snapshot'))
 })
}
export async function saveOfflineSnapshot(userId:string,client:QueryClient,now=Date.now(),canWrite:()=>boolean=()=>true):Promise<void>{
 // An offline/account switch may occur while IndexedDB is opening. Never
 // commit a queued online save after the connection or owner has changed.
 if(!canWrite())return
 // Capture the owner-scoped data before opening IndexedDB asynchronously:
 // another auth event may clear/refill the shared query cache during that await.
 const snapshot=snapshotFromClient(client,now)
 const db=await openDb(userId)
 try{
  if(!canWrite())return
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite')
   tx.objectStore(STORE).put(snapshot,SLOT)
   tx.oncomplete=()=>resolve()
   tx.onerror=()=>reject(tx.error??Error('Cannot save offline snapshot'))
   tx.onabort=()=>reject(tx.error??Error('Offline snapshot transaction aborted'))
  })
 }finally{db.close()}
}
export async function readOfflineSnapshot(userId:string,now=Date.now()):Promise<OfflineSnapshot|null>{
 const db=await openDb(userId)
 try{
  const value=await new Promise<unknown>((resolve,reject)=>{
   const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(SLOT)
   req.onsuccess=()=>resolve(req.result)
   req.onerror=()=>reject(req.error??Error('Cannot read offline snapshot'))
  })
  if(!value||typeof value!=='object')return null
  const snapshot=value as Partial<OfflineSnapshot>
  if(snapshot.v!==1||!Number.isFinite(snapshot.savedAt)||!snapshot.savedAt||
   snapshot.savedAt>now||now-snapshot.savedAt>OFFLINE_MAX_AGE_MS||!Array.isArray(snapshot.entries))return null
  return {v:1,savedAt:snapshot.savedAt,entries:boundOfflineEntries(snapshot.entries,now)}
 }finally{db.close()}
}
export async function hydrateOfflineSnapshot(userId:string,client:QueryClient,now=Date.now()):Promise<number|null>{
 const snapshot=await readOfflineSnapshot(userId,now)
 if(!snapshot)return null
 for(const entry of snapshot.entries){
  if(client.getQueryData(entry.key)===undefined)
   client.setQueryData(entry.key,entry.data,{updatedAt:entry.savedAt})
 }
 return snapshot.savedAt
}
export async function deleteOfflineSnapshot(userId:string):Promise<void>{
 if(!userId||!/^[-\w]{1,128}$/.test(userId)||typeof indexedDB==='undefined')return
 await new Promise<void>((resolve,reject)=>{
  const req=indexedDB.deleteDatabase(OFFLINE_DB_PREFIX+userId)
  req.onsuccess=()=>resolve()
  req.onerror=()=>reject(req.error??Error('Cannot delete offline snapshot'))
  req.onblocked=()=>reject(Error('Offline snapshot is still open'))
 })
}
