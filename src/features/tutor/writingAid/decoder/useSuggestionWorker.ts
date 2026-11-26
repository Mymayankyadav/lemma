import {useEffect, useRef, useState} from 'react';
import type {TypeaheadArm} from '../replayArm';
import {createNgramClient, type NgramClient} from './ngramClient';

const IDLE_RELEASE_MS = 30_000;

/** One public dictionary per editable tutor. Closing the worker also releases its index and draft context. */
export function useSuggestionWorker(enabled: boolean, active: boolean, scope: string, expanded: boolean, arm?: TypeaheadArm) {
  const client = useRef<NgramClient | undefined>(undefined);
  const updateActivity = useRef<(() => void) | undefined>(undefined);
  const activeNow = useRef(active);
  activeNow.current = active;
  const [ready, setReady] = useState(false);
  const [foreground, setForeground] = useState(() => document.visibilityState !== 'hidden');

  useEffect(() => {
    setReady(false);
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = document.visibilityState !== 'hidden';
    function release() {
      clearTimeout(timer);
      const previous = client.current;
      client.current = undefined;
      previous?.cancel();
      previous?.close();
    }
    function sync() {
      clearTimeout(timer);
      if (!visible) return;
      if (!client.current) {
        const worker = createNgramClient();
        client.current = worker;
        void worker?.preload(expanded, arm).then(verified => {
          if (client.current === worker) setReady(verified);
        });
      }
      if (client.current && !activeNow.current) timer = setTimeout(() => {release(); setReady(false);}, IDLE_RELEASE_MS);
    }
    function hide() {
      visible = false;
      release();
      setReady(false);
      setForeground(false);
    }
    function visibilityChanged() {
      if (document.visibilityState === 'hidden') {hide(); return;}
      visible = true;
      sync();
      setForeground(true);
    }
    updateActivity.current = sync;
    visibilityChanged();
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibilityChanged);
    return () => {
      updateActivity.current = undefined;
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibilityChanged);
      release();
    };
  }, [enabled, scope, expanded, arm]);
  useEffect(() => {updateActivity.current?.();}, [active]);
  return {client, ready, foreground};
}
