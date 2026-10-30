import { DAY } from "./calendar";
export function slugify(source: string): string {
  const slug = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug.length >= 2 ? slug : slug ? `${slug}-project` : "project";
}
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes)),
    hours = Math.floor(total / 60),
    rest = total % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
}
export function relativeTime(
  value: string | number,
  now = Date.now(),
  timeZone = "UTC",
): string {
  const at = typeof value === "number" ? value : Date.parse(value),
    elapsed = now - at;
  if (!Number.isFinite(at)) return "";
  if (elapsed < 0) {
    const until = -elapsed;
    if (until < 60_000) return "Just now";
    if (until < 3_600_000) return `in ${Math.ceil(until / 60_000)} min`;
    if (until < DAY) return `in ${Math.ceil(until / 3_600_000)} h`;
  } else {
    if (elapsed < 60_000) return "Just now";
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / 3_600_000)} h ago`;
  }
  return new Intl.DateTimeFormat(
    "en-GB",
    Math.abs(elapsed) < 7 * DAY
      ? { timeZone, weekday: "short" }
      : { timeZone, day: "numeric", month: "short" },
  ).format(at);
}

/** Format non-negative counts with grouped digits and ordinary spaces (12 345). */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.max(0, Math.round(value)).toLocaleString("en-US").replaceAll(",", " ");
}

/** Compact, readable elapsed study time, including multi-day totals. */
export function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const rest = total % 60;
  if (days) return `${formatCount(days)} d${hours ? ` ${hours} h` : ""}`;
  if (hours) return `${hours} h${rest ? ` ${rest} m` : ""}`;
  return `${rest} m`;
}
