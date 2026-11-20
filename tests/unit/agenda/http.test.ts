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
