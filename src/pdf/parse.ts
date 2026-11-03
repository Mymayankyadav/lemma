import {
  getDocument,
  GlobalWorkerOptions,
  PasswordException,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { LemmaError } from "../data/api";
import type { IngestProgress } from "../data/types";
import { normalizePageText } from "./text";
import {isPdfFile} from "./validate";
export {isPdfFile} from "./validate";

GlobalWorkerOptions.workerSrc = workerUrl;
export interface IngestedPage {
  page: number;
  label: string;
  body: string;
}
export interface OutlineItem {
  title: string;
  page: number;
  level: number;
}
export interface IngestResult {
  pageCount: number;
  pages: IngestedPage[];
  outline: OutlineItem[];
  hasText: boolean;
}
export interface IngestOptions {
  onProgress?: (progress: IngestProgress) => void;
  signal?: AbortSignal;
}
interface PdfOutline {
  title: string;
  dest: string | unknown[] | null;
  items?: PdfOutline[];
}

async function readBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}
async function outlinePage(
  document: PDFDocumentProxy,
  dest: PdfOutline["dest"],
): Promise<number | null> {
  try {
    const target =
      typeof dest === "string" ? await document.getDestination(dest) : dest;
    if (!target?.length) return null;
    const ref: unknown = target[0];
    let index: number;
    if (typeof ref === "number" && Number.isInteger(ref)) index = ref;
    else if (
      ref &&
      typeof ref === "object" &&
      "num" in ref &&
      "gen" in ref &&
      typeof ref.num === "number" &&
      typeof ref.gen === "number"
    )
      index = await document.getPageIndex({ num: ref.num, gen: ref.gen });
    else return null;
    return index >= 0 && index < document.numPages ? index + 1 : null;
  } catch {
    return null;
  } // A broken bookmark does not discard readable pages.
}
export async function flattenOutline(
  document: PDFDocumentProxy,
  roots: readonly PdfOutline[],
): Promise<OutlineItem[]> {
  const result: OutlineItem[] = [],
    stack = roots.map((node) => ({ node, level: 0 })).reverse();
  while (stack.length) {
    const { node, level } = stack.pop()!;
    const page = await outlinePage(document, node.dest);
    if (page !== null)
      result.push({
        title: node.title.replace(/\s+/g, " ").trim(),
        page,
        level,
      });
    for (const child of [...(node.items ?? [])].reverse())
      stack.push({ node: child, level: level + 1 });
  }
  return result;
}
/** Read a local PDF only. Adapters own uploads and source_pages persistence. */
export async function parsePdf(
  file: File,
  { onProgress, signal }: IngestOptions = {},
): Promise<IngestResult> {
  let task: PDFDocumentLoadingTask | undefined,
    pageCount = 0,
    page = 0;
  try {
    if (signal?.aborted) throw new LemmaError("invalid", "PDF reading cancelled");
    if (
      file.size === 0 ||
      file.size > 50 * 1024 * 1024 ||
      !isPdfFile(file)
    )
      throw new LemmaError("invalid", "Choose a PDF under 50 MB");
    onProgress?.({
      phase: "reading",
      page,
      pageCount,
      message: "Reading pages",
    });
    task = getDocument({
      data: new Uint8Array(await readBytes(file)),
      useSystemFonts: true,
    });
    const document = await task.promise;
    pageCount = document.numPages;
    if (pageCount > 1200) onProgress?.({ phase: "reading", page: 0, pageCount, message: `Large PDF: ${pageCount} pages. Reading may be slow; consider splitting by chapter.` });
    onProgress?.({
      phase: "reading",
      page,
      pageCount,
      message: "Reading pages",
    });
    const labels = await document.getPageLabels(),
      pages: IngestedPage[] = [];
    for (page = 1; page <= pageCount; page++) {
      if (signal?.aborted) throw new LemmaError("invalid", "PDF reading cancelled");
      const pdfPage = await document.getPage(page);
      try {
        const content = await pdfPage.getTextContent();
        pages.push({
          page,
          label: labels?.[page - 1] ?? String(page),
          body: normalizePageText(
            content.items.filter(
              (item): item is Extract<typeof item, { str: string }> =>
                "str" in item,
            ),
          ),
        });
      } finally {
        pdfPage.cleanup();
      }
      onProgress?.({
        phase: "reading",
        page,
        pageCount,
        message: "Reading pages",
      });
    }
    const outline = await flattenOutline(
      document,
      (await document.getOutline()) ?? [],
    );
    const result = {
      pageCount,
      pages,
      outline,
      hasText:
        pages.reduce((total, p) => total + p.body.length, 0) / pageCount >= 30,
    };
    onProgress?.({
      phase: "done",
      page: pageCount,
      pageCount,
      message: `${pageCount}/${pageCount} pages read`,
    });
    return result;
  } catch (error) {
    const failure =
      error instanceof LemmaError
        ? error
        : new LemmaError(
            "invalid",
            error instanceof PasswordException
              ? "This PDF is password-protected"
              : "Couldn't read this PDF",
          );
    onProgress?.({
      phase: "failed",
      page: Math.min(page, pageCount),
      pageCount,
      message: failure.message,
    });
    throw failure;
  } finally {
    await task?.destroy().catch(() => undefined);
  }
}
