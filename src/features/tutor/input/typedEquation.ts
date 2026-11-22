import type {PadEdit} from '../../pad/padEdit';
import {tutorMathContext} from './symbolEdit';

/** Names that stand for maths when typed in an equation (sin x), not for words. */
const NOTATION = new Set('sin cos tan sec csc cot sinh cosh tanh log ln exp lim max min sup inf det dim ker gcd lcm mod deg arg'.split(' '));
const MATH_CHUNK = /^[A-Za-z0-9.+\-−*×·/^_=<>≤≥≠()|]+$/u;
const OPERATOR = /[=<>≤≥≠+\-−*×·/^_]/u;

export type TypedEquation = {text: string; start: number; end: number; context: string};

/** A chunk between spaces belongs to an equation when its only letters are single variables or maths names. */
function mathChunk(chunk: string) {
  if (!MATH_CHUNK.test(chunk)) return false;
  return (chunk.match(/[A-Za-z]{2,}/g) ?? []).every(name => NOTATION.has(name.toLowerCase()));
}

/**
 * N223 (Owner: "Auto eq doesn't work in the chat box"): the equation the learner has just typed in prose, ending at the
 * caret (or one space before it): `x1 + x2 = 4` in "Let x1 + x2 = 4". It stops at the first word before it, needs a
 * sign or a variable with an index (x1) so plain prose and lone numbers are left alone, and ends on a term, not on a sign
 * still being typed. `context` is the line before it, which autoeq uses to rank its readings (a circle, a sequence).
 */
export function typedEquationAt(edit: PadEdit): TypedEquation | null {
  if (edit.start !== edit.end || tutorMathContext(edit) !== 'prose') return null;
  const caret = edit.end;
  const lineStart = edit.text.lastIndexOf('\n', caret - 1) + 1;
  const line = edit.text.slice(lineStart, caret).replace(/ $/u, '');
  if (!line || /\s$/u.test(line)) return null;
  const chunks = [...line.matchAll(/\S+/gu)];
  let first = chunks.length;
  while (first > 0 && mathChunk(chunks[first - 1][0])) first--;
  if (first === chunks.length) return null;
  // A lone article or pronoun before an equation is prose ("a", "I"), unless a sign follows it directly.
  while (first < chunks.length - 1 && /^[aAI]$/u.test(chunks[first][0]) && !OPERATOR.test(chunks[first + 1][0][0])) first++;
  const start = chunks[first].index!;
  const text = line.slice(start);
  if (!/[A-Za-z0-9)|]$/u.test(text)) return null;
  if (!OPERATOR.test(text) && !/[A-Za-z]\d/u.test(text)) return null;
  if (!/[A-Za-z0-9]/u.test(text.replace(/[A-Za-z]\d+$/u, '')) && !/[A-Za-z]\d/u.test(text)) return null;
  return {text, start: lineStart + start, end: lineStart + start + text.length, context: line.slice(0, start).trim()};
}
