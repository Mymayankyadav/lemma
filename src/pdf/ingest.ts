import { LemmaError } from "../data/api";
import type { IngestProgress } from "../data/types";
import { parsePdf } from "./parse";
import type { IngestOptions, IngestResult } from "./parse";

export { flattenOutline, isPdfFile } from "./parse";
export type { IngestedPage, OutlineItem, IngestOptions, IngestResult } from "./parse";

/** A file's active extraction can be cancelled without changing the existing addSource API. */
const activeReaders = new WeakMap<File, () => void>();
const cancelledFiles = new WeakSet<File>();
export function cancelIngest(file: File): void {
 cancelledFiles.add(file);
 activeReaders.get(file)?.();
}
export function resetIngestCancellation(file: File): void {
 cancelledFiles.delete(file);
}
function cancelled(): LemmaError {
 return new LemmaError("invalid", "PDF reading cancelled");
}

/** Parsing and text extraction run off the UI thread in browsers. Node tests use the same parser inline. */
export async function ingest(file: File, options: IngestOptions = {}): Promise<IngestResult> {
 if (cancelledFiles.has(file) || options.signal?.aborted) throw cancelled();
 if (typeof window === "undefined" || typeof Worker === "undefined") {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  activeReaders.set(file, abort);
  try {
   return await parsePdf(file, { onProgress: options.onProgress, signal: controller.signal });
  } finally {
   options.signal?.removeEventListener("abort", abort);
   activeReaders.delete(file);
  }
 }
 return new Promise<IngestResult>((resolve, reject) => {
  const worker = new Worker(new URL("./reader.worker.ts", import.meta.url), { type: "module" });
  let settled = false;
  const cleanup = () => {
   worker.terminate();
   activeReaders.delete(file);
   options.signal?.removeEventListener("abort", onAbort);
  };
  const finish = (result?: IngestResult, error?: Error) => {
   if (settled) return;
   settled = true;
   cleanup();
   if (error) reject(error);
   else resolve(result!);
  };
  const onAbort = () => finish(undefined, cancelled());
  activeReaders.set(file, onAbort);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  worker.onmessage = (event: MessageEvent<
   {type: "progress";progress: IngestProgress} | {type: "result";result: IngestResult} | {type: "error";message: string}
  >) => {
   const message = event.data;
   if (message.type === "progress") options.onProgress?.(message.progress);
   else if (message.type === "result") finish(message.result);
   else finish(undefined, new LemmaError("invalid", message.message));
  };
  worker.onerror = () => finish(undefined, new LemmaError("invalid", "Couldn't read this PDF"));
  if (cancelledFiles.has(file) || options.signal?.aborted) { onAbort(); return; }
  worker.postMessage({ file });
 });
}
