import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getStudyApi } from '../../data/study';
import type { StudyEntryRecord } from '../../data/study/contract';
import { Segmented } from '../../ui/Segmented';
import { Slab } from '../../ui/Slab';
import { effortSummary, periodFor, type EffortRange } from './model';

const validRange = (value: string | null): EffortRange =>
  value === 'week' || value === 'month' ? value : 'day';

export default function ProgressV6() {
  const [params, setParams] = useSearchParams();
  const range = validRange(params.get('range'));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const period = periodFor(range, new Date(), zone);
  const [entries, setEntries] = useState<StudyEntryRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    void getStudyApi().listStudyEntries(period.span).then(records => {
      if (!active) return;
      setEntries(records); setStatus('ready'); setError('');
    }).catch(reason => {
      if (!active) return;
      setError((reason as Error).message || 'Could not load saved study time.'); setStatus('error');
    });
    return () => { active = false; };
  }, [period.span.start, period.span.end, refresh]);

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
    {status === 'loading' && <p role="status" className="text-label text-ink-2">Loading study effort…</p>}
    {status === 'error' && <p role="alert" className="text-label text-ink-2">
      {error} <button type="button" onClick={() => setRefresh(n => n + 1)} className="min-h-11 underline">Retry</button>
    </p>}
    {summary && <>
      <Slab as="section" aria-label="Total logged time" className="p-4">
        <p className="text-label text-ink-2">Saved focus time · {range}</p>
        <strong className="block text-title font-semibold tabular-nums">{summary.displayMinutes} min</strong>
        <p className="text-caption text-ink-2">Only saved focus intervals count; breaks and unsaved sessions do not.</p>
      </Slab>
      {range !== 'day' && <Slab as="section" aria-label="Daily logged minutes" className="flex flex-col gap-2 p-3">
        <h3 className="text-body font-semibold">Logged by day</h3>
        {summary.daily.map(day => <div key={day.day} className="grid grid-cols-[64px_minmax(0,1fr)_48px] items-center gap-2 text-caption">
          <time dateTime={day.day} className="text-ink-2">{shortDay(day.day)}</time>
          <div className="h-3 overflow-hidden rounded-ctl bg-well" role="img" aria-label={shortDay(day.day) + ': ' + day.minutes.toFixed(1) + ' minutes'}>
            <div className="h-full rounded-ctl bg-amber" style={{ width: (100 * day.minutes / maxDaily) + '%' }} />
          </div>
          <span className="text-right tabular-nums text-ink-2">{Math.round(day.minutes)} min</span>
        </div>)}
      </Slab>}
      <Slab as="section" aria-label="Time by study subject" className="p-3">
        <h3 className="mb-2 text-body font-semibold">By subject</h3>
        {summary.parts.length === 0 && <p className="text-label text-ink-2">No saved study time in this range.</p>}
        <ul className="space-y-2">{summary.parts.map(part =>
          <li key={part.id} className="flex items-center justify-between gap-3 text-label">
            <span className="min-w-0 break-words">{part.label}</span>
            <strong className="shrink-0 tabular-nums">{part.minutes} min</strong>
          </li>
        )}</ul>
        <p className="mt-2 text-caption text-ink-2">Subject totals: {summary.parts.reduce((sum, part) => sum + part.minutes, 0)} min</p>
      </Slab>
    </>}
  </section>;
}
