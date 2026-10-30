import { describe, expect, it } from "vitest";
import { formatCount, formatDurationMinutes } from "../../../src/lib/text";

describe("ST-7 scale-safe formatting", () => {
  it("groups large counts with ordinary spaces and handles invalid input", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(12345)).toBe("12 345");
    expect(formatCount(1234567)).toBe("1 234 567");
    expect(formatCount(-5)).toBe("0");
    expect(formatCount(Infinity)).toBe("—");
  });

  it("shows minutes, hours and days without overflow-prone hour totals", () => {
    expect(formatDurationMinutes(0)).toBe("0 m");
    expect(formatDurationMinutes(59)).toBe("59 m");
    expect(formatDurationMinutes(60)).toBe("1 h");
    expect(formatDurationMinutes(95)).toBe("1 h 35 m");
    expect(formatDurationMinutes(52 * 60)).toBe("2 d 4 h");
    expect(formatDurationMinutes(31 * 1440)).toBe("31 d");
    expect(formatDurationMinutes(31 * 1440 + 60)).toBe("31 d 1 h");
    expect(formatDurationMinutes(-1)).toBe("0 m");
    expect(formatDurationMinutes(NaN)).toBe("—");
  });
});
