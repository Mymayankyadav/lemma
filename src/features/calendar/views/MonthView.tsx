import type {CalendarBlockRecord, StudyEntryRecord} from '../../../data/study/contract';
import {calendarRange,dayKey,monthBounds,monthDays} from '../model';
import {OverlapMarkers,useCalendarOverlaps} from '../overlaps/OverlapMarkers';
import {overlapWindows} from '../overlaps/model';
import {DueDayItems,dueForDay,type CalendarDues} from '../deadlines/DueDayItems';
import {formatDuration} from '../../../lib/format';
import {civilDayLabel} from './labels';

interface MonthViewProps {
  date: string;
  zone: string;
  entries: StudyEntryRecord[];
  blocks: CalendarBlockRecord[];
  dues?:CalendarDues;
  onDay: (day: string) => void;
  firstDay?: number;
  clock24h?: boolean;
}
/** Real civil dates, including the adjacent dates needed to fill the grid. */
export function MonthView({date, zone, entries, blocks, dues={deadlines:[],topics:[]},
  onDay, firstDay = 1, clock24h = true}: MonthViewProps) {
  // The first weekday is supplied from the owner calendar preference.
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
    {/* N121 B7: the date navigator already shows the month; keep this name for assistive technology only. */}
    <h2 className="sr-only">{label}</h2>
    <div role="region" aria-label="Month schedule" tabIndex={0}
      className="max-w-full overflow-x-auto rounded-ctl focus-visible:outline-2 focus-visible:outline-amber">
      <div className="min-w-[320px]">
    <div className="grid grid-cols-7 gap-1 text-center text-caption font-semibold text-ink-2">
      {names.map((name,index)=><span key={index}>{name}</span>)}
    </div>
    <div aria-label="Month date grid" className="mt-1 grid auto-rows-[minmax(60px,1fr)] grid-cols-7 gap-1">
      {grid.days.map(day=>{
        const logged = Math.round(day.capacity.logged);
        const blocksCount = day.blocks.length;
        const dueCount=dueForDay(day.day,grid.first,zone,dues).length;
        const range=calendarRange(day.day,zone);
        const overlapCount=conflicts.filter(row=>
          Date.parse(row.startsAt)<Date.parse(range.end)&&
          Date.parse(row.endsAt)>Date.parse(range.start)).length;
        const isToday = day.day === today;
        // N121 B5: a four-step tint of saved focus instead of "0m · 0 blocks" text in every cell.
        const tint = logged >= 120 ? 32 : logged >= 60 ? 22 : logged >= 20 ? 14 : logged > 0 ? 7 : 0;
        const parts = [formatDuration(logged)+' logged', blocksCount+(blocksCount===1?' block':' blocks')];
        if (dueCount) parts.push(dueCount+' due');
        if (overlapCount) parts.push(overlapCount+(overlapCount===1?' time conflict':' time conflicts'));
        return <button key={day.day} type="button"
          data-month-day={day.day} data-outside-month={!day.inMonth||undefined}
          aria-label={'Open '+civilDayLabel(day.day)+' in Day view: '+parts.join(', ')}
          style={tint&&day.inMonth?{background:`color-mix(in srgb, var(--accent) ${tint}%, var(--paper))`}:undefined}
          aria-current={isToday?'date':undefined}
          onClick={()=>onDay(day.day)}
          className={'flex min-h-16 min-w-0 flex-col items-center justify-start gap-0.5 rounded-ctl border p-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber '+
            (day.inMonth?'border-edge bg-fill-1 text-ink':'border-transparent text-ink-3')+
            (isToday?' ring-2 ring-amber':'')}>
          <span className="text-label font-semibold tabular-nums">{Number(day.day.slice(-2))}</span>
          <span aria-hidden="true" className="flex flex-wrap items-center justify-center gap-1">
           {logged>0&&<span title="Logged study" className="size-2 rounded-full bg-[var(--good,var(--accent))]"/>}
           {blocksCount>0&&<span title="Calendar blocks" className="size-2 rounded-full bg-[var(--accent)]"/>}
           {dueCount>0&&<span title="Due items" className="size-2 rounded-full bg-[var(--warn)]"/>}
          </span>
        </button>;
      })}
    </div>
      </div>
    </div>
    {conflicts.length>0&&<details aria-label="Month overlap acknowledgements"
      className="lemma-disclosure mt-4 space-y-2">
      <summary className="min-h-11 cursor-pointer text-label font-semibold text-ink">Time conflicts · {conflicts.length}</summary>
      <OverlapMarkers windows={conflicts} controls={controls} zone={zone} clock24h={clock24h}/>
    </details>}
    {grid.days.some(day=>dueForDay(day.day,grid.first,zone,dues).length>0)&&
      <section aria-label="Month deadlines and practice" className="mt-4 space-y-3">
        <h3 className="text-label font-semibold text-ink">Deadlines and practice</h3>
        {grid.days.filter(day=>dueForDay(day.day,grid.first,zone,dues).length>0)
          .map(day=><section key={day.day} className="space-y-1">
            <h4 className="text-caption font-semibold text-ink-2">{civilDayLabel(day.day)}</h4>
            <DueDayItems date={day.day} firstVisible={grid.first}
              zone={zone} dues={dues}/>
          </section>)}
      </section>}
  </section>;
}
