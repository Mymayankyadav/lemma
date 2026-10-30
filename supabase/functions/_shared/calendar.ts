/** Civil study days, independent of the device zone and 23/25-hour DST days. */
export const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(at: number, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  const p = Object.fromEntries(
    formatter.formatToParts(at).map((x) => [x.type, x.value]),
  );
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
  };
}
function civilStamp(at: number, zone: string) {
  const p = parts(at, zone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
export interface StudyClock {
  rolloverHour: number;
  dayIndex(at: number): number;
  dayStart(index: number): number;
}
export function studyClock(rolloverHour = 4, timeZone = "UTC"): StudyClock {
  if (!Number.isInteger(rolloverHour) || rolloverHour < 0 || rolloverHour > 23)
    throw new RangeError("Invalid rollover hour");
  // Validate the zone immediately, including on an empty dataset.
  parts(0, timeZone);
  return {
    rolloverHour,
    dayIndex(at) {
      const p = parts(at, timeZone);
      return (
        Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY) -
        (p.hour < rolloverHour ? 1 : 0)
      );
    },
    dayStart(index) {
      const target = index * DAY + rolloverHour * 3_600_000;
      const offsets = new Set(
        [-36, -12, 0, 12, 36].map((h) => {
          const at = target + h * 3_600_000;
          return civilStamp(at, timeZone) - at;
        }),
      );
      const candidates = [...offsets]
        .map((offset) => target - offset)
        .sort((a, b) => a - b);
      // Choose the earlier occurrence of a folded hour. A skipped hour moves forward.
      return (
        candidates.find((at) => civilStamp(at, timeZone) === target) ??
        candidates
          .filter((at) => civilStamp(at, timeZone) > target)
          .sort(
            (a, b) => civilStamp(a, timeZone) - civilStamp(b, timeZone),
          )[0] ??
        candidates[candidates.length - 1]
      );
    },
  };
}
export function studyDay(
  at: number,
  timeZone = "UTC",
  rolloverHour = 4,
): string {
  return new Date(studyClock(rolloverHour, timeZone).dayIndex(at) * DAY)
    .toISOString()
    .slice(0, 10);
}
export function studyDayBounds(at: number, timeZone = "UTC", rolloverHour = 4) {
  const clock = studyClock(rolloverHour, timeZone),
    index = clock.dayIndex(at);
  return {
    start: clock.dayStart(index),
    end: clock.dayStart(index + 1),
    index,
  };
}
export function addDays(date: string, days: number): string {
  const epoch = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(epoch)) throw new RangeError("Invalid date");
  return new Date(epoch + days * DAY).toISOString().slice(0, 10);
}
