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
export type IllustrationName = 'paths' | 'calendar' | 'review' | 'inbox' | 'cards' | 'atlas' | 'progress' | 'tasks' | 'closed';

const art: Record<IllustrationName, string> = {
  // IL-01 Paths: a route rising from a start point through a waypoint to a flag, balanced about the centre.
  paths: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="i" d="M82 122Q98 98 114 98T146 74"/><circle class="i page" cx="82" cy="122" r="6"/><circle class="f" cx="114" cy="98" r="4"/>
    <path class="i" d="M146 74V46"/><path class="f" d="M148 46 166 53 148 60Z"/>`,
  // IL-02 Calendar Day: an empty calendar page, a plus to add a block.
  calendar: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="i page" x="82" y="56" width="76" height="70" rx="10"/><path class="i" d="M82 76H158M102 48V62M138 48V62"/>
    <path class="m" d="M98 94h6M117 94h6M136 94h6M98 108h6M117 108h6M136 108h6"/><circle class="f" cx="154" cy="122" r="13"/><path class="w" d="M154 116v12M148 122h12"/>`,
  // IL-03 Review, all caught up: a card on a card, with a tick.
  review: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="m page" x="86" y="58" width="68" height="50" rx="8" transform="rotate(-8 120 83)"/>
    <rect class="i page" x="82" y="66" width="76" height="52" rx="8"/><path class="m" d="M96 84H144M96 98H130"/><circle class="f" cx="154" cy="114" r="13"/><path class="w" d="M148 114l4 4 8-8"/>`,
  // IL-04 Inbox zero: an empty tray with a tick.
  inbox: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="i page" d="M80 92 94 62H146L160 92V112a6 6 0 0 1-6 6H86a6 6 0 0 1-6-6Z"/><path class="i" d="M80 92H104l6 10H130l6-10H160"/><circle class="f" cx="156" cy="114" r="13"/><path class="w" d="M150 114l4 4 8-8"/>`,
  // IL-05 Cards, no match: a magnifier that found nothing.
  cards: `<circle class="bg" cx="120" cy="90" r="66"/>
    <circle class="i page" cx="112" cy="82" r="27"/><path class="m" d="M100 82H124"/><path class="a thick" d="M131 101 152 122"/>`,
  // IL-06 Atlas, an empty sky: one bright star at the centre, two small ones balanced about it.
  atlas: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="f" d="M120 60C124 86 124 86 150 90C124 94 124 94 120 120C116 94 116 94 90 90C116 86 116 86 120 60Z"/>
    <path class="i" d="M84 52C86 60 86 60 94 62C86 64 86 64 84 72C82 64 82 64 74 62C82 60 82 60 84 52Z"/>
    <path class="i" d="M156 108C158 116 158 116 166 118C158 120 158 120 156 128C154 120 154 120 146 118C154 116 154 116 156 108Z"/>`,
  // IL-07 Progress, no time yet: a clock waiting at twelve.
  progress: `<circle class="bg" cx="120" cy="90" r="66"/>
    <circle class="i page" cx="120" cy="90" r="34"/><path class="m" d="M120 62v6M148 90h-6M120 118v-6M92 90h6"/>
    <path class="a" d="M120 74V90l10 8"/><circle class="f" cx="120" cy="90" r="3"/>`,
  // IL-08 Tasks, all done: a clipboard with a tick.
  tasks: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="i page" x="86" y="56" width="68" height="72" rx="8"/><rect class="i page" x="104" y="48" width="32" height="14" rx="5"/>
    <path class="m" d="M100 80H140M100 94H140M100 108H126"/><circle class="f" cx="150" cy="124" r="13"/><path class="w" d="M144 124l4 4 8-8"/>`,
  // Day closed (N129, the still of the L-12 animation): a crescent moon, two small stars in its hollow, and ∎.
  closed: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="i page" d="M116 58A30 30 0 0 1 116 118C129.3 98 129.3 78 116 58Z"/>
    <path class="f" d="M94 61C95.8 66.4 97.6 68.2 103 70C97.6 71.8 95.8 73.6 94 79C92.2 73.6 90.4 71.8 85 70C90.4 68.2 92.2 66.4 94 61Z"/><path class="f" d="M100 98C101.2 101.6 102.4 102.8 106 104C102.4 105.2 101.2 106.4 100 110C98.8 106.4 97.6 105.2 94 104C97.6 102.8 98.8 101.6 100 98Z"/><rect class="f" x="115" y="129" width="10" height="10" rx="1.5"/>`,
};

export const ILLUSTRATIONS = Object.keys(art) as IllustrationName[];

/** N130 (LT1): only the soft round backdrop, exactly as every drawing and frame 1 of every animation start. A Lottie
 *  moment shows this while its player loads, so the finished picture is never shown, erased and drawn again. */
export function IllustrationBackdrop({width = 160}: {width?: number}) {
  return <svg className="v7-il" data-illustration-backdrop="" viewBox="0 0 240 180" width={width} height={Math.round(width * 3 / 4)}
    aria-hidden="true" focusable="false"><circle className="bg" cx="120" cy="90" r="66" /></svg>;
}

/** One illustration, 240 × 180 units, sized by `width` (default 160 px). */
export function Illustration({name, width = 160, className}: {name: IllustrationName; width?: number; className?: string}) {
  return <svg className={'v7-il' + (className ? ' ' + className : '')} data-illustration={name} viewBox="0 0 240 180"
    width={width} height={Math.round(width * 3 / 4)} aria-hidden="true" focusable="false"
    dangerouslySetInnerHTML={{__html: art[name]}} />;
}
