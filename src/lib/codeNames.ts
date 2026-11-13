/**
 * V18 (v7 UX audit r3): internal codes never reach the learner. The tutor writes "Same gap in S6 and S7" or "after CP4a";
 * the screens print names. A checkpoint code becomes its title when the path is known ("Compactness"), otherwise
 * "checkpoint 4a"; a session code becomes "session 6". Pure.
 */
const CHECKPOINT = /\bCP(\d+[a-z]?)\b/g;
const SESSION = /\bS(\d+)\b/g;

export function nameCodes(text: string, titles: ReadonlyMap<string, string> | ((code: string) => string | undefined) = new Map()): string {
  const title = typeof titles === 'function' ? titles : (code: string) => titles.get(code);
  return text
    .replace(CHECKPOINT, (code, number: string) => title(code) || 'checkpoint ' + number)
    .replace(SESSION, (_code, number: string) => 'session ' + number);
}
