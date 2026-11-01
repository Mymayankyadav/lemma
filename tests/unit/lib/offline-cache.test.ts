import {describe,it,expect} from 'vitest'
import {QueryClient} from '@tanstack/react-query'
import {OFFLINE_MAX_BYTES,OFFLINE_MAX_AGE_MS,projectOfflineSettings,isOfflineSettings,isOfflineKey,scrubOfflineData,boundOfflineEntries,snapshotFromClient,hydrateOfflineSnapshot} from '../../../src/lib/offline-cache'
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
