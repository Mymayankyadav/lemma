/** A separate, deterministic filter for lexical suggestions, not a verifier of
 * mathematical truth. Reuse the asset object supplied to words.mjs.
 *
 * permitWord(text, candidate, {authoredText}, assets, {strength}) -> boolean.
 * `candidate` is a word or {word,kind}. `balanced` and `committed` require
 * visible spelling for all content words; only a small set of neutral writing
 * fillers can be offered from a shorter prefix or at a non-mathematical boundary.
 * Explicit learner-name menus are a separate lane and should bypass this check.
 */
const FILLERS = new Set(['a','an','the','i','we','of','to','in','for','by','with','at','as','on']);
const TOKEN = /[\p{L}\p{M}]+$/u;
const maps = new WeakMap();
function known(asset, word) {
  if (!asset || typeof asset !== 'object') return false;
  let set=maps.get(asset);
  if (!set) {
    const words=Array.isArray(asset.words) ? asset.words : typeof asset.words === 'string' ? asset.words.split(/\r?\n/) : [];
    set=new Set([...words,...(asset.common||[])]); maps.set(asset,set);
  }
  return set.has(word);
}
function gap(text) {
  return /(?:\b(?:in|from|equals?|choose|take|witness|implies|is)\s*|[=<>∈∉⊆⊂≤≥≠])\s*$/iu.test(text);
}
/** Detailed optional explanation; inputText ends at the caret. */
export function decideWord(inputText, candidate, {authoredText} = {}, assets = {}, config = {}) {
  const value=typeof candidate === 'string' ? candidate : candidate?.word;
  const strength=config.strength ?? 'balanced';
  if (typeof inputText !== 'string' || typeof value !== 'string' || !['balanced','committed'].includes(strength) || !/^[\p{L}\p{M}]+$/u.test(value)) return {permit:false,reason:'invalid'};
  if (typeof candidate === 'object' && candidate?.kind === 'operand') return {permit:false,reason:'separate-operand-menu'};
  const word=value.toLocaleLowerCase(), match=inputText.match(TOKEN), stem=(match?.[0]||'').toLocaleLowerCase();
  const len=[...stem].length, total=[...word].length;
  if (!stem) {
    if (gap(inputText)) return {permit:false,reason:'unresolved-math-gap'};
    return {permit:FILLERS.has(word),reason:FILLERS.has(word)?'neutral-boundary':'content-at-boundary'};
  }
  if (!word.startsWith(stem) || word === stem) return {permit:false,reason:'not-a-continuation'};
  // A complete word on paper cannot authorize extending it into another word.
  if (known(assets,stem) || FILLERS.has(stem)) return {permit:false,reason:'complete-word-collision'};
  if (FILLERS.has(word)) return {permit:true,reason:'neutral-filler'};
  // Count typed characters, not semantic similarity or likely correctness.
  const floor=strength === 'committed' ? 5 : 4;
  const fraction=strength === 'committed' ? 0.75 : 0.6;
  let permit=len>=floor && len/total>=fraction;
  if (permit && len<=5 && Array.isArray(assets.common)) {
    const neighbors = new Set(assets.common.filter(w => w.toLocaleLowerCase().startsWith(stem)).map(w => w.toLocaleLowerCase()));
    if (neighbors.has(word) && neighbors.size > 1) return {permit:false,reason:'shared-short-stem'};
  }
  const previous=permit && typeof authoredText === 'string' && authoredText.toLocaleLowerCase().includes(word);
  return {permit,reason:permit?(previous?'strong-learner-term':'strong-visible-spelling'):'insufficient-visible-spelling'};
}
export function permitWord(inputText,candidate,options={},assets={},config={}) {
  return decideWord(inputText,candidate,options,assets,config).permit;
}
