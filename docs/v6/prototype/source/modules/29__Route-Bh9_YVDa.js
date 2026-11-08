import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { n as t, t as n } from "@lemma/jsx-runtime-DApVmHJR.js";
import { s as r, t as i } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import {
  C as a,
  E as o,
  H as s,
  S as c,
  b as l,
  v as u,
} from "@lemma/index-DcUkykC4.js";
import { t as d } from "@lemma/Tex-kn8bVMsW.js";
var f = e(t(), 1),
  p = 4.2,
  m = 8,
  h = 12,
  g = (e) => Math.max(4, Math.min(20, 4 * Math.sqrt(Math.max(1, e)))),
  _ = (e) => e.reduce((e, t) => e + t.width, 0) + Math.max(0, e.length - 1) * m;
function v(stages,total,selected,width,current=selected){
 const activeStage=Math.max(0,stages.findIndex(s=>s.start<=selected&&s.end>=selected));
 const start=Math.max(0,Math.min(Math.max(0,total-7),selected-3)),end=Math.min(total,start+7),marks=[];
 const left=start>0?28:12,right=end<total?width-28:width-12;
 for(let index=start;index<end;index++){const stageIndex=Math.max(0,stages.findIndex(s=>s.start<=index&&s.end>=index));marks.push({kind:'station',index,stageIndex,stageEnd:stageIndex,width:index===selected?22:10,height:index===selected?22:10,stages:0,selected:index===selected,x:left+(index-start)*Math.max(0,right-left)/Math.max(1,end-start-1)});}
 if(start>0)marks.unshift({kind:'stage',index:0,stageIndex:0,stageEnd:Math.max(0,activeStage-1),width:10,height:5,stages:activeStage,x:8});
 if(end<total)marks.push({kind:'stage',index:end,stageIndex:activeStage+1,stageEnd:stages.length-1,width:10,height:5,stages:Math.max(1,stages.length-activeStage-1),x:width-8});
 return {mode:total>7?'folded':'plain',marks,activeStage};
}

var y = n(),
  b = (e, t, n) => Math.max(t, Math.min(n, e));
function x({
  project: e,
  checkpoints: t,
  mode: n,
  scheduleRows: p,
  pacePerWeek: m,
  initialWidth: h = 360,
  initialSelected: g,
}) {
  let _ = r(),
    x = (0, f.useRef)(null),
    [S, C] = (0, f.useState)(h),
    [w, T] = (0, f.useState)(g ?? null),
    E = t.length,
    D = u(t),
    O = b(w ?? D, 0, Math.max(0, E - 1)),
    k = (0, f.useMemo)(() => l(t), [t]),
    A = (0, f.useMemo)(
      () => p ?? a(t, { targetDate: e.targetDate, pacePerWeek: m }),
      [p, t, e.targetDate, m],
    ),
    j = (0, f.useMemo)(() => v(k, E, O, S, D), [k, E, O, S, D]),
    M = n === `today` ? 64 : 80;
  (0, f.useEffect)(() => {
    let e = x.current;
    if (!e) return;
    let t = new ResizeObserver((t) =>
      C(t[0]?.contentRect.width ?? e.clientWidth),
    );
    return (t.observe(e), C(e.clientWidth), () => t.disconnect());
  }, []);
  let N = t[O],
    P = t.slice(0, O + 1).filter((e) => e.ui !== `proposed`).length,
    F = A[O] ? o(A[O]) : null,
    I = (n = O) => {
      let r = t[n];
      r && _(`/p/` + e.slug + `/cp/` + encodeURIComponent(r.code));
    },
    L = (e) => T(b(O + e, 0, E - 1)),
    R = (e) => {
      e.key === `ArrowLeft` || e.key === `ArrowRight`
        ? (e.preventDefault(), L(e.key === `ArrowRight` ? 1 : -1))
        : (e.key === `Enter` || e.key === ` `) && (e.preventDefault(), I());
    },
    z = (e) => {
      let t = e.currentTarget.getBoundingClientRect(),
        n = ((e.clientX - t.left) * S) / Math.max(1, t.width),
        r = j.marks.reduce(
          (e, t) => (!e || Math.abs(t.x - n) < Math.abs(e.x - n) ? t : e),
          null,
        );
      r && T(r.index);
    };
  if (!E)
    return (0, y.jsx)(`p`, {
      className: `text-label text-ink-3`,
      children: `A plan is needed before the Route can appear.`,
    });
  let B = k[j.activeStage],
    V = (e) => A[e]?.state ?? `unscheduled`,
    H = k.length + ` stages · ` + Math.max(0, e.total - e.done) + ` to go`,
    U = B?.name ?? ``,
    W = s(U),
    G = Math.max(0, S - 40 - H.length * 7 - 20),
    K = j.mode === `folded` && !!B && (/[\\\\$]/.test(U) || W.length * 7 > G),
    q = K ? `Stage ` + (j.activeStage + 1) : W,
    J = (e) => {
      let n = k.slice(e.stageIndex, e.stageEnd + 1),
        r = n[0]?.start ?? 0,
        i = n.at(-1)?.end ?? r;
      return {
        allDone: t
          .slice(r, i + 1)
          .every((e) => e.ui === `done` || e.ui === `revisit`),
        schedule: c(A.slice(r, i + 1)),
      };
    },
    Y = j.marks,
    X = [...Y]
      .reverse()
      .find(
        (e) =>
          e.kind === `stage` && e.stages > 1 && e.stageIndex > j.activeStage,
      ),
    Z = (0, y.jsxs)(`svg`, {
      "data-route-track": ``,
      viewBox: `0 0 ${S} ${M}`,
      preserveAspectRatio: `none`,
      width: `100%`,
      height: M,
      "aria-hidden": `true`,
      className: `block w-full overflow-hidden`,
      children: [
        Y.slice(1).map((e, t) => {
          let n = Y[t],
            r = e.kind === `stage` ? J(e).schedule : V(e.index),
            i = n.x + n.width / 2,
            a = e.x - e.width / 2,
            o = r === `late`,
            s = r === `early`,
            c = r === `future`;
          return (0, y.jsxs)(
            `g`,
            {
              "data-track-state": r,
              children: [
                (0, y.jsx)(`path`, {
                  d: `M${i} 24 L${a} 24`,
                  fill: `none`,
                  stroke: s
                    ? `var(--early)`
                    : o
                      ? `var(--late)`
                      : c
                        ? `var(--ink-4)`
                        : `var(--ink-2)`,
                  strokeWidth: s ? 3 : c ? 1.5 : 2.5,
                  strokeDasharray: o ? `5 4` : c ? `1 4` : void 0,
                }),
              ],
            },
            `track-` + t,
          );
        }),
        j.mode === `plain` &&
          k.slice(1).map((e) => {
            let t = Y.find(
                (t) => t.kind === `station` && t.index === e.start - 1,
              ),
              n = Y.find((t) => t.kind === `station` && t.index === e.start);
            if (!t || !n) return null;
            let r = (t.x + n.x) / 2;
            return (0, y.jsx)(
              `path`,
              {
                "data-route-stage-boundary": ``,
                d: `M${r} 15 L${r} 33`,
                stroke: `var(--ink-4)`,
                strokeWidth: `1`,
                fill: `none`,
              },
              `boundary-` + e.start,
            );
          }),
        Y.map((e) => {
          let n = t[e.index],
            r = V(e.index);
          if (e.kind === `stage`) {
            let t = J(e),
              n = t.allDone ? 6 : 4.5,
              r = 24 - n / 2,
              i = Math.max(2.7, e.width - (t.allDone ? 0 : 1.3));
            return (0, y.jsx)(
              `rect`,
              {
                "data-route-mark": `stage`,
                "data-stage-range": e.stageIndex + `-` + e.stageEnd,
                "data-hidden-stages": e.stages > 1 ? e.stages : void 0,
                x: e.x - i / 2,
                y: r,
                width: i,
                height: n,
                rx: n / 2,
                fill: t.allDone ? `var(--ink-2)` : `var(--paper)`,
                stroke: t.schedule === `late` ? `var(--late)` : `var(--ink-4)`,
                strokeWidth: t.allDone ? 0 : 1.3,
                strokeDasharray: t.schedule === `late` ? `3 2` : void 0,
              },
              `stage-` + e.stageIndex,
            );
          }
          let i = e.index === D,
            a = n.ui === `done`,
            o = n.ui === `revisit`,
            s = i ? 5.5 : a ? 3.6 : 3.4;
          return (0, y.jsx)(
            `g`,
            {
              "data-station-index": e.index,
              "data-station-state": r,
              children: (0, y.jsx)(`circle`, {
                "data-route-mark": `station`,
                cx: e.x,
                cy: `24`,
                r: s,
                fill: i ? `var(--accent)` : a ? `var(--ink-2)` : `var(--paper)`,
                stroke: i
                  ? `var(--accent)`
                  : e.index === O
                    ? `var(--ink)`
                    : o
                      ? `var(--late)`
                      : a
                        ? `var(--ink-2)`
                        : `var(--ink-3)`,
                strokeWidth: i ? 11 : a ? 0 : e.index === O ? 2.5 : 1.5,
                strokeOpacity: i ? 0.16 : 1,
                paintOrder: `stroke fill`,
                strokeDasharray: o ? `3 2` : void 0,
              }),
            },
            n.id,
          );
        }),
        j.mode === `plain` &&
          k.map((e, t) => {
            let n = Y.find((t) => t.kind === `station` && t.index === e.start),
              r =
                (Y.find((t) => t.kind === `station` && t.index === e.end + 1)
                  ?.x ?? S - 12) - (n?.x ?? 0),
              i = s(e.name);
            return !n || i.length * 7 + 12 > r
              ? null
              : (0, y.jsx)(
                  `text`,
                  {
                    x: n.x,
                    y: M - 12,
                    fill: t === j.activeStage ? `var(--ink)` : `var(--ink-3)`,
                    fontSize: `12`,
                    fontWeight: t === j.activeStage ? 600 : 400,
                    children: i,
                  },
                  e.key,
                );
          }),
        X &&
          (0, y.jsxs)(`text`, {
            "data-route-folded-label": ``,
            x: b(X.x, 44, S - 44),
            y: M - 27,
            textAnchor: `middle`,
            fill: `var(--ink-3)`,
            fontSize: `12`,
            children: [`+`, X.stages, ` stages `],
          }),
        j.mode === `folded` &&
          B &&
          (0, y.jsx)(`text`, {
            "data-route-folded-stage-label": ``,
            x: `12`,
            y: M - 12,
            fill: `var(--ink)`,
            fontSize: `12`,
            fontWeight: `600`,
            children: q + ` `,
          }),
        j.mode === `folded` &&
          (0, y.jsx)(`text`, {
            x: S - 12,
            y: M - 12,
            textAnchor: `end`,
            fill: `var(--ink-3)`,
            fontSize: `12`,
            children: H + ` `,
          }),
      ],
    }),
    Q =
      s(e.title) +
      `: ` +
      e.done +
      ` of ` +
      e.total +
      ` checkpoints, ` +
      (N?.code ?? ``) +
      `. Arrow keys select; Enter opens.`;
  return (0, y.jsx)(`div`, {
    ref: x,
    "data-route": ``,
    "data-route-mode": n,
    "data-route-layout": j.mode,
    "data-route-stage-count": k.length,
    className: `min-w-0 w-full`,
    children:
      n === `today`
        ? (0, y.jsx)(i, {
            to: `/p/` + e.slug + `/cp/` + encodeURIComponent(t[D].code),
            "aria-label": s(e.title) + `: open current checkpoint ` + t[D].code,
            className: `block min-h-[64px] w-full rounded-ctl focus-visible:outline-2 focus-visible:outline-[var(--accent)]`,
            children: Z,
          })
        : (0, y.jsxs)(y.Fragment, {
            children: [
              (0, y.jsx)(`button`, {
                type: `button`,
                "aria-label": Q,
                onClick: z,
                onKeyDown: R,
                className: `block min-h-[80px] w-full rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)]`,
                children: Z,
              }),
              (0, y.jsxs)(`div`, {
                "data-route-now": ``,
                "data-route-due-on": A[O]?.dueOn ?? void 0,
                "data-route-schedule-state": A[O]?.state ?? `unscheduled`,
                className: `flex min-w-0 items-center gap-1 border-t border-[var(--hair)] pt-1`,
                children: [
                  (0, y.jsx)(`button`, {
                    type: `button`,
                    "aria-label": `Previous checkpoint`,
                    disabled: O === 0,
                    onClick: () => L(-1),
                    className: `flex h-11 w-9 shrink-0 items-center justify-center rounded-ctl text-2xl text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-25`,
                    children: `‹`,
                  }),
                  (0, y.jsxs)(`button`, {
                    type: `button`,
                    "aria-label":
                      `Open checkpoint ` + N.code + ` ` + s(N.title),"data-style":"role-open-checkpoint",
                    onClick: () => I(),
                    className: `group flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-ctl px-0.5 text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)]`,
                    children: [
                      (0, y.jsx)(`span`, {
                        "data-code": ``,
                        className: `shrink-0 font-[var(--font-num)] text-[12px] font-medium tabular-nums text-[var(--accent)]`,
                        children: N.code,
                      }),
                      (0, y.jsx)(`span`, {
                        className: `min-w-0 flex-1 break-words text-[16px] leading-snug text-ink`,
                        children: (0, y.jsx)(d, { source: N.title }),
                      }),
                      (0, y.jsxs)(`span`, {
                        className: `shrink-0 text-[11px] tabular-nums text-ink-3`,
                        children: [
                          N.ui === `proposed` ? `Proposed · ` : ``,
                          P, ` of `, e.total,
                        ],
                      }),
                    ],
                  }),
                  (0, y.jsx)(`button`, {
                    type: `button`,
                    "aria-label": `Next checkpoint`,
                    disabled: O === E - 1,
                    onClick: () => L(1),
                    className: `flex h-11 w-9 shrink-0 items-center justify-center rounded-ctl text-2xl text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-25`,
                    children: `›`,
                  }),
                ],
              }),
              F &&
                (0, y.jsx)(`p`, {
                  "data-schedule-detail": ``,
                  className: `mt-1 min-w-0 text-[12px] leading-[18px] text-ink-2`,
                  children: F,
                }),
              K &&
                (0, y.jsxs)(`details`, {
                  "data-route-stage-disclosure": ``,
                  className: `mt-2 min-w-0 text-ink`,
                  children: [
                    (0, y.jsx)(`summary`, {
                      className: `flex min-h-11 cursor-pointer items-center text-[12px] text-ink-2`,
                      children: `Show full stage name`,
                    }),
                    (0, y.jsx)(`div`, {
                      className: `min-w-0 overflow-x-auto break-words pb-2 text-[16px]`,
                      children: (0, y.jsx)(d, { source: U }),
                    }),
                  ],
                }),
            ],
          }),
  });
}
export { x as t };
