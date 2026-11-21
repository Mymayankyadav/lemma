import {DetailHeader} from '../../app/v7/V7Shell';
import {Picker} from '../../ui/v7/components';
import {useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link, useLocation, useNavigate, useParams, useSearchParams} from 'react-router';
import {setShellRoot} from '../../app/shellRoot';
import {loadShellFonts} from '../../app/shellFonts';
import {authGeneration, authOwner, authSignedOut} from '../../data/authBoundary';
import {getApi, LemmaError, type CheckpointDetail} from '../../data';
import {useAuth} from '../../data/hooks';
import {getDemoProfile, getMode} from '../../data/mode';
import {isFlagOn} from '../../flags';
import {currentPadScope, devicePadSnapshot, findEligibleDevicePad, findRememberedPad, listEligibleDevicePads, subscribeDevicePad} from './padCheckpoint';
import {usePadRelease} from './usePadRelease';
import CheckpointPad from './CheckpointPad';
import LiveCheckpointPad from './LiveCheckpointPad';
import './local-pad.css';

type Selection = {slug: string; code: string; checkpointId?: string};
const validPart = (value: string | null): value is string => !!value && value.length <= 180;
const padAddress = (slug: string, code?: string) => '/pad?' + new URLSearchParams({path: slug, ...(code ? {checkpoint: code} : {})});

/** The page stays outside AuthGate so a previously authorized installed Pad can
 * cold-open offline. Online selections always pass the normal owner API first. */
export default function OfflinePadPage() {
  useSyncExternalStore(subscribeDevicePad, devicePadSnapshot);
  const v7 = isFlagOn('v7Shell');
  useLayoutEffect(() => {
    if (!v7) return;
    setShellRoot('v7');
    loadShellFonts(true);
    return () => setShellRoot('legacy');
  }, [v7]);
  const location = useLocation(), navigate = useNavigate();
  const online = navigator.onLine, demo = getMode() === 'demo';
  // Do not replace a cold-offline working copy merely because connectivity returns.
  const [onlineVisit, setOnlineVisit] = useState(online);
  const [initialLocation] = useState(location.key);
  useEffect(() => {
    if (location.key !== initialLocation && location.state?.padLoadOnline === true) setOnlineVisit(true);
  }, [initialLocation, location]);
  function loadOnline() {
    const search = new URLSearchParams(location.search);
    // A real route change lets the working draft's save/discard guard run first.
    // Toggle the marker so a cold reopen of this URL still changes the address.
    search.set('online', search.get('online') === '1' ? '2' : '1');
    void navigate({pathname: location.pathname, search: '?' + search}, {state: {padLoadOnline: true}});
  }
  return <main id="main-content" className={v7 ? 'v7-page local-pad-page' : 'local-pad-page'} data-offline={!online} aria-label="Device Pad">
    {v7 && <DetailHeader title="Lemma Pad" back="/settings?section=data"/>}
    <header className="local-pad-page-header"><div><p className="local-pad-eyebrow">Your working space</p><h1>Lemma Pad</h1></div>
      {!v7 && <Link to="/">Return to Lemma</Link>}</header>
    <p>Notes and ink for a checkpoint. Saved on this device.</p>
    {demo ? <AuthorizedPage key={'demo:' + getDemoProfile()} demo online={online}/> : onlineVisit
      ? <OnlineOwner online={online}/>
      : <><OfflineLibrary/>{online && <div className="local-pad-controls"><p>Save or export your current work before loading online checkpoints.</p>
          <button type="button" onClick={loadOnline}>Load online checkpoints</button></div>}</>}
  </main>;
}

function OnlineOwner({online}: {online: boolean}) {
  const auth = useAuth(), location = useLocation();
  if (auth.isPending) return <p role="status">Checking sign-in…</p>;
  if (!auth.data) return <section className="local-pad" aria-label="Pad sign-in">
    <p role={auth.isError ? 'alert' : 'status'}>{auth.isError ? 'Could not check sign-in. Your saved Pads are unchanged.' : 'Sign in to choose a checkpoint for Lemma Pad.'}</p>
    {auth.isError ? <div className="local-pad-controls"><button type="button" onClick={() => void auth.refetch()}>Try sign-in again</button></div>
      : <Link to="/sign-in" state={{from: location.pathname + location.search}}>Sign in</Link>}
    {!online && <OfflineLibrary/>}
  </section>;
  return <AuthorizedPage key={authOwner() + ':' + authGeneration()} demo={false} online={online}/>;
}

function selectionFromRoute(checkpointId: string | undefined, search: URLSearchParams, demo: boolean): Selection | null {
  const slug = search.get('path'), code = search.get('checkpoint');
  if (validPart(slug) && validPart(code)) return {slug, code, checkpointId};
  if (demo || slug || code) return null;
  const remembered = findRememberedPad(checkpointId);
  return remembered ? {...remembered} : null;
}

/** Every async result is bound to the mode, owner and generation that requested it. */
async function currentRead<T>(read: () => Promise<T>, owner: string | null, generation: number, demo: boolean): Promise<T> {
  const valid = () => (getMode() === 'demo') === demo && (demo || (authOwner() === owner && authGeneration() === generation));
  if (!valid()) throw new LemmaError('auth', 'The account changed. Reopen Pad.');
  const result = await read();
  if (!valid()) throw new LemmaError('auth', 'The account changed. Reopen Pad.');
  return result;
}

function AuthorizedPage({demo, online}: {demo: boolean; online: boolean}) {
  const {checkpointId} = useParams(), [search] = useSearchParams();
  const owner = authOwner(), generation = authGeneration();
  const {released, decision} = usePadRelease();
  const selection = selectionFromRoute(checkpointId, search, demo);
  const candidateSlug = search.get('path') ?? selection?.slug ?? '';
  const slug = validPart(candidateSlug) ? candidateSlug : '';
  if (!released) return <p role="status">{decision === false ? 'Local Pad is currently unavailable.' : 'Checking Local Pad availability…'}</p>;
  return <>
    {online || demo ? <CheckpointPicker key={demo ? getDemoProfile() : owner + ':' + generation}
      slug={slug} selectedCode={selection?.code} demo={demo} online={online} owner={owner} generation={generation}/>
      : <CachedPadPicker/>}
    {selection ? <SelectedPad key={JSON.stringify([demo ? getDemoProfile() : owner, generation, selection.slug, selection.code, selection.checkpointId])}
      selection={selection} demo={demo} online={online} owner={owner} generation={generation}/>
      : checkpointId || search.has('checkpoint') ? <p role="status">This checkpoint Pad is unavailable. Choose a checkpoint you can access.</p>
        : <p role="status">Choose a path and checkpoint to open its Pad.</p>}
  </>;
}

function CheckpointPicker({slug, selectedCode, demo, online, owner, generation}: {
  slug: string; selectedCode?: string; demo: boolean; online: boolean; owner: string | null; generation: number;
}) {
  const navigate = useNavigate();
  const identity = demo ? getDemoProfile() : owner;
  const projects = useQuery({queryKey: ['pad-projects', identity, generation], enabled: demo || online,
    networkMode: demo ? 'always' : 'online', retry: false,
    queryFn: () => currentRead(() => getApi().listProjects(), owner, generation, demo)});
  const project = useQuery({queryKey: ['pad-project', identity, generation, slug], enabled: !!slug && (demo || online),
    networkMode: demo ? 'always' : 'online', retry: false,
    queryFn: () => currentRead(() => getApi().getProject(slug), owner, generation, demo)});
  const paths = (projects.data ?? []).filter(path => !path.system && path.status !== 'archived');
  const checkpoints = (project.data?.checkpoints ?? []).filter(checkpoint => checkpoint.ui !== 'proposed' && !checkpoint.id.startsWith('proposed:'));
  const v7 = isFlagOn('v7Shell');
  const pathLabel = (path: (typeof paths)[number]) => paths.some(other => other.id !== path.id && other.title === path.title)
    ? path.title + ' · ' + path.slug : path.title;
  const checkpointLabel = (checkpoint: (typeof checkpoints)[number]) => checkpoint.code + ' · ' + checkpoint.title;
  return <section className="local-pad-chooser" aria-label="Choose a Pad checkpoint">
    <h2>Your checkpoints</h2>
    {projects.isPending ? <p role="status">Loading your paths…</p> : projects.isError && !projects.data
      ? <><p role="alert">Could not load your paths.</p><button type="button" onClick={() => void projects.refetch()}>Try paths again</button></>
      : paths.length === 0 ? <><p role="status">No checkpoints yet. Create a path and approve its plan to start a Pad.</p><Link to="/projects">Open Paths</Link></>
        : v7 ? <Picker label="Path" value={paths.map(pathLabel)[paths.findIndex(path=>path.slug===slug)]??'Choose a path'}
          options={paths.map(pathLabel)} onChange={label=>{const path=paths.find(candidate=>pathLabel(candidate)===label);if(path)navigate(padAddress(path.slug));}}/>
          : <><label htmlFor="pad-path">Path</label><select id="pad-path" value={slug}
            onChange={event => navigate(event.currentTarget.value ? padAddress(event.currentTarget.value) : '/pad')}>
            <option value="">Choose a path</option>
            {paths.map(path => <option key={path.id} value={path.slug}>{path.title}</option>)}
          </select></>}
    {slug && <>{project.isPending ? <p role="status">Loading checkpoints…</p> : project.isError && !project.data
      ? <><p role="alert">Could not load this path's checkpoints.</p><button type="button" onClick={() => void project.refetch()}>Try checkpoints again</button></>
      : checkpoints.length === 0 ? <p role="status">This path has no approved checkpoints yet.</p>
        : v7 ? <Picker label="Checkpoint" value={checkpoints.map(checkpointLabel)[checkpoints.findIndex(cp=>cp.code===selectedCode)]??'Choose a checkpoint'}
          options={checkpoints.map(checkpointLabel)} onChange={label=>{const cp=checkpoints.find(candidate=>checkpointLabel(candidate)===label);if(cp)navigate(padAddress(slug,cp.code));}}/>
          : <><label htmlFor="pad-checkpoint">Checkpoint</label><select id="pad-checkpoint" value={selectedCode ?? ''}
            onChange={event => navigate(padAddress(slug, event.currentTarget.value))}>
            <option value="">Choose a checkpoint</option>
            {checkpoints.map(checkpoint => <option key={checkpoint.id} value={checkpoint.code}>{checkpointLabel(checkpoint)}</option>)}
          </select></>}</>}
  </section>;
}

function SelectedPad({selection, demo, online, owner, generation}: {
  selection: Selection; demo: boolean; online: boolean; owner: string | null; generation: number;
}) {
  const {slug, code, checkpointId} = selection;
  const saved = findEligibleDevicePad(checkpointId);
  const matchingSaved = saved?.slug === slug && saved.code === code ? saved
    : !checkpointId ? listEligibleDevicePads().find(pad => pad.slug === slug && pad.code === code) : undefined;
  const [deviceOnly] = useState(!online && !demo && !!matchingSaved);
  const result = useQuery({queryKey: ['pad-checkpoint', demo ? getDemoProfile() : owner, generation, slug, code, checkpointId ?? null],
    enabled: !deviceOnly && (demo || online), networkMode: demo ? 'always' : 'online', retry: false,
    queryFn: () => currentRead(async () => {
      const detail = await getApi().getCheckpoint(slug, code);
      if (!detail.view || detail.view.code !== code || (checkpointId && detail.view.id !== checkpointId)
          || (!demo && !currentPadScope(detail.authScope))) throw new LemmaError('auth', 'This checkpoint is no longer available.');
      return detail;
    }, owner, generation, demo)});
  if (deviceOnly && matchingSaved) return <DeviceWorkspace pad={matchingSaved} generation={generation}/>;
  // Background network errors must not discard an already authorized working draft.
  // A confirmed owner/not-found response, unlike a transport failure, closes access.
  const revoked = result.error instanceof LemmaError && ['auth', 'not_found'].includes(result.error.code);
  const candidate = result.data;
  const detail: CheckpointDetail | undefined = !revoked && candidate?.view.code === code
    && (!checkpointId || candidate.view.id === checkpointId) && (demo || currentPadScope(candidate.authScope)) ? candidate : undefined;
  if (detail) return <section className="local-pad" aria-label="Selected checkpoint Pad">
    <h2>{detail.view.code} · {detail.view.title}</h2>
    <Link to={'/p/' + encodeURIComponent(slug) + '/cp/' + encodeURIComponent(code)}>Return to checkpoint</Link>
    <CheckpointPad fullPage slug={slug} code={code} detail={detail}/>
  </section>;
  if (result.isError) return <section className="local-pad"><p role="alert">Could not open this checkpoint. Your saved Pads are unchanged.</p>
    <div className="local-pad-controls"><button type="button" onClick={() => void result.refetch()}>Try opening checkpoint again</button></div></section>;
  return <p role="status">{online || demo ? 'Opening checkpoint…' : 'This checkpoint was not opened on this device. Connect to authorize it first.'}</p>;
}

function CachedPadPicker() {
  const pads = listEligibleDevicePads();
  return pads.length > 0 ? <nav className="local-pad-cached" aria-label="Saved Pads on this device"><h2>Available on this device</h2>
    <ul>{pads.map(pad => <li key={pad.checkpointId}><Link to={'/pad/' + pad.checkpointId}>{pad.slug} · {pad.code}</Link></li>)}</ul>
  </nav> : null;
}

function OfflineLibrary() {
  const {checkpointId} = useParams(), [search] = useSearchParams();
  const slug = search.get('path'), code = search.get('checkpoint');
  const pad = slug || code ? listEligibleDevicePads().find(item => item.slug === slug && item.code === code && (!checkpointId || item.checkpointId === checkpointId))
    : findEligibleDevicePad(checkpointId);
  const generation = authGeneration();
  return <><CachedPadPicker/>{pad ? <DeviceWorkspace key={JSON.stringify([pad.ownerId, pad.sessionId, pad.checkpointId])}
    pad={pad} generation={generation}/> : <p role="status">While signed in, open your device notes in Settings to make them available offline.</p>}</>;
}

function ConnectedRelease({onDecision}: {onDecision: (open: boolean) => void}) {
  const {released, decision} = usePadRelease();
  useEffect(() => {if (released || decision === false) onDecision(released);}, [released, decision, onDecision]);
  return null;
}

function DeviceWorkspace({pad, generation}: {pad: NonNullable<ReturnType<typeof findEligibleDevicePad>>; generation: number}) {
  const {ownerId, sessionId, checkpointId} = pad;
  const [bindingGeneration] = useState(generation);
  const acceptedGeneration = useRef(generation);
  const mayBootstrap = useRef(authOwner() === null && !authSignedOut());
  const [permission, setPermission] = useState<boolean | null>(null);
  const [opened, setOpened] = useState(false);
  const online = navigator.onLine;
  const allowed = online ? permission === true || (opened && permission === null) : permission !== false;
  useEffect(() => {if (allowed) setOpened(true);}, [allowed]);
  const deviceAccess = useCallback(() => {
    const verified = findEligibleDevicePad(checkpointId);
    if (verified?.ownerId !== ownerId || verified.sessionId !== sessionId) return false;
    const current = authGeneration();
    if (current !== acceptedGeneration.current) {
      // A cold offline page has not initialized the SDK. Its one INITIAL_SESSION
      // hydration may establish the SAME owner and server session. This is not a
      // new sign-in: every later generation change still revokes the draft.
      if (!mayBootstrap.current || current !== acceptedGeneration.current + 1 || authOwner() !== ownerId) return false;
      mayBootstrap.current = false;
      acceptedGeneration.current = current;
    }
    return true;
  }, [ownerId, sessionId, checkpointId]);
  return <>
    {online && <ConnectedRelease onDecision={setPermission}/>}
    <h2>{pad.slug} · {pad.code}</h2>
    <Link to={'/p/' + encodeURIComponent(pad.slug) + '/cp/' + encodeURIComponent(pad.code)}>Return to checkpoint</Link>
    {allowed ? <LiveCheckpointPad scope={{ownerId, checkpointId, generation: bindingGeneration}} deviceAccess={deviceAccess}/>
      : <p role="status">{permission === false ? 'Local Pad is currently unavailable.' : 'Checking Local Pad availability…'}</p>}
  </>;
}
