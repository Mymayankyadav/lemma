import type { ReviewLogEntry } from "../data/api";
import type { Settings } from "../data/types";
import {
  DEFAULT_W,
  evaluate,
  makeClock,
  optimize,
  parseSteps,
  reviewDataset,
} from "./fsrs";
export interface OptimizerRequest {
  type: "optimize";
  id: string;
  reviews: ReviewLogEntry[];
  settings: Pick<
    Settings,
    "fsrsWeights" | "rolloverHour" | "timeZone" | "relearnSteps"
  >;
}
export type OptimizerMessage =
  | { type: "progress"; id: string; fraction: number }
  | {
      type: "result";
      id: string;
      result: Awaited<ReturnType<typeof runOptimization>>;
    }
  | { type: "error"; id: string; message: string };
export async function runOptimization(
  request: OptimizerRequest,
  onProgress?: (fraction: number) => void,
) {
  const clock = makeClock(
    request.settings.rolloverHour,
    request.settings.timeZone,
  );
  const dataset = reviewDataset(request.reviews, clock),
    start = request.settings.fsrsWeights ?? [...DEFAULT_W];
  const relearn = parseSteps(request.settings.relearnSteps);
  if (!relearn) throw new RangeError("Invalid relearning steps");
  const result = await optimize(dataset.seqs, {
    start,
    numRelearnSteps: relearn.length,
    onProgress,
  });
  return {
    ...result,
    before: evaluate(start, dataset.seqs),
    after: evaluate(result.w, dataset.seqs),
  };
}
// Importing the exported pure runner in tests never installs a window message handler.
if (typeof document === "undefined" && typeof self !== "undefined") {
  self.addEventListener(
    "message",
    async (event: MessageEvent<OptimizerRequest>) => {
      const request = event.data;
      if (request?.type !== "optimize") return;
      const send = (message: OptimizerMessage) => self.postMessage(message);
      try {
        const result = await runOptimization(request, (fraction) =>
          send({ type: "progress", id: request.id, fraction }),
        );
        send({ type: "result", id: request.id, result });
      } catch (error) {
        send({
          type: "error",
          id: request.id,
          message:
            error instanceof Error ? error.message : "Optimization failed",
        });
      }
    },
  );
}
