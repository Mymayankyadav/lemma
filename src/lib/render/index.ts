import "./globals";
import DOMPurify from "dompurify";
import renderer from "./render.js";
export interface RenderOptions {
  macros?: string;
  cloze?: { ord: number; revealed: boolean };
}
let activeMacros: string | undefined;
export function renderMarkdown(
  source: string,
  options: RenderOptions = {},
): string {
  const macros = options.macros ?? "";
  if (activeMacros !== macros) {
    renderer.setPreamble(macros);
    activeMacros = macros;
  }
  const cloze = options.cloze
    ? {
        ord: options.cloze.ord,
        side: options.cloze.revealed ? ("back" as const) : ("front" as const),
      }
    : null;
  const html = renderer
    .render(source, { cloze })
    .replaceAll(
      '<span class="cz czq">[…]</span>',
      '<span class="cz czq">[ … ]</span>',
    );
  // Sanitize the final math-inclusive output as well as the legacy Markdown stage.
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["data-ref", "data-steps", "role", "tabindex"],
    FORBID_TAGS: ["style", "form", "textarea", "select", "button"],
  });
}
export const clozeOrds = (source: string) =>
  renderer.clozeOrds(source).filter((ord) => ord > 0);
export const plainText = (source: string, max = 140) =>
  renderer.plainText(source, max);
