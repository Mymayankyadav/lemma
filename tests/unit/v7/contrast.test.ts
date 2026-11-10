import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = readFileSync("src/ui/v7/tokens.css", "utf8");
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((c) => parseInt(c, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function ratio(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
for (const [i, theme] of ["Day", "Night"].entries())
  it(`${theme} text pairs meet WCAG AA against every specified surface`, () => {
    const block = css.split("[data-v7]")[i ? 2 : 1];
    const tokens = Object.fromEntries(
      [...block.matchAll(/--v7-([\w-]+):\s*(#[\da-fA-F]{6}|#fff)\s*;/g)].map(
        (m) => [m[1], m[2] === "#fff" ? "#ffffff" : m[2]],
      ),
    );
    const pairs = [
      ...["ink", "ink-2", "accent"].flatMap((ink) =>
        ["bg", "bg-raised"].map((bg) => [ink, bg]),
      ),
      ...["bg", "bg-raised", "bg-overlay"].map((bg) => ["ink-3", bg]),
      ["gold", "bg-raised"],
      ...["accent-fill", "accent-fill-hi"].map((bg) => ["white", bg]),
      ...["good", "warning", "serious", "critical"].map((ink) => [
        ink,
        "bg-raised",
      ]),
    ];
    for (const [ink, bg] of pairs)
      expect(
        ratio(tokens[ink] ?? "#ffffff", tokens[bg]),
        `${ink} on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
  });

for (const [i, theme] of ["Day", "Night"].entries())
  it(`${theme} interactive control edges are distinguishable from every form surface`, () => {
    const block = css.split("[data-v7]")[i ? 2 : 1];
    const tokens = Object.fromEntries(
      [...block.matchAll(/--v7-([\w-]+):\s*(#[\da-fA-F]{6}|#fff)\s*;/g)].map(
        (m) => [m[1], m[2] === "#fff" ? "#ffffff" : m[2]],
      ),
    );
    for (const bg of ["bg", "bg-raised", "bg-overlay", "bg-inset"])
      expect(ratio(tokens["control-border"], tokens[bg]), `${theme} edge on ${bg}`).toBeGreaterThanOrEqual(3);
    expect(tokens["good-fill"]).not.toBe(tokens["subject-8"]);
    expect(tokens["focus-ring"]).not.toBe(tokens["control-border"]);
  });
