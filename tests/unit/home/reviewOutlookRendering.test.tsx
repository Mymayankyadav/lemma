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
});
