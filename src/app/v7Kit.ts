import { isFlagOn } from "../flags";
/** Only the implemented gallery uses v7 until the shell is built. */
export function isV7Kit(
  path = typeof location === "undefined"
    ? ""
    : location.hash.split("?")[0].replace(/^#/, ""),
): boolean {
  return path === "/kit" && isFlagOn("v7Shell");
}
