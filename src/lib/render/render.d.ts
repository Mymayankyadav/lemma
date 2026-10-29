export type LegacyCloze =
  { ord: number; side: "front" | "back" } | "all" | null;
declare const render: {
  render(
    source: string,
    options?: { cloze?: LegacyCloze; inline?: boolean },
  ): string;
  setPreamble(source: string): {
    ok: boolean;
    errors: { line: number; message: string }[];
    count: number;
  };
  clozeOrds(source: string): number[];
  plainText(source: string, max?: number): string;
};
export default render;
