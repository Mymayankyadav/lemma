import { describe, expect, it } from 'vitest'
import { decideAgenda } from '../../../supabase/functions/_shared/agenda/decision'
import { ownerAgenda } from '../../../supabase/functions/_shared/agenda/host'
import type { Snapshot } from '../../../supabase/functions/_shared/agenda/types'
const asOf='2026-11-20T12:00:00.000Z',now=Date.parse(asOf)/60000
const state:Snapshot={now,end:now+60,availability:[{start:now,end:now+60}],tasks:[
  {id:'a',kind:'personal',remaining:15,due:now+20,importance:3},
  {id:'b',kind:'course',remaining:10,projectId:'p'}]}
const facts={asOf,watermark:'1:2:',capacityKnown:true,state}
describe('service boundary',()=>{
  it('distinguishes unknown, explicit zero, fixed and a protected activity that disappeared',()=>{
    expect(decideAgenda({...facts,capacityKnown:false},'new').served.outcome.kind).toBe('unavailable')
    expect(decideAgenda({...facts,state:{...state,availability:[]}},'new').served.outcome.kind).toBe('no-capacity')
    expect(decideAgenda({...facts,state:{...state,fixed:[{id:'appointment',start:now,end:now+12}]}},'new').served.outcome).toEqual({kind:'fixed',until:now+12})
    expect(decideAgenda({...facts,state:{...state,activeId:'missing',protectedUntil:now+5}},'new').served.outcome).toEqual({kind:'protected',until:now+5})
  })
  it('holds on a cutoff mismatch and untrusted input, returning a legal baseline at a runtime limit',()=>{
    expect(decideAgenda({...facts,asOf:'2026-11-21T12:00:00Z'},'new').served.effective).toBe('hold')
    expect(decideAgenda({...facts,state:{...state,tasks:[...state.tasks,state.tasks[0]]}},'new').served.effective).toBe('hold')
    const expired=decideAgenda(facts,'new',()=>0,0)
    expect(expired.served.outcome).toEqual(expired.served.baseline)
    expect(expired.candidate.reason).toContain('budget')
  })
  it('replays a bounded calendar corpus with zero hard violations and no writes',()=>{
    for(let count=1;count<=22;count++){
      const windows=[{start:now,end:now+40,projectId:'p'},{start:now+50,end:now+110}]
      const snapshot:Snapshot={...state,end:now+110,availability:windows,history:Array(12).fill({actual:10,estimated:10,kept:true}),
        fixed:[{id:'fixed',start:now+11,end:now+17,before:1,after:2}],
        tasks:Array.from({length:count},(_,i)=>({id:'t'+i,kind:i%2?'personal':'course',projectId:i%3?'q':'p',
          remaining:3+i%7,importance:1+i%3,due:now+32+i*2,core:i%7===0}))}
      const original=JSON.stringify(snapshot)
      const result=decideAgenda({...facts,state:snapshot},'legacy',()=>0)
      expect(result.hardViolations).toBe(0)
      expect(result.served.outcome).toEqual(result.served.baseline)
      expect(JSON.stringify(snapshot)).toBe(original)
      for(const outcome of [result.served.outcome,result.candidate.outcome]){
        if(outcome.kind!=='action')continue
        expect(outcome.end).toBeLessThanOrEqual(now+10)
        expect(snapshot.tasks.find(t=>t.id===outcome.taskId)?.projectId).toBe('p')
      }
    }
  })
  it('admits at most the declared daily capacity after subtracting fixed commitments',()=>{
    const iso=(m:number)=>new Date((now+m)*60000).toISOString()
    const calendar={status:'ok',asOf,watermark:'x',horizonEnd:iso(65),fixed:[],
      availability:[{id:'configured',revision:1,startsAt:asOf,endsAt:iso(60),capacityMinutes:5}]}
    const host={asOf,watermark:'x',calendar,rows:{settings:{},projects:[],concepts:[],checkpoints:[],cpConcepts:[],sessions:[]},
      tasks:[{id:'task',title:'Read the statement',priority:'normal' as const,project_id:null,estimate_minutes:10,deadline:iso(60)}]}
    expect(ownerAgenda('owner',host,true).decision.outcome.kind).toBe('hold')
    const allowed=ownerAgenda('owner',{...host,tasks:[{...host.tasks[0],estimate_minutes:5}]},true)
    expect(allowed.label).toBe('Read the statement')
    expect(allowed.decision.outcome).toEqual({kind:'action',taskId:'task/task',start:now,end:now+5})
  })
})
