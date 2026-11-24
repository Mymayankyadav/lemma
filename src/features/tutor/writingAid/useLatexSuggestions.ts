import {useCallback, useEffect, useRef, useState} from 'react';
import {loadLatexModel} from './decoder/kn';
import {latexSuggestions, type LatexSuggestion, type LatexSuggestionOptions} from './latexGrammar';
import type {LatexQuery, LatexWorkerReply, LatexWorkerRequest} from './decoder/latex.worker';

export function useLatexSuggestions(query: LatexQuery | undefined, limit: number, options: LatexSuggestionOptions = {}) {
  const enabled = query !== undefined;
  const serialized = query ? JSON.stringify(query) : '';
  const worker = useRef<Worker | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sent = useRef<{id: number; serialized: string}>({id: 0, serialized: ''});
  const [fallback, setFallback] = useState(false);
  const [results, setResults] = useState<{id: number; serialized: string; items: readonly LatexSuggestion[]}>();
  const [, setFallbackRevision] = useState(0);

  const fail = useCallback((client: Worker) => {
    if (worker.current !== client) return;
    worker.current = undefined;
    clearTimeout(timer.current);
    client.terminate();
    setFallback(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let client: Worker;
    try {client = new Worker(new URL('./decoder/latex.worker.ts', import.meta.url), {type: 'module'});}
    catch {setFallback(true); return;}
    worker.current = client;
    setFallback(false);
    client.onmessage = ({data}: MessageEvent<LatexWorkerReply>) => {
      if (sent.current.id === data.id && worker.current === client) {
        clearTimeout(timer.current);
        setResults({...sent.current, items: data.results});
      }
    };
    client.onerror = () => fail(client);
    client.onmessageerror = () => fail(client);
    return () => {
      clearTimeout(timer.current);
      worker.current = undefined;
      client.terminate();
    };
  }, [enabled, fail]);
  useEffect(() => {
    if (!enabled || !fallback) return;
    let active = true;
    void loadLatexModel().then(() => {if (active) setFallbackRevision(revision => revision + 1);});
    return () => {active = false;};
  }, [enabled, fallback]);
  useEffect(() => {
    const client = worker.current;
    if (!serialized || !client) return;
    const id = sent.current.id + 1;
    sent.current = {id, serialized};
    const request: LatexWorkerRequest = {id, query: JSON.parse(serialized)};
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fail(client), 18_000);
    try {client.postMessage(request);}
    catch {fail(client);}
  }, [serialized, fail]);
  if (!query) return [];
  const items = results?.serialized === serialized ? results.items : [];
  return latexSuggestions(query.math, query.typed, query.before, limit, {...query, ...options,
    modelCandidates: items.length || !fallback ? items : undefined});
}
