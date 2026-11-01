import { describe, expect, it } from "vitest";
import { forecastDueCount, hasNonzeroForecast } from "../../../src/features/home/reviewForecast";

describe("LOOK-5c1 quiet review forecast", () => {
  it("hides an empty or entirely zero seven-day forecast", () => {
    expect(hasNonzeroForecast([])).toBe(false);
    expect(hasNonzeroForecast(Array.from({ length: 7 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, "0")}`, due: 0 })))).toBe(false);
  });

  it("retains the seven-day spark when any day has cards due", () => {
    expect(hasNonzeroForecast([{ day: "2026-11-01", due: 0 }, { day: "2026-11-02", due: 3 }])).toBe(true);
    expect(hasNonzeroForecast([{ day: "2026-11-01", due: 4000 }])).toBe(true);
  });

  it("does not treat invalid or negative counts as a scheduled review", () => {
    expect(hasNonzeroForecast([{ due: -1 }, { due: Number.NaN }])).toBe(false);
  });
  it("does not hide a positive but fractional legacy count", () => {
    expect(hasNonzeroForecast([{ due: 0.5 }])).toBe(true);
    expect(forecastDueCount(0.5)).toBe(1);
    expect(forecastDueCount(-0.5)).toBe(0);
    expect(forecastDueCount(Number.POSITIVE_INFINITY)).toBe(0);
  });

});
