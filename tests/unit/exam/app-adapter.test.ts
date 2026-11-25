import {afterEach, describe, expect, it, vi} from 'vitest'
import {createCommandRunner, type Envelope} from '../../../src/data/exam/commands'
import {createDemoExamApi} from '../../../src/data/exam/demo'
import {selectSitting} from '../../../src/data/exam/contract'
import {planExam} from '../../../supabase/functions/_shared/exam/plan'

const change={resource:'exam_sittings', operation:'pause',target:{id:'sitting'},expectedVersion:2} as const

afterEach(()=>vi.restoreAllMocks())

describe('app exam commands',()=>{
 it('reuses the exact operation ID and payload after a lost acknowledgement',async()=>{
  const rpc=vi.fn(async(_name:string, request:Envelope)=>({data:{operationId:request.operationId,status:'ok'},error:null}))
  rpc.mockRejectedValueOnce(new Error('connection closed'))
  const id=vi.fn(()=>crypto.randomUUID())
  const run=createCommandRunner(rpc,id)
  await expect(run(change)).resolves.toMatchObject({status:'ok'})
  expect(id).toHaveBeenCalledTimes(1)
  expect(rpc).toHaveBeenCalledTimes(2)
  expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0])
  expect(rpc.mock.calls[0][0]).toBe('exam_sitting_command')
  await run(change)
  expect(rpc.mock.calls[2][1].operationId).not.toBe(rpc.mock.calls[1][1].operationId)
 })
 it('retains the original payload across an explicit retry after both responses are lost',async()=>{
  const rpc=vi.fn(async(_name:string, request:Envelope)=>({data:{operationId:request.operationId,status:'ok'},error:null}))
  rpc.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
  const run=createCommandRunner(rpc)
  await expect(run(change)).rejects.toThrow('outcome is unknown')
  await expect(run(change)).resolves.toMatchObject({status:'ok'})
  expect(rpc.mock.calls[2]).toEqual(rpc.mock.calls[0])
 })
 it('blocks writes offline before contacting the server',async()=>{
  vi.spyOn(window.navigator,'onLine','get').mockReturnValue(false)
  const rpc=vi.fn()
  await expect(createCommandRunner(rpc)(change)).rejects.toThrow('Reconnect')
  expect(rpc).not.toHaveBeenCalled()
  const demo=createDemoExamApi()
  const sitting=selectSitting(await demo.read('project-linear','linear-algebra'))!
  await expect(demo.change(sitting,{operation:'pause'})).rejects.toThrow('Reconnect')
  expect(selectSitting(await demo.read('project-linear','linear-algebra'))?.status).toBe('active')
 })
 it('keeps distinct mathematical targets while merging repeated prose in the demo',async()=>{
  const api=createDemoExamApi()
  const save=(target:string)=>api.command({resource:'card_ideas',operation:'save',patch:{project_id:'project-linear',target}})
  const gamma=await save('Define $\\Gamma$')
  const euler=await save('Define $\\gamma$')
  expect(euler.id).not.toBe(gamma.id)
  expect((await save('Define $\\Gamma$')).id).toBe(gamma.id)
  const prose=await save('Find a basis')
  expect((await save('FIND  A  BASIS')).id).toBe(prose.id)
 })
 it('derives the demo ledger from current evidence and keeps evidence separate from disposition and mode',async()=>{
  const now=new Date('2026-11-25T12:00:00.000Z')
  const demo=createDemoExamApi(now.getTime())
  const sitting=selectSitting(await demo.read('project-linear','linear-algebra'))!
  const planned=planExam({sitting,...await demo.readEvidence(sitting),now:now.toISOString()})
  expect(planned.rows.find(entry=>entry.row.key==='change-of-basis')?.status).toBe('secure')
  expect(planned.conflicts).toHaveLength(1)
  await demo.change(sitting,{operation:'set_disposition',patch:{rows:[{key:'change-of-basis',disposition:'defer',reason:'No time',reopen:'After the exam'}]}})
  await demo.change(sitting,{operation:'pause'})
  const paused=selectSitting(await demo.read('project-linear','linear-algebra'))!
  const next=planExam({sitting:paused,...await demo.readEvidence(paused),now:now.toISOString()})
  expect(paused.status).toBe('paused')
  expect(next.rows.find(entry=>entry.row.key==='change-of-basis')).toMatchObject({status:'secure',disposition:{disposition:'defer',reason:'No time',reopen:'After the exam'}})
  expect(next.coverage.secure).toBe(planned.coverage.secure)
  expect(next.coverage.deferred).toBe(12)
 })
})
