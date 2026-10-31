/**
 * A conservative fast path for Cards list previews. React escapes text nodes,
 * so a string with no Markdown/HTML/LaTeX syntax is safe to show verbatim.
 * Anything ambiguous continues through the canonical Tex renderer.
 */
const markupSyntax = /[\\$\`*_~\\[\\]<>!#|&\\r\\n]/;

export function canRenderPlainCardFront(source: string): boolean {
  return source.length > 0 && !markupSyntax.test(source);
}
