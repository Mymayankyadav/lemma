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
export type IllustrationName = 'paths' | 'calendar' | 'review' | 'inbox' | 'cards' | 'atlas' | 'progress' | 'tasks' | 'closed' | 'round';

const art: Record<IllustrationName, string> = {
  // IL-01 Paths: a route rising from a start point through a waypoint to a flag, balanced about the centre.
  paths: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="i" d="M83.6 122.7Q98.5 100.3 113.5 100.3T143.3 77.9"/><circle class="i page" cx="83.6" cy="122.7" r="5.6"/><circle class="f" cx="113.5" cy="100.3" r="3.7"/>
    <path class="i" d="M143.3 77.9V51.7"/><path class="f" d="M145.2 51.7 162 58.3 145.2 64.8Z"/>`,
  // IL-02 Calendar Day: an empty calendar page, a plus to add a block.
  calendar: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="i page" x="82" y="56" width="76" height="70" rx="10"/><path class="i" d="M82 76H158M102 48V62M138 48V62"/>
    <path class="m" d="M98 94h6M117 94h6M136 94h6M98 108h6M117 108h6M136 108h6"/><circle class="f" data-badge="" cx="154" cy="122" r="13"/><path class="w" d="M154 116v12M148 122h12"/>`,
  // IL-03 Review, all caught up: a card on a card, with a tick.
  review: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="m page" x="86" y="58" width="68" height="50" rx="8" transform="rotate(-8 120 83)"/>
    <rect class="i page" x="82" y="66" width="76" height="52" rx="8"/><path class="m" d="M96 84H144M96 98H130"/><circle class="f" data-badge="" cx="154" cy="114" r="13"/><path class="w" d="M148 114l4 4 8-8"/>`,
  // IL-04 Inbox zero: an empty tray with a tick.
  inbox: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="i page" d="M80 92 94 62H146L160 92V112a6 6 0 0 1-6 6H86a6 6 0 0 1-6-6Z"/><path class="i" d="M80 92H104l6 10H130l6-10H160"/><circle class="f" data-badge="" cx="156" cy="114" r="13"/><path class="w" d="M150 114l4 4 8-8"/>`,
  // IL-05 Cards, no match (P2, v7 UX audit r3): the lens over an empty, dashed card. The lens with a minus read "zoom out".
  cards: `<circle class="bg" cx="120" cy="90" r="66"/>
  <rect class="m" x="78" y="50" width="64" height="46" rx="7" stroke-dasharray="5 7"/>
  <circle class="i page" cx="126" cy="90" r="24"/><path class="a thick" d="M143 107 160 124"/>`,
  // IL-06 Atlas, an empty sky: one bright star at the centre, two small ones balanced about it.
  atlas: `<circle class="bg" cx="120" cy="90" r="66"/>
    <path class="f" d="M120 62C123.7 86.3 123.7 86.3 148 90C123.7 93.7 123.7 93.7 120 118C116.3 93.7 116.3 93.7 92 90C116.3 86.3 116.3 86.3 120 62Z"/>
    <path class="i" d="M86.3 54.5C88.2 62 88.2 62 95.7 63.8C88.2 65.7 88.2 65.7 86.3 73.2C84.5 65.7 84.5 65.7 77 63.8C84.5 62 84.5 62 86.3 54.5Z"/>
    <path class="i" d="M153.7 106.8C155.5 114.3 155.5 114.3 163 116.2C155.5 118 155.5 118 153.7 125.5C151.8 118 151.8 118 144.3 116.2C151.8 114.3 151.8 114.3 153.7 106.8Z"/>`,
  // IL-07 Progress, no time yet (P2): an hourglass whose sand has not started to fall. The clock read about 12:20 and
  // drew at two thirds the size of its neighbours.
  progress: `<circle class="bg" cx="120" cy="90" r="66"/>
  <path class="i page" d="M97.6 56.5H142.4C142.4 81.1 124.5 83.3 124.5 90C124.5 96.7 142.4 98.9 142.4 123.5H97.6C97.6 98.9 115.5 96.7 115.5 90C115.5 83.3 97.6 81.1 97.6 56.5Z"/>
  <path class="f" d="M103.2 60.9H136.8C136.8 75.5 125.6 79.9 120 85.5C114.4 79.9 103.2 75.5 103.2 60.9Z"/><path class="i" d="M88.7 52H151.3M88.7 128H151.3"/>`,
  // IL-08 Tasks, all done: a clipboard with a tick.
  tasks: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="i page" x="86" y="56" width="68" height="72" rx="8"/><rect class="i page" x="104" y="48" width="32" height="14" rx="5"/>
    <path class="m" d="M100 80H140M100 94H140M100 108H126"/><circle class="f" data-badge="" cx="150" cy="124" r="13"/><path class="w" d="M144 124l4 4 8-8"/>`,
  // Day closed (N129, the still of the L-12 animation): a crescent moon, two small stars in its hollow, and ∎. P2: moved
  // up 8 and right 4 to sit on the disc's centre (its ∎ hung below the moon); the animation moves with it.
  closed: `<circle class="bg" cx="120" cy="90" r="66"/><g transform="translate(4 -8)">
    <path class="i page" d="M116 58A30 30 0 0 1 116 118C129.3 98 129.3 78 116 58Z"/>
    <path class="f" d="M94 61C95.8 66.4 97.6 68.2 103 70C97.6 71.8 95.8 73.6 94 79C92.2 73.6 90.4 71.8 85 70C90.4 68.2 92.2 66.4 94 61Z"/><path class="f" d="M100 98C101.2 101.6 102.4 102.8 106 104C102.4 105.2 101.2 106.4 100 110C98.8 106.4 97.6 105.2 94 104C97.6 102.8 98.8 101.6 100 98Z"/><rect class="f" x="115" y="129" width="10" height="10" rx="1.5"/></g>`,
  // Round complete (P2, Owner decision E19): Review's two cards with a ∎ badge, the still of the L-10 animation. ✓ means
  // nothing is waiting (Review caught up, Inbox zero, Tasks clear); ∎ means you finished something (a round, a day).
  round: `<circle class="bg" cx="120" cy="90" r="66"/>
    <rect class="m page" x="86" y="58" width="68" height="50" rx="8" transform="rotate(-8 120 83)"/>
    <rect class="i page" x="82" y="66" width="76" height="52" rx="8"/><path class="m" d="M96 84H144M96 98H130"/><circle class="f" data-badge="" cx="154" cy="114" r="13"/><rect class="w" x="151" y="111" width="6" height="6" rx="1"/>`,
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
