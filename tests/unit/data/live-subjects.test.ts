import {beforeEach,describe,expect,it,vi} from 'vitest'

const calls=vi.hoisted(()=>({
 updates:[] as Record<string,unknown>[],
 filters:[] as [string,string][],
 rpcs:[] as {name:string;args:Record<string,string>}[],
}))
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({
  auth:{getUser:async()=>({data:{user:{id:'owner-1'}},error:null})},
  from:()=>({
   update:(patch:Record<string,unknown>)=>{
    calls.updates.push(patch)
    const chain={
     eq:(key:string,value:string)=>{calls.filters.push([key,value]);return chain},
     select:()=>chain,
     single:async()=>({data:{id:'subject-1',name:'Algebra',glyph:'A',hue:'amber',position:1},error:null}),
    }
    return chain
   },
  }),
  rpc:async(name:string,args:Record<string,string>)=>{
   calls.rpcs.push({name,args})
   return {data:{moved_projects:2,moved_concepts:3},error:null}
  },
 }),
}))
import {LiveAdapter} from '../../../src/data/live/adapter'

describe('live DB-4 subject mutations',()=>{
 beforeEach(()=>{calls.updates.length=0;calls.filters.length=0;calls.rpcs.length=0})
 it('scopes edits to the owner and maps camelCase patches to DB columns',async()=>{
  const result=await new LiveAdapter().updateSubject('subject-1',{name:'Abstract Algebra',glyph:'𝔄'})
  expect(result.id).toBe('subject-1')
  expect(calls.updates).toEqual([{name:'Abstract Algebra',glyph:'𝔄'}])
  expect(calls.filters).toContainEqual(['id','subject-1'])
  expect(calls.filters).toContainEqual(['user_id','owner-1'])
 })
 it('uses the audited owner-checked merge_subjects RPC',async()=>{
  await new LiveAdapter().mergeSubjects('subject-1','subject-2')
  expect(calls.rpcs).toEqual([{name:'merge_subjects',args:{p_source:'subject-1',p_target:'subject-2'}}])
 })
 it('rejects self-merges before a write',async()=>{
  await expect(new LiveAdapter().mergeSubjects('subject-1','subject-1')).rejects.toMatchObject({code:'invalid'})
  expect(calls.rpcs).toEqual([])
 })
})
