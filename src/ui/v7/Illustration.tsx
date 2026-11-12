import './illustration.css';

/**
 * A2 · the empty-state illustrations (release and assets plan, IL-01 … IL-08), line art (D6 = A). Redrawn on the Owner's
 * note of 12 Nov 2026 ("too weird; something clean"): one familiar object per state, centred on a soft round backdrop,
 * one line weight, and a single accent detail (a badge, a flag, a star) in the subject colour or the brand indigo.
 * Drawn in code, under 1 KB each; every colour comes from the theme, so Day and Night follow. Decorative: the empty
 * state's text carries the meaning.
 *
 * Classes: `bg` backdrop, `i` ink stroke, `m` muted stroke, `a` accent stroke, `f` accent fill, `w` mark on an accent
 * badge, `page` paper fill, `thick` a heavier stroke.
 */
export type IllustrationName = 'paths' | 'calendar' | 'review' | 'inbox' | 'cards' | 'atlas' | 'progress' | 'tasks';

const art: Record<IllustrationName, string> = {
  // IL-01 Paths: a path from a starting point to a flag.
  paths: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="i" d="M86 120C104 116 98 98 116 94S148 90 156 84"/><circle class="i page" cx="84" cy="121" r="6"/>
    <path class="i" d="M156 44V86"/><path class="f" d="M158 46 180 54 158 62Z"/>`,
  // IL-02 Calendar Day: an empty calendar page, a plus to add a block.
  calendar: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="i page" x="78" y="52" width="84" height="76" rx="10"/><path class="i" d="M78 74H162M100 44V60M140 44V60"/>
    <path class="m" d="M96 92h8M116 92h8M136 92h8M96 108h8M116 108h8"/><circle class="f" cx="160" cy="122" r="14"/><path class="w" d="M160 116v12M154 122h12"/>`,
  // IL-03 Review, all caught up: a card with a tick.
  review: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="m page" x="88" y="56" width="76" height="54" rx="8" transform="rotate(-8 126 83)"/>
    <rect class="i page" x="80" y="66" width="80" height="56" rx="8"/><path class="m" d="M94 86H140M94 100H128"/><circle class="f" cx="160" cy="120" r="14"/><path class="w" d="M154 120l4 4 8-8"/>`,
  // IL-04 Inbox zero: an empty tray with a tick.
  inbox: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="i page" d="M78 98 92 66H148L162 98V120a6 6 0 0 1-6 6H84a6 6 0 0 1-6-6Z"/><path class="i" d="M78 98H102l6 10H132l6-10H162"/><circle class="f" cx="160" cy="64" r="14"/><path class="w" d="M154 64l4 4 8-8"/>`,
  // IL-05 Cards, no match: a magnifier that found nothing.
  cards: `<circle class="bg" cx="120" cy="90" r="66"/>
    <circle class="i page" cx="112" cy="84" r="28"/><path class="m" d="M100 84H124"/><path class="a thick" d="M133 105 154 126"/>`,
  // IL-06 Atlas, an empty sky: one bright star and two small ones.
  atlas: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="f" d="M120 56C122 78 128 84 150 86C128 88 122 94 120 116C118 94 112 88 90 86C112 84 118 78 120 56Z"/>
    <path class="i" d="M84 60C85 68 87 70 95 71C87 72 85 74 84 82C83 74 81 72 73 71C81 70 83 68 84 60Z"/>
    <path class="i" d="M158 108C159 114 160 115 166 116C160 117 159 118 158 124C157 118 156 117 150 116C156 115 157 114 158 108Z"/>`,
  // IL-07 Progress, no time yet: a clock waiting at twelve.
  progress: `<circle class="bg" cx="120" cy="90" r="66"/>
    <circle class="i page" cx="120" cy="90" r="34"/><path class="m" d="M120 62v6M148 90h-6M120 118v-6M92 90h6"/>
    <path class="a" d="M120 74V90l10 8"/><circle class="f" cx="120" cy="90" r="3"/>`,
  // IL-08 Tasks, all done: a clipboard with a tick.
  tasks: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="i page" x="86" y="54" width="68" height="78" rx="8"/><rect class="i page" x="104" y="46" width="32" height="14" rx="5"/>
    <path class="m" d="M100 80H140M100 96H140M100 112H126"/><circle class="f" cx="152" cy="124" r="14"/><path class="w" d="M146 124l4 4 8-8"/>`,
};

export const ILLUSTRATIONS = Object.keys(art) as IllustrationName[];

/** One illustration, 240 × 180 units, sized by `width` (default 160 px). */
export function Illustration({name, width = 160, className}: {name: IllustrationName; width?: number; className?: string}) {
  return <svg className={'v7-il' + (className ? ' ' + className : '')} data-illustration={name} viewBox="0 0 240 180"
    width={width} height={Math.round(width * 3 / 4)} aria-hidden="true" focusable="false"
    dangerouslySetInnerHTML={{__html: art[name]}} />;
}
