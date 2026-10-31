import type {DataMode} from '../data/mode';

/** The demo adapter keeps all changes in memory, so persistence warnings do not apply. */
export const OFFLINE_READY_MESSAGE='Lemma is ready to open offline. Changes still require a connection to save.';
export function offlineReadyNotice(mode:DataMode):string|null {
 return mode==='live'?OFFLINE_READY_MESSAGE:null;
}
