import type { IngestResult, OutlineItem } from "./ingest";
import {textKind} from "./validate";
import type {TextKind} from "./validate";
export {textKind} from "./validate";
export type {TextKind} from "./validate";

/**
 * LaTeX (.tex) and Markdown (.md) sources: read as text, split into pages at
 * chapters and sections (or headings), so read_pages, search and citations
 * work on them like PDF pages. No file is stored; the text is the source.
 */
export const MAX_PAGE_CHARS = 8000;
const TARGET_CHARS = 6000;

interface Section { title: string | null; level: number; body: string }

/** Keep the document body only: the preamble is setup, not content. */
function texBody(source: string): string {
  const begin = source.indexOf("\\begin{document}");
  const end = source.lastIndexOf("\\end{document}");
  const body = begin >= 0 ? source.slice(begin + "\\begin{document}".length, end > begin ? end : undefined) : source;
  return body.replace(/\\maketitle\b/g, "").trim();
}

function texSections(body: string): Section[] {
  const re = /\\(chapter|section|subsection)\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  const level: Record<string, number> = { chapter: 0, section: 1, subsection: 2 };
  // Split at chapters and sections; subsections stay inside their section unless it is too long.
  const marks: { at: number; title: string; level: number }[] = [];
  for (const m of body.matchAll(re)) if (m[1] !== "subsection") marks.push({ at: m.index!, title: m[2].trim(), level: level[m[1]] });
  return splitAt(body, marks);
}

function mdSections(text: string): Section[] {
  const marks: { at: number; title: string; level: number }[] = [];
  let fence: { marker: string; length: number } | null = null, offset = 0;
  for (const line of text.split("\n")) {
    // CommonMark fences may use backticks or tildes. A closer must use the
    // same character and at least the opener's length, with no info string.
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const marker = match[1][0];
      if (fence === null && (marker !== "`" || !match[2].includes("`"))) {
        fence = { marker, length: match[1].length };
      } else if (fence !== null && marker === fence.marker &&
                 match[1].length >= fence.length && /^[ \t]*$/.test(match[2])) {
        fence = null;
      }
    }
    const m = fence === null && /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) marks.push({ at: offset, title: m[2], level: m[1].length - 1 });
    offset += line.length + 1;
  }
  return splitAt(text, marks);
}

function splitAt(text: string, marks: { at: number; title: string; level: number }[]): Section[] {
  const out: Section[] = [];
  const lead = text.slice(0, marks[0]?.at ?? text.length).trim();
  if (lead) out.push({ title: null, level: 0, body: lead });
  marks.forEach((m, i) => {
    const body = text.slice(m.at, marks[i + 1]?.at ?? text.length).trim();
    if (body) out.push({ title: m.title, level: m.level, body });
  });
  return out;
}

/** Long sections become several pages, broken at blank lines (never inside a word). */
function chunk(body: string): string[] {
  if (body.length <= MAX_PAGE_CHARS) return [body];
  const parts: string[] = [];
  let current = "";
  for (const para of body.split(/\n{2,}/)) {
    if (current && current.length + para.length + 2 > TARGET_CHARS) { parts.push(current); current = ""; }
    if (para.length > MAX_PAGE_CHARS) {
      for (let i = 0; i < para.length; i += MAX_PAGE_CHARS) parts.push(para.slice(i, i + MAX_PAGE_CHARS));
      continue;
    }
    current = current ? current + "\n\n" + para : para;
  }
  if (current) parts.push(current);
  return parts;
}

export function splitTextSource(text: string, kind: TextKind): IngestResult {
  const clean = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
  const sections = kind === "tex" ? texSections(texBody(clean)) : mdSections(clean);
  const pages: IngestResult["pages"] = [], outline: OutlineItem[] = [];
  for (const section of sections.length ? sections : [{ title: null, level: 0, body: clean.trim() }]) {
    const first = pages.length + 1;
    if (section.title) outline.push({ title: section.title.replace(/\s+/g, " ").slice(0, 200), page: first, level: section.level });
    for (const body of chunk(section.body)) pages.push({ page: pages.length + 1, label: String(pages.length + 1), body });
  }
  return { pageCount: pages.length, pages, outline, hasText: pages.some((p) => p.body.trim().length > 0) };
}

export async function readTextSource(file: File, kind: TextKind): Promise<IngestResult> {
  const text = typeof file.text === "function" ? await file.text() : await new Response(file).text();
  return splitTextSource(text, kind);
}
