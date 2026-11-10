import type { CalendarBlockRecord, CalendarBlockPatch, StudyEntryRecord } from '../../../data/study/contract';
import { calendarRange, weekDays } from '../model';
import {DueDayItems,dueForDay,type CalendarDues} from '../deadlines/DueDayItems';
import {OverlapMarkers,useCalendarOverlaps} from '../overlaps/OverlapMarkers';
import {overlapWindows} from '../overlaps/model';
import WeekTimeGrid from '../grid/WeekTimeGrid';
import {civilDayLabel} from './labels';
import {formatDuration} from '../../../lib/format';

export interface WeekViewProps {
  date: string;
  zone: string;
  entries: StudyEntryRecord[];
  blocks: CalendarBlockRecord[];
  dues?:CalendarDues;
  onDay: (day: string) => void;
  firstDay?: number;
  clock24h?: boolean;
  onEdit?:(block:CalendarBlockRecord)=>void;
  onAdjust?:(block:CalendarBlockRecord,patch:Pick<CalendarBlockPatch,'startsAt'|'endsAt'>)=>void;
}
function label(date: string, zone: string): string {
  return new Intl.DateTimeFormat('en', {timeZone: zone, weekday: 'short',month: 'short',day: 'numeric'})
    .format(new Date(calendarRange(date,zone).start));
}
export function formatCalendarTime(instant: string, zone: string, clock24h = true): string {
  return new Intl.DateTimeFormat('en', {timeZone: zone, hour:'numeric',
    minute:'2-digit', hourCycle:clock24h?'h23':'h12'}).format(new Date(instant));
}
/** Seven civil days; each block is rendered independently even if times overlap. */
export function WeekView({date,zone,entries,blocks,dues={deadlines:[],topics:[]},
  onDay,firstDay=1,clock24h=true,onEdit,onAdjust}:WeekViewProps) {
  const days=weekDays(date,zone,entries,blocks,firstDay);
  const viewRange=calendarRange(days[0].day,zone,7);
  const controls=useCalendarOverlaps(viewRange);
  const conflicts=overlapWindows(entries,blocks,viewRange);
  return <section aria-label="Calendar week" className="min-w-0">
    <h2 className="sr-only">Week of {label(days[0].day,zone)}</h2>
    <WeekTimeGrid date={date} zone={zone} entries={entries} blocks={blocks}
      clock24h={clock24h} firstDay={firstDay} onDay={onDay} onEdit={onEdit} onAdjust={onAdjust}/>
    <details className="lemma-disclosure mt-3" aria-label="Week event details and conflicts">
     <summary className="min-h-11 cursor-pointer text-label font-medium">Week events and time conflicts</summary>
    <div className="max-w-full overflow-hidden rounded-ctl focus-visible:outline-2 focus-visible:outline-amber"
      role="region" aria-label="Week schedule" tabIndex={0}>
      <div className="grid min-w-0 grid-cols-7 gap-px sm:gap-2">
        {days.map(day=><section key={day.day} data-week-day={day.day}
          aria-label={'Schedule for '+label(day.day,zone)}
          className="min-w-0 overflow-hidden rounded-ctl border border-edge bg-fill-1 p-1 sm:p-2">
          <h3>
            <button type="button" onClick={()=>onDay(day.day)}
              aria-label={'Open '+civilDayLabel(day.day)+' in Day view'}
              className="min-h-11 w-full rounded-ctl px-0 text-[10px] font-semibold text-ink sm:text-label focus-visible:outline-2 focus-visible:outline-amber">
              <span className="block truncate">{new Intl.DateTimeFormat('en',{timeZone:zone,weekday:'short'}).format(new Date(day.range.start))}</span>
              <span className="block tabular-nums">{Number(day.day.slice(-2))}</span>
            </button>
          </h3>
          <p className="mb-2 hidden text-caption text-ink-2 sm:block">Logged <strong className="tabular-nums text-ink">
            {formatDuration(day.capacity.logged)}</strong></p>
          {day.logged.length===0 && day.blocks.length===0 &&
            dueForDay(day.day,days[0].day,zone,dues).length===0 &&
            <p className="text-caption text-ink-2">Nothing planned.</p>}
          <div className="flex min-w-0 flex-col gap-1 sm:gap-2">
            {day.logged.map((slice,index)=><article key={slice.entry.id+':'+index}
              className="min-w-0 overflow-hidden rounded-ctl bg-raised-2 p-1 text-[10px] leading-tight text-ink sm:text-caption">
              <strong className="block truncate">{slice.entry.intent||'Study'}</strong>
              <span className="hidden sm:block">{formatCalendarTime(slice.start,zone,clock24h)} · Logged</span>
            </article>)}
            <DueDayItems date={day.day} firstVisible={days[0].day}
              zone={zone} dues={dues} compact/>
            <OverlapMarkers zone={zone} controls={controls} clock24h={clock24h} compact
              windows={conflicts.filter(conflict=>
                Date.parse(conflict.startsAt)<Date.parse(day.range.end)&&
                Date.parse(conflict.endsAt)>Date.parse(day.range.start))}/>
            {day.blocks.map(({block,lane})=><article key={block.id} data-lane={lane}
              title={block.title}
              style={{marginInlineStart:Math.min(lane,5)*2}}
              className="min-w-0 overflow-hidden rounded-ctl border border-edge p-1 text-[10px] leading-tight text-ink sm:text-caption">
              <strong className="block truncate">{block.title}</strong>
              <span className="hidden sm:block">{formatCalendarTime(block.startsAt,zone,clock24h)} · {block.kind==='busy'?'Busy':'Study'}
                {block.status==='done'?' · Done':''}</span>
            </article>)}
          </div>
        </section>)}
      </div>
    </div>
    </details>
  </section>;
}
