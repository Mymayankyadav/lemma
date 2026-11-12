import type {SVGProps} from 'react';

/**
 * Release plan R0 · F08: drawn marks for the two glyphs that rendered as black rectangles (the ∎ text glyph read as a
 * missing-glyph box at icon size). Audit icon list I-14 and I-15, in the icon set's style: 24 px grid, 1.75 px stroke,
 * round caps and joins, `currentColor`. Sized by CSS like the lucide icons around them.
 */
type MarkProps=SVGProps<SVGSVGElement>&{size?:number};
const base=({size=24,...props}:MarkProps)=>({width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.75,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,...props});

/** I-14 Close the day: a crescent moon over a page. */
export function CloseDayMark(props:MarkProps){
 return <svg {...base(props)}><path d="M6 10.5V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7.5"/><path d="M9 15h6M9 18h4"/><path d="M15.2 3.2a4 4 0 1 0 4.6 4.6 3.2 3.2 0 0 1-4.6-4.6Z"/></svg>;
}
/** I-15 Inbox zero: an empty tray with a check above it. */
export function InboxZeroMark(props:MarkProps){
 return <svg {...base(props)}><path d="M3 13.5 5.4 19a1.6 1.6 0 0 0 1.5 1h10.2a1.6 1.6 0 0 0 1.5-1L21 13.5"/><path d="M3 13.5h5l1.2 2.3h5.6l1.2-2.3h5"/><path d="m8.5 7.2 2.4 2.4 4.6-5.1"/></svg>;
}
/** Every drawn mark, by key; the icon-resolution test walks this and the screens' icon tables. */
export const marks={'close-day':CloseDayMark,'inbox-zero':InboxZeroMark} as const;
