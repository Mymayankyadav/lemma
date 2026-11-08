import {NotebookHeader} from "@lemma/index-DcUkykC4.js";
import {H as lemmaPlainText} from "@lemma/index-DcUkykC4.js";
import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { t } from "@lemma/Tex-kn8bVMsW.js";
import { n, t as r } from "@lemma/jsx-runtime-DApVmHJR.js";
import {
  f as i,
  s as a,
  t as o,
  u as s,
} from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { n as c, r as l, t as u } from "@lemma/createLucideIcon-C9eAT1Le.js";
import { t as d } from "@lemma/arrow-left-wpmFch2_.js";
import { t as f } from "@lemma/book-open-gof2bZqq.js";
import {
  NotebookMenu,
  A as p,
  B as m,
  Ct as h,
  D as g,
  Dt as _,
  Et as v,
  F as y,
  Ft as b,
  Ht as x,
  I as S,
  J as C,
  Kt as w,
  L as T,
  Ot as E,
  P as D,
  Pt as ee,
  R as O,
  Rt as k,
  T as A,
  U as j,
  Ut as M,
  Vt as te,
  W as N,
  Y as P,
  Z as ne,
  b as F,
  dt as I,
  et as L,
  g as R,
  it as re,
  lt as z,
  q as B,
  st as V,
  ut as H,
  v as U,
  w as ie,
  x as ae,
} from "@lemma/index-DcUkykC4.js";
import { t as W } from "@lemma/check-BXZ7pTLx.js";
import { t as oe } from "@lemma/pause-Dg999iF5.js";
import { t as se } from "@lemma/play-DwFWW3fX.js";
import { c as ce, s as le, t as ue } from "@lemma/data-HD2KrcdX.js";
import { t as de } from "@lemma/Button-DTRYSO-L.js";
import { t as G } from "@lemma/Chip-AHlDYqiR.js";
import { t as fe } from "@lemma/Segmented-DV1qg3lc.js";
import { t as pe } from "@lemma/SegmentBar-DKTUmcZ2.js";
import { t as me } from "@lemma/Route-Bh9_YVDa.js";
import { t as he } from "@lemma/MathPreview-DJdjEKge.js";
import { t as ge } from "@lemma/file-text-DDHC2M3y.js";
import { t as _e } from "@lemma/trash-_1FlU6hE.js";
import { t as ve } from "@lemma/chevron-left-C_nMeSlm.js";
import { t as ye } from "@lemma/download-PqOd_4VW.js";
import { t as be } from "@lemma/MathText-BeTkDDIi.js";
import { a as xe, i as Se, t as Ce } from "@lemma/ingest-CSWZS6YK.js";
import { t as we } from "@lemma/Rail-D7h5PCRp.js";
var Te = {
  name: `pen-line`,
  size: 24,
  node: [
    [`path`, { d: `M13 21h8`, key: `1jsn5i` }],
    [
      `path`,
      {
        d: `M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z`,
        key: `1a8usu`,
      },
    ],
  ],
  aliases: [`edit-3`],
};
Te.node;
var Ee = u(Te),
  K = e(n(), 1),
  q = new WeakMap();
function J(e, t, n = Date.now()) {
  let r = Math.floor(n / 6e4),
    i = q.get(e);
  if (i && i.events === t && i.minute === r) return i.result;
  let a = ae(e, t, n);
  return (q.set(e, { events: t, minute: r, result: a }), a);
}
var Y = r(),
  De = F;
function Oe({ detail: e }) {
  let n = V(30),
    { project: r, subject: i, checkpoints: a, done: o, total: s } = e,
    { estimate: c, rows: l } = J(e, n.data?.checkpointEvents),
    u = g(l.filter(row=>row.checkpoint.ui===`now`)),
    d = a.findIndex((e) => e.ui === `now`),
    f = s ? Math.round((o / s) * 100) : 0,
    p = (e) =>
      e.toLocaleDateString(`en`, {
        day: `numeric`,
        month: `short`,
        year: `numeric`,
      }),
    m = r.targetDate ? new Date(r.targetDate + `T12:00:00`) : null;
  return (0, Y.jsx)(`section`, {
    "aria-label": `Goal and distance`,"data-style":"role-goal-and-distance",
    className: `min-w-0`,
    children: (0, Y.jsxs)(O, {
      as: `article`,
      className: `flex min-w-0 flex-col gap-3 p-4`,
      "data-card": ``,
      children: [
        (0, Y.jsxs)(`div`, {
          className: `flex min-w-0 items-start gap-3`,
          children: [
            (0, Y.jsx)(y, { subject: i.glyph, hue: i.hue, size: 32 }),
            (0, Y.jsxs)(`div`, {
              className: `min-w-0 flex-1`,
              children: [
                (0, Y.jsx)(`h2`, {
                  className: `break-words font-[var(--font-display)] text-title-s font-semibold`,
                  children: (0, Y.jsx)(t, { source: `Progress & goal` }),
                }),
                (0, Y.jsx)(`p`, {
                  className: `mt-1 break-words text-label leading-relaxed text-ink-2`,
                  children: (0, Y.jsx)(t, {
                    source: r.goal?.trim() || `Your tutor fills this in`,
                  }),
                }),
              ],
            }),
            (0, Y.jsxs)(`div`, {
              className: `flex shrink-0 flex-col items-end gap-1`,
              children: [
                (0, Y.jsxs)(`strong`, {
                  "data-count-role": ``,
                  className: `font-[var(--font-ui)] text-title-s tabular-nums text-amber`,
                  children: [f, `%`],
                }),
                u &&
                  (0, Y.jsx)(`span`, {
                    "data-schedule-chip": ``,
                    className: `text-caption font-semibold text-ink-2`,
                    children:c.spare!==null&&c.spare<0?`Goal forecast: ${Math.abs(c.spare)} days after target. Current checkpoint ${u===`On schedule`?`is on time`:`is ${u.toLowerCase()}`}.`:('Current checkpoint: '+(u===`On schedule`?`on time`:u.toLowerCase())),
                  }),
              ],
            }),
          ],
        }),
        (0, Y.jsxs)(`section`, {
          "aria-label": `Checkpoint progress`,"data-style":"role-checkpoint-progress",
          className: `flex flex-wrap items-baseline gap-1 text-label text-ink-2`,
          children: [
            (0, Y.jsx)(`strong`, {
              "data-count-role": ``,
              className: `font-[var(--font-ui)] text-title-s tabular-nums text-ink`,
              children: o,
            }),
            (0, Y.jsxs)(`span`, { children: [` of `, s, ` checkpoints complete`] }),
            d >= 0 &&
              (0, Y.jsxs)(`span`, {
                className: `ml-auto text-amber`,
                children: [a[d].code, ` now`],
              }),
          ],
        }),
        (0, Y.jsxs)(`details`, {
          role: `region`,
          "aria-label": `Project timeline`,"data-style":"role-project-timeline",
          className: `min-w-0`,
          children: [
            (0,Y.jsx)(`summary`,{children:`Explore checkpoint timeline`}),
            (0, Y.jsx)(me, {
              project: {
                title: r.title,
                slug: r.slug,
                done: o,
                total: s,
                targetDate: r.targetDate,
              },
              checkpoints: a,
              mode: `project`,
              pacePerWeek: c.pace ?? void 0,
              scheduleRows: l,
            }),
            l.some((e) => e.dueOn) &&
              (0, Y.jsx)(`div`, {
                "aria-label": `Schedule legend`,
                className: `mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2`,
                children: [`early`, `on_time`, `late`].map((e) =>
                  (0, Y.jsxs)(
                    `span`,
                    {
                      className: `inline-flex items-center gap-1.5`,
                      children: [
                        (0, Y.jsx)(`span`, {
                          "aria-hidden": `true`,
                          className: `h-[3px] w-5`,
                          style: { background: ie[e] },
                        }),
                        e === `on_time`
                          ? `On time`
                          : e === `early`
                            ? `Early`
                            : `Late`,
                      ],
                    },
                    e,
                  ),
                ),
              }),
          ],
        }),
        s > 0 &&
          (0, Y.jsxs)(`details`, {
            className: `notebook-goal-forecast`,
            children: [
              (0,Y.jsx)(`summary`,{className:c.spare!==null&&c.spare<0?`notebook-goal-delay`:``,children:c.spare!==null&&c.spare<0?`Forecast details · ${p(c.finish)}`:c.finish?`Goal forecast: ${p(c.finish)}`:`Goal forecast unavailable`}),
              c.finish &&
                (0, Y.jsxs)(`span`, {
                  children: [
                    `Goal forecast ≈ `,
                    (0, Y.jsx)(`time`, {
                      dateTime: c.finish.toISOString().slice(0, 10),
                      className: `font-semibold text-ink`,
                      children: p(c.finish),
                    }),
                  ],
                }),
              c.finish &&
                (0, Y.jsxs)(`span`, {
                  children: [
                    c.source === `plan` ? `from your plan` : `measured pace`,
                    c.pace === null ? `` : ` · ` + c.pace.toFixed(2) + ` checkpoints/week`,
                  ],
                }),
              m &&
                (0, Y.jsxs)(`span`, {
                  className: `basis-full`,
                  children: [
                    (0, Y.jsxs)(`span`, {
                      className: `font-semibold text-amber`,
                      children: [`Goal · `,r.targetLabel ?? `Target`, `:`],
                    }),
                    ` `,
                    (0, Y.jsx)(`time`, {
                      dateTime: r.targetDate,
                      children: p(m),
                    }),
                    c.spare !== null &&
                      (0, Y.jsx)(`span`, {
                        className: c.spare >= 0 ? `text-easy` : `text-hard`,
                        children:
                          ` · ` +
                          (c.spare >= 0
                            ? c.spare + ` days spare`
                            : Math.abs(c.spare) + ` days after target`),
                      }),
                  ],
                }),
            ],
          }),
        n.isPending && (0, Y.jsx)(D, { h: 4 }),
      ],
    }),
  });
}
var X = {
    done: `done`,
    revisit: `re-check`,
    now: `in progress`,
    next: `up next`,
    locked: `locked`,
    proposed: `proposed`,
  },
  ke = {
    done: `border-amber bg-amber`,
    revisit: `border-hard bg-amber-tint`,
    now: `border-[3px] border-amber bg-raised`,
    next: `border-ink-2 bg-raised`,
    locked: `border-dotted border-edge-3 opacity-70`,
    proposed: `border-dashed border-amber`,
  };
function Ae({ stage: e, slug: n, open: r, onToggle: i, schedule: a }) {
  let s = (0, K.useId)(),
    [c, l] = (0, K.useState)(!1),
    u = e.checkpoints.filter((e) => e.ui === `done`),
    d = e.checkpoints.filter((e) => e.ui !== `done`),
    f = e.checkpoints.filter(
      (e) => e.ui === `done` || e.ui === `revisit`,
    ).length,
    p = e.checkpoints.filter((e) => e.ui !== `proposed`).length,
    m = p ? Math.round((f / p) * 100) : 0,
    h = r ? (c ? e.checkpoints : d) : [];
  return (0, Y.jsxs)(O, {
    as: `article`,
    "aria-label": e.name + ` stage`,
    className: `min-w-0 p-0`,
    "data-card": ``,
    "data-stage-card": e.key,
    children: [
      (0, Y.jsxs)(`div`, {
        className: `flex min-h-12 w-full items-center gap-2 px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-amber`,
        children: [

          (0, Y.jsx)(`strong`, {
            className: `min-w-0 flex-1 break-words font-[var(--font-display)] text-headline font-semibold`,
            children: (0, Y.jsx)(t, { source: e.name }),
          }),
          (0, Y.jsx)(`span`, {
            role: `img`,
            "aria-label": m + ` percent complete`,
            className: `h-1 w-16 shrink-0 overflow-hidden rounded-[1px] bg-fill-2`,
            children: (0, Y.jsx)(`span`, {
              className: `block h-full`,
              style: { width: m + `%`, backgroundColor: `var(--early)` },
            }),
          }),
          (0, Y.jsxs)(`span`, {
            className: `w-9 shrink-0 text-right text-label tabular-nums text-ink-2`,
            children: [f, `/`, p],
          }),
        ],
      }),
      (0, Y.jsxs)(`div`, {
        id: s,
        hidden: !r,
        className: `px-2 pb-2`,
        children: [
          r &&
            u.length > 0 &&
            (0, Y.jsxs)(`button`, {
              type: `button`,
              "data-done-summary": ``,
              "aria-expanded": c,
              onClick: () => l((e) => !e),
              className: `flex min-h-11 w-full items-center justify-between rounded-ctl border-t border-edge px-2 text-left text-label text-ink-2`,
              children: [
                (0, Y.jsxs)(`span`, { children: [u.length, ` done ✓`] }),
                (0, Y.jsx)(`span`, {
                  className: `text-amber`,
                  children: c ? `Hide` : `Show`,
                }),
              ],
            }),
          h.map((e, r) =>
            (0, Y.jsxs)(
              o,
              {
                to: `/p/` + n + `/cp/` + encodeURIComponent(e.code),
                "data-cp-row": ``,
                "aria-label": e.code + ` ` + e.title + `, ` + X[e.ui],
                className:
                  `flex min-h-11 w-full items-center gap-2 rounded-ctl px-2 py-2 text-left hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber ` +
                  (r ? `border-t border-edge` : ``),
                children: [
                  (0, Y.jsx)(`span`, {
                    "aria-hidden": `true`,
                    className:
                      `size-[14px] shrink-0 rounded-full border-[1.5px] ` +
                      ke[e.ui],
                    style:
                      e.ui === `done`
                        ? {
                            borderColor: `var(--early)`,
                            backgroundColor: `var(--early)`,
                          }
                        : void 0,
                  }),
                  (0, Y.jsx)(`span`, {
                    className: `w-[46px] shrink-0 rounded-code text-label tabular-nums text-ink-3`,
                    children: e.code,
                  }),
                  (0, Y.jsxs)(`span`, {
                    className:
                      `min-w-0 flex-1 break-words text-body ` +
                      (e.ui === `locked` ? `text-ink-3` : `text-ink`),
                    children: [
                      (0, Y.jsx)(t, { source: e.title }),
                      ['locked','next','now','proposed'].includes(e.ui)&&(0,Y.jsx)('span',{className:'lemma-state-chip','data-checkpoint-state':e.ui,children:({locked:'🔒 Locked',next:'→ Up next',now:'● In progress',proposed:'◇ Proposed'})[e.ui]+(a.get(e.id)?.dueOn?' · '+A(a.get(e.id).dueOn):'')}),
                      a.get(e.id)?.dueOn && !['locked','next','now','proposed'].includes(e.ui) &&
                        (0, Y.jsxs)(`span`, {
                          className: `block text-caption text-ink-3`,
                          children: [`Planned `, A(a.get(e.id).dueOn)],
                        }),
                    ],
                  }),
                  (0, Y.jsx)(`span`, {
                    className:
                      `max-w-[84px] shrink-0 text-right text-caption ` +
                      (e.ui === `revisit`
                        ? `text-hard`
                        : e.ui === `proposed` || e.ui === `now`
                          ? `text-amber`
                          : `text-ink-3`),
                    children:
                      e.ui === `now` && e.stepsTotal > 0
                        ? e.currentStep + `/` + e.stepsTotal
                        : X[e.ui],
                  }),
                ],
              },
              e.id,
            ),
          ),
        ],
      }),
    ],
  });
}
function je({ detail: e }) {
  let n = De(e.checkpoints),
    r = U(e.checkpoints),
    i = Math.max(
      0,
      n.findIndex((e) => e.start <= r && e.end >= r),
    ),
    [a, o] = (0, K.useState)(()=>{const raw=sessionStorage.getItem('lemma.stage.'+e.project.slug),saved=Number(raw);return raw!==null&&Number.isInteger(saved)&&saved>=0&&saved<n.length?saved:i});

  (0, K.useEffect)(() => {
    const raw=sessionStorage.getItem('lemma.stage.'+e.project.slug),saved=Number(raw);o(raw!==null&&Number.isInteger(saved)&&saved>=0&&saved<n.length?saved:i);
  }, [e.project.slug, i]);
  (0,K.useEffect)(()=>{sessionStorage.setItem('lemma.stage.'+e.project.slug,String(a))},[a,e.project.slug]);
  let { rows: s } = J(e, V(30).data?.checkpointEvents),
    c = new Map(s.map((e) => [e.checkpoint.id, e]));

  return (0, Y.jsxs)(`section`, {
    "aria-label": `Stages`,"data-style":"role-stages",
    className: `flex min-w-0 flex-col gap-2`,
    children: [
      (0, Y.jsxs)(`div`, {
        className: `mb-1 flex flex-wrap items-baseline justify-between gap-2`,
        children: [
          (0, Y.jsx)(C, { children: `Stages` }),
          (0, Y.jsxs)(`span`, {
            className: `text-label text-ink-3`,
            children: [
              n.length,
              ` `,
              n.length === 1 ? `stage` : `stages`,
              `, `,
              e.total,
              ` checkpoints`,
            ],
          }),
        ],
      }),
      (0,Y.jsx)('p',{className:'text-label text-ink-2',children:`All ${n.length} stages are available in the picker.`}),
      (0,Y.jsxs)(`label`,{className:`notebook-stage-picker`,children:[`Current stage`,(0,Y.jsx)(`select`,{value:a,onChange:event=>o(Number(event.target.value)),children:[
        (0,Y.jsx)(`option`,{value:-1,children:`Choose a stage`}),
        ...n.map((stage,index)=>(0,Y.jsx)(`option`,{value:index,children:`${index+1}. ${lemmaPlainText(stage.name)}`},stage.key)),
      ]})]}),
      n.map((t, n) =>
        a===n && (0, Y.jsx)(
          Ae,
          {
            slug: e.project.slug,
            stage: t,
            schedule: c,
            open: true,
          },
          e.project.slug + `/` + t.key,
        ),
      ),
    ],
  });
}
var Z = (e) => [...e].sort((e, t) => e.page - t.page);
function Me(e, t) {
  return (
    `# ` +
    e +
    `

` +
    Z(t).map(
      (e) =>
        `% page ` +
        e.page +
        `

` +
        e.body,
    ).join(`

`) +
    `
`
  );
}
function Q(e) {
  return e.replace(
    /([\\{}%#$&_~^])/g,
    (e) =>
      ({
        "\\": `\\textbackslash{}`,
        "{": `\\{`,
        "}": `\\}`,
        "%": `\\%`,
        "#": `\\#`,
        $: `\\$`,
        "&": `\\&`,
        _: `\\_`,
        "~": `\\textasciitilde{}`,
        "^": `\\textasciicircum{}`,
      })[e],
  );
}
function Ne(e) {
  return e.split(/\r?\n/).map((e) => {
    let t = /^(#{1,3})\s+(.+)$/.exec(e);
    if (t)
      return (
        `\\` +
        [`section`, `subsection`, `subsubsection`][t[1].length - 1] +
        `*{` +
        Q(t[2]) +
        `}`
      );
    let n = /^\s*[-*]\s+(.+)$/.exec(e);
    return n ? `\\par\\textbullet\\ ` + Q(n[1]) : e.trim() ? Q(e) : `\\par`;
  }).join(`
`);
}
function Pe(e, t) {
  let n = Z(t).map((e) => {
    let t = e.body.split(
      /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g,
    );
    return (
      `% page ` +
      e.page +
      `
` +
      t.map((e, t) => (t % 2 ? e : Ne(e))).join(``) +
      `
`
    );
  });
  return (
    `\\documentclass{article}
\\usepackage{amsmath,amssymb}
\\title{` +
    Q(e) +
    `}
\\begin{document}
\\maketitle
` +
    n.join(`
`) +
    `\\end{document}
`
  );
}
function Fe({ source: e, stat: t }) {
  let [n, r] = (0, K.useState)(!1),
    [i, a] = (0, K.useState)(1),
    [o, s] = (0, K.useState)(!1),
    [c, l] = (0, K.useState)(``),
    [u, d] = (0, K.useState)(!1),
    f = P(),
    p = b(),
    m = Math.max(1, e.pageCount ?? 1),
    h = v(n ? e.id : ``, i),
    g = _(n ? e.id : ``),
    y = h.data?.transcribedBy;
  (0, K.useEffect)(() => {
    (s(!1), l(h.data?.body ?? ``));
  }, [h.data?.body, i]);
  let x = (e) => {
      (a(Math.min(m, Math.max(1, e))), s(!1));
    },
    S = async (t) => {
      try {
        (await p.mutateAsync({ sourceId: e.id, page: i, patch: t }),
          s(!1),
          f(`Page saved · Undo available in History`, { tone: `success` }));
      } catch (e) {
        f(e instanceof Error ? e.message : `Could not save this page`, {
          tone: `danger`,
        });
      }
    },
    C = async (t) => {
      if (!u) {
        d(!0);
        try {
          let n = await ue().getTranscribedPagesForExport(e.id);
          if (!n.length) {
            f(`No transcribed pages to export`, { tone: `danger` });
            return;
          }
          let r = t === `tex` ? Pe(e.title, n) : Me(e.title, n),
            i =
              (e.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, `-`)
                .replace(/^-|-$/g, ``) || `transcription`) +
              `.` +
              t,
            a = new Blob([r], {
              type: t === `tex` ? `application/x-tex` : `text/markdown`,
            }),
            o = URL.createObjectURL(a);
          try {
            let e = document.createElement(`a`);
            ((e.href = o),
              (e.download = i),
              document.body.appendChild(e),
              e.click(),
              e.remove());
          } finally {
            URL.revokeObjectURL(o);
          }
        } catch (e) {
          f(e instanceof Error ? e.message : `Could not export transcription`, {
            tone: `danger`,
          });
        } finally {
          d(!1);
        }
      }
    },
    T = async () => {const prompt=`Transcribe my scanned notes '${e.title}' pages 1–10 into Lemma`;await window.__lemmaCopyPrompt(prompt,f);},
    E = (e.pageCount ?? 0) > 0,
    D = t?.transcribed ?? 0;
  return (0, Y.jsxs)(`div`, {
    className: `flex flex-col gap-2 text-label`,
    children: [
      (0, Y.jsxs)(`div`, {
        className: `flex flex-wrap items-center gap-2 text-ink-2`,
        children: [
          e.origin === `claude` || e.origin === `chatgpt`
            ? (0, Y.jsxs)(`span`, {
                "data-source-origin": !0,
                className: `text-ink-2`,
                children: [
                  `Transcribed by `,
                  e.origin === `claude` ? `Claude` : `ChatGPT`,
                ],
              })
            : null,
          (D > 0 || !e.hasText) &&
            (0, Y.jsxs)(`span`, {
              "aria-label": `Transcription progress`,
              children: [D, ` of `, e.pageCount ?? 0, ` pages transcribed`],
            }),
          !!t?.needsCheck &&
            (0, Y.jsxs)(`span`, {
              "aria-label": t.needsCheck + ` pages need checking`,
              className: `inline-flex items-center gap-1`,
              children: [
                (0, Y.jsx)(`span`, {
                  className: `size-2 rounded-full bg-[var(--late)]`,
                  "aria-hidden": `true`,
                }),
                t.needsCheck,
                ` to check`,
              ],
            }),
        ],
      }),
      (0, Y.jsxs)(`div`, {
        className: `flex flex-wrap items-center gap-3`,
        children: [
          E &&
            (0, Y.jsx)(`button`, {
              type: `button`,
              "data-source-view-pages": !0,
              className: `min-h-11 min-w-11 px-2 text-ink-2`,
              "aria-expanded": n,
              onClick: () => r((e) => !e),
              children: n ? `Hide transcription` : `View pages`,
            }),
          (0,Y.jsxs)("details",{className:"lemma-source-actions",children:[(0,Y.jsx)("summary",{children:"Transcription actions"}),(0,Y.jsxs)("div",{children:[
          D > 0 &&
            (0, Y.jsxs)(`button`, {
              type: `button`,
              disabled: u,
              onClick: () => void C(`md`),
              className: `flex min-h-11 min-w-11 items-center gap-1 px-2 text-ink-2`,
              children: [(0, Y.jsx)(ye, { size: 15 }), `Download as .md`],
            }),
          D > 0 &&
            (0, Y.jsxs)(`button`, {
              type: `button`,
              disabled: u,
              onClick: () => void C(`tex`),
              className: `flex min-h-11 min-w-11 items-center gap-1 px-2 text-ink-2`,
              children: [(0, Y.jsx)(ye, { size: 15 }), `Download as .tex`],
            }),
          !e.hasText &&
            (0, Y.jsx)(`button`, {
              type: `button`,
              onClick: () => void T(),
              className: `min-h-11 min-w-11 px-2 text-ink-2`,
              children: `Copy transcription prompt`,
            }),
]})]}),
        ],
      }),
      n &&
        (0, Y.jsxs)(`section`, {
          role: `region`,
          "aria-label": `Page transcription for ` + e.title,"data-style":"role-page-transcription",
          className: `flex min-w-0 flex-col gap-3 rounded-ctl border border-edge bg-well p-3`,
          children: [
            (0, Y.jsxs)(`div`, {
              className: `flex items-center justify-between gap-2`,
              children: [
                (0, Y.jsx)(`button`, {
                  type: `button`,
                  "aria-label": `Previous PDF page`,
                  disabled: i <= 1,
                  onClick: () => x(i - 1),
                  className: `flex size-11 items-center justify-center disabled:opacity-35`,
                  children: (0, Y.jsx)(ve, {}),
                }),
                (0, Y.jsxs)(`label`, {
                  className: `flex items-center gap-2`,
                  children: [
                    `Page`,
                    (0, Y.jsx)(`input`, {
                      type: `number`,
                      "aria-label": `PDF page number`,
                      min: 1,
                      max: m,
                      value: i,
                      onChange: (e) => {
                        let t = Number(e.target.value);
                        Number.isSafeInteger(t) && x(t);
                      },
                      className: `h-11 w-16 rounded-ctl border border-edge bg-raised px-2 text-ink`,
                    }),
                    (0, Y.jsxs)(`span`, { children: [`of `, m] }),
                  ],
                }),
                (0, Y.jsx)(`button`, {
                  type: `button`,
                  "aria-label": `Next PDF page`,
                  disabled: i >= m,
                  onClick: () => x(i + 1),
                  className: `flex size-11 items-center justify-center disabled:opacity-35`,
                  children: (0, Y.jsx)(w, {}),
                }),
              ],
            }),
            (0, Y.jsxs)(`div`, {
              className: `grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2`,
              children: [
                g.data &&
                  (0, Y.jsxs)(`div`, {
                    className: `min-w-0`,
                    children: [
                      (0, Y.jsx)(`p`, {
                        className: `mb-2 font-semibold text-ink-2`,
                        children: `Original PDF`,
                      }),
                      (0, Y.jsx)(`iframe`, {
                        title: `Original PDF page ` + i,
                        src: g.data + `#page=` + i,
                        loading: `lazy`,
                        className: `h-72 w-full rounded-s border border-edge bg-raised`,
                      }),
                    ],
                  }),
                (0, Y.jsxs)(`div`, {
                  className: `min-w-0`,
                  children: [
                    (0, Y.jsxs)(`p`, {
                      className: `mb-2 flex flex-wrap items-center gap-2 font-semibold text-ink-2`,
                      children: [
                        `Transcription `,
                        h.data?.confidence === `check` &&
                          (0, Y.jsxs)(`span`, {
                            className: `inline-flex items-center gap-1 text-[var(--late)]`,
                            children: [
                              (0, Y.jsx)(`span`, {
                                className: `size-2 rounded-full bg-[var(--late)]`,
                              }),
                              `Check`,
                            ],
                          }),
                      ],
                    }),
                    h.isLoading
                      ? (0, Y.jsx)(`p`, { children: `Loading page…` })
                      : h.isError
                        ? (0, Y.jsxs)(`p`, {
                            role: `alert`,
                            children: [
                              `Could not load page. `,
                              (0, Y.jsx)(`button`, {
                                type: `button`,
                                className: `min-h-11 min-w-11 px-2 text-ink-2`,
                                onClick: () => void h.refetch(),
                                children: `Retry`,
                              }),
                            ],
                          })
                        : h.data?.body
                          ? o
                            ? (0, Y.jsxs)(`div`, {
                                className: `flex flex-col gap-2`,
                                children: [
                                  (0, Y.jsx)(`textarea`, {
                                    "aria-label": `Edit page transcription`,
                                    maxLength: 8e3,
                                    rows: 10,
                                    value: c,
                                    onChange: (e) => l(e.target.value),
                                    className: `w-full rounded-ctl border border-edge bg-raised p-2 text-ink`,
                                  }),
                                  (0, Y.jsx)(he, {
                                    source: c,
                                    className: `min-w-0 max-w-full overflow-x-auto`,
                                  }),
                                  (0, Y.jsxs)(`div`, {
                                    className: `flex flex-wrap gap-3`,
                                    children: [
                                      (0, Y.jsx)(`button`, {
                                        type: `button`,
                                        disabled: p.isPending,
                                        onClick: () => void S({ body: c }),
                                        className: `min-h-11 min-w-11 px-2 text-amber`,
                                        children: `Save page`,
                                      }),
                                      (0, Y.jsx)(`button`, {
                                        type: `button`,
                                        onClick: () => s(!1),
                                        className: `min-h-11 min-w-11 px-2 text-ink-2`,
                                        children: `Cancel`,
                                      }),
                                    ],
                                  }),
                                ],
                              })
                            : (0, Y.jsx)(`div`, {
                                className: `max-h-96 overflow-auto rounded-s bg-raised p-3`,
                                children: (0, Y.jsx)(be, {
                                  source: h.data.body,
                                }),
                              })
                          : (0, Y.jsx)(`p`, {
                              className: `text-ink-3`,
                              children: `This page has not been transcribed yet.`,
                            }),
                    h.data?.body &&
                      y &&
                      !o &&
                      (0, Y.jsxs)(`div`, {
                        className: `mt-2 flex flex-wrap gap-3`,
                        children: [
                          (0, Y.jsxs)(`button`, {
                            type: `button`,
                            onClick: () => s(!0),
                            className: `flex min-h-11 min-w-11 items-center gap-1 px-2 text-ink-2`,
                            children: [
                              (0, Y.jsx)(Ee, { size: 15 }),
                              `Edit page`,
                            ],
                          }),
                          h.data.confidence === `check` &&
                            (0, Y.jsxs)(`button`, {
                              type: `button`,
                              disabled: p.isPending,
                              onClick: () => void S({ confidence: `high` }),
                              className: `flex min-h-11 min-w-11 items-center gap-1 px-2 text-ink-2`,
                              children: [
                                (0, Y.jsx)(W, { size: 15 }),
                                `Mark checked`,
                              ],
                            }),
                        ],
                      }),
                  ],
                }),
              ],
            }),
          ],
        }),
    ],
  });
}
function Ie(e) {
  let t = e.slice(-20),
    n =
      e.find(
        (e) =>
          e.phase === `reading` ||
          e.phase === `uploading` ||
          e.phase === `saving`,
      ) ?? e.find((e) => e.phase === `queued`);
  return n && !t.includes(n) ? [n, ...t] : t;
}
var Le = [`book`, `notes`, `slides`, `problems`, `syllabus`, `exam`, `other`],
  Re = 52428800,
  $ = (e) =>
    e <= 0
      ? `0 KB`
      : e >= 1048576
        ? (e / 1024 / 1024).toFixed(1) + ` MB`
        : Math.max(1, Math.ceil(e / 1024)) + ` KB`,
  ze = 1073741824;
function Be({ projectId: e, sources: n }) {
  let r = ne(),
    i = ee(),
    a = re(),
    o = P(),
    s = E(e),
    c = new Map((s.data ?? []).map((e) => [e.sourceId, e])),
    l = (0, K.useRef)(null),
    u = (0, K.useRef)(!1),
    d = (0, K.useRef)(0),
    f = (0, K.useRef)(new Set()),
    [p, m] = (0, K.useState)([]),
    [h, g] = (0, K.useState)(0),
    [_, v] = (0, K.useState)(null),
    [y, b] = (0, K.useState)(``),
    [x, S] = (0, K.useState)(`other`),
    [C, w] = (0, K.useState)(null),
    [T, D] = (0, K.useState)({}),
    [O, k] = (0, K.useState)(null),
    A = (e, t) =>
      m((n) =>
        n.map((n) =>
          n.id === e
            ? {
                ...n,
                ...t,
                pagesRead: t.progress
                  ? Math.max(
                      n.pagesRead,
                      t.progress.phase === `reading` ||
                        t.progress.phase === `done`
                        ? t.progress.page
                        : 0,
                    )
                  : n.pagesRead,
              }
            : n,
        ),
      );
  function j(e) {
    let t = [];
    for (let n of Array.from(e))
      !Se(n) || !n.size || n.size > Re
        ? o(`Choose a nonempty PDF, .tex or .md file under 50 MB: ` + n.name, {
            tone: `danger`,
          })
        : t.push({
            id: ++d.current,
            file: n,
            name: n.name,
            bytes: n.size,
            pagesRead: 0,
            phase: `queued`,
            progress: null,
            error: null,
          });
    m((e) => [...e, ...t]);
  }
  (0, K.useEffect)(() => {
    if (u.current) return;
    let t = p.find((e) => e.phase === `queued` && e.file);
    if (!t) return;
    let i = t.file;
    (f.current.delete(t.id),
      xe(i),
      (u.current = !0),
      (async () => {
        A(t.id, { phase: `reading`, error: null });
        try {
          let a = await crypto.subtle.digest(`SHA-256`, await i.arrayBuffer()),
            s = Array.from(new Uint8Array(a), (e) =>
              e.toString(16).padStart(2, `0`),
            ).join(``);
          if (n.some((e) => e.sha256 === s)) {
            A(t.id, { phase: `failed`, file: null, error: `Already added` });
            return;
          }
          if (
            (await r.mutateAsync({
              projectId: e,
              file: i,
              onProgress: (e) => {
                A(t.id, {
                  progress: e,
                  phase:
                    e.phase === `done`
                      ? `saving`
                      : e.phase === `failed`
                        ? `failed`
                        : e.phase,
                });
              },
            }),
            f.current.has(t.id))
          )
            return;
          (A(t.id, { phase: `ready`, file: null, error: null }),
            o(`Source added`, { tone: `success` }));
        } catch (e) {
          let n = e instanceof Error ? e.message : `Upload failed`;
          f.current.has(t.id)
            ? A(t.id, { phase: `cancelled`, file: null, error: null })
            : A(t.id, {
                phase: `failed`,
                file: /Already added/i.test(n) ? null : i,
                error: n,
              });
        } finally {
          ((u.current = !1), g((e) => e + 1));
        }
      })());
  }, [p, e, h]);
  async function M(e) {
    try {
      (await i.mutateAsync({
        id: e.id,
        patch: { title: y.trim() || e.title, kind: x },
      }),
        v(null),
        o(`Source updated`, { tone: `success` }));
    } catch (e) {
      o(e instanceof Error ? e.message : `Could not update source`, {
        tone: `danger`,
      });
    }
  }
  async function N(e) {
    try {
      (await a.mutateAsync(e.id),
        w(null),
        o(`Source deleted (undo available in history)`, { tone: `success` }));
    } catch (e) {
      o(e instanceof Error ? e.message : `Could not delete source`, {
        tone: `danger`,
      });
    }
  }
  function F(e) {
    (f.current.add(e.id),
      e.file && Ce(e.file),
      A(e.id, { phase: `cancelled`, file: null, error: null }));
  }
  const [sourceQuery,setSourceQuery]=(0,K.useState)("");
  const [sourceKind,setSourceKind]=(0,K.useState)("all"),[sourceStatus,setSourceStatus]=(0,K.useState)("all");
  const matchesSource=t=>{
    const stats=c.get(t.id),transcribed=stats?.transcribed??0;
    const stage=sourceStatus==='all'||(sourceStatus==='uploaded'&&t.status==='ready')||(sourceStatus==='pending'&&t.status==='ready'&&(!t.pageCount||transcribed<t.pageCount))||(sourceStatus==='transcribed'&&t.pageCount>0&&transcribed>=t.pageCount)||(sourceStatus==='planned'&&!!t.planCheckedAt)||(sourceStatus==='failed'&&t.status==='failed')||(sourceStatus==='processing'&&['uploading','extracting'].includes(t.status));
    return stage&&(sourceKind==='all'||(t.kind??'other')===sourceKind)&&(!sourceQuery||(t.title+' '+t.filename).toLowerCase().includes(sourceQuery.toLowerCase()));
  };
  let I = Le.map((e) => ({
      kind: e,
      rows: n
        .filter((t) => (t.kind ?? `other`) === e && matchesSource(t))
        .sort(
          (e, t) =>
            Date.parse(t.addedAt ?? t.createdAt) -
            Date.parse(e.addedAt ?? e.createdAt),
        ),
    })).filter((e) => e.rows.length),
    L = (e) =>
      (sourceQuery || sourceKind!=="all" || sourceStatus!=="all") ? true : n.length <= 10 ? O === null || O === e : (O ?? I[0]?.kind) === e,
    R = n.filter((e) => /\.pdf$/i.test(e.filename)),
    z = R.filter(
      (e) =>
        typeof e.bytes == `number` && Number.isFinite(e.bytes) && e.bytes >= 0,
    ),
    B = z.reduce((e, t) => e + t.bytes, 0),
    V = R.length - z.length,
    H = Math.min(100, (B / ze) * 100),
    U = Ie(p);
  return (0, Y.jsxs)(`section`, {
    "aria-label": `Sources`,"data-style":"role-sources",
    className: `flex flex-col gap-4`,
    children: [
      (0,Y.jsxs)("label",{className:"lemma-source-search",children:["Find a source",(0,Y.jsx)("input",{type:"search","aria-label":"Search source names",placeholder:"Search all source names",value:sourceQuery,onChange:e=>{setSourceQuery(e.target.value);D({})}})]}),
      (0,Y.jsxs)("div",{className:"lemma-source-filters",children:[
        (0,Y.jsxs)("label",{children:["Source type",(0,Y.jsx)("select",{value:sourceKind,onChange:e=>{setSourceKind(e.target.value);D({})},children:[(0,Y.jsx)("option",{value:"all",children:"All types"}),...Le.map(kind=>(0,Y.jsx)("option",{value:kind,children:kind[0].toUpperCase()+kind.slice(1)},kind))]})]}),
        (0,Y.jsxs)("label",{children:["Source status",(0,Y.jsx)("select",{value:sourceStatus,onChange:e=>{setSourceStatus(e.target.value);D({})},children:[['all','All statuses'],['uploaded','Uploaded'],['pending','Transcription pending'],['transcribed','Fully transcribed'],['planned','Checked for plan'],['processing','Processing'],['failed','Failed']].map(([value,label])=>(0,Y.jsx)("option",{value,children:label},value))})]})
      ]}),
      (sourceQuery || sourceKind!=="all" || sourceStatus!=="all") && (0,Y.jsxs)("div",{className:"lemma-source-filter-summary",children:[(0,Y.jsx)("span",{role:"status",children:I.reduce((sum,g)=>sum+g.rows.length,0)+" matching sources"}),(0,Y.jsx)("button",{type:"button",onClick:()=>{setSourceQuery("");setSourceKind("all");setSourceStatus("all");D({})},children:"Clear filters"})]}),
      !I.length && n.length>0 && (0,Y.jsx)("p",{role:"status",children:"No sources match. Change the search or clear the filters."}),
      (0, Y.jsxs)(`div`, {
        role: `group`,
        "aria-label": `Source storage`,
        className: `flex flex-col gap-1.5`,
        children: [
          (0, Y.jsx)(`div`, {
            className: `flex items-center justify-between gap-2 text-label text-ink-3`,
            children: (0, Y.jsxs)(`span`, {
              className: `min-w-0 tabular-nums`,
              children: [
                n.length,
                ` `,
                n.length === 1 ? `source` : `sources`,
                ` · `,
                V === R.length && V > 0 ? `Storage size unavailable` : V ? `Known PDF storage ` + $(B) : $(B) + ` of 1 GB`,
                V > 0
                  ? ` · ` + V + ` ` + (V === 1 ? `size` : `sizes`) + ` unknown`
                  : ``,
              ],
            }),
          }),
          (z.length > 0 || R.length === 0) && (0, Y.jsx)(`div`, {
            role: `progressbar`,
            "aria-label": `PDF storage used`,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": Math.round(H),
            "aria-valuetext": (V ? `At least ` : ``) + $(B) + ` of 1 GB`,
            className: `h-1.5 overflow-hidden rounded-full bg-fill-2`,
            children: (0, Y.jsx)(`div`, {
              "data-source-storage-fill": !0,
              className: `h-full rounded-full bg-[var(--ink-2)]`,
              style: { width: H + `%` },
            }),
          }),
        ],
      }),
      I.map((e) =>
        (0, Y.jsxs)(
          `div`,
          {
            className: `overflow-hidden rounded-slab border border-edge bg-[var(--paper)]`,
            children: [
              (0, Y.jsx)(`h3`, {
                className: `text-label font-semibold text-ink-2`,
                children: (0, Y.jsxs)(`button`, {
                  type: `button`,
                  "aria-expanded": L(e.kind),
                  className: `flex min-h-11 w-full items-center justify-between gap-2 text-left`,
                  onClick: () => k(L(e.kind) ? `none` : e.kind),
                  children: [
                    (0, Y.jsxs)(`span`, {
                      children: [
                        e.kind.charAt(0).toUpperCase() + e.kind.slice(1),
                        ` · `,
                        e.rows.length,
                      ],
                    }),
                    (0, Y.jsx)(`span`, {
                      "data-source-fold": !0,
                      className: `text-ink-2`,
                      children: L(e.kind) ? `Collapse` : `Expand`,
                    }),
                  ],
                }),
              }),
              L(e.kind) &&
                e.rows
                  .slice(0, ((T[e.kind] ?? 0) + 1) * 20)
                  .map((e) =>
                    (0, Y.jsxs)(
                      `div`,
                      {
                        "data-source-row": !0,
                        role: `group`,
                        "aria-label": e.title,
                        className: `flex flex-col gap-2 border-t border-[var(--hair)] px-3 py-3`,
                        children: [
                          (0, Y.jsxs)(`div`, {
                            className: `flex items-center gap-3`,
                            children: [
                              (0, Y.jsx)(ge, {
                                "data-source-icon": !0,
                                size: 20,
                                className: `shrink-0 text-ink-2`,
                              }),
                              (0, Y.jsxs)(`div`, {
                                className: `min-w-0 flex-1`,
                                children: [
                                  (0, Y.jsx)(`strong`, {
                                    className: `block min-w-0 break-words text-body-l`,
                                    children: (0, Y.jsx)(t, {
                                      source: e.title,
                                    }),
                                  }),
                                  (0, Y.jsxs)(`p`, {
                                    className: `text-label text-ink-3`,
                                    children: [
                                      e.pageCount ?? `—`,
                                      ` pages · `,
                                      new Date(
                                        e.addedAt ?? e.createdAt,
                                      ).toLocaleDateString(`en-GB`, {
                                        day: `numeric`,
                                        month: `short`,
                                      }),
                                      ` · `,
                                      e.status === "ready" ? "Uploaded" : e.status,
                                    ],
                                  }),
                                  e.planCheckedAt === null &&
                                    (0, Y.jsx)(`span`, {
                                      "data-source-new": !0,
                                      className: `text-label font-semibold text-ink-2`,
                                      children: `New · not yet used in a plan`,
                                    }),
                                ],
                              }),
                              (0,Y.jsxs)("details",{className:"lemma-source-actions",children:[(0,Y.jsx)("summary",{"aria-label":"More actions for "+e.title,"data-style":"role-more-actions",children:"More"}),(0,Y.jsxs)("div",{children:[(0, Y.jsx)(`button`, {
                                type: `button`,
                                "data-source-edit": !0,
                                className: `min-h-11 min-w-11 px-2 text-label text-ink-2`,
                                onClick: (event) => { event.currentTarget.closest("details")?.removeAttribute("open");
                                  (v(e.id),
                                    b(e.title),
                                    S(e.kind ?? `other`),
                                    w(null));
                                },
                                children: `Edit`,
                              }),
                              (0, Y.jsx)(`button`, {
                                type: `button`,
                                "aria-label": `Delete ` + e.title,"data-style":"role-delete",
                                className: `flex size-11 items-center justify-center text-ink-3`,
                                onClick: (event) => { event.currentTarget.closest("details")?.removeAttribute("open");
                                  (w(e.id), v(null));
                                },
                                children: (0, Y.jsx)(_e, { size: 17 }),
                              }),]})]}),
                            ],
                          }),
                          _ === e.id &&
                            (0, Y.jsxs)(`div`, {
                              className: `flex flex-col gap-2`,
                              children: [
                                (0, Y.jsxs)(`label`, {
                                  className: `text-label text-ink-2`,
                                  children: [
                                    `Title`,
                                    (0, Y.jsx)(`input`, {
                                      "aria-label": `Source title`,
                                      value: y,
                                      onChange: (e) => b(e.target.value),
                                      maxLength: 150,
                                      className: `mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well p-2 text-ink`,
                                    }),
                                  ],
                                }),
                                (0, Y.jsx)(he, { source: y }),
                                (0, Y.jsxs)(`label`, {
                                  className: `text-label text-ink-2`,
                                  children: [
                                    `Kind`,
                                    (0, Y.jsx)(`select`, {
                                      "aria-label": `Source kind`,
                                      value: x,
                                      onChange: (e) => S(e.target.value),
                                      className: `mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well p-2 text-ink`,
                                      children: Le.map((e) =>
                                        (0, Y.jsx)(
                                          `option`,
                                          { value: e, children: e },
                                          e,
                                        ),
                                      ),
                                    }),
                                  ],
                                }),
                                (0, Y.jsxs)(`div`, {
                                  className: `flex gap-3`,
                                  children: [
                                    (0, Y.jsx)(`button`, {
                                      type: `button`,
                                      className: `min-h-11 min-w-11 px-2 text-label text-amber`,
                                      disabled: i.isPending,
                                      onClick: () => {
                                        M(e);
                                      },
                                      children: `Save`,
                                    }),
                                    (0, Y.jsx)(`button`, {
                                      type: `button`,
                                      className: `min-h-11 min-w-11 px-2 text-label text-ink-2`,
                                      onClick: () => v(null),
                                      children: `Cancel`,
                                    }),
                                  ],
                                }),
                              ],
                            }),
                          C === e.id &&
                            (0, Y.jsxs)(`div`, {
                              role: `group`,
                              "aria-label": `Confirm deletion of ` + e.title,
                              className: `flex flex-wrap items-center gap-2`,
                              children: [
                                (0, Y.jsx)(`span`, {
                                  className: `min-w-0 flex-1 basis-40 text-label text-ink-2`,
                                  children: `Delete this source and its pages?`,
                                }),
                                (0, Y.jsx)(`button`, {
                                  type: `button`,
                                  className: `min-h-11 min-w-11 px-2 text-label text-again`,
                                  disabled: a.isPending,
                                  onClick: () => {
                                    N(e);
                                  },
                                  children: `Delete`,
                                }),
                                (0, Y.jsx)(`button`, {
                                  type: `button`,
                                  className: `min-h-11 min-w-11 px-2 text-label text-ink-2`,
                                  onClick: () => w(null),
                                  children: `Cancel`,
                                }),
                              ],
                            }),
                          (0,Y.jsxs)(`details`,{
                            className:`lemma-source-details rounded-ctl border-t border-edge`,
                            children:[
                              (0,Y.jsx)(`summary`,{
                                className:`flex min-h-11 cursor-pointer items-center gap-2 py-2 text-label font-semibold text-ink-2`,
                                children:`Source details · View pages, transcription and exports`,
                              }),
                              (0,Y.jsx)(`div`,{className:`pb-2`,children:(0,Y.jsx)(Fe,{source:e,stat:c.get(e.id)})})
                            ]
                          }),
                        ],
                      },
                      e.id,
                    ),
                  ),
              L(e.kind) && e.rows.length > 0 &&
                (0,Y.jsxs)(`div`,{
                  className:`flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2 text-label text-ink-2`,
                  children:[
                    (0,Y.jsx)(`span`,{role:`status`,children:`Showing ${Math.min(e.rows.length,((T[e.kind]??0)+1)*20)} of ${e.rows.length} sources`}),
                    ((T[e.kind]??0)+1)*20<e.rows.length &&
                      (0,Y.jsx)(`button`,{
                        type:`button`,
                        "data-source-page":!0,
                        className:`min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink`,
                        onClick:()=>D(old=>({...old,[e.kind]:(old[e.kind]??0)+1})),
                        children:`Show ${Math.min(20,e.rows.length-((T[e.kind]??0)+1)*20)} more`,
                      }),
                  ],
                }),
            ],
          },
          e.kind,
        ),
      ),
      (0, Y.jsx)(`input`, {
        ref: l,
        hidden: !0,
        type: `file`,
        multiple: !0,
        accept: `.pdf,application/pdf,.tex,.latex,.ltx,application/x-tex,text/x-tex,.md,.markdown,text/markdown`,
        onChange: (e) => {
          (e.currentTarget.files && j(e.currentTarget.files),
            (e.currentTarget.value = ``));
        },
      }),
      (0, Y.jsx)(`div`, {
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e) => {
          (e.preventDefault(), j(e.dataTransfer.files));
        },
        children: (0, Y.jsxs)(`button`, {
          type: `button`,
          onClick: () => l.current?.click(),
          className: `flex min-h-24 w-full items-center justify-center gap-2 rounded-slab border border-dashed border-edge-3 bg-fill-1 text-body text-ink-2`,
          children: [
            (0, Y.jsx)(te, { size: 22, className: `text-amber` }),
            `Add sources · PDF, .tex or .md`,
          ],
        }),
      }),
      p.length > 0 &&
        (0, Y.jsxs)(`ul`, {
          "aria-label": `Source upload queue`,
          className: `flex flex-col gap-2`,
          children: [
            U.map((e) =>
              (0, Y.jsxs)(
                `li`,
                {
                  className: `rounded-slab border border-edge bg-raised p-3`,
                  children: [
                    (0, Y.jsxs)(`div`, {
                      className: `flex items-center justify-between gap-2`,
                      children: [
                        (0, Y.jsx)(`span`, {
                          className: `min-w-0 truncate text-body`,
                          children: e.name,
                        }),
                        (0, Y.jsx)(`span`, {
                          "aria-label": `Upload status: ` + e.phase,
                          className: `flex shrink-0 items-center gap-1 text-label text-ink-2`,
                          children:
                            e.phase === `ready`
                              ? (0, Y.jsxs)(Y.Fragment, {
                                  children: [
                                    (0, Y.jsx)(W, {
                                      size: 17,
                                      className: `text-easy`,
                                    }),
                                    `Ready`,
                                  ],
                                })
                              : e.phase,
                        }),
                      ],
                    }),
                    (0, Y.jsxs)(`p`, {
                      className: `mt-1 text-caption text-ink-3`,
                      children: [
                        $(e.bytes),
                        e.progress?.pageCount
                          ? ` · ` +
                            e.pagesRead +
                            `/` +
                            e.progress.pageCount +
                            ` pages read`
                          : ``,
                      ],
                    }),
                    (e.phase === `queued` || e.phase === `reading`) &&
                      (0, Y.jsx)(`button`, {
                        type: `button`,
                        className: `min-h-11 px-3 text-label font-semibold text-ink-2`,
                        onClick: () => F(e),
                        children: `Cancel reading`,
                      }),
                    e.progress?.pageCount &&
                      e.progress.pageCount > 1200 &&
                      (0, Y.jsxs)(`p`, {
                        role: `alert`,
                        className: `mt-1 text-label text-[var(--late)]`,
                        children: [
                          `This PDF has `,
                          e.progress.pageCount,
                          ` pages. Reading may be slow; consider splitting it by chapter.`,
                        ],
                      }),
                    e.progress &&
                      e.phase !== `ready` &&
                      e.phase !== `cancelled` &&
                      (0, Y.jsx)(we, {
                        className: `mt-2`,
                        value: e.progress.pageCount
                          ? e.progress.page / e.progress.pageCount
                          : 0,
                        label: `Upload ` + e.name,
                      }),
                    e.error &&
                      (0, Y.jsxs)(`p`, {
                        role: `alert`,
                        className: `text-label text-again`,
                        children: [
                          e.error,
                          ` `,
                          e.file &&
                            (0, Y.jsx)(`button`, {
                              type: `button`,
                              className: `min-h-11 min-w-11 px-2 text-ink-2`,
                              onClick: () =>
                                A(e.id, { phase: `queued`, error: null }),
                              children: `Retry`,
                            }),
                        ],
                      }),
                  ],
                },
                e.id,
              ),
            ),
            p.length > U.length &&
              (0, Y.jsxs)(`p`, {
                className: `text-label text-ink-3`,
                children: [
                  p.length - U.length,
                  ` earlier queue entries hidden.`,
                ],
              }),
          ],
        }),
    ],
  });
}
function Ve(e,t,n){return window.__lemmaCopyPrompt(e,n);}

function He({ slug: e, project: n, cp: r }) {
  let i = L(e, r.code),
    a = h(),
    s = P(),
    c = a.data?.preferredChat ?? `claude`,
    currentStep=i.data?.view?.currentStep ?? r.currentStep,
    l =
      (i.data?.steps ?? [])[Math.max(0, currentStep)] ??
      `Continue working on this checkpoint`,
    u = `/p/` + e + `/cp/` + r.code;
  return (0, Y.jsxs)(O, {
    as: `article`,
    lamp: !0,
    "aria-label": `Current checkpoint ` + r.code,
    className: `border border-amber-line-2 p-4`,
    children: [
      (0, Y.jsx)(`div`, {
        className: `flex items-center gap-3`,
        children: (0, Y.jsxs)(o, {
          to: u,
          "aria-label": `Open checkpoint ` + r.code + ` ` + r.title,"data-style":"role-open-checkpoint",
          className: `group flex min-h-11 w-full min-w-0 flex-col justify-center gap-1 rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)]`,
          children: [
            (0, Y.jsxs)(`span`, {
              className: `text-label font-semibold text-amber`,
              children: [r.code, ` · In progress`],
            }),
            (0, Y.jsx)(`h3`, {
              className: `min-w-0 break-words text-title-s font-semibold text-ink underline-offset-4 group-hover:underline`,
              children: (0, Y.jsx)(t, { source: r.title }),
            }),
          ],
        }),
      }),
      (0,Y.jsxs)(`div`,{className:`notebook-next-step`,children:[(0,Y.jsx)(`span`,{children:`Next step`}),(0,Y.jsx)(`p`,{children:(0,Y.jsx)(t,{source:l})})]}),
      i.data?.objective &&
        (0, Y.jsx)(`p`, {
          className: `mt-3 font-math text-body leading-relaxed text-ink`,
          children: (0, Y.jsx)(t, { source: i.data.objective }),
        }),
      (0, Y.jsxs)(`div`, {
        className: `mt-4 flex items-center justify-between text-label text-ink-2`,
        children: [
          (0, Y.jsxs)(`span`, {
            children: [
              `Step `,
              r.stepsTotal ? Math.min(currentStep + 1, r.stepsTotal) : 0,
              ` of `,
              r.stepsTotal,
            ],
          }),
          (0, Y.jsx)(`span`, {
            className: `max-w-[70%] truncate`,
            children: (0, Y.jsx)(t, { source: l }),
          }),
        ],
      }),
      (0, Y.jsx)(`div`, {
        className: `mt-2`,
        children: (0, Y.jsx)(pe, {
          total: r.stepsTotal,
          done: Math.max(0, currentStep),
          current: Math.min(currentStep+1,r.stepsTotal),
          label: `Steps for ` + r.title,
          tone: `green`,
        }),
      }),
      (0, Y.jsxs)(`div`, {
        className: `mt-4 flex flex-wrap gap-2`,
        children: [
          i.data?.pages &&
            (0, Y.jsx)(G, {
              tone: `quiet`,
              icon: f,
              children: `p. ` + i.data.pages,
            }),
          (0, Y.jsxs)(G, {
            tone: `quiet`,
            icon: M,
            onClick: () => window.location.assign(`#/review`),
            children: [r.dueCards, ` due for `,r.code],
          }),
          i.data?.sessions.length
            ? (0, Y.jsxs)(G, {
                tone: `quiet`,
                icon: x,
                onClick: () =>
                  window.location.assign(
                    `#/s/` + e + `/` + i.data.sessions[0].number,
                  ),
                children: [i.data.sessions.length, ` tutor sessions for `,r.code],
              })
            : null,
        ],
      }),
      (0, Y.jsx)(de, {
        size: `m`,
        icon: CopyGlyph,
        className: `mt-5 w-full`,
        onClick: () => Ve(B(n.project.title, r.code, r.title), c, s),
        children: `Copy study prompt`,
      }),
      (0,Y.jsx)(`p`,{className:`notebook-paste-note`,children:`Paste into your tutor to continue.`}),
      typeof navigator.share==='function'&&(0,Y.jsx)(de,{variant:'ghost',size:'m',onClick:async()=>{const text=B(n.project.title,r.code,r.title);try{await navigator.share({title:'Resume '+n.project.title,text})}catch(error){if(error?.name!=='AbortError')Ve(text,c,s)}},children:'Share prompt'}),
    ],
  });
}
function Ue({ slug: e, sessions: n }) {
  let [r, i] = (0, K.useState)(0),
      [search,setSearch]=(0,K.useState)(``),
      [checkpoint,setCheckpoint]=(0,K.useState)(`all`);
  const checkpoints=[...new Set(n.map(s=>s.checkpointCode??s.checkpoint??s.cpCode).filter(Boolean))].sort();
  if (!n.length)
    return (0, Y.jsx)(p, {
      art: `inbox`,
      title: `No sessions yet`,
      body: `Resume a checkpoint in your tutor to start an evidence trail.`,
    });
  let a = [...n].filter(s=>{
    const cp=s.checkpointCode??s.checkpoint??s.cpCode??null;
    if(checkpoint!==`all` && cp!==checkpoint)return false;
    const term=search.trim().toLocaleLowerCase();
    return !term || [s.goal,s.summary,s.client,s.number,s.startedAt,cp]
      .filter(v=>v!==null&&v!==undefined).some(v=>String(v).toLocaleLowerCase().includes(term));
  }).sort(
      (e, t) =>
        Date.parse(t.startedAt) - Date.parse(e.startedAt) ||
        t.number - e.number,
    ),
    s = r * 20,
    c = a.slice(s, s + 20),
    l = new Map();
  for (let e of c) {
    let t = new Date(e.startedAt).toLocaleDateString(void 0, {
        month: `long`,
        year: `numeric`,
      }),
      n = l.get(t) ?? [];
    (n.push(e), l.set(t, n));
  }
  return (0, Y.jsxs)(`section`, {
    "aria-label": `Tutor conversations`,
    className: `flex flex-col gap-4`,
    children: [
      (0,Y.jsxs)(`div`,{className:`flex flex-wrap gap-3`,children:[
        (0,Y.jsxs)(`label`,{className:`min-w-0 flex-1 text-label font-semibold text-ink-2`,children:[`Find a tutor conversation`,
          (0,Y.jsx)(`input`,{type:`search`,value:search,placeholder:`Title, number, tutor or date`,onChange:event=>{setSearch(event.target.value);i(0)},className:`mt-1 min-h-11 w-full rounded-ctl border border-edge-3 bg-[var(--paper)] px-3 text-body text-ink`})]}),
        checkpoints.length>0 && (0,Y.jsxs)(`label`,{className:`text-label font-semibold text-ink-2`,children:[`Checkpoint`,
          (0,Y.jsxs)(`select`,{value:checkpoint,onChange:event=>{setCheckpoint(event.target.value);i(0)},className:`mt-1 block min-h-11 rounded-ctl border border-edge-3 bg-[var(--paper)] px-2 text-body text-ink`,children:[
            (0,Y.jsx)(`option`,{value:`all`,children:`All checkpoints`}),
            ...checkpoints.map(cp=>(0,Y.jsx)(`option`,{value:cp,children:cp},cp))
          ]})]})
      ]}),
      (0, Y.jsx)(`p`, {
        role:`status`,className: `text-label text-ink-3`,
        children: a.length ? `Showing ${s+1}–${s+c.length} of ${a.length} tutor conversations` + (a.length!==n.length?` · ${n.length} total`:``) : `No tutor conversations match these filters`,
      }),
      [...l.entries()].map(([n, r]) =>
        (0, Y.jsxs)(
          `div`,
          {
            className: `flex flex-col gap-2`,
            children: [
              (0, Y.jsx)(`h3`, {
                className: `text-label font-semibold uppercase tracking-wider text-ink-2`,
                children: n,
              }),
              r.map((n) => {
                let r = n.goalMet === `yes`,
                  i = n.goalMet === `partial`;
                return (0, Y.jsxs)(
                  o,
                  {
                    to: `/s/` + e + `/` + n.number,
                    className: `flex min-h-[70px] items-center gap-3 rounded-slab bg-raised px-4`,
                    children: [
                      (0, Y.jsx)(`span`, {
                        className:
                          `flex size-9 shrink-0 items-center justify-center rounded-s ` +
                          (r
                            ? `bg-success-tint text-easy`
                            : i
                              ? `bg-amber-tint text-amber`
                              : `bg-fill-2 text-ink-3`),
                        children: r
                          ? (0, Y.jsx)(W, { size: 18, "aria-hidden": `true` })
                          : i
                            ? (0, Y.jsx)(oe, {
                                size: 16,
                                "aria-hidden": `true`,
                              })
                            : (0, Y.jsx)(x, {
                                size: 17,
                                "aria-hidden": `true`,
                              }),
                      }),
                      (0, Y.jsxs)(`span`, {
                        className: `min-w-0 flex-1`,
                        children: [
                          (0, Y.jsx)(`strong`, {
                            className: `block truncate text-body-l font-semibold`,
                            children: (0, Y.jsx)(t, { source: /^Study session \d+ for .+$/i.test(n.goal??``) ? `Tutor session ${n.number}` : n.goal }),
                          }),
                          (0, Y.jsx)(`span`, {
                            className: `mt-1 block text-label text-ink-3`,
                            children:
                              `S` +
                              n.number +
                              ` · ` +
                              ce(n.startedAt) +
                              ` · ` +
                              n.client,
                          }),
                        ],
                      }),
                      (0, Y.jsx)(`span`, {
                        className: `shrink-0 text-label tabular-nums text-ink-2`,
                        children:
                          n.minutes == null ? `` : le(n.minutes),
                      }),
                      (0, Y.jsx)(w, {
                        size: 16,
                        className: `shrink-0 text-ink-3`,
                      }),
                    ],
                  },
                  n.id,
                );
              }),
            ],
          },
          n,
        ),
      ),
      (0, Y.jsxs)(`div`, {
        className: `flex gap-3`,
        children: [
          r > 0 &&
            (0, Y.jsx)(`button`, {
              type: `button`,
              className: `min-h-11 flex-1 rounded-ctl border border-edge px-4 text-body font-semibold text-amber`,
              onClick: () => i((e) => e - 1),
              children: `Previous 20`,
            }),
          s + 20 < a.length &&
            (0, Y.jsxs)(`button`, {
              type: `button`,
              className: `min-h-11 flex-1 rounded-ctl border border-edge px-4 text-body font-semibold text-amber`,
              onClick: () => i((e) => e + 1),
              children: [`More sessions · `, a.length - s - 20, ` remaining`],
            }),
        ],
      }),
    ],
  });
}
function We({ slug: e }) {
  let n = z(e);
  return n.isPending
    ? (0, Y.jsx)(D, { h: 80 })
    : n.error
      ? (0, Y.jsx)(`p`, {
          className: `text-label text-ink-3`,
          children: `Plan history is not available yet.`,
        })
      : n.data?.length
        ? (0, Y.jsxs)(`section`, {
            "aria-label": `Plan history`,
            className: `mt-5 flex flex-col gap-2`,
            children: [
              (0, Y.jsx)(`h3`, {
                className: `text-title-s font-semibold`,
                children: `Plan history`,
              }),
              n.data.map((e) =>
                (0, Y.jsxs)(
                  T,
                  {
                    className: `p-3`,
                    children: [
                      (0, Y.jsxs)(`p`, {
                        className: `text-body font-semibold`,
                        children: [`Plan v`, e.revision],
                      }),
                      (0, Y.jsxs)(`p`, {
                        className: `text-label text-ink-3`,
                        children: [
                          new Date(e.approvedAt).toLocaleDateString(),
                          ` · `,
                          (0, Y.jsx)(t, { source: e.summary }),
                        ],
                      }),
                    ],
                  },
                  e.revision,
                ),
              ),
            ],
          })
        : null;
}
function Ge({ open: e, onClose: n, current: r }) {
  let i = I(),
    s = a(),
    [c, l] = (0, K.useState)(``),
    u = (i.data ?? [])
      .filter((e) => !e.system && e.status !== `archived`)
      .filter(
        (e) =>
          !c.trim() ||
          [e.title, e.subject?.name ?? `Unassigned`].some((e) =>
            e.toLocaleLowerCase().includes(c.trim().toLocaleLowerCase()),
          ),
      )
      .sort(
        (e, t) =>
          (Date.parse(t.lastActivityAt ?? ``) || 0) -
          (Date.parse(e.lastActivityAt ?? ``) || 0),
      )
      .slice(0, c.trim() ? 30 : 6);
  return (0, Y.jsx)(R, {
    open: e,
    onClose: n,
    title: `Switch project`,
    children: (0, Y.jsxs)(`div`, {
      className: `space-y-3`,
      children: [
        (0, Y.jsx)(`input`, {
          "aria-label": `Find a project`,
          type: `search`,
          value: c,
          onChange: (e) => l(e.target.value),
          placeholder: `Find a project`,
          className: `min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body text-ink`,
        }),
        i.isPending
          ? (0, Y.jsx)(D, { h: 120 })
          : u.length
            ? (0, Y.jsx)(`div`, {
                className: `space-y-1`,
                children: u.map((e) =>
                  (0, Y.jsxs)(
                    `button`,
                    {
                      type: `button`,
                      "aria-current": e.slug === r ? `page` : void 0,
                      onClick: () => {
                        (n(), s(`/p/` + e.slug));
                      },
                      className: `flex min-h-12 w-full items-center gap-3 rounded-ctl border border-edge px-3 text-left`,
                      children: [
                        (0, Y.jsx)(`span`, {
                          className: `text-amber`,
                          "aria-hidden": `true`,
                          children: e.subject?.glyph ?? `∫`,
                        }),
                        (0, Y.jsx)(`span`, {
                          className: `min-w-0 flex-1 break-words text-body`,
                          children: (0, Y.jsx)(t, { source: e.title }),
                        }),
                        (0, Y.jsxs)(`span`, {
                          className: `text-caption text-ink-3`,
                          children: [e.done, `/`, e.total],
                        }),
                        (0, Y.jsx)(w, {
                          size: 16,
                          className: `text-ink-3`,
                          "aria-hidden": `true`,
                        }),
                      ],
                    },
                    e.id,
                  ),
                ),
              })
            : (0, Y.jsx)(`p`, {
                className: `py-6 text-center text-label text-ink-2`,
                children: `No projects match`,
              }),
        (0, Y.jsx)(o, {
          to: `/projects`,
          onClick: n,
          className: `flex min-h-11 items-center justify-center rounded-ctl border border-edge text-label text-amber`,
          children: `All paths`,
        }),
      ],
    }),
  });
} /* v9: Project study context uses the loaded project, not a fixed three-project fixture. */
function LemmaProjectStudyContext({ detail }) {
  const state = () => ({
    session: window.__carrelIntegration?.getState?.() || {},
    prefs: window.__carrelIntegration?.getPreferences?.() || {},
  });
  const [data, setData] = (0, K.useState)(state);
  (0, K.useEffect)(() => {
    const sync = () => setData(state());
    window.addEventListener("lemma:integrationchange", sync);
    window.addEventListener("lemma:sessionchange", sync);
    sync();
    return () => {
      window.removeEventListener("lemma:integrationchange", sync);
      window.removeEventListener("lemma:sessionchange", sync);
    };
  }, []);
  const proj = detail.project,
    slug = String(proj.slug || proj.id),
    checkpoint = detail.checkpoints.find((x) => x.ui === "now");
  const links = data.prefs.links || {},
    projectIds = new Set([String(proj.id || ""), slug]);
  const entries = (data.session.entries || []).filter((x) =>
    projectIds.has(String(x.projectId || links[x.subject] || "")),
  );
  const effort=window.__lemmaEffortMetrics?.allTime?.(entries);
  const recordsAvailable=Array.isArray(data.session.entries);
  const minutes = effort?.committedMinutes ?? entries.reduce(
      (sum, x) => sum + Math.max(0, Number(x.minutes ?? x.min) || 0),
      0,
    ),
    hours = Math.floor(minutes / 60),
    mins = Math.round(minutes % 60);
  const timer=data.session.timer||{};
  const linked=String(timer.projectId||links[timer.activity]||'');
  const owns=projectIds.has(linked)||(!linked&&timer.activity===proj.title);
  const active=owns?window.__lemmaEffortMetrics?.active(timer,Date.now(),data.session.entries||[])||0:0;
  const hasCurrent=owns&&(timer.running||timer.paused);
  const ctx = {
    id: slug,
    name: proj.title,
    cp: checkpoint?.code || "",
    checkpoint: checkpoint?.title || "",
  };
  return (0, Y.jsxs)("section", {
    className: "lemma-project-study",
    "aria-label": "Study effort",
    children: [
      (0, Y.jsxs)("div", {
        children: [
          (0, Y.jsx)("h2", { children: "Study effort" }),
          (0, Y.jsx)("p", {
            children: checkpoint
              ? `${checkpoint.code} · ${checkpoint.title}`
              : "Add a plan with your tutor, or record general study time below.",
          }),
        ],
      }),
      (0, Y.jsxs)("div", {
        className: "lemma-project-study-stats",
        children: [
          (0, Y.jsxs)("span", {
            children: [
              (0, Y.jsx)("strong", { children: recordsAvailable?`${hours} h ${mins} min`:`—` }),
              " logged",
              active>0?` · ${Math.round(active)} min in progress`:null,
            ],
          }),
          (0, Y.jsxs)("span", {
            children: [
              (0, Y.jsx)("strong", { children: recordsAvailable?(effort?.committedRecords??entries.length):`—` }),
              " · timed sessions",
            ],
          }),
        ],
      }),
      (0, Y.jsxs)("div", {
        className: "lemma-project-study-actions",
        children: [
          (0, Y.jsx)("button", {
            type: "button",
            onClick: () => hasCurrent ? window.dispatchEvent(new Event("lemma:focus-open")) :
              window.__carrelIntegration?.open?.("timer", null, {
                jointProject: ctx,
                prepare: "start",
              }),
            children: hasCurrent?"Open current focus":(timer.running||timer.paused)?"Set up another focus":"Start focus timer",
          }),
          (0, Y.jsx)("button", {
            type: "button",
            onClick: () =>
              window.__carrelIntegration?.open?.("plan", null, {
                jointProject: ctx,
                prepare: "block",
              }),
            children: "Plan study block",
          }),
        ],
      }),
      !owns&&(timer.running||timer.paused)&&(0,Y.jsx)('p',{className:'lemma-project-study-note',children:`Current focus: ${timer.activity||'Study'}. It stays active while you set up another session. Starting the new session will log and replace it.`}),
      (0, Y.jsx)("p", {
        className: "lemma-project-study-note",
        children:
          "Time records effort. Complete a checkpoint by demonstrating the required work.",
      }),
    ],
  });
}
function Ke() {
  let { slug: e } = s(),
    n = e ?? ``,
    [r, o] = i(),
    u = H(n),
    h = a(),
    g = P(),
    _ = !!l(),
    [v, y] = (0, K.useState)(!1),
    b =
      r.get(`tab`) === `sessions`
        ? `sessions`
        : r.get(`tab`) === `sources`
          ? `sources`
          : `path`;
  if (
    ((0, K.useEffect)(() => {
      u.error &&
        g(`Couldn't load this project`, {
          tone: `danger`,
          action: {
            label: `Try again`,
            onClick: () => {
              u.refetch();
            },
          },
        });
    }, [u.error, u.refetch, g]),
    u.isPending)
  )
    return (0, Y.jsxs)(m, {
      title: `Project`,
      back: `/projects`,
      children: [
        (0, Y.jsx)(D, { h: 65 }),
        (0, Y.jsx)(D, { h: 55 }),
        (0, Y.jsx)(D, { h: 270 }),
      ],
    });
  if (u.error || !u.data)
    return (0, Y.jsx)(m, {
      title: `Project`,
      back: `/projects`,
      children: (0, Y.jsx)(p, {
        art: `plug`,
        title: `Project unavailable`,
        body: `Check your connection or try again.`,
        action: {
          label: `Try again`,
          onClick: () => {
            u.refetch();
          },
        },
      }),
    });
  let x = u.data,
    C = x.project,
    T = x.checkpoints.find((e) => e.ui === `now`);
  function E(e) {
    let t = new URLSearchParams(r);
    (e === `path` ? t.delete(`tab`) : t.set(`tab`, e), o(t));
  }
  return (0, Y.jsxs)(m, {
    className: `gap-6`,
    children: [
      (0,Y.jsx)(NotebookHeader,{title:(0,Y.jsx)(t,{source:C.title}),titleText:C.title,back:'/projects',compact:true,actions:(0,Y.jsxs)(Y.Fragment,{children:[(0,Y.jsx)('button',{type:'button','aria-haspopup':'dialog','aria-expanded':v,onClick:()=>y(true),className:'lemma-header-chip',children:'Switch path'}),(0,Y.jsx)('a',{href:'#/atlas',className:'lemma-header-chip',children:'Concept map'})]})}),
      v && (0, Y.jsx)(Ge, { open: !0, onClose: () => y(!1), current: n }),
      T && (0,Y.jsx)(He,{slug:n,cp:T,project:x}),
      (0, Y.jsx)(fe, {
        value: b,
        onChange: E,
        tone: `raised`,
        options: [
          { value: `path`, label: `Path` },
          { value: `sessions`, label: `Sessions`, count: x.sessions.length },
          { value: `sources`, label: `Sources`, count: x.sources.length },
        ],
      }),
      (0, Y.jsx)(
        c.div,
        {
          initial: !_ && { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: _ ? 0.15 : 0.4 },
          children:
            b === `path`
              ? (0, Y.jsxs)(`div`, {
                  className: `flex min-w-0 flex-col gap-4`,
                  children: [
                    (0,Y.jsx)(Oe,{detail:x}),
                    (0,Y.jsx)(LemmaProjectStudyContext,{detail:x}),
                    x.checkpoints.length
                      ? (0, Y.jsx)(je, { detail: x })
                      : (0, Y.jsx)(p, {
                          art: `compass`,
                          title: `A plan is waiting to be written`,
                          body: `Ask your tutor to break your goal into checkpoints.`,
                          action: {
                            label: `Copy plan prompt`,
                            onClick: () => {
                              (navigator.clipboard.writeText(N(C.title)),
                                g(`Plan prompt copied`, { tone: `success` }));
                            },
                          },
                        }),
                  ],
                })
              : b === `sessions`
                ? (0, Y.jsx)(Ue, { slug: n, sessions: x.sessions })
                : (0, Y.jsxs)(Y.Fragment, {
                    children: [
                      (0, Y.jsx)(Be, { sources: x.sources, projectId: C.id }),
                      (0, Y.jsx)(We, { slug: n }),
                    ],
                  }),
        },
        b,
      ),
    ],
  });
}
export { Ke as default, J as t };

function CopyGlyph(props){return (0,Y.jsxs)('svg',{...props,viewBox:'0 0 24 24',width:19,height:19,fill:'none',stroke:'currentColor','aria-hidden':true,children:[(0,Y.jsx)('rect',{x:8,y:8,width:12,height:12,rx:2}),(0,Y.jsx)('path',{d:'M16 8V4H4v12h4'})]});}
