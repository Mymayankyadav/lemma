import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createLiveExamApi} from '../../../src/data/exam/live'
import type {Envelope} from '../../../src/data/exam/commands'
import type {ExamSetup,SittingRecord} from '../../../src/data/exam/contract'

const fake=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),getSession:vi.fn()}))
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({rpc:fake.rpc,from:fake.from,auth:{getSession:fake.getSession}})}))

const sitting:SittingRecord={
 id:'exam',project_id:'path',title:'Exam',status:'active',starts_at:'2026-12-02T13:00:00.000Z',
 time_zone:'UTC',study_minutes:60,phase:'screen',card_mode:'later',version:1,blueprint_version:1,ledger:{},
 blueprint:[{key:'a',title:'A scored proof',marks:6,concepts:['proof']}],
}
const expectedRows=[{key:'a',disposition:'defer' as const,reason:'Later',reopen:'With more time'}]
function receipt(envelope:Envelope,status='ok'){
 return {data:{operationId:envelope.operationId,status,conflict:{currentVersion:2}},error:null}
}
function query(value:unknown){
 const chain={
  select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),is:vi.fn().mockReturnThis(),
  order:vi.fn().mockReturnThis(),limit:vi.fn().mockReturnThis(),lte:vi.fn().mockReturnThis(),
  maybeSingle:vi.fn().mockResolvedValue({data:value,error:null}),
  then(resolve:(value:unknown)=>void){return Promise.resolve({data:value,error:null}).then(resolve)},
 }
 return chain
}
beforeEach(()=>{
 vi.clearAllMocks()
 sessionStorage.clear()
 fake.getSession.mockResolvedValue({data:{session:{user:{id:'owner'}}},error:null})
})

describe('live exam adapter',()=>{
 it('refreshes an optimistic version conflict and re-applies once with a fresh operation ID',async()=>{
  fake.from.mockReturnValue(query({...sitting,version:2}))
  fake.rpc.mockImplementation((_rpc,{p}: {p:Envelope})=>Promise.resolve(receipt(p,p.expectedVersion===1?'conflict':'ok')))
  const api=createLiveExamApi()
  await api.change(sitting,{operation:'set_disposition',patch:{rows:expectedRows}})
  expect(fake.rpc).toHaveBeenCalledTimes(2)
  const [first,second]=fake.rpc.mock.calls.map(([,request])=>request.p)
  expect(first).toMatchObject({expectedVersion:1,patch:{rows:expectedRows}})
  expect(second).toMatchObject({expectedVersion:2,patch:{rows:expectedRows}})
  expect(first.operationId).not.toBe(second.operationId)
  expect(fake.from).toHaveBeenCalledWith('exam_sittings')
 })
 it('surfaces a second conflict without attempting a third write',async()=>{
  fake.from.mockReturnValue(query({...sitting,version:2}))
  fake.rpc.mockImplementation((_rpc,{p}: {p:Envelope})=>Promise.resolve(receipt(p,'conflict')))
  await expect(createLiveExamApi().change(sitting,{operation:'pause'})).rejects.toMatchObject({code:'conflict'})
  expect(fake.rpc).toHaveBeenCalledTimes(2)
 })
 it('keeps the required as-of cutoff and deterministic limits shared with the MCP planner inputs',async()=>{
  const attempts=query([])
  fake.from.mockReturnValue(attempts)
  fake.rpc.mockResolvedValue({data:[],error:null})
  const asOf='2026-11-25T12:00:00.000Z'
  await expect(createLiveExamApi().readEvidence(sitting,asOf)).resolves.toEqual({attempts:[],evidence:[]})
  expect(attempts.eq.mock.calls).toEqual([['user_id','owner'],['sitting_id',sitting.id]])
  expect(attempts.is).toHaveBeenCalledWith('voided_at',null)
  expect(attempts.lte).toHaveBeenCalledWith('occurred_at',asOf)
  expect(attempts.order.mock.calls).toEqual([['occurred_at',{ascending:false}],['id',{ascending:false}]])
  expect(attempts.limit).toHaveBeenCalledWith(500)
  expect(fake.rpc).toHaveBeenCalledWith('exam_row_evidence',{p_owner:'owner',p_sitting:sitting.id,p_as_of:asOf})
 })
 it('resumes a committed sitting after reloading without losing its deadline operation ID',async()=>{
  let sittingId=''
  fake.from.mockImplementation((table:string)=>query(table==='deadlines'?null:{...sitting,id:sittingId}))
  fake.rpc.mockImplementation((name,{p}:{p:Envelope})=>{
   if(name==='exam_sitting_command'){
    sittingId=p.target!.id
    return Promise.resolve(receipt(p))
   }
   if(fake.rpc.mock.calls.length<=3)return Promise.reject(new Error('offline'))
   return Promise.resolve(receipt(p))
  })
  const setup:ExamSetup={
   project_id:'path',title:'Exam',starts_at:sitting.starts_at!,time_zone:'UTC',
   duration_minutes:120,study_minutes:60,total_marks:60,objective:'expected_marks',
   sources:[],blueprint:[],card_mode:'later',activate:true,
  }
  await expect(createLiveExamApi().setup(setup)).rejects.toThrow('link its calendar deadline')
  await expect(createLiveExamApi().resumeSetup('path')).resolves.toBe(sittingId)
  expect(fake.rpc.mock.calls.map(([name])=>name)).toEqual([
   'exam_sitting_command','deadlines_command','deadlines_command','deadlines_command',
  ])
  expect(fake.rpc.mock.calls[3]).toEqual(fake.rpc.mock.calls[1])
  expect(fake.rpc.mock.calls[3][1].p.target.id).toBe(sittingId)
 })
})
