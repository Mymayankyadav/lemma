export type DataMode = 'live' | 'demo'
export type DemoProfile = 'default' | 'stress' | 'extreme'
const DEMO_KEY = 'lemma.demo'
/** Explicit demo=0 exits demo; demo=1 selects the small fixed fixture. */
export function getDemoProfile(): DemoProfile {
 if (typeof window === 'undefined') return 'default'
 const query = new URLSearchParams(window.location.search).get('demo')
 const profile = query === 'stress' || query === 'extreme' ? query : 'default'
 try {
  if (query === '0') { sessionStorage.removeItem(DEMO_KEY); return 'default' }
  if (query === '1' || query === 'stress' || query === 'extreme') {
   sessionStorage.setItem(DEMO_KEY, query)
   return profile
  }
  const remembered = sessionStorage.getItem(DEMO_KEY)
  return remembered === 'stress' || remembered === 'extreme' ? remembered : 'default'
 } catch { return profile }
}
/** Remember the chosen demo profile only for this browser tab. */
export function getMode(): DataMode {
 if (typeof window === 'undefined') return 'live'
 const query = new URLSearchParams(window.location.search).get('demo')
 try {
  if (query === '0') { sessionStorage.removeItem(DEMO_KEY); return 'live' }
  if (query === '1' || query === 'stress' || query === 'extreme') {
   sessionStorage.setItem(DEMO_KEY, query)
   return 'demo'
  }
  return sessionStorage.getItem(DEMO_KEY) ? 'demo' : 'live'
 } catch { return query === '1' || query === 'stress' || query === 'extreme' ? 'demo' : 'live' }
}
