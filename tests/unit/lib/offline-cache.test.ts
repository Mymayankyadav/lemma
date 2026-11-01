import {describe,it,expect} from 'vitest'
import {QueryClient} from '@tanstack/react-query'
import {OFFLINE_MAX_BYTES,OFFLINE_MAX_AGE_MS,projectOfflineSettings,isOfflineSettings,isOfflineKey,scrubOfflineData,boundOfflineEntries,snapshotFromClient,mergeOfflineSnapshots,hydrateOfflineSnapshot,stageOfflineHandoff,readOfflineHandoff,clearOfflineHandoff} from '../../../src/lib/offline-cache'
import type {Settings} from '../../../src/data/types'
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
   {key:['home'],savedAt:now,data:{title:'Today',push_key:'opaque-push-credential',
    nested:{widget_key:'opaque-widget-credential',author:'Ada',
     vapid_private_key:'opaque-vapid-credential',private_key:'opaque-private-credential',
     service_role_key:'opaque-service-credential',access_key:'opaque-access-credential'}}},
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
   expect(client.getQueryData(['home'])).toEqual({title:'Today',nested:{author:'Ada'}})
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
 it('evicts stale and sixth-project data, then respects the 2MB hard cap',()=>{
  const entries=Array.from({length:7},(_,i)=>({key:['project','p'+i],savedAt:now-i*1000,data:{text:'x'.repeat(500_000)}}))
  entries.push({key:['decks'],savedAt:now-OFFLINE_MAX_AGE_MS-1,data:[]})
  const bounded=boundOfflineEntries(entries,now)
  expect(new Set(bounded.map(e=>e.key[1]).filter(Boolean)).size).toBeLessThanOrEqual(5)
  expect(bounded.some(e=>e.key[0]==='decks')).toBe(false)
  expect(new TextEncoder().encode(JSON.stringify({v:1,savedAt:now,entries:bounded})).byteLength).toBeLessThanOrEqual(OFFLINE_MAX_BYTES)
  expect(bounded.some(e=>e.key[1]==='p6')).toBe(false)
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

describe('AND-8 rapid full-page navigation handoff',()=>{
 function memoryStorage():Storage{
  const values=new Map<string,string>();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value)},
   removeItem:key=>{values.delete(key)},clear:()=>values.clear(),key:index=>[...values.keys()][index]??null,
   get length(){return values.size}} as Storage;
 }
 it('retains separately visited routes across reloads without exposing another owner',()=>{
  const storage=memoryStorage();
  stageOfflineHandoff('owner-a',['home'],{title:'Today'},now-3000,now,storage);
  stageOfflineHandoff('owner-a',['projects'],[{slug:'real-analysis'}],now-2000,now,storage);
  stageOfflineHandoff('owner-a',['project','real-analysis'],{title:'Analysis'},now-1000,now,storage);
  expect(readOfflineHandoff('owner-a',now,storage)?.entries.map(e=>e.key.join(':')).sort())
   .toEqual(['home','project:real-analysis','projects']);
  expect(readOfflineHandoff('owner-b',now,storage)).toBeNull();
  clearOfflineHandoff('owner-a',storage);
  expect(readOfflineHandoff('owner-a',now,storage)).toBeNull();
 });
 it('redacts separator variants and opaque private/VAPID/service-role/access credentials across all cache surfaces',()=>{
  const unsafe={title:'ℝ → ℂ',author:'Ada',nested:{
   push_key:'opaque-push-credential',widget_key:'opaque-widget-credential',
   session_key:'opaque-session-credential',refresh_key:'opaque-refresh-credential',
   api_key:'opaque-api-credential','x-api-key':'opaque-header-credential',
   'api.key':'opaque-api-dot-credential','push.key':'opaque-push-dot-credential',
   'widget key':'opaque-widget-space-credential',
   vapid_private_key:'opaque-vapid-credential',private_key:'opaque-private-credential',
   service_role_key:'opaque-service-credential',access_key:'opaque-access-credential',
   'VAPID.Private-Key':'opaque-vapid-dot-credential',
   'service role key':'opaque-service-space-credential',
   'ACCESS.KEY':'opaque-access-dot-credential',
   p256dh:'opaque-p256dh-credential',auth:'opaque-auth-credential',
   endpoint:'https://push.invalid/opaque-endpoint-credential',safe:'keep me',
  }};
  const expected={title:'ℝ → ℂ',author:'Ada',nested:{safe:'keep me'}};
  expect(scrubOfflineData(unsafe)).toEqual(expected);
  const bounded=boundOfflineEntries([{key:['home'],savedAt:now,data:unsafe}],now);
  expect(bounded[0]?.data).toEqual(expected);
  const storage=memoryStorage();
  stageOfflineHandoff('owner-a',['home'],unsafe,now,now,storage);
  const serialized=storage.getItem('lemma-offline-handoff:owner-a')??'';
  expect(serialized).not.toContain('opaque-');
  expect(readOfflineHandoff('owner-a',now,storage)?.entries[0]?.data).toEqual(expected);
 });
 it('stages only allowlisted, bounded, secret-free records and mode-only settings',()=>{
  const storage=memoryStorage();
  stageOfflineHandoff('owner-a',['settings'],settings,now,now,storage);
  stageOfflineHandoff('owner-a',['auth'],{token:'SENTINEL-SECRET'},now,now,storage);
  stageOfflineHandoff('owner-a',['decks'],[{title:'Safe',connectorUrl:'SENTINEL-SECRET'}],now,now,storage);
  const raw=storage.getItem('lemma-offline-handoff:owner-a')??'';
  expect(raw).not.toMatch(/SENTINEL-SECRET|connectorUrl|density|motion|token/);
  const snapshot=readOfflineHandoff('owner-a',now,storage);
  expect(snapshot?.entries.map(e=>e.key[0]).sort()).toEqual(['decks','settings']);
  expect(snapshot?.entries.find(e=>e.key[0]==='settings')?.data).toEqual(projectOfflineSettings(settings));
  expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(OFFLINE_MAX_BYTES);
 });
});
