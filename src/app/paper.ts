/**
 * G0 (v7 UX audit r3): the page colours `index.html` paints before the app loads (and its theme-color metas). They were
 * the v6 papers, so a v7 cold start (and the Android app) flashed a different paper and status bar. vite.config.ts
 * fills them in at build time from the build's v7 flag; a build without v7 keeps the legacy papers.
 */
export function prePaintPaper(v7: boolean): {day: string; night: string} {
  return v7 ? {day: '#F8F5F0', night: '#091023'} : {day: '#FAFAF6', night: '#13171D'};
}
