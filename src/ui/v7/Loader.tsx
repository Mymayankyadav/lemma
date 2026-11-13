import {Emblem} from './Emblem';

/**
 * N131 · L-09 the loader (v7 UX plan r3, `04` §7: "an emblem glyph drawing itself, in code"): a small emblem glyph whose
 * strokes draw in, in their construction order, and lift again, beside the words that say what is loading (the words
 * carry the meaning; the mark is decorative). Under reduced motion the glyph stands complete.
 */
export function Loader({label, className}: {label: string; className?: string}) {
  return <p role="status" className={'v7-loader' + (className ? ' ' + className : '')}>
    <span className="v7-loader-mark"><Emblem subject="Other" seed="lemma-loader" size={20} tier="glyph"/></span>
    <span>{label}</span>
  </p>;
}
