import {useEffect, useId, useMemo, useRef, useState, type PointerEvent} from 'react';
import {renderPadMath} from '../LocalPadPreview';
import type {PadEdit} from '../padEdit';
import type {AutoeqReply} from './autoeq.worker';
import {
  autoeqInput, equationSelection, EQUATION_SELECTION_LIMIT, localEquationCandidates,
  modelEquationCandidates, type EquationCandidate, type EquationSelection,
} from './candidates';

interface Props {
  value: PadEdit;
  composing: boolean;
  keepSelection: (event: PointerEvent<HTMLButtonElement>) => void;
  syncSelection: () => void;
  onApply: (snapshot: PadEdit, selection: EquationSelection, candidate: EquationCandidate) => boolean;
}

type Result = {selection: EquationSelection; candidates: EquationCandidate[] | null};

export function EquationAssist({value, composing, keepSelection, syncSelection, onApply}: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result>();
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const panelId = useId();
  const {text, start, end, direction} = value;
  const selection = useMemo(() => open && !composing
    ? equationSelection({text, start, end, direction}) : null, [open, composing, text, start, end, direction]);
  const local = useMemo(() => selection ? localEquationCandidates(selection) : [], [selection]);
  const input = selection && !local.length ? autoeqInput(selection.text) : null;

  useEffect(() => () => {
    worker.current?.terminate();
    worker.current = null;
  }, []);

  useEffect(() => {
    if (!selection || !input) return;
    const id = ++requestId.current;
    let active: Worker | undefined;
    let timeout: number | undefined;
    function complete(candidates: Result['candidates']) {
      if (!selection) return;
      window.clearTimeout(timeout);
      setResult({selection, candidates});
    }
    function failed() {
      active?.terminate();
      if (worker.current === active) worker.current = null;
      complete(null);
    }
    function receive({data}: MessageEvent<AutoeqReply>) {
      if (data?.id !== id) return;
      complete(Array.isArray(data.latex) && data.latex.every(item => typeof item === 'string')
        ? modelEquationCandidates(input!, data.latex) : null);
    }

    // Native selection handles may move through several intermediate spans.
    const delay = window.setTimeout(() => {
      try {
        active = worker.current ??= new Worker(new URL('./autoeq.worker.ts', import.meta.url), {type:'module'});
        active.addEventListener('message', receive);
        active.addEventListener('error', failed);
        timeout = window.setTimeout(failed, 15000);
        active.postMessage({id, text:input});
      } catch {
        failed();
      }
    }, 120);
    return () => {
      window.clearTimeout(delay);
      window.clearTimeout(timeout);
      active?.removeEventListener('message', receive);
      active?.removeEventListener('error', failed);
      if (worker.current === active) active?.postMessage({id, text:''});
    };
  }, [selection, input]);

  const current = result?.selection === selection ? result : undefined;
  const candidates = useMemo(() => (local.length ? local : current?.candidates ?? []).flatMap(candidate => {
    const html = renderPadMath(candidate.latex);
    return html ? [{...candidate, html}] : [];
  }), [local, current]);
  let status = '';
  if (composing) status = 'Finish typing before converting a selection.';
  else if (start === end) status = 'Select text in your notes to convert it.';
  else if (!selection) status = 'Select one expression or declaration up to ' + EQUATION_SELECTION_LIMIT + ' characters.';
  else if (input && !current) status = 'Finding LaTeX candidates…';
  else if (current?.candidates === null) status = 'The local model is unavailable.';
  else if (!candidates.length) status = 'No LaTeX candidates for this selection.';

  return <div className="pad-equation-assist">
    <div className="local-pad-controls">
      <button type="button" aria-pressed={open} aria-controls={open ? panelId : undefined}
        onPointerDown={keepSelection} onClick={() => {
          syncSelection();
          setOpen(!open);
        }}>Equation Assist</button>
    </div>
    {open && <div id={panelId} role="group" aria-label="Equation Assist candidates">
      {status && <p role="status">{status}</p>}
      <div className="local-pad-controls pad-equation-candidates">
        {selection && candidates.map(candidate => <button key={candidate.label} type="button"
          onPointerDown={keepSelection} onClick={() => {
            if (onApply(value, selection, candidate)) setOpen(false);
          }}>
          <span>{candidate.label}</span>
          <span className="pad-equation-preview">{candidate.lead}
            <span dangerouslySetInnerHTML={{__html:candidate.html}}/>
          </span>
        </button>)}
      </div>
    </div>}
  </div>;
}
