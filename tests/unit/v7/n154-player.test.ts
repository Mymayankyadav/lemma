import {describe, expect, it, vi} from 'vitest';

// N154 · LT8: the player tells its host, once, on the frame the ending's ✓ or ∎ lands.
const listeners = vi.hoisted(() => new Map<string, (event: unknown) => void>());
vi.mock('@lottiefiles/dotlottie-web', () => ({
  DotLottie: class {
    static setWasmUrl() {}
    constructor() {queueMicrotask(() => listeners.get('load')?.({type: 'load'}));}
    addEventListener(type: string, listener: (event: unknown) => void) {listeners.set(type, listener);}
    destroy() {}
  },
}));
import {LOTTIE_LAND_EVENT, playLottie} from '../../../src/ui/v7/lottiePlayer';
import {LOTTIE_LANDS} from '../../../src/ui/v7/lottie';

describe('LT8 · the landing event', () => {
  it('fires once, when the frame reaches the landing frame (or the animation completes first)', async () => {
    const host = document.createElement('span'), landed = vi.fn();
    host.addEventListener(LOTTIE_LAND_EVENT, landed);
    await playLottie('round-complete', document.createElement('canvas'), host);
    listeners.get('frame')!({type: 'frame', currentFrame: LOTTIE_LANDS['round-complete'] - 1});
    expect(landed).not.toHaveBeenCalled();
    listeners.get('frame')!({type: 'frame', currentFrame: LOTTIE_LANDS['round-complete']});
    listeners.get('frame')!({type: 'frame', currentFrame: LOTTIE_LANDS['round-complete'] + 4});
    listeners.get('complete')!({type: 'complete'});
    expect(landed).toHaveBeenCalledTimes(1);
  });
});
