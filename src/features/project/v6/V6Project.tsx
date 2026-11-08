import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useProject } from '../../../data/hooks';
import type { CheckpointUi, ProjectDetail, SessionSummary } from '../../../data/types';
import { currentCheckpointIndex, groupCheckpointStages } from '../../../ui/timeline/progress';
import { FastTex as Tex } from '../../../ui/FastTex';
import { SourcesPanel } from '../SourcesPanel';

const action = 'min-h-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold text-ink focus-visible:outline-2 focus-visible:outline-amber hover:bg-fill-1';
const statuses: Record<CheckpointUi, string> = {
  done: 'Done', revisit: 'Recheck', now: 'In progress',
  next: 'Up next', locked: 'Locked', proposed: 'Proposed',
};

/** Wrap stage navigation, preserving real chronological order and native button keyboard access. */
export function stageNavigationIndex(current: number, key: string, size: number): number | null {
  if (size < 1) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return size - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % size;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current + size - 1) % size;
  return null;
}

function ScopeEvidence({ detail, slug }: { detail: ProjectDetail; slug: string }) {
  const [showSessions, setShowSessions] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [sessionLimit, setSessionLimit] = useState(20);
  const [sourceLimit, setSourceLimit] = useState(20);
  const sessions: SessionSummary[] = useMemo(() => [...detail.sessions].sort((a, b) =>
    Date.parse(b.startedAt) - Date.parse(a.startedAt) || b.number - a.number), [detail.sessions]);
  return <section aria-label="Project evidence" className="flex flex-col gap-3">
    <h2 className="text-title-s font-semibold text-ink">Evidence</h2>
    <div className="grid grid-cols-2 gap-3 text-label text-ink-2">
      <p className="rounded-ctl border border-edge bg-fill-1 p-3">Tutor sessions
        <strong className="block text-title-s text-ink tabular-nums">{detail.sessions.length}</strong>
      </p>
      <p className="rounded-ctl border border-edge bg-fill-1 p-3">Sources
        <strong className="block text-title-s text-ink tabular-nums">{detail.sources.length}</strong>
      </p>
    </div>
    <div className="rounded-ctl border border-edge bg-[var(--paper)] p-3">
      <button type="button" aria-expanded={showSessions} aria-controls="v6-project-session-list"
        className={action + ' w-full text-left'} onClick={() => setShowSessions(value => !value)}>
        {showSessions ? 'Hide sessions' : 'Show sessions'} ({detail.sessions.length})
      </button>
      {showSessions && <div id="v6-project-session-list" className="mt-3 flex flex-col gap-2">
        {sessions.length === 0 ? <p className="text-label text-ink-2">No tutor sessions yet.</p> :
          sessions.slice(0, sessionLimit).map(session => <Link key={session.id}
            to={'/s/' + encodeURIComponent(slug) + '/' + session.number}
            className={action + ' block break-words'}>{session.goal || 'Session ' + session.number} · S{session.number}</Link>)}
        {sessionLimit < sessions.length && <button type="button" className={action}
          onClick={() => setSessionLimit(value => value + 20)}>Show 20 more sessions</button>}
      </div>}
    </div>
    <div className="rounded-ctl border border-edge bg-[var(--paper)] p-3">
      <button type="button" aria-expanded={showSources} aria-controls="v6-project-source-list"
        className={action + ' w-full text-left'} onClick={() => setShowSources(value => !value)}>
        {showSources ? 'Hide sources' : 'Show sources'} ({detail.sources.length})
      </button>
      {showSources && <div id="v6-project-source-list" className="mt-3 flex flex-col gap-2">
        {detail.sources.length === 0 ? <p className="text-label text-ink-2">No sources yet.</p> :
          detail.sources.slice(0, sourceLimit).map(source =>
            <p key={source.id} className="min-h-11 rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-label text-ink">
              <Tex source={source.title} />
            </p>)}
        {sourceLimit < detail.sources.length && <button type="button" className={action}
          onClick={() => setSourceLimit(value => value + 20)}>Show 20 more sources</button>}
      </div>}
      {showSources && <div className="mt-4 border-t border-edge pt-4" aria-label="Detailed project sources">
        <SourcesPanel projectId={detail.project.id} sources={detail.sources} />
      </div>}
    </div>
  </section>;
}

/** N33.2 uses only the existing owner-scoped useProject hook. */
export default function V6Project() {
  const { slug: rawSlug } = useParams();
  const slug = rawSlug ?? '';
  const projectQuery = useProject(slug);
  const [selected, setSelected] = useState(0);
  const detail = projectQuery.data;
  const stages = useMemo(() => groupCheckpointStages(detail?.checkpoints ?? []), [detail?.checkpoints]);
  useEffect(() => {
    if (!detail) return;
    const current = currentCheckpointIndex(detail.checkpoints);
    setSelected(Math.max(0, stages.findIndex(stage => stage.start <= current && current <= stage.end)));
  }, [detail?.project.id, detail?.checkpoints, stages]);
  function stageKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = stageNavigationIndex(index, event.key, stages.length);
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }
  const active = stages[selected] ?? stages[0];
  if (projectQuery.isPending) return <section aria-label="Project loading" className="p-4">
    <p role="status" className="text-label text-ink-2">Loading project…</p>
  </section>;
  if (projectQuery.isError || !detail || !slug) return <section aria-label="Project unavailable" className="p-4">
    <h1 className="text-title-l font-semibold">Project unavailable</h1>
    <p role="alert" className="mt-2 text-label text-ink-2">The project could not be loaded.</p>
    <button type="button" className={action + ' mt-3'} onClick={() => { void projectQuery.refetch(); }}>Try again</button>
    <Link to="/projects" className={action + ' ml-2 inline-flex items-center'}>Back to Paths</Link>
  </section>;
  return <section aria-labelledby="v6-project-title" className="flex min-w-0 flex-col gap-4 pb-8">
    <header className="flex flex-col gap-2">
      <Link to="/projects" className={action + ' self-start inline-flex items-center'}>Back to Paths</Link>
      <h1 id="v6-project-title" className="break-words text-title-l font-semibold text-ink"><Tex source={detail.project.title}/></h1>
      <p className="text-label text-ink-2">{detail.subject.glyph} {detail.subject.name} · {detail.project.status}</p>
      <p className="break-words text-body text-ink-2">
        {detail.project.goal.trim() ? <Tex source={detail.project.goal}/> : 'Goal unavailable'}
      </p>
    </header>
    <section aria-label="Project progress" className="rounded-ctl border border-edge bg-[var(--paper)] p-3">
      <h2 className="text-title-s font-semibold text-ink">Progress</h2>
      <p className="mt-2 text-label text-ink-2"><strong className="tabular-nums text-ink">{detail.done}</strong>
        {' of '}{detail.total} checkpoints complete</p>
      {detail.project.targetDate && <p className="mt-2 text-label text-ink-2">
        Target date: <time dateTime={detail.project.targetDate}>{detail.project.targetDate}</time>
      </p>}
      <p className="mt-2 text-label text-ink-2">Forecast unavailable</p>
    </section>
    <section aria-labelledby="v6-stage-title" className="flex flex-col gap-3">
      <h2 id="v6-stage-title" className="text-title-s font-semibold text-ink">Stage rail</h2>
      {stages.length === 0 ? <div className="rounded-ctl border border-edge bg-fill-1 p-4 text-label text-ink-2">
        No checkpoints yet. Your tutor can create a plan for this path.
      </div> : <>
        <nav aria-label="Project stages" className="flex min-w-0 gap-2 overflow-x-auto pb-2">
          {stages.map((stage, index) => <button key={stage.key} type="button"
            aria-pressed={selected === index} aria-label={'Stage ' + (index + 1) + ': ' + stage.name}
            onKeyDown={event => stageKeyDown(event, index)}
            onClick={() => setSelected(index)}
            className={action + ' shrink-0 whitespace-nowrap ' + (selected === index ? 'border-amber bg-amber-tint' : '')}>
            {stage.name}
          </button>)}
        </nav>
        {active && <section aria-label="Selected stage" aria-live="polite"
          className="rounded-ctl border border-edge bg-[var(--paper)] p-3">
          <h3 className="mb-2 break-words text-body font-semibold text-ink">
            {active.name}{!active.checkpoints[0]?.stage?.trim() ? ' · Grouped checkpoints' : ''}
          </h3>
          <div className="flex flex-col gap-2">
            {active.checkpoints.map(checkpoint => <Link key={checkpoint.id} data-v6-checkpoint={checkpoint.code}
              to={'/p/' + encodeURIComponent(slug) + '/cp/' + encodeURIComponent(checkpoint.code)}
              aria-label={checkpoint.code + ' ' + checkpoint.title + ', ' + statuses[checkpoint.ui]}
              className={action + ' flex min-w-0 items-center gap-2'}>
              <span className="shrink-0 font-mono text-caption">{checkpoint.code}</span>
              <span className="min-w-0 flex-1 break-words"><Tex source={checkpoint.title}/></span>
              <span className="shrink-0 text-caption text-ink-2">{statuses[checkpoint.ui]}</span>
            </Link>)}
          </div>
        </section>}
      </>}
    </section>
    <ScopeEvidence key={detail.project.id} detail={detail} slug={slug}/>
  </section>;
}
