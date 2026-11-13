import type {SVGProps} from 'react';

/**
 * Release plan R0 · F08: drawn marks for the two glyphs that rendered as black rectangles (the ∎ text glyph read as a
 * missing-glyph box at icon size). Audit icon list I-14 and I-15, in the icon set's style: 24 px grid, 1.75 px stroke,
 * round caps and joins, `currentColor`. Sized by CSS like the lucide icons around them.
 */
type MarkProps=SVGProps<SVGSVGElement>&{size?:number};
// N156 (IC2, IC3): `v7-mark` keeps the line 1.75 px at any size, like every lucide icon (kit-system.css).
const base=({size=24,className,...props}:MarkProps)=>({width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.75,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,
 className:'v7-mark'+(className?' '+className:''),...props});

/** I-14 Close the day: a crescent moon over a page. */
export function CloseDayMark(props:MarkProps){
 return <svg {...base(props)}><path d="M6 10.5V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7.5"/><path d="M9 15h6M9 18h4"/><path d="M15.2 3.2a4 4 0 1 0 4.6 4.6 3.2 3.2 0 0 1-4.6-4.6Z"/></svg>;
}
/** I-15 Inbox zero: an empty tray with a check above it. */
export function InboxZeroMark(props:MarkProps){
 return <svg {...base(props)}><path d="M3 13.5 5.4 19a1.6 1.6 0 0 0 1.5 1h10.2a1.6 1.6 0 0 0 1.5-1L21 13.5"/><path d="M3 13.5h5l1.2 2.3h5.6l1.2-2.3h5"/><path d="m8.5 7.2 2.4 2.4 4.6-5.1"/></svg>;
}
/**
 * N156 · v7 UX audit r3, P6 (IC1, IC5; Owner decision E21): six drawn marks, so each meaning has its own glyph. Same grid
 * and line as the two above.
 */
/** A single card (Cards in Search, a card in Capture). `Layers`, a stack, now means only Review. */
export function CardMark(props:MarkProps){
 return <svg {...base(props)}><rect x="3.5" y="6" width="17" height="12.5" rx="2"/><path d="M7.5 10.5h9M7.5 14h6"/></svg>;
}
/** Practice: a problem, ∫ on a card. */
export function PracticeMark(props:MarkProps){
 return <svg {...base(props)}><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M14.5 7.4c-.9-.9-2.6-.6-2.8 1L11 15.6c-.2 1.6-1.9 1.9-2.8 1"/></svg>;
}
/** Concepts and the Atlas: a three-star constellation (one place, one glyph). */
export function ConstellationMark(props:MarkProps){
 return <svg {...base(props)}><path d="M5.5 17.5 10.5 7l8 7"/><circle cx="5.5" cy="17.5" r="2" fill="currentColor"/><circle cx="10.5" cy="7" r="2" fill="currentColor"/><circle cx="18.5" cy="14" r="2" fill="currentColor"/></svg>;
}
/** A deadline: a calendar with "!". `Flag` now means only a target date. */
export function DeadlineMark(props:MarkProps){
 return <svg {...base(props)}><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M12 12v3.5"/><path d="M12 18.2v.1"/></svg>;
}
/** Changed: ± (a triangle read as a warning or play). */
export function ChangedMark(props:MarkProps){
 return <svg {...base(props)}><path d="M12 4.5v8M8 8.5h8M8 18.5h8"/></svg>;
}
/** Suggested: a dashed square with +, like a suggested block in the grid (a sparkle read as "AI"). */
export function SuggestedMark(props:MarkProps){
 return <svg {...base(props)}><rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="3 2.6"/><path d="M12 8.5v7M8.5 12h7"/></svg>;
}
/** The brand ℓ exactly as the app icon draws it (scripts/brand/lemma-mark.mjs, `simple` layout): optically centred in
 *  its box, unlike the italic text glyph, whose font metrics sat it high and left (Owner report, 12 Nov 2026). Filled. */
export const ELL_MARK_PATH='M268 592.5Q290.86 587.54 315.71 582.07Q340.56 576.6 366.4 569.65Q393.23 500.07 426.53 430Q459.82 359.94 498.09 302.29Q536.35 244.65 579.58 209.36Q622.82 174.08 668.54 174.08Q712.27 174.08 734.13 200.42Q756 226.76 756 271.48Q756 334.1 728.17 383.29Q700.34 432.49 654.13 469.76Q607.91 507.03 551.26 533.87Q494.61 560.7 436.96 578.59Q420.07 622.32 408.14 664.06Q396.21 705.81 396.21 743.57Q396.21 768.42 408.14 789.29Q420.07 810.16 444.91 810.16Q482.68 810.16 518.46 771.4Q554.24 732.64 609.9 651.14L633.75 668.04Q574.12 761.46 529.89 805.69Q485.66 849.92 431 849.92Q407.15 849.92 382.8 840.48Q358.45 831.04 342.54 805.2Q326.64 779.35 326.64 728.67Q326.64 700.84 334.59 668.54Q342.54 636.24 354.47 602.44Q307.76 613.38 271.98 619.34ZM661.58 218.8Q637.73 218.8 614.37 238.68Q591.01 258.56 570.14 290.36Q549.27 322.17 531.38 357.95Q513.49 393.73 499.58 426.53Q485.66 459.32 476.72 481.19L451.87 542.81Q518.46 518.96 576.6 483.18Q634.74 447.4 671.52 397.7Q708.29 348.01 708.29 281.42Q708.29 245.64 694.38 232.22Q680.46 218.8 661.58 218.8Z';
export function EllMark({size=24,...props}:MarkProps){
 return <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true" focusable="false" {...props}><path d={ELL_MARK_PATH}/></svg>;
}
/** Every drawn mark, by key; the icon-resolution test walks this and the screens' icon tables. */
export const marks={'close-day':CloseDayMark,'inbox-zero':InboxZeroMark,card:CardMark,practice:PracticeMark,constellation:ConstellationMark,deadline:DeadlineMark,changed:ChangedMark,suggested:SuggestedMark} as const;
