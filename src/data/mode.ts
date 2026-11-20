export type DataMode = 'live' | 'demo'
export type DemoProfile = 'default' | 'stress' | 'extreme' | 'first-use'
/** The separately packaged acceptance build has a dedicated, local example account. */
export function getDemoProfile():DemoProfile{return 'default'}
export function getMode():DataMode{return 'demo'}
