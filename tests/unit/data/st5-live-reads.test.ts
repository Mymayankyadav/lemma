import {beforeEach,describe,expect,it,vi} from 'vitest'
import {LiveAdapter} from '../../../src/data/live/adapter'

const mock=vi.hoisted(()=>({
 rpc:vi.fn(),getUser:vi.fn(),
}))
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({rpc:mock.rpc,auth:{getUser:mock.getUser}}),
}))

describe('ST-5 bounded live reads',()=>{
 beforeEach(()=>{
  mock.rpc.mockReset()
  mock.getUser.mockReset()
  mock.getUser.mockResolvedValue({data:{user:{id:'owner-1'}},error:null})
 })
 it('loads the entire Paths library with one owner-scoped summary RPC',async()=>{
  const summary={id:'p1',slug:'algebra',title:'Algebra',done:3,total:40,
   subject:{id:'s1',name:'Math',glyph:'∫',hue:'slate',position:0},
   status:'active',current:{code:'CP4',title:'Groups',step:0,stepsTotal:4},
   cardsCount:150,sessionsCount:8,sourcesCount:2,sourceTitles:['Notes','Book']}
  mock.rpc.mockResolvedValue({data:[summary],error:null})
  const rows=await new LiveAdapter().listProjects()
  expect(rows).toEqual([summary])
  expect(mock.rpc).toHaveBeenCalledOnce()
  expect(mock.rpc).toHaveBeenCalledWith('project_summaries')
  expect(mock.getUser).toHaveBeenCalledOnce()
 })
 it('searches server-side and requests no more than fifty cards',async()=>{
  mock.rpc.mockResolvedValue({data:[],error:null})
  expect(await new LiveAdapter().searchCards('x%_','algebra')).toEqual([])
  expect(mock.rpc).toHaveBeenCalledOnce()
  expect(mock.rpc).toHaveBeenCalledWith('search_cards_page',{
   p_query:'x%_',p_slug:'algebra',p_limit:50,p_offset:0,
  })
  expect(mock.getUser).toHaveBeenCalledOnce()
 })
 it('passes a null project filter when searching all projects',async()=>{
  mock.rpc.mockResolvedValue({data:[],error:null})
  await new LiveAdapter().searchCards('theorem')
  expect(mock.rpc).toHaveBeenCalledWith('search_cards_page',
   expect.objectContaining({p_query:'theorem',p_slug:null}))
 })
 it('does not silently treat an RPC error as an empty list',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'not permitted'}})
  await expect(new LiveAdapter().listProjects()).rejects.toMatchObject({code:'auth'})
 })
})
