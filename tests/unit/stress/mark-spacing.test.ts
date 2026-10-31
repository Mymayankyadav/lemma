import { beforeEach, describe, expect, it } from "vitest";
import { measureSvgMarks } from "../../../scripts/stress-marks";

function setRect(id: string, x: number, y: number, width: number, height: number) {
  const el = document.getElementById(id)!;
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height }),
  });
}
beforeEach(() => { document.body.innerHTML = ""; });

describe("FIX #489 all visible count marks are checked spatially", () => {
  it("finds non-adjacent DOM-order circles that overlap", () => {
    document.body.innerHTML = '<svg><circle id="a" data-stress-mark/><circle id="b" data-stress-mark/><circle id="c" data-stress-mark/></svg>';
    setRect("a", 10, 10, 6, 6);
    setRect("b", 200, 10, 6, 6);
    setRect("c", 10, 10, 6, 6);
    expect(measureSvgMarks()).toBe(0);
  });
  it("finds overlapping rectangular count marks, not just circles", () => {
    document.body.innerHTML = '<svg><rect id="a" data-stress-mark/><rect id="b" data-stress-mark/></svg>';
    setRect("a", 10, 10, 20, 8);
    setRect("b", 18, 12, 20, 8);
    expect(measureSvgMarks()).toBe(0);
  });
  it("detects overlapping SVG path marks", () => {
    document.body.innerHTML = '<svg><path id="a" data-stress-mark/><path id="b" data-stress-mark/></svg>';
    setRect("a", 10, 10, 30, 3);
    setRect("b", 25, 11, 30, 3);
    expect(measureSvgMarks()).toBe(0);
  });
  it("passes well-separated marks and does not count untagged decorations", () => {
    document.body.innerHTML = '<svg><circle id="a" data-stress-mark/><circle id="b" data-stress-mark/><circle id="c"/></svg>';
    setRect("a", 10, 10, 6, 6);
    setRect("b", 60, 10, 6, 6);
    setRect("c", 10, 10, 6, 6);
    expect(measureSvgMarks()).toBe(8); // Budget-capped at 8px.
  });
});
