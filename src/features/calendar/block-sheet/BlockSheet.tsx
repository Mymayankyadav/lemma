import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { getStudyApi } from '../../../data/study';
import type { CalendarBlockRecord, StudyReceipt, CalendarBlockPatch } from '../../../data/study/contract';
import { useToast } from '../../../ui/Toast';
import { localBlockTime, validateBlockDraft, type BlockDraft } from './model';

interface Props {
  block: CalendarBlockRecord | null;
  day: string;
  zone: string;
  onChanged: () => void;
  onClose: () => void;
}
const fieldClass = 'mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-body text-ink';
const buttonClass = 'min-h-11 rounded-ctl border border-edge px-4 py-2 text-label font-semibold text-ink focus-visible:outline-2 focus-visible:outline-amber';

function initial(block: CalendarBlockRecord | null, day: string, zone: string): BlockDraft {
  return block ? {
    title: block.title, kind: block.kind, status: block.status,
    start: localBlockTime(block.startsAt, zone), end: localBlockTime(block.endsAt, zone),
  } : { title: '', kind: 'study', status: 'planned', start: day + 'T09:00', end: day + 'T10:00' };
}
function errorText(value: unknown): string {
  const error = value as {code?: string; message?: string} | null;
  return error?.code === 'conflict' || /conflict|version|stale/i.test(error?.message ?? '')
    ? 'Changed elsewhere; calendar reloaded. Check the latest block and try again.'
    : (error?.message ?? 'Could not change the block.');
}

/** A real browser dialog: native top layer, Escape, focus restoration and safe areas. */
export function BlockSheet({block, day, zone, onChanged, onClose}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const toast = useToast();
  const [draft, setDraft] = useState<BlockDraft>(() => initial(block, day, zone));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  // The parent refetches after conflicts; keep the form in step with that version.
  useEffect(() => {
    setDraft(initial(block, day, zone));
    setConfirmDelete(false);
  }, [block?.id, block?.version, day, zone]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!node.open) node.showModal();
    return () => {
      if (node.open) node.close();
      prior?.focus();
    };
  }, []);

  function change<K extends keyof BlockDraft>(key: K, value: BlockDraft[K]) {
    setDraft(current => ({...current, [key]: value}));
  }
  async function commit<T>(
    work: () => Promise<StudyReceipt<T>>,
    message: string,
    reverse: (receipt: StudyReceipt<T>) => Promise<unknown>,
  ) {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const receipt = await work();
      onChanged(); onClose();
      toast(message, {
        tone: 'success',
        action: { label: 'Undo', onClick: () => {
          void reverse(receipt).then(() => {
            onChanged();
            toast('Calendar block restored.', {tone:'success'});
          }).catch(reason => {
            onChanged();
            toast(errorText(reason), {tone:'danger'});
          });
        }},
      });
    } catch (reason) {
      const message = errorText(reason);
      if (message.startsWith('Changed elsewhere')) onChanged();
      setError(message);
    } finally {
      setSaving(false);
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let values: ReturnType<typeof validateBlockDraft>;
    try { values = validateBlockDraft(draft, zone); }
    catch (reason) { setError((reason as Error).message); return; }
    if (block) {
      const before = block;
      const patch: CalendarBlockPatch = {
        title: values.title, kind: values.kind, startsAt: values.startsAt,
        endsAt: values.endsAt, timeZone: values.timeZone, status: values.status,
      };
      void commit(
        () => getStudyApi().updateCalendarBlock(before.id, before.version, patch),
        'Calendar block updated.',
        receipt => getStudyApi().updateCalendarBlock(before.id, receipt.record.version, {
          title: before.title, kind: before.kind, startsAt: before.startsAt,
          endsAt: before.endsAt, timeZone: before.timeZone, status: before.status,
        }),
      );
    } else {
      void commit(
        () => getStudyApi().createCalendarBlock({
          title: values.title, kind: values.kind, startsAt: values.startsAt,
          endsAt: values.endsAt, timeZone: values.timeZone,
        }),
        'Calendar block added.',
        receipt => getStudyApi().deleteCalendarBlock(receipt.record.id, receipt.record.version),
      );
    }
  }
  function remove() {
    if (!block) return;
    const before = block;
    void commit(
      () => getStudyApi().deleteCalendarBlock(before.id, before.version),
      'Calendar block deleted.',
      () => getStudyApi().createCalendarBlock({
        title: before.title, kind: before.kind, startsAt: before.startsAt,
        endsAt: before.endsAt, timeZone: before.timeZone,
        subjectId: before.subjectId, projectId: before.projectId,
        checkpointId: before.checkpointId, sessionId: before.sessionId,
      }),
    );
  }

  return <dialog ref={dialog} aria-labelledby={heading}
    onCancel={event => {event.preventDefault();onClose();}}
    className="w-[min(100%,528px)] max-h-[90dvh] overflow-y-auto rounded-t-sheet border border-edge bg-[var(--paper)] px-6 pt-5 pb-[calc(24px+env(safe-area-inset-bottom))] text-ink shadow-lg backdrop:bg-obsidian/75">
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 id={heading} className="text-title-s font-semibold">{block ? 'Edit calendar block' : 'Add calendar block'}</h2>
      <button type="button" className={buttonClass} onClick={onClose} disabled={saving}>Close</button>
    </div>
    <form className="flex flex-col gap-3" onSubmit={save}>
      <label className="text-label">Title
        <input className={fieldClass} aria-label="Block title" value={draft.title}
          onChange={event => change('title',event.target.value)} maxLength={200} required/>
      </label>
      <label className="text-label">Type
        <select className={fieldClass} aria-label="Block type" value={draft.kind}
          onChange={event => change('kind',event.target.value as BlockDraft['kind'])}>
          <option value="study">Study</option><option value="busy">Busy</option>
        </select>
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-label">Start
          <input type="datetime-local" aria-label="Sheet block start" className={fieldClass}
            value={draft.start} onChange={event => change('start',event.target.value)} required/>
        </label>
        <label className="text-label">End
          <input type="datetime-local" aria-label="Sheet block end" className={fieldClass}
            value={draft.end} onChange={event => change('end',event.target.value)} required/>
        </label>
      </div>
      {block && <label className="text-label">Status
        <select className={fieldClass} aria-label="Block status" value={draft.status}
          onChange={event => change('status',event.target.value as BlockDraft['status'])}>
          <option value="planned">Planned</option><option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>}
      {error && <p role="alert" className="text-label text-again">{error}</p>}
      <button type="submit" disabled={saving} className={buttonClass}>
        {saving ? 'Saving…' : block ? 'Save block changes' : 'Create calendar block'}
      </button>
    </form>
    {block && <div className="mt-4 border-t border-edge pt-4">
      {!confirmDelete
        ? <button type="button" className={buttonClass} disabled={saving} onClick={() => setConfirmDelete(true)}>Delete block</button>
        : <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-label">Delete this calendar block?</p>
          <button type="button" className={buttonClass} disabled={saving} onClick={remove}>Confirm sheet delete</button>
          <button type="button" className={buttonClass} onClick={() => setConfirmDelete(false)}>Keep block</button>
        </div>}
    </div>}
  </dialog>;
}
