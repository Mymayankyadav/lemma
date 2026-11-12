import {useRef} from 'react';
import {staggerDelay} from './motion';

/**
 * A1 · list insert: which keys appeared after the list first rendered, with their stagger order. Items present at the
 * first render never animate (a screen does not "build itself" on load); later additions rise in, 30 ms apart, at most
 * six steps. Spread the result on the item: `{...enter(key)}` adds `data-v7-enter` and its delay. Removals are not
 * animated (the list never waits on an exit). Pass `ready` false while the list is still loading, so the first loaded
 * page counts as "already there". A new `scope` (another day, another view) starts over: its first list never animates.
 */
export type EnterMark = {'data-v7-enter'?: ''; style?: {animationDelay: string}};
export function useEnterMarks(keys: readonly string[], ready = true, scope = ''): (key: string) => EnterMark {
  const seen = useRef<Set<string> | null>(null);
  const fresh = useRef<Map<string, number>>(new Map());
  const scoped = useRef(scope);
  if (scoped.current !== scope) {
    scoped.current = scope;
    seen.current = null;
    fresh.current = new Map();
  }
  if (!ready && seen.current === null) {
    // Nothing is marked until the list has loaded once.
  } else if (seen.current === null) {
    seen.current = new Set(keys);
  } else {
    let order = 0;
    const next = new Map<string, number>();
    for (const key of keys) {
      if (fresh.current.has(key)) next.set(key, fresh.current.get(key)!);
      else if (!seen.current.has(key)) next.set(key, order++);
      seen.current.add(key);
    }
    fresh.current = next;
  }
  return key => {
    const index = fresh.current.get(key);
    return index === undefined ? {} : {'data-v7-enter': '', style: {animationDelay: Math.round(staggerDelay(index) * 1000) + 'ms'}};
  };
}
