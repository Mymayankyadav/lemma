import {beforeEach,describe,expect,it,vi} from 'vitest'
import {LiveAdapter} from '../../../src/data/live/adapter'

const mocks=vi.hoisted(()=>({from:vi.fn(),owner:vi.fn(async()=> 'owner-1')}))
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({from:mocks.from})}))
vi.mock('../../../src/data/live/helpers',async importOriginal=>{
 const actual=await importOriginal<typeof import('../../../src/data/live/helpers')>()
 return {...actual,owner:mocks.owner}
})

describe('v3 live adapter owner-scoped writes',()=>{
 beforeEach(()=>{mocks.from.mockReset();mocks.owner.mockClear()})
 it('creates a name-only draft without inventing subject or goal',async()=>{
  const insert=vi.fn().mockReturnValue({select:()=>({single:async()=>({data:{
   id:'p1',slug:'real-analysis',title:'Real Analysis',goal:null,subject_id:null,style:'socratic',
   status:'planning',created_at:'2026-10-30T00:00:00Z'
  },error:null})})})
  mocks.from.mockReturnValue({insert})
  const result=await new LiveAdapter().createProjectDraft({title:' Real Analysis '})
  expect(mocks.from).toHaveBeenCalledWith('projects')
  expect(mocks.owner).toHaveBeenCalledOnce()
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
   user_id:'owner-1',title:'Real Analysis',slug:'real-analysis',subject_id:null,goal:null,system:false
  }))
  expect(result).toMatchObject({slug:'real-analysis',subjectId:'',goal:''})
 })
 it('validates and updates only title/kind of the owner\'s source',async()=>{
  const row={id:'s1',project_id:'p1',title:'Lecture 7',short:'lecture-7',filename:'notes.pdf',
   page_count:3,status:'ready',has_text:true,outline:[],created_at:'2026-10-30T00:00:00Z',kind:'notes'}
  const eq=vi.fn()
  const chain:{eq:typeof eq;select:()=>{single:()=>Promise<{data:typeof row;error:null}>}}={
   eq,select:()=>({single:async()=>({data:row,error:null})})
  }
  eq.mockReturnValue(chain)
  const update=vi.fn().mockReturnValue(chain)
  mocks.from.mockReturnValue({update})
  const result=await new LiveAdapter().updateSource('s1',{title:' Lecture 7 ',kind:'notes'})
  expect(update).toHaveBeenCalledWith({title:'Lecture 7',kind:'notes'})
  expect(eq).toHaveBeenCalledWith('user_id','owner-1')
  expect(result.title).toBe('Lecture 7')
  await expect(new LiveAdapter().updateSource('s1',{kind:'not-a-kind' as never})).rejects.toMatchObject({code:'invalid'})
 })
})
