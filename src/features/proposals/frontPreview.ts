/**
 * A proposal checklist needs one *visible* mathematical line. A tutor may put
 * display-math delimiters on their own lines, so the first nonblank source
 * line can be only "$$" or "\[". Rendering that delimiter alone produces an
 * empty row even though the card has mathematical content.
 *
 * The full, unmodified front remains in the selected proposal card below.
 */
export function firstProposalFrontLine(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
  const first = lines[0];
  if (!first) return "";

  if (first === "$$" || first === "\\[") {
    const closing = first === "$$" ? "$$" : "\\]";
    const end = lines.indexOf(closing, 1);
    const body = lines.slice(1, end < 0 ? undefined : end);
    // A multi-line aligned display starts with a structural TeX command.
    // Show its first equation rather than a blank \begin{aligned} marker.
    const equation = body.find(line => !/^\\(?:begin|end)\{/.test(line));
    const oneLine = equation?.replace(/\\\\\s*$/, "").replace(/&/g, "").trim();
    return oneLine ? "$" + oneLine + "$" : "Mathematical expression";
  }

  // TeX often wraps a card front in a named display environment rather than
  // $$ delimiters. A preview of the opening \begin line alone is blank.
  const environment = /^\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}$/.exec(first)?.[1];
  if (environment) {
    const closing = "\\end{" + environment + "}";
    const end = lines.indexOf(closing, 1);
    const body = lines.slice(1, end < 0 ? undefined : end);
    const equation = body.find(line => !/^\\(?:begin|end|label|tag|notag)\b/.test(line));
    const oneLine = equation?.replace(/\\\\\s*$/, "").replace(/&/g, "").trim();
    return oneLine ? "$" + oneLine + "$" : "Mathematical expression";
  }

  if (first.startsWith("$$") && first.endsWith("$$") && first.length > 4) {
    return "$" + first.slice(2, -2).trim() + "$";
  }
  if (first.startsWith("\\[") && first.endsWith("\\]") && first.length > 4) {
    return "$" + first.slice(2, -2).trim() + "$";
  }
  return first;
}
