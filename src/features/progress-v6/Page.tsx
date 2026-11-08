import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getStudyApi } from '../../data/study';
import { getGoalApi } from '../../data/study-goals';
import type {GoalPage} from '../../data/study-goals/contract';
import {encompassingRange} from './goal-model';
import ProgressGoals from './goals';
import type { StudyEntryRecord } from '../../data/study/contract';
import { Segmented } from '../../ui/Segmented';
import { Slab } from '../../ui/Slab';
import { effortSummary, periodFor, formatExactMinutes, type EffortRange } from './model';

const validRange = (value: string | null): EffortRange =>
  value === 'week' || value === 'month' || value === '7' || value === '30' || value === '90' ? value : 'day';

export default function ProgressV6() {
  const [params, setParams] = useSearchParams();
  const range = validRange(params.get('range'));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const period = periodFor(range, new Date(), zone);
  const [entries, setEntries] = useState<StudyEntryRecord[]>([]);
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
    setStatus('loading');
    setGoalLoading(true);
    void (async () => {
      let goals:GoalPage={items:[],total:0,nextCursor:null},goalFailure='';
      try {
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
  }, [period.span.start, period.span.end, goalCursor, refresh]);

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
  const maxDaily = Math.max(1, ...(summary?.daily.map(day => day.minutes) ?? []));
  const recentRanges = [{value:'7',label:'7 days'},{value:'30',label:'30 days'},{value:'90',label:'90 days'}] as const;
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

  return <section aria-label="Saved study effort" className="mb-6 flex flex-col gap-3">
    <h2 className="text-title-s font-semibold text-ink">Study effort</h2>
    <Segmented label="Effort range" value={range} onChange={chooseRange}
      options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
    <div role="group" aria-label="Recent study ranges" className="flex flex-wrap gap-2">
      {recentRanges.map(option=><button key={option.value} type="button"
       aria-pressed={range===option.value} onClick={()=>chooseRange(option.value)}
       className={'min-h-11 flex-1 rounded-ctl border border-edge px-3 text-label font-semibold '+(range===option.value?'bg-amber text-amber-ink':'bg-fill-1 text-ink')}>
       {option.label}</button>)}
    </div>
    {status === 'loading' && <p role="status" className="text-label text-ink-2">Loading study effort…</p>}
    {status === 'error' && <p role="alert" className="text-label text-ink-2">
      {error} <button type="button" onClick={() => setRefresh(n => n + 1)} className="min-h-11 underline">Retry</button>
    </p>}
    {summary && <>
      <Slab as="section" aria-label="Total logged time" className="p-4">
        <p className="text-label text-ink-2">Saved focus time · {range}</p>
        <strong className="block text-title font-semibold tabular-nums">{formatExactMinutes(summary.minutes)} min</strong>
        <p className="text-caption text-ink-2">Only saved focus intervals count; breaks and unsaved sessions do not.</p>
      </Slab>
      {range !== 'day' && <Slab as="section" aria-label="Daily logged minutes" className="flex flex-col gap-2 p-3">
        <h3 className="text-body font-semibold">Logged by day</h3>
        {summary.daily.map(day => <div key={day.day} className="grid grid-cols-[64px_minmax(0,1fr)_48px] items-center gap-2 text-caption">
          <time dateTime={day.day} className="text-ink-2">{shortDay(day.day)}</time>
          <div className="h-3 overflow-hidden rounded-ctl bg-well" role="img" aria-label={shortDay(day.day) + ': ' + formatExactMinutes(day.minutes) + ' minutes'} title={String(day.minutes)+' actual minutes'}>
            <div className="h-full rounded-ctl bg-amber" style={{ width: (100 * day.minutes / maxDaily) + '%' }} />
          </div>
          <span className="text-right tabular-nums text-ink-2">{formatExactMinutes(day.minutes)} min</span>
        </div>)}
      </Slab>}
      <Slab as="section" aria-label="Time by study subject" className="p-3">
        <h3 className="mb-2 text-body font-semibold">By subject</h3>
        {summary.parts.length === 0 && <p className="text-label text-ink-2">No saved study time in this range.</p>}
        <ul className="space-y-2">{summary.exactParts.map(part =>
          <li key={part.id} className="flex items-center justify-between gap-3 text-label">
            <span className="min-w-0 break-words">{part.label}</span>
            <strong className="shrink-0 tabular-nums">{formatExactMinutes(part.minutes)} min</strong>
          </li>
        )}</ul>
        <p className="mt-2 text-caption text-ink-2">Subject totals: {formatExactMinutes(summary.exactParts.reduce((sum, part) => sum + part.minutes, 0))} min</p>
      </Slab>
    </>}
    <ProgressGoals zone={zone} page={goalPage} entries={entries} error={goalError}
      loading={goalLoading} onSaved={refreshGoals} onNext={nextGoals}
      onPrevious={previousGoals} canPrevious={goalBack.length>0}/>
  </section>;
}
