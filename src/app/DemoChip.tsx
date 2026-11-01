import { getMode } from '../data/mode'

/** Ordinary pages scroll the indicator away with their content. Atlas has a
 * separate, non-scrolling header with reserved clearance for its indicator. */
export default function DemoChip({floating=false}:{floating?:boolean}) {
 if(getMode()!=='demo')return null
 return <span className={(floating
  ? 'fixed top-2 left-3 z-30 '
  : 'absolute top-[calc(env(safe-area-inset-top)+4px)] left-3 z-10 ')+
  'rounded-chip border border-amber-line bg-amber-tint px-2 py-0.5 text-xs text-amber'}>Demo</span>
}
