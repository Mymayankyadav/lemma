/** A trailing TeX control word, excluding a double-backslash row separator. */
export function latexControlWordPrefix(before: string): string {
  return /(?:^|[^\\])(?:\\\\)*(\\[A-Za-z]*)$/u.exec(before)?.[1] ?? '';
}

/** End of the control word whose backslash and prefix are before the caret. */
export function latexCommandEnd(text: string, caret: number): number {
  return caret + (/^[A-Za-z]+/.exec(text.slice(caret))?.[0].length ?? 0);
}

/** Retain the learner's original separator when replacing a command around the caret. */
export function latexCommandInsertion(insert: string, caret: number, replacesTail: boolean) {
  if (!replacesTail || !insert.endsWith(' ')) return {insert, caret};
  return {insert: insert.slice(0, -1), caret: Math.min(caret, insert.length - 1)};
}
