import {beforeEach,describe,expect,it,vi} from 'vitest'
import {LiveAdapter} from '../../../src/data/live/adapter'

const mock=vi.hoisted(()=>({
 rpc:vi.fn(),getUser:vi.fn(),from:vi.fn(),
}))
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({
  rpc:mock.rpc,from:mock.from,auth:{getUser:mock.getUser},
 }),
}))

describe('FIX #475 bounded source transcription statistics',()=>{
 beforeEach(()=>{
  mock.rpc.mockReset()
  mock.from.mockReset()
  mock.getUser.mockReset()
  mock.getUser.mockResolvedValue({data:{user:{id:'owner-1'}},error:null})
 })
 it('loads 100 extreme-profile source counters with one owner-scoped aggregate RPC',async()=>{
  const rows=Array.from({length:100},(_,i)=>({
   source_id:'source-'+i,
   transcribed:i===0?3000:0,
   needs_check:i===0?300:0,
  }))
  mock.rpc.mockResolvedValue({data:rows,error:null})
  const stats=await new LiveAdapter().getSourceTranscriptionStats('project-1')
  expect(stats).toHaveLength(100)
  expect(stats[0]).toEqual({sourceId:'source-0',transcribed:3000,needsCheck:300})
  expect(stats[99]).toEqual({sourceId:'source-99',transcribed:0,needsCheck:0})
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith(
   'source_transcription_stats',{p_project_id:'project-1'})
  expect(mock.getUser).toHaveBeenCalledOnce()
  expect(mock.from).not.toHaveBeenCalled()
 })
 it('preserves zero-count projects without any page fetches',async()=>{
  mock.rpc.mockResolvedValue({data:[],error:null})
  expect(await new LiveAdapter().getSourceTranscriptionStats('empty')).toEqual([])
  expect(mock.rpc).toHaveBeenCalledOnce()
  expect(mock.from).not.toHaveBeenCalled()
 })
 it('fails closed on aggregate RPC authorization errors',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'permission denied'}})
  await expect(new LiveAdapter().getSourceTranscriptionStats('private'))
   .rejects.toMatchObject({code:'auth'})
  expect(mock.from).not.toHaveBeenCalled()
 })
})
