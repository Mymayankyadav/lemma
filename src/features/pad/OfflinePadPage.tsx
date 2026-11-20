import {useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore} from 'react';
import {Link, useParams} from 'react-router';
import {setShellRoot} from '../../app/shellRoot';
import {authGeneration} from '../../data/authBoundary';
import {devicePadSnapshot, findEligibleDevicePad, subscribeDevicePad} from './padCheckpoint';
import {usePadRelease} from './usePadRelease';
import LiveCheckpointPad from './LiveCheckpointPad';
import './local-pad.css';

function ConnectedRelease({onDecision}: {onDecision: (open: boolean) => void}) {
  const {released, decision} = usePadRelease();
  useEffect(() => {if (released || decision === false) onDecision(released);}, [released, decision, onDecision]);
  return null;
}

/** Installed assets, a verified checkpoint and the same previously released build
 * and sign-in can reopen local work during an outage without refreshing a token. */
export default function OfflinePadPage() {
  const {checkpointId} = useParams();
  useSyncExternalStore(subscribeDevicePad, devicePadSnapshot);
  useLayoutEffect(() => {setShellRoot('v7'); return () => setShellRoot('legacy');}, []);
  const pad = findEligibleDevicePad(checkpointId);
  const generation = authGeneration();
  return <main id="main-content" className="local-pad-page" data-offline={!navigator.onLine} aria-label="Device Pad">
    <h1>Local Pad</h1>
    {pad ? <DeviceWorkspace key={JSON.stringify([pad.ownerId, pad.sessionId, pad.checkpointId, generation])}
      pad={pad} generation={generation}/> : <>
      <p role="status">Open Local Pad from a checkpoint while signed in to use it here.</p>
      <Link to="/">Return to Lemma</Link>
    </>}
  </main>;
}

function DeviceWorkspace({pad, generation}: {pad: NonNullable<ReturnType<typeof findEligibleDevicePad>>; generation: number}) {
  const {ownerId, sessionId, checkpointId} = pad;
  const [permission, setPermission] = useState<boolean | null>(null);
  const [opened, setOpened] = useState(false);
  const online = navigator.onLine;
  const allowed = online ? permission === true || (opened && permission === null) : permission !== false;
  useEffect(() => {if (allowed) setOpened(true);}, [allowed]);
  const deviceAccess = useCallback(() => {
    const verified = findEligibleDevicePad(checkpointId);
    return verified?.ownerId === ownerId && verified.sessionId === sessionId && generation === authGeneration();
  }, [ownerId, sessionId, checkpointId, generation]);
  return <>
    {online && <ConnectedRelease onDecision={setPermission}/>}
    <Link to={'/p/' + encodeURIComponent(pad.slug) + '/cp/' + encodeURIComponent(pad.code)}>Return to checkpoint</Link>
    {allowed ? <LiveCheckpointPad scope={{ownerId, checkpointId, generation}} deviceAccess={deviceAccess}/>
      : <p role="status">{permission === false ? 'Local Pad is currently unavailable.' : 'Checking Local Pad availability…'}</p>}
  </>;
}
