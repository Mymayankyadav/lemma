import BlockSheetActions from './block-sheet/BlockSheetActions';
import PlannerLaunch from '../planner/Sheet';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { isFlagOn } from '../../flags';
import { getApi } from '../../data';
import { getStudyApi } from '../../data/study';
import type { CalendarBlockRecord, CalendarBlockKind, StudyEntryRecord } from '../../data/study/contract';
import { Segmented } from '../../ui/Segmented';
import { Slab } from '../../ui/Slab';
import { WeekView,formatCalendarTime } from './views/WeekView';
import { MonthView } from './views/MonthView';
import {DueDayItems,dueForDay,emptyCalendarDues,type CalendarDues} from './deadlines/DueDayItems';
import {loadCalendarDues} from './deadlines/load';
import { agendaGroups, calendarRange, dayCapacity, dayKey, daySlots, monthBounds, shiftDay, shiftMonth, validDayKey, weekStartDay, type LoggedSlice } from './model';

const actionClass = 'min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber';
const fieldClass = 'min-h-11 min-w-0 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-body text-ink';

function dateLabel(day: string, zone: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(calendarRange(day, zone).start));
}
function localInput(iso: string): string {
  const d = new Date(iso), pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toInstant(local: string): string | null {
  const timestamp = new Date(local);
  // A local time inside a daylight-saving gap must not be silently shifted.
  return local && Number.isFinite(timestamp.getTime()) && localInput(timestamp.toISOString()) === local
    ? timestamp.toISOString() : null;
}
function writeError(error: unknown): string {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === 'conflict' || /conflict|version|stale/i.test(value?.message ?? '')
    ? 'Changed elsewhere, reload to see the latest changes.'
    : (value?.message || 'Could not save the block. Try again.');
}
function SavedRow({ slice, zone, clock24h }: { slice: LoggedSlice; zone: string; clock24h:boolean }) {
  const minutes = Math.round((Date.parse(slice.end) - Date.parse(slice.start)) / 60000);
  return <article className="rounded-ctl bg-fill-1 p-2 text-label">
    <strong className="block text-ink">{slice.entry.intent || 'Study'}</strong>
    <span className="text-ink-2">{formatCalendarTime(slice.start, zone, clock24h)}–{formatCalendarTime(slice.end, zone, clock24h)} · {minutes} min logged</span>
  </article>;
}
function BlockSummary({ block, zone, clock24h }: { block: CalendarBlockRecord; zone: string; clock24h:boolean }) {
  return <><strong className="block break-words text-ink">{block.title}</strong>
    <span className="text-caption text-ink-2">{block.kind === 'busy' ? 'Busy' : 'Study'} · {formatCalendarTime(block.startsAt, zone, clock24h)}–{formatCalendarTime(block.endsAt, zone, clock24h)}{block.status === 'done' ? ' · Done' : ''}</span></>;
}

function V6Calendar() {
  const [ownerSettings,setOwnerSettings]=useState<{weekStart?:number;clock24h?:boolean}|null>(null);
  const [preferencesError,setPreferencesError]=useState(false);
  // Calendar is also mounted by standalone N27/N74 tests without React Query.
  // Load owner settings through the same mode-aware API used by Settings.
  useEffect(()=>{
    let active=true;
    const load=()=>{
      try{
        void getApi().getSettings().then(settings=>{
          if(!active)return;
          setOwnerSettings({weekStart:settings.weekStart,clock24h:settings.clock24h});
          setPreferencesError(false);
        }).catch(()=>{if(active)setPreferencesError(true)});
      }catch{
        // Adapter initialization can also fail synchronously (configuration,
        // unavailable mode data); never break the whole Calendar route.
        if(active)setPreferencesError(true);
      }
    };
    load();
    window.addEventListener('focus',load);
    return()=>{active=false;window.removeEventListener('focus',load)};
  },[]);
  const firstDay=ownerSettings?.weekStart??1;
  const clock24h=ownerSettings?.clock24h??true;
  const [params, setParams] = useSearchParams();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const view = params.get('view') === 'day' ? 'day' : params.get('view') === 'week' ? 'week' : params.get('view') === 'month' ? 'month' : 'agenda';
  const rawDay = params.get('date');
  const date = validDayKey(rawDay) ? rawDay : dayKey(new Date(), zone);
  const [entries, setEntries] = useState<StudyEntryRecord[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlockRecord[]>([]);
  const [dues, setDues] = useState<CalendarDues>(emptyCalendarDues);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [readError, setReadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [reload, setReload] = useState(0);
  const [kind, setKind] = useState<CalendarBlockKind>('study');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(date + 'T09:00');
  const [end, setEnd] = useState(date + 'T10:00');
  const [editing, setEditing] = useState<string | null>(null);
  const [moveStart, setMoveStart] = useState('');
  const [moveEnd, setMoveEnd] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setPhase('loading'); setReadError('');
    const range = view === 'month' ? monthBounds(date, zone, firstDay).range :
      calendarRange(view === 'week' ? weekStartDay(date, firstDay) : date, zone, view === 'day' ? 1 : 7);
    const api = getStudyApi();
    // Load owner-only due and projected records alongside saved study data.
    // Their read-only presence never changes dayCapacity or saved effort totals.
    void Promise.all([api.listStudyEntries(range),api.listCalendarBlocks(range),
      loadCalendarDues()])
      .then(([nextEntries,nextBlocks,nextDues]) => {
        if (!active) return;
        setEntries(nextEntries);setBlocks(nextBlocks);setDues(nextDues);
        setPhase('ready');
      })
      .catch(error => {
        if (!active) return;
        setReadError((error as Error).message || 'Could not load the calendar.'); setPhase('error');
      });
    return () => { active = false; };
  }, [date, zone, view, reload, firstDay]);

  useEffect(() => {
    const refetch = () => setReload(n => n + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    setStart(date + 'T09:00'); setEnd(date + 'T10:00');
    setEditing(null); setConfirmDelete(null); setActionError('');
  }, [date]);

  function updateUrl(key: 'view' | 'date', value: string) {
    const next = new URLSearchParams(params);
    next.set('view', view); next.set('date', date);
    next.set(key, value);
    setParams(next);
  }
  async function mutate<T>(perform: () => Promise<T>, done: (receipt: T) => void) {
    if (saving) return;
    setSaving(true); setActionError('');
    try { done(await perform()); }
    catch (error) { setActionError(writeError(error)); }
    finally { setSaving(false); }
  }
  function createBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = toInstant(start), endsAt = toInstant(end);
    if (!title.trim() || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setActionError('Enter a title and a valid start before the end.'); return;
    }
    void mutate(
      () => getStudyApi().createCalendarBlock({ kind, title: title.trim(), startsAt, endsAt, timeZone: zone }),
      receipt => {
        setBlocks(old => [...old, receipt.record]); setTitle('');
      },
    );
  }
  function beginMove(block: CalendarBlockRecord) {
    setEditing(block.id); setMoveStart(localInput(block.startsAt)); setMoveEnd(localInput(block.endsAt));
    setConfirmDelete(null); setActionError('');
  }
  function moveBlock(event: FormEvent<HTMLFormElement>, block: CalendarBlockRecord) {
    event.preventDefault();
    const startsAt = toInstant(moveStart), endsAt = toInstant(moveEnd);
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setActionError('Enter a valid start before the end.'); return;
    }
    void mutate(
      () => getStudyApi().updateCalendarBlock(block.id, block.version, { startsAt, endsAt }),
      receipt => { setBlocks(old => old.map(b => b.id === block.id ? receipt.record : b)); setEditing(null); },
    );
  }
  function doneBlock(block: CalendarBlockRecord) {
    void mutate(
      () => getStudyApi().updateCalendarBlock(block.id, block.version, { status: 'done' }),
      receipt => setBlocks(old => old.map(b => b.id === block.id ? receipt.record : b)),
    );
  }
  function deleteBlock(block: CalendarBlockRecord) {
    void mutate(
      () => getStudyApi().deleteCalendarBlock(block.id, block.version),
      () => { setBlocks(old => old.filter(b => b.id !== block.id)); setConfirmDelete(null); },
    );
  }
  const groups = phase === 'ready' && view === 'agenda' ? agendaGroups(date, zone, entries, blocks) : [];
  const slots = phase === 'ready' && view === 'day' ? daySlots(date, zone, entries, blocks) : [];
  const capacity = phase === 'ready' && view === 'day' ? dayCapacity(date, zone, entries, blocks) : null;
  const step = view === 'day' ? 1 : 7;

  return <section aria-labelledby="calendar-title" className="flex flex-col gap-4 pb-8">
    <h1 id="calendar-title" className="sr-only">Calendar</h1>
    {preferencesError&&<p aria-live="polite" className="text-label text-ink-2">Calendar preferences unavailable; showing default week start and clock format.</p>}
    <div onKeyDown={event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const choices = ['agenda', 'day', 'week', 'month'];
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = (choices.indexOf(view) + offset + choices.length) % choices.length;
      event.preventDefault();
      updateUrl('view', choices[next]);
      event.currentTarget.querySelectorAll('button')[next]?.focus();
    }}>
      <Segmented label="Calendar view" value={view} onChange={value => updateUrl('view', value)}
        options={[{ value: 'agenda', label: 'Agenda' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
    </div>
    <nav aria-label="Calendar date" className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" className={actionClass} aria-label="Previous dates" onClick={() => updateUrl('date', view === 'month' ? shiftMonth(date, -1) : shiftDay(date, -step))}>‹</button>
      <strong className="text-center text-label text-ink">{dateLabel(date, zone)}</strong>
      <button type="button" className={actionClass} aria-label="Next dates" onClick={() => updateUrl('date', view === 'month' ? shiftMonth(date, 1) : shiftDay(date, step))}>›</button>
      <button type="button" className={actionClass} onClick={() => updateUrl('date', dayKey(new Date(), zone))}>Today</button>
    </nav>

    {phase === 'loading' && <p role="status">Loading calendar…</p>}
    {phase === 'error' && <div role="alert">{readError} <button type="button" className={actionClass} onClick={() => { setActionError(''); setReload(n => n + 1); }}>Reload</button></div>}
    {actionError && <div role="alert" className="rounded-ctl border border-edge p-3 text-label">{actionError} <button type="button" className={actionClass} onClick={() => { setActionError(''); setReload(n => n + 1); }}>Reload</button></div>}

    {phase === 'ready' && view === 'agenda' && <div aria-label="Next seven days" className="flex flex-col gap-3">
      {groups.map(group => <Slab as="section" key={group.day} className="flex flex-col gap-2 p-3">
        <h2 className="text-body font-semibold text-ink">{dateLabel(group.day, zone)}</h2>
        {group.entries.length === 0 && group.blocks.length === 0 &&
          !dueForDay(group.day,date,zone,dues).length &&
          <p className="text-label text-ink-2">Nothing planned.</p>}
        {group.entries.map((entry, index) => <SavedRow key={entry.entry.id + ':' + index} slice={entry} zone={zone} clock24h={clock24h} />)}
        {group.blocks.map(block => <article key={block.id} className="rounded-ctl border border-edge p-2 text-label"><BlockSummary block={block} zone={zone} clock24h={clock24h}/></article>)}
        <DueDayItems date={group.day} firstVisible={date} zone={zone} dues={dues}/>
      </Slab>)}
    </div>}

    {phase === 'ready' && view === 'week' && <WeekView date={date} zone={zone} firstDay={firstDay} clock24h={clock24h}
      entries={entries} blocks={blocks} dues={dues} onDay={selected => {
        const next = new URLSearchParams(params);
        next.set('view', 'day'); next.set('date', selected); setParams(next);
      }} />}

    {phase === 'ready' && view === 'month' && <MonthView date={date} zone={zone} firstDay={firstDay}
      entries={entries} blocks={blocks} dues={dues} onDay={selected => {
        const next = new URLSearchParams(params);
        next.set('view', 'day'); next.set('date', selected); setParams(next);
      }} />}

    {phase === 'ready' && view === 'day' && <>
      {capacity && <Slab as="section" aria-label="Day capacity" className="p-3">
        <h2 className="mb-2 text-body font-semibold">Time accounted for</h2>
        <div className="grid grid-cols-2 gap-2 text-label">
          <p>Logged <strong className="block tabular-nums">{Math.round(capacity.logged)} min</strong></p>
          <p>Busy <strong className="block tabular-nums">{Math.round(capacity.busy)} min</strong></p>
          <p>Planned <strong className="block tabular-nums">{Math.round(capacity.planned)} min</strong></p>
          <p>Free <strong className="block tabular-nums">{Math.round(capacity.free)} min</strong></p>
        </div>
      </Slab>}

      <Slab as="section" aria-label="Plan a calendar block" className="p-3">
        <h2 className="mb-3 text-body font-semibold">Add a block</h2>
        <form className="flex flex-col gap-3" onSubmit={createBlock}>
          <label className="text-label">Type<select className={fieldClass} value={kind} onChange={e => setKind(e.target.value as CalendarBlockKind)}><option value="study">Study</option><option value="busy">Busy</option></select></label>
          <label className="text-label">Title<input className={fieldClass} value={title} onChange={e => setTitle(e.target.value)} required maxLength={200}/></label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-label">Start<input aria-label="Block start" type="datetime-local" className={fieldClass} value={start} onChange={e => setStart(e.target.value)} required/></label>
            <label className="text-label">End<input aria-label="Block end" type="datetime-local" className={fieldClass} value={end} onChange={e => setEnd(e.target.value)} required/></label>
          </div>
          <button type="submit" disabled={saving} className={actionClass + ' self-start'}>Add block</button>
        </form>
      </Slab>
      <Slab as="section" aria-label="Day schedule" className="p-3">
        <h2 className="mb-3 text-body font-semibold">Day schedule</h2>
        {slots.every(row => row.entries.length === 0 && row.blocks.length === 0) &&
          dueForDay(date,date,zone,dues).length===0 &&
          <p className="mb-3 text-label text-ink-2">Nothing planned.</p>}
        <DueDayItems date={date} firstVisible={date} zone={zone} dues={dues}/>
        <div role="region" aria-label="Day hourly timetable" tabIndex={0}
          className="max-w-full overflow-x-auto rounded-ctl focus-visible:outline-2 focus-visible:outline-amber">
          <div className="min-w-[320px]">
        <div className="grid grid-cols-[minmax(70px,auto)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-edge pb-2 text-caption font-semibold text-ink-2">
          <span>Hour</span><span>Logged study</span><span>Planned blocks</span>
        </div>
        {slots.map(row => <div key={row.at} className="grid grid-cols-[minmax(70px,auto)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-edge py-2">
          <time dateTime={row.at} className="break-words text-caption tabular-nums text-ink-2">{row.label}</time>
          <div className="min-w-0 space-y-2">{row.entries.map((slice, index) => <SavedRow key={slice.entry.id + ':' + index} slice={slice} zone={zone} clock24h={clock24h}/>)}</div>
          <div className="min-w-0 space-y-2">{row.blocks.map(block => <article key={block.id} className="rounded-ctl border border-edge p-2 text-label">
            <BlockSummary block={block} zone={zone} clock24h={clock24h}/>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={actionClass} disabled={saving} onClick={() => beginMove(block)} aria-label={'Move ' + block.title}>Move</button>
              {block.status !== 'done' && <button type="button" className={actionClass} disabled={saving} onClick={() => doneBlock(block)} aria-label={'Mark ' + block.title + ' done'}>Done</button>}
              <button type="button" className={actionClass} disabled={saving} onClick={() => {setConfirmDelete(block.id);setEditing(null);}} aria-label={'Delete ' + block.title}>Delete</button>
            </div>
            {editing === block.id && <form onSubmit={event => moveBlock(event, block)} className="mt-2 flex flex-col gap-2">
              <label>Move start<input aria-label="Move block start" type="datetime-local" className={fieldClass} value={moveStart} onChange={event => setMoveStart(event.target.value)} required/></label>
              <label>Move end<input aria-label="Move block end" type="datetime-local" className={fieldClass} value={moveEnd} onChange={event => setMoveEnd(event.target.value)} required/></label>
              <div className="flex flex-wrap gap-2"><button className={actionClass} type="submit" disabled={saving}>Save move</button><button className={actionClass} type="button" onClick={() => setEditing(null)}>Cancel</button></div>
            </form>}
            {confirmDelete === block.id && <div className="mt-2 text-label">
              <p>Delete this block?</p><button type="button" className={actionClass} disabled={saving} onClick={() => deleteBlock(block)}>Confirm delete</button>
              <button type="button" className={actionClass} onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>}
          </article>)}</div>
        </div>)}
          </div>
        </div>
      </Slab>
    </>}
    <BlockSheetActions blocks={blocks} date={date} zone={zone} ready={phase === 'ready'}
      onRefresh={() => setReload(n => n + 1)}/>
    <PlannerLaunch date={date} zone={zone}/>
  </section>;
}

/** The legacy route stays a redirect and does not mount any v6 data reads. */
export default function CalendarPage() {
  if (!isFlagOn('v6Shell')) return <Navigate to="/" replace />;
  return <V6Calendar />;
}
