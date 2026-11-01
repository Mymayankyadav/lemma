import type {PushDevice,SentNotification,NotifyHold,NotifyPreviewRow} from '../types'

/** Predictable in-memory demo reminders. Never subscribes a browser or sends a push. */
export function makeDemoNotifyData(now:number):{
 devices:PushDevice[];recent:SentNotification[];holds:NotifyHold[];preview:NotifyPreviewRow[];
 endpoints:Map<string,string>
}{
 const at=(minutes:number)=>new Date(now+minutes*60_000).toISOString()
 const devices:PushDevice[]=[
  {id:'demo-phone',label:'This phone',platform:'android_web',lastSeenAt:at(-10),lastOkAt:at(-40),disabledAt:null,disabledReason:null,isThisDevice:true},
  {id:'demo-desktop',label:'Study desktop',platform:'desktop',lastSeenAt:at(-60),lastOkAt:at(-120),disabledAt:null,disabledReason:null,isThisDevice:false},
 ]
 const recent:SentNotification[]=[
  {id:5,kind:'tutor',title:'Your tutor left 3 proposals',body:'2 cards · 1 plan change',sentAt:at(-20),action:null,actionAt:null},
  {id:4,kind:'due',title:'12 cards due',body:'About 5 min. Start with 5?',sentAt:at(-180),action:'open',actionAt:at(-170)},
  {id:3,kind:'resume',title:'Pick up Algebra 1',body:'Step 2 of 5',sentAt:at(-1440),action:null,actionAt:null},
  {id:2,kind:'deadline',title:'CP4 is planned for tomorrow',body:'Algebra 1 · about 20 min today',sentAt:at(-2880),action:'open',actionAt:at(-2860)},
  {id:1,kind:'digest',title:'Your week in Lemma',body:'4 days studied · 63 cards',sentAt:at(-10080),action:null,actionAt:null},
 ]
 const holds:NotifyHold[]=[{scope:'due',label:'Cards due',until:at(120)}]
 const preview:NotifyPreviewRow[]=[
  {at:at(30),kind:'tutor',title:'From your tutor',reason:'3 proposals ready',held:false},
  {at:at(120),kind:'due',title:'12 cards due',reason:'Held until later',held:true},
  {at:at(240),kind:'deadline',title:'CP4 is planned for tomorrow',reason:'At study time',held:false},
 ]
 return {devices,recent,holds,preview,endpoints:new Map([['https://demo.lemma.invalid/push/phone','demo-phone'],['https://demo.lemma.invalid/push/desktop','demo-desktop']])}
}
