import { getMode } from '../data/mode'
export default function DemoChip() {
 return getMode() === 'demo' ? <span className="fixed top-2 left-3 z-30 rounded-chip border border-amber-line bg-amber-tint px-2 py-0.5 text-xs text-amber">Demo</span> : null
}
