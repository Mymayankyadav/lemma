import {useEffect, useState, useSyncExternalStore} from 'react';
import {Link} from 'react-router';
import {authGeneration, onAccountChange} from '../../data/authBoundary';
import {bindPadDraft, type AuthorizedPadScope} from './padDraftStore';
import {createPadDraftSession} from './padDraftSession';
import {LocalPadDraftPanel} from './LocalPadDraftPanel';
import {currentPadScope, rememberPad} from './padCheckpoint';

interface Props {
  scope: AuthorizedPadScope;
  checkpoint?: {slug: string; code: string};
  onSendSelection?: (text: string) => void;
  deviceAccess?: () => boolean;
}

export default function LiveCheckpointPad({scope, checkpoint, onSendSelection, deviceAccess}: Props) {
  const epoch = useSyncExternalStore(onAccountChange, authGeneration);
  const [session, setSession] = useState<ReturnType<typeof createPadDraftSession> | null>(null);
  const [canReopen, setCanReopen] = useState(false);
  const {ownerId, checkpointId, generation} = scope;
  const slug = checkpoint?.slug, code = checkpoint?.code;
  useEffect(() => {
    const authorized = {ownerId, checkpointId, generation};
    const bound = bindPadDraft(() => deviceAccess
      ? (deviceAccess() ? authorized : null) : currentPadScope(authorized));
    if (!bound) return;
    const draft = createPadDraftSession(bound);
    if (slug && code) setCanReopen(rememberPad(authorized, {slug, code}));
    void draft.load().then(() => {if (bound.isCurrent()) setSession(draft);});
    return () => draft.close();
  }, [ownerId, checkpointId, generation, slug, code, deviceAccess]);

  if (deviceAccess ? !deviceAccess() : epoch !== generation || !currentPadScope(scope)) return <p role="status">This Pad is no longer available.</p>;
  if (!session) return <p role="status">Opening local Pad…</p>;
  return <>
    <LocalPadDraftPanel session={session} onSendSelection={onSendSelection}
      keyboardPreferenceKey={'lemma.device-pad.v1:' + ownerId + ':keyboard:' + checkpointId}/>
    {checkpoint && (canReopen
      ? <Link to={'/pad/' + checkpointId}>Open this Pad on its own</Link>
      : <p role="status">This browser could not store the offline shortcut. Export a copy before leaving.</p>)}
  </>;
}
