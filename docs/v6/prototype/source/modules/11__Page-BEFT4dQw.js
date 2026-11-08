import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { t } from "@lemma/Tex-kn8bVMsW.js";
import { n, t as r } from "@lemma/jsx-runtime-DApVmHJR.js";
import { f as i, t as a, u as o } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as s } from "@lemma/book-open-gof2bZqq.js";
import { n as c, r as l, t as u } from "@lemma/createLucideIcon-C9eAT1Le.js";
import { t as ee } from "@lemma/clock-BEn_QF7F.js";
import {
  NotebookMenu,
  Ct as te,
  G as ne,
  Gt as d,
  Ht as f,
  I as p,
  R as m,
  U as h,
  Wt as re,
  Y as ie,
  bt as ae,
  g,
  gt as _,
  q as v,
  ut as oe,
} from "@lemma/index-DcUkykC4.js";
import { t as y } from "@lemma/target-D3iujC2g.js";
import { t as b } from "@lemma/triangle-alert-Ch3x0hWo.js";
import { t as x } from "@lemma/lightbulb-BAga9wem.js";
import { t as S } from "@lemma/sparkles-BT_hGLVy.js";
import { t as C } from "@lemma/bot-NKhN2-xk.js";
import { t as w } from "@lemma/check-BXZ7pTLx.js";
import { t as T } from "@lemma/arrow-right-ydNMW8Db.js";
import { t as E } from "@lemma/Chip-AHlDYqiR.js";
import { t as D } from "@lemma/Button-DTRYSO-L.js";
import { t as O } from "@lemma/MathText-BeTkDDIi.js";
var k = {
  name: `book-bookmark`,
  size: 24,
  node: [
    [
      `path`,
      {
        d: `M10 2v7.751a.25.25 0 00.407.195l2.28-1.834a.5.5 0 01.627 0l2.28 1.834A.25.25 0 0016 9.751V2`,
        key: `x9x4jl`,
      },
    ],
    [
      `path`,
      {
        d: `M4 19.5v-15A2.5 2.5 0 016.5 2H19a1 1 0 011 1v18a1 1 0 01-1 1H6.5a1 1 0 010-5H20`,
        key: `1889un`,
      },
    ],
  ],
  aliases: [`book-marked`],
};
k.node;
var A = u(k),
  j = {
    name: `calendar`,
    size: 24,
    node: [
      [`path`, { d: `M8 2v3`, key: `1ioesn` }],
      [`path`, { d: `M16 2v3`, key: `otl347` }],
      [
        `rect`,
        { x: `3`, y: `3`, width: `18`, height: `18`, rx: `2`, key: `h1oib` },
      ],
      [`path`, { d: `M3 9h18`, key: `1pudct` }],
    ],
  };
j.node;
var M = u(j),
  N = {
    name: `circle-check-big`,
    size: 24,
    node: [
      [`path`, { d: `M21.801 10A10 10 0 1 1 17 3.335`, key: `yps3ct` }],
      [`path`, { d: `m9 11 3 3L22 4`, key: `1pflzl` }],
    ],
    aliases: [`check-circle`],
  };
N.node;
var P = u(N),
  F = {
    name: `rotate-ccw-clock`,
    size: 24,
    node: [
      [
        `path`,
        {
          d: `M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8`,
          key: `1357e3`,
        },
      ],
      [`path`, { d: `M3 3v5h5`, key: `1xhq8a` }],
      [`path`, { d: `M12 7v5l4 2`, key: `1fdv2h` }],
    ],
    aliases: [`history`],
  };
F.node;
var I = u(F),
  L = e(n(), 1);
function R(e) {
  let t = [];
  for (let n = 0; n < e.length; n++) {
    let r = e[n],
      i = t[t.length - 1];
    i?.kind === r.kind && ![`attempt`, `evidence`, `recheck`].includes(r.kind)
      ? i.events.push(r)
      : t.push({ kind: r.kind, start: n, events: [r] });
  }
  return t;
}
function z(e, t) {
  return `${e} ${e === 1 ? `card` : `cards`} · ${t} waiting`;
}
var B = r(),
  V = {
    pretest: A,
    attempt: y,
    hint: x,
    explanation: s,
    misconception: b,
    evidence: P,
    recheck: I,
    note: f,
  },
  H = {
    pretest: `Warm-up`,
    attempt: `Attempt`,
    hint: `Hint`,
    explanation: `Explanation`,
    misconception: `Misconception`,
    evidence: `Evidence`,
    recheck: `Recheck`,
    note: `Note`,
  },
  U = { yes: `Goal met`, partial: `Partly met`, no: `Not yet met` },
  W = (e) => new Date(e).toLocaleDateString(void 0, { weekday: `long` });
function G({ event: e, index: t }) {
  let n = V[e.kind],
    r = !!l(),
    i = e.kind === `evidence` && e.outcome === `demonstrated`,
    a = e.hintLevel ?? 0;
  return (0, B.jsxs)(c.li, {
    initial: !r && { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: r ? 0.15 : 0.4, delay: Math.min(t, 6) * 0.07 },
    className: `relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 pb-5 last:pb-0`,
    children: [
      (0, B.jsx)(`span`, {
        "aria-hidden": `true`,
        className: `relative z-10 flex size-10 items-center justify-center rounded-full border font-semibold ${i ? `border-amber bg-amber text-amber-ink` : e.kind === `misconception` ? `border-amber-line text-amber` : `border-edge-2 bg-tile text-ink-2`}`,
        style: { fontFamily: `var(--font-display)`, fontSize: 20 },
        children: t + 1,
      }),
      (0, B.jsxs)(`div`, {
        className: `min-w-0 pt-1`,
        children: [
          (0, B.jsxs)(`div`, {
            className: `flex flex-wrap items-center gap-2`,
            children: [
              (0, B.jsx)(n, {
                size: 15,
                "aria-hidden": `true`,
                className:
                  e.kind === `misconception` ? `text-amber` : `text-ink-3`,
              }),
              (0, B.jsx)(`h3`, {
                className: `text-body-l font-semibold`,
                children: H[e.kind],
              }),
              e.checkpointCode &&
                (0, B.jsx)(`span`, {
                  className: `text-caption text-ink-3`,
                  children: e.checkpointCode,
                }),
              e.hintLevel !== null &&
                e.kind === `hint` &&
                (0, B.jsxs)(`span`, {
                  "aria-label": `Hint level ${e.hintLevel}`,
                  className: `inline-flex items-center gap-1.5`,
                  children: [
                    (0, B.jsxs)(`span`, {
                      className: `text-caption tabular-nums text-ink-2`,
                      children: [`Level `, e.hintLevel],
                    }),
                    [1, 2, 3, 4].map((e) =>
                      (0, B.jsx)(
                        `i`,
                        {
                          "aria-hidden": `true`,
                          className: `h-1 w-2.5 rounded-[1px] ${e <= Math.ceil(a / 5) ? `bg-amber` : `bg-fill-2`}`,
                        },
                        e,
                      ),
                    ),
                  ],
                }),
            ],
          }),
          (0, B.jsx)(`div`, {
            className:
              e.kind === `misconception`
                ? `mt-2 border-l-2 border-amber pl-3 italic`
                : `mt-1.5`,
            children: (0, B.jsx)(O, {
              source: e.body,
              className: `text-body text-ink-2`,
            }),
          }),
          e.outcome &&
            (0, B.jsx)(E, {
              size: 28,
              tone:
                e.outcome === `demonstrated`
                  ? `success`
                  : e.outcome === `failed`
                    ? `danger`
                    : `amber`,
              children: e.outcome,
            }),
        ],
      }),
    ],
  });
}
function lemmaSessionEventKind(event){
 if(event.kind==='evidence'&&event.outcome==='demonstrated')return 'demonstrated';
 if(event.kind==='evidence'&&event.outcome==='partial')return 'partial';
 if(event.kind==='recheck')return /fail|no|partial/.test(event.outcome||'')?'recheck-failed':'rechecked';
 return event.kind==='misconception'?'revisit':'other';
}
function LemmaSessionOutcome({events=[]}){
 const kinds=events.map(lemmaSessionEventKind),count=kind=>kinds.filter(value=>value===kind).length;
 const summary=events.length+' recorded events · '+count('demonstrated')+' demonstrated · '+count('partial')+' partial · '+count('rechecked')+' rechecked · '+(count('revisit')+count('recheck-failed'))+' to revisit';
 const size=Math.max(1,Math.ceil(events.length/24)),bins=Array.from({length:Math.ceil(events.length/size)},(_,index)=>{const values=kinds.slice(index*size,(index+1)*size),counts=Object.fromEntries([...new Set(values)].map(kind=>[kind,values.filter(value=>value===kind).length]));return {from:index*size+1,to:Math.min(events.length,(index+1)*size),values,counts}});
 return (0,B.jsxs)('figure',{className:'lemma-session-outcome',children:[(0,B.jsx)('figcaption',{children:summary}),
  (0,B.jsx)('svg',{role:'img','aria-label':'Session event timeline. '+summary,viewBox:'0 0 '+Math.max(12,bins.length*12)+' 22',width:'100%',height:30,preserveAspectRatio:'none',children:bins.map((bin,index)=>{let y=3;return (0,B.jsxs)('g',{children:[(0,B.jsx)('title',{children:'Events '+bin.from+'–'+bin.to+' · '+Object.entries(bin.counts).map(([kind,count])=>count+' '+kind).join(', ')}),...Object.entries(bin.counts).map(([kind,count])=>{const height=16*count/bin.values.length,top=y;y+=height;return (0,B.jsx)('rect',{x:index*12,y:top,width:9,height,'data-event-kind':kind,fill:kind==='demonstrated'?'var(--accent)':kind==='partial'?'var(--warn)':kind==='rechecked'?'var(--early)':/revisit|failed/.test(kind)?'var(--danger)':'var(--track)'},kind)})]},index)})}),
  (0,B.jsx)('small',{children:'Event order from left to right · up to '+size+' events per column. Segments show recorded outcomes; exact events remain below.'})]});
}
function K() {
  let { slug: e = ``, n = `` } = o(),
    r = Number(n),
    s = ae(e, r),
    c = oe(e),
    l = te(),
    [u] = i(),
    y = u.get(`cards`) === `1`,
    [k, A] = (0, L.useState)(0),
    j = _(),
    N = ie(),
    [P, F] = (0, L.useState)(!1),
    [I, V] = (0, L.useState)(!1),
    [K, se] = (0, L.useState)([]),
    [q, J] = (0, L.useState)(20),
    Y = s.data,
    X = Y?.summary,
    Z = R(Y?.events ?? []),
    Q = (0, L.useCallback)(
      async (e) => {
        try {
          (await navigator.clipboard.writeText(e),
            N(`Copied to clipboard`, { tone: `success` }));
        } catch {
          N(`Copy unavailable. Select the text to copy.`, { tone: `danger` });
        }
      },
      [N],
    ),
    ce = (e) => window.__lemmaCopyPrompt(e,N),
    $ =
      (Y?.pendingProposals.cards ?? 0) + (Y?.pendingProposals.planChanges ?? 0),
    le = `Session ${Number.isInteger(r) ? r : ``}`;
  return (0, B.jsxs)(`section`, {
    "data-euclid-session": !0,
    className: `flex flex-col gap-5`,
    children: [
      (0, B.jsxs)(`header`, {
        "data-ui":`session-header`,className:`session-header`,
        children: [
          (0, B.jsx)(a, {
            "aria-label": `Back to project`,
            to: `/p/${e}?tab=sessions`,
            className: `flex size-11 items-center justify-center rounded-ctl text-ink-2`,
            children: (0, B.jsx)(T, { className: `rotate-180`, size: 22 }),
          }),
          (0, B.jsxs)(`div`, {
            className: `min-w-0 flex-1`,
            children: [
              (0, B.jsx)(`h1`, {
                className: `sr-only`,
                children: `Session record`,
              }),
              (0, B.jsx)(`h2`, {
                className: `text-num-l font-medium italic`,
                style: { fontFamily: `var(--font-display)` },
                children: le,
              }),
            ],
          }),
          (0, B.jsx)(p, {
            icon: re,
            label: `More actions`,
            onClick: () => F(!P),
          }),
          (0,B.jsx)(NotebookMenu,{}),
        ],
      }),
      P &&
        (0, B.jsxs)(`div`, {
          className: `glass flex flex-wrap gap-2 rounded-slab p-3`,
          children: [
            (0, B.jsx)(`button`, {
              className: `min-h-11 rounded-ctl px-4 text-ink-2`,
              onClick: () => {
                (Q(Y?.summaryText || X?.goal || ``), F(!1));
              },
              children: `Copy summary`,
            }),
            (0, B.jsx)(a, {
              className: `inline-flex min-h-11 items-center rounded-ctl px-4`,
              to: `/p/${e}`,
              children: `Open project`,
            }),
          ],
        }),
      s.isPending
        ? (0, B.jsx)(`p`, {
            role: `status`,
            className: `p-4 text-ink-2`,
            children: `Loading session…`,
          })
        : s.isError || !Y || !X
          ? (0, B.jsxs)(`div`, {
              role: `alert`,
              className: `p-4`,
              children: [
                `Session unavailable. `,
                (0, B.jsx)(a, {
                  className: `text-ink-2`,
                  to: `/p/${e}`,
                  children: `Open project`,
                }),
              ],
            })
          : (0, B.jsxs)(B.Fragment, {
              children: [
                (0, B.jsxs)(`div`, {
                  className: `flex items-center gap-4 text-label text-ink-2`,
                  children: [
                    (0, B.jsxs)(`span`, {
                      className: `flex items-center gap-1.5`,
                      children: [
                        (0, B.jsx)(ee, { size: 14 }),
                        X.minutes === null ? `In progress` : `${X.minutes} min`,
                      ],
                    }),
                    (0, B.jsxs)(`span`, {
                      className: `flex items-center gap-1.5`,
                      children: [
                        X.client === `claude`
                          ? (0, B.jsx)(S, { size: 14 })
                          : (0, B.jsx)(C, { size: 14 }),
                        ` `,
                        X.client === `claude`
                          ? `Claude`
                          : X.client === `chatgpt`
                            ? `ChatGPT`
                            : `Tutor`,
                      ],
                    }),
                    (0, B.jsxs)(`span`, {
                      className: `flex items-center gap-1.5`,
                      children: [(0, B.jsx)(M, { size: 14 }), W(X.startedAt)],
                    }),
                  ],
                }),
                (0, B.jsxs)(m, {
                  className: `flex flex-col gap-4`,
                  children: [
                    (0, B.jsx)(`div`, {
                      className: `flex items-center gap-3`,
                      children: (0, B.jsxs)(`div`, {
                        className: `min-w-0 flex-1`,
                        children: [
                          (0, B.jsx)(`p`, {
                            className: `text-label text-ink-3`,
                            children: `Session goal`,
                          }),
                          (0, B.jsx)(O, {
                            source: X.goal,
                            className: `mt-1 text-headline`,
                          }),
                        ],
                      }),
                    }),
                    (0, B.jsxs)(`div`, {
                      className: `flex flex-wrap gap-2`,
                      children: [
                        X.goalMet
                          ? (0, B.jsx)(E, {
                              tone:
                                X.goalMet === `yes`
                                  ? `success`
                                  : X.goalMet === `no`
                                    ? `danger`
                                    : `amber`,
                              icon: X.goalMet === `yes` ? w : void 0,
                              children: U[X.goalMet],
                            })
                          : (0, B.jsx)(E, {
                              tone: `amber`,
                              children:
                                X.display === `live`
                                  ? `Live`
                                  : X.display === `paused`
                                    ? `Paused`
                                    : `Ended`,
                            }),
                        X.checkpointCode &&
                          (0,B.jsx)(E,{children:X.checkpointCode}),
                        X.checkpointCode&&c.data?.checkpoints&&!c.data.checkpoints.some(cp=>cp.code===X.checkpointCode)&&(0,B.jsx)('p',{role:'status',className:'lemma-field-error',children:'The recorded checkpoint is not in this path. Check the session link before using it as learning evidence.'}),
                        X.checkpointCode&&c.data?.checkpoints?.find(cp=>cp.ui==='now')&&Number(X.checkpointCode.replace(/\D/g,''))>Number(c.data.checkpoints.find(cp=>cp.ui==='now').code.replace(/\D/g,''))&&(0,B.jsx)('p',{className:'text-label text-ink-2',children:'This session refers to a checkpoint ahead of your current path. It does not advance the path on its own.'}),
                      ],
                    }),
                    Y.summaryText &&
                      (0, B.jsxs)(`div`, {
                        className: `flex flex-col gap-2 border-t border-[var(--hair)] pt-3`,
                        children: [
                          (0, B.jsx)(`h2`, {
                            className: `text-body font-semibold`,
                            children: `Summary`,
                          }),
                          (0, B.jsx)(O, {
                            source: Y.summaryText,
                            className: `text-body-l`,
                          }),
                        ],
                      }),
                  ],
                }),
                y &&
                  (0, B.jsxs)(`section`, {
                    "aria-label": `Cards from this session`,
                    className: `flex flex-col gap-3`,
                    children: [
                      (0, B.jsx)(a, {
                        to: `/s/${e}/${r}`,
                        className: `inline-flex min-h-11 items-center text-label font-semibold text-ink-2`,
                        children: `Back to reasoning`,
                      }),
                      (0, B.jsxs)(`h2`, {
                        className: `text-title-s font-semibold`,
                        children: [`Cards from S`, r],
                      }),
                      (0, B.jsxs)(`p`, {
                        className: `text-label text-ink-3`,
                        children: [
                          Math.min(k * 20 + 1, Y.cards.length),
                          `–`,
                          Math.min((k + 1) * 20, Y.cards.length),
                          ` of `,
                          Y.cards.length,
                        ],
                      }),
                      Y.cards
                        .slice(k * 20, (k + 1) * 20)
                        .map((e, t) =>
                          (0, B.jsxs)(
                            a,
                            {
                              to:
                                e.state === `pending`
                                  ? `/proposals`
                                  : `/cards/${e.noteNo}`,
                              className: `flex min-h-14 items-center gap-3 rounded-ctl border border-edge bg-raised px-3`,
                              children: [
                                (0, B.jsx)(`span`, {
                                  className: `min-w-0 flex-1 line-clamp-2 font-math text-body`,
                                  children: (0, B.jsx)(O, { source: e.front }),
                                }),
                                (0, B.jsx)(`span`, {
                                  className: `shrink-0 text-label text-ink-3`,
                                  children:
                                    e.state === `pending`
                                      ? `Waiting`
                                      : `N${e.noteNo}`,
                                }),
                                (0, B.jsx)(T, {
                                  size: 17,
                                  className: `shrink-0`,
                                }),
                              ],
                            },
                            e.noteNo + `-` + t,
                          ),
                        ),
                      (0, B.jsxs)(`div`, {
                        className: `flex gap-2`,
                        children: [
                          k > 0 &&
                            (0, B.jsx)(`button`, {
                              type: `button`,
                              className: `min-h-11 flex-1 rounded-ctl border border-edge px-3 text-ink-2`,
                              onClick: () => A((e) => e - 1),
                              children: `Previous 20`,
                            }),
                          (k + 1) * 20 < Y.cards.length &&
                            (0, B.jsx)(`button`, {
                              type: `button`,
                              className: `min-h-11 flex-1 rounded-ctl border border-edge px-3 text-ink-2`,
                              onClick: () => A((e) => e + 1),
                              children: `More cards`,
                            }),
                        ],
                      }),
                    ],
                  }),
                !y &&
                  (0, B.jsxs)(`section`, {
                    "aria-label": `Reasoning`,
                    className: `flex flex-col gap-4`,
                    children: [
                      (0, B.jsx)(`h2`, {
                        className: `text-headline font-semibold italic`,
                        style: { fontFamily: `var(--font-display)` },
                        children: `Reasoning`,
                      }),
                      Y&&(0,B.jsx)(LemmaSessionOutcome,{events:Y.events}),
                      (0,B.jsx)('span',{
                        hidden:true,children:'',
                      }),
                      Y.events.length
                        ? (0, B.jsxs)(B.Fragment, {
                            children: [
                              (0, B.jsx)(`ol`, {
                                className: `relative before:absolute before:bottom-5 before:left-5 before:top-4 before:w-px before:bg-linear-to-b before:from-edge-2 before:to-amber/60`,
                                children: Z.slice(0, q).map((e) => {
                                  let t = e.events.length >= 3,
                                    n = K.includes(e.start);
                                  return t
                                    ? (0, B.jsxs)(
                                        `li`,
                                        {
                                          className: `relative pb-5`,
                                          children: [
                                            (0, B.jsxs)(`button`, {
                                              type: `button`,
                                              "aria-expanded": n,
                                              onClick: () =>
                                                se((t) =>
                                                  n
                                                    ? t.filter(
                                                        (t) => t !== e.start,
                                                      )
                                                    : [...t, e.start],
                                                ),
                                              className: `flex min-h-11 w-full items-center gap-3 rounded-ctl border border-edge bg-fill-1 px-3 text-left text-body font-semibold text-ink-2`,
                                              children: [
                                                (0, B.jsx)(x, {
                                                  size: 16,
                                                  className: `shrink-0 text-amber`,
                                                }),
                                                (0, B.jsxs)(`span`, {
                                                  className: `flex-1`,
                                                  children: [
                                                    e.events.length,
                                                    ` `,
                                                    H[e.kind].toLowerCase(),
                                                    e.events.length === 1
                                                      ? ``
                                                      : `s`,
                                                    ` · events `,
                                                    e.start + 1,
                                                    `–`,
                                                    e.start + e.events.length,
                                                  ],
                                                }),
                                                (0, B.jsx)(`span`, {
                                                  className: `text-ink-2`,
                                                  children: n ? `Hide` : `Show`,
                                                }),
                                              ],
                                            }),
                                            n &&
                                              (0, B.jsx)(`ol`, {
                                                className: `mt-3`,
                                                children: e.events.map((t, n) =>
                                                  (0, B.jsx)(
                                                    G,
                                                    {
                                                      event: t,
                                                      index: e.start + n,
                                                    },
                                                    t.id,
                                                  ),
                                                ),
                                              }),
                                          ],
                                        },
                                        e.events[0].id,
                                      )
                                    : e.events.map((t, n) =>
                                        (0, B.jsx)(
                                          G,
                                          { event: t, index: e.start + n },
                                          t.id,
                                        ),
                                      );
                                }),
                              }),
                              q < Z.length &&
                                (0, B.jsxs)(`button`, {
                                  type: `button`,
                                  onClick: () => J((e) => e + 20),
                                  className: `min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold text-ink-2`,
                                  children: [
                                    `More reasoning · `,
                                    Z.length - q,
                                    ` groups remaining`,
                                  ],
                                }),
                            ],
                          })
                        : (0, B.jsx)(`p`, {
                            className: `text-body text-ink-3`,
                            children: `No reasoning events recorded for this session.`,
                          }),
                    ],
                  }),
                !y &&
                  !!Y.misconceptions.filter((e) => !e.resolvedAt).length &&
                  (0, B.jsxs)(`section`, {
                    className: `flex flex-col gap-3`,
                    children: [
                      (0, B.jsx)(`h2`, {
                        className: `text-title-s font-semibold italic`,
                        style: { fontFamily: `var(--font-display)` },
                        children: `Things to revisit`,
                      }),
                      Y.misconceptions
                        .filter((e) => !e.resolvedAt)
                        .map((e) =>
                          (0, B.jsxs)(
                            `div`,
                            {
                              className: `flex flex-wrap items-center gap-3 border-l-2 border-amber py-2 pl-3`,
                              children: [
                                (0, B.jsx)(b, {
                                  className: `text-amber`,
                                  size: 18,
                                }),
                                (0, B.jsx)(`span`, {
                                  className: `min-w-0 flex-1 text-body-l`,
                                  children: (0, B.jsx)(t, { source: e.label }),
                                }),
                                (0, B.jsxs)(E, {
                                  tone: `amber`,
                                  children: [e.times, `×`],
                                }),
                                (0, B.jsx)(`button`, {
                                  disabled: j.isPending,
                                  className: `min-h-11 rounded-ctl px-2 text-label font-semibold text-ink-2`,
                                  onClick: () =>
                                    j.mutate(e.id, {
                                      onSuccess: () =>
                                        N(`Marked resolved`, {
                                          tone: `success`,
                                        }),
                                      onError: () =>
                                        N(`Couldn’t save. Try again.`, {
                                          tone: `danger`,
                                        }),
                                    }),
                                  children: `Resolved`,
                                }),
                              ],
                            },
                            e.id,
                          ),
                        ),
                    ],
                  }),
                !!Y.cards.length &&
                  (0, B.jsxs)(`section`, {
                    "aria-label": `Session cards`,
                    className: `flex flex-col gap-2`,
                    children: [
                      (0, B.jsx)(`h2`, {
                        className: `text-title-s font-semibold italic`,
                        style: { fontFamily: `var(--font-display)` },
                        children: `Cards`,
                      }),
                      (0, B.jsxs)(a, {
                        to: `/s/${e}/${r}?cards=1`,
                        className: `flex min-h-14 items-center justify-between gap-3 rounded-ctl border border-edge bg-raised px-4 text-body text-ink-2`,
                        children: [
                          (0, B.jsx)(`span`, {
                            children: z(
                              Y.cards.length,
                              Y.cards.filter((e) => e.state === `pending`)
                                .length,
                            ),
                          }),
                          (0, B.jsx)(T, { size: 18, className: `shrink-0` }),
                        ],
                      }),
                    ],
                  }),
                $ > 0 &&
                  (0, B.jsxs)(`p`, {
                    className: `text-label text-ink-2`,
                    "aria-label": `Pending session proposals`,
                    children: [
                      Y.pendingProposals.cards,
                      ` `,
                      Y.pendingProposals.cards === 1 ? `card` : `cards`,
                      ` ·`,
                      ` `,
                      Y.pendingProposals.planChanges,
                      ` `,
                      Y.pendingProposals.planChanges === 1
                        ? `plan change`
                        : `plan changes`,
                      ` waiting`,
                    ],
                  }),
                (0, B.jsxs)(`div`, {
                  role: `group`,
                  "aria-label": `Session actions`,
                  className: `flex flex-col gap-2`,
                  children: [
                    (0, B.jsx)(D, {
                      className: `w-full`,
                      icon: f,
                      onClick: () =>
                        ce(
                          X.display === `ended`
                            ? v(
                                c.data?.project.title || e,
                                X.checkpointCode || void 0,
                              )
                            : ne(c.data?.project.title || e),
                        ),
                      children:
                        X.display === `ended`
                          ? `Copy study prompt`
                          : `Resume session`,
                    }),
                    (0, B.jsxs)(`div`, {
                      className: `flex flex-wrap items-center gap-x-5 gap-y-1`,
                      children: [
                        (0, B.jsxs)(`button`, {
                          type: `button`,
                          "aria-label": `Copy session summary`,
                          className: `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-label font-semibold text-ink-2`,
                          onClick: () => void Q(Y.summaryText || X.goal),
                          children: [
                            (0, B.jsx)(d, { size: 16, "aria-hidden": `true` }),
                            `Copy`,
                          ],
                        }),
                        $ > 0 &&
                          (0, B.jsx)(a, {
                            to: `/proposals`,
                            className: `inline-flex min-h-11 min-w-11 items-center justify-center text-label font-semibold text-ink-2`,
                            children: `Review`,
                          }),
                        Y.pages &&
                          (0, B.jsx)(`button`, {
                            type: `button`,
                            className: `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-label font-semibold text-ink-2`,
                            onClick: () => V(!0),
                            children: `Pages`,
                          }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
      (0, B.jsxs)(g, {
        title: `Session pages`,
        open: I,
        onClose: () => V(!1),
        children: [
          (0, B.jsxs)(`p`, {
            className: `text-ink-2`,
            children: [
              `Source pages: `,
              Y?.pages || `Not recorded`,
              `. Your tutor can read the source using Lemma’s PDF tools. The session record stores the citation rather than a copy of the page text.`,
            ],
          }),
          (0, B.jsx)(D, {
            className: `mt-5 w-full`,
            onClick: () => V(!1),
            children: `Close`,
          }),
        ],
      }),
    ],
  });
}
export { K as default };
