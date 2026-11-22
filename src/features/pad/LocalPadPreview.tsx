import {useMemo} from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {PAD_PREVIEW_LIMIT, PAD_SLOT, scanPad} from './padEdit';

const MAX_FORMULAS = 24;
const MAX_TEX = 1200;
const MAX_HTML = 96000;
const MAX_SIZE_EM = 12;

// KaTeX's maxSize caps positive sizes. Reject excessive negative CSS sizes too.
function hasOversizedNegativeDimension(html: string): boolean {
  for (const style of html.matchAll(/ style="([^"]*)"/g)) {
    for (const dimension of style[1].matchAll(/(-(?:\d*\.?\d+(?:e[+-]?\d+)?|Infinity)|NaN)(?:em|ex|px|pt|rem)\b/g)) {
      const size = Number(dimension[1]);
      if (!Number.isFinite(size) || size < -MAX_SIZE_EM) return true;
    }
  }
  return false;
}

type PreviewPart =
  | {kind: 'text' | 'unrendered'; source: string}
  | {kind: 'rendered'; html: string; display: boolean};

/** Shared safe KaTeX rendering for the Pad preview and Equation Assist. */
export function renderPadMath(tex: string, display = false): string | null {
  if (tex.length > MAX_TEX) return null;
  try {
    const html = katex.renderToString(tex, {
      displayMode: display, trust: false, throwOnError: true, strict: 'error',
      output: 'htmlAndMathml', maxExpand: 100, maxSize: MAX_SIZE_EM,
      macros: {[PAD_SLOT]: '\\square'},
    });
    return html.length <= MAX_HTML && !hasOversizedNegativeDimension(html) ? html : null;
  } catch {
    return null;
  }
}

function previewParts(source: string): PreviewPart[] {
  let formulas = 0, remaining = MAX_HTML;
  return scanPad(source).map(segment => {
    if (segment.kind === 'text') return segment;
    const literal = {kind: 'unrendered' as const, source: segment.source};
    if (segment.kind !== 'math' || ++formulas > MAX_FORMULAS || remaining <= 0) return literal;
    const html = renderPadMath(segment.tex, segment.display);
    if (!html || html.length > remaining) return literal;
    remaining -= html.length;
    return {kind: 'rendered', html, display: segment.display};
  });
}

export function LocalPadPreview({source}: {source: string}) {
  const parts = useMemo(() => source.length <= PAD_PREVIEW_LIMIT ? previewParts(source) : null, [source]);
  return <section aria-label="Local math preview" className="local-pad-preview">
    {parts === null ? <p>Preview is limited to {PAD_PREVIEW_LIMIT} characters. Your text is unchanged.</p>
      : parts.length === 0 ? <p>Type or insert a formula to see a preview.</p>
        : parts.map((part, i) => part.kind === 'rendered'
          // This is exclusively trusted KaTeX output (not input text or Markdown).
          ? <span key={i} className={part.display ? 'local-pad-display' : 'local-pad-inline'}
              dangerouslySetInnerHTML={{__html: part.html}}/>
          : <span key={i} className={part.kind === 'unrendered' ? 'local-pad-unrendered' : undefined}>{part.source}</span>)}
  </section>;
}
