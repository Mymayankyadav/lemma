const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f ||
    (m.f = [
      "assets/GoalCard-zdeOtvSo.js",
      "assets/chunk-6KYCQHYJ-E8utj2VS.js",
      "assets/rolldown-runtime-BWaJ3C7D.js",
      "assets/jsx-runtime-DApVmHJR.js",
      "assets/index-DcUkykC4.js",
      "assets/data-HD2KrcdX.js",
      "assets/api-D6yZPQ_0.js",
      "assets/card-cursor-NnR01fr2.js",
      "assets/derive-BTXnCYPV.js",
      "assets/queue-PP9pbc_d.js",
      "assets/preload-helper-ClvlChHw.js",
      "assets/createLucideIcon-C9eAT1Le.js",
      "assets/motion-DL_I35iP.js",
      "assets/Button-DTRYSO-L.js",
      "assets/arrow-left-wpmFch2_.js",
      "assets/PlugArt-YVnZzBq4.js",
      "assets/Tex-kn8bVMsW.js",
      "assets/render-BH3C9UJ0.js",
      "assets/render-eq8tD27Q.css",
      "assets/math-C0d8VK7L.css",
      "assets/index-DLdcYTsr.css",
      "assets/Route-Bh9_YVDa.js",
    ]),
) => i.map((i) => d[i]);
import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { n as t, t as n } from "@lemma/jsx-runtime-DApVmHJR.js";
import { n as r, p as i, r as a, t as o } from "@lemma/data-HD2KrcdX.js";
import { t as s } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import {
  LemmaGoalForecast,
  F as c,
  O as l,
  P as u,
  R as d,
  k as f,
  y as p,
} from "@lemma/index-DcUkykC4.js";
import { t as m } from "@lemma/preload-helper-ClvlChHw.js";
var h = e(t(), 1),
  g = n(),
  _ = (0, h.lazy)(() =>
    m(
      () => import(`@lemma/GoalCard-zdeOtvSo.js`),
      __vite__mapDeps([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21,
      ]),
    ),
  ),
  v = (e) =>
    /behind/i.test(e.scheduleHeadline ?? ``) ||
    (!!e.targetDate &&
      Date.parse(e.targetDate) < Date.now() &&
      e.done < e.total),
  y = (e, t) => {
    let n = Number(v(t)) - Number(v(e));
    if (n) return n;
    let r = (e) => (e.targetDate ? Date.parse(e.targetDate) : 1 / 0);
    return r(e) === r(t)
      ? (Date.parse(t.lastActivityAt ?? ``) || 0) -
          (Date.parse(e.lastActivityAt ?? ``) || 0)
      : r(e) - r(t);
  };
function b({ project: e, events: t }) {
  let n = e.total ? Math.round((100 * e.done) / e.total) : 0,
    r = p({
      projectId: e.id,
      total: e.total,
      done: e.done,
      targetDate: e.targetDate,
      events: t,
    });
  return (0, g.jsxs)(d, {
    as: `article`,
    "aria-label": `Goal progress for ` + e.title,
    className: `flex min-w-0 flex-col gap-3 p-4`,
    "data-summary-goal": ``,
    children: [
      (0, g.jsxs)(`div`, {
        className: `flex min-w-0 items-start gap-3`,
        children: [
          (0, g.jsx)(c, {
            subject: e.subject?.glyph ?? `∫`,
            hue: e.subject?.hue ?? `slate`,
            size: 32,
          }),
          (0, g.jsxs)(`div`, {
            className: `min-w-0 flex-1`,
            children: [
              (0, g.jsx)(s, {
                to: `/p/` + e.slug,
                className: `flex min-h-11 items-center break-words font-semibold text-headline text-ink`,
                children: (0, g.jsx)(f, { source: e.title }),
              }),
              (0, g.jsxs)(`p`, {
                className: `text-label leading-snug text-ink-2`,
                children: [
                  e.done,
                  `/`,
                  e.total,
                  ` checkpoints`,
                  e.current &&
                    (0, g.jsxs)(g.Fragment, {
                      children: [
                        `, now `,
                        e.current.code,
                        ` `,
                        (0, g.jsx)(f, { source: e.current.title }),
                      ],
                    }),
                ],
              }),
            ],
          }),
          (0, g.jsxs)(`div`, {
            className: `flex shrink-0 flex-col items-end gap-1`,
            children: [
              (0, g.jsxs)(`strong`, {
                className: `font-[var(--font-display)] text-title-s tabular-nums text-ink-2`,
                children: [n, `%`],
              }),
              e.scheduleHeadline &&
                (0, g.jsx)(`span`, {
                  "data-schedule-chip": ``,
                  className: `text-caption font-semibold text-ink-2`,
                  children: "Checkpoint · " + e.scheduleHeadline,
                }),
            ],
          }),
        ],
      }),
      (0, g.jsx)(`div`, {
        className: `flex min-h-11 items-center gap-3`,
        "aria-label": `Stage Metro for ` + e.title,
        children: (0, g.jsx)(l, { project: e }),
      }),
      (0, g.jsxs)(`p`, {
        className: `text-label text-ink-3`,
        children: [
          e.stageProgress?.length ?? Math.ceil(e.total / 8),
          ` groups ·`,
          ` `,
          `Open project to view checkpoints`,
        ],
      }),
      (0,g.jsx)(LemmaGoalForecast,{project:e}),
    ],
  });
}
function x({ projects: e }) {
  let t = e.filter((e) => e.status === `active`).sort(y),
    [n, c] = (0, h.useState)(!1),
    d = i({
      queryKey: [`insights`, 30],
      queryFn: () => o().getInsightData(30),
      enabled: a() === `demo` && r() === "default",
    }),
    p = t.slice(0, 3),
    m = t.slice(3),
    x = m.filter(v).length;
  return (0, g.jsxs)(`section`, {
    "aria-label": `Distance to your goals`,"data-style":"role-distance-to-your-goals",
    className: `flex min-w-0 flex-col gap-3`,
    children: [
      (0, g.jsxs)(`div`, {
        className: `flex min-h-11 items-center justify-between gap-3`,
        children: [
          (0, g.jsx)(`h2`, {
            className: `font-[var(--font-display)] text-title-s italic text-ink`,
            children: `Distance to your goals`,
          }),
          (0, g.jsx)(s, {
            to: `/projects`,
            className: `flex min-h-11 items-center text-label text-ink-2 underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]`,
            children: `All paths`,
          }),
        ],
      }),
      t.length === 0
        ? (0, g.jsx)(`p`, {
            className: `text-label text-ink-2`,
            children: `Create a project and plan to begin tracking your goals.`,
          })
        : (0, g.jsxs)(g.Fragment, {
            children: [
              p.map((e) =>
                e.total > 14
                  ? (0, g.jsx)(
                      b,
                      { project: e, events: d.data?.checkpointEvents },
                      e.id,
                    )
                  : (0, g.jsx)(
                      h.Suspense,
                      {
                        fallback: (0, g.jsx)(u, { h: 200 }),
                        children: (0, g.jsx)(_, {
                          project: e,
                          events: d.data?.checkpointEvents,
                        }),
                      },
                      e.id,
                    ),
              ),
              m.length > 0 &&
                (0, g.jsxs)(`div`, {
                  className: `min-w-0 rounded-slab border border-edge bg-[var(--card)] p-2`,
                  "data-compact-goals": ``,
                  children: [
                    (0, g.jsxs)(`p`, {
                      className: `px-2 py-2 text-label font-semibold text-ink-2`,
                      children: [
                        m.length,
                        ` additional projects`,
                      ],
                    }),
                    m
                      .slice(0, n ? m.length : 3)
                      .map((e) =>
                        (0, g.jsxs)(
                          `div`,
                          {
                            className: `flex min-h-11 items-center gap-2 border-t border-edge px-2 py-1`,
                            "data-compact-goal": e.slug,
                            children: [
                              (0, g.jsx)(s, {
                                className: `flex min-h-11 min-w-0 flex-[2] items-center truncate text-label text-ink`,
                                to: `/p/` + e.slug,
                                children: (0, g.jsx)(f, { source: e.title }),
                              }),
                              (0, g.jsx)(l, { project: e }),
                              (0, g.jsxs)(`span`, {
                                className: `w-9 shrink-0 text-right text-caption tabular-nums text-ink-2`,
                                children: [
                                  e.total
                                    ? Math.round((e.done / e.total) * 100)
                                    : 0,
                                  `%`,
                                ],
                              }),
                            ],
                          },
                          e.id,
                        ),
                      ),
                    m.length > 3 &&
                      (0, g.jsx)(`button`, {
                        type: `button`,
                        onClick: () => c((e) => !e),
                        "aria-expanded": n,
                        className: `min-h-11 w-full text-label text-ink-2`,
                        children: n
                          ? `Show fewer`
                          : `Show all ` + m.length + ` projects`,
                      }),
                  ],
                }),
            ],
          }),
    ],
  });
}
export { x as GoalDistance };
