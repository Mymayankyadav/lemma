import {useEffect, useState} from 'react';
import {flushSync} from 'react-dom';
import {durations,easings} from '../../../ui/v7/motion';

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

/** The clock switches on manual selection and rotation, with the same opacity-only fallback. */
export function turnDeskClock(clock:HTMLElement|null,update:()=>void,reduced:boolean){
 const root=document.documentElement;
 if(reduced||!clock||root.hasAttribute('data-v7-theme-turn')||root.hasAttribute('data-v7-focus-turn')){update();return;}
 if(typeof document.startViewTransition==='function'){
  root.setAttribute('data-v7-focus-turn','');
  try{
   const turn=document.startViewTransition(()=>flushSync(update));
   void turn.finished.catch(()=>undefined).finally(()=>root.removeAttribute('data-v7-focus-turn'));
   return;
  }catch{root.removeAttribute('data-v7-focus-turn');}
 }
 if(typeof clock.animate!=='function'){update();return;}
 const box=clock.getBoundingClientRect(),before=clock.closest<HTMLElement>('.v7-focus');
 const prior=document.createElement('div'),copy=clock.cloneNode(true) as HTMLElement;
 copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
 prior.inert=true;prior.setAttribute('aria-hidden','true');
 prior.className=(before?.className??'v7-focus')+' v7-focus-clock-exit';
 prior.toggleAttribute('data-desk',!!before?.hasAttribute('data-desk'));
 Object.assign(prior.style,{position:'fixed',display:'block',top:box.top+'px',left:box.left+'px',width:box.width+'px',height:box.height+'px',margin:'0',minHeight:'0',pointerEvents:'none'});
 prior.append(copy);document.body.append(prior);
 flushSync(update);
 const timing={duration:durations.base*1000,easing:`cubic-bezier(${easings.standard.join(',')})`};
 clock.animate([{opacity:0},{opacity:1}],timing);
 const exit=prior.animate([{opacity:1},{opacity:0}],{...timing,fill:'forwards'});
 void exit.finished.catch(()=>undefined).finally(()=>prior.remove());
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
