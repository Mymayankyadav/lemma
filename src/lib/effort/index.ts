import type { ActiveEffort, Occupied, Range, StudyEntry } from './types';
export type { ActiveEffort, Occupied, Range, StudyEntry } from './types';

const ms = (s: string) => new Date(s).getTime();
const minutes = (n: number) => n / 60000;
type Span = [number, number];
const valid = ([a,b]: Span) => Number.isFinite(a) && Number.isFinite(b) && b > a;
function union(spans: Span[]): Span[] {
  const sorted = spans.filter(valid).sort((a,b) => a[0]-b[0]);
  const out: Span[] = [];
  for (const [a,b] of sorted) {
    const last = out[out.length-1];
    if (last && a <= last[1]) last[1] = Math.max(last[1],b);
    else out.push([a,b]);
  }
  return out;
}
const duration = (spans: Span[]) => minutes(union(spans).reduce((n,[a,b]) => n+b-a,0));
function subtract(source: Span[], excluded: Span[]): Span[] {
  let remaining = union(source);
  for (const [a,b] of union(excluded)) {
    remaining = remaining.flatMap(([s,e]): Span[] => {
      if (e <= a || s >= b) return [[s,e]];
      const fragments: Span[] = [[s,Math.min(e,a)],[Math.max(s,b),e]];
      return fragments.filter(valid);
    });
  }
  return remaining;
}
function clip(spans: Span[], a: number, b: number): Span[] {
  return spans.map(([s,e]): Span => [Math.max(s,a),Math.min(e,b)]).filter(valid);
}
function entrySpans(entries: StudyEntry[], range: Range, now: string) {
  const seen = new Set<string>(), focus: Span[] = [], breaks: Span[] = [], future: Span[] = [];
  for (const e of entries) {
    if (seen.has(e.id) || e.status !== 'saved') continue;
    seen.add(e.id);
    for (const i of e.intervals) {
      const span: Span = [ms(i.start),ms(i.end)];
      if (i.kind === 'break') breaks.push(span);
      else { focus.push(span); future.push(span); }
    }
  }
  const a=ms(range.start), b=ms(range.end), t=ms(now);
  return { past: subtract(clip(focus,a,Math.min(b,t)),breaks), future: subtract(clip(future,Math.max(a,t),b),breaks) };
}
export function loggedMinutes(entries: StudyEntry[], range: Range, zone: string, now: string) {
  void zone;
  const {past,future}=entrySpans(entries,range,now);
  return { minutes: duration(past), futureMinutes: duration(future) };
}
export function inProgressMinutes(active: ActiveEffort | null, now: string): number {
  if (!active) return 0;
  // A paused or breaking timer stops advancing, but earlier focus still counts.
  // Without interval history there is no duration to reconstruct in those phases.
  if (!active.intervals && (active.phase === 'break' || active.phase === 'paused')) return 0;
  const cap = Math.max(0,active.focusMinutes);
  const spans: Span[] = active.intervals
    ? subtract(
        active.intervals.filter(i=>i.kind !== 'break').map(i=>[ms(i.start),Math.min(ms(i.end),ms(now))] as Span),
        active.intervals.filter(i=>i.kind === 'break').map(i=>[ms(i.start),Math.min(ms(i.end),ms(now))] as Span)
      )
    : [[ms(active.startedAt),ms(now)]];
  return Math.min(cap,duration(spans));
}
export function capacityStack(logged: Occupied[], busy: Occupied[], planned: Occupied[], day: Range) {
  const bounds: Span = [ms(day.start),ms(day.end)];
  const toSpans=(xs:Occupied[])=>clip(xs.map(x=>[ms(x.start),ms(x.end)] as Span),bounds[0],bounds[1]);
  const l=union(toSpans(logged)), b=subtract(toSpans(busy),l), p=subtract(toSpans(planned),[...l,...b]);
  return { logged:duration(l),busy:duration(b),planned:duration(p),free:Math.max(0,minutes(bounds[1]-bounds[0])-duration([...l,...b,...p])) };
}
export function subjectPartition(entries: StudyEntry[], range: Range, zone: string, now: string = range.end) {
  void zone;
  const result: Record<string,number> = {};
  const assigned: Span[] = [], seen = new Set<string>();
  const saved = entries.filter(entry => {
    if (entry.status !== 'saved' || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  const breaks: Span[] = saved.flatMap(entry =>
    entry.intervals.filter(i => i.kind === 'break').map(i => [ms(i.start), ms(i.end)] as Span)
  );
  for (const entry of saved) {
    const focus=entry.intervals.filter(i=>i.kind !== 'break').map(i=>[ms(i.start),ms(i.end)] as Span);
    const spans=subtract(subtract(clip(focus,ms(range.start),Math.min(ms(range.end),ms(now))),breaks),assigned);
    const key=entry.subjectId || 'unassigned';
    result[key]=(result[key]||0)+duration(spans);
    assigned.push(...spans);
  }
  return result;
}
function offset(instant:number,zone:string) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const get=(t:string)=>Number(parts.find(p=>p.type===t)?.value);
  const wall=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));
  return wall-Math.floor(instant/1000)*1000;
}
function midnight(date:string,zone:string) {
  const [y,m,d]=date.split('-').map(Number);
  const target=Date.UTC(y,m-1,d);
  let guess=target;
  for(let i=0;i<4;i++) guess=target-offset(guess,zone);
  return new Date(guess).toISOString();
}
export function dayBounds(date:string,zone:string): Range {
  const [y,m,d]=date.split('-').map(Number);
  const next=new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10);
  return {start:midnight(date,zone),end:midnight(next,zone)};
}
