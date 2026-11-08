import {ReviewOutlook as LemmaReviewOutlook} from "@lemma/ReviewOutlook-KIo9eEhV.js";
import {g as LemmaSheet} from "@lemma/index-DcUkykC4.js";
import {getLemmaBatch} from "@lemma/index-DcUkykC4.js";
import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import {
  A as t,
  B as n,
  Ct as r,
  F as i,
  I as a,
  J as o,
  Kt as s,
  Nt as c,
  P as l,
  R as u,
  Y as d,
  _t as ee,
  ot as te,
  qt as ne,
  rt as re,
  st as ie,
  zt as f,
} from "@lemma/index-DcUkykC4.js";
import { n as p, t as m } from "@lemma/jsx-runtime-DApVmHJR.js";
import { p as h, t as ae } from "@lemma/data-HD2KrcdX.js";
import { s as oe } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as g } from "@lemma/clock-3-DnZdQxj3.js";
import { t as _ } from "@lemma/play-DwFWW3fX.js";
import { t as v } from "@lemma/createLucideIcon-C9eAT1Le.js";
import { n as se } from "@lemma/insights-DjL4G0LE.js";
import { t as y } from "@lemma/Button-DTRYSO-L.js";
import { n as ce, t as b } from "@lemma/Check-Cuu8pd38.js";
import { t as le } from "@lemma/Chip-AHlDYqiR.js";
import { t as x } from "@lemma/store-3lADaAh6.js";
import { n as lemmaEstimateMinutes } from "@lemma/insights-DjL4G0LE.js"; /* v9: Review timer actions belong to the Review route, not a DOM insertion. */
function LemmaReviewSessionOptions() {
  const get = () => window.__carrelIntegration?.getPreferences?.() || {};
  const [prefs, setPrefs] = (0, w.useState)(get);
  const reviewHistory = ie(30);
  (0, w.useEffect)(() => {
    const sync = () => setPrefs(get());
    window.addEventListener("lemma:integrationchange", sync);
    sync();
    return () => window.removeEventListener("lemma:integrationchange", sync);
  }, []);
  if (!prefs.reviewOffer) return null;
  return (0, E.jsxs)("details", {
    className: "lemma-review-integration",
    "aria-label": "Review timer and calendar",
    children: [
      (0,E.jsx)("summary",{className:"min-h-11 cursor-pointer text-label font-semibold text-ink",children:"Review timer & calendar"}),
      (0, E.jsxs)("div", {
        children: [
          (0, E.jsx)("p", {
            children:
              "Optional timing and reservation. Starting another session may replace your current focus; check it before starting.",
          }),
        ],
      }),
      (0, E.jsxs)("div", {
        className: "lemma-review-integration-actions",
        children: [
          (0, E.jsx)("button", {
            type: "button",
            onClick: () =>
              window.__carrelIntegration?.open?.("timer", null, {
                reviewSession: true,
                minutes: lemmaEstimateMinutes(getLemmaBatch().count??0,reviewHistory.data?.reviews??[]),
              }),
            children: "Start review timer",
          }),
          (window.__lemmaSessionStore?.get?.()?.running || window.__lemmaSessionStore?.get?.()?.paused) && (0,E.jsx)("button",{type:"button",onClick:()=>{if(window.__lemmaSessionStore?.get?.()?.paused)window.__carrelIntegration?.open?.("timer","resume");window.__carrelIntegration?.open?.("timer","focus");},children:"Continue current timer"}),
          (0, E.jsx)("button", {
            type: "button",
            onClick: () =>
              window.__carrelIntegration?.open?.("plan", null, {
                reviewBlock: true,
                minutes: lemmaEstimateMinutes(getLemmaBatch().count??0,reviewHistory.data?.reviews??[]),
              }),
            children: "Reserve review time",
          }),
        ],
      }),
    ],
  });
}
var S = {
  name: `shuffle`,
  size: 24,
  node: [
    [`path`, { d: `m18 14 4 4-4 4`, key: `10pe0f` }],
    [`path`, { d: `m18 2 4 4-4 4`, key: `pucp1d` }],
    [
      `path`,
      {
        d: `M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22`,
        key: `1ailkh`,
      },
    ],
    [`path`, { d: `M2 6h1.972a4 4 0 0 1 3.6 2.2`, key: `km57vx` }],
    [`path`, { d: `M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45`, key: `os18l9` }],
  ],
};
S.node;
var C = v(S),
  w = e(p(), 1);
function T(e) {
  return e?.some((e) => e.sessionNumber !== null) ?? !1;
}
function ue(e, t) {
  let n = new Map();
  for (let e of t) {
    if (e.sessionNumber === null) continue;
    let t = n.get(e.projectSlug);
    (t || ((t = new Map()), n.set(e.projectSlug, t)),
      t.set(e.sessionNumber, (t.get(e.sessionNumber) ?? 0) + 1));
  }
  let r = [];
  for (let t of e) {
    let e = n.get(t.projectSlug)?.get(t.number) ?? 0;
    if (e && (r.push({ ...t, count: e }), r.length === 3)) break;
  }
  return r;
}
var E = m(),
  D = {
    decks: [],
    sessionId: null,
    conceptSlug: null,
    includeNew: !0,
    newOnly: !1,
  };
function de(e, t, n) {
  return e.filter((e) => {
    let r = t.find((t) => t.key === `project:` + e.projectSlug);
    return r
      ? r.children.filter((e) => e.due > 0).length && e.checkpointCode
        ? n.has(`cp:` + e.projectSlug + `:` + e.checkpointCode)
        : n.has(r.key)
      : !1;
  });
}
function LemmaReviewDeckRow({deck,checked,onChange,expanded,onExpand,child=false}){
 return (0,E.jsxs)('div',{className:'lemma-deck-row'+(child?' is-child':''),children:[
  (0,E.jsx)('div',{className:'lemma-deck-select',children:(0,E.jsx)(b,{checked,disabled:deck.due===0,onChange,label:(0,E.jsxs)('span',{className:'lemma-deck-description'+(deck.glyph?' has-glyph':''),children:[deck.glyph&&(0,E.jsx)(i,{size:28,subject:deck.glyph}),(0,E.jsx)('span',{children:deck.label}),(0,E.jsx)('small',{children:deck.due.toLocaleString()+' due'})]})})}),
  onExpand&&(0,E.jsx)('button',{type:'button',className:'lemma-deck-expand','aria-label':(expanded?'Collapse ':'Expand ')+deck.label,'aria-expanded':expanded,onClick:onExpand,children:(0,E.jsx)(expanded?ne:s,{size:18,'aria-hidden':true})})
 ]});
}
function O() {
  const pausedRound=x.getState().pausedRound&&x.getState().current;
  const [forecastOpen,setForecastOpen]=(0,w.useState)(false);
  const [optionsOpen,setOptionsOpen]=(0,w.useState)(false);
  const [budgetOpen,setBudgetOpen]=(0,w.useState)(false);
  const [batch,setBatch]=(0,w.useState)(()=>Number(localStorage.getItem("lemma.review.batch"))||33);
  let e = oe(),
    p = d(),
    m = re(),
    v = te(),
    S = r(),
    O = ee(D),
    fe = ie(30),
    k = h({
      queryKey: [`sessions`, `all`],
      queryFn: () => ae().listSessions(),
      enabled: T(O.data),
      staleTime: 3e4,
      refetchOnWindowFocus: !0,
    }),
    A = c(),
    [j, M] = (0, w.useState)(() =>
      Number(localStorage.getItem(`lemma.catch-up-until`) || 0),
    ),
    N = j > Date.now();
  (0, w.useEffect)(() => {
    if (!j || j > Date.now() || !S.data) return;
    let e = Number(localStorage.getItem(`lemma.catch-up-original`) || 200);
    (localStorage.removeItem(`lemma.catch-up-until`),
      localStorage.removeItem(`lemma.catch-up-original`),
      M(0),
      S.data.reviewsPerDay !== e && A.mutate({ reviewsPerDay: e }));
  }, [j, S.data?.reviewsPerDay]);
  function P(e) {
    if (!S.data || N) return;
    let t = S.data.reviewsPerDay || 200,
      n = batch;
    localStorage.setItem(`lemma.catch-up-original`, String(t));
    let r = Date.now() + 6048e5;
    (localStorage.setItem(`lemma.catch-up-until`, String(r)),
      M(r),
      A.mutate(
        { reviewsPerDay: n },
        {
          onSuccess: () => {
            (O.refetch(), p(`Today’s batch is the daily catch-up target for seven days`));
          },
          onError: () => {
            (localStorage.removeItem(`lemma.catch-up-until`),
              localStorage.removeItem(`lemma.catch-up-original`),
              M(0),
              p(`Could not set catch-up target`, { tone: `danger` }));
          },
        },
      ));
  }
  let [deckLimit,setDeckLimit] = (0,w.useState)(8),
      [F, I] = (0, w.useState)(()=>{try{const saved=JSON.parse(localStorage.getItem('lemma.review.selection')||'null');return Array.isArray(saved?.selectedKeys)?new Set(saved.selectedKeys):null}catch{return null}}),
    [L, R] = (0, w.useState)(() => new Set()),
    [z, B] = (0, w.useState)(() => new Set()),
    [V, pe] = (0, w.useState)(``),
    H = (e, t = !1) => {
      (t ? B : R)((t) => {
        let n = new Set(t);
        return (n.has(e) ? n.delete(e) : n.add(e), n);
      });
    },
    U = (0, w.useMemo)(
      () =>
        F ??
        new Set([
          ...(m.data ?? []).filter((e) => e.due > 0).map((e) => e.key),
          ...(m.data ?? []).flatMap((e) =>
            e.children.filter((e) => e.due > 0).map((e) => e.key),
          ),
        ]),
      [m.data, F],
    ),
    W = (m.data ?? []).filter(
      (e) => e.due > 0 || e.children.some((e) => e.due > 0),
    ),
    me = W.filter(
      (e) =>
        !V ||
        e.label.toLowerCase().includes(V.toLowerCase()) ||
        e.children.some((e) => e.label.toLowerCase().includes(V.toLowerCase())),
    ),
    G = (0, w.useMemo)(() => de(O.data ?? [], W, U), [O.data, W, U]),
    K = G.length,
    q = W.reduce((e, t) => {
      let n = t.children.filter((e) => e.due > 0),
        r = n.reduce((e, t) => e + t.due, 0);
      return (
        e +
        (U.has(t.key) ? Math.max(0, t.due - r) : 0) +
        n.reduce((e, t) => e + (U.has(t.key) ? t.due : 0), 0)
      );
    }, 0),
    J = Math.min(K, Math.max(1,batch)),
    Y = Math.max(0, q - J),
    X = Math.ceil(Y / Math.max(1,batch)),
    Z = fe.data?.reviews ?? [],
    he = lemmaEstimateMinutes(J,fe.data?.reviews??[]),
    Q = (0, w.useMemo)(
      () => (T(O.data) ? ue(k.data ?? [], G) : []),
      [k.data, G, O.data],
    ),
    ge = (e, t) => {
      let n = new Set(U),
        r = [e.key, ...e.children.map((e) => e.key)];
      for (let e of r) t ? n.add(e) : n.delete(e);
      I(n);
    },
    _e = (e, t, n) => {
      let r = new Set(U);
      (n ? r.add(t.key) : r.delete(t.key),
        e.children.filter((e) => e.due > 0).every((e) => r.has(e.key))
          ? r.add(e.key)
          : r.delete(e.key),
        I(r));
    };
  (0,w.useEffect)(()=>{
    const status=O.error||m.error?'error':O.isPending||m.isPending?'loading':'ready';
    const snapshot={status,loadState:status,asOf:new Date().toISOString(),budget:batch,count:J,totalDue:W.reduce((sum,deck)=>sum+deck.due,0),selectedKeys:F===null?null:[...U],scope:'selected-decks',provenance:'demo',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
    const serialized=JSON.stringify(snapshot);
    if(localStorage.getItem('lemma.review.selection')!==serialized){localStorage.setItem('lemma.review.selection',serialized);window.dispatchEvent(new Event('lemma:review-selection'))}
  },[J,q,batch,F,U,O.error,O.isPending,m.error,m.isPending,m.data,O.data]);
  function $(t = null, n = !1) {
    if (!S.data || !O.data || !m.data) return;
    let r = { ...D, sessionId: t, includeNew: !0, newOnly: n, decks: [] },
      i = Q.find((e) => e.id === t),
      a = t
        ? G.filter(
            (e) =>
              e.projectSlug === i?.projectSlug && e.sessionNumber === i?.number,
          )
        : G,
      o = (n ? a.filter((e) => e.state.state === 0) : a).slice(
        0,
        batch,
      );
    if (!o.length) return p(`No cards due in this selection`);
    let s = v.data?.resume;
    x.getState().initialize(
      o,
      S.data,
      r,
      s
        ? { projectSlug: s.projectSlug, checkpointCode: s.checkpointCode }
        : void 0,
    );
    let c = new URLSearchParams();
    (t && c.set(`session`, t),
      n && c.set(`new`, `1`),
      e(`/review/run` + (c.size ? `?` + c.toString() : ``)));
  }
  return (
    (0, w.useEffect)(() => {
      (O.error || m.error) &&
        p(`Couldn't load your review decks.`, { tone: `danger` });
    }, [O.error, m.error, p]),
    m.isPending || S.isPending || O.isPending
      ? (0, E.jsxs)(n, {
          title: `Review`,
          tabBar: !0,
          actions: (0, E.jsx)(a, {
            icon: f,
            label: `Card library`,
            to: `/cards`,
          }),
          children: [
            (0, E.jsxs)(u, {
              className: `flex flex-col gap-4 p-6`,
              children: [
                (0, E.jsx)(l, { h: 75, w: `55%` }),
                (0, E.jsx)(l, { h: 50 }),
              ],
            }),
            (0, E.jsx)(l, { h: 52 }),
            (0, E.jsx)(l, { h: 56 }),
          ],
        })
      : (0, E.jsx)(n, {
          title: `Review`,
          tabBar: !0,
          actions: (0, E.jsx)(a, {
            icon: f,
            label: `Card library`,
            to: `/cards`,
          }),
          children:
            m.error || O.error || S.error
              ? (0, E.jsx)(t, {
                  art: `plug`,
                  title: `Your decks could not load`,
                  body: `Check your connection and try again.`,
                  action: {
                    label: `Try again`,
                    onClick: () => {
                      (m.refetch(), O.refetch(), S.refetch());
                    },
                  },
                })
              : (0, E.jsxs)(E.Fragment, {
                  children: [
                    (0,E.jsxs)(`section`,{className:`notebook-review-summary`,"aria-label":`Review summary`,children:[
                      (0,E.jsx)(`p`,{className:`notebook-eyebrow`,children:`A SMALL SESSION, LASTING IDEAS`}),
                      (0,E.jsx)(`h2`,{children:pausedRound?'Continue your review':J?`${J.toLocaleString()} cards for today`:`You’re up to date`}),
                      (0,E.jsx)(`p`,{className:`notebook-review-estimate`,children:pausedRound?`Your answers are saved. Pick up where you paused.`:J?`About ${he} min · at your pace`:`No cards due in the selected decks.`}),
                      (0,E.jsx)(y,{"aria-label":pausedRound?`Resume review`:`Start review`,icon:_,disabled:!J&&!pausedRound,onClick:()=>{if(pausedRound){x.setState({pausedRound:false});e('/review/run')}else $()},className:`w-full`,children:pausedRound?'Resume review':'Start review'}),
                      (0,E.jsxs)(`div`,{className:`notebook-budget-row`,children:[
                        (0,E.jsxs)(`span`,{children:[(0,E.jsx)(`strong`,{children:`Today’s batch`}),(0,E.jsx)(`small`,{children:`Up to ${batch} cards`})]}),
                        (0,E.jsx)(`button`,{type:`button`,onClick:()=>setBudgetOpen(true),children:`Change`}),
                      ]}),
                    ]}),
                    (0,E.jsxs)(`button`,{type:`button`,className:`notebook-options-row`,onClick:()=>setOptionsOpen(true),children:[
                      (0,E.jsxs)(`span`,{children:[(0,E.jsx)(`strong`,{children:`Decks & options`}),(0,E.jsx)(`small`,{children:`${W.filter(deck=>U.has(deck.key)||deck.children.some(child=>U.has(child.key))).length} decks selected · ${S.data?.mixDecks?`Mixed order`:`Deck order`}`})]}),
                      (0,E.jsx)(`span`,{"aria-hidden":true,children:`›`}),
                    ]}),
                    (0,E.jsxs)(`details`,{className:`notebook-queue-details`,children:[
                      (0,E.jsx)(`summary`,{children:`Queue details · ${W.reduce((sum,deck)=>sum+deck.due,0).toLocaleString()} due across all decks`}),
                      (0,E.jsx)(`p`,{children:`Today’s batch is a small part of the full queue. ${q.toLocaleString()} cards are due in your selected decks.`}),
                      Y>0&&(0,E.jsx)(`p`,{children:`Catch-up estimate: ${X.toLocaleString()} more sessions after today at ${batch} cards each. Assumes no new due cards or repeated attempts; future arrivals can extend this.`}),
                      Y>0&&(0,E.jsx)(`button`,{type:`button`,className:`notebook-text-button`,onClick:()=>P(q),disabled:N||A.isPending,children:N?`Catch-up budget active for seven days`:`Use this budget for 7 days`}),
                      (0,E.jsxs)(`details`,{className:`notebook-review-outlook`,onToggle:event=>setForecastOpen(event.currentTarget.open),children:[(0,E.jsx)(`summary`,{children:`Seven-day outlook & due by deck`}),forecastOpen&&(0,E.jsx)(LemmaReviewOutlook,{})]}),
                      (0,E.jsx)(LemmaReviewSessionOptions,{}),
                    ]}),
                    (0,E.jsxs)(LemmaSheet,{open:budgetOpen,onClose:()=>setBudgetOpen(false),title:`Today’s review batch`,children:[
                      (0,E.jsx)(`p`,{className:`text-ink-2`,children:`Choose a comfortable amount. You can always do another session.`}),
                      (0,E.jsx)(`div`,{className:`notebook-budget-choices`,children:[22,33,50,55,100,200].map(count=>(0,E.jsxs)(`button`,{type:`button`,"aria-pressed":batch===count,onClick:()=>{setBatch(count);localStorage.setItem(`lemma.review.batch`,String(count));window.dispatchEvent(new Event(`lemma:review-selection`));setBudgetOpen(false)},children:[(0,E.jsx)(`strong`,{children:`${count} cards`}),(0,E.jsx)(`small`,{children:`About ${lemmaEstimateMinutes(count,fe.data?.reviews??[])} min`})]},count))}),
                    ]}),
                    (0,E.jsxs)(LemmaSheet,{open:optionsOpen,onClose:()=>setOptionsOpen(false),title:`Decks & options`,children:[
                      (0, E.jsx)(`div`, {
                          className: `mt-5 border-t border-edge pt-3`,
                          children: (0, E.jsxs)(`div`, {
                            className: `flex items-center gap-2`,
                            children: [
                              (0, E.jsx)(C, {
                                size: 18,
                                "aria-hidden": `true`,
                                className: `text-amber`,
                              }),
                              (0, E.jsx)(`div`, {
                                className: `flex-1`,
                                children: (0, E.jsx)(ce, {
                                  checked: S.data?.mixDecks ?? !0,
                                  label: `Mix decks`,
                                  onChange: (e) => {
                                    A.mutate(
                                      { mixDecks: e },
                                      {
                                        onError: () =>
                                          p(
                                            `Could not update review settings`,
                                            { tone: `danger` },
                                          ),
                                      },
                                    );
                                  },
                                }),
                              }),
                            ],
                          }),
                        }),
                    (0, E.jsxs)(`section`, {
                      "aria-label": `Decks`,"data-style":"role-decks",
                      className: `flex flex-col gap-1`,
                      children: [
                        (0, E.jsx)(o, {
                          className: `mb-2 text-ink`,
                          children: `Decks`,
                        }),
                        W.length > 8 &&
                          (0, E.jsxs)(`label`, {
                            className: `mb-2 flex min-h-11 items-center gap-2 rounded-ctl border border-edge bg-well px-3 text-ink-3`,
                            children: [
                              (0, E.jsx)(f, { size: 17 }),
                              (0, E.jsx)(`span`, {
                                className: `sr-only`,
                                children: `Search decks`,
                              }),
                              (0, E.jsx)(`input`, {
                                value: V,
                                onChange: (e) => pe(e.target.value),
                                placeholder: `Find project or checkpoint`,
                                className: `min-w-0 flex-1 bg-transparent text-body text-ink outline-none`,
                              }),
                            ],
                          }),
                        me.length > 8 && (0,E.jsxs)(`div`,{"data-ui":`deck-pagination`,className:`flex flex-wrap items-center justify-between gap-2 py-2 text-label text-ink-2`,children:[
                          (0,E.jsx)(`span`,{children:`Showing ${Math.min(deckLimit,me.length)} of ${me.length} decks`}),
                          (0,E.jsx)(`button`,{type:`button`,className:`min-h-11 rounded-ctl border border-edge px-3 font-semibold`,onClick:()=>setDeckLimit(v=>v>=me.length?8:Math.min(me.length,v+8)),children:deckLimit>=me.length?`Show first 8 decks`:`Show ${Math.min(8,me.length-deckLimit)} more decks`})
                        ]}),
                        me.slice(0,deckLimit).map((e) => {
                          let t = e.children.filter((e) => e.due > 0),
                            n = L.has(e.key) || !!V,
                            r = V
                              ? t.filter(
                                  (t) =>
                                    e.label
                                      .toLowerCase()
                                      .includes(V.toLowerCase()) ||
                                    t.label
                                      .toLowerCase()
                                      .includes(V.toLowerCase()),
                                )
                              : t,
                            a = z.has(e.key) ? r : r.slice(0, 5),
                            o = t.length
                              ? t.map((e) => U.has(e.key))
                              : [U.has(e.key)],
                            c = o.every(Boolean)
                              ? !0
                              : o.some(Boolean)
                                ? `mixed`
                                : !1;
                          return (0, E.jsxs)(
                            `div`,
                            {
                              className: `border-b border-edge/70 pb-2`,
                              children: [
                                (0,E.jsx)(LemmaReviewDeckRow,{deck:e,checked:c,onChange:next=>ge(e,next),expanded:n,onExpand:t.length?()=>H(e.key):undefined}),
                                n &&
                                  a.map((t) =>
                                    (0,E.jsx)(LemmaReviewDeckRow,{deck:{...t,label:t.key.split(`:`).at(-1)+' · '+t.label},checked:U.has(t.key),onChange:next=>_e(e,t,next),child:true}),
                                  ),
                                n &&
                                  r.length > 5 &&
                                  (0, E.jsx)(`button`, {
                                    type: `button`,
                                    className: `ml-7 min-h-11 text-label font-semibold text-amber`,
                                    onClick: () => H(e.key, !0),
                                    children: z.has(e.key)
                                      ? `Show first 5`
                                      : r.length - 5 + ` more checkpoints`,
                                  }),
                              ],
                            },
                            e.key,
                          );
                        }),
                      ],
                    }),
                      (0,E.jsx)(y,{className:`mt-4 w-full`,onClick:()=>setOptionsOpen(false),children:`Done`}),
                    ]}),
                    Q.length > 0 &&
                      (0, E.jsxs)(`section`, {
                        "aria-label": `From sessions`,"data-style":"role-from-sessions",
                        className: `flex flex-col gap-3`,
                        children: [
                          (0, E.jsx)(o, {
                            className: `text-ink`,
                            children: `From sessions`,
                          }),
                          (0, E.jsx)(`div`, {
                            className: `flex flex-wrap gap-2`,
                            children: Q.map((e) =>
                              (0, E.jsxs)(
                                le,
                                {
                                  tone: `quiet`,
                                  size: 40,
                                  className: `max-w-full min-w-0`,
                                  onClick: () => $(e.id),
                                  children: [
                                    (0, E.jsx)(`span`, {
                                      className: `min-w-0 max-w-[min(16rem,60vw)] truncate`,
                                      children: `S` + e.number + ` · ` + e.goal,
                                    }),
                                    (0, E.jsx)(`span`, {
                                      className: `tabular-nums text-ink-3`,
                                      children: e.count,
                                    }),
                                  ],
                                },
                                e.id,
                              ),
                            ),
                          }),
                        ],
                      }),
                    K === 0 &&
                      (0, E.jsx)(`p`, {
                        className: `text-label text-ink-3`,
                        children: `No cards due in these decks. Choose another deck or return tomorrow.`,
                      }),
                  ],
                }),
        })
  );
}
export { O as default };
