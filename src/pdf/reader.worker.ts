import { parsePdf } from "./parse";
import type { IngestProgress } from "../data/types";

type ReaderMessage = { file: File };
self.onmessage = (event: MessageEvent<ReaderMessage>) => {
 void parsePdf(event.data.file, {
  onProgress: (progress: IngestProgress) => self.postMessage({ type: "progress", progress }),
 }).then(result => {
  self.postMessage({ type: "result", result });
 }).catch(error => {
  self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Couldn't read this PDF" });
 });
};
