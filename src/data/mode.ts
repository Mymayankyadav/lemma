export type DataMode = 'live' | 'demo'
const DEMO_KEY = 'lemma.demo'
/** Remember demo=1 for this tab; a later explicit demo=0 returns to live. */
export function getMode(): DataMode {
 if (typeof window === 'undefined') return 'live'
 const demo = new URLSearchParams(window.location.search).get('demo')
 try {
  if (demo === '1') { window.sessionStorage.setItem(DEMO_KEY, '1'); return 'demo' }
  if (demo === '0') { window.sessionStorage.removeItem(DEMO_KEY); return 'live' }
  return window.sessionStorage.getItem(DEMO_KEY) === '1' ? 'demo' : 'live'
 } catch { return demo === '1' ? 'demo' : 'live' }
}
