import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { n as t, t as n } from "@lemma/jsx-runtime-DApVmHJR.js";
import { s as r, t as i } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as a } from "@lemma/calendar-days-Bk0tPrV5.js";
import { t as o } from "@lemma/clock-3-DnZdQxj3.js";
import { B as s, Bt as c, Ct as l, L as u } from "@lemma/index-DcUkykC4.js";
import { t as d } from "@lemma/target-D3iujC2g.js";
import { t as f } from "@lemma/data-HD2KrcdX.js";
import { r as p } from "@lemma/insights-DjL4G0LE.js";
import { n as m, r as h } from "@lemma/createLucideIcon-C9eAT1Le.js";
import { o as g } from "@lemma/motion-DL_I35iP.js";
import { t as _ } from "@lemma/store-3lADaAh6.js";
import { t as v } from "@lemma/Button-DTRYSO-L.js";
var y = e(t(), 1);
function b(e, t = 36, n = 36, r = 27) {
  if (!Number.isInteger(e) || e < 1 || e > 1e4)
    throw RangeError(`Invalid round size`);
  return Array.from({ length: e }, (i, a) => {
    let o = -Math.PI / 2 + (2 * Math.PI * a) / e;
    return { x: t + r * Math.cos(o), y: n + r * Math.sin(o) };
  });
}
var x = n();
function S({ order: e, answers: t }) {
  let n = !!h(),
    r = g(),
    i = n || r,
    a = e.length,
    o = a > 24,
    s = o ? [] : b(Math.max(1, a), 84, 84, 58),
    c = Math.min(0.11, 1.2 / Math.max(1, a)),
    l = 0.12 + a * c + 0.24,
    u = new Map();
  for (let e of t) u.has(e.card.cardId) || u.set(e.card.cardId, e.rating);
  let d = (e, t = 58) => ({ x: 84 + t * Math.cos(e), y: 84 + t * Math.sin(e) }),
    f = (e) => {
      if (a >= 3) {
        let t = s[e],
          n = s[(e + 1) % a];
        return `M${t.x} ${t.y} L${n.x} ${n.y}`;
      }
      let t = -Math.PI / 2 + (2 * Math.PI * e) / Math.max(1, a),
        n = d(t),
        r = d(t + Math.PI / Math.max(1, a)),
        i = d(t + (2 * Math.PI) / Math.max(1, a));
      return `M${n.x} ${n.y} A58 58 0 0 1 ${r.x} ${r.y} A58 58 0 0 1 ${i.x} ${i.y}`;
    };
  return (0, x.jsxs)(`svg`, {
    viewBox: `0 0 168 168`,
    width: `200`,
    height: `200`,
    role: `img`,
    "aria-label": `Completed round of ${a} ${a === 1 ? `card` : `cards`}`,
    children: [
      Array.from({ length: 32 }, (e, t) => {
        let n = (t * Math.PI) / 16,
          r = d(n, 68),
          a = d(n, t % 2 ? 76 : 82);
        return (0, x.jsx)(
          m.line,
          {
            "data-seal-ray": !0,
            x1: r.x,
            y1: r.y,
            x2: a.x,
            y2: a.y,
            stroke: `var(--accent)`,
            initial: !i && { opacity: 0 },
            animate: i
              ? { opacity: 0 }
              : { opacity: [0, 0.6, 0], scale: [0.82, 1.06, 1.16] },
            style: { transformOrigin: `84px 84px` },
            transition: {
              duration: i ? 0 : 1.1,
              delay: i ? 0 : l + 0.65 + (t % 8) * 0.018,
            },
          },
          `ray` + t,
        );
      }),
      (0, x.jsx)(m.circle, {
        cx: `84`,
        cy: `84`,
        r: `58`,
        fill: `none`,
        stroke: `var(--line)`,
        strokeWidth: `1.2`,
        initial: !i && { pathLength: 0 },
        animate: { pathLength: 1 },
        transition: { duration: i ? 0 : 0.7, delay: i ? 0 : l },
      }),
      s.map((e, t) =>
        (0, x.jsx)(
          m.line,
          {
            "data-seal-radius": !0,
            x1: 84,
            y1: 84,
            x2: e.x,
            y2: e.y,
            stroke: `var(--ink-3)`,
            strokeWidth: `.8`,
            initial: !i && { opacity: 0 },
            animate: { opacity: 0.35 },
            transition: {
              duration: i ? 0 : 0.3,
              delay: i ? 0 : l + 0.3 + (t * c) / 3,
            },
          },
          `radius` + t,
        ),
      ),
      (o
        ? Array.from(
            { length: 12 },
            (t, n) => e[Math.min(a - 1, Math.floor((n * a) / 12))],
          )
        : e
      ).map((e, t) =>
        (0, x.jsx)(
          m.path,
          {
            "data-round-edge": u.get(e) === 1 ? `missed` : `passed`,
            d: o
              ? `M ${84 + 58 * Math.cos(-Math.PI / 2 + (2 * Math.PI * t) / 12 + 0.03)} ${84 + 58 * Math.sin(-Math.PI / 2 + (2 * Math.PI * t) / 12 + 0.03)} A 58 58 0 0 1 ${84 + 58 * Math.cos(-Math.PI / 2 + (2 * Math.PI * (t + 1)) / 12 - 0.03)} ${84 + 58 * Math.sin(-Math.PI / 2 + (2 * Math.PI * (t + 1)) / 12 - 0.03)}`
              : f(t),
            fill: `none`,
            stroke: u.get(e) === 1 ? `var(--bad)` : `var(--accent)`,
            strokeWidth: `2`,
            initial: !i && { pathLength: 0 },
            animate: { pathLength: 1 },
            transition: { duration: i ? 0 : 0.24, delay: i ? 0 : 0.12 + t * c },
          },
          e,
        ),
      ),
      !o &&
        e.map((e, t) =>
          (0, x.jsx)(
            m.circle,
            {
              cx: s[t].x,
              cy: s[t].y,
              r: `2.5`,
              fill: `var(--bg)`,
              stroke: `var(--accent)`,
              initial: !i && { scale: 0 },
              animate: { scale: 1 },
              style: { transformOrigin: `${s[t].x}px ${s[t].y}px` },
              transition: {
                duration: i ? 0 : 0.22,
                delay: i ? 0 : 0.12 + t * c,
              },
            },
            e,
          ),
        ),
      (0, x.jsx)(m.circle, {
        cx: `84`,
        cy: `84`,
        r: `3`,
        fill: `var(--accent)`,
        style: { transformOrigin: `84px 84px` },
        initial: !i && { scale: 0 },
        animate: i ? { scale: 1 } : { scale: [0, 1.8, 1] },
        transition: { duration: i ? 0 : 0.6, delay: i ? 0 : l + 0.65 },
      }),
    ],
  });
}
async function C(e, t, n, r) {
  if (!n.sessionId) return !1;
  let i = { ...n, includeNew: !0, newOnly: !0 },
    a = (await e.getReviewItems(i)).filter((e) => e.state.state === 0);
  return a.length ? (r(a, t, i), !0) : !1;
}
function w({ icon: e, label: t, value: n }) {
  return (0, x.jsxs)(u, {
    className: `flex min-h-[95px] flex-col items-center justify-center gap-1 px-2 py-3 text-center`,
    children: [
      (0, x.jsx)(e, {
        size: 18,
        "aria-hidden": `true`,
        className: `text-ink-2`,
      }),
      (0, x.jsx)(`strong`, {
        className:
          `text-card font-semibold tabular-nums ` +
          (n === `–` ? `text-ink-4` : `text-ink`),
        children: n,
      }),
      (0, x.jsx)(`span`, { className: `text-label text-ink-3`, children: t }),
    ],
  });
}
function T() {
  let e = !!h(),
    t = g(),
    n = e || t,
    u = r(),
    b = _((e) => e.answers),
    T = _((e) => e.filter),
    E = _((e) => e.markCompleted);
  (0, y.useEffect)(() => {
    !_.getState().current && b.length > 0 && E();
  }, [b.length, E]);
  let D = l(),
    [O, k] = (0, y.useState)(null),
    [A, j] = (0, y.useState)(!1),
    [M, N] = (0, y.useState)(null),
    [P, F] = (0, y.useState)(!1),
    [I, L] = (0, y.useState)(!1),
    R = (0, y.useMemo)(
      () =>
        p(
          b.map((e) => ({
            rating: e.rating,
            confidence: e.confidence,
            durationMs: e.durationMs,
            stateBefore: e.card.state.state,
          })),
        ),
      [b],
    );
  (0, y.useEffect)(() => {
    if (!D.data) return;
    let e = !1;
    return (
      f()
        .getReviewForecast()
        .then((t) => {
          e || k(Number.isFinite(t[1]?.due)?t[1].due:null);
        })
        .catch(() => void 0),
      () => {
        e = !0;
      }
    );
  }, [D.data]);
  let z = (0, y.useMemo)(() => {
      let e = new Set();
      return b.filter(
        (t) => !e.has(t.card.cardId) && (e.add(t.card.cardId), !0),
      );
    }, [b]),
    B = z.filter((e) => e.rating === 1),
    V = z.filter((e) => e.confidence === `sure`),
    H = V.filter((e) => e.rating > 1).length,
    U = Math.max(0, Math.floor(R.durationMs / 1e3)),
    W = z.length
      ? Math.floor(U / 60) + `:` + String(U % 60).padStart(2, `0`)
      : `–`,
    G = z.filter((e) => e.rating > 1),
    K = G.length,
    q = z.length > 24,
    J = z.length ? Math.round((100 * K) / z.length) + `%` : `–`;
  function Y() {
    if (!D.data || !B.length) return;
    let e = new Map(b.map((e) => [e.card.cardId, e])),
      t = B.map((t) => {
        let n = e.get(t.card.cardId);
        return {
          ...t.card,
          state: { ...n.next, due: new Date().toISOString() },
        };
      });
    (_.getState().initialize(t, D.data, T), u(`/review/run`));
  }
  async function X() {
    if (D.data && T.sessionId && !A) {
      (j(!0), N(null));
      try {
        if (!(await C(f(), D.data, T, _.getState().initialize))) {
          N(`No new cards are due from this session.`);
          return;
        }
        u(`/review/run?session=` + encodeURIComponent(T.sessionId) + `&new=1`);
      } catch {
        N(`Could not load new cards. Try again.`);
      } finally {
        j(!1);
      }
    }
  }
  if(_.getState().current)return (0,x.jsxs)(s,{title:'Review paused',children:[(0,x.jsx)('p',{children:'This round still has cards left. Your saved responses are kept.'}),(0,x.jsx)(v,{onClick:()=>u('/review/run'),children:'Resume review'})]});
  return (0, x.jsxs)(s, {
    className: `items-center gap-5`,
    children: [
      (0, x.jsxs)(`div`, {
        className: `mt-4 flex flex-col items-center text-center`,
        children: [
          z.length > 0 &&
            (0, x.jsx)(S, { order: z.map((e) => e.card.cardId), answers: b }),
          (0, x.jsxs)(m.h1, {
            initial: !n && { letterSpacing: `.4em` },
            animate: { letterSpacing: `.02em` },
            transition: { duration: n ? 0 : 0.7 },
            className: `mt-1 font-[var(--font-display)] text-[44px] italic text-ink`,
            children: [
              (0, x.jsx)(`span`, {
                className: `sr-only`,
                children: `Review complete`,
              }),
              (0, x.jsxs)(`span`, {
                "aria-hidden": `true`,
                children: [
                  `Q.E.D`,
                  (0, x.jsx)(`span`, {
                    className: `text-amber`,
                    children: `.`,
                  }),
                ],
              }),
            ],
          }),
          !z.length &&
            (0, x.jsx)(`p`, {
              className: `mt-2 text-body text-ink-3`,
              children: `Review a round to see stats.`,
            }),
          z.length > 0 &&
            (0, x.jsxs)(`p`, {
              className: `mt-2 text-body-l text-ink-2`,
              children: [
                z.length,
                ` `,
                z.length === 1 ? `card` : `cards`,
                ` reviewed, `,
                B.length,
                ` `,
                (B.length, `needed`),
                ` another pass.`,
              ],
            }),
        ],
      }),
      (0, x.jsxs)(`section`, {
        "aria-label": `Review statistics`,
        className: `grid w-full grid-cols-2 gap-2`,
        children: [
          (0, x.jsx)(w, {
            icon: d,
            label: `recalled on the first try`,
            value: J,
          }),
          (0, x.jsx)(w, { icon: o, label: `time for the round`, value: W }),
          (0, x.jsx)(w, {
            icon: c,
            label: `right when you were sure`,
            value: V.length ? H + `/` + V.length : `–`,
          }),
          (0, x.jsx)(w, {
            icon: a,
            label: `scheduled tomorrow · excludes overdue`,
            value: z.length && O !== null ? String(O) : `–`,
          }),
        ],
      }),
      z.length > 0 &&
        (0, x.jsxs)(`section`, {
          "aria-label": `Round transcript`,
          className: `w-full`,
          children: [
            (0, x.jsx)(`h2`, {
              className: `mb-2 font-math italic text-ink-2`,
              children: `Your round`,
            }),
            (0, x.jsxs)(`div`, {
              className: `flex flex-col gap-3`,
              children: [
                B.length > 0 &&
                  (0, x.jsxs)(`div`, {
                    children: [
                      (0, x.jsxs)(`p`, {
                        className: `mb-2 text-label text-ink-3`,
                        children: [B.length, ` missed`],
                      }),
                      (0, x.jsx)(`div`, {
                        className: `flex flex-wrap gap-1.5`,
                        children: B.slice(0, I ? void 0 : 8).map((e) =>
                          (0, x.jsx)(
                            i,
                            {
                              to: `/cards/` + e.card.noteNo,
                              title: e.card.projectSlug + ` · Again`,
                              className: `flex min-h-11 min-w-11 items-center justify-center rounded-ctl border border-edge bg-raised px-2 text-label text-ink`,
                              "aria-label": `Missed card N` + e.card.noteNo,"data-style":"role-note",
                              children: `N` + e.card.noteNo,
                            },
                            e.card.cardId,
                          ),
                        ),
                      }),
                      B.length > 8 &&
                        (0, x.jsx)(`button`, {
                          type: `button`,
                          className: `min-h-11 text-label font-semibold text-amber`,
                          onClick: () => L((e) => !e),
                          children: I
                            ? `Show first 8`
                            : B.length - 8 + ` more missed`,
                        }),
                    ],
                  }),
                K > 0 &&
                  (0, x.jsxs)(`div`, {
                    children: [
                      (0, x.jsxs)(`button`, {
                        type: `button`,
                        className: `min-h-11 text-label font-semibold text-amber`,
                        onClick: () => F((e) => !e),
                        children: [
                          K,
                          ` recalled · `,
                          q ? (P ? `Hide` : `Show cards`) : `Full list`,
                        ],
                      }),
                      (P || !q) &&
                        (0, x.jsx)(`div`, {
                          className: `flex flex-wrap gap-1.5`,
                          children: G.map((e) =>
                            (0, x.jsx)(
                              i,
                              {
                                title:
                                  e.card.projectSlug +
                                  ` · ` +
                                  ([``, `Again`, `Hard`, `Good`, `Easy`][
                                    e.rating
                                  ] ?? ``),
                                to: `/cards/` + e.card.noteNo,
                                className: `flex min-h-11 min-w-11 items-center justify-center rounded-ctl border border-edge bg-raised px-2 text-label text-ink-2`,
                                children: `N` + e.card.noteNo,
                              },
                              e.card.cardId,
                            ),
                          ),
                        }),
                    ],
                  }),
              ],
            }),
          ],
        }),
      B.length > 0 &&
        (0, x.jsxs)(v, {
          className: `w-full`,
          variant: `ghost`,
          onClick: Y,
          children: [`Go over the `, B.length, ` missed`],
        }),
      (0, x.jsx)(v, {
        className: `w-full`,
        size: `xl`,
        onClick: () => {
          (_.getState().close(), u(`/`));
        },
        children: `Done`,
      }),
      (0, x.jsx)(i, {
        className: `flex min-h-11 items-center justify-center text-body text-amber`,
        to: `/review`,
        children: `Review more`,
      }),
      T.sessionId &&
        (0, x.jsxs)(`div`, {
          className: `flex w-full flex-col items-center gap-2`,
          children: [
            (0, x.jsx)(v, {
              variant: `ghost`,
              disabled: A || !D.data,
              onClick: () => {
                X();
              },
              children: A
                ? `Checking new cards…`
                : `Review new cards from this session`,
            }),
            M &&
              (0, x.jsx)(`p`, {
                role: `status`,
                className: `text-center text-label text-ink-2`,
                children: M,
              }),
          ],
        }),
    ],
  });
}
export { T as default };
