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
 it('loads Today in one RPC without fetching all reviews or sessions',async()=>{
  const home={resume:{projectSlug:'algebra',projectTitle:'Algebra',glyph:'∫',
   checkpointCode:'CP4',checkpointTitle:'Groups',step:2,stepsTotal:4,
   question:'Why?',objective:'Prove a theorem',pausedAt:'2026-10-31T00:00:00Z',
   sessionNumber:3},due:20,pendingProposals:4,projects:[]}
  mock.rpc.mockResolvedValue({data:home,error:null})
  expect(await new LiveAdapter().getHome()).toEqual(home)
  expect(mock.rpc).toHaveBeenCalledOnce()
  expect(mock.rpc).toHaveBeenCalledWith('home_summary')
  expect(mock.getUser).toHaveBeenCalledOnce()
 })
 it('loads the Review deck tree in one RPC without whole-table downloads',async()=>{
  const tree=[{key:'project:algebra',label:'Algebra',glyph:'∫',level:0,due:3,
   children:[{key:'cp:algebra:CP1',label:'Groups',glyph:'∫',level:1,due:3,children:[]}]}]
  mock.rpc.mockResolvedValue({data:tree,error:null})
  expect(await new LiveAdapter().getDeckTree()).toEqual(tree)
  expect(mock.rpc).toHaveBeenCalledOnce()
  expect(mock.rpc).toHaveBeenCalledWith('deck_tree')
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
 it('preserves the legacy 100-result cap without downloading entire tables',async()=>{
  const page=Array.from({length:50},(_,i)=>({noteNo:i+1}))
  mock.rpc.mockResolvedValueOnce({data:page,error:null})
   .mockResolvedValueOnce({data:[{noteNo:51}],error:null})
  const result=await new LiveAdapter().searchCards('')
  expect(result).toHaveLength(51)
  expect(mock.rpc).toHaveBeenCalledTimes(2)
  expect(mock.rpc).toHaveBeenNthCalledWith(2,'search_cards_page',{
   p_query:'',p_slug:null,p_limit:50,p_offset:50,
  })
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
