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
  expect(plan.display.get('due:2026-11-14')).toEqual({kind:'due',title:'34 cards due',body:expect.stringContaining('12 min'),url:'#/review',
   actions:[{action:'open',title:'Start review',url:'#/review'},{action:'later',title:'Later'}]});
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
  expect(odd.context).toMatchObject({quietStart:'22:00',quietEnd:'07:00',dailyCap:5,mode:'as-happens'});
  expect(odd.candidates[0]).toMatchObject({threshold:10,dueAt:Date.UTC(2026,10,14,3,30)}); // the default study time, 09:00
  expect(noticePlan({},{},NOW).candidates).toEqual([]);
  // With nothing set, the defaults are the ones Settings shows.
  expect(noticePlan(base(),{},NOW).context).toMatchObject({quietStart:'22:00',quietEnd:'07:00',dailyCap:5,mode:'as-happens'});
 });
});
describe('N164.1 tutor reminder',()=>{
 const tutorFacts=(over:object={}):NoticeFacts=>({...base(),due:{count:0,backlog:0,minutes:0},tutor:{pending:{card:3,plan_change:1},newestAt:'2026-11-14T13:00:00Z',origins:['claude'],projects:['Algebra'],answeredNotes:0,endedSession:null,...over}});
 it('announces fresh proposals once they have settled, naming the tutor, linking to the Inbox',()=>{
  const plan=noticePlan(tutorFacts(),prefs,NOW);
  const key='tutor:2026-11-14T13:00:00Z';
  expect(plan.candidates.find(c=>c.kind==='tutor')).toMatchObject({key,newestProposalAt:Date.UTC(2026,10,14,13,0),hasSummary:false,enabled:true});
  expect(plan.display.get(key)).toEqual({kind:'tutor',title:'Claude left 4 proposals',body:expect.stringContaining('3 cards'),url:'#/proposals',
   actions:[{action:'open',title:'Review',url:'#/proposals'},{action:'later',title:'Later'}]});
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

// ---- the other six kinds ------------------------------------------------------------------------------------------
const verdict=(plan:ReturnType<typeof noticePlan>,kind:string)=>decideNotifications(plan.candidates,plan.context).find(r=>r.candidate.kind===kind);
const allOn={due:true,deadline:true,behind:true,resume:true,tutor:true,digest:true,plan:true,rhythm:true};
const many=(over:NoticeFacts):NoticeFacts=>({...base(),due:{count:0,backlog:0,minutes:0},...over});

describe('N164 deadline reminder',()=>{
 const tomorrow=[{slug:'algebra',project:'Algebra',code:'CP3',title:'Cyclic groups',step:2,steps:5}];
 it('names tomorrow\'s checkpoint, once a day at the study time, linking to its Path',()=>{
  const plan=noticePlan(many({tomorrow}),{...prefs,kinds:allOn},NOW);
  expect(plan.candidates.find(c=>c.kind==='deadline')).toMatchObject({key:'deadline:2026-11-14',enabled:true,sentToday:0,dueAt:Date.UTC(2026,10,14,13,30)});
  expect(plan.display.get('deadline:2026-11-14')).toMatchObject({kind:'deadline',title:'CP3 is planned for tomorrow',url:'#/p/algebra',actions:[{action:'open',url:'#/p/algebra'},{action:'not_today'}]});
  expect(verdict(plan,'deadline')).toMatchObject({status:'send'});
  const sent=noticePlan({...many({tomorrow}),history:{sentToday:1,lastSentAt:'2026-11-14T03:50:00Z',lastByKey:{'deadline:2026-11-14':'2026-11-14T03:50:00Z'},dismissStreak:{}}},{...prefs,kinds:allOn},NOW);
  expect(verdict(sent,'deadline')).toMatchObject({status:'suppressed',reason:'frequency'});
  expect(noticePlan(many({tomorrow:[...tomorrow,{...tomorrow[0],slug:'topology',project:'Topology',code:'CP1'}]}),prefs,NOW).display.get('deadline:2026-11-14')!.url).toBe('#/calendar');
 });
});
describe('N164 behind reminder',()=>{
 const late=[{slug:'algebra',project:'Algebra',code:'CP2',title:'Subgroups',dueOn:'2026-11-09',daysLate:5,targetDate:'2026-12-01'}];
 it('is one per late checkpoint, from three days after its date, naming that date',()=>{
  const plan=noticePlan(many({late}),{...prefs,kinds:allOn},NOW);
  expect(plan.candidates.find(c=>c.kind==='behind')).toMatchObject({key:'behind:algebra:CP2',behindTransitionAt:Date.UTC(2026,10,12,13,30),projectSentToday:false});
  expect(plan.display.get('behind:algebra:CP2')).toMatchObject({kind:'behind',url:'#/p/algebra',body:expect.stringContaining('9 Nov')});
  expect(verdict(plan,'behind')).toMatchObject({status:'send'});
 });
 it('waits a week after one, and sends one project at most once a day',()=>{
  const recent={sentToday:1,lastSentAt:'2026-11-13T05:00:00Z',lastByKey:{'behind:algebra:CP2':'2026-11-13T05:00:00Z'},dismissStreak:{}};
  const again=noticePlan({...many({late}),history:recent},{...prefs,kinds:allOn},NOW);
  expect(verdict(again,'behind')).toMatchObject({status:'suppressed',reason:'frequency'});
  const sameDay=noticePlan({...many({late:[...late,{...late[0],code:'CP3'}]}),history:{sentToday:1,lastSentAt:'2026-11-14T03:40:00Z',lastByKey:{'behind:algebra:CP2':'2026-11-14T03:40:00Z'},dismissStreak:{}}},{...prefs,kinds:allOn},NOW);
  expect(sameDay.candidates.find(c=>c.key==='behind:algebra:CP3')).toMatchObject({projectSentToday:true});
  expect(sameDay.context.behindSentToday).toBe(true);
 });
});
describe('N164 resume reminder',()=>{
 const paused={slug:'algebra',project:'Algebra',number:4,step:2,steps:5,question:'Why is H cyclic?',checkpointTitle:'Subgroups',lastActivityAt:'2026-11-13T05:00:00Z'};
 it('comes after 18 paused hours, links to the Path, and is not repeated for the same session',()=>{
  const plan=noticePlan(many({paused}),{...prefs,kinds:allOn},NOW);
  expect(plan.candidates.find(c=>c.kind==='resume')).toMatchObject({key:'resume:algebra:4',pausedSince:Date.UTC(2026,10,13,5,0),studiedToday:false});
  expect(plan.display.get('resume:algebra:4')).toMatchObject({kind:'resume',url:'#/p/algebra',actions:[{action:'open',title:'Resume'},{action:'later'}]});
  expect(verdict(plan,'resume')).toMatchObject({status:'send'});
  const soon=noticePlan(many({paused:{...paused,lastActivityAt:new Date(NOW-3*3600_000).toISOString()}}),{...prefs,kinds:allOn},NOW);
  expect(verdict(soon,'resume')).toMatchObject({status:'defer',reason:'frequency'});
  const done=noticePlan({...many({paused}),history:{sentToday:1,lastSentAt:'2026-11-13T04:00:00Z',lastByKey:{'resume:algebra:4':'2026-11-13T04:00:00Z'},dismissStreak:{}}},{...prefs,kinds:allOn},NOW);
  expect(done.candidates.some(c=>c.kind==='resume')).toBe(false);
 });
});
describe('N164 tutor buttons',()=>{
 const ids=Array.from({length:30},(_,i)=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i).padStart(12,'0'));
 it('offers Approve only with the owner\'s opt-in, for cards without a plan, at most 20 at a time',()=>{
  const facts=many({tutor:{pending:{card:30},newestAt:'2026-11-14T13:00:00Z',cardIds:ids,origins:['chatgpt'],projects:[],answeredNotes:0,endedSession:null}});
  const on=noticePlan(facts,{...prefs,approveCards:true},NOW).display.get('tutor:2026-11-14T13:00:00Z')!;
  expect(on.actions).toEqual([{action:'approve_cards',title:'Approve 20 cards',x:{ids:ids.slice(0,20)}},{action:'open',title:'Review',url:'#/proposals'}]);
  expect(noticePlan(facts,prefs,NOW).display.get('tutor:2026-11-14T13:00:00Z')!.actions.map(a=>a.action)).toEqual(['open','later']);
  const withPlan=many({tutor:{pending:{card:3,plan:1},newestAt:'2026-11-14T13:00:00Z',cardIds:ids,origins:[],projects:[],answeredNotes:0,endedSession:null}});
  expect(noticePlan(withPlan,{...prefs,approveCards:true},NOW).display.get('tutor:2026-11-14T13:00:00Z')!.actions.map(a=>a.action)).toEqual(['open','later']);
 });
});
describe('N164 digest reminder',()=>{
 const week={daysStudied:5,reviews:120,demonstrated:['CP1','CP2'],next:{code:'CP3',title:'Cyclic groups',dueOn:'2026-11-20'}};
 it('is weekly on the owner\'s day and time, once per week, worded by the shared copy',()=>{
  // 14 Nov 2026 is a Saturday; the digest day is Sunday (0) by default, so the week's digest was due on the 8th.
  const plan=noticePlan(many({week}),{...prefs,kinds:allOn},NOW);
  const digest=plan.candidates.find(c=>c.kind==='digest')!;
  expect(digest).toMatchObject({key:'digest:weekly:2026-11-08',period:'weekly',periodKey:'2026-11-08',dueAt:Date.UTC(2026,10,8,3,30)});
  expect(plan.display.get(digest.key)).toMatchObject({kind:'digest',url:'#/insights',body:expect.stringContaining('5 days studied')});
  expect(verdict(plan,'digest')).toMatchObject({status:'send'});
  const sunday=noticePlan(many({week}),{...prefs,kinds:allOn,digest:{weekday:6,time:'18:00'}},NOW);
  expect(sunday.candidates.find(c=>c.kind==='digest')).toMatchObject({key:'digest:weekly:2026-11-14',dueAt:Date.UTC(2026,10,14,12,30)});
  const again=noticePlan({...many({week}),history:{sentToday:0,lastSentAt:'2026-11-08T04:00:00Z',lastByKey:{'digest:weekly:2026-11-08':'2026-11-08T04:00:00Z'},dismissStreak:{}}},{...prefs,kinds:allOn},NOW);
  expect(again.candidates.find(c=>c.kind==='digest')).toMatchObject({lastSentPeriodKey:'2026-11-08'});
  expect(verdict(again,'digest')).toMatchObject({status:'suppressed',reason:'frequency'});
 });
 it('is a daily summary in daily mode, and weekly digests are skipped there',()=>{
  const plan=noticePlan(many({week,due:{count:12,backlog:12,minutes:5},tomorrow:[{slug:'a',project:'A',code:'CP1',title:'T'}]}),{...prefs,kinds:allOn,mode:'daily'},NOW);
  expect(plan.candidates.filter(c=>c.kind==='digest').map(c=>c.key)).toEqual(['digest:daily:2026-11-14']);
  expect(plan.display.get('digest:daily:2026-11-14')!.body).toContain('12 cards due');
  expect(verdict(plan,'digest')).toMatchObject({status:'send'});
 });
});
describe('N164 plan reminder',()=>{
 it('is one per plan end and target, and never repeats once sent',()=>{
  const past=[{slug:'algebra',project:'Algebra',lastDueOn:'2026-12-20',targetDate:'2026-12-01'}];
  const plan=noticePlan(many({pastTarget:past}),{...prefs,kinds:allOn},NOW);
  const key='plan:algebra:2026-12-01:2026-12-20';
  expect(plan.candidates.find(c=>c.kind==='plan')).toMatchObject({key,targetTransition:true,targetTransitionAt:NOW});
  expect(plan.display.get(key)).toMatchObject({kind:'plan',url:'#/p/algebra',body:expect.stringContaining('20 Dec')});
  expect(verdict(plan,'plan')).toMatchObject({status:'send'});
  const sent=noticePlan({...many({pastTarget:past}),history:{sentToday:0,lastSentAt:'2026-11-10T04:00:00Z',lastByKey:{[key]:'2026-11-10T04:00:00Z'},dismissStreak:{}}},{...prefs,kinds:allOn},NOW);
  expect(sent.candidates.some(c=>c.kind==='plan')).toBe(false);
 });
});
describe('N164 rhythm reminder',()=>{
 it('needs the owner\'s switch, two quiet days, cards due and a checkpoint to name',()=>{
  const facts=many({quietDays:3,due:{count:12,backlog:12,minutes:6},tomorrow:[{slug:'algebra',project:'Algebra',code:'CP3',title:'T'}]});
  const on=noticePlan(facts,{...prefs,kinds:allOn},NOW);
  expect(on.candidates.find(c=>c.kind==='rhythm')).toMatchObject({key:'rhythm:2026-11-14',enabled:true});
  expect(on.display.get('rhythm:2026-11-14')).toMatchObject({kind:'rhythm',url:'#/review',actions:[{action:'open',title:'Start review'},{action:'not_today'}]});
  expect(noticePlan(facts,{...prefs,kinds:{...allOn,rhythm:false}},NOW).candidates.some(c=>c.kind==='rhythm')).toBe(false);
  expect(noticePlan({...facts,quietDays:1},{...prefs,kinds:allOn},NOW).candidates.some(c=>c.kind==='rhythm')).toBe(false);
  expect(noticePlan({...facts,due:{count:0,backlog:0,minutes:0}},{...prefs,kinds:allOn},NOW).candidates.some(c=>c.kind==='rhythm')).toBe(false);
 });
 it('sends only the highest-priority reminder in a tick, so the rest wait for the next one',()=>{
  const facts=many({quietDays:3,due:{count:12,backlog:12,minutes:6},tomorrow:[{slug:'algebra',project:'Algebra',code:'CP3',title:'T'}],
   tutor:{pending:{card:2},newestAt:'2026-11-14T13:00:00Z',cardIds:[],origins:[],projects:[],answeredNotes:0,endedSession:null}});
  const plan=noticePlan(facts,{...prefs,kinds:allOn},NOW);
  const results=decideNotifications(plan.candidates,plan.context);
  expect(results.filter(r=>r.status==='send').map(r=>r.candidate.kind)).toEqual(['tutor']);
 });
});

