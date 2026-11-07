import type {CalendarBlockRecord, StudyEntryRecord} from '../../../data/study/contract';
import {calendarRange,dayKey,monthBounds,monthDays} from '../model';
import {OverlapMarkers,useCalendarOverlaps} from '../overlaps/OverlapMarkers';
import {overlapWindows} from '../overlaps/model';
import {DueDayItems,dueForDay,type CalendarDues} from '../deadlines/DueDayItems';

interface MonthViewProps {
  date: string;
  zone: string;
  entries: StudyEntryRecord[];
  blocks: CalendarBlockRecord[];
  dues?:CalendarDues;
  onDay: (day: string) => void;
  firstDay?: number;
}
/** Real civil dates, including the adjacent dates needed to fill the grid. */
export function MonthView({date, zone, entries, blocks, dues={deadlines:[],topics:[]},
  onDay, firstDay = 1}: MonthViewProps) {
  const grid = monthDays(date, zone, entries, blocks, firstDay);
  const viewRange=monthBounds(date,zone,firstDay).range;
  const controls=useCalendarOverlaps(viewRange);
  const conflicts=overlapWindows(entries,blocks,viewRange);
  const today = dayKey(new Date(), zone);
  const formatter = new Intl.DateTimeFormat('en', {timeZone: zone, month: 'long', year: 'numeric'});
  const label = formatter.format(new Date(calendarRange(date, zone).start));
  const weekday = new Intl.DateTimeFormat('en', {weekday: 'short', timeZone: 'UTC'});
  const names = Array.from({length: 7}, (_, offset) => {
    const day = grid.days[offset].day;
    return weekday.format(new Date(day + 'T12:00:00Z'));
  });
  return <section aria-label="Calendar month" className="min-w-0">
    <h2 className="mb-2 text-body font-semibold text-ink">{label}</h2>
    <div className="grid grid-cols-7 gap-1 text-center text-caption font-semibold text-ink-2">
      {names.map((name,index)=><span key={index}>{name}</span>)}
    </div>
    <div aria-label="Month date grid" className="mt-1 grid grid-cols-7 gap-1">
      {grid.days.map(day=>{
        const logged = Math.round(day.capacity.logged);
        const blocksCount = day.blocks.length;
        const dueCount=dueForDay(day.day,grid.first,zone,dues).length;
        const range=calendarRange(day.day,zone);
        const overlapCount=conflicts.filter(row=>
          Date.parse(row.startsAt)<Date.parse(range.end)&&
          Date.parse(row.endsAt)>Date.parse(range.start)).length;
        const isToday = day.day === today;
        return <button key={day.day} type="button"
          data-month-day={day.day} data-outside-month={!day.inMonth||undefined}
          aria-label={'Open '+day.day+' in Day view'}
          aria-current={isToday?'date':undefined}
          onClick={()=>onDay(day.day)}
          className={'flex min-h-16 min-w-0 flex-col items-center justify-start gap-0.5 rounded-ctl border p-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber '+
            (day.inMonth?'border-edge bg-fill-1 text-ink':'border-transparent text-ink-3')+
            (isToday?' ring-2 ring-amber':'')}>
          <span className="text-label font-semibold tabular-nums">{Number(day.day.slice(-2))}</span>
          <span className="text-[11px] tabular-nums">{logged}m</span>
          <span className="text-[11px] tabular-nums" aria-label={blocksCount+' blocks'}>
            {blocksCount} {blocksCount===1?'block':'blocks'}
          </span>
          {dueCount>0&&<span className="text-[11px] tabular-nums text-ink">
            {dueCount} due</span>}
          {overlapCount>0&&<span className="text-[11px] font-semibold text-ink">
            {overlapCount} conflict{overlapCount===1?'':'s'}</span>}
        </button>;
      })}
    </div>
    {conflicts.length>0&&<section aria-label="Month overlap acknowledgements"
      className="mt-4 space-y-2">
      <h3 className="text-label font-semibold text-ink">Time conflicts</h3>
      <OverlapMarkers windows={conflicts} controls={controls} zone={zone}/>
    </section>}
    {grid.days.some(day=>dueForDay(day.day,grid.first,zone,dues).length>0)&&
      <section aria-label="Month deadlines and practice" className="mt-4 space-y-3">
        <h3 className="text-label font-semibold text-ink">Deadlines and practice</h3>
        {grid.days.filter(day=>dueForDay(day.day,grid.first,zone,dues).length>0)
          .map(day=><section key={day.day} className="space-y-1">
            <h4 className="text-caption font-semibold text-ink-2">{day.day}</h4>
            <DueDayItems date={day.day} firstVisible={grid.first}
              zone={zone} dues={dues}/>
          </section>)}
      </section>}
  </section>;
}
