import {useEffect, useState} from 'react';
import {getDemoProfile, getMode, type DemoProfile} from '../../data/mode';
import {bindFixturePadDraft} from './padDraftStore';
import {createPadDraftSession} from './padDraftSession';
import {LocalPadDraftPanel} from './LocalPadDraftPanel';

const FIXTURE_OWNER = '50d68f9b-b35a-4abd-8f50-70df995aa76a';

/** Fixture-only deterministic key. Never identifies a real owner or authorizes live storage. */
export async function fixtureCheckpointId(profile: DemoProfile, checkpointId: string) {
  if (!checkpointId || checkpointId.length > 180) throw new Error('Invalid fixture checkpoint');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(profile + '\0' + checkpointId));
  const hex = Array.from(new Uint8Array(bytes, 0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export default function FixtureCheckpointPad({checkpointId, profile, onSendSelection}: {
  checkpointId: string; profile: DemoProfile; onSendSelection?: (text: string) => void;
}) {
  const [session, show] = useState<ReturnType<typeof createPadDraftSession> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let closed = false, current: ReturnType<typeof createPadDraftSession> | undefined;
    const valid = () => !closed && getMode() === 'demo' && getDemoProfile() === profile;
    void fixtureCheckpointId(profile, checkpointId).then(async id => {
      const bound = bindFixturePadDraft(() => valid() ? {ownerId: FIXTURE_OWNER, checkpointId: id, generation: 0} : null);
      if (!bound) return;
      current = createPadDraftSession(bound);
      await current.load();
      if (valid()) show(current);
    }).catch(() => {if (valid()) setFailed(true);});
    return () => {closed = true; current?.close();};
  }, [profile, checkpointId]);

  if (!session) return <p role="status">{failed ? 'Could not open the demo Pad.' : 'Opening local demo Pad…'}</p>;
  return <LocalPadDraftPanel session={session} onSendSelection={onSendSelection}
    keyboardPreferenceKey={'lemma.pad-keyboard.fixture:' + profile + ':' + checkpointId}/>;
}
