import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cardState, cardStateDb, checkpointRow, fail, noteOrds, rows, settingsRow, slugify } from './helpers'

describe('live adapter mappers', () => {
  it('makes only user-owned connector URLs and maps settings', () => {
    const row = {
      desired_retention: .9, new_per_day: 20, reviews_per_day: 200,
      learn_steps:'1m 10m',relearn_steps:'10m',rollover_hour:4,max_interval_days:36500,
      fuzz:true,load_balance:true,learn_ahead_minutes:20,fsrs_weights:null,fsrs_tuned_at:null,
      macros:'',default_style:'socratic',tutor_rules:null,mix_decks:true,preferred_chat:'claude',
      connector_secret:'test-secret',connector_last_seen_at:null,connector_last_client:null,time_zone:'UTC',
    }
    const mapped=settingsRow(row)
    expect(mapped.rolloverHour).toBe(4)
    expect(mapped.connectorUrl).toContain('/functions/v1/mcp/test-secret')
    expect(mapped.desiredRetention).toBe(.9)
  })
  it('round-trips scheduling state to the RPC snake_case JSON', () => {
    const before={state:2 as const,due:'2026-10-30T12:00:00Z',stability:3,difficulty:5,
      lastReview:'2026-10-28T00:00:00Z',step:0,reps:6,lapses:1}
    expect(cardState(cardStateDb(before))).toEqual(before)
  })
  it('detects basic, reverse and unique cloze ordinals',()=>{
    expect(noteOrds('Front','basic')).toEqual([1])
    expect(noteOrds('Front','reverse')).toEqual([1,2])
    expect(noteOrds('{{c2::B}} and {{c1::A}} with {{c2::again}}','cloze')).toEqual([1,2])
    expect(noteOrds('No cloze','cloze')).toEqual([1])
    expect(slugify(' Math   Topics! ')).toBe('math-topics')
  })
  it('maps conflict and invalid Postgres errors to LemmaError',()=>{
    expect(()=>fail({code:'23505',message:'Duplicate row'})).toThrowError(/Duplicate/)
    expect(()=>fail({code:'23514',message:'Invalid field'})).toThrowError(/Invalid/)
  })
  it('keeps prerequisite-locked checkpoints locked',()=>{
    const cp={id:'id',code:'CP2',title:'Second',position:20,current_step:0,steps:['x'],
      status:'not_started',needs_revisit:false,recheck_due:null}
    expect(checkpointRow(cp,[{id:'p',code:'CP1',title:'First',position:10,ui:'now',currentStep:1,stepsTotal:1,recheckDue:null,dueCards:0}]).ui).toBe('locked')
  })
  it('pages every query with an owner filter instead of truncating at 1000',async()=>{
    const called: Array<{field:string;uid:string;from:number;to:number}> = []
    const db={
      from(table: string){
        expect(table).toBe('notes')
        return {
          select(){
            return {eq(field: string,uid:string){
              return {range(from:number,to:number){
                called.push({field,uid,from,to})
                const size=from===0?1000:2
                return Promise.resolve({data:Array.from({length:size},(_,i)=>({id:String(from+i)})),error:null})
              }}
            }}
          },
        }
      },
    } as unknown as SupabaseClient
    const records=await rows(db,'notes','owner-1')
    expect(records).toHaveLength(1002)
    expect(called).toEqual([
      {field:'user_id',uid:'owner-1',from:0,to:999},
      {field:'user_id',uid:'owner-1',from:1000,to:1999},
    ])
  })
})
