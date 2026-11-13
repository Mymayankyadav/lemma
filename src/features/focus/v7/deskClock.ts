import {useEffect, useState} from 'react';

/** N157 · U4 S16: the phone in landscape (a short window held sideways) shows the desk clock without a tap. */
export const DESK_QUERY = '(orientation: landscape) and (max-height: 500px)';

export function useDeskLandscape() {
  const [matches, setMatches] = useState(() => typeof matchMedia === 'function' && matchMedia(DESK_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia(DESK_QUERY), change = () => setMatches(media.matches);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return matches;
}

type Sentinel = {release(): Promise<void>; addEventListener?(type: 'release', listener: () => void): void};
type WakeLockNavigator = Navigator & {wakeLock?: {request(type: 'screen'): Promise<Sentinel>}};

/** Keep the screen awake while `active` (a running session on the desk clock); released on pause, finish, or when the
 *  page hides, and asked for again when it shows. Without the Screen Wake Lock API this does nothing. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (navigator as WakeLockNavigator).wakeLock;
    if (!active || !api) return;
    let sentinel: Sentinel | null = null, live = true;
    const request = () => {
      if (document.visibilityState !== 'visible' || sentinel) return;
      void api.request('screen').then(lock => {
        if (!live) {void lock.release(); return;}
        sentinel = lock; lock.addEventListener?.('release', () => {sentinel = null;});
      }).catch(() => {/* refused (battery saver, no user gesture): the clock still runs */});
    };
    const visibility = () => {if (document.visibilityState === 'visible') request(); else {void sentinel?.release(); sentinel = null;}};
    request();
    document.addEventListener('visibilitychange', visibility);
    return () => {live = false; document.removeEventListener('visibilitychange', visibility); void sentinel?.release(); sentinel = null;};
  }, [active]);
}
