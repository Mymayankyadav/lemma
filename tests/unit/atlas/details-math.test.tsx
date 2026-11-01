import { describe, expect, it } from "vitest";
import { renderAllReady } from "../../helpers/renderAllReady";
import { AtlasDetailsTitle, AtlasDetailsPath } from "../../../src/features/atlas/DetailsMath";

describe("FIX #485 mathematical Atlas details", () => {
  it("typesets a fraction in the visible details heading", async () => {
    const html = await renderAllReady(<AtlasDetailsTitle name={String.raw`$\frac{a}{b}$`} />);
    expect(html).toContain("katex-html");
    expect(html).toContain("mfrac");
  });
  it("typesets each breadcrumb without replacing mathematical content by plain text", async () => {
    const html = await renderAllReady(<AtlasDetailsPath names={["Field", String.raw`$\frac{a}{b}$`, String.raw`$\sum_{i=1}^{60}x_i$`]} />);
    expect((html.match(/katex-html/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("overflow-x-auto");
  });
});
