/** Preserve line structure, remove extraction noise, and rejoin split words. */
export function normalizePageText(
  items: readonly { str: string; hasEOL?: boolean }[],
): string {
  return items
    .map((item) => item.str + (item.hasEOL ? "\n" : " "))
    .join("")
    .replace(/\u0000/g, "")
    .replace(/(\p{L})-[ \t]*\n\s*(?=\p{L})/gu, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20_000);
}
