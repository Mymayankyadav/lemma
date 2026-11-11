import { isFlagOn } from "../flags";
/**
 * Screens rebuilt for v7 so far. Every other route keeps the v6/legacy shell until it is
 * migrated, so v7 can be turned off (or a screen rolled back) by one flag.
 */
export type V7Screen = "kit" | "atlas" | "today" | "focus" | "review" | "review-run" | "review-done" | "practice" | "tasks" | "close-day" | "calendar" | "path";
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
  if (path === "/review") return "review";
  if (path === "/practice") return "practice";
  if (path === "/tasks") return "tasks";
  if (path === "/today/close") return "close-day";
  if (path === "/review/run") return "review-run";
  // Only durable runs have a v7 results screen; a local round keeps its existing Done page.
  if (path === "/review/done") return new URLSearchParams(search).has("run") ? "review-done" : null;
  // Day, Week, Month and Agenda are all v7; an unknown view falls back to Day.
  if (path === "/calendar") return "calendar";
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
