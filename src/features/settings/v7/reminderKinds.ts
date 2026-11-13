import {PHONE_REMINDER_KINDS} from '../../../platform/reminders';

/** What Settings › Reminders can remind about (the `notify.kinds` keys). */
export const REMINDER_KINDS=[['due','Cards due'],['deadline','Checkpoint deadlines'],['behind','Falling behind'],['resume','Resuming a session'],
 ['tutor','Tutor proposals'],['digest','Weekly digest'],['plan','Plans'],['rhythm','Study rhythm']] as const;
export type ReminderKind=typeof REMINDER_KINDS[number][0];
/** In the app the planner kind is what the phone posts: a planned study block starting (the channel's own name). */
const APP_LABEL:Partial<Record<ReminderKind,string>>={plan:'Study blocks'};

/**
 * AW4 (v7 UX audit r3, Owner decision E16): on the web every kind has a switch. In the Android app only the kinds the
 * phone delivers keep one; the rest (and new card proposals) are listed under "In your Inbox on this phone" without a
 * switch, so nothing looks like a notification the phone cannot send.
 */
export function reminderKindRows(app:boolean):{switches:{key:ReminderKind;label:string}[];proposalsSwitch:boolean;inbox:string[]}{
 if(!app)return {switches:REMINDER_KINDS.map(([key,label])=>({key,label})),proposalsSwitch:true,inbox:[]};
 const phone=new Set<string>(PHONE_REMINDER_KINDS);
 return {
  switches:REMINDER_KINDS.filter(([key])=>phone.has(key)).map(([key,label])=>({key,label:APP_LABEL[key]??label})),
  proposalsSwitch:false,
  inbox:[...REMINDER_KINDS.filter(([key])=>!phone.has(key)).map(([,label])=>label),'New card proposals'],
 };
}
