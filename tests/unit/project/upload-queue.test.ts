import { describe, expect, it } from "vitest";
import { visibleUploadQueue } from "../../../src/features/project/uploadQueue";

const entry = (id: number, phase: "queued" | "reading" | "uploading" | "saving" | "ready" | "failed" | "cancelled" = "queued") => ({
  id, file: null, name: `batch-${id}.pdf`, bytes: 1, pagesRead: 0, phase, progress: null, error: null,
});

describe("FIX #492 bounded source upload queue", () => {
  it("keeps the oldest active PDF visible when 100 files are queued", () => {
    const queue = Array.from({ length: 100 }, (_, i) => entry(i + 1, i === 0 ? "reading" : "queued"));
    const shown = visibleUploadQueue(queue);
    expect(shown.length).toBeLessThanOrEqual(21);
    expect(shown[0].id).toBe(1);
    expect(shown.map(x => x.id)).toContain(100);
  });
  it("keeps an uploading or saving worker visible, with no duplicate rows", () => {
    for (const phase of ["uploading", "saving"] as const) {
      const queue = Array.from({ length: 100 }, (_, i) => entry(i + 1, i === 12 ? phase : "queued"));
      const shown = visibleUploadQueue(queue);
      expect(shown[0].id).toBe(13);
      expect(new Set(shown.map(x => x.id)).size).toBe(shown.length);
    }
  });
  it("shows a bounded recent window when no work is active", () => {
    const queue = Array.from({ length: 100 }, (_, i) => entry(i + 1, "ready"));
    expect(visibleUploadQueue(queue).map(x => x.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 81));
  });
});
