import {describe,it,expect} from 'vitest'
import {decideNotifications,quietUntil,dismissalStreak,tutorActions,type ReminderCandidate,type ReminderContext} from '../../../supabase/functions/notify/rules'

const now=Date.UTC(2026,10,1,12,0)
const base:ReminderContext={
 now,timeZone:'Asia/Kolkata',quietStart:'22:30',quietEnd:'07:30',
 mode:'as-happens',dailyCap:3,sendsToday:0,
}
const due:ReminderCandidate={kind:'due',key:'due:1',cardsDue:23,threshold:10}
const choose=(candidates:ReminderCandidate[],ctx:Partial<ReminderContext>={})=>
 decideNotifications(candidates,{...base,...ctx})

describe('NOTIF-3b deterministic scheduling',()=>{
 it('prioritizes tutor, tomorrow, due, resume, behind, plan and rhythm',()=>{
  const kinds=['rhythm','plan','behind','resume','due','deadline','tutor'] as const
  const candidates=kinds.map(kind=>({kind,key:kind,condition:true,cardsDue:23,pausedSince:now-20*3_600_000,
   targetTransition:true,hasSummary:true}))
  const result=choose(candidates,{rhythmEnabled:true})
  expect(result.map(r=>r.candidate.kind)).toEqual(['tutor','deadline','due','resume','behind','plan','rhythm'])
  expect(result.filter(r=>r.status==='send').map(r=>r.candidate.kind)).toEqual(['tutor'])
  expect(result.slice(1).every(r=>r.reason==='spacing')).toBe(true)
 })
 it('enforces the daily cap and one-hour spacing',()=>{
  expect(choose([due],{sendsToday:3})[0]).toMatchObject({status:'suppressed',reason:'cap'})
  expect(choose([due],{sendsToday:2})[0].status).toBe('send')
  expect(choose([due],{lastSendAt:now-59*60_000})[0]).toMatchObject({status:'suppressed',reason:'spacing'})
  expect(choose([due],{lastSendAt:now-60*60_000})[0].status).toBe('send')
 })
 it('supports all four frequency modes and weekly/daily digest routing',()=>{
  const daily:ReminderCandidate={kind:'digest',key:'digest:daily',period:'daily'}
  const weekly:ReminderCandidate={kind:'digest',key:'digest:weekly',period:'weekly'}
  expect(choose([due],{mode:'off'})[0].reason).toBe('mode')
  expect(choose([due,weekly],{mode:'weekly'}).find(r=>r.status==='send')?.candidate.kind).toBe('digest')
  expect(choose([due,daily],{mode:'daily'}).find(r=>r.status==='send')?.candidate.key).toBe('digest:daily')
  expect(choose([daily],{mode:'as-happens'})[0].reason).toBe('mode')
 })
 it('handles quiet hours crossing midnight, equal endpoints and deterministic offset',()=>{
  const late={...base,now:Date.UTC(2026,10,1,18,0)} // 23:30 in Kolkata
  const until=quietUntil(late,'due:1')
  expect(until).not.toBeNull()
  expect(until!).toBeGreaterThan(late.now+7*3_600_000)
  expect(until!).toBeLessThanOrEqual(late.now+8*3_600_000+10*60_000)
  expect(quietUntil(late,'due:1')).toBe(until)
  expect(quietUntil({...late,quietStart:'07:30',quietEnd:'07:30'},'due:1')).toBeNull()
  expect(choose([due],{now:late.now})[0]).toMatchObject({status:'defer',reason:'quiet'})
  const london={...base,now:Date.UTC(2026,10,1,23,0),timeZone:'Europe/London'}
  expect(quietUntil(london,'due:1')).not.toBeNull()
 })
 it('defers active use twice then suppresses without interrupting',()=>{
  const active={lastActiveAt:now-5*60_000}
  expect(choose([{...due,deferrals:0}],active)[0]).toMatchObject({status:'defer',reason:'active',nextAt:now+30*60_000})
  expect(choose([{...due,deferrals:1}],active)[0].status).toBe('defer')
  expect(choose([{...due,deferrals:2}],active)[0]).toMatchObject({status:'suppressed',reason:'active'})
 })
 it('applies K1 threshold backoff and the once-per-day Later resend',()=>{
  expect(choose([{...due,cardsDue:15,dismissals:3}])[0].reason).toBe('resolved')
  expect(choose([{...due,cardsDue:20,dismissals:3}])[0].status).toBe('send')
  expect(choose([{...due,sentToday:1,lastSentAt:now-60*60_000,laterRequested:true}])[0].reason).toBe('frequency')
  expect(choose([{...due,sentToday:1,lastSentAt:now-2*3_600_000}])[0]).toMatchObject({status:'suppressed',reason:'frequency'})
  expect(choose([{...due,sentToday:1,lastSentAt:now-2*3_600_000,laterRequested:true}])[0].status).toBe('send')
  expect(choose([{...due,sentToday:2,laterRequested:true}])[0].reason).toBe('frequency')
 })
 it('applies K3 first transition, 7-day repeat and 14-day dismissal backoff',()=>{
  const behind:ReminderCandidate={kind:'behind',key:'behind:p1',behindTransitionAt:now-4*DAY}
  expect(choose([behind])[0].status).toBe('send')
  expect(choose([{...behind,lastSentAt:now-6*DAY}])[0].reason).toBe('frequency')
  expect(choose([{...behind,lastSentAt:now-7*DAY}])[0].status).toBe('send')
  expect(choose([{...behind,lastSentAt:now-10*DAY,dismissals:3}])[0].reason).toBe('frequency')
  expect(choose([{...behind,projectSentToday:true}])[0].reason).toBe('frequency')
 })
 it('treats a fresh K3 late transition as new even after a recent prior send',()=>{
  const prior=now-2*DAY,transition=now-DAY
  const behind:ReminderCandidate={kind:'behind',key:'behind:renewed',lastSentAt:prior,behindTransitionAt:transition}
  expect(choose([behind])[0].status).toBe('send')
  expect(choose([{...behind,behindTransitionAt:prior-DAY}])[0]).toMatchObject({status:'suppressed',reason:'frequency'})
 })
 it('chooses the earliest target among late projects and allows only one K3 per study day',()=>{
  const first:ReminderCandidate={kind:'behind',key:'behind:later',targetDate:now+10*DAY}
  const second:ReminderCandidate={kind:'behind',key:'behind:earlier',targetDate:now+3*DAY}
  const result=choose([first,second])
  expect(result[0].candidate.key).toBe('behind:earlier')
  expect(result[0].status).toBe('send')
  expect(choose([second],{behindSentToday:true})[0]).toMatchObject({status:'suppressed',reason:'frequency'})
 })
 it('limits K4 to two per paused session and waits 18 hours',()=>{
  const resume:ReminderCandidate={kind:'resume',key:'resume:s1',pausedSince:now-17*3_600_000}
  expect(choose([resume])[0]).toMatchObject({status:'defer',reason:'frequency'})
  expect(choose([{...resume,pausedSince:now-18*3_600_000}])[0].status).toBe('send')
  expect(choose([{...resume,pausedSince:now-20*3_600_000,sessionSends:2}])[0].reason).toBe('resolved')
  expect(choose([{...resume,pausedSince:now-20*3_600_000,dismissals:3}])[0].reason).toBe('disabled')
 })
 it('waits K5 15 minutes and no live session, and never approves plan proposals',()=>{
  const tutor:ReminderCandidate={kind:'tutor',key:'tutor:p1',newestProposalAt:now-14*60_000}
  expect(choose([tutor])[0]).toMatchObject({status:'defer',reason:'settling'})
  expect(choose([{...tutor,newestProposalAt:now-15*60_000}])[0].status).toBe('send')
  expect(choose([{...tutor,hasSummary:true}],{liveSession:true})[0].reason).toBe('active')
  // A saved summary must not bypass the 15-minute settle time when proposals exist.
  expect(choose([{...tutor,hasSummary:true}])[0]).toMatchObject({status:'defer',reason:'settling'})
  expect(choose([{...tutor,hasSummary:true,newestProposalAt:now-15*60_000}])[0].status).toBe('send')
  // Ended sessions without proposals can notify on the next tick.
  expect(choose([{kind:'tutor',key:'tutor:summary',hasSummary:true}])[0].status).toBe('send')
  expect(tutorActions({cards:1,hasPlan:false,approveCards:true})).toEqual(['Approve 1 card','Review'])
  expect(tutorActions({cards:5,hasPlan:false,approveCards:true})).toEqual(['Approve 5 cards','Review'])
  expect(tutorActions({cards:5,hasPlan:true,approveCards:true})).toEqual(['Review','Later'])
  expect(tutorActions({cards:5,hasPlan:false,approveCards:false})).toEqual(['Review','Later'])
 })
 it('does not resend old K5 proposals and allows a genuinely new session summary',()=>{
  const previous=now-3*HOUR
  const oldProposal:ReminderCandidate={kind:'tutor',key:'tutor:old',newestProposalAt:previous-HOUR,lastSentAt:previous}
  expect(choose([oldProposal])[0]).toMatchObject({status:'skipped',reason:'resolved'})
  expect(choose([{...oldProposal,newestProposalAt:now-15*60_000}])[0].status).toBe('send')
  // The shared 60-minute spacing is the only extra throttle on new K5 work.
  expect(choose([{...oldProposal,lastSentAt:now-90*60_000,newestProposalAt:now-15*60_000}])[0].status).toBe('send')
  const recent=now-30*60_000
  expect(choose([{kind:'tutor',key:'tutor:summary',hasSummary:true,summaryAt:now-5*60_000,lastSentAt:recent}])[0].status).toBe('send')
 })
 it('resets dismissal backoff on a tap or action',()=>{
  expect(dismissalStreak(2,'dismiss')).toBe(3)
  expect(dismissalStreak(3,'tap')).toBe(0)
  expect(dismissalStreak(3,'action')).toBe(0)
 })
 it('never sends resolved or disabled candidates',()=>{
  expect(choose([{...due,condition:false}])[0]).toMatchObject({status:'skipped',reason:'resolved'})
  expect(choose([{...due,enabled:false}])[0]).toMatchObject({status:'skipped',reason:'disabled'})
  expect(choose([{kind:'rhythm',key:'r1'}])[0]).toMatchObject({status:'skipped',reason:'disabled'})
 })
})
const DAY=24*60*60*1000
const HOUR=60*60*1000
