import {describe,it,expect} from 'vitest'
import {QueryClient} from '@tanstack/react-query'
import {OFFLINE_MAX_BYTES,OFFLINE_MAX_AGE_MS,projectOfflineSettings,isOfflineKey,scrubOfflineData,boundOfflineEntries,snapshotFromClient} from '../../../src/lib/offline-cache'
import type {Settings} from '../../../src/data/types'
const now=Date.UTC(2026,10,1)
const settings={
 timeZone:'Asia/Kolkata',rolloverHour:4,ui:{mode:'night',density:'compact',connectorUrl:'SENTINEL-SECRET-UI'},
 preferredChat:'chatgpt',defaultStyle:'proof',mixDecks:true,newPerDay:10,
 connectorUrl:'https://example.test/functions/v1/mcp/SENTINEL-SECRET',access_token:'SENTINEL-SECRET-TOKEN'
} as unknown as Settings
describe('AND-8 strict offline snapshot',()=>{
 it('keeps exactly eight versioned Settings fields and no nested unknown UI keys',()=>{
  const projection=projectOfflineSettings(settings)
  expect(Object.keys(projection).sort()).toEqual(['v','timeZone','rolloverHour','ui','preferredChat','defaultStyle','mixDecks','newPerDay'].sort())
  expect(projection.ui).toEqual({mode:'night',density:'compact'})
  expect(JSON.stringify(projection)).not.toContain('SENTINEL-SECRET')
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
