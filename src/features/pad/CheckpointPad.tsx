import {lazy, Suspense, useState, useSyncExternalStore, type ReactNode} from 'react';
import {authGeneration, onAccountChange} from '../../data/authBoundary';
import {getDemoProfile, getMode, type DemoProfile} from '../../data/mode';
import type {CheckpointDetail} from '../../data/types';
import {Button} from '../../ui/v7/components';
import {currentPadScope} from './padCheckpoint';
import {usePadRelease} from './usePadRelease';
import type {AuthorizedPadScope} from './padDraftStore';

const FixtureCheckpointPad = lazy(() => import('./FixtureCheckpointPad'));
const LiveCheckpointPad = lazy(() => import('./LiveCheckpointPad'));

type Binding = {profile: DemoProfile; scope?: never} | {scope: AuthorizedPadScope; profile?: never};
type Handoff = {text: string; requestId: string};
type Tutor = (props: {handoff?: Handoff; onHandoffConsumed: (id: string) => void}) => ReactNode;
type Props = {slug: string; code: string; detail: CheckpointDetail; renderTutor?: Tutor};

export default function CheckpointPad({slug, code, detail, renderTutor}: Props) {
  useSyncExternalStore(onAccountChange, authGeneration);
  const {released} = usePadRelease();
  const id = detail.view.id;
  if (!released || detail.view.code !== code) return null;
  if (getMode() === 'demo') {
    const profile = getDemoProfile();
    return <PadEntry key={JSON.stringify([profile, slug, code, id])} binding={{profile}} slug={slug} code={code}
      checkpointId={id} renderTutor={renderTutor}/>;
  }
  const scope = currentPadScope(detail.authScope);
  if (!scope || scope.checkpointId !== id) return null;
  return <PadEntry key={JSON.stringify([scope.ownerId, scope.generation, slug, code, id])}
    binding={{scope}} slug={slug} code={code} checkpointId={id} renderTutor={renderTutor}/>;
}

function PadEntry({binding, checkpointId, slug, code, renderTutor}: {
  binding: Binding; checkpointId: string; slug: string; code: string; renderTutor?: Tutor;
}) {
  const [visibility, setVisibility] = useState<'closed' | 'open' | 'hidden'>('closed');
  const [handoff, setHandoff] = useState<Handoff>();
  const send = renderTutor ? (text: string) => setHandoff({text, requestId: crypto.randomUUID()}) : undefined;
  return <><section className="v7-learn-card" aria-label="Local Pad">
    <Button aria-expanded={visibility === 'open'}
      onClick={() => setVisibility(current => current === 'open' ? 'hidden' : 'open')}>
      {visibility === 'open' ? 'Put away Local Pad' : 'Open Local Pad'}
    </Button>
    {visibility !== 'closed' && <div hidden={visibility !== 'open'}>
      <Suspense fallback={<p role="status">Opening local Pad…</p>}>
        {binding.scope
          ? <LiveCheckpointPad scope={binding.scope} checkpoint={{slug, code}} onSendSelection={send}/>
          : <FixtureCheckpointPad checkpointId={checkpointId} profile={binding.profile} onSendSelection={send}/>}
      </Suspense>
    </div>}
  </section>{renderTutor?.({handoff, onHandoffConsumed: id => setHandoff(current => current?.requestId === id ? undefined : current)})}</>;
}
