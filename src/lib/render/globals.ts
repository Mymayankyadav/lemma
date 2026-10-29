import katex from "katex";
import * as marked from "marked";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
// The preserved renderer reads these names from the global object.
Object.assign(globalThis, {
  katex: {
    ...katex,
    renderToString: (source: string, options?: katex.KatexOptions) =>
      katex.renderToString(source, { ...options, output: "htmlAndMathml" }),
  },
  marked,
  DOMPurify,
});
