import {decideNotifications,type ReminderCandidate,type ReminderContext,type RuleResult} from './rules.ts';
import {notifyTitle,notifyBody} from '../_shared/notify-text.ts';

/**
 * NOTIF-4b4: read-only /preview core. The Edge adapter verifies the JWT via
 * Supabase Auth and supplies one owner-filtered read of candidates + history.
 * This module has no write capability or service-role access.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ROWS=20;
export interface PreviewCandidate extends ReminderCandidate {
 title:string;body:string;why:string;
}
export interface PreviewDeps {
 configured:boolean;
 /** Must verify the bearer JWT through supabase.auth.getUser. */
 verifyJwt:(jwt:string)=>Promise<{id:string}|null>;
 /** One read, filtered by the verified owner ID. No mutations allowed. */
 load:(ownerId:string)=>Promise<{ownerId:string;context:ReminderContext;candidates:PreviewCandidate[]}>;
}
export interface PreviewRow {
 time:string;kind:string;title:string;body:string;why:string;
}
export type PreviewResponse=
 | {status:200;body:{send:PreviewRow[];held:PreviewRow[];omitted:number}}
 | {status:401|503;body:{message:string}};
const reasonText:Record<NonNullable<RuleResult['reason']>,string>={
 resolved:'resolved',disabled:'disabled',mode:'reminders off',
 quiet:'quiet hours',cap:'daily cap',spacing:'spacing',active:'studying now',
 frequency:'frequency limit',settling:'waiting for tutor proposals',
};
const error=(status:401|503,message:string):PreviewResponse=>({status,body:{message}});
export async function handlePreviewRequest(
 authorization:string|null,
 deps:PreviewDeps,
):Promise<PreviewResponse>{
 if(!deps.configured)return error(503,'Reminders are not set up yet');
 const token=typeof authorization==='string'
  ?/^Bearer ([^\s]+)$/i.exec(authorization)?.[1]:undefined;
 if(!token)return error(401,'Sign in to preview reminders');
 let owner:{id:string}|null;
 try{owner=await deps.verifyJwt(token)}
 catch{return error(401,'Sign in to preview reminders')}
 if(!owner||typeof owner.id!=='string'||!UUID.test(owner.id))
  return error(401,'Sign in to preview reminders');
 try{
  const {ownerId,context,candidates}=await deps.load(owner.id);
  if(ownerId!==owner.id)throw Error('Owner mismatch');
  const decisions=decideNotifications(candidates,context);
  const formatter=new Intl.DateTimeFormat('en-GB',{
   timeZone:context.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  });
  const send:PreviewRow[]=[],held:PreviewRow[]=[];
  for(const decision of decisions.slice(0,MAX_ROWS)){
   const candidate=decision.candidate as PreviewCandidate;
   const at=decision.nextAt??candidate.dueAt??context.now;
   const row:PreviewRow={
    time:formatter.format(at),kind:candidate.kind,
    title:notifyTitle(candidate.title),body:notifyBody(candidate.body),
    why:decision.status==='send'?notifyBody(candidate.why):reasonText[decision.reason??'resolved'],
   };
   if(decision.status==='send')send.push(row);
   else held.push(row);
  }
  return {status:200,body:{send,held,omitted:Math.max(0,decisions.length-MAX_ROWS)}};
 }catch{
  // Never disclose owner candidate facts or privileged query errors.
  return error(503,'Could not preview reminders');
 }
}
