import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../../src/data", () => ({
  getApi: () => ({ getReviewForecast: async () => [] }),
}));
vi.mock("../../../src/data/hooks", () => ({
  useDeckTree: () => ({ data: [] }),
}));

import { ReviewOutlook } from "../../../src/features/home/ReviewOutlook";

function markup(days: { day: string; due: number }[]): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["review-forecast"], days);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ReviewOutlook />
    </QueryClientProvider>,
  );
}

describe("LOOK-5c1 ReviewOutlook rendering", () => {
  it("omits the seven-day chart for a complete zero-due forecast", () => {
    const html = markup(Array.from({ length: 7 }, (_, i) => ({
      day: `2026-11-${String(i + 1).padStart(2, "0")}`,
      due: 0,
    })));
    expect(html).not.toContain('aria-label="Seven-day review forecast"');
    expect(html).not.toContain("Next seven days");
  });

  it("retains seven labelled columns when one day has cards due", () => {
    const html = markup(Array.from({ length: 7 }, (_, i) => ({
      day: `2026-11-${String(i + 1).padStart(2, "0")}`,
      due: i === 3 ? 5 : 0,
    })));
    expect(html).toContain('aria-label="Seven-day review forecast"');
    expect(html).toContain("Next seven days");
    expect((html.match(/aria-label="\d+ cards due"/g) ?? []).length).toBe(7);
  });
  it("keeps positive bars finite when other days have invalid counts", () => {
    const html = markup([
      { day: "2026-11-01", due: Number.NaN },
      { day: "2026-11-02", due: Number.POSITIVE_INFINITY },
      { day: "2026-11-03", due: -8 },
      { day: "2026-11-04", due: 5 },
      { day: "2026-11-05", due: 0 },
      { day: "2026-11-06", due: 0 },
      { day: "2026-11-07", due: 0 },
    ]);
    expect(html).toContain('aria-label="Seven-day review forecast"');
    expect(html).toContain('aria-label="5 cards due"');
    expect(html).toContain("height:40px");
    expect(html).not.toMatch(/NaN|Infinity|-8 cards due/);
  });

});
