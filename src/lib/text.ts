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
