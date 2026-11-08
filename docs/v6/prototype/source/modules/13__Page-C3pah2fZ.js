import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { t } from "@lemma/MathPreview-DJdjEKge.js";
import { n, t as r } from "@lemma/jsx-runtime-DApVmHJR.js";
import { s as i, t as a, u as o } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as s } from "@lemma/bot-NKhN2-xk.js";
import { t as c } from "@lemma/book-open-gof2bZqq.js";
import { t as l } from "@lemma/calendar-days-Bk0tPrV5.js";
import { t as u } from "@lemma/chevron-left-C_nMeSlm.js";
import {
  B as d,
  Bt as f,
  Ct as p,
  F as m,
  H as h,
  K as g,
  Kt as _,
  Lt as ee,
  P as v,
  Q as y,
  R as b,
  Rt as x,
  U as S,
  Y as C,
  a as te,
  c as w,
  d as T,
  f as E,
  ft as D,
  g as ne,
  h as O,
  ht as re,
  i as k,
  l as A,
  m as j,
  n as M,
  o as N,
  p as P,
  r as F,
  s as I,
  t as L,
  u as R,
  ut as ie,
} from "@lemma/index-DcUkykC4.js";
import { t as ae } from "@lemma/sparkles-BT_hGLVy.js";
import { t as oe } from "@lemma/target-D3iujC2g.js";
import { t as z } from "@lemma/Tex-kn8bVMsW.js";
import { t as B } from "@lemma/render-BH3C9UJ0.js";
import { t as V } from "@lemma/Button-DTRYSO-L.js";
import { t as H } from "@lemma/MathText-BeTkDDIi.js";
var U = e(n(), 1),
  W = 30,
  se = 66,
  G = 50;
function ce(e) {
  let t = new Map(e.map((e) => [e.code, e])),
    n = new Map(e.map((e, t) => [e.code, t])),
    r = new Map(),
    i = (e, n) => {
      if (r.has(e)) return r.get(e);
      if (n.has(e)) return 0;
      n.add(e);
      let a = (t.get(e)?.prereqs ?? []).filter((n) => t.has(n) && n !== e),
        o = a.length ? 1 + Math.max(...a.map((e) => i(e, n))) : 0;
      return (n.delete(e), r.set(e, o), o);
    },
    a = [];
  for (let t of e) {
    let e = i(t.code, new Set());
    (a[e] ??= []).push(t.code);
  }
  let o = new Map();
  a.forEach((e, r) => {
    if (!e) return;
    let i = (e) => {
      let r = (t.get(e)?.prereqs ?? []).filter((e) => o.has(e));
      return r.length
        ? r.reduce((e, t) => e + o.get(t), 0) / r.length
        : (n.get(e) ?? 0);
    };
    (e.sort((e, t) => (r ? i(e) - i(t) : 0) || n.get(e) - n.get(t)),
      e.forEach((t, n) => o.set(t, n - (e.length - 1) / 2)));
  });
  let s = Math.max(1, ...a.map((e) => e?.length ?? 0)),
    c = W + ((s - 1) * G) / 2,
    l = [];
  a.forEach((e, t) =>
    e?.forEach((e) => l.push({ code: e, x: W + t * se, y: c + o.get(e) * G })),
  );
  let u = [];
  for (let n of e)
    for (let e of new Set(n.prereqs))
      t.has(e) && e !== n.code && u.push({ from: e, to: n.code });
  return {
    nodes: l,
    edges: u,
    width: 60 + Math.max(0, a.length - 1) * se,
    height: 60 + (s - 1) * G,
  };
}
var le = new WeakMap();
function K(e) {
  let t = le.get(e);
  if (t) return t;
  let n = e.some((e) => !!e.stage?.trim()),
    r = [],
    i = 0;
  for (let t of e) {
    let e =
      t.stage?.trim() || (n ? `Unstaged` : `CP${Math.floor(i / 8) * 8 + 1}`);
    i++;
    let a = r[r.length - 1];
    a && a.name === e && (n || a.nodes.length < 8)
      ? a.nodes.push(t)
      : r.push({ id: `stage-${r.length}`, name: e, nodes: [t] });
  }
  if (!n)
    for (let e of r)
      e.name = `${e.nodes[0].code}–${e.nodes[e.nodes.length - 1].code}`;
  return (le.set(e, r), r);
}
var ue = 320,
  de = [82, 238],
  q = 88,
  fe = 216;
function pe(e, t = null, columns = 2) {
  let n = K(e),
    r = new Map(n.flatMap((e) => e.nodes.map((t) => [t.code, e.id]))),
    i = new Map();
  for (let e of n)
    for (let t of e.nodes)
      for (let n of new Set(t.prereqs)) {
        let a = r.get(n);
        if (!a || a === e.id || n === t.code) continue;
        let o = a + `>` + e.id,
          s = i.get(o);
        s ? s.count++ : i.set(o, { from: a, to: e.id, count: 1 });
      }
  let a = n.findIndex((e) => e.id === t),
    o = a < 0 ? -1 : Math.floor(a / columns);
  return {
    stages: n.map((e, t) => {
      let n = Math.floor(t / columns);
      return {
        id: e.id,
        name: e.name,
        count: e.nodes.length,
        x: 82 + (t % columns) * 156,
        y: 48 + n * q + (o >= 0 && n > o ? fe : 0),
      };
    }),
    edges: [...i.values()],
    width: columns * 156 + 8,
    height: Math.ceil(n.length / columns) * q + (o >= 0 ? fe : 0) + 8,
    expandedY: o < 0 ? null : 48 + o * q + 52,
  };
}
var J = r();
function me({ tree: e, label: t, onCheckpoint: n }) {
  let r = (0, U.useMemo)(
      () => [...e.nodes.values()].filter((e) => e.children.length),
      [e],
    ),
    i = (0, U.useMemo)(
      () => [...e.nodes.values()].filter((e) => !e.synthetic).length,
      [e],
    ),
    a = () => (i > 14 ? R(e, 2) : new Set(r.map((e) => e.id))),
    [o, s] = (0, U.useState)(a),
    [c, l] = (0, U.useState)(!1),
    [u, d] = (0, U.useState)(null),
    f = (0, U.useRef)(null),
    p = (0, U.useRef)(e);
  (0, U.useEffect)(() => {
    p.current !== e && ((p.current = e), s(a()), d(null));
  }, [e]);
  let m = (0, U.useMemo)(() => O(e, o), [e, o]),
    h = (0, U.useMemo)(() => te(m.map((t) => e.nodes.get(t.id).level)), [e, m]),
    g = (0, U.useMemo)(
      () => new Set(c ? [`prereq`, `related`] : [`prereq`]),
      [c],
    ),
    _ = (0, U.useMemo)(() => I(e, m, g), [e, m, g]),
    v = (0, U.useMemo)(() => (u && e.nodes.has(u) ? T(e, u) : null), [e, u]),
    y = (0, U.useMemo)(() => w(e, m, o, _, v), [e, m, o, _, v]),
    b = u ? (e.nodes.get(u) ?? null) : null,
    x = b ? P(e, b.id) : null,
    S = (0, U.useMemo)(() => {
      for (let t of [1, 2, 3]) {
        let n = R(e, t);
        if (n.size === o.size && [...n].every((e) => o.has(e))) return t;
      }
      return r.every((e) => o.has(e.id)) ? 99 : null;
    }, [e, o, r]),
    C = (e) =>
      s((t) => {
        let n = new Set(t);
        return (n.has(e) ? n.delete(e) : n.add(e), n);
      }),
    E = (t) => {
      (s((n) => new Set([...n, ...N(e, t)])),
        d(t),
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            f.current
              ?.querySelector(`[data-atlas-row="${CSS.escape(t)}"]`)
              ?.scrollIntoView({ block: `nearest`, behavior: `smooth` }),
          ),
        ));
    },
    D = ({ title: e, items: t, tone: n }) =>
      t.length
        ? (0, J.jsxs)(`p`, {
            className: `flex flex-wrap items-center gap-1.5`,
            children: [
              (0, J.jsx)(`span`, {
                className: `text-caption font-semibold`,
                style: { color: k[n] },
                children: e,
              }),
              t.map((e) =>
                (0, J.jsx)(
                  `button`,
                  {
                    type: `button`,
                    onClick: () => E(e.id),
                    className: `min-h-11 rounded-chip border border-edge px-2 text-label`,
                    children: (0, J.jsx)(z, { source: e.name }),
                  },
                  e.id,
                ),
              ),
            ],
          })
        : null;
  return (0, J.jsxs)(`div`, {
    ref: f,
    className: `flex flex-col gap-2`,
    "data-idea-graph": `true`,
    children: [
      (0, J.jsxs)(`div`, {
        role: `toolbar`,
        "aria-label": t + ` view`,
        className: `flex flex-wrap items-center gap-2`,
        children: [
          (0, J.jsx)(`div`, {
            role: `group`,
            "aria-label": `Fold to depth`,
            className: `flex overflow-hidden rounded-ctl border border-edge`,
            children: [1, 2, 3, 99].map((t) =>
              (0, J.jsx)(
                `button`,
                {
                  type: `button`,
                  "aria-pressed": S === t,
                  onClick: () =>
                    s(t === 99 ? new Set(r.map((e) => e.id)) : R(e, t)),
                  className:
                    `min-h-11 min-w-11 px-2 text-label ` +
                    (S === t ? `bg-amber-tint text-amber` : `text-ink-2`),
                  children: t === 99 ? `All` : t,
                },
                t,
              ),
            ),
          }),
          (0, J.jsxs)(`button`, {
            type: `button`,
            "aria-pressed": c,
            onClick: () => l((e) => !e),
            className:
              `flex min-h-11 items-center gap-1.5 rounded-ctl border px-2.5 text-label ` +
              (c ? `border-amber-line-2 text-amber` : `border-edge text-ink-2`),
            children: [
              (0, J.jsx)(`svg`, {
                width: `16`,
                height: `6`,
                "aria-hidden": `true`,
                children: (0, J.jsx)(`path`, {
                  d: `M1 3H15`,
                  stroke: `currentColor`,
                  strokeDasharray: `2 3`,
                  strokeLinecap: `round`,
                }),
              }),
              `Related`,
            ],
          }),
        ],
      }),
      b &&
        x &&
        (0, J.jsxs)(`div`, {
          "data-idea-selection": `true`,
          className: `flex flex-col gap-2 rounded-ctl border border-edge-2 bg-well p-3`,
          children: [
            (0, J.jsxs)(`div`, {
              className: `flex items-start gap-2`,
              children: [
                (0, J.jsx)(M, { node: b }),
                (0, J.jsx)(`p`, {
                  className: `min-w-0 flex-1 text-body font-semibold`,
                  children: (0, J.jsx)(z, { source: b.name }),
                }),
                (0, J.jsx)(`button`, {
                  type: `button`,
                  "aria-label": `Clear selection`,
                  onClick: () => d(null),
                  className: `-m-2 flex size-11 shrink-0 items-center justify-center text-ink-2`,
                  children: (0, J.jsx)(ee, { size: 17 }),
                }),
              ],
            }),
            b.blurb &&
              (0, J.jsx)(z, {
                source: b.blurb,
                className: `block text-label text-ink-2`,
              }),
            (0, J.jsx)(D, { title: `Builds on`, items: x.needs, tone: `up` }),
            (0, J.jsx)(D, {
              title: `Opens up`,
              items: x.unlocks,
              tone: `down`,
            }),
            b.checkpointRefs.length > 0 &&
              (0, J.jsxs)(`p`, {
                className: `flex flex-wrap items-center gap-1.5`,
                children: [
                  (0, J.jsx)(`span`, {
                    className: `text-caption font-semibold text-ink-3`,
                    children: `Taught in`,
                  }),
                  b.checkpointRefs.map((e) =>
                    (0, J.jsx)(
                      `button`,
                      {
                        type: `button`,
                        disabled: !n,
                        onClick: () => n?.(e.code),
                        className: `min-h-11 min-w-11 rounded-s border border-amber-line px-2 text-label font-semibold text-amber`,
                        children: e.code,
                      },
                      e.code,
                    ),
                  ),
                ],
              }),
          ],
        }),
      (0, J.jsxs)(`div`, {
        className: `relative overflow-hidden rounded-ctl border border-edge`,
        role: `tree`,
        "aria-label": t,
        children: [
          m.map((t) => {
            let n = e.nodes.get(t.id);
            return (0, J.jsx)(
              L,
              {
                node: n,
                open: o.has(t.id),
                tone: j(e, t.id, v, u, !o.has(t.id)),
                match: !1,
                onToggle: () => C(t.id),
                onSelect: () => {
                  (n.children.length && C(n.id), d(u === n.id ? null : n.id));
                },
              },
              t.id,
            );
          }),
          (0, J.jsx)(F, {
            arcs: y.visible,
            rows: m.length,
            focus: v,
            centers: h.centers,
            heightPx: h.totalHeight,
          }),
        ],
      }),
      y.hidden > 0 &&
        (0, J.jsxs)(`p`, {
          role: `status`,
          className: `text-caption text-ink-3`,
          children: [
            y.hidden,
            ` links hidden — fold or select an idea to trace connections.`,
          ],
        }),
    ],
  });
}
function he(e, t, n = []) {
  if (e)
    return e.checkpoints.map((e, t) => ({
      code: e.code || `CP${t + 1}`,
      title: e.title || `Untitled checkpoint`,
      criterion: e.criterion || ``,
      stage: e.stage ?? void 0,
      steps: Array.isArray(e.steps) ? e.steps : [],
      pages: e.pages,
      source: e.source,
      prereqs: Array.isArray(e.prereqs) ? e.prereqs : [],
      objective: e.objective,
      dueOn: e.due_on ?? null,
      concepts: e.concepts ?? [],
      sources: e.sources ?? [],
      recheck: e.recheck_prompt,
    }));
  if (!t) return [];
  let r = n
      .filter((e) => e.ui !== `proposed`)
      .map((e) => ({
        code: e.code,
        title: e.title,
        criterion: ``,
        stage: e.stage ?? void 0,
        steps: [],
        prereqs: [],
        dueOn: e.dueOn ?? null,
      })),
    i = new Set(r.map((e) => e.code.toLowerCase())),
    a = (e) => (i.add(e.toLowerCase()), e),
    o = (e) => {
      if (e)
        for (let t = 0; t < 26; t++) {
          let n = e + String.fromCharCode(97 + t);
          if (!i.has(n.toLowerCase())) return a(n);
        }
      for (let e = 1; ; e++) {
        let t = `CP${e}`;
        if (!i.has(t.toLowerCase())) return a(t);
      }
    };
  for (let e of t.ops) e.op === `add` && e.code && a(e.code);
  for (let e of t.ops)
    if (e.op === `add`) {
      let t = e.code || o(e.after),
        n = e.after ? r.findIndex((t) => t.code === e.after) : -1,
        i = {
          code: t,
          title: e.title || `Untitled checkpoint`,
          criterion: e.criterion || ``,
          stage: e.stage ?? (n >= 0 ? r[n].stage : void 0),
          steps: Array.isArray(e.steps) ? e.steps : [],
          source: e.source,
          pages: e.pages,
          prereqs: Array.isArray(e.prereqs) ? e.prereqs : [],
          objective: e.objective,
          dueOn: e.due_on ?? null,
          concepts: e.concepts ?? [],
          sources: e.sources ?? [],
          recheck: e.recheck_prompt,
          change: `added`,
        },
        a = r.findIndex((e) => e.code === t);
      a >= 0 && r.splice(a, 1);
      let s = e.after ? r.findIndex((t) => t.code === e.after) : -1;
      r.splice(s >= 0 ? s + 1 : r.length, 0, i);
    } else if (e.op === `update`) {
      let t = r.find((t) => t.code === e.code);
      t &&
        (e.title !== void 0 && (t.title = e.title),
        e.criterion !== void 0 && (t.criterion = e.criterion),
        e.stage !== void 0 && (t.stage = e.stage ?? void 0),
        e.steps !== void 0 && (t.steps = Array.isArray(e.steps) ? e.steps : []),
        e.pages !== void 0 && (t.pages = e.pages),
        e.objective !== void 0 && (t.objective = e.objective),
        e.recheck_prompt !== void 0 && (t.recheck = e.recheck_prompt),
        (t.change ||= `updated`));
    } else if (e.op === `remove`) {
      let t = r.findIndex((t) => t.code === e.code);
      t >= 0 && r.splice(t, 1);
    } else if (e.op === `move`) {
      let t = r.findIndex((t) => t.code === e.code);
      if (t >= 0) {
        let [n] = r.splice(t, 1),
          i = r.findIndex((t) => t.code === e.after);
        r.splice(i < 0 ? r.length : i + 1, 0, n);
      }
    } else {
      let t = r.find((t) => t.code === e.code);
      if (!t) continue;
      (e.op === `prereq_add` &&
        !t.prereqs.includes(e.prereq) &&
        t.prereqs.push(e.prereq),
        e.op === `prereq_remove` &&
          (t.prereqs = t.prereqs.filter((t) => t !== e.prereq)),
        (t.change ||= `updated`));
    }
  return r;
}
var ge = [`cluster`, `galaxy`, `system`, `planet`, `moon`],
  Y = (e) => e.trim().toLocaleLowerCase();
function _e(e, t, n, r, i) {
  let a = [...(e?.concepts ?? []), ...(t?.concepts ?? [])].filter((e) =>
      e?.name?.trim(),
    ),
    o = new Map();
  for (let e of a) o.has(Y(e.name)) || o.set(Y(e.name), e);
  for (let e of n)
    for (let t of e.concepts ?? [])
      t.trim() && !o.has(Y(t)) && o.set(Y(t), { name: t });
  if (!o.size) return null;
  let s = !a.some((e) => e.parent?.trim() || (e.level && e.level !== `planet`)),
    c = (e) => `idea:` + Y(e),
    l = new Map();
  for (let e of n)
    for (let t of e.concepts ?? []) {
      let n = l.get(Y(t)) ?? [];
      (n.some((t) => t.code === e.code) ||
        n.push({ projectSlug: r, code: e.code }),
        l.set(Y(t), n));
    }
  let u = [...o.entries()].map(([e, t]) => ({
      id: `idea:` + e,
      slug: e.replace(/[^a-z0-9]+/g, `-`),
      name: t.name.trim(),
      level: ge.includes(t.level) ? t.level : `planet`,
      parentId:
        t.parent && o.has(Y(t.parent)) && Y(t.parent) !== e
          ? c(t.parent)
          : null,
      isStar: !!t.star,
      topic: s
        ? l.get(e)?.[0]
          ? `Taught in ${l.get(e)[0].code}`
          : `Not yet assigned to a checkpoint`
        : (t.topic ?? null),
      blurb: t.blurb ?? null,
      subjectId: `plan`,
      status: `not_started`,
      pinX: null,
      pinY: null,
      checkpointRefs: l.get(e) ?? [],
      dueCards: 0,
    })),
    d = [],
    f = new Set(),
    p = (e, t, n) => {
      if (!o.has(Y(e)) || !o.has(Y(t)) || Y(e) === Y(t)) return;
      let r =
        n +
        `:` +
        (n === `related` ? [Y(e), Y(t)].sort().join(`|`) : Y(e) + `>` + Y(t));
      f.has(r) || (f.add(r), d.push({ fromId: c(e), toId: c(t), kind: n }));
    };
  for (let e of o.values()) {
    for (let t of e.prereqs ?? []) p(t, e.name, `prereq`);
    for (let t of e.related ?? []) p(e.name, t, `related`);
  }
  return {
    subjects: [
      { id: `plan`, name: i.name, glyph: i.glyph, hue: `amber`, position: 0 },
    ],
    concepts: u,
    links: d,
  };
}
var ve = {},
  ye = { nodes: [], stages: [], ideaTree: null, ideaCount: 0 },
  be = new WeakMap();
function xe(e, t) {
  if (!e) return ye;
  let n = be.get(e);
  n || ((n = new WeakMap()), be.set(e, n));
  let r = t ?? ve,
    i = n.get(r);
  if (i) return i;
  let a = he(e.plan, e.planChange, t?.checkpoints ?? []),
    o = _e(e.plan, e.planChange, a, e.projectSlug, {
      name: t?.subject?.name ?? `This plan`,
      glyph: e.projectGlyph,
    }),
    s = o ? A(o) : null,
    c = {
      nodes: a,
      stages: K(a),
      ideaTree: s,
      ideaCount: s
        ? [...s.nodes.values()].filter((e) => !e.synthetic).length
        : 0,
    };
  return (n.set(r, c), c);
}
var X = new Map(),
  Se = 512;
function Z({ source: e }) {
  if (E(e))
    return (0, J.jsx)(`span`, {
      className: `lemma-math lemma-tex-inline`,
      children: e,
    });
  let t = X.get(e);
  if (t === void 0) {
    if (((t = B(e, { inline: !0 })), X.size >= Se)) {
      let e = X.keys().next().value;
      e !== void 0 && X.delete(e);
    }
    X.set(e, t);
  }
  return (0, J.jsx)(`span`, {
    className: `lemma-math lemma-tex-inline`,
    dangerouslySetInnerHTML: { __html: t },
  });
}
function Q({ nodes: e, selected: t, onSelect: n }) {
  let r = (0, U.useMemo)(() => ce(e), [e]),
    i = (0, U.useMemo)(() => new Map(r.nodes.map((e) => [e.code, e])), [r]),
    a = (0, U.useMemo)(() => new Map(e.map((e) => [e.code, e])), [e]);
  return (0, J.jsx)(`div`, {
    className: `overflow-auto rounded-slab border border-edge bg-well`,
    "aria-label": `Checkpoint prerequisites`,"data-style":"role-checkpoint-prerequisites",
    children: (0, J.jsxs)(`svg`, {
      role: `group`,
      "aria-label": `Map of proposed checkpoints and prerequisites`,
      width: r.width,
      height: r.height,
      viewBox: `0 0 ${r.width} ${r.height}`,
      style: { maxWidth: `none` },
      className: `block`,
      children: [
        r.edges.map((e) => {
          let t = i.get(e.from),
            n = i.get(e.to);
          return (0, J.jsx)(
            `line`,
            {
              x1: t.x,
              y1: t.y,
              x2: n.x,
              y2: n.y,
              stroke: `var(--amber-line-2)`,
              strokeWidth: `1.5`,
              strokeDasharray: `3 4`,
            },
            e.from + `>` + e.to,
          );
        }),
        r.nodes.map((e) => {
          let r = a.get(e.code),
            i = t === r.code;
          return (0, J.jsxs)(
            `g`,
            {
              role: `button`,
              tabIndex: 0,
              "aria-label": `Select ${r.code} ${h(r.title)}`,
              style: { cursor: `pointer` },
              onClick: () => n(r.code),
              onKeyDown: (e) => {
                (e.key === `Enter` || e.key === ` `) &&
                  (e.preventDefault(), n(r.code));
              },
              children: [
                (0, J.jsx)(`circle`, {
                  cx: e.x,
                  cy: e.y,
                  r: 23,
                  fill: `transparent`,
                }),
                (0, J.jsx)(`circle`, {
                  cx: e.x,
                  cy: e.y,
                  r: 18,
                  fill: i ? `var(--amber)` : `var(--raised)`,
                  stroke: r.change ? `var(--amber)` : `var(--amber-line-2)`,
                  strokeWidth: r.change ? 2 : 1,
                  strokeDasharray: r.change === `added` ? `4 3` : void 0,
                }),
                (0, J.jsx)(`text`, {
                  x: e.x,
                  y: e.y + 3,
                  textAnchor: `middle`,
                  fontSize: (r.code.length, 12),
                  fontWeight: `600`,
                  fill: i ? `var(--amber-ink)` : `var(--ink)`,
                  children: r.code,
                }),
              ],
            },
            r.code,
          );
        }),
      ],
    }),
  });
}
function Ce({ nodes: e, selected: t, onSelect: n }) {
  let r = e.length > 16,
    [i, a] = (0, U.useState)(null),
    [o, s] = (0, U.useState)(!1),
    [columns,setColumns]=(0,U.useState)(()=>innerWidth>=1000?4:innerWidth>=600?3:2),
    c = (0, U.useMemo)(() => K(e), [e]),
    l = (0, U.useMemo)(() => pe(e, i, columns), [e, i, columns]),
    u = (0, U.useMemo)(() => new Map(l.stages.map((e) => [e.id, e])), [l]),
    d = c.find((e) => e.id === i);
  (0,U.useEffect)(()=>{const resize=()=>setColumns(innerWidth>=1000?4:innerWidth>=600?3:2);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
  return (
    (0, U.useEffect)(() => {
      (a(null), s(!1));
    }, [e]),
    r
      ? (0, J.jsxs)(`section`, {
          "aria-label": `Checkpoint prerequisites`,"data-style":"role-checkpoint-prerequisites",
          className: `flex min-w-0 flex-col gap-2`,
          children: [
            (0, J.jsxs)(`div`, {
              className: `proposal-stage-toolbar`,
              children: [
                (0,J.jsxs)(`div`,{className:`proposal-stage-heading`,children:[(0,J.jsx)(`h2`,{children:`Plan stages`}),(0,J.jsx)(`p`,{children:`${c.length} stages · ${e.length} checkpoints`})]}),
                (0, J.jsx)(`button`, {
                  type: `button`,
                  className: `min-h-11 rounded-ctl border border-edge px-3 text-label text-amber`,
                  onClick: () => {
                    (s((e) => !e), a(null));
                  },
                  children: o ? `Show stages` : `Expand all`,
                }),
              ],
            }),
            o
              ? (0, J.jsx)(Q, { nodes: e, selected: t, onSelect: n })
              : (0, J.jsx)(`div`, {
                  className: `min-w-0 overflow-hidden rounded-slab border border-edge bg-well`,
                  children: (0, J.jsxs)(`svg`, {
                    role: `group`,
                    "aria-label": `Stage dependency graph`,
                    width: `100%`,
                    viewBox: `0 0 ${l.width} ${l.height}`,
                    className: `proposal-stage-map block`,
                    style:{width:l.width,maxWidth:'100%',height:'auto',margin:'0 auto'},
                    children: [
                      l.edges.map((e) => {
                        let t = u.get(e.from),
                          n = u.get(e.to),
                          r = (t.x + n.x) / 2,
                          i = (t.y + n.y) / 2,
                          a = t.x === n.x ? 18 : 0;
                        return (0, J.jsxs)(
                          `g`,
                          {
                            "aria-label": `${e.count} prerequisite links from ${h(t.name)} to ${h(n.name)}`,
                            children: [
                              (0, J.jsx)(`line`, {
                                x1: t.x,
                                y1: t.y,
                                x2: n.x,
                                y2: n.y,
                                stroke: `var(--edge)`,
                                strokeWidth: `1.5`,
                                strokeDasharray: `3 4`,
                              }),
                              (0, J.jsx)(`rect`, {
                                x: r - 13 + a,
                                y: i - 10,
                                width: `26`,
                                height: `20`,
                                rx: `7`,
                                fill: `var(--raised)`,
                                stroke: `var(--edge)`,
                              }),
                              (0, J.jsx)(`text`, {
                                x: r + a,
                                y: i + 4,
                                fill: `var(--ink)`,
                                textAnchor: `middle`,
                                fontSize: `12`,
                                fontWeight: `600`,
                                children: e.count,
                              }),
                            ],
                          },
                          e.from + `>` + e.to,
                        );
                      }),
                      l.stages.map((e) => {
                        let t = i === e.id;
                        return (0, J.jsxs)(
                          `g`,
                          {
                            role: `button`,
                            tabIndex: 0,
                            "aria-expanded": t,
                            "aria-label": `${h(e.name)}, ${e.count} checkpoints. ${t ? `Collapse` : `Expand`} stage`,
                            onClick: () => a(t ? null : e.id),
                            onKeyDown: (n) => {
                              (n.key === `Enter` || n.key === ` `) &&
                                (n.preventDefault(), a(t ? null : e.id));
                            },
                            style: { cursor: `pointer` },
                            children: [
                              (0, J.jsxs)(`title`, {
                                children: [
                                  h(e.name),
                                  ` · `,
                                  e.count,
                                  ` checkpoints`,
                                ],
                              }),
                              (0, J.jsx)(`rect`, {
                                x: e.x - 65,
                                y: e.y - 32,
                                width: `130`,
                                height: `64`,
                                rx: `6`,
                                fill: t ? `var(--amber-tint)` : `var(--raised)`,
                                stroke: t
                                  ? `var(--amber)`
                                  : `var(--edge)`,
                                strokeWidth: t ? 2 : 1.5,
                              }),
                              (0, J.jsx)(`foreignObject`, {
                                "data-stage-label": ``,
                                x: e.x - 60,
                                y: e.y - 26,
                                width: `120`,
                                height: `32`,
                                children: (0, J.jsx)(`div`, {
                                  className: `flex h-full w-full items-center overflow-x-auto overflow-y-hidden whitespace-nowrap px-1 text-center text-[16px] leading-10 text-ink`,
                                  title: h(e.name),
                                  children: (0, J.jsx)(z, {
                                    source: e.name,
                                    className: `mx-auto`,
                                  }),
                                }),
                              }),
                              (0, J.jsxs)(`text`, {
                                x: e.x,
                                y: e.y + 22,
                                textAnchor: `middle`,
                                fontSize: `13.5`,
                                fill: `var(--ink-2)`,
                                children: [
                                  e.count,
                                  ` `,
                                  e.count === 1 ? `checkpoint` : `checkpoints`,
                                ],
                              }),
                            ],
                          },
                          e.id,
                        );
                      }),
                      d &&
                        l.expandedY !== null &&
                        (0, J.jsx)(`foreignObject`, {
                          "data-expanded-stage": ``,
                          x: `8`,
                          y: l.expandedY,
                          width: l.width - 16,
                          height: `206`,
                          children: (0, J.jsxs)(`div`, {
                            className: `flex h-full min-w-0 flex-col gap-1 rounded-ctl border border-amber-line bg-raised p-2`,
                            children: [
                              (0, J.jsxs)(`p`, {
                                className: `min-w-0 shrink-0 overflow-x-auto whitespace-nowrap text-[16px] font-semibold text-ink`,
                                children: [
                                  (0, J.jsx)(Z, { source: d.name }),
                                  ` · `,
                                  d.nodes.length,
                                  ` checkpoints`,
                                ],
                              }),
                              (0, J.jsx)(`div`, {
                                className: `min-h-0 flex-1 overflow-auto`,
                                children: (0, J.jsx)(Q, {
                                  nodes: d.nodes,
                                  selected: t,
                                  onSelect: n,
                                }),
                              }),
                            ],
                          }),
                        }),
                    ],
                  }),
                }),
          ],
        })
      : (0, J.jsx)(Q, { nodes: e, selected: t, onSelect: n })
  );
}
function $(e) {
  if (!e) return null;
  let t = new Date(e + `T12:00:00Z`);
  return Number.isNaN(t.getTime())
    ? null
    : t.toLocaleDateString(`en-GB`, {
        day: `numeric`,
        month: `short`,
        timeZone: `UTC`,
      });
}
function we({
  nodes: e,
  code: t,
  projectSlug: n,
  isChange: r,
  onOpen: i,
  onClose: o,
}) {
  let s = e.findIndex((e) => e.code === t),
    d = e[s];
  if (
    ((0, U.useEffect)(() => {
      let t = (t) => {
        (t.key === `ArrowRight` && s < e.length - 1 && i(e[s + 1].code),
          t.key === `ArrowLeft` && s > 0 && i(e[s - 1].code));
      };
      return (
        document.addEventListener(`keydown`, t),
        () => document.removeEventListener(`keydown`, t)
      );
    }, [s, e, i]),
    !d)
  )
    return null;
  let p = e.filter((e) => e.prereqs.includes(d.code)),
    m = d.sources?.length
      ? d.sources
          .map((e) => e.source + (e.pages ? ` pp. ` + e.pages : ``))
          .join(`; `)
      : d.source || d.pages
        ? `${d.source ?? `Book`}${d.pages ? ` pp. ${d.pages}` : ``}`
        : null,
    g = (t) =>
      e.some((e) => e.code === t)
        ? (0, J.jsx)(
            `button`,
            {
              type: `button`,
              onClick: () => i(t),
              className: `min-h-11 min-w-11 rounded-s border border-amber-line px-2 text-label font-semibold text-amber`,
              children: t,
            },
            t,
          )
        : (0, J.jsx)(
            `span`,
            {
              className: `rounded-s border border-edge px-2 py-1 text-label text-ink-3`,
              children: t,
            },
            t,
          );
  return (0, J.jsx)(ne, {
    open: !0,
    onClose: o,
    title: `${d.code} · ${h(d.title)}`,
    children: (0, J.jsxs)(`div`, {
      "data-checkpoint-drawer": d.code,
      className: `flex flex-col gap-4 text-body text-ink-2`,
      children: [
        (0, J.jsxs)(`div`, {
          className: `-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-3`,
          children: [
            d.stage &&
              (0, J.jsx)(`span`, {
                className: `text-[16px]`,
                children: (0, J.jsx)(z, { source: d.stage }),
              }),
            $(d.dueOn) &&
              (0, J.jsxs)(`span`, {
                className: `flex items-center gap-1`,
                children: [(0, J.jsx)(l, { size: 14 }), `Planned `, $(d.dueOn)],
              }),
            d.change &&
              (0, J.jsx)(`span`, {
                className: `rounded-s border border-amber-line px-1.5 text-caption text-amber`,
                children:
                  d.change === `added` ? `New in this change` : `Changed`,
              }),
          ],
        }),
        d.objective &&
          (0, J.jsx)(H, { source: d.objective, className: `text-ink` }),
        d.criterion &&
          (0, J.jsxs)(`div`, {
            className: `flex gap-2 rounded-ctl border border-edge bg-well p-3`,
            children: [
              (0, J.jsx)(oe, {
                size: 17,
                className: `mt-1 shrink-0 text-amber`,
              }),
              (0, J.jsxs)(`div`, {
                className: `min-w-0 flex-1`,
                children: [
                  (0, J.jsx)(`p`, {
                    className: `text-caption font-semibold text-ink-3`,
                    children: `Done when`,
                  }),
                  (0, J.jsx)(H, {
                    source: d.criterion,
                    className: `font-math`,
                  }),
                ],
              }),
            ],
          }),
        d.steps.length > 0 &&
          (0, J.jsxs)(`div`, {
            children: [
              (0, J.jsxs)(`p`, {
                className: `mb-1 text-caption font-semibold text-ink-3`,
                children: [d.steps.length, ` steps`],
              }),
              (0, J.jsx)(`ol`, {
                className: `flex flex-col`,
                children: d.steps.map((e, t) =>
                  (0, J.jsxs)(
                    `li`,
                    {
                      className: `flex min-h-9 items-baseline gap-3 border-b border-edge py-1.5 last:border-0`,
                      children: [
                        (0, J.jsx)(`span`, {
                          className: `w-5 shrink-0 text-right text-label tabular-nums text-amber`,
                          children: t + 1,
                        }),
                        (0, J.jsx)(z, {
                          source: e,
                          className: `min-w-0 flex-1`,
                        }),
                      ],
                    },
                    t,
                  ),
                ),
              }),
            ],
          }),
        m &&
          (0, J.jsxs)(`p`, {
            className: `flex items-start gap-2`,
            children: [
              (0, J.jsx)(c, { size: 16, className: `mt-1 shrink-0` }),
              m,
            ],
          }),
        (d.prereqs.length > 0 || p.length > 0) &&
          (0, J.jsxs)(`div`, {
            className: `grid grid-cols-2 gap-3`,
            children: [
              (0, J.jsxs)(`div`, {
                children: [
                  (0, J.jsx)(`p`, {
                    className: `mb-1 text-caption font-semibold text-ink-3`,
                    children: `Builds on`,
                  }),
                  (0, J.jsx)(`div`, {
                    className: `flex flex-wrap gap-1.5`,
                    children: d.prereqs.length
                      ? d.prereqs.map(g)
                      : (0, J.jsx)(`span`, {
                          className: `text-label text-ink-3`,
                          children: `Nothing`,
                        }),
                  }),
                ],
              }),
              (0, J.jsxs)(`div`, {
                children: [
                  (0, J.jsx)(`p`, {
                    className: `mb-1 text-caption font-semibold text-ink-3`,
                    children: `Needed for`,
                  }),
                  (0, J.jsx)(`div`, {
                    className: `flex flex-wrap gap-1.5`,
                    children: p.length
                      ? p.map((e) => g(e.code))
                      : (0, J.jsx)(`span`, {
                          className: `text-label text-ink-3`,
                          children: `Nothing`,
                        }),
                  }),
                ],
              }),
            ],
          }),
        d.concepts &&
          d.concepts.length > 0 &&
          (0, J.jsxs)(`div`, {
            children: [
              (0, J.jsx)(`p`, {
                className: `mb-1 text-caption font-semibold text-ink-3`,
                children: `Ideas`,
              }),
              (0, J.jsx)(`div`, {
                className: `flex flex-wrap gap-1.5`,
                children: d.concepts.map((e) =>
                  (0, J.jsx)(
                    `span`,
                    {
                      className: `rounded-chip border border-edge px-2 py-1 text-label`,
                      children: (0, J.jsx)(z, { source: e }),
                    },
                    e,
                  ),
                ),
              }),
            ],
          }),
        r &&
          !d.change &&
          (0, J.jsxs)(a, {
            to: `/p/${n}/cp/${d.code}`,
            className: `flex min-h-11 items-center justify-between rounded-ctl border border-edge px-3 text-label text-ink-2`,
            children: [
              `Unchanged by this proposal. Open `,
              d.code,
              ` in the project`,
              (0, J.jsx)(_, { size: 16 }),
            ],
          }),
        d.recheck &&
          (0, J.jsxs)(`p`, {
            className: `flex items-start gap-2 text-label italic text-ink-3`,
            children: [
              (0, J.jsx)(f, { size: 14, className: `mt-0.5 shrink-0` }),
              (0, J.jsx)(z, { source: d.recheck }),
            ],
          }),
        (0, J.jsxs)(`div`, {
          className: `mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2`,
          children: [
            (0, J.jsxs)(`button`, {
              type: `button`,
              disabled: s === 0,
              onClick: () => i(e[s - 1].code),
              className: `flex min-h-11 items-center gap-1 rounded-btn border border-edge-2 px-3 text-label disabled:opacity-35`,
              children: [
                (0, J.jsx)(u, { size: 16 }),
                s > 0 ? e[s - 1].code : `Start`,
              ],
            }),
            (0, J.jsxs)(`span`, {
              className: `text-caption tabular-nums text-ink-3`,
              children: [s + 1, ` of `, e.length],
            }),
            (0, J.jsxs)(`button`, {
              type: `button`,
              disabled: s === e.length - 1,
              onClick: () => i(e[s + 1].code),
              className: `flex min-h-11 items-center justify-end gap-1 rounded-btn border border-edge-2 px-3 text-label disabled:opacity-35`,
              children: [
                s < e.length - 1 ? e[s + 1].code : `End`,
                (0, J.jsx)(_, { size: 16 }),
              ],
            }),
          ],
        }),
      ],
    }),
  });
}
var Te = (0, U.memo)(Ce),
  Ee = (0, U.memo)(me);
function De() {
  let { id: e = `` } = o(),
    n = i(),
    r = D(e),
    a = ie(r.data?.projectSlug ?? ``),
    c = p(),
    l = y(),
    u = re(),
    f = C(),
    [ee, te] = (0, U.useState)(``),
    [w, T] = (0, U.useState)(null),
    [E, O] = (0, U.useState)(!1),
    [k, A] = (0, U.useState)(``),
    [j, M] = (0, U.useState)(!1);
  (0, U.useEffect)(() => {
    if (!r.isLoading) {
      M(!1);
      return;
    }
    let e = setTimeout(() => M(!0), 300);
    return () => clearTimeout(e);
  }, [r.isLoading]);
  let N = r.data,
    P = !!(N?.planChange && a.isPending),
    {
      nodes: F,
      ideaTree: I,
      ideaCount: L,
      stages: R,
    } = (0, U.useMemo)(() => xe(P ? null : N, a.data), [N, a.data, P]),
    oe = F.find((e) => e.code === ee) ?? F[0],
    z = (0, U.useCallback)((e) => {
      (te(e), T(e));
    }, []),
    B = l.isPending || u.isPending,
    H = async () => {
      if (N)
        try {
          (await l.mutateAsync({ id: N.id }),
            f(`Plan approved`),
            n(`/p/${N.projectSlug}`));
        } catch {
          f(`Couldn't approve the plan.`, { tone: `danger` });
        }
    },
    W = async () => {
      if (!N || !k.trim() || B) return;
      let e = g(N.projectSlug.replaceAll(`-`, ` `), k.trim()),
        t = window.open(`about:blank`, `_blank`);
      t && (t.opener = null);
      let r = !1;
      try {
        (await navigator.clipboard.writeText(e), (r = !0));
      } catch {}
      if (!t && !r)
        f(
          `Could not copy or open your tutor. Your proposal is still pending.`,
          { tone: `danger` },
        );
      else
        try {
          (await u.mutateAsync(N.id),
            t
              ? (t.location.href = S(c.data?.preferredChat ?? `claude`, e))
              : f(`Request copied. Paste it into your tutor.`),
            r && t && f(`Request copied for your tutor`),
            O(!1),
            n(`/proposals?tab=plan`));
        } catch {
          (t?.close(),
            f(`Couldn't request changes. The proposal remains available.`, {
              tone: `danger`,
            }));
        }
    };
  return (0, J.jsx)(d, {
    title: `Plan proposal`,
    back: `/proposals?tab=plan`,
    children: r.isLoading
      ? j
        ? (0, J.jsxs)(J.Fragment, {
            children: [
              (0, J.jsx)(v, { w: `70%`, h: 24 }),
              (0, J.jsx)(v, { w: `100%`, h: 160 }),
            ],
          })
        : null
      : r.isError || !N
        ? (0, J.jsxs)(`div`, {
            children: [
              (0, J.jsx)(`p`, {
                className: `text-ink-2`,
                children: `This proposal could not be loaded.`,
              }),
              (0, J.jsx)(V, {
                className: `mt-4`,
                variant: `ghost`,
                onClick: () => void r.refetch(),
                children: `Try again`,
              }),
            ],
          })
        : (0, J.jsxs)(J.Fragment, {
            children: [
              (0, J.jsxs)(`div`, {
                children: [
                  (0, J.jsx)(`h2`, {
                    className: `text-title-s font-medium italic`,
                    style: { fontFamily: `var(--font-display)` },
                    children: N.kind === `plan` ? `New plan` : `Plan change`,
                  }),
                  (0, J.jsxs)(`div`, {
                    className: `mt-3 flex items-center gap-3 text-label text-ink-3`,
                    children: [
                      N.origin === `chatgpt`
                        ? (0, J.jsx)(s, { size: 16 })
                        : (0, J.jsx)(ae, { size: 16 }),
                      (0, J.jsx)(`span`, {
                        children: N.origin === `chatgpt` ? `ChatGPT` : `Claude`,
                      }),
                      (0, J.jsx)(m, { subject: N.projectGlyph, size: 32 }),
                      (0, J.jsx)(`span`, {
                        className: `capitalize`,
                        children: N.projectSlug.replaceAll(`-`, ` `),
                      }),
                      (0, J.jsxs)(`span`, {
                        children: [
                          `· `,
                          F.length,
                          ` `,
                          F.length === 1 ? `checkpoint` : `checkpoints`,
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              P &&
                (0, J.jsx)(`p`, {
                  role: `status`,
                  className: `text-label text-ink-3`,
                  children: `Preparing project context…`,
                }),
              F.length > 0 &&
                (0, J.jsx)(Te, { nodes: F, selected: w ?? ``, onSelect: z }),
              F.length > 0 &&
                (0, J.jsxs)(`details`, {
                  className: `lemma-prereq-outline`,
                  children: [
                    (0, J.jsxs)(`summary`, {
                      children: [
                        `Inspect prerequisite links · `,
                        F.reduce(
                          (sum, node) =>
                            sum +
                            [...new Set(node.prereqs ?? [])].filter((pr) =>
                              F.some((p) => p.code === pr && pr !== node.code),
                            ).length,
                          0,
                        ),
                        ` recorded edges`,
                      ],
                    }),
                    (0, J.jsx)(`p`, {
                      className: `lemma-prereq-note`,
                      children: `Arrows and links are derived from checkpoint prerequisites, not code order. Independent checkpoints are not connected.`,
                    }),
                    (0, J.jsx)(`ul`, {
                      children: F.flatMap((node) =>
                        [...new Set(node.prereqs ?? [])]
                          .filter((pr) =>
                            F.some((p) => p.code === pr && pr !== node.code),
                          )
                          .map((pr) =>
                            (0, J.jsx)(
                              `li`,
                              {
                                children: (0, J.jsxs)(`button`, {
                                  type: `button`,
                                  onClick: () => z(node.code),
                                  children: [
                                    (0, J.jsx)(`code`, { children: pr }),
                                    ` prerequisite for `,
                                    (0, J.jsx)(`code`, { children: node.code }),
                                    ` · `,
                                    (0, J.jsx)(Z, { source: node.title }),
                                  ],
                                }),
                              },
                              pr + `>` + node.code,
                            ),
                          ),
                      ),
                    }),
                  ],
                }),
              (0, J.jsxs)(`section`, {
                "aria-label": `Checkpoints`,"data-style":"role-checkpoints",
                className: `flex flex-col gap-4`,
                children: [
                  R.length > 5 &&
                    (0, J.jsx)(`nav`, {
                      "aria-label": `Jump to stage`,
                      className: `flex gap-2 overflow-x-auto pb-2`,
                      children: R.map((e, t) =>
                        (0, J.jsx)(
                          `button`,
                          {
                            type: `button`,
                            title: h(e.name),
                            onClick: () =>
                              document
                                .getElementById(`plan-stage-${t}`)
                                ?.scrollIntoView({
                                  behavior: `smooth`,
                                  block: `start`,
                                }),
                            className: `min-h-11 min-w-11 max-w-40 shrink-0 overflow-x-auto whitespace-nowrap rounded-chip border border-edge px-3 text-[16px] text-ink-2`,
                            children: (0, J.jsx)(Z, { source: e.name }),
                          },
                          e.id,
                        ),
                      ),
                    }),
                  R.map((e, t) =>
                    (0, J.jsxs)(
                      `div`,
                      {
                        id: `plan-stage-${t}`,
                        className: `scroll-mt-20`,
                        children: [
                          (0, J.jsxs)(`h3`, {
                            className: `mb-1 flex items-baseline justify-between gap-3`,
                            children: [
                              (0, J.jsx)(`span`, {
                                className: `min-w-0 overflow-x-auto text-title-s italic`,
                                style: { fontFamily: `var(--font-display)` },
                                children: (0, J.jsx)(Z, { source: e.name }),
                              }),
                              (0, J.jsx)(`span`, {
                                className: `text-caption text-ink-3`,
                                children: e.nodes.length,
                              }),
                            ],
                          }),
                          (0, J.jsx)(b, {
                            className: `rounded-slab px-2 py-1`,
                            children: e.nodes.map((e) =>
                              (0, J.jsxs)(
                                `button`,
                                {
                                  type: `button`,
                                  onClick: () => z(e.code),
                                  "aria-haspopup": `dialog`,
                                  "aria-label": `Open ${e.code} ${h(e.title)}`,
                                  className:
                                    `flex min-h-12 w-full items-center gap-3 border-b border-edge px-2 text-left last:border-0 ` +
                                    (oe?.code === e.code && w
                                      ? `bg-amber-tint`
                                      : ``),
                                  children: [
                                    (0, J.jsx)(`span`, {
                                      className:
                                        `w-[46px] shrink-0 rounded-s border py-0.5 text-center text-label font-semibold text-amber ` +
                                        (e.change === `added`
                                          ? `border-dashed border-amber`
                                          : `border-amber-line`),
                                      children: e.code,
                                    }),
                                    (0, J.jsx)(`span`, {
                                      className: `min-w-0 flex-1 truncate leading-snug`,
                                      children: (0, J.jsx)(Z, {
                                        source: e.title,
                                      }),
                                    }),
                                    $(e.dueOn) &&
                                      (0, J.jsx)(`span`, {
                                        className: `shrink-0 text-caption tabular-nums text-ink-3`,
                                        children: $(e.dueOn),
                                      }),
                                    (0, J.jsx)(_, {
                                      size: 16,
                                      className: `shrink-0 text-ink-3`,
                                    }),
                                  ],
                                },
                                e.code,
                              ),
                            ),
                          }),
                        ],
                      },
                      e.id,
                    ),
                  ),
                ],
              }),
              N.planChange &&
                (0, J.jsxs)(`section`, {
                  "aria-label": `Plan errata`,"data-style":"role-plan-errata",
                  className: `flex flex-col text-body text-ink-2`,
                  children: [
                    (0, J.jsx)(`h3`, {
                      className: `mb-2 text-title-s italic`,
                      style: { fontFamily: `var(--font-display)` },
                      children: `Proposed amendments`,
                    }),
                    N.planChange.ops.map((e, t) =>
                      (0, J.jsxs)(
                        `div`,
                        {
                          className: `flex min-h-11 items-start gap-3 border-b border-edge py-3 last:border-0`,
                          children: [
                            (0, J.jsx)(`span`, {
                              className: `w-[46px] shrink-0 rounded-s border border-amber-line px-1 py-1 text-center text-label text-amber`,
                              children:
                                e.op === `add`
                                  ? `Add`
                                  : e.op === `remove`
                                    ? `Cut`
                                    : e.op === `move`
                                      ? `Move`
                                      : e.op === `update`
                                        ? `Edit`
                                        : e.op === `prereq_add`
                                          ? `Link`
                                          : e.op === `prereq_remove`
                                            ? `Unlink`
                                            : `Change`,
                            }),
                            (0, J.jsx)(`span`, {
                              className: `min-w-0 flex-1`,
                              children:
                                e.op === `add`
                                  ? `Add ${F.find((t) => t.title === e.title && t.stage === (e.stage ?? void 0))?.code ?? e.code ?? `new checkpoint`} · ${e.title}`
                                  : e.op === `prereq_add`
                                    ? `${e.code} needs ${e.prereq}`
                                    : e.op === `prereq_remove`
                                      ? `${e.code} no longer needs ${e.prereq}`
                                      : e.op === `move`
                                        ? `Move ${e.code} after ${e.after}`
                                        : `${e.op === `remove` ? `Remove` : `Update`} ${e.code}`,
                            }),
                          ],
                        },
                        t,
                      ),
                    ),
                    N.reason &&
                      (0, J.jsx)(`p`, {
                        className: `mt-3 text-label italic text-ink-3`,
                        children: N.reason,
                      }),
                  ],
                }),
              I
                ? (0, J.jsxs)(`section`, {
                    "aria-label": `Ideas in this plan`,"data-style":"role-ideas-in-this-plan",
                    className: `flex flex-col gap-2`,
                    children: [
                      (0, J.jsxs)(`h3`, {
                        className: `flex items-baseline justify-between gap-3`,
                        children: [
                          (0, J.jsxs)(`span`, {
                            className: `flex items-center gap-2 text-title-s italic`,
                            style: { fontFamily: `var(--font-display)` },
                            children: [
                              (0, J.jsx)(x, {
                                size: 17,
                                className: `text-amber`,
                              }),
                              `Ideas in this plan`,
                            ],
                          }),
                          (0, J.jsxs)(`span`, {
                            className: `text-caption text-ink-3`,
                            children: [L, ` `, L === 1 ? `idea` : `ideas`],
                          }),
                        ],
                      }),
                      (0, J.jsx)(`p`, {
                        className: `text-label text-ink-3`,
                        children: `Fold clusters to see how they connect; tap an idea to trace what it builds on and opens up.`,
                      }),
                      (0, J.jsx)(Ee, {
                        tree: I,
                        label: `Ideas in this plan`,
                        onCheckpoint: z,
                      }),
                    ],
                  })
                : (0, J.jsxs)(`p`, {
                    className: `flex items-center gap-2 text-label text-ink-3`,
                    children: [
                      (0, J.jsx)(x, { size: 17 }),
                      P
                        ? `Preparing ideas with the project context…`
                        : `No new ideas for your Atlas`,
                    ],
                  }),
              (0, J.jsxs)(`div`, {
                className: `grid grid-cols-2 gap-3`,
                children: [
                  (0, J.jsx)(V, {
                    variant: `ghost`,
                    disabled: B,
                    onClick: () => O(!0),
                    children: `Ask for changes`,
                  }),
                  (0, J.jsx)(V, {
                    disabled: B,
                    onClick: () => void H(),
                    children: `Approve plan`,
                  }),
                ],
              }),
              w &&
                (0, J.jsx)(we, {
                  nodes: F,
                  code: w,
                  projectSlug: N.projectSlug,
                  isChange: !!N.planChange,
                  onOpen: z,
                  onClose: () => T(null),
                }),
              (0, J.jsxs)(ne, {
                open: E,
                onClose: () => O(!1),
                title: `Ask for changes`,
                children: [
                  (0, J.jsxs)(`label`, {
                    className: `text-ink-2`,
                    children: [
                      `What should change?`,
                      (0, J.jsx)(`textarea`, {
                        autoFocus: !0,
                        value: k,
                        onChange: (e) => A(e.target.value),
                        className: `mt-3 min-h-28 w-full rounded-ctl border border-edge bg-well p-3 text-ink`,
                      }),
                    ],
                  }),
                  (0, J.jsx)(t, { source: k }),
                  (0, J.jsx)(`p`, {
                    className: `my-4 text-label text-ink-3`,
                    children: `This rejects the proposal and opens your tutor with your request.`,
                  }),
                  (0, J.jsx)(V, {
                    className: `w-full`,
                    disabled: B || !k.trim(),
                    onClick: () => void W(),
                    children: `Send`,
                  }),
                ],
              }),
            ],
          }),
  });
}
export { we as CheckpointDrawer, Ce as PlanMap, De as default };
