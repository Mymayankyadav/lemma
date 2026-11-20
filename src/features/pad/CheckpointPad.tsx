import {lazy, Suspense, useState, useSyncExternalStore, type ReactNode} from 'react';
import {Link} from 'react-router';
import {authGeneration, onAccountChange} from '../../data/authBoundary';
import {getDemoProfile, getMode, type DemoProfile} from '../../data/mode';
import type {CheckpointDetail} from '../../data/types';
import {isFlagOn} from '../../flags';
import {Button} from '../../ui/v7/components';
import {CheckpointTutor} from '../tutor/DemoCheckpointTutor';
import {currentPadScope} from './padCheckpoint';
import {usePadRelease} from './usePadRelease';
import type {AuthorizedPadScope} from './padDraftStore';

const FixtureCheckpointPad = lazy(() => import('./FixtureCheckpointPad'));
const LiveCheckpointPad = lazy(() => import('./LiveCheckpointPad'));

type Binding = {profile: DemoProfile; scope?: never} | {scope: AuthorizedPadScope; profile?: never};
type Handoff = {text: string; requestId: string};
type Tutor = (props: {handoff?: Handoff; onHandoffConsumed: (id: string) => void}) => ReactNode;
type Props = {slug: string; code: string; detail: CheckpointDetail; renderTutor?: Tutor; fullPage?: boolean};

export default function CheckpointPad({slug, code, detail, renderTutor, fullPage = false}: Props) {
  useSyncExternalStore(onAccountChange, authGeneration);
  const {released} = usePadRelease();
  const id = detail.view.id;
  if (detail.view.code !== code) return null;
  const tutorEnabled = isFlagOn(getMode() === 'demo' ? 'tutorManualDemo' : 'tutorThreads');
  const tutor: Tutor | undefined = renderTutor ?? (tutorEnabled ? props => <CheckpointTutor
    scope={{pathId: slug, checkpointId: id, title: detail.view.title, objective: detail.objective,
      sourceShort: detail.sourceShort, linkedSessions: detail.sessions.filter(session => session.display !== 'ended'),
      authScope: detail.authScope}} {...props}/> : undefined);
  // The canonical receiver retains owner-only history during a release hold.
  // The local editor and its selection action still need current Pad authority.
  const recovery = () => tutor?.({onHandoffConsumed: () => undefined}) ?? null;
  if (!released) return recovery();
  if (getMode() === 'demo') {
    const profile = getDemoProfile();
    return <PadEntry key={JSON.stringify([profile, slug, code, id])} binding={{profile}} slug={slug} code={code}
      checkpointId={id} renderTutor={tutor} fullPage={fullPage}/>;
  }
  const scope = currentPadScope(detail.authScope);
  if (!scope || scope.checkpointId !== id) return recovery();
  return <PadEntry key={JSON.stringify([scope.ownerId, scope.generation, slug, code, id])}
    binding={{scope}} slug={slug} code={code} checkpointId={id} renderTutor={tutor} fullPage={fullPage}/>;
}

function PadEntry({binding, checkpointId, slug, code, renderTutor, fullPage}: {
  binding: Binding; checkpointId: string; slug: string; code: string; renderTutor?: Tutor; fullPage: boolean;
}) {
  const [visibility, setVisibility] = useState<'closed' | 'open' | 'hidden'>(fullPage ? 'open' : 'closed');
  const [handoff, setHandoff] = useState<Handoff>();
  const send = renderTutor ? (text: string) => setHandoff({text, requestId: crypto.randomUUID()}) : undefined;
  return <><section className="v7-learn-card local-pad-entry" aria-label="Local Pad" data-pad-open={visibility === 'open'}>
    {!fullPage && <><Link to={'/pad?path=' + encodeURIComponent(slug) + '&checkpoint=' + encodeURIComponent(code)}>
      Open full Pad page
    </Link><Button aria-expanded={visibility === 'open'}
      onClick={() => setVisibility(current => current === 'open' ? 'hidden' : 'open')}>
      {visibility === 'open' ? 'Put away Local Pad' : 'Open Local Pad'}
    </Button></>}
    {visibility !== 'closed' && <div hidden={visibility !== 'open'}>
      <Suspense fallback={<p role="status">Opening local Pad…</p>}>
        {binding.scope
          ? <LiveCheckpointPad scope={binding.scope} checkpoint={{slug, code}} onSendSelection={send}/>
          : <FixtureCheckpointPad checkpointId={checkpointId} profile={binding.profile} onSendSelection={send}/>}
      </Suspense>
    </div>}
  </section>{renderTutor?.({handoff, onHandoffConsumed: id => setHandoff(current => current?.requestId === id ? undefined : current)})}</>;
}
