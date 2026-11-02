import { LemmaError } from "../data/api";
import type { IngestProgress } from "../data/types";
import { parsePdf, isPdfFile } from "./parse";
import type { IngestOptions, IngestResult } from "./parse";
import { readTextSource, textKind } from "./text-source";
export {isSourceFile} from "./validate";

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
 const kind=textKind(file);
 if(kind){
  const controller=new AbortController();
  const abort=()=>controller.abort();
  activeReaders.set(file,abort);
  options.signal?.addEventListener("abort",abort,{once:true});
  try{
   if(file.size===0||file.size>50*1024*1024)
    throw new LemmaError("invalid","Choose a nonempty file under 50 MB");
   options.onProgress?.({phase:"reading",page:0,pageCount:0,message:"Reading text"});
   const result=await readTextSource(file,kind);
   if(controller.signal.aborted||cancelledFiles.has(file))throw cancelled();
   if(!result.hasText)throw new LemmaError("invalid","This file has no text");
   options.onProgress?.({phase:"done",page:result.pageCount,pageCount:result.pageCount,message:`${result.pageCount} sections read`});
   return result;
  }finally{
   options.signal?.removeEventListener("abort",abort);
   activeReaders.delete(file);
  }
 }
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
  let worker: Worker | null = null;
  let settled = false;
  let fallbackStarted = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();

  const cleanup = () => {
   clearTimeout(watchdog);
   worker?.terminate();
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
  const onAbort = () => {
   controller.abort();
   finish(undefined, cancelled());
  };
  // A browser may block module-worker loading or PDF.js's nested worker.
  // Recover from that failure without silently dropping a queued PDF.
  // Normal successful extraction always happens off the UI thread.
  const fallback = () => {
   if (settled || fallbackStarted) return;
   fallbackStarted = true;
   clearTimeout(watchdog);
   worker?.terminate();
   void parsePdf(file, {
    onProgress: options.onProgress,
    signal: controller.signal,
   }).then(result => finish(result)).catch(error =>
    finish(undefined, error instanceof Error ? error : new LemmaError("invalid", "Couldn't read this PDF")));
  };
  const armWatchdog = () => {
   clearTimeout(watchdog);
   // Watch for a worker that fails silently before reporting its first page.
   watchdog = setTimeout(fallback, 7000);
  };
  activeReaders.set(file, onAbort);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (cancelledFiles.has(file) || options.signal?.aborted) { onAbort(); return; }

  try {
   worker = new Worker(new URL("./reader.worker.ts", import.meta.url), { type: "module" });
   worker.onmessage = (event: MessageEvent<
    {type: "progress";progress: IngestProgress} | {type: "result";result: IngestResult} | {type: "error";message: string}
   >) => {
    if (settled || fallbackStarted) return;
    const message = event.data;
    if (message.type === "progress") {
     armWatchdog();
     options.onProgress?.(message.progress);
    } else if (message.type === "result") {
     finish(message.result);
    } else {
     fallback();
    }
   };
   worker.onerror = () => fallback();
   worker.postMessage({ file });
   armWatchdog();
  } catch {
   fallback();
  }
 });
}
