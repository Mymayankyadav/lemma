/**
 * N129 · A3 the Lottie player, loaded only on demand (LottieMoment imports this module after the still is on screen and
 * only when motion is allowed), so neither the player nor its WebAssembly is in any route's first load. The WebAssembly
 * is self-hosted: by default the player fetches it from a public CDN, which Lemma never relies on.
 */
import {DotLottie} from '@lottiefiles/dotlottie-web';
// The package exports only its entry point, so reach the WebAssembly file by path; Vite copies it into the build.
import wasmUrl from '../../../node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm?url';
import {LOTTIE_LANDS, roleColours, themeLottie, type LottieName} from './lottie';

const files: Record<LottieName, () => Promise<{default: unknown}>> = {
  'inbox-zero': () => import('./lottie/inbox-zero.json'),
  'round-complete': () => import('./lottie/round-complete.json'),
  'day-closed': () => import('./lottie/day-closed.json'),
};

let wasmSet = false;

/** LT7: fetch the animation and the WebAssembly ahead of time (in idle time, near an ending), so the moment can start in
 *  its 700 ms window on a first web visit too. Failures are ignored: the moment falls back to its still as before. */
export async function warmLottie(name: LottieName): Promise<void> {
  await Promise.all([files[name](), fetch(wasmUrl).then(response => response.arrayBuffer())]).catch(() => undefined);
}

/**
 * Play `name` once on `canvas`, in the colours seen from `host`. Resolves when the first frame is drawn, rejects when the
 * player or the animation cannot load. The returned stop function frees the player. On the frame the ending's ✓ or ∎
 * lands (LT8), `host` receives one `lottieland` event.
 */
export const LOTTIE_LAND_EVENT = 'lottieland';
export async function playLottie(name: LottieName, canvas: HTMLCanvasElement, host: Element): Promise<() => void> {
  if (!wasmSet) {DotLottie.setWasmUrl(wasmUrl); wasmSet = true;}
  const {default: data} = await files[name]();
  const player = new DotLottie({canvas, data: themeLottie(data as object, roleColours(host)) as Record<string, unknown>,
    autoplay: true, loop: false, renderConfig: {autoResize: false, freezeOnOffscreen: false}});
  let landed = false;
  const land = () => {if (!landed) {landed = true; host.dispatchEvent(new Event(LOTTIE_LAND_EVENT));}};
  player.addEventListener('frame', event => {if ((event as {currentFrame?: number}).currentFrame! >= LOTTIE_LANDS[name]) land();});
  player.addEventListener('complete', land);
  await new Promise<void>((resolve, reject) => {
    player.addEventListener('load', () => resolve());
    player.addEventListener('loadError', () => reject(new Error('lottie: load failed')));
    player.addEventListener('renderError', () => reject(new Error('lottie: render failed')));
  }).catch(error => {player.destroy(); throw error;});
  return () => player.destroy();
}
