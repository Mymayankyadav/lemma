import { o as e } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { Y as t, wt as n } from "@lemma/index-DcUkykC4.js";
import { r } from "@lemma/data-HD2KrcdX.js";
import { t as i } from "@lemma/Button-DTRYSO-L.js";
import { t as a } from "@lemma/jsx-runtime-DApVmHJR.js";
var o = a();
function s() {
  let a = n(),
    s = e(),
    c = t(),
    l = s.state?.from ?? `/`;
  return (0, o.jsxs)(`section`, {
    className: `flex min-h-[75dvh] flex-col items-center justify-center text-center`,
    children: [
      (0, o.jsx)(`p`, {
        className: `text-label italic text-ink-3`,
        style: { fontFamily: `var(--font-display)` },
        children: `A geometer’s notebook`,
      }),
      (0, o.jsx)(`p`, {
        className: `mt-4 text-num-xl font-medium italic text-ink`,
        style: { fontFamily: `var(--font-display)` },
        children: `Lemma`,
      }),
      (0, o.jsx)(`div`, {
        "aria-hidden": `true`,
        className: `mt-4 h-px w-24 bg-amber-line`,
      }),
      (0, o.jsx)(`h1`, {
        className: `mt-6 text-title-s font-medium italic`,
        style: { fontFamily: `var(--font-display)` },
        children: `Sign in`,
      }),
      (0, o.jsx)(`p`, {
        className: `mt-2 font-math text-answer text-ink-2`,
        children: `Your mathematical study record.`,
      }),
      r() !== `demo` &&
        (0, o.jsx)(i, {
          className: `mt-8 w-full max-w-sm`,
          disabled: a.isPending,
          onClick: async () => {
            try {
              (sessionStorage.setItem(`lemma:sign-in-return`, l),
                await a.mutateAsync());
            } catch {
              c(`Couldn't start Google sign-in.`, { tone: `danger` });
            }
          },
          children: `Continue with Google`,
        }),
      r() === `demo` &&
        (0, o.jsx)(`p`, {
          className: `mt-4 text-label text-ink-3`,
          children: `Sign-in is available in live mode.`,
        }),
    ],
  });
}
export { s as default };
