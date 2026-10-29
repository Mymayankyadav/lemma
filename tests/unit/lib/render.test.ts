import { it, expect } from "vitest";
import "../../../src/lib/render/globals";
import Render from "../../../src/lib/render/render.js";
import { renderMarkdown, clozeOrds, plainText } from "../../../src/lib/render";
it("passes all preserved Markdown, math, cloze, theorem and sanitization cases", () => {
  const out: {
    name: string;
    ok: boolean;
    fails?: unknown;
    err?: unknown;
    html?: string;
  }[] = [];
  const T = (
    name: string,
    src: string,
    opts: Parameters<typeof Render.render>[1] | null,
    checks: [string, (html: string) => boolean][],
  ) => {
    let html;
    try {
      html = Render.render(src, opts || {});
    } catch (e) {
      out.push({ name, ok: false, err: String(e) });
      return;
    }
    const fails = checks.filter(([desc, fn]) => !fn(html)).map(([d]) => d);
    out.push({
      name,
      ok: !fails.length,
      fails,
      html: html.length > 600 ? html.slice(0, 600) + "…" : html,
    });
  };
  const has = (s: string) => (h: string) => h.includes(s);
  const not = (s: string) => (h: string) => !h.includes(s);
  T("inline math", "Let $x^2 + y_1$ be *nice*.", null, [
    ["katex", has('class="katex"')],
    ["em", has("<em>nice</em>")],
    ["no $", not("$")],
  ]);
  T("display $$", "Before\n$$\\int_0^1 f(x)\\,dx$$\nAfter", null, [
    ["display", has("katex-display")],
    ["no br before", (h) => !/<br>\s*<span class="katex-display/.test(h)],
  ]);
  T("dollars as money", "It costs $5 and $10 today.", null, [
    ["no katex", not("katex")],
    ["text kept", has("$5 and $10")],
  ]);
  T("escaped dollar", "Price \\$3, math $a$", null, [
    ["one katex", (h) => (h.match(/class="katex"/g) || []).length === 1],
    ["literal $", has("$3")],
  ]);
  T(
    "underscores in math untouched by markdown",
    "$a_1 * b_2 * c$ and _real em_",
    null,
    [
      ["em outside", has("<em>real em</em>")],
      ["no em inside", (h) => !/<em>1/.test(h)],
    ],
  );
  T("align env", "\\begin{align} a &= b \\\\ c &= d \\end{align}", null, [
    ["display", has("katex-display")],
    ["no error", not("katex-error")],
  ]);
  T(
    "\\( \\) and \\[ \\]",
    "Inline \\(\\alpha\\) and block \\[\\beta\\]",
    null,
    [["two katex", (h) => (h.match(/class="katex"/g) || []).length === 2]],
  );
  T("code untouched", "Use `$x$` literally\n\n```\n$$ not math $$\n```", null, [
    ["no katex", not("katex")],
    ["code", has("<code>$x$</code>")],
  ]);
  T(
    "cloze front text",
    "The capital is {{c1::Paris::city}} and {{c2::Rome}}.",
    { cloze: { ord: 1, side: "front" } },
    [
      ["hint", has("[city]")],
      ["c2 shown", has("Rome")],
      ["answer hidden", not("Paris")],
    ],
  );
  T(
    "cloze back text",
    "The capital is {{c1::Paris::city}} and {{c2::Rome}}.",
    { cloze: { ord: 1, side: "back" } },
    [["answer", has('<span class="cz cza">Paris</span>')]],
  );
  T(
    "cloze inside math front",
    "$$\\int_a^b f'(x)\\,dx = {{c1::f(b) - f(a)}}$$",
    { cloze: { ord: 1, side: "front" } },
    [
      ["katex", has("katex-display")],
      ["czq class", has("czq")],
      [
        "hidden",
        (h) => !/f\(b\)|<mi>b<\/mi><mo stretchy="false">\)<\/mo><mo>−/.test(h),
      ],
      ["no error", not("katex-error")],
    ],
  );
  T(
    "cloze inside math back",
    "$\\sum_{n=1}^\\infty \\frac{1}{n^2} = {{c1::\\frac{\\pi^2}{6}}}$",
    { cloze: { ord: 1, side: "back" } },
    [
      ["cza class", has("cza")],
      ["no error", not("katex-error")],
    ],
  );
  T(
    "math inside cloze",
    "Euler: {{c1::$e^{i\\pi}+1=0$}}",
    { cloze: { ord: 1, side: "back" } },
    [
      [
        "span wraps katex",
        (h) => /<span class="cz cza"><span class="katex">/.test(h),
      ],
    ],
  );
  T(
    "nested braces cloze",
    "{{c1::\\frac{a}{b}}}",
    { cloze: { ord: 1, side: "back" } },
    [["content", has("\\frac{a}{b}")]],
  );
  T(
    "theorem env",
    ":::theorem[Bolzano–Weierstrass]\nEvery bounded sequence in $\\mathbb{R}^n$ has a convergent subsequence.\n:::",
    null,
    [
      ["env", has("env-plain")],
      [
        "head inline",
        has(
          '<p><span class="env-h">Theorem <span class="env-t">(Bolzano–Weierstrass)</span>.</span> Every',
        ),
      ],
      ["math", has("katex")],
    ],
  );
  T("proof qed", ":::proof\nTrivial.\n:::", null, [
    ["qed", has('class="qed"')],
  ]);
  T(
    "stepwise proof",
    ":::proof*\n1. First step $a$\n2. Second step\n3. Third\n:::",
    null,
    [
      ["data-steps", has("data-steps")],
      ["ol", has("<ol>")],
    ],
  );
  T("hint", ":::hint\nThink about $\\epsilon$.\n:::", null, [
    ["details", has('<details class="env env-hint">')],
  ]);
  T(
    "nested envs",
    ":::theorem\nStatement.\n:::hint\nInner hint\n:::\n:::",
    null,
    [["both", (h) => h.includes("env-plain") && h.includes("env-hint")]],
  );
  T("wikilink", "Uses [[Rolle's theorem]] and [[mvt|the MVT]].", null, [
    [
      "ref",
      (h) =>
        h.includes('data-ref="Rolle&#39;s theorem"') ||
        h.includes('data-ref="Rolle\'s theorem"'),
    ],
    ["label", has(">the MVT</a>")],
  ]);
  T("highlight", "This is ==key== text", null, [
    ["mark", has("<mark>key</mark>")],
  ]);
  T(
    "xss",
    '<img src=x onerror="alert(1)"><script>alert(2)</script>[x](javascript:alert(3))',
    null,
    [
      ["no onerror", not("onerror")],
      ["no script", not("<script")],
      ["no js url", not("javascript:")],
    ],
  );
  T(
    "media",
    "![diagram](media:img1)",
    { media: { img1: "data:image/png;base64,iVBORw0KGgo=" }, mediaKey: "k" },
    [["data url", has('src="data:image/png')]],
  );
  T(
    "unclosed container while typing",
    ":::definition[Group]\nA set with",
    null,
    [["env", has("env-def")]],
  );
  T("katex error is contained", "$\\frac{a$ and more", null, [
    ["still renders", has("more")],
  ]);
  T("table", "| a | b |\n|---|---|\n| $x$ | 2 |", null, [
    ["table", has("<table>")],
    ["math", has("katex")],
  ]);
  const pre = Render.setPreamble(
    "\\newcommand{\\R}{\\mathbb{R}}\n\\DeclareMathOperator{\\tr}{tr}\n\\newcommand{\\norm}[1]{\\left\\lVert#1\\right\\rVert}",
  );
  out.push({ name: "preamble", ok: pre.ok, fails: pre.errors });
  T("macros used", "$\\tr(A) \\in \\R$, $\\norm{x}$", null, [
    ["no error", not("katex-error")],
    ["tr", has("tr")],
  ]);
  out.push({
    name: "clozeOrds",
    ok:
      JSON.stringify(Render.clozeOrds("{{c2::a}} {{c1::b}} {{c2::c}}")) ===
      "[1,2]",
  });
  out.push({
    name: "plainText",
    ok: Render.plainText(
      ":::theorem[MVT]\nIf $f$ is **continuous**\n:::",
    ).startsWith("MVT: If f is continuous"),
    fails: [Render.plainText(":::theorem[MVT]\nIf $f$ is **continuous**\n:::")],
  });

  expect(out.filter((result) => !result.ok)).toEqual([]);
});
it("renders accessible math, isolates macros and sanitizes final output", () => {
  const html = renderMarkdown("A $\\R$ and {{c1::answer}}.", {
    macros: "\\newcommand{\\R}{\\mathbb{R}}",
    cloze: { ord: 1, revealed: false },
  });
  expect(html).toContain("katex-mathml");
  expect(html).toContain("<math");
  expect(html).not.toContain("answer");
  expect(
    renderMarkdown("Value {{c1::answer}}", {
      cloze: { ord: 1, revealed: true },
    }),
  ).toContain("cza");
  expect(
    renderMarkdown("<script>alert(1)</script><img src=x onerror=alert(2)>"),
  ).not.toMatch(/<script|onerror/);
  expect(clozeOrds("{{c2::a}} {{c1::b}} {{c2::c}}")).toEqual([1, 2]);
  expect(plainText("**Finite** $x$", 6)).toBe("Finit…");
});

it("does not leak a previous card preamble into the next card", () => {
  const first = new DOMParser().parseFromString(
    renderMarkdown("$\\myfield$", {
      macros: "\\newcommand{\\myfield}{\\mathbb{F}}",
    }),
    "text/html",
  );
  expect(first.querySelector("math mi")?.textContent).toBe("F");
  const second = new DOMParser().parseFromString(
    renderMarkdown("$\\myfield$"),
    "text/html",
  );
  // KaTeX renders an unknown control sequence as MathML text, not an error-class span.
  expect(second.querySelector("math mtext")?.textContent).toBe("\\myfield");
  expect(second.querySelector("math mi")).toBeNull();
});
