import { t as e } from "@lemma/Tex-kn8bVMsW.js";
import { s as t, u as n } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as r } from "@lemma/book-open-gof2bZqq.js";
import { t as i } from "@lemma/check-BXZ7pTLx.js";
import {
  A as a,
  Bt as o,
  Ct as s,
  E as c,
  Ht as l,
  J as u,
  Kt as d,
  P as f,
  U as p,
  Ut as m,
  Y as h,
  et as g,
  g as _,
  q as v,
  st as y,
  ut as b,
} from "@lemma/index-DcUkykC4.js";
import { t as x } from "@lemma/createLucideIcon-C9eAT1Le.js";
import { t as S } from "@lemma/clock-3-DnZdQxj3.js";
import { t as C } from "@lemma/circle-question-mark-Bllgq-sM.js";
import { t as w } from "@lemma/target-D3iujC2g.js";
import T, { t as E } from "@lemma/Page-DfokWqaX.js";
import { t as D } from "@lemma/Chip-AHlDYqiR.js";
import { t as O } from "@lemma/Button-DTRYSO-L.js";
import { t as k } from "@lemma/jsx-runtime-DApVmHJR.js";
var A = {
  name: `circle`,
  size: 24,
  node: [[`circle`, { cx: `12`, cy: `12`, r: `10`, key: `1mglay` }]],
};
A.node;
var j = x(A),
  M = k(),
  N = {
    done: `Demonstrated`,
    revisit: `Re-check due`,
    now: `In progress`,
    next: `Up next`,
    locked: `Locked`,
    proposed: `Proposed`,
  };
function P() {
  let { slug: x, code: k } = n(),
    A = x ?? ``,
    P = k ?? ``,
    F = t(),
    I = g(A, P),
    L = b(A),
    R = s(),
    z = y(30),
    B = h(),
    V = () => F(`/p/` + A);
  async function H() {
    let e = L.data?.project.title ?? A,
      t = I.data?.view;
    if (!t) return;
    let n = v(e, t.code, t.title),
      r = R.data?.preferredChat ?? `claude`;
    await window.__lemmaCopyPrompt(n,B);
  }
  let U = I.data,
    W = U?.view,
    G = (L.data ? E(L.data, z.data?.checkpointEvents).rows : []).find(
      (e) => e.checkpoint.code === W?.code,
    ),
    K = G ? c(G) : null;
  return (0, M.jsxs)(M.Fragment, {
    children: [
      (0, M.jsx)(`div`, {
        "data-sheet-background": !0,
        "aria-hidden": `true`,
        inert: !0,
        children: (0, M.jsx)(T, {}),
      }),
      (0, M.jsx)(`h1`, { className: `sr-only`, children: `Checkpoint` }),
      (0, M.jsx)(_, {
        open: !0,
        onClose: V,
        title: W?.title ?? `Checkpoint`,
        children: I.isPending
          ? (0, M.jsxs)(`div`, {
              className: `flex flex-col gap-3`,
              children: [
                (0, M.jsx)(f, { h: 35 }),
                (0, M.jsx)(f, { h: 70 }),
                (0, M.jsx)(f, { h: 150 }),
              ],
            })
          : I.error || !U || !W
            ? (0, M.jsx)(a, {
                art: `plug`,
                title: `Checkpoint unavailable`,
                body: `Try again or return to the project.`,
                action: {
                  label: `Try again`,
                  onClick: () => {
                    I.refetch();
                  },
                },
              })
            : (0, M.jsxs)(`div`, {
                className: `flex flex-col gap-5`,
                children: [
                  (0, M.jsxs)(`div`, {
                    className: `flex flex-wrap items-center gap-2`,
                    children: [
                      (0, M.jsx)(D, { tone: `amber`, children: W.code }),
                      (0, M.jsx)(D, {
                        tone:
                          W.ui === `done`
                            ? `success`
                            : W.ui === `revisit`
                              ? `amber`
                              : `quiet`,
                        children: N[W.ui],
                      }),
                      W.stage &&
                        (0, M.jsx)(D, {
                          tone: `quiet`,
                          children: (0, M.jsx)(e, { source: W.stage }),
                        }),
                    ],
                  }),
                  K &&
                    (0, M.jsx)(`p`, {
                      "aria-label": `Checkpoint schedule`,
                      className: `rounded-ctl border border-edge bg-raised px-3 py-2 text-label text-ink-2`,
                      children: K,
                    }),
                  (0, M.jsx)(`p`, {
                    className: `font-math text-title-s italic leading-relaxed text-ink-soft`,
                    children: (0, M.jsx)(e, { source: U.objective }),
                  }),
                  (0,M.jsxs)(`section`,{className:`notebook-next-step`,children:[(0,M.jsx)(`h3`,{children:`Next step`}),(0,M.jsx)(`p`,{children:(0,M.jsx)(e,{source:U.steps[W.currentStep]||U.objective})})]}),
                  (0, M.jsxs)(`section`, {
                    className: `flex flex-col gap-2 rounded-ctl border border-edge bg-raised p-4`,
                    children: [
                      (0, M.jsxs)(u, {
                        as: `h3`,
                        className: `flex items-center gap-2 text-ink-2`,
                        children: [
                          (0, M.jsx)(w, { size: 17, className: `text-amber` }),
                          `Evidence required`,
                        ],
                      }),
                      (0, M.jsx)(`p`, {
                        className: `text-body leading-relaxed text-ink-soft`,
                        children: (0, M.jsx)(e, { source: U.criterion }),
                      }),
                    ],
                  }),
                  (0, M.jsxs)(`section`, {
                    "aria-label": `Checkpoint steps`,
                    children: [
                      (0, M.jsx)(u, {
                        as: `h3`,
                        className: `mb-3 text-ink-2`,
                        children: `Steps`,
                      }),
                      (0, M.jsx)(`ol`, {
                        className: `flex flex-col gap-3`,
                        children: U.steps.map((t, n) => {
                          let r = n < W.currentStep,
                            a = n === W.currentStep;
                          return (0, M.jsxs)(
                            `li`,
                            {
                              className: `flex items-start gap-3`,
                              children: [
                                (0, M.jsx)(`span`, {
                                  className:
                                    `flex size-7 shrink-0 items-center justify-center rounded-full ` +
                                    (r
                                      ? `bg-amber text-amber-ink`
                                      : a
                                        ? `border border-amber bg-amber-tint text-amber`
                                        : `border border-edge-3 text-ink-3`),
                                  children: r
                                    ? (0, M.jsx)(i, {
                                        size: 16,
                                        "aria-hidden": `true`,
                                      })
                                    : a
                                      ? (0, M.jsx)(j, {
                                          size: 10,
                                          fill: `currentColor`,
                                          "aria-hidden": `true`,
                                        })
                                      : n + 1,
                                }),
                                (0, M.jsx)(`span`, {
                                  className:
                                    `min-w-0 flex-1 pt-1 text-body ` +
                                    (r
                                      ? `text-ink-soft`
                                      : a
                                        ? `font-semibold text-ink`
                                        : `text-ink-3`),
                                  children: (0, M.jsx)(e, { source: t }),
                                }),
                              ],
                            },
                            n,
                          );
                        }),
                      }),
                    ],
                  }),
                  (U.pages || U.sourceShort) &&
                    (0, M.jsx)(`div`, {
                      className: `flex flex-wrap gap-2`,
                      children: (0, M.jsxs)(D, {
                        icon: r,
                        children: [
                          U.sourceShort ?? `Source`,
                          U.pages ? ` · p. ` + U.pages : ``,
                        ],
                      }),
                    }),
                  U.prereqs.length > 0 &&
                    (0, M.jsxs)(`section`, {
                      "aria-label": `Prerequisites`,
                      children: [
                        (0, M.jsx)(u, {
                          as: `h3`,
                          className: `mb-2 text-ink-2`,
                          children: `Prerequisites`,
                        }),
                        (0, M.jsx)(`div`, {
                          className: `flex flex-wrap gap-2`,
                          children: U.prereqs.map((e) =>
                            (0, M.jsx)(
                              `button`,
                              {
                                type: `button`,
                                onClick: () => F(`/p/` + A + `/cp/` + e),
                                className: `min-h-11 rounded-chip bg-fill-1 px-3 text-label text-amber`,
                                children: e,
                              },
                              e,
                            ),
                          ),
                        }),
                      ],
                    }),
                  U.concepts.length > 0 &&
                    (0, M.jsxs)(`section`, {
                      "aria-label": `Concepts`,
                      children: [
                        (0, M.jsx)(u, {
                          as: `h3`,
                          className: `mb-2 text-ink-2`,
                          children: `Concepts`,
                        }),
                        (0, M.jsx)(`div`, {
                          className: `flex flex-wrap gap-2`,
                          children: U.concepts.map((t) =>
                            (0, M.jsx)(
                              `button`,
                              {
                                type: `button`,
                                onClick: () =>
                                  F(
                                    `/atlas?focus=` +
                                      encodeURIComponent(t.slug),
                                  ),
                                className: `min-h-11 rounded-chip border border-edge-2 bg-fill-1 px-3 text-label text-ink-soft`,
                                children: (0, M.jsx)(e, { source: t.name }),
                              },
                              t.slug,
                            ),
                          ),
                        }),
                      ],
                    }),
                  U.recheckPrompt &&
                    (0, M.jsxs)(`div`, {
                      className: `flex items-start gap-2 rounded-ctl bg-amber-tint px-4 py-3 text-label text-amber`,
                      children: [
                        (0, M.jsx)(o, {
                          size: 18,
                          className: `mt-0.5 shrink-0`,
                        }),
                        (0, M.jsxs)(`span`, {
                          children: [
                            W.ui === `revisit`
                              ? `Re-check due`
                              : `Next re-check`,
                            `: `,
                            (0, M.jsx)(e, { source: U.recheckPrompt }),
                          ],
                        }),
                      ],
                    }),
                  U.events.length > 0 &&
                    (0, M.jsxs)(`section`, {
                      "aria-label": `Recent evidence`,
                      children: [
                        (0, M.jsx)(u, {
                          as: `h3`,
                          className: `mb-3 text-ink-2`,
                          children: `Recent evidence`,
                        }),
                        (0, M.jsx)(`div`, {
                          className: `flex flex-col gap-3`,
                          children: U.events
                            .slice(0, 8)
                            .map((t) =>
                              (0, M.jsxs)(
                                `article`,
                                {
                                  className: `rounded-ctl border border-edge bg-raised px-4 py-3`,
                                  children: [
                                    (0, M.jsxs)(`div`, {
                                      className: `flex items-center gap-2 text-label text-ink-3`,
                                      children: [
                                        t.kind === `hint`
                                          ? (0, M.jsx)(C, { size: 15 })
                                          : (0, M.jsx)(l, { size: 15 }),
                                        (0, M.jsx)(`span`, {
                                          className: `flex-1 capitalize`,
                                          children: t.kind.replaceAll(`_`, ` `),
                                        }),
                                        t.hintLevel !== null &&
                                          (0, M.jsx)(`span`, {
                                            children: `Hint ` + t.hintLevel,
                                          }),
                                        (0, M.jsx)(`span`, {
                                          children: new Date(
                                            t.createdAt,
                                          ).toLocaleDateString(),
                                        }),
                                      ],
                                    }),
                                    (0, M.jsx)(`p`, {
                                      className: `mt-2 line-clamp-3 text-label leading-relaxed text-ink-soft`,
                                      children: (0, M.jsx)(e, {
                                        source: t.body,
                                      }),
                                    }),
                                  ],
                                },
                                t.id,
                              ),
                            ),
                        }),
                      ],
                    }),
                  W.ui === `proposed`
                    ? (0, M.jsx)(O, {
                        size: `xl`,
                        onClick: () => F(`/proposals?tab=plan`),
                        className: `w-full`,
                        children: `Review this proposal`,
                      })
                    : (0, M.jsx)(O, {
                        size: `xl`,
                        onClick: () => {
                          H();
                        },
                        icon: l,
                        className: `w-full`,
                        children: `Copy study prompt`,
                      }),
                  (0, M.jsxs)(`div`, {
                    className: `flex flex-wrap gap-2`,
                    children: [
                      (0, M.jsxs)(`button`, {
                        type: `button`,
                        onClick: () => F(`/review`),
                        className: `flex min-h-11 items-center gap-2 rounded-chip bg-fill-1 px-3 text-label text-ink-2`,
                        children: [
                          (0, M.jsx)(m, { size: 17, "aria-hidden": `true` }),
                          U.cardsCount,
                          ` cards `,
                          (0, M.jsx)(d, { size: 14 }),
                        ],
                      }),
                      U.sessions.length > 0 &&
                        (0, M.jsxs)(`button`, {
                          type: `button`,
                          onClick: () =>
                            F(`/s/` + A + `/` + U.sessions[0].number),
                          className: `flex min-h-11 items-center gap-2 rounded-chip bg-fill-1 px-3 text-label text-ink-2`,
                          children: [
                            (0, M.jsx)(S, { size: 16, "aria-hidden": `true` }),
                            U.sessions.length,
                            ` sessions `,
                            (0, M.jsx)(d, { size: 14 }),
                          ],
                        }),
                    ],
                  }),
                ],
              }),
      }),
    ],
  });
}
export { P as default };
