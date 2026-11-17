import {describe,expect,it} from 'vitest';
import {studyDay,projectTime,studyDaysLeft,capacityOn,timeBlock,modeOf} from '../../../supabase/functions/_shared/adaptive/time.ts';
import {lintText,lintOk,lintNotice} from '../../../supabase/functions/_shared/adaptive/lint.ts';
import {addDays,diffDays,weekdayName} from '../../../supabase/functions/_shared/adaptive/dates.ts';
import {day} from '../../../supabase/functions/mcp/derive.ts';

const S={time_zone:'Asia/Calcutta',rollover_hour:4};
describe('study day (spec §16 Time)',()=>{
  it('a session started at 01:00 local belongs to the previous day (rollover 04:00)',()=>{
    expect(studyDay(S,'2026-11-16T19:30:00Z')).toBe('2026-11-16'); // 01:00 IST on the 17th
    expect(studyDay(S,'2026-11-16T22:30:00Z')).toBe('2026-11-17'); // 04:00 IST
  });
  it('a session crossing midnight belongs to the study day of started_at',()=>{
    const started='2026-11-16T17:00:00Z'; // 22:30 IST on the 16th
    expect(studyDay(S,started)).toBe('2026-11-16');
    expect(studyDay(S,new Date(Date.parse(started)+3*3600000))).toBe('2026-11-16'); // 01:30 is before the 04:00 rollover
    expect(studyDay(S,new Date(Date.parse(started)+6*3600000))).toBe('2026-11-17'); // 04:30 starts the next study day
  });
  it('agrees with the existing derive.day for every hour of a week',()=>{
    for(let h=0;h<24*7;h++){const at=new Date(Date.UTC(2026,10,10)+h*3600000);expect(studyDay(S,at)).toBe(day(S,at))}
  });
  it('travelling: a past instant is read in the zone recorded for it',()=>{
    expect(studyDay({time_zone:'Europe/London',rollover_hour:4},'2026-11-17T03:30:00Z')).toBe('2026-11-16');
    expect(studyDay({time_zone:'Asia/Calcutta',rollover_hour:4},'2026-11-17T03:30:00Z')).toBe('2026-11-17');
  });
});
describe('deadline and study days left',()=>{
  const z='Asia/Calcutta';
  it('deadline_at is read as a local date; last_study_on may precede it',()=>{
    const t=projectTime({deadline_at:'2026-11-21T03:30:00Z',last_study_on:'2026-11-20'},z);
    expect(t.deadlineDate).toBe('2026-11-21');expect(t.lastStudyOn).toBe('2026-11-20');
    expect(studyDaysLeft('2026-11-17',t.lastStudyOn)).toBe(4);
  });
  it('target_date is the compatible fallback and unconfirmed until stated',()=>{
    const t=projectTime({target_date:'2026-11-20'},z);
    expect(t).toEqual({deadlineDate:'2026-11-20',lastStudyOn:'2026-11-20',confirmed:false});
  });
  it('modes: deadline today, passed, none',()=>{
    const t={deadlineDate:'2026-11-20',lastStudyOn:'2026-11-20',confirmed:true};
    expect(modeOf('2026-11-19',t)).toBe('normal');expect(modeOf('2026-11-20',t)).toBe('deadline_today');
    expect(modeOf('2026-11-21',t)).toBe('post_deadline');expect(modeOf('2026-11-21',{...t,lastStudyOn:null})).toBe('no_deadline');
    expect(studyDaysLeft('2026-11-21','2026-11-20')).toBe(0);
  });
  it('last_study_on < today < deadline_at is post-study but not post-deadline for reporting',()=>{
    const t={deadlineDate:'2026-11-22',lastStudyOn:'2026-11-20',confirmed:true};
    expect(modeOf('2026-11-21',t)).toBe('post_deadline');expect(studyDaysLeft('2026-11-21',t.lastStudyOn)).toBe(0);
  });
});
describe('capacity',()=>{
  const wk=[180,180,180,180,180,120,120];
  it('weekday default, override, window and busy blocks',()=>{
    expect(capacityOn('2026-11-17',{weekdayMinutes:wk})).toEqual({minutes:180,configured:true}); // Tue
    expect(capacityOn('2026-11-21',{weekdayMinutes:wk}).minutes).toBe(120);                      // Sat
    expect(capacityOn('2026-11-17',{weekdayMinutes:wk,overrides:{'2026-11-17':0}}).minutes).toBe(0);
    expect(capacityOn('2026-11-17',{weekdayMinutes:wk,busy:{'2026-11-17':720}}).minutes).toBe(120); // 840 window − 720
  });
  it('a busy block that covers the whole window leaves zero',()=>{
    expect(capacityOn('2026-11-17',{weekdayMinutes:wk,busy:{'2026-11-17':900}}).minutes).toBe(0);
  });
  it('unset is reported as unconfigured, never guessed',()=>{
    expect(capacityOn('2026-11-17',{})).toEqual({minutes:0,configured:false});
  });
});
describe('TIME block',()=>{
  const cps=[1,2,3,4,5,6].map(n=>({id:'c'+n,code:'CP'+n,done:n<=3,inactive:false,position:n}));
  const baseline=[{checkpoint_id:'c4',due_on:'2026-11-14'},{checkpoint_id:'c5',due_on:'2026-11-17'},{checkpoint_id:'c6',due_on:'2026-11-17'}];
  const input={today:'2026-11-17',zone:'Asia/Calcutta',project:{deadlineDate:'2026-11-20',lastStudyOn:'2026-11-20',confirmed:true},
    firstSession:'2026-11-16',cps,baseline,capacityToday:{minutes:180,configured:true},usedToday:45};
  it('has the fixed format and only derived values',()=>{
    expect(timeBlock(input)).toBe([
      'TIME today=2026-11-17 (Tue) tz=Asia/Calcutta',
      'deadline=2026-11-20 last_study=2026-11-20 study_days_left=4 (incl. today)',
      'first_session=2026-11-16',
      'due_today=[CP5,CP6] overdue_vs_baseline=[CP4:+3d]',
      'capacity_today=180m used_today=45m'].join('\n'));
  });
  it('lists at most 8 overdue then "+N more"; skips done and deferred',()=>{
    const many=Array.from({length:12},(_,i)=>({id:'x'+i,code:'CP'+(10+i),done:false,inactive:false,position:10+i}));
    const out=timeBlock({...input,cps:many,baseline:many.map(c=>({checkpoint_id:c.id,due_on:'2026-11-10'}))});
    expect(out).toContain('CP10:+7d,CP11:+7d,CP12:+7d,CP13:+7d,CP14:+7d,CP15:+7d,CP16:+7d,CP17:+7d,+4 more');
    const deferred=timeBlock({...input,cps:cps.map(c=>c.id==='c4'?{...c,inactive:true}:c)});
    expect(deferred).not.toContain('CP4:');
  });
  it('contains no forecast, pace or projected-finish wording (I1)',()=>{
    expect(timeBlock(input)).not.toMatch(/pace|forecast|finish|behind|ahead|projected/i);
    expect(timeBlock({...input,capacityToday:{minutes:0,configured:false}})).toContain('capacity_today=unset');
  });
  it('weekday names and date arithmetic',()=>{
    expect(weekdayName('2026-11-17')).toBe('Tue');expect(addDays('2026-11-30',1)).toBe('2026-12-01');expect(diffDays('2026-11-20','2026-11-17')).toBe(3);
  });
});
describe('I2 lint',()=>{
  it('finds the production offenders',()=>{
    expect(lintText('Track pace vs the 10-day plan (10-19 Nov 2026, ~4 h/day)').map(f=>f.kind).sort()).toEqual(['daycount','hours','pace','range'].sort());
    for(const t of ['10-day deep pass','7-day plan','Algebra I in 10 days','7-day intensive'])expect(lintOk(t)).toBe(false);
    expect(lintOk('~30 days behind plan')).toBe(false);
    expect(lintOk('scheduled for 10 Nov')).toBe(false);
    expect(lintOk('due 2026-11-20')).toBe(false);
  });
  it('passes plain study text',()=>{
    for(const t of ['Prove everything; no hints before an attempt.','Munkres chapter 3 and the course notes','Topology I','chapter 2.3 exercises 14-19'])expect(lintOk(t)).toBe(true);
  });
  it('notice names the field and where to move the value',()=>{
    expect(lintNotice('prompt','~4 h/day')).toBe('LINT prompt has "~4 h/day"; move to settings.capacity (I2)');
    expect(lintNotice('prompt','clean')).toBe('');
  });
});
