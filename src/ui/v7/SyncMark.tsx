import {useIsFetching, useIsMutating} from '@tanstack/react-query';
import {EllMark} from './marks';
import {useOnline} from './savedCopy';

/**
 * N157 · AN3 "Offline made visible", second half (v7 UX audit r3, `03` §4): the header ℓ is the sync light. Steady when
 * everything on screen is the server's, a ring while Lemma is fetching or saving, hollow when the device is offline
 * (the "as of" chips of N151 then date the numbers). Only going offline is announced; a fetch is not news.
 */
export type SyncState = 'synced' | 'syncing' | 'offline';
export function syncState(online: boolean, fetching: number, saving: number): SyncState {
  if (!online) return 'offline';
  return fetching + saving > 0 ? 'syncing' : 'synced';
}
const LABEL: Record<SyncState, string> = {
  synced: 'Up to date',
  syncing: 'Syncing',
  offline: 'Offline: working from your notebook',
};
export function SyncMark({size = 18}: {size?: number}) {
  const state = syncState(useOnline(), useIsFetching(), useIsMutating());
  return <span className="v7-hub-mark v7-sync-mark" data-sync={state} title={LABEL[state]}>
    <EllMark size={size}/>
    <span className="v7-sr-only" role="status">{state === 'offline' ? LABEL.offline : ''}</span>
  </span>;
}
