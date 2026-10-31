import { describe, expect, it } from "vitest";
import { relativeTime } from "../../../src/lib/text";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("relativeTime", () => {
  it("shows future due dates as upcoming, not Just now", () => {
    expect(relativeTime(at(2 * 60_000), NOW)).toBe("in 2 min");
    expect(relativeTime(at(90 * 60_000), NOW)).toBe("in 2 h");
    expect(relativeTime(at(59_000), NOW)).toBe("Just now");
    expect(relativeTime(at(60_000), NOW)).toBe("in 1 min");
  });

  it("uses civil dates for future days and the requested time zone", () => {
    expect(relativeTime(at(2 * 86_400_000), NOW, "UTC")).toBe("Sun");
    expect(relativeTime(at(15 * 86_400_000), NOW, "UTC")).toBe("14 Nov");
    expect(relativeTime("2026-11-01T22:00:00.000Z", NOW, "Asia/Kolkata")).toBe("Mon");
  });

  it("preserves elapsed labels and handles invalid dates", () => {
    expect(relativeTime(at(-2 * 60_000), NOW)).toBe("2 min ago");
    expect(relativeTime(at(-2 * 3_600_000), NOW)).toBe("2 h ago");
    expect(relativeTime(at(-2 * 86_400_000), NOW, "UTC")).toBe("Wed");
    expect(relativeTime(at(-15 * 86_400_000), NOW, "UTC")).toBe("15 Oct");
    expect(relativeTime(at(-59_000), NOW)).toBe("Just now");
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });
});
