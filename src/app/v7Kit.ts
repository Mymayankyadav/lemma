import { isFlagOn } from "../flags";
/**
 * Screens rebuilt for v7 so far. Every other route keeps the v6/legacy shell until it is
 * migrated, so v7 can be turned off (or a screen rolled back) by one flag.
 */
export type V7Screen = "kit" | "atlas" | "today" | "focus" | "review-run" | "calendar-day" | "path";
const hashLocation = () => {
  if (typeof location === "undefined") return { path: "", search: "" };
  const raw = location.hash.replace(/^#/, ""), at = raw.indexOf("?");
  return at < 0 ? { path: raw, search: "" } : { path: raw.slice(0, at), search: raw.slice(at) };
};
/** Which v7 screen owns a route, regardless of the flag. */
export function v7ScreenFor(path: string, search = ""): V7Screen | null {
  if (path === "/kit") return "kit";
  if (path === "/atlas") return "atlas";
  if (path === "/" || path === "") return "today";
  if (path === "/focus") return "focus";
  if (path === "/review/run") return "review-run";
  if (path === "/calendar") {
    // Day is the v7 default; Week, Month and Agenda keep the v6 views until their own parts.
    const view = new URLSearchParams(search).get("view");
    return !view || view === "day" ? "calendar-day" : null;
  }
  if (/^\/p\/[^/]+$/.test(path)) return "path";
  return null;
}
export function v7Screen(path?: string, search?: string): V7Screen | null {
  if (!isFlagOn("v7Shell")) return null;
  const current = hashLocation();
  return v7ScreenFor(path ?? current.path, search ?? (path === undefined ? current.search : ""));
}
export function isV7Route(path?: string, search?: string): boolean {
  return v7Screen(path, search) !== null;
}
/** The kit gallery check, kept for existing callers. */
export function isV7Kit(path = hashLocation().path): boolean {
  return path === "/kit" && isFlagOn("v7Shell");
}
