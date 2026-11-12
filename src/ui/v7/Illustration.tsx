import './illustration.css';

/**
 * A2 · the empty-state illustrations (release and assets plan, IL-01 … IL-08), in the style the Owner chose on
 * 12 Nov 2026 (D6 = A · Notebook line art): one ink weight with round caps and joins, muted secondary lines, and a single
 * accent (the subject colour where there is one, else the brand indigo). Drawn in code, about 1 KB each; every colour
 * comes from the theme, so Day and Night follow automatically. Decorative: the empty state's text carries the meaning.
 *
 * Classes: `i` ink stroke, `m` muted stroke, `g` faint accent grid, `a` accent stroke, `f` accent fill.
 */
export type IllustrationName = 'paths' | 'calendar' | 'review' | 'inbox' | 'cards' | 'atlas' | 'progress' | 'tasks';

const art: Record<IllustrationName, string> = {
  // IL-01 Paths: a blank notebook page with a compass about to draw.
  paths: `<path class="i" d="M40 50Q80 42 120 52Q160 42 200 50V142Q160 134 120 144Q80 134 40 142Z"/><path class="i" d="M120 52V144"/>
    <path class="m" d="M54 72H104M54 86H98M54 100H104"/>
    <path class="g" d="M136 66V128M150 64V130M164 64V130M178 64V130M192 66V128M130 80H196M130 96H196M130 112H196"/>
    <circle class="i" cx="164" cy="30" r="5"/><path class="i" d="M161 34 150 104M167 34 180 102"/><path class="i" d="M180 102l2 8"/>
    <path class="a" stroke-dasharray="3 6" d="M146 112A36 36 0 0 0 184 114"/>`,
  // IL-02 Calendar day: an empty day under a ruler; a dashed block shows where study could go.
  calendar: `<rect class="i" x="56" y="34" width="128" height="104" rx="10"/><path class="i" d="M56 56H184"/>
    <path class="m" d="M72 76H170M72 96H170M72 116H170"/>
    <rect class="a" stroke-dasharray="4 6" x="92" y="82" width="62" height="28" rx="6"/>
    <rect class="i" x="44" y="146" width="152" height="18" rx="4"/>
    <path class="i" d="M60 146v7M76 146v5M92 146v7M108 146v5M124 146v7M140 146v5M156 146v7M172 146v5"/>`,
  // IL-03 Review, all caught up: a squared deck with ∎ and a tick above.
  review: `<rect class="m" x="62" y="62" width="104" height="72" rx="10" transform="rotate(-7 114 98)"/>
    <rect class="m" x="70" y="58" width="104" height="72" rx="10" transform="rotate(3 122 94)"/>
    <rect class="i page" x="76" y="54" width="104" height="72" rx="10"/><path class="i" d="M92 76H150M92 90H138"/>
    <rect class="f" x="156" y="104" width="12" height="12" rx="1.5"/><path class="a" d="M106 26l8 8 16-16"/>`,
  // IL-04 Inbox zero: an empty tray, a tick lifted above it.
  inbox: `<path class="i" d="M50 104 66 70H174L190 104V134a8 8 0 0 1-8 8H58a8 8 0 0 1-8-8Z"/>
    <path class="i" d="M50 104H92l8 14H140l8-14H190"/><path class="m" d="M80 84H160"/>
    <circle class="a" cx="120" cy="36" r="18"/><path class="a" d="M111 36l6 6 12-12"/>`,
  // IL-05 Cards, no match: a lens over a card, finding nothing.
  cards: `<rect class="m" x="44" y="54" width="112" height="78" rx="10"/><path class="m" d="M60 76H120M60 92H108M60 108H96"/>
    <circle class="i page" cx="156" cy="96" r="30"/><circle class="a" stroke-dasharray="3 6" cx="156" cy="96" r="18"/>
    <path class="i" d="M178 118 200 140"/>`,
  // IL-06 Atlas, an empty sky: a dome, a few faint stars, one bright star with nothing joined to it yet.
  atlas: `<path class="i" d="M36 140A84 84 0 0 1 204 140"/><path class="i" d="M28 140H212"/>
    <path class="m" d="M80 92v8M76 96h8M150 70v6M147 73h6M170 112v6M167 115h6M98 124v6M95 127h6"/>
    <path class="a" d="M120 64l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/>
    <path class="a" stroke-dasharray="2 7" d="M128 84 160 106"/>`,
  // IL-07 Progress, no time yet: an empty chart waiting on a stopwatch.
  progress: `<path class="i" d="M48 36V140H200"/>
    <rect class="m" stroke-dasharray="3 5" x="64" y="112" width="18" height="28" rx="3"/>
    <rect class="m" stroke-dasharray="3 5" x="94" y="96" width="18" height="44" rx="3"/>
    <rect class="m" stroke-dasharray="3 5" x="124" y="104" width="18" height="36" rx="3"/>
    <circle class="a" cx="170" cy="62" r="20"/><path class="a" d="M170 50v12l8 6M166 36h8"/>`,
  // IL-08 Tasks, all done: a list with every box ticked and ∎ at the end.
  tasks: `<rect class="i" x="60" y="30" width="120" height="124" rx="10"/>
    <rect class="i" x="76" y="50" width="14" height="14" rx="3"/><path class="a" d="M79 57l3 3 6-6"/><path class="m" d="M100 57H160"/>
    <rect class="i" x="76" y="78" width="14" height="14" rx="3"/><path class="a" d="M79 85l3 3 6-6"/><path class="m" d="M100 85H152"/>
    <rect class="i" x="76" y="106" width="14" height="14" rx="3"/><path class="a" d="M79 113l3 3 6-6"/><path class="m" d="M100 113H156"/>
    <rect class="f" x="156" y="134" width="10" height="10" rx="1.5"/>`,
};

export const ILLUSTRATIONS = Object.keys(art) as IllustrationName[];

/** One illustration, 240 × 180 units, sized by `width` (default 160 px). */
export function Illustration({name, width = 160, className}: {name: IllustrationName; width?: number; className?: string}) {
  return <svg className={'v7-il' + (className ? ' ' + className : '')} data-illustration={name} viewBox="0 0 240 180"
    width={width} height={Math.round(width * 3 / 4)} aria-hidden="true" focusable="false"
    dangerouslySetInnerHTML={{__html: art[name]}} />;
}
