import {describe,expect,it} from "vitest";
import {MAX_PAGE_CHARS,splitTextSource,textKind} from "../../../src/pdf/text-source";
import {isSourceFile} from "../../../src/pdf/ingest";

const tex=String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\maketitle
Intro line.
\section{Groups}
A group $G$.
\section*{Subgroups}
$H \le G$.
\subsection{Cosets}
$|G| = [G:H]|H|$.
\end{document}`;

describe(".tex and .md sources",()=>{
  it("recognises LaTeX and Markdown by name or type, and still rejects other text",()=>{
    expect(textKind({name:"notes.tex",type:""})).toBe("tex");
    expect(textKind({name:"x",type:"text/x-tex"})).toBe("tex");
    expect(textKind({name:"notes.md",type:""})).toBe("md");
    expect(isSourceFile({name:"notes.txt",type:"text/plain"})).toBe(false);
    expect(isSourceFile({name:"book.pdf",type:"application/pdf"})).toBe(true);
  });
  it("drops the preamble and splits LaTeX at sections, keeping subsections inside them",()=>{
    const r=splitTextSource(tex,"tex");
    expect(r.pages.map(p=>p.body.split("\n")[0])).toEqual(["Intro line.","\\section{Groups}","\\section*{Subgroups}"]);
    expect(r.pages[2].body).toContain("\\subsection{Cosets}");
    expect(r.pages.some(p=>p.body.includes("usepackage"))).toBe(false);
    expect(r.outline).toEqual([{title:"Groups",page:2,level:1},{title:"Subgroups",page:3,level:1}]);
    expect(r.hasText).toBe(true);
  });
  it("splits Markdown at # and ## headings but not inside code fences",()=>{
    const r=splitTextSource("# One\ntext\n```\n# not a heading\n```\n## Two\nmore","md");
    expect(r.pageCount).toBe(2);
    expect(r.outline.map(o=>o.title)).toEqual(["One","Two"]);
  });
  it("ignores headings in tilde fences and respects fence marker and length",()=>{
    const text=[
      "~~~md", "# literal code", "```", "## still code", "~~~",
      "## Actual heading", "Text",
      "````js", "# not a heading", "```", "## also code", "````",
      "## Next heading", "Done",
    ].join("\n");
    const result=splitTextSource(text,"md");
    expect(result.outline.map(o=>o.title)).toEqual(["Actual heading","Next heading"]);
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].body).toContain("# literal code");
    expect(result.pages[1].body).toContain("## also code");
  });
  it("supports multiple fenced sections without splitting inside either style",()=>{
    const result=splitTextSource("~~~\n# ignored\n~~~\n# One\ntext\n```ts\n## ignored\n```\n## Two\nend","md");
    expect(result.outline.map(o=>o.title)).toEqual(["One","Two"]);
    expect(result.pageCount).toBe(3);
  });
  it("keeps every page under the page limit for long sections",()=>{
    const long="\\section{Long}\n"+Array.from({length:40},(_,i)=>"Paragraph "+i+" "+"x".repeat(500)).join("\n\n");
    const r=splitTextSource(long,"tex");
    expect(r.pageCount).toBeGreaterThan(2);
    expect(Math.max(...r.pages.map(p=>p.body.length))).toBeLessThanOrEqual(MAX_PAGE_CHARS);
    expect(r.outline).toHaveLength(1);
  });
});
