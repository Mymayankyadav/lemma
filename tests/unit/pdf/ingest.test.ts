// @vitest-environment node
import { readFile } from "node:fs/promises";
import { it, expect, vi } from "vitest";
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({
  default: new URL(
    "../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).href,
}));
import { ingest, flattenOutline, isPdfFile, isSourceFile, cancelIngest, resetIngestCancellation } from "../../../src/pdf/ingest";
import { normalizePageText } from "../../../src/pdf/text";
import type { IngestProgress } from "../../../src/data/types";

it("reads real PDF text, printed labels, outline page index and split words", async () => {
  const bytes = await readFile(
    new URL("../../fixtures/sample.pdf", import.meta.url),
  );
  const progress: IngestProgress[] = [];
  const result = await ingest(
    new File([bytes], "sample.pdf", { type: "application/pdf" }),
    { onProgress: (event) => progress.push(event) },
  );
  expect(result.pageCount).toBe(3);
  expect(result.pages.map((p) => p.label)).toEqual(["i", "1", "2"]);
  expect(result.pages[1].body).toContain(
    "compact set admits a finite subcover",
  );
  expect(result.pages[1].body).not.toContain("com-");
  expect(result.outline).toEqual([{ title: "Compactness", page: 2, level: 0 }]);
  expect(result.hasText).toBe(true);
  expect(progress.at(-1)).toMatchObject({
    phase: "done",
    page: 3,
    pageCount: 3,
  });
  expect(
    progress
      .filter((p) => p.phase === "reading" && p.page > 0)
      .map((p) => p.page),
  ).toEqual([1, 2, 3]);
});
it("accepts a real PDF with a generic mobile document-provider MIME", async () => {
  const bytes = await readFile(new URL("../../fixtures/sample.pdf", import.meta.url));
  const result = await ingest(new File([bytes], "mobile.pdf", { type: "application/octet-stream" }));
  expect(result.pageCount).toBe(3);
  expect(result.pages[1].body).toContain("finite subcover");
  expect(isPdfFile({ name: "legacy.pdf", type: "application/x-pdf" })).toBe(true);
  expect(isPdfFile({ name: "not-pdf.pdf", type: "text/plain" })).toBe(false);
});
it("rejects unsupported, oversized and corrupt PDFs with a failed phase", async () => {
  await expect(ingest(new File(["not a PDF"], "fake.pdf", { type: "text/plain" })))
    .rejects.toMatchObject({ code: "invalid", message: "Choose a PDF under 50 MB" });
  await expect(
    ingest(new File(["hi"], "sample.txt", { type: "text/plain" })),
  ).rejects.toMatchObject({
    code: "invalid",
    message: "Choose a PDF under 50 MB",
  });
  const oversized = new File(["%PDF-"], "big.pdf", { type: "application/pdf" });
  Object.defineProperty(oversized, "size", { value: 50 * 1024 * 1024 + 1 });
  await expect(ingest(oversized)).rejects.toMatchObject({ code: "invalid" });
  const progress: IngestProgress[] = [];
  await expect(
    ingest(new File(["%PDF-invalid"], "bad.pdf", { type: "application/pdf" }), {
      onProgress: (p) => progress.push(p),
    }),
  ).rejects.toMatchObject({
    code: "invalid",
    message: "Couldn't read this PDF",
  });
  expect(progress.at(-1)?.phase).toBe("failed");
});
it("normalizes spacing and caps each page without joining real paragraph breaks", () => {
  expect(
    normalizePageText([
      { str: "A com-", hasEOL: true },
      { str: "pact  set", hasEOL: true },
      { str: "", hasEOL: true },
      { str: "Next paragraph" },
    ]),
  ).toBe("A compact set\n\nNext paragraph");
  expect(normalizePageText([{ str: "a".repeat(30000) }])).toHaveLength(20000);
});
it("resolves named, numeric and nested destinations while skipping broken bookmarks", async () => {
  const document = {
    numPages: 3,
    getDestination: async (name: string) =>
      name === "named" ? [{ num: 4, gen: 0 }] : null,
    getPageIndex: async () => 1,
  };
  const result = await flattenOutline(
    document as Parameters<typeof flattenOutline>[0],
    [
      {
        title: "Chapter",
        dest: "named",
        items: [{ title: "Part", dest: [2] }],
      },
      {
        title: "Broken",
        dest: "missing",
        items: [{ title: "Readable child", dest: [0] }],
      },
    ],
  );
  expect(result).toEqual([
    { title: "Chapter", page: 2, level: 0 },
    { title: "Part", page: 3, level: 1 },
    { title: "Readable child", page: 1, level: 1 },
  ]);
});

it("cancels reading between pages without saving an incomplete extraction", async () => {
  const bytes=await readFile(new URL("../../fixtures/sample.pdf",import.meta.url));
  const file=new File([bytes],"cancel.pdf",{type:"application/pdf"});
  await expect(ingest(file,{onProgress:p=>{
    if(p.phase==="reading"&&p.page===1)cancelIngest(file);
  }})).rejects.toMatchObject({code:"invalid",message:"PDF reading cancelled"});
  resetIngestCancellation(file);
  const complete=await ingest(file);
  expect(complete.pageCount).toBe(3);
});

it("preserves UI-8 Markdown imports and supports cancelling before extraction",async()=>{
 const file=new File(["# Definitions\nAn open cover.\n## Compactness\nA finite subcover."],"notes.md",{type:"text/markdown"});
 expect(isSourceFile(file)).toBe(true);
 cancelIngest(file);
 await expect(ingest(file)).rejects.toMatchObject({code:"invalid",message:"PDF reading cancelled"});
 resetIngestCancellation(file);
 const progress:IngestProgress[]=[];
 const result=await ingest(file,{onProgress:p=>progress.push(p)});
 expect(result.pageCount).toBe(2);
 expect(result.pages[1].body).toContain("finite subcover");
 expect(progress.at(-1)?.phase).toBe("done");
});
