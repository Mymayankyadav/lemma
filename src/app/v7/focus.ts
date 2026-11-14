import {useCallback,useEffect,useState} from 'react';
import {getStudyApi} from '../../data/study';
import type {StudyEntryRecord} from '../../data/study/contract';
import {timedPhase} from '../../data/study/phase';

/**
 * One source for the focus session's state word and clock, so Today's hero, the
 * session row and the Focus screen always say the same thing (PLAN §6.3 Done when).
 */
export type FocusWord='Focus'|'Break'|'Paused';
export function focusWord(entry:Pick<StudyEntryRecord,'status'|'intervals'>):FocusWord{
 const last=entry.intervals[entry.intervals.length-1];
 if(last?.kind==='break'&&last.end===null)return 'Break';
 return entry.status==='paused'?'Paused':'Focus';
}
export interface FocusClock{
 /** Seconds left in a timed phase, or seconds focused so far in an open session. */
 seconds:number; mode:'remaining'|'elapsed';
 /** 0–1 through the current timed phase; null for an open session. */
 progress:number|null; endsAt:string|null; label:string;
}
export function formatClock(seconds:number):string{
 const s=Math.max(0,Math.floor(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;
 return (h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(r).padStart(2,'0');
}
function phaseMinutes(entry:StudyEntryRecord):number{
 const config=entry.config??{},pick=(value:unknown,fallback:number)=>Math.max(1,Number(value)||fallback);
 if(entry.phase==='long_break')return pick(config.long_break_minutes,15);
 if(entry.phase==='break')return pick(config.break_minutes,5);
 return pick(config.focus_minutes,25);
}
/** Reads stored timestamps only (never a tick counter), so a reload shows the same time. */
export function focusClock(entry:StudyEntryRecord,now:number):FocusClock{
 const phase=timedPhase(entry,now);
 if(phase){
  // N162: a paused phase is frozen at what was left and promises no end time; a resumed one counts its pauses.
  const seconds=Math.ceil(phase.remainingMs/1000),span=phaseMinutes(entry)*60;
  return {seconds,mode:'remaining',progress:Math.min(1,Math.max(0,1-seconds/span)),endsAt:phase.paused?null:new Date(phase.endsAtMs).toISOString(),label:formatClock(seconds)};
 }
 let focused=0;
 for(const interval of entry.intervals)if(interval.kind==='focus')focused+=Math.max(0,(interval.end?Date.parse(interval.end):now)-Date.parse(interval.start));
 const seconds=Math.floor(focused/1000);
 return {seconds,mode:'elapsed',progress:null,endsAt:null,label:formatClock(seconds)};
}
/** "FOCUS 1 OF 4", "BREAK", "OPEN SESSION". */
export function focusEyebrow(entry:StudyEntryRecord):string{
 const word=focusWord(entry);
 if(word==='Paused')return 'PAUSED';
 if(word==='Break'||entry.phase==='break'||entry.phase==='long_break')return entry.phase==='long_break'?'LONG BREAK':'BREAK';
 if(entry.mode==='pomodoro'){const cycles=Math.max(1,Number(entry.config?.cycles)||4);return 'FOCUS '+Math.min(cycles,entry.cycle??1)+' OF '+cycles;}
 return entry.mode==='flowtime'?'FLOWTIME':'OPEN SESSION';
}
export const FOCUS_CHANGED='lemma:focus-changed';
export function announceFocusChange(){if(typeof window!=='undefined')window.dispatchEvent(new Event(FOCUS_CHANGED));}

/** The active session (running, on a break or paused), refreshed on focus changes and every 30 s. */
export function useActiveFocus():{entry:StudyEntryRecord|null;loading:boolean;refresh:()=>void}{
 const [entry,setEntry]=useState<StudyEntryRecord|null>(null),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);
 const refresh=useCallback(()=>setVersion(value=>value+1),[]);
 useEffect(()=>{
  let live=true;
  getStudyApi().activeStudyEntry().then(next=>{if(live)setEntry(next);},()=>{if(live)setEntry(null);}).finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[version]);
 useEffect(()=>{
  const timer=window.setInterval(refresh,30_000);
  window.addEventListener(FOCUS_CHANGED,refresh);
  return ()=>{window.clearInterval(timer);window.removeEventListener(FOCUS_CHANGED,refresh);};
 },[refresh]);
 return {entry,loading,refresh};
}
/** A one-second clock for live timers. */
export function useNow(intervalMs=1000):number{
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),intervalMs);return ()=>window.clearInterval(timer);},[intervalMs]);
 return now;
}
