/**
 * A conservative fast path for Cards list previews. React escapes text nodes,
 * so a string with no Markdown/HTML/LaTeX syntax is safe to show verbatim.
 * Anything ambiguous continues through the canonical Tex renderer.
 */
const markupCharacters = new Set(['\\', '$', '`', '*', '_', '~', '[', ']', '<', '>', '!', '#', '|', '&', '\r', '\n']);

export function canRenderPlainCardFront(source: string): boolean {
  if (!source.length) return false;
  for (const character of source) if (markupCharacters.has(character)) return false;
  return true;
}
