import {useEffect, useMemo, useRef, useState} from 'react';
import type {AutoeqReply} from '../../pad/equationAssist/autoeq.worker';
import {
  autoeqInput, equationCandidateKey, localEquationCandidates, modelEquationCandidates, type EquationCandidate,
} from '../../pad/equationAssist/candidates';
import {symbolByGlyph} from './symbolCatalog';

export type AutoeqReading = EquationCandidate;
export type AutoeqReadings = {readings: AutoeqReading[]; reading: boolean; unavailable: boolean};

const glyphTex: Readonly<Record<string, string>> = {
  '×': '\\times ', '÷': '\\div ', '−': '-', '·': '\\cdot ', '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '…': '\\dots ',
};

/**
 * N223 (Owner): the composition as written, as LaTeX: the symbols as their commands, √ over what follows it, the
 * learner's letters, digits and signs untouched. It is always offered, after autoeq's readings.
 */
export function compositionLatex(composition: string): string {
  const text = composition.trim().replace(/\s+/g, ' ');
  let latex = '';
  for (const char of text) {
    if (glyphTex[char]) latex += glyphTex[char];
    else if (char === '√') latex += '\\sqrt ';
    else if (/[\x20-\x7e]/.test(char)) latex += char;
    else {
      const tex = symbolByGlyph(char)?.tex;
      latex += tex ? tex + (/^\\[A-Za-z]+$/.test(tex) ? ' ' : '') : char;
    }
  }
  return latex.replace(/\\sqrt (\(([^()]*)\)|[A-Za-z0-9]+)/g, (_, whole: string, inner?: string) => '\\sqrt{' + (inner ?? whole) + '}')
    .replace(/\s+/g, ' ').replace(/ ?([=<>+]) ?/g, '$1').trim();
}

/**
 * N223 (Owner: "write x1 + y1 = 1 in the composer which will be later picked by auto eq"): what N222's Equation
 * Assist reads in a composition. Its local rules answer at once (x1 + y1 = 1 gives subscripts, powers and trailing
 * coefficients, ordered by the words before the caret); when they have nothing, its on-device autoeq model (4.2 MB,
 * Lemma's own verified files, the shared ONNX runtime) is asked in the same worker the Pad uses. The composition as
 * written always comes last.
 */
export function useAutoeqReadings(composition: string, context: string): AutoeqReadings {
  const text = composition.trim().replace(/\s+/g, ' ');
  const local = useMemo(() => text ? localEquationCandidates({text, context, start: 0, end: text.length, inMath: false}) : [],
    [text, context]);
  const input = text && !local.length ? autoeqInput(text) : null;
  const [model, setModel] = useState<{text: string; readings: AutoeqReading[] | null}>();
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => () => {worker.current?.terminate(); worker.current = null;}, []);
  useEffect(() => {
    if (!input) return;
    const id = ++requestId.current;
    let active: Worker | undefined;
    let timeout: number | undefined;
    const complete = (readings: AutoeqReading[] | null) => {window.clearTimeout(timeout); setModel({text: input, readings});};
    const failed = () => {
      active?.terminate();
      if (worker.current === active) worker.current = null;
      complete(null);
    };
    const receive = ({data}: MessageEvent<AutoeqReply>) => {
      if (data?.id !== id) return;
      complete(Array.isArray(data.latex) && data.latex.every(item => typeof item === 'string') ? modelEquationCandidates(input, data.latex) : null);
    };
    // Typing a composition passes through many partial texts; ask once it settles.
    const delay = window.setTimeout(() => {
      try {
        active = worker.current ??= new Worker(new URL('../../pad/equationAssist/autoeq.worker.ts', import.meta.url), {type: 'module'});
        active.addEventListener('message', receive);
        active.addEventListener('error', failed);
        timeout = window.setTimeout(failed, 15000);
        active.postMessage({id, text: input});
      } catch {
        failed();
      }
    }, 250);
    return () => {
      window.clearTimeout(delay);
      window.clearTimeout(timeout);
      active?.removeEventListener('message', receive);
      active?.removeEventListener('error', failed);
      if (worker.current === active) active?.postMessage({id, text: ''});
    };
  }, [input]);

  return useMemo(() => {
    if (!text) return {readings: [], reading: false, unavailable: false};
    const current = input && model?.text === input ? model : undefined;
    const found = local.length ? local : current?.readings ?? [];
    const seen = new Set(found.map(item => equationCandidateKey(item.latex)));
    const typed = compositionLatex(text);
    const asTyped = typed && !seen.has(equationCandidateKey(typed)) ? [{label: 'As written', latex: typed}] : [];
    return {readings: [...found.slice(0, 3), ...asTyped], reading: Boolean(input && !current), unavailable: current?.readings === null};
  }, [text, local, input, model]);
}
