/**
 * N129 · A3 the Lottie player, loaded only on demand (LottieMoment imports this module after the still is on screen and
 * only when motion is allowed), so neither the player nor its WebAssembly is in any route's first load. The WebAssembly
 * is self-hosted: by default the player fetches it from a public CDN, which Lemma never relies on.
 */
import {DotLottie} from '@lottiefiles/dotlottie-web';
// The package exports only its entry point, so reach the WebAssembly file by path; Vite copies it into the build.
import wasmUrl from '../../../node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm?url';
import {roleColours, themeLottie, type LottieName} from './lottie';

const files: Record<LottieName, () => Promise<{default: unknown}>> = {
  'inbox-zero': () => import('./lottie/inbox-zero.json'),
  'round-complete': () => import('./lottie/round-complete.json'),
  'day-closed': () => import('./lottie/day-closed.json'),
};

let wasmSet = false;

/**
 * Play `name` once on `canvas`, in the colours seen from `host`. Resolves when the first frame is drawn, rejects when the
 * player or the animation cannot load. The returned stop function frees the player.
 */
export async function playLottie(name: LottieName, canvas: HTMLCanvasElement, host: Element): Promise<() => void> {
  if (!wasmSet) {DotLottie.setWasmUrl(wasmUrl); wasmSet = true;}
  const {default: data} = await files[name]();
  const player = new DotLottie({canvas, data: themeLottie(data as object, roleColours(host)) as Record<string, unknown>,
    autoplay: true, loop: false, renderConfig: {autoResize: false, freezeOnOffscreen: false}});
  await new Promise<void>((resolve, reject) => {
    player.addEventListener('load', () => resolve());
    player.addEventListener('loadError', () => reject(new Error('lottie: load failed')));
    player.addEventListener('renderError', () => reject(new Error('lottie: render failed')));
  }).catch(error => {player.destroy(); throw error;});
  return () => player.destroy();
}
