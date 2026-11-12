import {useEffect, useRef, useState} from 'react';
import {Illustration, IllustrationBackdrop, type IllustrationName} from './Illustration';
import {useMotionReduced} from './effects';
import type {LottieName} from './lottie';

/**
 * N129 · A3 a moment that animates once: when motion is allowed the Lottie player loads in the background and draws the
 * picture in, ending on the A2 still. Under reduced motion (system or Settings › Reduce effects) the still shows at once
 * and the player is never fetched. Decorative.
 *
 * N130 (v7 UX audit r3, P5):
 * - Never erase (LT1): while the player loads, only the backdrop is shown (it is frame 1 of every animation), so the
 *   finished picture is never shown, erased and drawn again. If the player is not ready within `PLAY_WITHIN` ms, or
 *   cannot load (offline, no WebAssembly), the still fades in over the backdrop and stays.
 * - Crisp (LT2): the canvas has as many pixels as the screen shows (device pixel ratio, at most 3), not always 2×.
 * - Theme (LT10): the animation is coloured once, when it starts; if Day/Night or contrast changes afterwards the still
 *   (drawn from the live theme) replaces it.
 */
export const PLAY_WITHIN = 700;
type Phase = 'loading' | 'playing' | 'still' | 'late';

/** Canvas pixels per CSS pixel: the screen's own density, between 1 and 3. */
export function canvasScale(ratio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1): number {
  return Math.min(3, Math.max(1, Number.isFinite(ratio) ? ratio : 1));
}

export function LottieMoment({name, animation, width = 160, className}: {
  name: IllustrationName; animation: LottieName; width?: number; className?: string;
}) {
  const reduced = useMotionReduced();
  const host = useRef<HTMLSpanElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const height = Math.round(width * 3 / 4), scale = canvasScale();

  useEffect(() => {
    if (reduced || !host.current || !canvas.current) return;
    let stop: (() => void) | undefined, gone = false, settled = false;
    setPhase('loading');
    const started = performance.now();
    const late = () => {if (!gone && !settled) {settled = true; setPhase('late');}};
    const timer = window.setTimeout(late, PLAY_WITHIN);
    import('./lottiePlayer').then(({playLottie}) => playLottie(animation, canvas.current!, host.current!))
      .then(done => {
        if (gone || settled || performance.now() - started > PLAY_WITHIN) {done(); late();}
        else {settled = true; window.clearTimeout(timer); stop = done; setPhase('playing');}
      })
      .catch(late);
    const theme = new MutationObserver(() => {
      if (!stop) return;
      stop(); stop = undefined;
      if (!gone) setPhase('still');
    });
    theme.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'data-contrast']});
    return () => {gone = true; window.clearTimeout(timer); theme.disconnect(); stop?.(); stop = undefined;};
  }, [animation, reduced]);

  const shown: Phase = reduced ? 'still' : phase;
  return <span ref={host} className={'v7-lottie' + (className ? ' ' + className : '')} data-lottie={animation}
    data-lottie-state={shown === 'late' ? 'still' : shown} data-lottie-late={shown === 'late' ? '' : undefined}
    aria-hidden="true" style={{width}}>
    {shown === 'loading' && <IllustrationBackdrop width={width} />}
    {(shown === 'still' || shown === 'late') && <Illustration name={name} width={width} />}
    {!reduced && <canvas ref={canvas} width={Math.round(width * scale)} height={Math.round(height * scale)} hidden={shown !== 'playing'} />}
  </span>;
}
