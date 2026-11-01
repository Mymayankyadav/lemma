import {notifyTitle,notifyBody} from '../_shared/notify-text.ts'

/** NOTIF-3a: one central, pure copy surface for every reminder kind.
 * All dates are preformatted in the owner's time zone as "d MMM" by the caller.
 * Never pass HTML, raw LaTeX or connector/auth data into system notifications.
 */
export interface NoticeCopy {kind:string;tag:string;title:string;body:string}
interface Checkpoint {project:string;code:string;title:string;step?:number;steps?:number}
export type NoticeCopyInput =
 | {kind:'due';count:number;backlog:number;minutes:number}
 | {kind:'deadline';checkpoints:Checkpoint[]}
 | {kind:'behind';project:string;code:string;dueDate:string}
 | {kind:'resume';project:string;step:number;steps:number;question?:string|null;checkpointTitle?:string|null}
 | {kind:'tutor';sources?:Array<'claude'|'chatgpt'>;counts?:{cards?:number;plans?:number;planChanges?:number;cardEdits?:number};projects?:string[];notesAnswered?:number;sessionNo?:string;summary?:string}
 | {kind:'confirm';approved:number;requested:number}
 | {kind:'digest';period:'weekly';daysStudied:number;cardsReviewed:number;checkpoints:number;next?:{code:string;title:string;date:string}}
 | {kind:'digest';period:'daily';clauses:string[]}
 | {kind:'plan';project:string;planEnd:string;targetDate:string}
 | {kind:'rhythm';count:number;minutes:number;code:string;project:string}

const quantity=(count:number,singular:string,plural:string)=>String(Math.max(0,Math.floor(count)))+' '+(count===1?singular:plural)
const capped=(count:number)=>count>999?'999+':String(Math.max(0,Math.floor(count)))
/** User-supplied project names can contain language forbidden in system alerts. */
const toneSafe=(value:string)=>value
 .replace(/\bdon't break\b/gi,'continue')
 .replace(/\b(missed|failed|overdue|streak|only|still|again|hurry)\b/gi,word=>({
  missed:'planned',failed:'unfinished',overdue:'due',streak:'rhythm',
  only:'just',still:'currently',again:'next',hurry:'take your time'
 } as Record<string,string>)[word.toLowerCase()]??word)
 .replace(/!/g,'.')
 .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u2600-\u27BF\u{1F300}-\u{1FAFF}\uFE0E\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu,'')
 .replace(/\s+([:;,.?])/g,'$1')
const asCopy=(kind:string,tag:string,title:string,body:string):NoticeCopy=>({
 kind,tag,title:notifyTitle(toneSafe(title)),body:notifyBody(toneSafe(body))
})
const countClause=(n:number,one:string,many:string)=>n>0?quantity(n,one,many):null

/** Copy is intentionally separate from the scheduling engine (NOTIF-3b).
 * The engine chooses the trigger, recipients, deep links and action tokens.
 */
export function notificationCopy(input:NoticeCopyInput):NoticeCopy {
 switch(input.kind){
  case 'due': {
   const n=capped(input.count),m=Math.max(0,Math.ceil(input.minutes))
   return asCopy('due','due',n+' '+(input.count===1?'card':'cards')+' due',
    input.backlog>input.count
     ?"Today's share is "+n+' (about '+m+' min). Start with 5?'
     :'About '+m+' min. Start with 5?')
  }
  case 'deadline': {
   const checkpoints=input.checkpoints
   if(!checkpoints.length)throw Error('Deadline requires a checkpoint')
   if(checkpoints.length===1){
    const cp=checkpoints[0],step=cp.step??0
    return asCopy('deadline','deadline',cp.code+' is planned for tomorrow',
     cp.project+' · '+cp.title+'. '+(step>0
      ?"You're on step "+step+' of '+(cp.steps??step)+'; about 20 min today keeps it on time.'
      :'Starting today keeps it on time.'))
   }
   const first=checkpoints.slice(0,3).map(cp=>cp.project+': '+cp.code+' '+cp.title)
   if(checkpoints.length>3)first.push('+'+(checkpoints.length-3)+' more')
   return asCopy('deadline','deadline',quantity(checkpoints.length,'checkpoint','checkpoints')+' planned for tomorrow',first.join(' · '))
  }
  case 'behind':
   return asCopy('behind','behind',input.project+': a smaller step today?',
    'The plan had '+input.code+' by '+input.dueDate+
    '. One step of it (about 15 min) is enough for today, or ask your tutor to re-plan.')
  case 'resume':
   return asCopy('resume','resume','Pick up '+input.project,
    'Step '+input.step+' of '+input.steps+' · '+(input.question||input.checkpointTitle||input.project))
  case 'tutor': {
   const counts=input.counts??{}
   const total=(counts.cards??0)+(counts.plans??0)+(counts.planChanges??0)+(counts.cardEdits??0)
   if(!total)return asCopy('tutor','tutor','Session '+(input.sessionNo??'saved')+(input.sessionNo?' saved':''),
    input.summary?Array.from(input.summary).slice(0,120).join(''):'Your tutor saved the session.')
   const source=new Set(input.sources??[])
   const who=source.size===1?(source.has('claude')?'Claude':'ChatGPT'):'Your tutor'
   const clauses=[
    countClause(counts.cards??0,'card','cards'),
    countClause(counts.plans??0,'plan','plans'),
    countClause(counts.planChanges??0,'plan change','plan changes'),
    countClause(counts.cardEdits??0,'card edit','card edits'),
    ...(input.projects??[]),
    (input.notesAnswered??0)>0?'answers '+input.notesAnswered+' of your card notes':null,
   ].filter((value):value is string=>!!value)
   return asCopy('tutor','tutor',who+' left '+quantity(total,'proposal','proposals'),clauses.join(' · '))
  }
  case 'confirm':
   return asCopy('confirm','tutor',
    'Approved '+input.approved+(input.approved===1?' card':' cards')+
     (input.approved<input.requested?' of '+input.requested+' cards':''),
    'Undo is in the app, or here for 48 hours.')
  case 'digest':
   if(input.period==='daily')
    return asCopy('digest','digest','Today in Lemma',input.clauses.slice(0,3).join(' · ')||'Open Lemma to see your next step.')
   else {
    const parts=[
     input.daysStudied>0?quantity(input.daysStudied,'day studied','days studied'):null,
     countClause(input.cardsReviewed,'card','cards'),
     countClause(input.checkpoints,'checkpoint demonstrated','checkpoints demonstrated'),
    ].filter((value):value is string=>!!value)
    if(!parts.length)parts.push('0 days studied')
    const next=input.next?' Next: '+input.next.code+' '+input.next.title+' ('+input.next.date+').':''
    return asCopy('digest','digest','Your week in Lemma',parts.join(' · ')+'.'+next)
   }
  case 'plan':
   return asCopy('plan','plan',input.project+' now ends after your target',
    'The plan ends '+input.planEnd+'; the target is '+input.targetDate+
    '. Ask your tutor to tighten it, or move the target.')
  case 'rhythm':
   return asCopy('rhythm','rhythm','A short session?',
    capped(input.count)+' '+(input.count===1?'card':'cards')+' (about '+Math.max(0,Math.ceil(input.minutes))+
    ' min), or one step of '+input.code+' in '+input.project+'.')
 }
}
