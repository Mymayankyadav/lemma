import type { CalendarBlockRecord, StudyEntryRecord } from '../../../data/study/contract';
import { calendarRange, weekDays } from '../model';
import {DueDayItems,dueForDay,type CalendarDues} from '../deadlines/DueDayItems';
import {OverlapMarkers,useCalendarOverlaps} from '../overlaps/OverlapMarkers';
import {overlapWindows} from '../overlaps/model';

export interface WeekViewProps {
  date: string;
  zone: string;
  entries: StudyEntryRecord[];
  blocks: CalendarBlockRecord[];
  dues?:CalendarDues;
  onDay: (day: string) => void;
  firstDay?: number;
  clock24h?: boolean;
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
  onDay,firstDay=1,clock24h=true}:WeekViewProps) {
  const days=weekDays(date,zone,entries,blocks,firstDay);
  const viewRange=calendarRange(days[0].day,zone,7);
  const controls=useCalendarOverlaps(viewRange);
  const conflicts=overlapWindows(entries,blocks,viewRange);
  return <section aria-label="Calendar week" className="min-w-0">
    <h2 className="mb-2 text-body font-semibold text-ink">Week of {label(days[0].day,zone)}</h2>
    <div className="max-w-full overflow-x-auto" role="region" aria-label="Week schedule">
      <div className="grid min-w-[700px] grid-cols-7 gap-2">
        {days.map(day=><section key={day.day} data-week-day={day.day}
          aria-label={'Schedule for '+label(day.day,zone)}
          className="min-w-0 rounded-ctl border border-edge bg-fill-1 p-2">
          <h3>
            <button type="button" onClick={()=>onDay(day.day)}
              aria-label={'Open '+day.day+' in Day view'}
              className="min-h-11 w-full rounded-ctl px-1 text-label font-semibold text-ink focus-visible:outline-2 focus-visible:outline-amber">
              {label(day.day,zone)}
            </button>
          </h3>
          <p className="mb-2 text-caption text-ink-2">Logged <strong className="tabular-nums text-ink">
            {Math.round(day.capacity.logged)} min</strong></p>
          {day.logged.length===0 && day.blocks.length===0 &&
            dueForDay(day.day,days[0].day,zone,dues).length===0 &&
            <p className="text-caption text-ink-2">Nothing planned.</p>}
          <div className="flex flex-col gap-2">
            {day.logged.map((slice,index)=><article key={slice.entry.id+':'+index}
              className="rounded-ctl bg-raised-2 p-1 text-caption text-ink">
              <strong className="block break-words">{slice.entry.intent||'Study'}</strong>
              <span>{formatCalendarTime(slice.start,zone,clock24h)} · Logged</span>
            </article>)}
            <DueDayItems date={day.day} firstVisible={days[0].day}
              zone={zone} dues={dues} compact/>
            <OverlapMarkers zone={zone} controls={controls} compact
              windows={conflicts.filter(conflict=>
                Date.parse(conflict.startsAt)<Date.parse(day.range.end)&&
                Date.parse(conflict.endsAt)>Date.parse(day.range.start))}/>
            {day.blocks.map(({block,lane})=><article key={block.id} data-lane={lane}
              style={{marginInlineStart:Math.min(lane,5)*4}}
              className="rounded-ctl border border-edge p-1 text-caption text-ink">
              <strong className="block break-words">{block.title}</strong>
              <span>{formatCalendarTime(block.startsAt,zone,clock24h)} · {block.kind==='busy'?'Busy':'Study'}
                {block.status==='done'?' · Done':''}</span>
            </article>)}
          </div>
        </section>)}
      </div>
    </div>
  </section>;
}
