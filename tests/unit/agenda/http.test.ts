import {it,expect,vi} from 'vitest'
import {browserAgenda} from '../../../supabase/functions/mcp/agenda-http'
import {readAgenda,agendaQueue} from '../../../supabase/functions/mcp/agenda'
import type {Context} from '../../../supabase/functions/mcp/db'
it('binds the read exclusively to the verified browser user and rejects caller-proposed state',async()=>{
  const auth={verify:vi.fn(async token=>token==='session.token'?'verified-owner':null),read:vi.fn(async()=>({released:false,agenda:null}))}
  const url='https://example.invalid/functions/v1/mcp/agenda',headers={Authorization:'Bearer session.token'}
  for(const [req,status] of [[new Request(url),405],[new Request(url,{method:'POST'}),401],
    [new Request(url+'?owner=other',{method:'POST',headers}),400],[new Request(url,{method:'POST',headers,body:'{"asOf":"future"}'}),400]] as const)
    expect((await browserAgenda(req,auth,{})).status).toBe(status)
  expect(auth.read).not.toHaveBeenCalled()
  const successful=await browserAgenda(new Request(url,{method:'POST',headers}),auth,{})
  expect(await successful.json()).toEqual({released:false,agenda:null})
  expect(auth.read).toHaveBeenCalledWith('verified-owner')
  expect(successful.headers.get('cache-control')).toContain('no-store')
})
it('keeps the original queue on missing release and holds on missing evidence after release',async()=>{
  const unavailable=vi.fn(async()=>({data:null,error:{message:'missing'}}))
  expect((await readAgenda({db:{rpc:unavailable},userId:'own'} as unknown as Context,undefined,false)).agenda).toBeNull()
  expect(unavailable).toHaveBeenCalledTimes(1)
  const db={rpc:vi.fn(async (name:string)=>name==='lemma_plan_released'?{data:true,error:null}:{data:null,error:{message:'down'}})}
  const read=await readAgenda({db,userId:'own'} as unknown as Context,'legacy',false)
  expect(read.agenda?.decision.requested).toBe('legacy')
  expect(read.agenda?.decision.outcome.kind).toBe('unavailable')
  expect(agendaQueue(read.agenda!)).toMatch(/^QUEUE\nHold/)
  expect(db.rpc).toHaveBeenNthCalledWith(2,'lemma_agenda_snapshot',{p_owner:'own'})
})
it('uses the durable owner preference on a failed snapshot, and reports an unread preference as unknown',async()=>{
  const maybeSingle=vi.fn().mockResolvedValue({data:{scheduling_algorithm:'legacy'},error:null})
  const eq=vi.fn(()=>({maybeSingle})),select=vi.fn(()=>({eq})),from=vi.fn(()=>({select}))
  const db={from,rpc:vi.fn(async(name:string)=>name==='lemma_plan_released'?{data:true,error:null}:{data:null,error:{message:'down'}})}
  const read=await readAgenda({db,userId:'own'} as unknown as Context,undefined,false)
  expect(eq).toHaveBeenCalledWith('user_id','own');expect(select).toHaveBeenCalledWith('scheduling_algorithm')
  expect(read.agenda?.decision.requested).toBe('legacy');expect(agendaQueue(read.agenda!)).toContain('Planning · Legacy')
  maybeSingle.mockResolvedValueOnce({data:null,error:{message:'down'}} as never)
  const unknown=await readAgenda({db,userId:'own'} as unknown as Context,undefined,false)
  expect(unknown.agenda?.decision.requested).toBe('unknown');expect(agendaQueue(unknown.agenda!)).toContain('Planning preference unavailable')
  expect(agendaQueue(unknown.agenda!)).not.toContain('Planning · New')
})
it('makes a native fallback and its cause visible in MCP action queues',()=>{
  const action={kind:'action' as const,taskId:'task',start:0,end:5}
  const text=agendaQueue({label:'Solve the next question',decision:{asOf:'2026-11-20T00:00:00Z',snapshotVersion:'s',
    requested:'new',effective:'legacy',policyVersion:'v1',reason:'Computation budget reached',outcome:action,baseline:action}})
  expect(text).toContain('QUEUE\n1. Solve the next question · 5 min')
  expect(text).toContain('Planning · New · native fallback · Computation budget reached')
})
