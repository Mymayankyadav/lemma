import { isFlagOn } from "../flags";
/** Routes rebuilt for v7 so far; every other route keeps the v6/legacy shell until it is migrated. */
export const V7_ROUTES: ReadonlySet<string> = new Set(["/kit", "/atlas"]);
const hashPath = () =>
  typeof location === "undefined" ? "" : location.hash.split("?")[0].replace(/^#/, "");
export function isV7Route(path = hashPath()): boolean {
  return V7_ROUTES.has(path) && isFlagOn("v7Shell");
}
/** The kit gallery check, kept for existing callers. */
export function isV7Kit(path = hashPath()): boolean {
  return path === "/kit" && isFlagOn("v7Shell");
}
