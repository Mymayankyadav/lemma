import {g as ReviewExitSheet} from "@lemma/index-DcUkykC4.js";
function formatInterval(value){return String(value??"—").replace(/(\d+(?:\.\d+)?)mo\b/g,"$1 mo").replace(/(\d+(?:\.\d+)?)m\b/g,"$1 min").replace(/(\d+(?:\.\d+)?)h\b/g,"$1 h").replace(/(\d+(?:\.\d+)?)d\b/g,"$1 d");}
const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f ||
    (m.f = [
      "assets/queue-PP9pbc_d.js",
      "assets/rolldown-runtime-BWaJ3C7D.js",
      "assets/derive-BTXnCYPV.js",
    ]),
) => i.map((i) => d[i]);
import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { n as t, t as n } from "@lemma/jsx-runtime-DApVmHJR.js";
import { f as r, s as i } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import {
  _ as a,
  c as o,
  g as s,
  m as c,
  n as l,
  r as u,
  s as d,
  t as f,
} from "@lemma/createLucideIcon-C9eAT1Le.js";
import { t as p } from "@lemma/book-open-gof2bZqq.js";
import { n as m, t as h } from "@lemma/use-transform-B_3Z_OCO.js";
import { t as g } from "@lemma/circle-question-mark-Bllgq-sM.js";
import {
  B as _,
  Ct as ee,
  I as v,
  Lt as te,
  P as y,
  St as ne,
  X as re,
  Y as ie,
  _t as ae,
  g as oe,
  jt as se,
  mt as ce,
  xt as le,
} from "@lemma/index-DcUkykC4.js";
import { t as ue } from "@lemma/check-BXZ7pTLx.js";
import { t as b } from "@lemma/clock-3-DnZdQxj3.js";
import { f as de, u as fe } from "@lemma/data-HD2KrcdX.js";
import { t as x } from "@lemma/store-3lADaAh6.js";
import { t as S } from "@lemma/Button-DTRYSO-L.js";
import { t as C } from "@lemma/MathText-BeTkDDIi.js";
import { t as w } from "@lemma/Card-nFooZijf.js";
import { t as T } from "@lemma/Chip-AHlDYqiR.js";
import { o as pe } from "@lemma/motion-DL_I35iP.js";
import { t as me } from "@lemma/preload-helper-ClvlChHw.js";
function E(e) {
  e.values.forEach((e) => e.stop());
}
function D(e, t) {
  [...t].reverse().forEach((n) => {
    let r = e.getVariant(n);
    (r && o(e, r),
      e.variantChildren &&
        e.variantChildren.forEach((e) => {
          D(e, t);
        }));
  });
}
function O(e, t) {
  if (Array.isArray(t)) return D(e, t);
  if (typeof t == `string`) return D(e, [t]);
  o(e, t);
}
function k() {
  let e = !1,
    t = new Set(),
    n = {
      subscribe(e) {
        return (t.add(e), () => void t.delete(e));
      },
      start(n, r) {
        c(
          e,
          `controls.start() should only be called after a component has mounted. Consider calling within a useEffect hook.`,
        );
        let i = [];
        return (
          t.forEach((e) => {
            i.push(d(e, n, { transitionOverride: r }));
          }),
          Promise.all(i)
        );
      },
      set(n) {
        return (
          c(
            e,
            `controls.set() should only be called after a component has mounted. Consider calling within a useEffect hook.`,
          ),
          t.forEach((e) => {
            O(e, n);
          })
        );
      },
      stop() {
        t.forEach((e) => {
          E(e);
        });
      },
      mount() {
        return (
          (e = !0),
          () => {
            ((e = !1), n.stop());
          }
        );
      },
    };
  return n;
}
function he() {
  let e = a(k);
  return (s(e.mount, []), e);
}
var A = {
  name: `circle-check`,
  size: 24,
  node: [
    [`circle`, { cx: `12`, cy: `12`, r: `10`, key: `1mglay` }],
    [`path`, { d: `m16 9-5.5 5.5L8 12`, key: `xofnsj` }],
  ],
  aliases: [`check-circle-2`],
};
A.node;
var ge = f(A),
  j = {
    name: `circle-dashed`,
    size: 24,
    node: [
      [`path`, { d: `M10.1 2.182a10 10 0 0 1 3.8 0`, key: `5ilxe3` }],
      [`path`, { d: `M13.9 21.818a10 10 0 0 1-3.8 0`, key: `11zvb9` }],
      [`path`, { d: `M17.609 3.721a10 10 0 0 1 2.69 2.7`, key: `1iw5b2` }],
      [`path`, { d: `M2.182 13.9a10 10 0 0 1 0-3.8`, key: `c0bmvh` }],
      [`path`, { d: `M20.279 17.609a10 10 0 0 1-2.7 2.69`, key: `1ruxm7` }],
      [`path`, { d: `M21.818 10.1a10 10 0 0 1 0 3.8`, key: `qkgqxc` }],
      [`path`, { d: `M3.721 6.391a10 10 0 0 1 2.7-2.69`, key: `1mcia2` }],
      [`path`, { d: `M6.391 20.279a10 10 0 0 1-2.69-2.7`, key: `1fvljs` }],
    ],
  };
j.node;
var M = f(j),
  N = {
    name: `message-square-plus`,
    size: 24,
    node: [
      [
        `path`,
        {
          d: `M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z`,
          key: `18887p`,
        },
      ],
      [`path`, { d: `M12 8v6`, key: `1ib9pf` }],
      [`path`, { d: `M9 11h6`, key: `1fldmi` }],
    ],
  };
N.node;
var _e = f(N),
  P = {
    name: `undo-2`,
    size: 24,
    node: [
      [`path`, { d: `M9 14 4 9l5-5`, key: `102s5s` }],
      [
        `path`,
        {
          d: `M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11`,
          key: `f3b9sd`,
        },
      ],
    ],
  };
P.node;
var ve = f(P),
  F = e(t(), 1),
  I = n(),
  ye = {
    decks: [],
    sessionId: null,
    conceptSlug: null,
    includeNew: !0,
    newOnly: !1,
  },
  be = [`Again`, `Hard`, `Good`, `Easy`],
  L = [`var(--danger)`, `var(--late)`, `var(--early)`, `var(--link)`],
  xe = [
    { value: `sure`, label: `Sure`, icon: ge },
    { value: `unsure`, label: `Unsure`, icon: M },
    { value: `guess`, label: `Guess`, icon: g },
  ];
function Se({ item: e, revealed: t, confidence: n, quiet: r, stamp: i }) {
  let a = e.type === `reverse` && e.ord === 2 ? e.back : e.front,
    o = e.type === `reverse` && e.ord === 2 ? e.front : e.back,
    s = (0, F.useRef)(null),
    [c, u] = (0, F.useState)(0),
    d = a.length > 200 ? 18 : 21;
  return (
    (0, F.useEffect)(() => {
      let e = s.current;
      if (!e) return;
      let frame = requestAnimationFrame(() => {
        if(!t)e.scrollTop=0;
        else {
          const answer=e.querySelector('[data-answer]');
          if(answer){
            e.scrollTop+=answer.getBoundingClientRect().top-e.getBoundingClientRect().top-12;
            answer.focus({preventScroll:true});
          }
        }
        u(
          Number(e.scrollHeight-e.scrollTop-e.clientHeight>8),
        );
      });
      return () => cancelAnimationFrame(frame);
    }, [a, o, t]),
    (0, I.jsxs)(w, {
      stack: !0,"data-ui":`review-paper`,
      className: `relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-[6px] px-[18px] pb-3 pt-3`,
      style: {
        height: `100%`,
        minHeight: 0,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 27px, var(--line) 28px)`,
      },
      children: [
        (0, I.jsxs)(`div`, {
          className: `flex shrink-0 items-center justify-between gap-2 border-b border-edge pb-2`,
          children: [
            (0, I.jsx)(`span`, {
              className: `text-label uppercase tracking-wide text-ink-3`,
              children: e.kind,
            }),
            (0, I.jsxs)(`span`, {
              className: `font-math text-label text-ink-2`,
              children: [`N`, e.noteNo],
            }),
            t &&
              n &&
              (0, I.jsx)(T, {
                tone: n === `sure` ? `amber` : `quiet`,
                size: 28,
                children: n,
              }),
          ],
        }),
        (0, I.jsxs)(`div`, {
          className: `relative min-h-0 min-w-0 flex-1`,
          children: [
            (0, I.jsxs)(`div`, {
              ref: s,
              "data-review-card-scroll": !0,
              tabIndex: 0,
              role: `region`,
              "aria-label": `Card face, scroll to read the full content`,
              onScroll: (e) => {
                let t = e.currentTarget;
                u(
                  Number(t.scrollHeight-t.scrollTop-t.clientHeight>8),
                );
              },
              className: `h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain pr-1 pb-6`,
              children: [
                (0, I.jsx)(`div`, {
                  className: `review-front min-w-0 font-math`,
                  style: { fontSize: `1.125rem`, lineHeight: 1.65 },
                  children: (0, I.jsx)(C, {
                    className: `review-math-content`,
                    source: a,
                    variant: `card`,
                    cloze:
                      e.type === `cloze` ? { ord: e.ord, revealed: t } : void 0,
                    interactiveMath: !0,
                  }),
                }),
                t && a.length>200 && (0,I.jsx)(`button`,{type:`button`,className:`my-3 min-h-11 text-label font-semibold text-ink underline`,onClick:()=>s.current?.querySelector('[data-answer]')?.scrollIntoView({block:`nearest`}),children:`Jump to answer`}),
                t &&
                  (0, I.jsxs)(`div`, {
                    className: `mt-4 min-w-0 font-math notebook-review-answer`,
                    "data-answer": true, tabIndex: -1, role: "region", "aria-label": "Answer",
                    children: [
                      (0,I.jsx)(`button`,{type:`button`,className:`notebook-revisit-question`,onClick:()=>{s.current.scrollTop=0;s.current.focus({preventScroll:true})},children:`↑ Revisit question`}),
                      (0,I.jsx)(`h3`,{className:`mb-2 text-headline font-semibold text-ink`,children:`Answer`}),
                      (0,I.jsx)(`span`,{className:`sr-only`,role:`status`,children:`Answer shown`}),
                      (0, I.jsx)(l.div, {
                        initial: !r && { scaleX: 0 },
                        animate: { scaleX: 1 },
                        transition: { duration: r ? 0 : 0.32 },
                        className: `mb-4 h-[1.5px] origin-left bg-amber`,
                      }),
                      (0, I.jsx)(l.div, {
                        initial: !r && { opacity: 0 },
                        animate: { opacity: 1 },
                        transition: { duration: r ? 0 : 0.3 },
                        children: o
                          ? (0, I.jsx)(C, {
                              className: `review-math-content`,
                              source: o,
                              variant: `answer`,
                              interactiveMath: !0,
                            })
                          : e.type === `cloze`
                            ? (0, I.jsx)(C, {
                                source: a,
                                variant: `answer`,
                                cloze: { ord: e.ord, revealed: !0 },
                                interactiveMath: !0,
                              })
                            : (0, I.jsx)(`p`, {
                                className: `font-math text-title-s text-ink-2`,
                                children: `See the highlighted answer above.`,
                              }),
                      }),
                    ],
                  }),
              ],
            }),
          ],
        }),
        c > 0 && (0,I.jsx)(`div`,{
          "data-ui":`review-more-below`,
          className:`min-h-11 w-full shrink-0 rounded-ctl border border-edge bg-well text-label font-semibold text-ink-2`,
          children:`More below ↓`
        }),
        (0, I.jsxs)(`div`, {
          className: `flex shrink-0 flex-wrap gap-2 text-ink-3`,
          children: [
            e.sourceShort &&
              (0, I.jsxs)(T, {
                tone: `quiet`,
                icon: p,
                children: [
                  e.sourceShort,
                  e.pageLabel ? ` p. ` + e.pageLabel : ``,
                ],
              }),
            e.sessionNumber &&
              (0, I.jsx)(T, {
                tone: `quiet`,
                icon: b,
                children: `S` + e.sessionNumber,
              }),
          ],
        }),
        i &&
          (0, I.jsx)(l.span, {
            "aria-hidden": `true`,
            "data-proof-stamp": !0,
            className: `pointer-events-none absolute right-4 top-12 font-math text-title text-amber`,
            initial: !r && { opacity: 0, scale: 1.8 },
            animate: { opacity: 1, scale: 1 },
            transition: { duration: r ? 0 : 0.12 },
            children: `∎`,
          }),
      ],
    })
  );
}
function Ce(e) {
  return (
    e instanceof Element &&
    !!e.closest(
      `button, a[href], input, textarea, select, summary, [contenteditable], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="slider"], [role="menuitem"], [role="textbox"], [role="combobox"]`,
    )
  );
}
function R() {
  const [reviewExit,setReviewExit]=(0,F.useState)(false);
  let e = i(),
    [t] = r(),
    n = ie(),
    a = !!u(),
    o = pe(),
    s = a || o,
    c = ee();
  le();
  let d = ce(),
    f = se(),
    p = re(),
    g = ne(),
    b = x((e) => e.current),
    C = x((e) => e.queue),
    w = x((e) => e.revealed),
    T = x((e) => e.confidence),
    E = x((e) => e.submitting),
    D = x((e) => e.answers),
    O = x((e) => e.lastUndo),
    k = x((e) => e.total),
    A = x((e) => e.startTime),
    ge = x((e) => e.roundOrder),
    j = x((e) => e.pendingAgain),
    M = Math.max(0, Math.min(k, ge.length - 1 - j.length)),
    N = x((e) => e.reveal),
    P = x((e) => e.beginGrade),
    R = x((e) => e.cancelGrade),
    we = x((e) => e.committed),
    Te = x((e) => e.undoCommitted),
    [z, B] = (0, F.useState)(!1),
    [V, H] = (0, F.useState)(null),
    U = V && b && V.cardId === b.cardId ? V.value : ``,
    W = m(0),
    G = m(0),
    Ee = h(W, (e) => e / 22),
    De = h([W, G], ([e, t]) =>
      Number(t) < -60
        ? `Easy`
        : Number(e) > 40
          ? `Good`
          : Number(e) < -40
            ? `Again`
            : ``,
    ),
    K = he(),
    [Oe, q] = (0, F.useState)(!1),
    [J, ke] = (0, F.useState)(null),
    Y = (0, F.useRef)(null);
  (0, F.useEffect)(() => {
    let e = b ? b.cardId + `:` + D.length : null;
    Y.current !== e &&
      ((Y.current = e),
      W.set(0),
      G.set(0),
      q(!1),
      K.start({
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        transition: { duration: s ? 0 : 0.48 },
      }),
      H(null),
      B(!1));
  }, [b?.cardId, D.length, s]);
  let Ae = (0, F.useRef)(!1),
    je = t.get(`session`),
    Me = t.get(`concept`),
    Ne = t.get(`new`) === `1`,
    X = (0, F.useMemo)(
      () => ({ ...ye, sessionId: je, conceptSlug: Me, newOnly: Ne }),
      [je, Me, Ne],
    ),
    Z = ae(X);
  (0, F.useEffect)(() => {
    !Ae.current &&
      c.data &&
      Z.data &&
      ((Ae.current = !0),
      x.getState().queue || x.getState().initialize(Z.data, c.data, X));
  }, [c.data, Z.data, X]);
  let Q = (0, F.useMemo)(() => {
    if (!c.data || !b) return null;
    try {
      return fe(b.state, Date.now(), de(c.data));
    } catch {
      return null;
    }
  }, [c.data, b]);
  function Pe(){if(x.getState().current){setReviewExit(true)}else if(D.length){e('/review/done')}else{x.getState().close();e('/review')}}
  async function $(t) {
    if (!b || !w || !Q || x.getState().submitting) return;
    let r = Math.max(0, Math.min(6e5, Date.now() - A));
    P();
    try {
      let n = await d.mutateAsync({
        cardId: b.cardId,
        rating: t,
        confidence: T,
        durationMs: r,
        next: Q[t].card,
      });
      if (
        (ke(
          T === `sure` && t === 1
            ? `You were sure. Compare the missed step before the next try.`
            : T === `guess` && (t === 3 || t === 4)
              ? `A good guess. It will come back a little sooner.`
              : null,
        ),
        t >= 3 && q(!0),
        !s)
      )
        try {
          t >= 3 &&
            (await K.start({ scale: 1, transition: { duration: 0.12 } }));
          let e =
            t === 1
              ? { x: 0, y: 72, scale: 0.86 }
              : t === 2
                ? { x: -140, y: 0, scale: 1 }
                : t === 3
                  ? { x: 0, y: -130, scale: 1 }
                  : { x: 130, y: -170, scale: 1 };
          await K.start({
            ...e,
            opacity: 0,
            transition: { duration: 0.3, ease: `easeIn` },
          });
        } catch {}
      we({
        card: b,
        reviewId: n.reviewId,
        rating: t,
        confidence: T,
        durationMs: r,
        next: Q[t].card,
        answeredAt: Date.now(),
      });
      try {
        navigator.vibrate?.(8);
      } catch {}
      x.getState().current || e(`/review/done`);
    } catch (e) {
      (q(!1),
        K.start({
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          transition: { duration: 0 },
        }),
        R(),
        n(
          (e instanceof Error ? e.message : `Could not confirm answer`) +
            `. Current card kept.`,
          {
            tone: `danger`,
            action: {
              label: `Retry`,
              onClick: () => {
                navigator.onLine
                  ? $(t)
                  : n(`Reconnect before retrying`, { tone: `danger` });
              },
            },
          },
        ));
    }
  }
  async function Fe() {
    if (!(!O || f.isPending || E))
      try {
        (await f.mutateAsync(O.reviewId), Te(), n(`Answer undone`));
      } catch (e) {
        n(e instanceof Error ? e.message : `Could not undo`, {
          tone: `danger`,
        });
      }
  }
  (0, F.useEffect)(() => {
    let e = (e) => {
      if (
        !(
          e.defaultPrevented ||
          z ||
          e.ctrlKey ||
          e.altKey ||
          e.metaKey ||
          (e.target instanceof Element &&
            e.target.closest(`input, textarea, select, [contenteditable]`))
        ) &&
        b &&
        !E
      ) {
        if (e.key === `Escape`) (e.preventDefault(), Pe());
        else if (!Ce(e.target)) {
          if (!w)
            e.key === `1` || e.key === `2` || e.key === `3`
              ? (e.preventDefault(),
                N([`sure`, `unsure`, `guess`][Number(e.key) - 1]))
              : (e.key === ` ` || e.key === `Enter`) &&
                (e.preventDefault(), N(null));
          else {
            let t = e.key === ` ` ? 3 : Number(e.key);
            (t === 1 || t === 2 || t === 3 || t === 4) &&
              (e.preventDefault(), $(t));
          }
        }
      }
    };
    return (
      document.addEventListener(`keydown`, e),
      () => document.removeEventListener(`keydown`, e)
    );
  }, [b, E, w, z, Q, T, A]);
  async function Ie() {
    if (b && U.trim())
      try {
        (await p.mutateAsync({ noteNo: b.noteNo, body: U.trim() }),
          H(null),
          B(!1),
          n(`Note saved for your tutor`, { tone: `success` }));
      } catch (e) {
        n(e instanceof Error ? e.message : `Could not add note`, {
          tone: `danger`,
        });
      }
  }
  async function Le() {
    if (b)
      try {
        (await g.mutateAsync({ noteNo: b.noteNo, status: `suspended` }), B(!1));
        let t = x.getState();
        if (t.queue) {
          let n = t.queue,
            { nextCard: r } = await me(
              async () => {
                let { nextCard: e } = await import(
                  `@lemma/queue-PP9pbc_d.js`
                ).then((e) => e.a);
                return { nextCard: e };
              },
              __vite__mapDeps([0, 1, 2]),
            ),
            i = r(n);
          (x.setState({
            current: i.item,
            queue: i.queue,
            revealed: !1,
            confidence: null,
            startTime: Date.now(),
            roundOrder:
              i.item && !t.roundOrder.includes(i.item.cardId)
                ? [...t.roundOrder, i.item.cardId]
                : t.roundOrder,
          }),
            i.item || e(`/review/done`));
        }
        n(`Card suspended`, { tone: `success` });
      } catch (e) {
        n(e instanceof Error ? e.message : `Could not suspend`, {
          tone: `danger`,
        });
      }
  }
  return c.isPending || Z.isPending
    ? (0, I.jsxs)(_, {
        title: `Card review`,
        back: `/review`,
        children: [(0, I.jsx)(y, { h: 50 }), (0, I.jsx)(y, { h: 380 })],
      })
    : !b && !C
      ? (0, I.jsx)(_, {
          title: `Card review`,
          back: `/review`,
          children: (0, I.jsx)(`div`, {
            className: `text-body text-ink-2`,
            children: `Preparing your cards…`,
          }),
        })
      : b
        ? (0, I.jsxs)(_, {
            className: `gap-3 lemma-review-run`,"data-ui":`review-task`,
            children: [
              (0,I.jsxs)(ReviewExitSheet,{open:reviewExit,onClose:()=>setReviewExit(false),title:'Pause review?',children:[
                (0,I.jsx)('p',{children:Math.max(0,k-new Set(D.filter(answer=>answer.rating>1).map(answer=>answer.card.cardId)).size)+' cards left. Your answers are saved; you can finish this round later.'}),
                (0,I.jsx)(S,{onClick:()=>{x.setState({pausedRound:true});setReviewExit(false);e('/review')},children:'Finish later'}),
                (0,I.jsx)(S,{variant:'ghost',onClick:()=>setReviewExit(false),children:'Keep reviewing'}),
              ]}),
              (0, I.jsx)(`h1`, {
                className: `sr-only`,
                children: `Card review`,
              }),
              (0, I.jsxs)(`header`, {
                className: `lemma-review-header`,
                children: [
                  (0, I.jsx)(`div`, {
                    className: `lemma-review-progress-track`,
                    role: `progressbar`,
                    "aria-label": `Review progress`,
                    "aria-valuemin": 0,
                    "aria-valuemax": Math.max(1, k),
                    "aria-valuenow": M,
                    children: (0, I.jsx)(`div`, {
                      className: `lemma-review-progress-fill`,
                      style: { width: (k ? (M / k) * 100 : 0) + `%` },
                    }),
                  }),
                  (0, I.jsxs)(`div`, {
                    className: `lemma-review-nav-row`,
                    children: [
                      (0, I.jsx)(`div`, {
                        className: `lemma-review-nav-start`,
                        children: (0, I.jsx)(v, {
                          icon: te,
                          label: `Close review`,
                          disabled: E,
                          onClick: Pe,
                        }),
                      }),
                      (0, I.jsxs)(`div`, {
                        className: `lemma-review-nav-title`,
                        children: [
                          (0, I.jsxs)(`p`, {
                            className: `lemma-review-count tabular-nums`,
                            children: [Math.min(k, M + 1), ` of `, k],
                          }),
                          (0, I.jsxs)(`div`, {
                            className: `lemma-review-project`,
                            children: [
                              (0, I.jsx)(`span`, {
                                className: `font-math italic text-amber`,
                                children: b.glyph,
                              }),
                              (0, I.jsxs)(`span`, {
                                className: `truncate`,
                                children: [
                                  b.projectSlug.replaceAll(`-`, ` `).replace(/(^|\s)\p{L}/gu,letter=>letter.toLocaleUpperCase()),
                                  ` · `,
                                  b.checkpointCode,
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),
                      (0, I.jsxs)(`div`, {
                        className: `lemma-review-nav-end`,
                        children: (0,I.jsxs)('details',{className:'review-tools',onKeyDown:event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary').focus()}},children:[(0,I.jsx)('summary',{children:'More'}),(0,I.jsx)('div',{'aria-label':'Review tools',role:'group',children:[(0,I.jsx)("button",{type:"button",className:"ui-icon-button",style:{minWidth:44,minHeight:44},"aria-label":"Open focus timer",onClick:()=>window.dispatchEvent(new Event('lemma:focus-open')),children:"Open focus timer"}),
                          (0, I.jsx)(ReviewTool, {
                            icon: ve,
                            label: `Undo last answer`,
                            disabled: !O || f.isPending || E,
                            onClick: () => {
                              Fe();
                            },
                          }),
                          (0, I.jsx)(ReviewTool, {
                            icon: _e,
                            label: `Note for tutor`,
                            onClick: () => B(!0),
                          }),
                        ]})]}),
                      }),
                    ],
                  }),
                ],
              }),
              (0, I.jsx)(`div`, {
                className: `lemma-review-stage`,
                children: (0, I.jsxs)(
                  l.div,
                  {
                    className: `lemma-review-card-motion`,
                    initial: !s && { opacity: 0, y: 34, scale: 0.94 },
                    animate: K,
                    exit: { opacity: 0, transition: { duration: 0 } },
                    transition: { duration: s ? 0 : 0.48 },
                    drag:
                      w && !E && b.front.length < 500 && b.back.length < 500,
                    dragElastic: 0.6,
                    dragSnapToOrigin: !0,
                    dragConstraints: { left: 0, right: 0, top: 0, bottom: 0 },
                    style: { x: W, y: G, rotate: Ee, touchAction: `pan-y` },
                    onDragEnd: (e, t) => {
                      w &&
                        !E &&
                        (t.offset.x > 110
                          ? $(3)
                          : t.offset.x < -110
                            ? $(1)
                            : t.offset.y < -110 && $(4));
                    },
                    children: [
                      (0, I.jsx)(l.span, {
                        "aria-hidden": `true`,
                        className: `pointer-events-none absolute inset-x-0 top-1/2 z-10 text-center font-math text-num italic text-amber`,
                        children: De,
                      }),
                      (0, I.jsx)(Se, {
                        item: b,
                        revealed: w,
                        confidence: T,
                        quiet: s,
                        stamp: Oe,
                      }),
                    ],
                  },
                  b.cardId,
                ),
              }),
              (0, I.jsxs)(`p`, {"data-ui":`review-remaining`,
                className: `text-center text-caption text-ink-3`,
                children: [
                  Math.max(
                    0,
                    k - new Set(D.map((e) => e.card.cardId)).size - 1,
                  ),
                  ` after this`,
                ],
              }),
              J &&
                (0, I.jsx)(`p`, {
                  role: `status`,
                  className: `text-center font-math text-label italic text-ink-2`,
                  children: J,
                }),
              w
                ? (0, I.jsx)(`section`, {
                    "aria-label": `Grade answer`,"data-ui":`review-grades`,
                    className: `sticky bottom-0 z-20 grid grid-cols-4 gap-1.5 rounded-ctl bg-obsidian pb-[max(6px,env(safe-area-inset-bottom))] pt-2`,
                    children: be.map((e, t) => {
                      let n = t + 1;
                      return (0, I.jsxs)(
                        `button`,
                        {
                          type: `button`,
                          disabled: E,
                          onClick: () => {
                            $(n);
                          },
                          "aria-label": `Grade ` + e + `, ` + formatInterval(Q?.[n].label),
                          className: `flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-btn border border-edge-2 bg-raised px-1 disabled:opacity-50`,
                          children: [
                            (0, I.jsxs)(`span`, {
                              className: `flex items-center gap-1 text-label font-semibold`,
                              style: { color: L[t] },
                              children: [
                                ["× ","~ ","✓ ","✓✓ "][t],
                                e,
                              ],
                            }),
                            (0, I.jsx)(`span`, {
                              className: `text-caption tabular-nums text-ink-3`,
                              children: formatInterval(Q?.[n].label),
                            }),
                          ],
                        },
                        n,
                      );
                    }),
                  })
                : (0,I.jsxs)('section',{'aria-label':'Confidence',className:'notebook-calibration-prompt',children:[
 (0,I.jsx)('p',{children:'How sure are you? · optional'}),
 (0,I.jsx)('div',{role:'group','aria-label':'Confidence before reveal',className:'lemma-confidence-choices',children:xe.slice().reverse().map(({value,label})=>(0,I.jsx)('button',{type:'button',onClick:()=>N(value),children:label},value))}),
 (0,I.jsx)('small',{children:'Choose to reveal, or skip confidence below.'}),
 (0,I.jsx)('button',{type:'button',className:'notebook-primary',onClick:()=>N(null),children:'Show answer'})
]}),
              (0, I.jsx)(oe, {
                open: z,
                onClose: () => B(!1),
                title: `For your tutor`,
                children: (0, I.jsxs)(`div`, {
                  className: `flex flex-col gap-4`,
                  children: [
                    (0, I.jsx)(`label`, {
                      htmlFor: `review-note`,
                      className: `text-body text-ink-2`,
                      children: `Ask your tutor to improve or explain this card`,
                    }),
                    (0, I.jsx)(`textarea`, {
                      id: `review-note`,
                      maxLength: 500,
                      rows: 4,
                      value: U,
                      onChange: (e) => {
                        b && H({ cardId: b.cardId, value: e.target.value });
                      },
                      className: `w-full rounded-ctl border border-edge-2 bg-well p-3 text-body-l text-ink`,
                      placeholder: `What should the tutor revisit?`,
                    }),
                    (0, I.jsx)(S, {
                      disabled: !U.trim() || p.isPending,
                      onClick: () => {
                        Ie();
                      },
                      icon: ue,
                      children: `Save note`,
                    }),
                    (0, I.jsx)(S, {
                      variant: `ghost`,
                      onClick: () => {
                        Le();
                      },
                      children: `Suspend this card`,
                    }),
                  ],
                }),
              }),
            ],
          })
        : (0, I.jsxs)(_, {
            title: `Card review`,
            back: `/review`,
            children: [
              (0, I.jsx)(`p`, {
                className: `text-ink-2`,
                children: `Nothing due in this selection.`,
              }),
              (0, I.jsx)(S, {
                onClick: () => e(D.length ? `/review/done` : `/review`),
                children: `Continue`,
              }),
            ],
          });
}
export { R as default };

function ReviewTool({icon:Icon,label,...props}){return (0,I.jsxs)('button',{...props,type:'button','aria-label':label,children:[(0,I.jsx)(Icon,{size:18,'aria-hidden':true}),(0,I.jsx)('span',{children:label})]});}
