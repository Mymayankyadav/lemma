import {useCallback, useContext, useEffect, useRef, useState} from 'react';
import {UNSAFE_DataRouterContext, useBlocker, type BlockerFunction} from 'react-router';
import {Sheet} from '../../ui/v7/components';
import type {createPadDraftSession} from './padDraftSession';

interface Props {
  session: ReturnType<typeof createPadDraftSession>;
  dirty: boolean;
  onSaved: () => void;
}

function hasWorkingChanges({session, dirty}: Pick<Props, 'session' | 'dirty'>): boolean {
  return dirty && !['empty', 'saved', 'loading', 'scope-changed'].includes(session.snapshot().status);
}

/** Local drafts must be saved or explicitly discarded before their route unmounts.
 * A revoked account binding never keeps a private editor or navigation dialog open. */
export function PadNavigationGuard(props: Props) {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const {session, dirty} = props;
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasWorkingChanges({session, dirty})) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [session, dirty]);
  // Isolated editors and legacy MemoryRouter tests have no data router. Their
  // reload guard still works, but useBlocker is only valid in the data router.
  return dataRouter ? <RoutedPadGuard {...props}/> : null;
}

function RoutedPadGuard({session, dirty, onSaved}: Props) {
  const shouldBlock = useCallback<BlockerFunction>(({currentLocation, nextLocation}) =>
    hasWorkingChanges({session, dirty}) && (currentLocation.pathname !== nextLocation.pathname
      || currentLocation.search !== nextLocation.search || currentLocation.hash !== nextLocation.hash), [session, dirty]);
  const blocker = useBlocker(shouldBlock);
  const currentBlocker = useRef(blocker);
  currentBlocker.current = blocker;
  const alive = useRef(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const status = session.snapshot().status;
  const blocked = blocker.state === 'blocked' && hasWorkingChanges({session, dirty});
  useEffect(() => {
    alive.current = true;
    return () => {alive.current = false;};
  }, []);
  useEffect(() => {
    if (blocker.state === 'blocked' && !hasWorkingChanges({session, dirty})) blocker.reset();
    if (blocker.state !== 'blocked') setError('');
  }, [blocker, session, dirty]);

  function keepEditing() {
    if (saving) return;
    if (currentBlocker.current.state === 'blocked') currentBlocker.current.reset();
  }

  function leave() {
    if (saving || session.snapshot().status === 'scope-changed') return;
    if (currentBlocker.current.state === 'blocked') currentBlocker.current.proceed();
  }

  async function saveAndLeave() {
    if (saving || !['unsaved', 'recovered', 'save-failed'].includes(session.snapshot().status)) return;
    setSaving(true); setError('');
    try {
      const savingDraft = session.save();
      onSaved();
      await savingDraft;
      if (!alive.current) return;
      onSaved();
      const result = session.snapshot().status;
      if (result === 'scope-changed') {
        if (currentBlocker.current.state === 'blocked') currentBlocker.current.reset();
      } else if (result === 'saved' || result === 'empty') {
        if (currentBlocker.current.state === 'blocked') currentBlocker.current.proceed();
      } else {
        setError(result === 'unsaved'
          ? 'Your Pad changed while saving. Keep editing or save again before leaving.'
          : 'Your Pad was not saved. Keep editing and export a copy before leaving.');
      }
    } catch {
      if (alive.current && session.snapshot().status !== 'scope-changed') {
        setError('Your Pad was not saved. Keep editing and export a copy before leaving.');
      }
    } finally {
      if (alive.current) {setSaving(false); onSaved();}
    }
  }

  if (!blocked) return null;
  const canSave = !saving && ['unsaved', 'recovered', 'save-failed'].includes(status);
  return <Sheet open onClose={keepEditing} title="Save your Pad before leaving?" eyebrow="Unsaved local work"
    footer={<div className="local-pad-controls">
      <button type="button" data-v7-autofocus="true" disabled={saving} onClick={keepEditing}>Keep editing</button>
      <button type="button" disabled={saving} onClick={leave}>Discard and leave</button>
      <button type="button" disabled={!canSave} onClick={() => void saveAndLeave()}>
        {saving ? 'Saving Pad…' : 'Save and leave'}
      </button>
    </div>}>
    <p>Your notes and ink have changes that are not saved on this device.</p>
    {(status === 'conflict' || status === 'load-failed') && <p role="status">
      {status === 'conflict' ? 'Another tab saved a newer draft.' : 'The saved draft could not be opened.'}
      {' '}Keep editing and export a copy before leaving; this working draft cannot safely overwrite the saved record.
    </p>}
    {status === 'saving' && !saving && <p role="status">A save is in progress. Keep this Pad open until it finishes.</p>}
    {error && <p role="alert">{error}</p>}
  </Sheet>;
}
