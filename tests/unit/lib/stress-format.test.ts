import { describe, expect, it } from "vitest";
import { formatBadgeCount, formatCount, formatDurationMinutes } from "../../../src/lib/text";
import { summarizeSubjects } from "../../../src/features/insights/InkRules";

describe("ST-7 scale-safe formatting", () => {
  it("groups large counts with ordinary spaces and handles invalid input", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(12345)).toBe("12 345");
    expect(formatCount(1234567)).toBe("1 234 567");
    expect(formatCount(-5)).toBe("0");
    expect(formatCount(Infinity)).toBe("—");
    expect(formatBadgeCount(999)).toBe("999");
    expect(formatBadgeCount(1000)).toBe("999+");
    expect(formatBadgeCount(4000)).toBe("999+");
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

describe("ST-7 subject grouping", () => {
  it("preserves every minute while limiting the default view to six subjects", () => {
    const data = Array.from({ length: 40 }, (_, i) => ({
      subject: { name: `Subject ${i + 1}`, glyph: "∑" },
      minutes: i + 1,
    }));
    const original = [...data];
    const { top, other, otherMinutes } = summarizeSubjects(data);
    expect(top).toHaveLength(6);
    expect(top.map(row => row.minutes)).toEqual([40, 39, 38, 37, 36, 35]);
    expect(other).toHaveLength(34);
    expect(otherMinutes).toBe(34 * 35 / 2);
    expect(top.reduce((sum, row) => sum + row.minutes, 0) + otherMinutes)
      .toBe(data.reduce((sum, row) => sum + row.minutes, 0));
    expect(data).toEqual(original);
  });
});
