import { describe, expect, it } from 'vitest';
import { loggedMinutes, inProgressMinutes, capacityStack, subjectPartition, dayBounds } from '../../../src/lib/effort';
import type { StudyEntry } from '../../../src/lib/effort';
const t=(minute:number)=>new Date(Date.UTC(2026,0,1,0,minute)).toISOString();
const range={start:t(0),end:t(120)};
const interval=(a:number,b:number,kind:'focus'|'break'='focus')=>({start:t(a),end:t(b),kind});
const entry=(id:string,spans:ReturnType<typeof interval>[],subjectId?:string,status:StudyEntry['status']='saved'):StudyEntry=>({id,status,subjectId,intervals:spans});
describe('effort metrics',()=>{
  it('unions overlaps, excludes duplicates and non-saved records',()=>{
    const e=[entry('a',[interval(0,30),interval(20,40)]),entry('a',[interval(40,70)]),entry('b',[interval(40,50)]),entry('c',[interval(50,80)],undefined,'draft'),entry('d',[interval(50,80)],undefined,'discarded')];
    const result=loggedMinutes(e,range,'UTC',t(120));
    expect(result.minutes).toBe(50);
    expect(result.futureMinutes).toBe(0);
    expect(loggedMinutes([],range,'UTC',t(120)).minutes).toBe(0);
    expect(loggedMinutes([entry('a',[interval(0,30),interval(10,20,'break')])],range,'UTC',t(120)).minutes).toBe(20);
    expect(loggedMinutes([entry('a',[interval(-20,20)])],range,'UTC',t(120)).minutes).toBe(20);
    expect(loggedMinutes([entry('a',[interval(110,150)])],range,'UTC',t(120)).minutes).toBe(10);
  });
  it('clips future portions separately',()=>{
    const result=loggedMinutes([entry('a',[interval(0,100)])],range,'UTC',t(40));
    expect(result.minutes).toBe(40);
    expect(result.futureMinutes).toBe(60);
    expect(loggedMinutes([entry('a',[interval(60,90)])],range,'UTC',t(40)).minutes).toBe(0);
    expect(loggedMinutes([entry('a',[interval(60,90)])],range,'UTC',t(40)).futureMinutes).toBe(30);
  });
  it('caps active focus and excludes pauses and breaks',()=>{
    expect(inProgressMinutes({startedAt:t(0),focusMinutes:25,phase:'focus'},t(180))).toBe(25);
    expect(inProgressMinutes({startedAt:t(0),focusMinutes:25,phase:'break'},t(10))).toBe(0);
    expect(inProgressMinutes({startedAt:t(0),focusMinutes:25,phase:'paused'},t(10))).toBe(0);
    expect(inProgressMinutes(null,t(10))).toBe(0);
    expect(inProgressMinutes({startedAt:t(0),focusMinutes:25,phase:'focus',intervals:[interval(0,10),interval(10,20,'break'),interval(20,25)]},t(25))).toBe(15);
  });
  it('partitions capacity by priority',()=>{
    const day={start:t(0),end:t(60)};
    const occupied=(a:number,b:number)=>({start:t(a),end:t(b)});
    const result=capacityStack([occupied(0,20)],[occupied(10,40)],[occupied(30,50)],day);
    expect(result.logged).toBe(20);
    expect(result.busy).toBe(20);
    expect(result.planned).toBe(10);
    expect(result.free).toBe(10);
    expect(Object.values(result).reduce((a,b)=>a+b,0)).toBe(60);
  });
  it('assigns overlapping time once in entry order',()=>{
    const entries=[entry('a',[interval(0,30)],'math'),entry('b',[interval(20,50)],'physics'),entry('c',[interval(50,60)])];
    const parts=subjectPartition(entries,range,'UTC');
    expect(parts.math).toBe(30);
    expect(parts.physics).toBe(20);
    expect(parts.unassigned).toBe(10);
    expect(Object.values(parts).reduce((a,b)=>a+b,0)).toBe(loggedMinutes(entries,range,'UTC',t(120)).minutes);
    expect(subjectPartition([entry('x',[interval(0,10)],'math'),entry('x',[interval(0,10)],'math')],range,'UTC').math).toBe(10);
  });
  it('uses civil days, including DST transitions',()=>{
    const londonSpring=dayBounds('2026-03-29','Europe/London');
    const londonAutumn=dayBounds('2026-10-25','Europe/London');
    expect((Date.parse(londonSpring.end)-Date.parse(londonSpring.start))/3600000).toBe(23);
    expect((Date.parse(londonAutumn.end)-Date.parse(londonAutumn.start))/3600000).toBe(25);
    expect(dayBounds('2026-01-01','Asia/Kolkata').start).toBe('2025-12-31T18:30:00.000Z');
    expect(dayBounds('2026-01-01','Asia/Kolkata').end).toBe('2026-01-01T18:30:00.000Z');
    const kolkata=dayBounds('2026-01-01','Asia/Kolkata');
    expect(loggedMinutes([entry('x',[{start:'2025-12-31T18:00:00.000Z',end:'2025-12-31T19:00:00.000Z'}])],kolkata,'Asia/Kolkata',kolkata.end).minutes).toBe(30);
  });
});
