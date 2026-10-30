export interface KeyHint{key:string;label:string}
export interface KeyHintsProps{items:KeyHint[]}
export function KeyHints({items}:KeyHintsProps){return <div aria-label="Keyboard shortcuts" className="hidden flex-wrap gap-3 text-label text-ink-3 md:flex">{items.map(item=><span key={item.key} className="flex items-center gap-1.5"><kbd className="rounded-s border border-edge-2 bg-well px-2 py-1 font-ui text-ink-2">{item.key}</kbd>{item.label}</span>)}</div>}
export default KeyHints;
