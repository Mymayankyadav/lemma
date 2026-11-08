import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import {
  A as t,
  B as n,
  F as r,
  H as i,
  I as a,
  J as o,
  L as s,
  M as c,
  N as l,
  P as u,
  R as d,
  Vt as f,
  Y as p,
  g as m,
  j as h,
} from "@lemma/index-DcUkykC4.js";
import { n as g, t as _ } from "@lemma/PlugArt-YVnZzBq4.js";
import { n as v, r as y, t as b } from "@lemma/createLucideIcon-C9eAT1Le.js";
import { n as x, t as S } from "@lemma/jsx-runtime-DApVmHJR.js";
import { i as C, n as w, r as T, t as E } from "@lemma/monotone-CFmykcrP.js";
import { n as D, t as O } from "@lemma/GroupedBars-9KPd4Juw.js";
import { t as ee } from "@lemma/Sparkline-5dHkjIwc.js";
import { t as k } from "@lemma/arrow-right-ydNMW8Db.js";
import { t as A } from "@lemma/book-open-gof2bZqq.js";
import { t as j } from "@lemma/check-BXZ7pTLx.js";
import { t as te } from "@lemma/lightbulb-BAga9wem.js";
import { t as M } from "@lemma/play-DwFWW3fX.js";
import { t as N } from "@lemma/sparkles-BT_hGLVy.js";
import { t as P } from "@lemma/Card-nFooZijf.js";
import { t as F } from "@lemma/Button-DTRYSO-L.js";
import { n as I, r as L, t as R } from "@lemma/Check-Cuu8pd38.js";
import { t as z } from "@lemma/Chip-AHlDYqiR.js";
import { t as B } from "@lemma/Segmented-DV1qg3lc.js";
import { t as V } from "@lemma/Rail-D7h5PCRp.js";
import { t as H } from "@lemma/SegmentBar-DKTUmcZ2.js";
import "@lemma/motion-DL_I35iP.js";
import { t as U } from "@lemma/MathText-BeTkDDIi.js";
var W = {
  name: `lock`,
  size: 24,
  node: [
    [
      `rect`,
      {
        width: `18`,
        height: `11`,
        x: `3`,
        y: `11`,
        rx: `2`,
        ry: `2`,
        key: `1w4ew1`,
      },
    ],
    [`path`, { d: `M7 11V7a5 5 0 0 1 10 0v4`, key: `fwvmzm` }],
  ],
};
W.node;
var G = b(W),
  K = {
    name: `settings`,
    size: 24,
    node: [
      [
        `path`,
        {
          d: `M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915`,
          key: `1i5ecw`,
        },
      ],
      [`circle`, { cx: `12`, cy: `12`, r: `3`, key: `1v7zrd` }],
    ],
  };
K.node;
var q = b(K),
  J = S();
function Y({ size: e = 170, className: t = `` }) {
  let n = g();
  return (0, J.jsxs)(`svg`, {
    role: `img`,
    "aria-label": `Book pages illustration`,
    viewBox: `0 0 180 180`,
    width: e,
    height: e,
    className: t,
    children: [
      [
        { x: 43, y: 35, rotation: -7 },
        { x: 52, y: 31, rotation: 4 },
        { x: 57, y: 25, rotation: 0 },
      ].map((e, t) =>
        (0, J.jsxs)(
          v.g,
          {
            style: { transformOrigin: `95px 95px` },
            initial: n ? { opacity: 0, y: 15 } : !1,
            animate: { opacity: 1, y: 0, rotate: e.rotation },
            transition: { duration: 0.55, delay: t * 0.12 },
            children: [
              (0, J.jsx)(`rect`, {
                x: e.x,
                y: e.y,
                width: `87`,
                height: `114`,
                rx: `7`,
                fill: t === 2 ? `var(--raised)` : `var(--tile)`,
                stroke: t === 2 ? `var(--amber-line-2)` : `var(--edge-3)`,
              }),
              t === 2 &&
                (0, J.jsxs)(J.Fragment, {
                  children: [
                    (0, J.jsx)(`path`, {
                      d: `M73 53h43M73 65h46M73 77h35M73 89h41M73 101h37`,
                      stroke: `var(--ink-3)`,
                      strokeWidth: `2`,
                      strokeLinecap: `round`,
                    }),
                    (0, J.jsx)(`path`, {
                      d: `M75 122h24`,
                      stroke: `var(--amber)`,
                      strokeWidth: `2`,
                    }),
                  ],
                }),
            ],
          },
          t,
        ),
      ),
      (0, J.jsx)(v.circle, {
        cx: `143`,
        cy: `37`,
        r: `3`,
        fill: `var(--amber-hi)`,
        animate: n ? { opacity: [0.2, 1, 0.2] } : { opacity: 1 },
        transition: { duration: 3, repeat: 1 / 0 },
      }),
    ],
  });
}
function X({ className: e = ``, count: t = 85 }) {
  let n = g(),
    r = Math.max(10, Math.min(160, Math.floor(t))),
    i = Array.from({ length: r }, (e, t) => ({
      x: (t * 73.123 + Math.sin(t * 5.27) * 31 + 1200) % 1200,
      y: (t * 41.739 + Math.cos(t * 3.17) * 19 + 800) % 800,
      r: t % 7 == 0 ? 1.5 : 0.8,
      opacity: 0.18 + (t % 5) * 0.1,
    }));
  return (0, J.jsx)(`svg`, {
    "aria-hidden": `true`,
    focusable: `false`,
    preserveAspectRatio: `xMidYMid slice`,
    viewBox: `0 0 1200 800`,
    className: `pointer-events-none absolute inset-0 h-full w-full ${e}`,
    children: [0, 1].map((e) =>
      (0, J.jsx)(
        v.g,
        {
          animate: n
            ? { x: [0, e ? 10 : -8, 0], y: [0, e ? -5 : 7, 0] }
            : { x: 0, y: 0 },
          transition: { duration: e ? 34 : 26, repeat: 1 / 0, ease: `linear` },
          children: i
            .filter((t, n) => n % 2 === e)
            .map((e, t) =>
              (0, J.jsx)(
                `circle`,
                {
                  cx: e.x,
                  cy: e.y,
                  r: e.r,
                  fill: `var(--ink-2)`,
                  opacity: e.opacity,
                },
                t,
              ),
            ),
        },
        e,
      ),
    ),
  });
}
var Z = e(x(), 1);
function ne({
  data: e,
  width: t = 316,
  height: n = 132,
  target: r = 0.9,
  min: i = 0.8,
  max: a = 1,
  title: o = `Recall over time`,
  className: s = ``,
}) {
  let c = (0, Z.useId)(),
    l = !!y(),
    u = Math.max(100, t),
    d = Math.max(75, n),
    f = u - 12,
    p = d - 24,
    m = e
      .map((e, t) => ({ ...e, index: t }))
      .filter((e) => e.value != null && Number.isFinite(e.value)),
    h = C()
      .domain([0, Math.max(1, e.length - 1)])
      .range([42, f]),
    g = C().domain([i, a]).range([p, 12]),
    _ = T()
      .x((e) => h(e.index))
      .y((e) => g(e.value ?? i))
      .curve(E),
    b = w()
      .x((e) => h(e.index))
      .y0(p)
      .y1((e) => g(e.value ?? i))
      .curve(E),
    x = _(m) || ``,
    S = b(m) || ``,
    D = m[m.length - 1],
    O = `${o}. ${m.length} points; latest ${D ? Math.round((D.value ?? 0) * 100) + `%` : `no data`}; target ${Math.round(r * 100)}%.`;
  return (0, J.jsxs)(`svg`, {
    className: s,
    width: `100%`,
    viewBox: `0 0 ${u} ${d}`,
    role: `img`,
    "aria-label": O,
    style: { maxWidth: u },
    children: [
      (0, J.jsx)(`defs`, {
        children: (0, J.jsxs)(`linearGradient`, {
          id: c + `-area`,
          x1: `0`,
          x2: `0`,
          y1: `0`,
          y2: `1`,
          children: [
            (0, J.jsx)(`stop`, {
              stopColor: `var(--amber)`,
              stopOpacity: `.35`,
            }),
            (0, J.jsx)(`stop`, {
              offset: `1`,
              stopColor: `var(--amber)`,
              stopOpacity: `0`,
            }),
          ],
        }),
      }),
      [i, (i + a) / 2, a].map((e) =>
        (0, J.jsxs)(
          `g`,
          {
            children: [
              (0, J.jsx)(`line`, {
                x1: 42,
                x2: f,
                y1: g(e),
                y2: g(e),
                stroke: `var(--edge-2)`,
                strokeDasharray: `3 5`,
              }),
              (0, J.jsxs)(`text`, {
                x: 37,
                y: g(e) + 3,
                fill: `var(--ink-3)`,
                textAnchor: `end`,
                fontSize: `14`,
                children: [Math.round(e * 100), `%`],
              }),
            ],
          },
          e,
        ),
      ),
      r >= i &&
        r <= a &&
        (0, J.jsxs)(`g`, {
          children: [
            (0, J.jsx)(`line`, {
              x1: 42,
              x2: f,
              y1: g(r),
              y2: g(r),
              stroke: `var(--ink-3)`,
              strokeDasharray: `5 5`,
              opacity: `.7`,
            }),
            (0, J.jsxs)(`text`, {
              x: f,
              y: g(r) - 5,
              textAnchor: `end`,
              fontSize: `14`,
              fill: `var(--ink-3)`,
              children: [`target `, Math.round(r * 100), `%`],
            }),
          ],
        }),
      S && (0, J.jsx)(`path`, { d: S, fill: `url(#${c}-area)` }),
      x &&
        (0, J.jsx)(v.path, {
          d: x,
          fill: `none`,
          stroke: `var(--amber)`,
          strokeWidth: `2.2`,
          strokeLinecap: `round`,
          strokeLinejoin: `round`,
          initial: !l && { pathLength: 0 },
          animate: { pathLength: 1 },
          transition: { duration: 1.2 },
        }),
      D &&
        (0, J.jsx)(`circle`, {
          "data-stress-mark": ``,
          cx: h(D.index),
          cy: g(D.value ?? i),
          r: `4`,
          fill: `var(--amber-hi)`,
          stroke: `var(--amber)`,
          strokeWidth: `2`,
        }),
      (0, J.jsx)(`text`, {
        x: 42,
        y: d - 5,
        fontSize: `14`,
        fill: `var(--ink-3)`,
        children: e[0]?.label || ``,
      }),
      (0, J.jsx)(`text`, {
        x: f,
        y: d - 5,
        fontSize: `14`,
        textAnchor: `end`,
        fill: `var(--ink-3)`,
        children: e[e.length - 1]?.label || ``,
      }),
    ],
  });
}
var re = /(\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
function ie(e, t = 12) {
  let n = ``;
  for (let r of e.split(re).filter(Boolean)) {
    let e = i(r),
      a = Array.from(e),
      o = Array.from(n).length;
    if (o + a.length <= t) n += e;
    else
      return r.startsWith(`$`) || r.startsWith(`\\(`) || r.startsWith(`\\[`)
        ? (n.trimEnd() || `Math`) + `…`
        : n + a.slice(0, Math.max(0, t - o - 1)).join(``) + `…`;
  }
  return n;
}
function ae({data=[],width=316,title='Time by subject',className=''}){
 const maximum=Math.max(1,...data.map(row=>Number(row.value)||0));
 return (0,J.jsx)('div',{role:'table','aria-label':title,className:'lemma-kit-subject-chart '+className,style:{maxWidth:Math.max(180,width)},children:data.map((row,index)=>(0,J.jsxs)('div',{role:'row',className:'lemma-kit-subject-row',children:[
  (0,J.jsx)('span',{role:'rowheader',title:i(row.label),children:(row.glyph?row.glyph+' ':'')+i(row.label)}),
  (0,J.jsx)('span',{'aria-hidden':true,className:'lemma-kit-subject-track',children:(0,J.jsx)('i',{style:{width:Math.max(0,Math.min(100,(Number(row.value)||0)/maximum*100))+'%'}})}),
  (0,J.jsx)('span',{role:'cell',className:'lemma-kit-subject-value',children:row.display||row.value})
 ]},index))});
}
var oe = (e, t = 0, n = 1) =>
    Math.max(t, Math.min(n, Number.isFinite(e) ? e : t)),
  se = (e) => `${Math.round(e * 100)}%`;
function ce({
  data: e,
  width: t = 316,
  height: n,
  title: r = `Answer confidence calibration`,
  className: i = ``,
}) {
  let a = !!y(),
    o = Math.max(180, t),
    s = n ?? Math.max(60, e.length * 43),
    c = o - 82 - 55;
  return (0, J.jsx)(`svg`, {
    role: `img`,
    "aria-label": `${r}: ${e.map((e) => (e.label || e.confidence || `Unknown`) + ` ` + e.right + ` of ` + e.total + ` correct`).join(`; `)}.`,
    width: `100%`,
    viewBox: `0 0 ${o} ${s}`,
    style: { maxWidth: o },
    className: i,
    children: e.map((e, t) => {
      let n = 7 + t * 43,
        r = oe(e.rate ?? 0);
      return (0, J.jsxs)(
        `g`,
        {
          children: [
            (0, J.jsx)(`text`, {
              x: 6,
              y: n + 17,
              fontSize: `14`,
              fill: `var(--ink-2)`,
              children:
                e.label ||
                (e.confidence
                  ? e.confidence[0].toUpperCase() + e.confidence.slice(1)
                  : `Unknown`),
            }),
            (0, J.jsx)(`rect`, {
              x: 82,
              y: n + 6,
              height: `11`,
              width: c,
              rx: `5.5`,
              fill: `var(--fill-2)`,
            }),
            (0, J.jsx)(v.rect, {
              x: 82,
              y: n + 6,
              height: `11`,
              rx: `5.5`,
              fill: e.rate === null ? `var(--ink-3)` : `var(--amber)`,
              initial: !a && { width: 0 },
              animate: { width: c * r },
              transition: { duration: 0.9, delay: a ? 0 : t * 0.1 },
            }),
            (0, J.jsx)(`text`, {
              x: o - 5,
              y: n + 17,
              textAnchor: `end`,
              fontSize: `14`,
              fill: `var(--ink)`,
              children: e.rate === null ? `—` : se(e.rate),
            }),
          ],
        },
        t,
      );
    }),
  });
}
function le({ as: e = `div`, className: t = ``, children: n, ...r }) {
  return (0, J.jsx)(e, { ...r, className: `glass ${t}`, children: n });
}
function Q({ value: e, label: t }) {
  let n = !!y(),
    r = Math.max(0, Math.min(1, e)),
    i = 2 * Math.PI * 21;
  return (0, J.jsxs)(`div`, {
    role: `progressbar`,
    "aria-label": t,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": Math.round(r * 100),
    className: `relative size-[52px]`,
    children: [
      (0, J.jsxs)(`svg`, {
        "aria-hidden": `true`,
        viewBox: `0 0 52 52`,
        className: `size-full -rotate-90`,
        children: [
          (0, J.jsx)(`circle`, {
            cx: `26`,
            cy: `26`,
            r: 21,
            fill: `none`,
            stroke: `var(--fill-2)`,
            strokeWidth: `4`,
          }),
          (0, J.jsx)(v.circle, {
            cx: `26`,
            cy: `26`,
            r: 21,
            fill: `none`,
            stroke: `var(--amber)`,
            strokeLinecap: `round`,
            strokeWidth: `4`,
            strokeDasharray: i,
            initial: !n && { strokeDashoffset: i },
            animate: { strokeDashoffset: i * (1 - r) },
            transition: { duration: n ? 0.15 : 1.2, ease: [0.65, 0, 0.35, 1] },
          }),
        ],
      }),
      (0, J.jsxs)(`span`, {
        className: `absolute inset-0 flex items-center justify-center text-caption font-semibold`,
        children: [Math.round(r * 100), `%`],
      }),
    ],
  });
}
var ue = {
  done: `Done`,
  revisit: `Needs revisit`,
  now: `In progress`,
  next: `Next checkpoint`,
  locked: `Locked`,
  proposed: `Proposed`,
};
function de({ status: e, className: t = `` }) {
  let n = !!y();
  return (0, J.jsxs)(`span`, {
    role: `img`,
    "aria-label": ue[e],
    className: `relative inline-flex size-7 shrink-0 items-center justify-center rounded-full ${e === `done` || e === `revisit` ? `bg-amber text-amber-ink` : e === `now` ? `border-[2.5px] border-amber bg-amber-tint text-amber-hi` : e === `proposed` ? `border-2 border-dashed border-amber text-amber` : e === `locked` ? `bg-tile text-ink-4` : `border-[1.5px] border-edge-3`} ${t}`,
    children: [
      (e === `done` || e === `revisit`) &&
        (0, J.jsx)(j, { size: 17, strokeWidth: 2.6, "aria-hidden": `true` }),
      e === `locked` && (0, J.jsx)(G, { size: 13, "aria-hidden": `true` }),
      e === `proposed` && (0, J.jsx)(f, { size: 15, "aria-hidden": `true` }),
      e === `now` &&
        (0, J.jsx)(`span`, {
          className: `size-2 rounded-full bg-amber-hi shadow-[0_0_10px_var(--amber)]`,
        }),
      [`now`, `revisit`].includes(e) &&
        !n &&
        (0, J.jsx)(v.span, {
          "aria-hidden": `true`,
          className: `pointer-events-none absolute inset-0 rounded-full border border-amber`,
          animate: { scale: [1, e === `now` ? 2 : 2.1], opacity: [0.6, 0] },
          transition: { duration: 2.4, repeat: 1 / 0 },
        }),
    ],
  });
}
function fe({ items: e }) {
  return (0, J.jsx)(`div`, {
    "aria-label": `Keyboard shortcuts`,
    className: `hidden flex-wrap gap-3 text-label text-ink-3 md:flex`,
    children: e.map((e) =>
      (0, J.jsxs)(
        `span`,
        {
          className: `flex items-center gap-1.5`,
          children: [
            (0, J.jsx)(`kbd`, {
              className: `rounded-s border border-edge-2 bg-well px-2 py-1 font-ui text-ink-2`,
              children: e.key,
            }),
            e.label,
          ],
        },
        e.key,
      ),
    ),
  });
}
var pe = [`done`, `revisit`, `now`, `next`, `locked`, `proposed`],
  me = [
    { key: `Space`, label: `Reveal` },
    { key: `1`, label: `Again` },
    { key: `4`, label: `Easy` },
  ];
function $({ title: e, children: t }) {
  return (0, J.jsxs)(`section`, {
    "aria-label": e,
    className: `flex flex-col gap-4`,
    children: [(0, J.jsx)(o, { children: e }), t],
  });
}
function he() {
  let [e, i] = (0, Z.useState)(`study`),
    [o, g] = (0, Z.useState)(!0),
    [v, y] = (0, Z.useState)(!0),
    [b, x] = (0, Z.useState)(`mixed`),
    [S, C] = (0, Z.useState)(!1),
    w = p();
  return (0, J.jsxs)(n, {
    title: `Component kit`,
    back: `/`,
    className: `pb-12`,
    children: [
      (0, J.jsx)(`p`, {
        className: `font-math text-answer italic text-ink-2`,
        children: `Navy on paper · Day and Night`,
      }),
      (0, J.jsxs)($, {
        title: `Surfaces`,
        children: [
          (0, J.jsxs)(d, {
            lamp: !0,
            children: [
              (0, J.jsx)(`p`, {
                className: `text-label text-ink-3`,
                children: `Slab · soft sheen and lamp`,
              }),
              (0, J.jsx)(`h3`, {
                className: `mt-3 text-title-s font-semibold`,
                children: `Compactness`,
              }),
              (0, J.jsx)(`p`, {
                className: `mt-1 font-math text-ink-soft`,
                children: `Every open cover has a finite subcover.`,
              }),
            ],
          }),
          (0, J.jsxs)(`div`, {
            className: `grid grid-cols-2 gap-3`,
            children: [
              (0, J.jsxs)(s, {
                children: [
                  `Tile`,
                  (0, J.jsx)(`br`, {}),
                  (0, J.jsx)(`span`, {
                    className: `text-label text-ink-3`,
                    children: `Quiet depth`,
                  }),
                ],
              }),
              (0, J.jsxs)(le, {
                className: `rounded-slab p-4`,
                children: [
                  `Glass`,
                  (0, J.jsx)(`br`, {}),
                  (0, J.jsx)(`span`, {
                    className: `text-label text-ink-3`,
                    children: `Frosted surface`,
                  }),
                ],
              }),
            ],
          }),
          (0, J.jsxs)(P, {
            stack: !0,
            children: [
              (0, J.jsx)(`p`, {
                className: `mb-2 text-label text-ink-3`,
                children: `Card · stacked`,
              }),
              (0, J.jsx)(U, {
                source: `If $K\\subseteq\\mathbb{R}^n$ is compact, what can be said about every open cover?`,
                variant: `card`,
              }),
            ],
          }),
          (0, J.jsx)(P, {
            children: (0, J.jsx)(`span`, {
              className: `text-label text-ink-3`,
              children: `Card · single`,
            }),
          }),
          (0, J.jsxs)(P, {
            as: `article`,
            "aria-label": `Nested paper example`,
            className: `p-4`,
            children: [
              (0, J.jsx)(`h3`, {
                className: `text-body-l font-semibold`,
                children: `A proof on one sheet`,
              }),
              (0, J.jsxs)(d, {
                as: `section`,
                "aria-label": `Nested proof group`,
                className: `mt-3 p-3`,
                children: [
                  (0, J.jsx)(`p`, {
                    className: `text-label text-ink-2`,
                    children: `Assume a compact metric space.`,
                  }),
                  (0, J.jsx)(s, {
                    as: `article`,
                    "aria-label": `Nested proof detail`,
                    className: `mt-2 p-3`,
                    children: (0, J.jsxs)(P, {
                      as: `section`,
                      "aria-label": `Nested conclusion`,
                      className: `p-2`,
                      children: [
                        (0, J.jsx)(`p`, {
                          className: `text-body`,
                          children: `Every open cover admits a finite subcover.`,
                        }),
                        (0, J.jsx)(`button`, {
                          type: `button`,
                          onClick: () =>
                            w(`Nested proof selected`, { tone: `success` }),
                          className: `mt-2 min-h-11 rounded-ctl border border-edge px-3 text-label`,
                          children: `Inspect proof`,
                        }),
                      ],
                    }),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      (0, J.jsxs)($, {
        title: `Buttons and controls`,
        children: [
          (0, J.jsxs)(`div`, {
            className: `flex flex-wrap gap-3`,
            children: [
              (0, J.jsx)(F, {
                size: `m`,
                icon: M,
                onClick: () => w(`Ready to study`, { tone: `success` }),
                children: `Start`,
              }),
              (0, J.jsx)(F, { variant: `ghost`, children: `Secondary` }),
              (0, J.jsx)(F, { variant: `danger`, children: `Reject` }),
              (0, J.jsx)(F, { variant: `text`, icon: k, children: `Details` }),
            ],
          }),
          (0, J.jsxs)(`div`, {
            className: `flex flex-wrap items-center gap-3`,
            children: [
              (0, J.jsx)(F, { loading: !0, children: `Saving` }),
              (0, J.jsx)(F, { disabled: !0, children: `Disabled` }),
              (0, J.jsx)(a, { icon: q, label: `Settings`, to: `/settings` }),
              (0, J.jsx)(a, {
                icon: N,
                label: `Notifications`,
                badge: `dot`,
                tone: `amber`,
              }),
              (0, J.jsx)(a, { icon: A, label: `Reading`, tone: `plain` }),
            ],
          }),
          (0, J.jsxs)(`div`, {
            className: `flex items-center gap-5`,
            children: [
              (0, J.jsx)(L, {
                icon: M,
                label: `Copy study prompt`,
                size: 76,
                onClick: () => w(`Study session started`),
              }),
              (0, J.jsx)(L, { icon: j, label: `Approve`, size: 64, halo: !1 }),
            ],
          }),
          (0, J.jsxs)(`div`, {
            className: `flex flex-wrap gap-2`,
            children: [
              [`quiet`, `amber`, `success`, `danger`].map((e) =>
                (0, J.jsx)(z, { tone: e, children: e }, e),
              ),
              (0, J.jsx)(z, {
                tone: `amber`,
                selected: !0,
                icon: f,
                children: `Selected`,
              }),
            ],
          }),
          (0, J.jsx)(B, {
            value: e,
            onChange: i,
            tone: `raised`,
            options: [
              { value: `study`, label: `Study`, count: 4 },
              { value: `review`, label: `Review`, count: 23 },
            ],
          }),
          (0, J.jsx)(B, {
            value: e,
            onChange: i,
            tone: `amber`,
            options: [
              { value: `study`, label: `Study` },
              { value: `review`, label: `Review` },
            ],
          }),
          (0, J.jsx)(I, { label: `Mix decks`, checked: o, onChange: g }),
          (0, J.jsx)(I, {
            label: `Off switch`,
            checked: !1,
            onChange: () => {},
          }),
          (0, J.jsxs)(`div`, {
            className: `flex gap-4`,
            children: [
              (0, J.jsx)(R, {
                label: `Include Algebra`,
                checked: v,
                onChange: y,
              }),
              (0, J.jsx)(R, { label: `Mixed`, checked: b, onChange: x }),
            ],
          }),
        ],
      }),
      (0, J.jsxs)($, {
        title: `Progress and learning state`,
        children: [
          (0, J.jsx)(V, { value: 0.67, sheen: !0, label: `Project progress` }),
          (0, J.jsx)(V, { value: 0.18, label: `Short progress` }),
          (0, J.jsx)(V, { value: 0, label: `Empty progress` }),
          (0, J.jsx)(H, { total: 8, done: 3, current: 4 }),
          (0, J.jsxs)(`div`, {
            className: `flex items-center justify-around`,
            children: [
              (0, J.jsx)(H, { total: 4, done: 1, current: 2 }),
              (0, J.jsx)(Q, { value: 0.75, label: `Course progress` }),
              (0, J.jsx)(Q, { value: 0, label: `Not started` }),
            ],
          }),
          (0, J.jsx)(`div`, {
            className: `flex flex-wrap items-center gap-4`,
            children: pe.map((e) =>
              (0, J.jsxs)(
                `div`,
                {
                  className: `flex flex-col items-center gap-2`,
                  children: [
                    (0, J.jsx)(de, { status: e }),
                    (0, J.jsx)(`span`, {
                      className: `text-caption text-ink-3`,
                      children: e,
                    }),
                  ],
                },
                e,
              ),
            ),
          }),
          (0, J.jsxs)(`div`, {
            className: `flex gap-3`,
            children: [
              (0, J.jsx)(r, { subject: `∫`, active: !0 }),
              (0, J.jsx)(r, { subject: `τ`, hue: `violet` }),
              (0, J.jsx)(r, { subject: `λ`, hue: `cyan`, size: 32 }),
              (0, J.jsx)(r, { subject: `∂`, hue: `rose`, size: 48 }),
            ],
          }),
        ],
      }),
      (0, J.jsxs)($, {
        title: `Mathematical text`,
        children: [
          (0, J.jsx)(U, {
            source: `Prove $\\int_0^1 x^2\\,dx=\\frac13$.`,
            variant: `card`,
          }),
          (0, J.jsx)(U, {
            source: `For $K\\subseteq\\mathbb{R}^n$, compactness is equivalent to **closed and bounded**.`,
            variant: `answer`,
          }),
          (0, J.jsx)(U, {
            source: `The key observation is $\\varepsilon>0$.`,
            variant: `body`,
          }),
          (0, J.jsx)(U, {
            source: `A set is {{c1::compact}} if every open cover has a finite subcover.`,
            cloze: { ord: 1, revealed: !1 },
          }),
          (0, J.jsx)(U, {
            source: `A set is {{c1::compact}} if every open cover has a finite subcover.`,
            cloze: { ord: 1, revealed: !0 },
          }),
        ],
      }),
      (0, J.jsxs)($, {
        title: `Layers, feedback and loading`,
        children: [
          (0, J.jsx)(F, {
            variant: `ghost`,
            onClick: () => C(!0),
            children: `Open bottom sheet`,
          }),
          (0, J.jsx)(F, {
            variant: `ghost`,
            onClick: () =>
              w(`Prompt copied`, {
                action: { label: `Undo`, onClick: () => w(`Undone`) },
              }),
            children: `Show toast with action`,
          }),
          (0, J.jsx)(F, {
            variant: `ghost`,
            onClick: () => w(`Could not save`, { tone: `danger` }),
            children: `Danger toast`,
          }),
          (0, J.jsxs)(`div`, {
            className: `flex flex-col gap-2`,
            children: [
              (0, J.jsx)(u, { w: `80%`, h: 18 }),
              (0, J.jsx)(u, { w: `55%`, h: 18 }),
            ],
          }),
          (0, J.jsx)(fe, { items: me }),
        ],
      }),
      (0, J.jsxs)($, {
        title: `Illustrations and empty states`,
        children: [
          (0, J.jsxs)(`div`, {
            className: `grid grid-cols-3 gap-2`,
            children: [
              (0, J.jsx)(l, { size: 105 }),
              (0, J.jsx)(c, { size: 105 }),
              (0, J.jsx)(Y, { size: 105 }),
              (0, J.jsx)(_, { connected: !0, size: 105 }),
              (0, J.jsx)(_, { connected: !1, size: 105 }),
              (0, J.jsx)(h, { size: 105 }),
            ],
          }),
          (0, J.jsxs)(`div`, {
            className: `relative h-32 overflow-hidden rounded-slab bg-obsidian-deep`,
            children: [
              (0, J.jsx)(X, {}),
              (0, J.jsx)(`span`, {
                className: `absolute bottom-3 left-3 text-label text-ink-2`,
                children: `Starfield`,
              }),
            ],
          }),
          (0, J.jsx)(`div`, {
            className: `grid grid-cols-2 gap-3`,
            children: [`compass`, `deck`, `plug`, `inbox`].map((e) =>
              (0, J.jsx)(
                s,
                {
                  className: `min-h-[160px]`,
                  children: (0, J.jsx)(t, {
                    art: e,
                    title:
                      e === `deck`
                        ? `Nothing due`
                        : e === `plug`
                          ? `Offline`
                          : e === `inbox`
                            ? `All clear`
                            : `No projects`,
                    body: `A calm place to continue.`,
                    className: `gap-1 py-0 [&_svg]:h-20 [&_svg]:w-20`,
                  }),
                },
                e,
              ),
            ),
          }),
        ],
      }),
      (0, J.jsxs)($, {
        title: `Analytical charts`,
        children: [
          (0, J.jsxs)(d, {
            children: [
              (0, J.jsx)(`h3`, {
                className: `mb-2 text-body-l font-semibold`,
                children: `Recall · 30 days`,
              }),
              (0, J.jsx)(ne, {
                data: [
                  { label: `30d ago`, value: 0.84 },
                  { label: ``, value: 0.9 },
                  { label: ``, value: 0.89 },
                  { label: ``, value: 0.94 },
                  { label: `Today`, value: 0.92 },
                ],
                target: 0.9,
              }),
            ],
          }),
          (0, J.jsxs)(d, {
            children: [
              (0, J.jsx)(`h3`, {
                className: `mb-2 text-body-l font-semibold`,
                children: `Reviews by day`,
              }),
              (0, J.jsx)(D, {
                data: [
                  { label: `M`, again: 2, hard: 4, good: 12, easy: 3 },
                  { label: `T`, again: 1, hard: 3, good: 10, easy: 8 },
                  { label: `W`, again: 3, hard: 1, good: 15, easy: 5 },
                  { label: `T`, again: 0, hard: 2, good: 13, easy: 9 },
                  { label: `F`, again: 2, hard: 3, good: 8, easy: 2 },
                  { label: `S`, again: 1, hard: 2, good: 12, easy: 6 },
                  { label: `S`, again: 1, hard: 3, good: 9, easy: 5 },
                ],
              }),
            ],
          }),
          (0, J.jsxs)(d, {
            children: [
              (0, J.jsx)(`h3`, {
                className: `mb-2 text-body-l font-semibold`,
                children: `When you said`,
              }),
              (0, J.jsx)(ce, {
                data: [
                  { confidence: `sure`, total: 20, right: 19, rate: 0.95 },
                  { confidence: `unsure`, total: 14, right: 9, rate: 9 / 14 },
                  { confidence: `guess`, total: 6, right: 2, rate: 1 / 3 },
                ],
              }),
            ],
          }),
          (0, J.jsxs)(d, {
            children: [
              (0, J.jsx)(`h3`, {
                className: `mb-2 text-body-l font-semibold`,
                children: `Time by subject`,
              }),
              (0, J.jsx)(ae, {
                data: [
                  {
                    label: `Analysis`,
                    glyph: `∫`,
                    value: 560,
                    display: `9h 20m`,
                  },
                  {
                    label: `Algebra`,
                    glyph: `λ`,
                    value: 365,
                    display: `6h 5m`,
                  },
                  {
                    label: `Topology`,
                    glyph: `τ`,
                    value: 195,
                    display: `3h 15m`,
                  },
                ],
              }),
            ],
          }),
          (0, J.jsxs)(d, {
            children: [
              (0, J.jsx)(`h3`, {
                className: `mb-2 text-body-l font-semibold`,
                children: `Checkpoints`,
              }),
              (0, J.jsx)(O, {
                data: [
                  { label: `W1`, demonstrated: 3, rechecked: 2 },
                  { label: `W2`, demonstrated: 2, rechecked: 5 },
                  { label: `W3`, demonstrated: 5, rechecked: 3 },
                  { label: `Now`, demonstrated: 4, rechecked: 6 },
                ],
              }),
            ],
          }),
          (0, J.jsxs)(d, {
            children: [
              (0, J.jsx)(`h3`, {
                className: `mb-2 text-body-l font-semibold`,
                children: `Card interval history`,
              }),
              (0, J.jsx)(ee, {
                data: [
                  { value: 1, rating: 3 },
                  { value: 4, rating: 4 },
                  { value: 10, rating: 3 },
                  { value: 26, rating: 2 },
                  { value: 54, rating: 4 },
                ],
              }),
            ],
          }),
        ],
      }),
      (0,J.jsx)($,{title:'Calendar components',children:(0,J.jsx)('lemma-calendar-specimens',{})}),
      (0, J.jsx)(m, {
        open: S,
        onClose: () => C(!1),
        title: `Checkpoint details`,
        children: (0, J.jsxs)(`div`, {
          className: `flex flex-col gap-5`,
          children: [
            (0, J.jsx)(U, {
              source: `Why does a finite subcover exist?`,
              variant: `card`,
            }),
            (0, J.jsx)(F, {
              onClick: () => C(!1),
              icon: te,
              children: `Got it`,
            }),
          ],
        }),
      }),
    ],
  });
}
export { he as default };
