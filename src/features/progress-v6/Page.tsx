import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getApi } from '../../data';
import { getStudyApi } from '../../data/study';
import { getGoalApi } from '../../data/study-goals';
import type {GoalPage} from '../../data/study-goals/contract';
import {encompassingRange} from './goal-model';
import ProgressGoals from './goals';
import type { StudyEntryRecord } from '../../data/study/contract';
import { Segmented } from '../../ui/Segmented';
import { Slab } from '../../ui/Slab';
import { effortSummary, periodFor, type EffortRange } from './model';
import {formatDuration} from '../../lib/format';

/** N121 D8: one range control (Today · 7 · 30 · 90 days). The URL still accepts the
 * older day|week|month values, read as Today, 7 and 30 days. */
export const progressRange = (value: string | null, fallback: EffortRange = 'day'): EffortRange =>
  value === '7' || value === '30' || value === '90' ? value : value === 'week' ? '7' : value === 'month' ? '30' : value === 'day' ? 'day' : fallback;
const validRange = progressRange;
export const rangeOptions = [{ value: 'day', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }];
export function rangeWords(range: EffortRange): string {
  return range === 'day' ? 'today' : 'last ' + range + ' days';
}
/** "Logged by day" columns: one per day, or one per week for 90 days. Never a future day. */
export function dailyColumns(daily: { day: string; minutes: number }[], range: EffortRange) {
  if (range !== '90') return daily.map(day => ({ key: day.day, from: day.day, to: day.day, minutes: day.minutes }));
  const weeks: { key: string; from: string; to: string; minutes: number }[] = [];
  for (let i = daily.length - 1; i >= 0; i -= 7) {
    const slice = daily.slice(Math.max(0, i - 6), i + 1);
    weeks.unshift({ key: slice[0].day, from: slice[0].day, to: slice[slice.length - 1].day, minutes: slice.reduce((n, d) => n + d.minutes, 0) });
  }
  return weeks;
}

export default function ProgressV6({controls=true,variant='full',defaultRange='day'}:{controls?:boolean;variant?:'full'|'compact';defaultRange?:EffortRange}={}) {
  const [params, setParams] = useSearchParams();
  const range = validRange(params.get('range'), defaultRange);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const period = periodFor(range, new Date(), zone);
  const [entries, setEntries] = useState<StudyEntryRecord[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [goalCursor, setGoalCursor] = useState<string | null>(null);
  const [goalBack, setGoalBack] = useState<(string | null)[]>([]);
  const [goalPage, setGoalPage] = useState<GoalPage>({items:[],total:0,nextCursor:null});
  const [goalError, setGoalError] = useState('');
  const [goalLoading, setGoalLoading] = useState(true);

  useEffect(() => {
    let active = true;
    try { void getApi().listSubjects().then(rows => { if (active) setSubjects(rows); }).catch(() => { /* names optional */ }); }
    catch { /* names optional */ }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setGoalLoading(true);
    void (async () => {
      let goals:GoalPage={items:[],total:0,nextCursor:null},goalFailure='';
      if (variant === 'full') try {
        goals=await getGoalApi().listGoals({limit:10,cursor:goalCursor});
        if(goals.items.length>10||!Number.isSafeInteger(goals.total)||goals.total<0)
          throw Error('Invalid goal page');
      } catch(reason) {
        goalFailure=reason instanceof Error?reason.message:'Could not read study goals';
      }
      // Exactly one study read supplies both the current chart and each visible
      // goal's complete civil range. No daily values from an unrelated 28-day series.
      const span=encompassingRange(period.span,goals.items);
      const records=await getStudyApi().listStudyEntries(span);
      if(!active)return;
      setEntries(records);setStatus('ready');setError('');
      setGoalPage(goals);setGoalError(goalFailure);setGoalLoading(false);
    })().catch(reason=>{
      if(!active)return;
      setError((reason as Error).message||'Could not load saved study time.');
      setStatus('error');setGoalLoading(false);
    });
    return () => { active = false; };
  }, [period.span.start, period.span.end, goalCursor, refresh, variant]);

  useEffect(() => {
    const reload = () => setRefresh(n => n + 1);
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  const summary = status === 'ready' ? effortSummary(entries, period, zone, new Date().toISOString()) : null;
  const columns = summary ? dailyColumns(summary.daily, range) : [];
  const maxColumn = Math.max(1, ...columns.map(column => column.minutes));
  const subjectLabel = (id: string) => id === 'unassigned' ? 'No subject' : subjects.find(subject => subject.id === id)?.name ?? (id.startsWith('subject-') ? 'Other subject' : id);
  const refreshGoals = () => {setGoalCursor(null);setGoalBack([]);setRefresh(n=>n+1)};
  const nextGoals = () => {if(!goalPage.nextCursor)return;setGoalBack(xs=>[...xs,goalCursor]);setGoalCursor(goalPage.nextCursor)};
  const previousGoals = () => {if(!goalBack.length)return;setGoalCursor(goalBack[goalBack.length-1]);setGoalBack(xs=>xs.slice(0,-1))};
  function chooseRange(value: string) {
    const next = new URLSearchParams(params);
    next.set('range', validRange(value));
    setParams(next);
  }
  function shortDay(day: string) {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(day + 'T12:00:00Z'));
  }
  const chart = summary && range !== 'day' && <Slab as="section" aria-label="Daily logged minutes" className="flex flex-col gap-2 p-3">
    <h3 className="text-body font-semibold">Logged by {range === '90' ? 'week' : 'day'}</h3>
    {summary.minutes === 0 ? <p className="text-label text-ink-2">No focus time saved in this range. <Link to="/" className="text-[var(--link)] underline">Start a focus session</Link></p> :
    <div className="lemma-day-columns flex h-[120px] min-w-0 items-end gap-[2px]" role="list">
      {columns.map(column => {
        const label = (column.from === column.to ? shortDay(column.from) : shortDay(column.from) + ' – ' + shortDay(column.to)) + ': ' + formatDuration(column.minutes);
        return <div key={column.key} role="listitem" aria-label={label} title={label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
          <time dateTime={column.from} className="sr-only">{shortDay(column.from)}</time>
          <span className="block w-full rounded-t-[3px] bg-[var(--accent)]" style={{ height: Math.max(column.minutes > 0 ? 3 : 0, 100 * column.minutes / maxColumn) + '%' }}/>
        </div>;
      })}
    </div>}
    {summary.minutes > 0 && columns.length > 1 && <p className="flex justify-between text-caption text-ink-2"><span>{shortDay(columns[0].from)}</span><span>{shortDay(columns[columns.length - 1].to)}</span></p>}
  </Slab>;

  return <section aria-label="Saved study effort" className="mb-6 flex flex-col gap-3">
    {variant === 'full' && <h2 className="text-title-s font-semibold text-ink">Study effort</h2>}
    {controls&&<Segmented label="Time range" value={range} onChange={chooseRange} options={rangeOptions} />}
    {status === 'loading' && <p role="status" className="text-label text-ink-2">Loading study effort…</p>}
    {status === 'error' && <p role="alert" className="text-label text-ink-2">
      {error} <button type="button" onClick={() => setRefresh(n => n + 1)} className="min-h-11 underline">Retry</button>
    </p>}
    {summary && variant === 'compact' && chart}
    {summary && variant === 'full' && <>
      <Slab as="section" aria-label="Total logged time" className="p-4">
        <p className="text-label text-ink-2">Focus time · {rangeWords(range)}</p>
        <strong className="block text-title font-semibold tabular-nums">{formatDuration(summary.minutes)}</strong>
        <p className="text-caption text-ink-2">Only saved focus intervals count; breaks and unsaved sessions do not.</p>
      </Slab>
      {chart}
      <Slab as="section" aria-label="Time by study subject" className="p-3">
        <h3 className="mb-2 text-body font-semibold">By subject</h3>
        {summary.parts.length === 0 && <p className="text-label text-ink-2">No saved study time in this range.</p>}
        <ul className="space-y-2">{summary.exactParts.map(part =>
          <li key={part.id} className="flex items-center justify-between gap-3 text-label">
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{subjectLabel(part.id)}</span>
            <strong className="shrink-0 tabular-nums">{formatDuration(part.minutes)}</strong>
          </li>
        )}</ul>
        {summary.exactParts.length > 0 && <p className="mt-2 text-caption text-ink-2">Subject totals: {formatDuration(summary.exactParts.reduce((sum, part) => sum + part.minutes, 0))}</p>}
      </Slab>
    </>}
    {variant === 'full' && <ProgressGoals zone={zone} page={goalPage} entries={entries} error={goalError}
      loading={goalLoading} onSaved={refreshGoals} onNext={nextGoals}
      onPrevious={previousGoals} canPrevious={goalBack.length>0}/>}
  </section>;
}
