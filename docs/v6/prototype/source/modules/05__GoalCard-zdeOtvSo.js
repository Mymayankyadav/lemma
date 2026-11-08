import { t as e } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import {
  LemmaGoalForecast,
  C as t,
  D as n,
  F as r,
  P as i,
  R as a,
  ut as o,
  y as s,
} from "@lemma/index-DcUkykC4.js";
import { t as c } from "@lemma/Route-Bh9_YVDa.js";
import { t as l } from "@lemma/Tex-kn8bVMsW.js";
import { t as u } from "@lemma/jsx-runtime-DApVmHJR.js";
var d = u();
function f({ project: u, events: f }) {
  let p = o(u.slug),
    m = s({
      projectId: u.id,
      total: u.total,
      done: u.done,
      targetDate: u.targetDate,
      events: f,
      dueDates: p.data?.checkpoints
        .filter((e) => e.ui !== `done` && e.ui !== `revisit`)
        .map((e) => e.dueOn),
    }),
    h = u.targetDate,
    g = p.data
      ? t(p.data.checkpoints, { targetDate: h, pacePerWeek: m.pace ?? void 0 })
      : [],
    _ = u.scheduleHeadline ?? n(g) ?? `Not started`,
    v = /behind/i.test(_)
      ? `var(--late)`
      : /ahead/i.test(_)
        ? `var(--early)`
        : `var(--ink-2)`,
    y = h
      ? new Date(h + `T12:00:00`).toLocaleDateString(`en`, {
          month: `short`,
          day: `numeric`,
        })
      : null,
    b =
      m.finish?.toLocaleDateString(`en`, { day: `numeric`, month: `short` }) ??
      null;
  return (0, d.jsxs)(a, {
    as: `article`,
    "aria-label": `Goal progress for ` + u.title,
    "data-goal-card": ``,
    className: `flex min-w-0 flex-col gap-1 p-3`,
    style: {
      scrollMarginBottom: `calc(var(--tab) + env(safe-area-inset-bottom) + 24px)`,
    },
    children: [
      (0, d.jsxs)(`div`, {
        className: `flex min-w-0 items-start gap-2`,
        children: [
          (0, d.jsx)(r, {
            subject: u.subject?.glyph ?? `∫`,
            hue: u.subject?.hue ?? `slate`,
            size: 32,
          }),
          (0, d.jsx)(`div`, {
            className: `min-w-0 flex-1`,
            children: (0, d.jsx)(e, {
              to: `/p/` + u.slug,
              className: `flex min-h-11 items-center break-words text-[16px] font-semibold leading-5 text-ink focus-visible:outline-2 focus-visible:outline-[var(--accent)]`,
              children: (0, d.jsx)(l, { source: u.title }),
            }),
          }),
          (0, d.jsx)(`span`, {
            "data-schedule-chip": ``,
            className: `max-w-[110px] shrink-0 rounded-full bg-[var(--paper-2)] px-2 py-1 text-center text-[12px] font-medium leading-4`,
            style: { color: v },
            children: `Checkpoint schedule · ` + _,
          }),
        ],
      }),
      p.isPending
        ? (0, d.jsx)(i, { h: 64 })
        : p.data?.checkpoints.length
          ? (0, d.jsx)(c, {
              project: u,
              checkpoints: p.data.checkpoints,
              mode: `today`,
              pacePerWeek: m.pace ?? void 0,
            })
          : (0, d.jsx)(`p`, {
              className: `text-label text-ink-3`,
              children: `No checkpoints yet. Ask your tutor to create a plan.`,
            }),
      u.current &&
        (0, d.jsxs)(`div`, {
          "data-goal-now": ``,
          className: `flex min-w-0 items-center gap-2 text-[12px] leading-[18px] text-ink-2`,
          children: [
            (0, d.jsx)(`span`, {
              "data-code": ``,
              className: `shrink-0 font-[var(--font-num)] text-[12px] text-[var(--accent)]`,
              children: u.current.code,
            }),
            (0, d.jsx)(`span`, {
              className: `min-w-0 flex-1 break-words text-[16px] leading-5 text-ink-2`,
              children: (0, d.jsx)(l, { source: u.current.title }),
            }),
            (0, d.jsxs)(`span`, {
              className: `shrink-0 tabular-nums`,
              children: [u.done, ` of `, u.total, ` complete`],
            }),
          ],
        }),
      (0,d.jsx)(LemmaGoalForecast,{project:u}),
    ],
  });
}
export { f as default };
