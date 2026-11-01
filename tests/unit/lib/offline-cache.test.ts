import {describe,it,expect} from 'vitest'
import {QueryClient} from '@tanstack/react-query'
import {OFFLINE_MAX_BYTES,OFFLINE_MAX_AGE_MS,projectOfflineSettings,isOfflineSettings,isOfflineKey,scrubOfflineData,boundOfflineEntries,snapshotFromClient,mergeOfflineSnapshots,hydrateOfflineSnapshot,saveOfflineSnapshot} from '../../../src/lib/offline-cache'
import type {Settings} from '../../../src/data/types'
import {canWriteOnline} from '../../../src/ui/useOnlineStatus'
const now=Date.UTC(2026,10,1)
const settings={
 timeZone:'Asia/Kolkata',rolloverHour:4,ui:{mode:'night',density:'compact',motion:'lively',connectorUrl:'SENTINEL-SECRET-UI'},
 preferredChat:'chatgpt',defaultStyle:'proof',mixDecks:true,newPerDay:10,
 connectorUrl:'https://example.test/functions/v1/mcp/SENTINEL-SECRET',access_token:'SENTINEL-SECRET-TOKEN'
} as unknown as Settings
describe('AND-8 strict offline snapshot',()=>{
 it('keeps exactly eight versioned Settings fields and no nested unknown UI keys',()=>{
  const projection=projectOfflineSettings(settings)
  expect(Object.keys(projection).sort()).toEqual(['v','timeZone','rolloverHour','ui','preferredChat','defaultStyle','mixDecks','newPerDay'].sort())
  expect(projection.ui).toEqual({mode:'night'})
  expect(JSON.stringify(projection)).not.toMatch(/density|motion/)
  expect(JSON.stringify(projection)).not.toContain('SENTINEL-SECRET')
 })
 it('rejects tampered offline settings on read before they reach React Query',()=>{
  const good=projectOfflineSettings(settings)
  expect(isOfflineSettings(good)).toBe(true)
  expect(isOfflineSettings({...good,connectorUrl:'SENTINEL-SECRET'})).toBe(false)
  expect(isOfflineSettings({...good,ui:{...(good.ui??{}),widgetToken:'SENTINEL-SECRET'}})).toBe(false)
  expect(isOfflineSettings({...good,ui:{mode:'night',density:'compact'}})).toBe(false)
  expect(isOfflineSettings({...good,ui:{mode:'night',motion:'lively'}})).toBe(false)
  expect(isOfflineSettings({...good,ui:{}})).toBe(false)
  expect(isOfflineSettings({...good,ui:{mode:'obsolete'}})).toBe(false)
  expect(isOfflineSettings({...good,rolloverHour:'four'})).toBe(false)
  expect(isOfflineSettings({...good,v:2})).toBe(false)
  const entries=[
   {key:['settings'],savedAt:now,data:{...good,connectorUrl:'SENTINEL-SECRET'}},
   {key:['settings'],savedAt:now-1,data:{...good,ui:{...(good.ui??{}),widgetToken:'SENTINEL-SECRET'}}},
   {key:['settings'],savedAt:now-2,data:{...good,ui:{mode:'night',density:'compact'}}},
   {key:['settings'],savedAt:now-3,data:{...good,ui:{mode:'night',motion:'lively'}}},
   {key:['decks'],savedAt:now,data:[{key:'project:math',due:12}]}
  ]
  const safe=boundOfflineEntries(entries,now)
  expect(safe.map(entry=>entry.key[0])).toEqual(['decks'])
 })

 it('does not hydrate a legacy density/motion snapshot into live Settings',async()=>{
  const client=new QueryClient()
  const good=projectOfflineSettings(settings)
  const snapshot={v:1,savedAt:now,entries:[
   {key:['settings'],savedAt:now,data:{...good,ui:{mode:'night',density:'compact'}}},
   {key:['decks'],savedAt:now,data:[{key:'project:analysis',due:3}]},
  ]}
  const old=Object.getOwnPropertyDescriptor(globalThis,'indexedDB')
  const read={result:snapshot,onsuccess:null as null|(()=>void),onerror:null as null|(()=>void)}
  const db={transaction:()=>({objectStore:()=>({get:()=>{
   queueMicrotask(()=>read.onsuccess?.());return read
  }})}),close:()=>{}}
  const open={result:db,onsuccess:null as null|(()=>void),onerror:null as null|(()=>void),onupgradeneeded:null as null|(()=>void)}
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{
   open:()=>{queueMicrotask(()=>open.onsuccess?.());return open},
  }})
  try{
   expect(await hydrateOfflineSnapshot('owner',client,now)).toBe(now)
   expect(client.getQueryData(['settings'])).toBeUndefined()
   expect(client.getQueryData(['decks'])).toEqual([{key:'project:analysis',due:3}])
  }finally{
   client.clear()
   if(old)Object.defineProperty(globalThis,'indexedDB',old)
   else Reflect.deleteProperty(globalThis,'indexedDB')
  }
 })
 it('accepts only the exact read-only query allowlist',()=>{
  for(const key of [['home'],['projects'],['project','math'],['checkpoint','math','CP4'],['decks'],['styles'],['settings']])
   expect(isOfflineKey(key)).toBe(true)
  for(const key of [['auth'],['review-items'],['atlas'],['insights',30],['project'],['settings','connector'],['session','a'],['push-subscriptions']])
   expect(isOfflineKey(key)).toBe(false)
 })
 it('removes secrets even when nested in a permitted query',()=>{
  const value={title:'Algebra',connectorUrl:'SENTINEL-SECRET',nested:{widgetToken:'abc',label:'Bearer SECRET',valid:'ok'},items:[{pushSubscription:'key'}]}
  const clean=JSON.stringify(scrubOfflineData(value))
  expect(clean).not.toMatch(/SENTINEL-SECRET|Bearer|widgetToken|pushSubscription|connectorUrl/)
  expect(clean).toContain('Algebra')
 })
 it('redacts JWT-shaped auth strings even under innocuous field names',()=>{
  const token='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.abcdefghijklmnop123456'
  const cached={title:'Analysis',note:'Signed in with '+token,other:{value:token},safe:'one proof'}
  const cleaned=JSON.stringify(scrubOfflineData(cached))
  expect(cleaned).not.toContain(token)
  expect(cleaned).toContain('one proof')
  expect(cleaned).toContain('Analysis')
 })
 it('evicts stale and sixth-project data, then respects the 2MB hard cap',()=>{
  const entries=Array.from({length:7},(_,i)=>({key:['project','p'+i],savedAt:now-i*1000,data:{text:'x'.repeat(500_000)}}))
  entries.push({key:['decks'],savedAt:now-OFFLINE_MAX_AGE_MS-1,data:[]})
  const bounded=boundOfflineEntries(entries,now)
  expect(new Set(bounded.map(e=>e.key[1]).filter(Boolean)).size).toBeLessThanOrEqual(5)
  expect(bounded.some(e=>e.key[0]==='decks')).toBe(false)
  expect(new TextEncoder().encode(JSON.stringify({v:1,savedAt:now,entries:bounded})).byteLength).toBeLessThanOrEqual(OFFLINE_MAX_BYTES)
  expect(bounded.some(e=>e.key[1]==='p6')).toBe(false)
 })
 it('treats stale snapshot fallback as read-only even with navigator.onLine true',()=>{
  expect(canWriteOnline(true,undefined)).toBe(true)
  expect(canWriteOnline(false,undefined)).toBe(false)
  expect(canWriteOnline(true,String(now))).toBe(false)
  expect(canWriteOnline(true,'0')).toBe(true)
  expect(canWriteOnline(true,'invalid')).toBe(true)
 })
 it('never stores auth, card faces, raw settings or other queries',()=>{
  const client=new QueryClient()
  client.setQueryData(['settings'],settings,{updatedAt:now})
  client.setQueryData(['home'],{title:'Today',authToken:'SENTINEL-SECRET-TOKEN'},{updatedAt:now})
  client.setQueryData(['review-items','all'],[{front:'sensitive card face'}],{updatedAt:now})
  client.setQueryData(['auth'],{access_token:'SENTINEL-SECRET'},{updatedAt:now})
  const snapshot=snapshotFromClient(client,now)
  expect(snapshot.entries.map(e=>e.key[0]).sort()).toEqual(['home','settings'])
  expect(JSON.stringify(snapshot)).not.toMatch(/SENTINEL-SECRET|sensitive card face|access_token|connectorUrl/)
 })
})

describe('AND-8 atomic recent-route retention',()=>{
 it('preserves Home, Paths and Project across separate full-page QueryClients',()=>{
  const a=new QueryClient(),b=new QueryClient();
  a.setQueryData(['home'],{title:'Today'},{updatedAt:now-3000});
  a.setQueryData(['projects'],[{slug:'real-analysis'}],{updatedAt:now-2000});
  b.setQueryData(['project','real-analysis'],{project:{title:'Analysis'}},{updatedAt:now-1000});
  const earlier=snapshotFromClient(a,now-1500);
  const later=snapshotFromClient(b,now);
  const merged=mergeOfflineSnapshots(earlier,later,now);
  expect(merged.entries.map(e=>e.key.join(':')).sort()).toEqual(['home','project:real-analysis','projects']);
  expect(merged.savedAt).toBe(now);
  a.clear();b.clear();
 });
 it('never resurrects stale, oversized, tampered or cross-owner data',()=>{
  const recent={v:1,savedAt:now-1,entries:[
   {key:['home'],data:{title:'ok',access_token:'SENTINEL-SECRET'},savedAt:now-1},
   {key:['settings'],data:{...projectOfflineSettings(settings),connectorUrl:'SENTINEL-SECRET'},savedAt:now-1},
   {key:['auth'],data:{token:'SENTINEL-SECRET'},savedAt:now-1},
  ]};
  const merged=mergeOfflineSnapshots(recent,{v:1,savedAt:now,entries:[]},now);
  expect(merged.entries.map(e=>e.key[0])).toEqual(['home']);
  expect(JSON.stringify(merged)).not.toContain('SENTINEL-SECRET');
  expect(mergeOfflineSnapshots({...recent,savedAt:now-OFFLINE_MAX_AGE_MS-1},
   {v:1,savedAt:now,entries:[]},now).entries).toEqual([]);
 });
});

describe('AND-8 account-switch save race',()=>{
 it('captures A query data before an asynchronous IndexedDB open can observe B',async()=>{
  const client=new QueryClient()
  client.setQueryData(['home'],{title:'Only A'},{updatedAt:now})
  const old=Object.getOwnPropertyDescriptor(globalThis,'indexedDB')
  let releaseOpen:()=>void=()=>{}
  let stored:unknown
  const tx={
   oncomplete:null as null|(()=>void),
   onerror:null as null|(()=>void),
   onabort:null as null|(()=>void),
   objectStore:()=>({
    get:()=>{const req={result:undefined,onsuccess:null as null|(()=>void),onerror:null as null|(()=>void)};
     queueMicrotask(()=>req.onsuccess?.());return req},
    put:(value:unknown)=>{
     stored=value
     queueMicrotask(()=>tx.oncomplete?.())
    },
   }),
  }
  const db={transaction:()=>tx,close:()=>{},onversionchange:null as null|(()=>void)}
  const request={
   result:db,
   onsuccess:null as null|(()=>void),
   onerror:null as null|(()=>void),
   onupgradeneeded:null as null|(()=>void),
  }
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{
   open:()=>{releaseOpen=()=>request.onsuccess?.();return request},
  }})
  try{
   const pending=saveOfflineSnapshot('owner-a',client,now)
   // The old implementation read the shared QueryClient *after* openDb.
   // A fast account switch could therefore persist B's rows under A's ID.
   client.setQueryData(['home'],{title:'Only B'},{updatedAt:now})
   releaseOpen()
   await pending
   const snapshot=stored as {entries:{key:string[];data:{title:string}}[]}
   expect(snapshot.entries.find(e=>e.key[0]==='home')?.data.title).toBe('Only A')
  }finally{
   client.clear()
   if(old)Object.defineProperty(globalThis,'indexedDB',old)
   else Reflect.deleteProperty(globalThis,'indexedDB')
  }
 })

 it('cancels a queued save if the owner goes offline while IndexedDB opens',async()=>{
  const client=new QueryClient()
  client.setQueryData(['home'],{title:'A'},{updatedAt:now})
  const old=Object.getOwnPropertyDescriptor(globalThis,'indexedDB')
  let releaseOpen:()=>void=()=>{}
  let transactions=0
  const db={transaction:()=>{transactions++;throw Error('Offline save must not write')},close:()=>{},onversionchange:null as null|(()=>void)}
  const request={result:db,onsuccess:null as null|(()=>void),onerror:null as null|(()=>void),onupgradeneeded:null as null|(()=>void)}
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{
   open:()=>{releaseOpen=()=>request.onsuccess?.();return request},
  }})
  try{
   let online=true
   const pending=saveOfflineSnapshot('owner-a',client,now,()=>online)
   online=false
   releaseOpen()
   await pending
   expect(transactions).toBe(0)
  }finally{
   client.clear()
   if(old)Object.defineProperty(globalThis,'indexedDB',old)
   else Reflect.deleteProperty(globalThis,'indexedDB')
  }
 })
})
