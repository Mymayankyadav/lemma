import {describe,expect,it} from 'vitest';
import {noticePlan,zonedInstant,type NoticeFacts} from '../../../supabase/functions/push/notice';
import {decideNotifications} from '../../../supabase/functions/notify/rules';

// N164.1: the facts of notify_candidates and the owner's preferences become the rules engine's input.
const NOW=Date.UTC(2026,10,14,14,0,0); // 19:30 in Asia/Kolkata
const base=():NoticeFacts=>({tz:'Asia/Kolkata',today:'2026-11-14',studiedToday:false,lastStudyAt:'2026-11-13T12:00:00Z',live:false,
 due:{count:34,backlog:60,minutes:12},tutor:{pending:{},newestAt:null,origins:[],projects:[],answeredNotes:0,endedSession:null},
 history:{sentToday:0,lastSentAt:null,lastByKey:{},dismissStreak:{}}});
const prefs={enabled:true,studyTime:'19:00',quiet:{start:'22:30',end:'07:30'},maxPerDay:3,dueThreshold:10,kinds:{due:true}};

describe('N164.1 zonedInstant',()=>{
 it('is the instant of a local time in a zone',()=>{
  expect(zonedInstant('2026-11-14','19:00','Asia/Kolkata')).toBe(Date.UTC(2026,10,14,13,30));
  expect(zonedInstant('2026-11-14','19:00','UTC')).toBe(Date.UTC(2026,10,14,19,0));
  // New York leaves DST on 1 Nov 2026: 08:00 local is 13:00 UTC afterwards and 12:00 UTC before.
  expect(zonedInstant('2026-11-02','08:00','America/New_York')).toBe(Date.UTC(2026,10,2,13,0));
  expect(zonedInstant('2026-10-30','08:00','America/New_York')).toBe(Date.UTC(2026,9,30,12,0));
 });
});
describe('N164.1 due reminder',()=>{
 it('is a candidate once a day at the study time, worded by the shared copy, linking to Review',()=>{
  const plan=noticePlan(base(),prefs,NOW);
  expect(plan.candidates).toHaveLength(1);
  expect(plan.candidates[0]).toMatchObject({kind:'due',key:'due:2026-11-14',cardsDue:34,threshold:10,studiedToday:false,sentToday:0,enabled:true,dueAt:Date.UTC(2026,10,14,13,30)});
  expect(plan.display.get('due:2026-11-14')).toEqual({kind:'due',title:'34 cards due',body:expect.stringContaining('12 min'),url:'#/review'});
  expect(plan.context).toMatchObject({timeZone:'Asia/Kolkata',quietStart:'22:30',quietEnd:'07:30',mode:'as-happens',dailyCap:3,sendsToday:0,liveSession:false,rhythmEnabled:false});
  expect(decideNotifications(plan.candidates,plan.context).map(r=>r.status)).toEqual(['send']);
 });
 it('waits for the study time, and is quiet at night',()=>{
  const early=noticePlan(base(),prefs,Date.UTC(2026,10,14,10,0,0)); // 15:30 local
  expect(decideNotifications(early.candidates,early.context)[0]).toMatchObject({status:'defer',reason:'frequency',nextAt:Date.UTC(2026,10,14,13,30)});
  const night=noticePlan(base(),{...prefs,studyTime:'23:00'},Date.UTC(2026,10,14,18,0,0)); // 23:30 local
  expect(decideNotifications(night.candidates,night.context)[0]).toMatchObject({status:'defer',reason:'quiet'});
 });
 it('is skipped when few cards are due, when the owner already studied, and when switched off',()=>{
  const few=noticePlan({...base(),due:{count:4,backlog:4,minutes:2}},prefs,NOW);
  expect(decideNotifications(few.candidates,few.context)[0]).toMatchObject({status:'skipped',reason:'resolved'});
  const studied=noticePlan({...base(),studiedToday:true},prefs,NOW);
  expect(decideNotifications(studied.candidates,studied.context)[0]).toMatchObject({status:'skipped',reason:'resolved'});
  const unset=noticePlan(base(),{...prefs,kinds:{}},NOW);
  expect(decideNotifications(unset.candidates,unset.context)[0]).toMatchObject({status:'skipped',reason:'disabled'});
  const off=noticePlan(base(),{...prefs,kinds:{due:false}},NOW);
  expect(decideNotifications(off.candidates,off.context)[0]).toMatchObject({status:'skipped',reason:'disabled'});
  const mode=noticePlan(base(),{...prefs,mode:'off'},NOW);
  expect(decideNotifications(mode.candidates,mode.context)[0]).toMatchObject({status:'skipped',reason:'mode'});
 });
 it('is not sent twice in a day, and honours the daily cap, spacing and a live session',()=>{
  const sent=noticePlan({...base(),history:{sentToday:1,lastSentAt:'2026-11-14T13:40:00Z',lastByKey:{'due:2026-11-14':'2026-11-14T13:40:00Z'},dismissStreak:{}}},prefs,NOW);
  expect(sent.candidates[0]).toMatchObject({sentToday:1,lastSentAt:Date.UTC(2026,10,14,13,40)});
  expect(decideNotifications(sent.candidates,sent.context)[0]).toMatchObject({status:'suppressed',reason:'frequency'});
  const capped=noticePlan({...base(),history:{sentToday:3,lastSentAt:'2026-11-14T08:00:00Z',lastByKey:{},dismissStreak:{}}},prefs,NOW);
  expect(decideNotifications(capped.candidates,capped.context)[0]).toMatchObject({status:'suppressed',reason:'cap'});
  const live=noticePlan({...base(),live:true},prefs,NOW);
  expect(decideNotifications(live.candidates,live.context)[0]).toMatchObject({status:'defer',reason:'active'});
 });
 it('reads preferences defensively',()=>{
  const odd=noticePlan(base(),{enabled:true,kinds:{due:true},mode:'live',studyTime:'25:99',quiet:{start:'x',end:'y'},maxPerDay:99,dueThreshold:'many' as unknown as number},NOW);
  expect(odd.context).toMatchObject({quietStart:'22:30',quietEnd:'07:30',dailyCap:5,mode:'as-happens'});
  expect(odd.candidates[0]).toMatchObject({threshold:10,dueAt:Date.UTC(2026,10,14,13,30)});
  expect(noticePlan({},{},NOW).candidates).toEqual([]);
 });
});
describe('N164.1 tutor reminder',()=>{
 const tutorFacts=(over:object={}):NoticeFacts=>({...base(),due:{count:0,backlog:0,minutes:0},tutor:{pending:{card:3,plan_change:1},newestAt:'2026-11-14T13:00:00Z',origins:['claude'],projects:['Algebra'],answeredNotes:0,endedSession:null,...over}});
 it('announces fresh proposals once they have settled, naming the tutor, linking to the Inbox',()=>{
  const plan=noticePlan(tutorFacts(),prefs,NOW);
  const key='tutor:2026-11-14T13:00:00Z';
  expect(plan.candidates.find(c=>c.kind==='tutor')).toMatchObject({key,newestProposalAt:Date.UTC(2026,10,14,13,0),hasSummary:false,enabled:true});
  expect(plan.display.get(key)).toEqual({kind:'tutor',title:'Claude left 4 proposals',body:expect.stringContaining('3 cards'),url:'#/proposals'});
  const results=decideNotifications(plan.candidates,plan.context);
  expect(results.find(r=>r.candidate.kind==='tutor')).toMatchObject({status:'send'});
  const fresh=noticePlan(tutorFacts({newestAt:new Date(NOW-5*60_000).toISOString()}),prefs,NOW);
  expect(decideNotifications(fresh.candidates,fresh.context).find(r=>r.candidate.kind==='tutor')).toMatchObject({status:'defer',reason:'settling'});
 });
 it('announces a saved session summary on its own',()=>{
  const plan=noticePlan(tutorFacts({pending:{},newestAt:null,endedSession:{number:'S12',summary:'Compactness and the Lebesgue number',endedAt:'2026-11-14T12:00:00Z'}}),prefs,NOW);
  const tutor=plan.candidates.find(c=>c.kind==='tutor')!;
  expect(tutor).toMatchObject({key:'tutor:2026-11-14T12:00:00Z',hasSummary:true,summaryAt:Date.UTC(2026,10,14,12,0)});
  expect(plan.display.get(tutor.key)!.title).toBe('Session S12 saved');
 });
 it('keeps the two-hour spacing after any earlier tutor reminder',()=>{
  const facts=tutorFacts();facts.history={sentToday:1,lastSentAt:new Date(NOW-30*60_000).toISOString(),dismissStreak:{},lastByKey:{'tutor:2026-11-14T09:00:00Z':new Date(NOW-30*60_000).toISOString()}};
  const plan=noticePlan(facts,prefs,NOW);
  expect(plan.candidates.find(c=>c.kind==='tutor')!.lastSentAt).toBe(NOW-30*60_000);
  expect(decideNotifications(plan.candidates,plan.context).find(r=>r.candidate.kind==='tutor')).toMatchObject({status:'suppressed',reason:'frequency'});
 });
});
