import {useEffect, useRef, useState} from 'react';
import {Illustration, type IllustrationName} from './Illustration';
import {useMotionReduced} from './effects';
import type {LottieName} from './lottie';

/**
 * N129 · A3 a moment that animates once: the still drawing (A2) is shown at once, and when motion is allowed the Lottie
 * player loads in the background and draws the same picture in, ending on that still. Under reduced motion (system or
 * Settings › Reduce effects), offline, on any load error, or when the player is not ready within `PLAY_WITHIN` ms (the
 * learner has already taken the still in; redrawing it later would only distract) the still simply stays. Decorative.
 */
export const PLAY_WITHIN = 700;

export function LottieMoment({name, animation, width = 160, className}: {
  name: IllustrationName; animation: LottieName; width?: number; className?: string;
}) {
  const reduced = useMotionReduced();
  const host = useRef<HTMLSpanElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const height = Math.round(width * 3 / 4);

  useEffect(() => {
    if (reduced || !host.current || !canvas.current) return;
    let stop: (() => void) | undefined, gone = false;
    const started = performance.now();
    import('./lottiePlayer').then(({playLottie}) => playLottie(animation, canvas.current!, host.current!))
      .then(done => {
        if (gone || performance.now() - started > PLAY_WITHIN) done();
        else {stop = done; setPlaying(true);}
      })
      .catch(() => undefined);
    return () => {gone = true; stop?.(); setPlaying(false);};
  }, [animation, reduced]);

  return <span ref={host} className={'v7-lottie' + (className ? ' ' + className : '')} data-lottie={animation}
    data-lottie-state={playing ? 'playing' : 'still'} aria-hidden="true" style={{width}}>
    {!playing && <Illustration name={name} width={width} />}
    {!reduced && <canvas ref={canvas} width={width * 2} height={height * 2} hidden={!playing} />}
  </span>;
}
