import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ProjectSummary } from '../../../data/types';

export interface CardFilters {
  projectSlug: string;
  checkpointCode: string;
  state: string;
  noteStatus: string;
  hasOpenComments: boolean;
}
export const clearCardFilters: CardFilters = {
  projectSlug: '', checkpointCode: '', state: '', noteStatus: '', hasOpenComments: false,
};
const field = 'min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-body text-ink';
const label = 'flex flex-col gap-1 text-label text-ink-2';
const button = 'min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink';

type Props = {
  values: CardFilters;
  projects: ProjectSummary[];
  projectsLoading: boolean;
  projectsError: boolean;
  onApply: (filters: CardFilters) => void;
  onDismiss: () => void;
};

/** The same six server search filters, without introducing any new API. */
export default function CardFiltersSheet({ values, projects, projectsLoading, projectsError, onApply, onDismiss }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<CardFilters>({ ...values });

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (node) {
      if (typeof node.showModal === 'function') node.showModal();
      else node.setAttribute('open', '');
    }
    return () => {
      if (node?.open && typeof node.close === 'function') node.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  function close() {
    onDismiss();
    const prior = previousFocus.current;
    queueMicrotask(() => { if (prior?.isConnected) prior.focus(); });
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({ ...draft, checkpointCode: draft.checkpointCode.trim() });
    close();
  }
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}
    className="w-[calc(100%-2rem)] max-w-[440px] max-h-[90dvh] overflow-y-auto rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-xl backdrop:bg-black/50"
    style={{ paddingBottom: 'max(1rem,env(safe-area-inset-bottom))' }}>
    <h2 id={titleId} className="text-title-s font-semibold">Filter cards</h2>
    <form className="mt-4 flex flex-col gap-3" onSubmit={apply}>
      <label className={label}>Project
        <select autoFocus aria-label="Filter project" className={field} value={draft.projectSlug}
          onChange={event => setDraft(old => ({ ...old, projectSlug: event.target.value, checkpointCode: '' }))}>
          <option value="">All projects</option>
          {projects.map(project => <option key={project.id} value={project.slug}>{project.title}</option>)}
        </select>
      </label>
      {projectsLoading && <p role="status" className="text-label">Loading projects…</p>}
      {projectsError && <p role="alert" className="text-label">Projects unavailable. You can filter by other fields.</p>}
      <label className={label}>Checkpoint code
        <input aria-label="Filter checkpoint" className={field} value={draft.checkpointCode}
          onChange={event => setDraft(old => ({ ...old, checkpointCode: event.target.value }))} />
      </label>
      <label className={label}>Scheduling state
        <select aria-label="Filter scheduling state" className={field} value={draft.state}
          onChange={event => setDraft(old => ({ ...old, state: event.target.value }))}>
          <option value="">All states</option><option value="0">New</option>
          <option value="1">Learning</option><option value="2">Review</option><option value="3">Relearning</option>
        </select>
      </label>
      <label className={label}>Card status
        <select aria-label="Filter note status" className={field} value={draft.noteStatus}
          onChange={event => setDraft(old => ({ ...old, noteStatus: event.target.value }))}>
          <option value="">All statuses</option><option value="active">Active</option>
          <option value="suspended">Paused</option><option value="deleted">Deleted</option>
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-label text-ink">
        <input type="checkbox" aria-label="Has open comments" checked={draft.hasOpenComments}
          onChange={event => setDraft(old => ({ ...old, hasOpenComments: event.target.checked }))}/>
        Has open comments
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => setDraft({ ...clearCardFilters })}>Clear</button>
        <button type="button" className={button} onClick={close}>Cancel</button>
        <button type="submit" className={button}>Apply filters</button>
      </div>
    </form>
  </dialog>;
}
