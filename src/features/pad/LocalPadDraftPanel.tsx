import {useEffect, useId, useRef, useState, type ChangeEvent} from 'react';
import {LocalPadWorkspace} from './LocalPadWorkspace';
import {PAD_PAPER, initializePadInk, padStrokePath} from './padInk';
import {PAD_BACKUP_MAX_BYTES, readPadBackup} from './padImport';
import type {PadDraft} from './padDraftStore';
import type {PadDraftState, createPadDraftSession} from './padDraftSession';

const status: Record<PadDraftState['status'], string> = {
  loading: 'Opening local draft…',
  empty: 'No draft saved for this checkpoint yet.',
  saved: 'Saved on this device.',
  recovered: 'Recovered the previous saved draft. Save to keep it as the current revision.',
  unsaved: 'Unsaved changes. Save to keep them on this device.',
  saving: 'Saving on this device…',
  'load-failed': 'The saved draft could not be opened. You can work here and export a copy, but saving is unavailable.',
  'save-failed': 'Could not save. Your work is still here. Try again or export a copy.',
  conflict: 'Another tab saved a newer draft. Export your work before reopening.',
  'scope-changed': 'This Pad is no longer available.',
};

export function LocalPadDraftPanel({session, onSendSelection}: {
  session: ReturnType<typeof createPadDraftSession>; onSendSelection?: (text: string) => void;
}) {
  const [, redraw] = useState(0);
  const state = session.snapshot();
  const [ink, setInk] = useState(() => initializePadInk(state.draft.strokes)!);
  const [candidate, setCandidate] = useState<{source: 'backup' | 'previous'; draft: PadDraft} | null>(null);
  const [fileStatus, setFileStatus] = useState('');
  const [workspaceVersion, resetWorkspace] = useState(0);
  const version = useRef(0);
  const inputId = useId();
  useEffect(() => () => {version.current++;}, []);
  function refresh() {redraw(tick => tick + 1);}

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const token = ++version.current, file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    setCandidate(null);
    if (!file) {setFileStatus(''); return;}
    if (file.size > PAD_BACKUP_MAX_BYTES) {setFileStatus('Choose a Pad JSON backup no larger than 1 MB.'); return;}
    setFileStatus('Reading the backup…');
    try {
      const draft = await readPadBackup(file);
      if (token !== version.current || session.snapshot().status === 'scope-changed') return;
      setCandidate({source: 'backup', draft});
      setFileStatus('');
    } catch {
      if (token === version.current) setFileStatus('Could not read that Pad backup. Your current work is unchanged.');
    }
  }

  function replace() {
    if (!candidate || session.snapshot().status === 'scope-changed') return;
    session.edit(candidate.draft);
    setInk(initializePadInk(candidate.draft.strokes)!);
    resetWorkspace(n => n + 1);
    setCandidate(null);
    const nextStatus = session.snapshot().status;
    setFileStatus(nextStatus === 'load-failed' || nextStatus === 'conflict'
      ? 'Working Pad replaced. Export a copy to keep it.'
      : 'Working Pad replaced. Save to keep this version on this device.');
    refresh();
  }

  if (state.status === 'loading' || state.status === 'scope-changed') return <p role="status">{status[state.status]}</p>;
  const canSave = ['unsaved', 'recovered', 'save-failed'].includes(state.status);
  return <div className="local-pad">
    <p role="status">{status[state.status]}</p>
    <LocalPadWorkspace key={workspaceVersion} value={state.draft.edit} ink={ink}
      canExport={() => session.snapshot().status !== 'scope-changed'}
      onSendSelection={onSendSelection && (text => {
        if (session.snapshot().status !== 'scope-changed') onSendSelection(text);
      })}
      onEdit={edit => {session.edit({...session.snapshot().draft, edit}); refresh();}}
      onInk={next => {session.edit({...session.snapshot().draft, strokes: next.strokes}); setInk(next); refresh();}}/>
    <div className="local-pad-controls" role="group" aria-label="Pad draft actions">
      <button type="button" disabled={!canSave} onClick={() => {
        const saving = session.save(); refresh(); void saving.then(refresh);
      }}>Save draft</button>
      {state.hasPrevious && <button type="button" disabled={state.status === 'saving'} onClick={() => {
        const draft = session.previousDraft();
        version.current++;
        setCandidate(draft ? {source: 'previous', draft} : null);
        setFileStatus('');
      }}>Review previous draft</button>}
    </div>
    <label htmlFor={inputId}>Import a Pad JSON backup</label>
    <input id={inputId} type="file" accept="application/json,.json" onChange={event => {void chooseFile(event);}}/>
    {fileStatus && <p role="status">{fileStatus}</p>}
    {candidate && <section aria-label="Review Pad replacement" className="local-pad">
      <h3>{candidate.source === 'backup' ? 'Preview backup' : 'Previous saved draft'}</h3>
      <p>This replaces your working notes and ink. It does not overwrite the saved draft until you save.</p>
      <pre className="local-pad-import-text">{candidate.draft.edit.text || 'No text'}</pre>
      <p>{candidate.draft.strokes.length} completed strokes</p>
      {candidate.draft.strokes.length > 0 && <svg role="img" aria-label="Replacement ink preview"
        viewBox={'0 0 ' + PAD_PAPER.width + ' ' + PAD_PAPER.height} className="local-pad-import-ink">
        <g fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          {candidate.draft.strokes.map((stroke, i) => <path key={i} d={padStrokePath(stroke)}/>)}
        </g>
      </svg>}
      <div className="local-pad-controls">
        <button type="button" disabled={state.status === 'saving'} onClick={replace}>Replace working Pad</button>
        <button type="button" onClick={() => {version.current++; setCandidate(null); setFileStatus('');}}>Keep current work</button>
      </div>
    </section>}
  </div>;
}
