import { describe, expect, it } from "vitest";
import { firstProposalFrontLine } from "../../../src/features/proposals/frontPreview";

describe("LOOK-8a mathematical proposal-front first line", () => {
  it("keeps a normal first line with inline mathematics", () => {
    expect(firstProposalFrontLine("\n  Why is $\\mathbb{R}$ complete?\nAnswer below"))
      .toBe("Why is $\\mathbb{R}$ complete?");
  });

  it("does not render an empty row when display maths starts on a delimiter-only line", () => {
    expect(firstProposalFrontLine("\n$$\n\\int_0^1 x^2\\,dx\n$$\nExplain why"))
      .toBe("$\\int_0^1 x^2\\,dx$");
    expect(firstProposalFrontLine("\\[\n\\frac{a}{b}\n\\]\n"))
      .toBe("$\\frac{a}{b}$");
  });

  it("converts a same-line display expression into inline math for a single-row preview", () => {
    expect(firstProposalFrontLine("$$x^2+y^2$$\nProof"))
      .toBe("$x^2+y^2$");
  });

  it("takes the first equation from an aligned display without showing a raw begin marker", () => {
    expect(firstProposalFrontLine("$$\n\\begin{aligned}\na&=b\\\\\nc&=d\n\\end{aligned}\n$$"))
      .toBe("$a=b$");
  });

  it("extracts an equation from standard TeX display environments, not a blank wrapper", () => {
    expect(firstProposalFrontLine("\\begin{equation}\n\\int_0^1 x^2\\,dx\n\\end{equation}\nExplain"))
      .toBe("$\\int_0^1 x^2\\,dx$");
    expect(firstProposalFrontLine("\\begin{align*}\na &= b\\\\\nc &= d\n\\end{align*}"))
      .toBe("$a = b$");
    expect(firstProposalFrontLine("\\begin{equation*}\n\\end{equation*}"))
      .toBe("Mathematical expression");
  });

  it("has a meaningful nonblank fallback for empty display environments", () => {
    expect(firstProposalFrontLine("$$\n$$")).toBe("Mathematical expression");
    expect(firstProposalFrontLine(" \n ")).toBe("");
  });
});
