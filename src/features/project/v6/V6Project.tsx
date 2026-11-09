import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useCheckpoint, useProject } from '../../../data/hooks';
import { ProjectSwitcher } from '../ProjectSwitcher';
import type { CheckpointUi, ProjectDetail, SessionSummary } from '../../../data/types';
import { currentCheckpointIndex, groupCheckpointStages } from '../../../ui/timeline/progress';
import { FastTex as Tex } from '../../../ui/FastTex';
import { SourcesPanel } from '../SourcesPanel';
import { Copy, Layers, MessageCircle } from 'lucide-react';
import { studyPrompt } from '../../../lib/chat';
import { useV6HeaderTitle } from '../../../app/v6Title';

const action = 'min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 py-2 text-label text-ink focus-visible:outline-2 focus-visible:outline-[var(--link)] hover:bg-[var(--paper-2)]';
const chip = 'min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 py-2 text-label text-ink focus-visible:outline-2 focus-visible:outline-[var(--link)]';
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
    <h2 className="text-ink">Sessions and sources</h2>
    {/* N121 F3: the tiles are the toggles; their names keep "Show sessions (n)" / "Show sources (n)". */}
    <div className="notebook-metrics">
      <button type="button" aria-expanded={showSessions} aria-controls="v6-project-session-list"
        aria-label={(showSessions ? 'Hide sessions' : 'Show sessions') + ' (' + detail.sessions.length + ')'}
        className="notebook-metric !min-h-0 text-left" onClick={() => setShowSessions(value => !value)}><span>Tutor sessions</span>
        <strong className="tabular-nums">{detail.sessions.length}</strong>
      </button>
      <button type="button" aria-expanded={showSources} aria-controls="v6-project-source-list"
        aria-label={(showSources ? 'Hide sources' : 'Show sources') + ' (' + detail.sources.length + ')'}
        className="notebook-metric !min-h-0 text-left" onClick={() => setShowSources(value => !value)}><span>Sources</span>
        <strong className="tabular-nums">{detail.sources.length}</strong>
      </button>
    </div>
    <div>
      {showSessions && <div id="v6-project-session-list" className="mt-3 flex flex-col gap-2">
        {sessions.length === 0 ? <p className="text-label text-ink-2">No tutor sessions yet.</p> :
          sessions.slice(0, sessionLimit).map(session => <Link key={session.id}
            to={'/s/' + encodeURIComponent(slug) + '/' + session.number}
            className={action + ' block break-words'}>{session.goal || 'Session ' + session.number} · S{session.number}</Link>)}
        {sessionLimit < sessions.length && <button type="button" className={action}
          onClick={() => setSessionLimit(value => value + 20)}>Show 20 more sessions</button>}
      </div>}
    </div>
    <div id="v6-project-source-list" className="min-w-0">
      {showSources && <div className="min-w-0 max-w-full overflow-x-auto" aria-label="Detailed project sources">
        <SourcesPanel projectId={detail.project.id} sources={detail.sources} />
      </div>}
    </div>
  </section>;
}

/** N33.2 uses only the existing owner-scoped useProject hook. */
/** "Next: Use a finite subcover · Step 3 of 4" — the step's own words when the checkpoint has them. */
function NextStep({ slug, code, step, total }: { slug: string; code: string; step: number; total: number }) {
  const checkpoint = useCheckpoint(slug, code);
  const index = Math.min(Math.max(0, step), Math.max(0, total - 1));
  const text = checkpoint.data?.steps?.[index];
  return <div className="notebook-next-step !my-1"><span>Next</span>
    <p>{text ? <Tex source={text}/> : 'Continue this checkpoint'}{total ? ' · Step ' + Math.min(step + 1, total) + ' of ' + total : ''}</p></div>;
}
export default function V6Project() {
  const { slug: rawSlug } = useParams();
  const slug = rawSlug ?? '';
  const projectQuery = useProject(slug);
  const [copied, setCopied] = useState('');
  const [switching, setSwitching] = useState(false);
  useV6HeaderTitle(projectQuery.data?.project.title);
  async function copyPrompt(prompt: string) {
    try { await navigator.clipboard.writeText(prompt); setCopied('Prompt copied. Paste into your tutor to continue.'); }
    catch { setCopied('Copy unavailable. Open your tutor and ask to resume this checkpoint.'); }
  }
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
  const now = detail.checkpoints.find(checkpoint => checkpoint.ui === 'now');
  // N114 (mockup `19__Page`): the shell header carries the path title; the page opens with
  // Switch path / Concept map, the current checkpoint card, then stages and evidence.
  return <section aria-labelledby="v6-project-title" className="flex min-w-0 flex-col gap-5 pb-8">
    <h2 id="v6-project-title" className="sr-only"><Tex source={detail.project.title}/></h2>
    <div className="lemma-page-action-row -mt-3">
      <button type="button" className="lemma-header-chip" onClick={() => setSwitching(true)}>Switch path</button>
      <Link to="/atlas" className="lemma-header-chip">Concept map</Link>
    </div>
    {now && <article aria-label={'Current checkpoint ' + now.code} className="lemma-project-study !rounded-[12px] !border !border-[var(--hair)] !bg-[var(--paper)] !p-4">
      <Link data-v6-current-checkpoint={now.code} to={'/p/' + encodeURIComponent(slug) + '/cp/' + encodeURIComponent(now.code)}
        aria-label={'Open checkpoint ' + now.code + ' ' + now.title + ', In progress'}
        className="flex min-h-11 min-w-0 flex-col justify-center gap-1 text-left text-ink">
        <span className="text-label font-semibold text-[var(--accent)]">{now.code} · In progress</span>
        <h3 className="!font-[var(--font-display)] text-[1.25rem] text-ink"><Tex source={now.title}/></h3>
      </Link>
      <NextStep slug={slug} code={now.code} step={now.currentStep} total={now.stepsTotal}/>
      <span className="notebook-progress-rail" role="progressbar" aria-label={'Steps for ' + now.code}
        aria-valuemin={0} aria-valuemax={Math.max(1, now.stepsTotal)} aria-valuenow={Math.max(0, now.currentStep)}>
        <span style={{ width: (now.stepsTotal ? 100 * Math.max(0, now.currentStep) / now.stepsTotal : 0) + '%' }}/></span>
      <div className="flex flex-wrap gap-2">
        <Link to="/review" className="lemma-switch-chip gap-1.5 !text-ink-2"><Layers size={16} aria-hidden="true"/>{now.dueCards} due for {now.code}</Link>
        {detail.sessions.length > 0 && <Link to={'/s/' + encodeURIComponent(slug) + '/' + detail.sessions[0].number}
          className="lemma-switch-chip gap-1.5 !text-ink-2"><MessageCircle size={16} aria-hidden="true"/>{detail.sessions.length} tutor sessions</Link>}
      </div>
      <button type="button" className="notebook-primary mt-2" onClick={() => { void copyPrompt(studyPrompt(detail.project.title, now.code, now.title)); }}>
        <Copy size={19} aria-hidden="true"/>Copy study prompt</button>
      <p className="notebook-paste-note">{copied || 'Paste into your tutor to continue.'}</p>
    </article>}
    <section aria-label="Project progress" className="flex flex-col gap-1 border-t border-[var(--hair)] pt-4">
      <p className="text-label text-ink-2">{detail.subject.glyph} {detail.subject.name} · {({ active: 'Active', planning: 'Planning', paused: 'Paused', done: 'Done', archived: 'Archived' } as Record<string, string>)[detail.project.status] ?? 'Active'}</p>
      <p className="break-words text-body text-ink-2">
        {detail.project.goal.trim() ? <Tex source={detail.project.goal}/> : 'Goal unavailable'}
      </p>
      <p className="text-label text-ink-2"><strong className="tabular-nums text-ink">{detail.done}</strong>
        {' of '}{detail.total} checkpoints complete
        {detail.project.targetDate && <> · Target: <time dateTime={detail.project.targetDate}>{new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(detail.project.targetDate + 'T12:00:00Z'))}</time></>}</p>
      <span className="notebook-progress-rail mt-2" aria-hidden="true"><span style={{ width: (detail.total ? 100 * detail.done / detail.total : 0) + '%' }}/></span>
    </section>
    <section aria-labelledby="v6-stage-title" className="flex flex-col gap-3">
      <h2 id="v6-stage-title" className="text-ink">Stages</h2>
      {stages.length === 0 ? <div className="lemma-project-study text-label text-ink-2">
        No checkpoints yet. Your tutor can create a plan for this path.
      </div> : <>
        <nav aria-label="Project stages" className="flex min-w-0 gap-2 overflow-x-auto pb-1" data-stage-jumps="">
          {stages.map((stage, index) => <button key={stage.key} type="button" data-stage-chip=""
            aria-pressed={selected === index} aria-label={'Stage ' + (index + 1) + ': ' + stage.name}
            onKeyDown={event => stageKeyDown(event, index)}
            onClick={() => setSelected(index)}
            className={chip + ' shrink-0 whitespace-nowrap'}>
            {stage.name}
          </button>)}
        </nav>
        {active && <section aria-label="Selected stage" aria-live="polite" data-stage-card=""
          className="rounded-[12px] border border-[var(--hair)] bg-[var(--paper)]">
          <h3 className="border-b border-[var(--hair)] px-3 py-3 break-words text-body font-semibold text-ink">
            {active.name}{!active.checkpoints[0]?.stage?.trim() ? ' · Grouped checkpoints' : ''}
          </h3>
          <div className="flex flex-col">
            {active.checkpoints.map(checkpoint => <Link key={checkpoint.id} data-v6-checkpoint={checkpoint.code} data-cp-row=""
              to={'/p/' + encodeURIComponent(slug) + '/cp/' + encodeURIComponent(checkpoint.code)}
              aria-label={checkpoint.code + ' ' + checkpoint.title + ', ' + statuses[checkpoint.ui]}
              className="flex min-h-14 min-w-0 items-center gap-3 border-b border-[var(--hair)] px-3 py-2 text-ink last:border-b-0">
              <span className="shrink-0 font-mono text-caption text-ink-2">{checkpoint.code}</span>
              <span className="min-w-0 flex-1 break-words"><Tex source={checkpoint.title}/></span>
              <span className="lemma-state-chip" data-checkpoint-state={checkpoint.ui}>{statuses[checkpoint.ui]}</span>
            </Link>)}
          </div>
        </section>}
      </>}
    </section>
    <ScopeEvidence key={detail.project.id} detail={detail} slug={slug}/>
    {switching && <ProjectSwitcher open onClose={() => setSwitching(false)} current={slug}/>}
  </section>;
}
