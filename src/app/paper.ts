/**
 * G0 (v7 UX audit r3): the page colours `index.html` paints before the app loads (and its theme-color metas). They were
 * the v6 papers, so a v7 cold start (and the Android app) flashed a different paper and status bar. vite.config.ts
 * fills them in at build time. Both shells now use the same owner-approved palette.
 */
export function prePaintPaper(v7: boolean): {day: string; night: string} {
  return v7 ? {day: '#FAF9F5', night: '#262624'} : {day: '#FAF9F5', night: '#262624'};
}
