/** NOTIF-3b: pure server-side notification rules; no IO, credentials or DB access. */
export type ReminderKind='due'|'deadline'|'behind'|'resume'|'tutor'|'digest'|'plan'|'rhythm'
export type Frequency='as-happens'|'daily'|'weekly'|'off'
export interface ReminderCandidate {
 kind:ReminderKind; key:string; dueAt?:number; condition?:boolean; enabled?:boolean
 /** For digest, daily or weekly. */
 period?:'daily'|'weekly'
 /** Per-kind state from the owner-scoped notifications table. */
 lastSentAt?:number; sentToday?:number; deferrals?:number; dismissals?:number
 cardsDue?:number; threshold?:number; studiedToday?:boolean
 /** A K1 Later action explicitly permits its one two-hour resend. */
 laterRequested?:boolean
 /** K3: first transition to late; repeat once every 7 (or 14) days. */
 behindTransitionAt?:number; projectSentToday?:boolean; targetDate?:number; lateDueOn?:number
 /** K4: the paused session, not all sessions combined. */
 pausedSince?:number; sessionSends?:number
 /** K5: newest proposal; an ended session summary may send without proposals. */
 newestProposalAt?:number; hasSummary?:boolean; summaryAt?:number
 /** K7: a fresh target-date transition. */
 targetTransition?:boolean
}
export interface ReminderContext {
 now:number; timeZone:string; quietStart:string; quietEnd:string
 mode:Frequency; dailyCap:number; sendsToday:number; lastSendAt?:number
 lastActiveAt?:number; liveSession?:boolean; rhythmEnabled?:boolean; behindSentToday?:boolean
}
export type RuleResult={
 candidate:ReminderCandidate; status:'send'|'defer'|'suppressed'|'skipped'
 reason?:'resolved'|'disabled'|'mode'|'quiet'|'cap'|'spacing'|'active'|'frequency'|'settling'
 nextAt?:number
}
const MIN=60_000,HOUR=60*MIN,DAY=24*HOUR
const priority:Record<ReminderKind,number>={
 tutor:0,deadline:1,due:2,resume:3,behind:4,plan:5,rhythm:6,digest:7
}
const parseClock=(value:string):number=>{
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Invalid quiet-hour clock')
 const [h,m]=value.split(':').map(Number);return h*60+m
}
const localMinute=(now:number,timeZone:string):number=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now)
 const hour=Number(parts.find(p=>p.type==='hour')?.value),minute=Number(parts.find(p=>p.type==='minute')?.value)
 return hour*60+minute
}
const inQuiet=(minute:number,start:number,end:number):boolean=>
 start!==end&&(start<end?minute>=start&&minute<end:minute>=start||minute<end)
const hashOffset=(key:string):number=>{
 let hash=2166136261
 for(const char of key){hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0}
 return hash%11
}
/** Scan the owner's actual local clock so DST transitions do not shift quiet-hour end. */
export function quietUntil(context:ReminderContext,key:string):number|null{
 const start=parseClock(context.quietStart),end=parseClock(context.quietEnd)
 if(!inQuiet(localMinute(context.now,context.timeZone),start,end))return null
 // Move by one real minute across DST changes, finding the first non-quiet minute.
 for(let step=1;step<=1500;step++){
  const at=context.now+step*MIN
  if(!inQuiet(localMinute(at,context.timeZone),start,end))return at+hashOffset(key)*MIN
 }
 throw Error('Quiet hours did not end within 25 hours')
}
const result=(candidate:ReminderCandidate,status:RuleResult['status'],reason?:RuleResult['reason'],nextAt?:number):RuleResult=>
 ({candidate,status,...(reason?{reason}:{}),...(nextAt?{nextAt}:{})})
/** A notification tap or action resets the dismissal streak. */
export function dismissalStreak(previous:number,event:'dismiss'|'tap'|'action'):number{
 return event==='dismiss'?Math.max(0,previous)+1:0
}
/** K5 never offers plan approval; cards can be approved only with explicit opt-in. */
export function tutorActions(options:{cards:number;hasPlan:boolean;approveCards:boolean}):string[]{
 if(options.cards>0&&!options.hasPlan&&options.approveCards)
  return ['Approve '+options.cards+' '+(options.cards===1?'card':'cards'),'Review']
 return ['Review','Later']
}
function eligibility(c:ReminderCandidate,ctx:ReminderContext):RuleResult|null{
 const now=ctx.now
 if(c.enabled===false||c.kind==='rhythm'&&!ctx.rhythmEnabled)return result(c,'skipped','disabled')
 if(c.condition===false)return result(c,'skipped','resolved')
 if(ctx.mode==='off'||ctx.mode==='weekly'&&!(c.kind==='digest'&&c.period==='weekly')||
    ctx.mode==='daily'&&!(c.kind==='tutor'||c.kind==='digest'&&c.period==='daily')||
    ctx.mode==='as-happens'&&c.kind==='digest'&&c.period==='daily')
  return result(c,'skipped','mode')
 if(c.dueAt!==undefined&&c.dueAt>now)return result(c,'defer','frequency',c.dueAt)
 if(c.kind==='due'){
  const threshold=(c.threshold??10)*(c.dismissals&&c.dismissals>=3?2:1)
  if((c.cardsDue??0)<threshold||c.studiedToday)return result(c,'skipped','resolved')
  if((c.sentToday??0)>=2||((c.sentToday??0)===1&&
     (!c.laterRequested||!c.lastSentAt||now-c.lastSentAt<2*HOUR)))
   return result(c,'suppressed','frequency')
 }
 if(c.kind==='deadline'&&(c.sentToday??0)>=1)return result(c,'suppressed','frequency')
 if(c.kind==='behind'){
  const interval=(c.dismissals??0)>=3?14*DAY:7*DAY
  const newTransition=c.behindTransitionAt!==undefined&&c.lastSentAt!==undefined&&c.behindTransitionAt>c.lastSentAt
  if(c.projectSentToday||ctx.behindSentToday||
     c.lastSentAt!==undefined&&!newTransition&&now-c.lastSentAt<interval)
   return result(c,'suppressed','frequency')
  if(c.behindTransitionAt!==undefined&&c.behindTransitionAt>now)return result(c,'defer','frequency',c.behindTransitionAt)
 }
 if(c.kind==='resume'){
  if((c.dismissals??0)>=3)return result(c,'skipped','disabled')
  if(c.studiedToday||(c.sessionSends??0)>=2||c.pausedSince===undefined)return result(c,'skipped','resolved')
  if(now-c.pausedSince<18*HOUR)return result(c,'defer','frequency',c.pausedSince+18*HOUR)
 }
 if(c.kind==='tutor'){
  if(ctx.liveSession)return result(c,'defer','active',now+30*MIN)
  if(!c.hasSummary&&c.newestProposalAt===undefined)return result(c,'skipped','resolved')
  if(c.newestProposalAt!==undefined&&now-c.newestProposalAt<15*MIN)
   return result(c,'defer','settling',c.newestProposalAt+15*MIN)
  // A proposal already notified must not be sent again merely because two
  // hours elapsed. A genuinely new end-session summary can notify separately.
  const freshProposal=c.newestProposalAt!==undefined&&
   (c.lastSentAt===undefined||c.newestProposalAt>c.lastSentAt)
  const freshSummary=c.summaryAt!==undefined&&
   (c.lastSentAt===undefined||c.summaryAt>c.lastSentAt)
  if(c.newestProposalAt!==undefined&&!freshProposal&&!freshSummary)
   return result(c,'skipped','resolved')
  if(c.hasSummary&&c.summaryAt!==undefined&&!freshSummary&&!freshProposal)
   return result(c,'skipped','resolved')
  // Legacy summary-only candidates without an event timestamp must not
  // re-notify on every tick. New candidate RPCs should provide summaryAt.
  if(c.hasSummary&&c.summaryAt===undefined&&c.newestProposalAt===undefined&&c.lastSentAt!==undefined)
   return result(c,'skipped','resolved')
 }
 if(c.kind==='plan'&&!c.targetTransition)return result(c,'skipped','resolved')
 if(c.kind==='rhythm'&&(c.dismissals??0)>=3)return result(c,'skipped','disabled')
 if(c.kind==='rhythm'&&c.lastSentAt!==undefined&&now-c.lastSentAt<3*DAY)
  return result(c,'suppressed','frequency')
 if(c.kind==='digest'&&c.lastSentAt!==undefined&&now-c.lastSentAt<(c.period==='weekly'?7*DAY:DAY))
  return result(c,'suppressed','frequency')
 const quiet=quietUntil(ctx,c.key)
 if(quiet!==null)return result(c,'defer','quiet',quiet)
 if(['due','deadline','behind','resume','plan','rhythm'].includes(c.kind)&&
    (ctx.liveSession||ctx.lastActiveAt!==undefined&&now-ctx.lastActiveAt<10*MIN)){
  if((c.deferrals??0)>=2)return result(c,'suppressed','active')
  return result(c,'defer','active',now+30*MIN)
 }
 return null
}
/** Return a decision for every candidate; only the highest-priority eligible
 * reminder sends in a tick because sends must be separated by at least 60 min.
 */
export function decideNotifications(candidates:ReminderCandidate[],context:ReminderContext):RuleResult[]{
 const ordered=[...candidates].sort((a,b)=>priority[a.kind]-priority[b.kind]||
  (a.kind==='behind'&&b.kind==='behind'
   ?(a.targetDate??a.lateDueOn??Number.MAX_SAFE_INTEGER)-(b.targetDate??b.lateDueOn??Number.MAX_SAFE_INTEGER):0)||
  (a.dueAt??0)-(b.dueAt??0)||a.key.localeCompare(b.key))
 let sent=false
 return ordered.map(candidate=>{
  const preliminary=eligibility(candidate,context)
  if(preliminary)return preliminary
  if(context.sendsToday>=Math.max(1,Math.min(5,context.dailyCap)))
   return result(candidate,'suppressed','cap')
  if(sent||context.lastSendAt!==undefined&&context.now-context.lastSendAt<60*MIN)
   return result(candidate,'suppressed','spacing')
  sent=true
  return result(candidate,'send')
 })
}
