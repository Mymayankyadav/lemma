import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { n as t, t as n } from "@lemma/jsx-runtime-DApVmHJR.js";
import { f as r, t as i } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { n as a, r as o, t as s } from "@lemma/createLucideIcon-C9eAT1Le.js";
import { n as c, t as l } from "@lemma/use-transform-B_3Z_OCO.js";
import { t as u } from "@lemma/check-BXZ7pTLx.js";
import { t as d } from "@lemma/pencil-line-0O_XRBVL.js";
import { t as f } from "@lemma/sparkles-BT_hGLVy.js";
import {
  A as p,
  B as m,
  F as h,
  Lt as g,
  P as _,
  Q as v,
  R as y,
  Vt as b,
  Y as x,
  g as S,
  ht as ee,
  pt as te,
  NotebookActionBar,
} from "@lemma/index-DcUkykC4.js";
import { t as ne } from "@lemma/arrow-right-ydNMW8Db.js";
import { t as C } from "@lemma/Button-DTRYSO-L.js";
import { t as w } from "@lemma/Card-nFooZijf.js";
import { t as T } from "@lemma/MathText-BeTkDDIi.js";
import { t as E } from "@lemma/Tex-kn8bVMsW.js";
import { t as D } from "@lemma/Segmented-DV1qg3lc.js";
var O = {
  name: `link`,
  size: 24,
  node: [
    [
      `path`,
      {
        d: `M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71`,
        key: `1cjeqo`,
      },
    ],
    [
      `path`,
      {
        d: `M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71`,
        key: `19qd67`,
      },
    ],
  ],
};
O.node;
var re = s(O),
  k = e(t(), 1);
function A(e) {
  let t = new Map();
  for (let n of e) {
    let e =
        n.card?.checkpoint ??
        n.plan?.checkpoints[0]?.code ??
        n.planChange?.ops
          .map((e) => (`code` in e ? e.code : null))
          .find(Boolean) ??
        null,
      r = typeof e == `string` && e.trim() ? e.trim() : `General`,
      i = n.sessionNumber === null ? `No session` : `S${n.sessionNumber}`,
      a = JSON.stringify([n.projectSlug, i, r, n.kind]),
      o = t.get(a);
    (o ||
      ((o = {
        key: a,
        label: `${i} / ${r} · ${n.kind === `card_edit` ? `Card edits` : n.kind === `card` ? `New cards` : `Plan`}`,
        project: n.projectSlug,
        proposals: [],
      }),
      t.set(a, o)),
      o.proposals.push(n));
  }
  return [...t.values()];
}
function j(e, t) {
  return e.slice(0, Math.max(0, t));
}
function M(e) {
  let t = e
      .replace(
        /\r\n?/g,
        `
`,
      )
      .split(
        `
`,
      )
      .map((e) => e.trim())
      .filter(Boolean),
    n = t[0];
  if (!n) return ``;
  if (n === `$$` || n === `\\[`) {
    let e = n === `$$` ? `$$` : `\\]`,
      r = t.indexOf(e, 1),
      i = t
        .slice(1, r < 0 ? void 0 : r)
        .find((e) => !/^\\(?:begin|end)\{/.test(e))
        ?.replace(/\\\\\s*$/, ``)
        .replace(/&/g, ``)
        .trim();
    return i ? `$` + i + `$` : `Mathematical expression`;
  }
  let r = /^\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}$/.exec(
    n,
  )?.[1];
  if (r) {
    let e = `\\end{` + r + `}`,
      n = t.indexOf(e, 1),
      i = t
        .slice(1, n < 0 ? void 0 : n)
        .find((e) => !/^\\(?:begin|end|label|tag|notag)\b/.test(e))
        ?.replace(/\\\\\s*$/, ``)
        .replace(/&/g, ``)
        .trim();
    return i ? `$` + i + `$` : `Mathematical expression`;
  }
  return (n.startsWith(`$$`) && n.endsWith(`$$`) && n.length > 4) ||
    (n.startsWith(`\\[`) && n.endsWith(`\\]`) && n.length > 4)
    ? `$` + n.slice(2, -2).trim() + `$`
    : n;
}
var N = n();
function ie(e) {
  switch (e.op) {
    case `add`:
      return `Add ${e.code ?? `checkpoint`} · ${e.title}${e.after ? ` after ${e.after}` : ``}`;
    case `update`:
      return `Update ${e.code}${e.title ? ` · ${e.title}` : ``}`;
    case `remove`:
      return `Remove ${e.code}`;
    case `move`:
      return `Move ${e.code} after ${e.after}`;
    case `prereq_add`:
      return `${e.code} needs ${e.prereq}`;
    case `prereq_remove`:
      return `${e.code} no longer needs ${e.prereq}`;
  }
}
var P = (e) =>
  e.replaceAll(`-`, ` `).replace(/\b[a-z]/g, (e) => e.toUpperCase());
function ae({ source: e }) {
  let t = (0, k.useRef)(null),
    [n, r] = (0, k.useState)(!1),
    [i, a] = (0, k.useState)(!1),
    o = M(e),
    s = () => {
      let e = t.current;
      if (!e) return;
      let n = e.scrollWidth > e.clientWidth + 1;
      (r(n && e.scrollLeft > 1),
        a(n && e.scrollLeft + e.clientWidth < e.scrollWidth - 1));
    };
  return (
    (0, k.useEffect)(() => {
      s();
      let e = t.current;
      if (!e || typeof ResizeObserver > `u`) return;
      let n = new ResizeObserver(s);
      return (
        n.observe(e),
        e.firstElementChild && n.observe(e.firstElementChild),
        () => n.disconnect()
      );
    }, [o]),
    (0, N.jsxs)(`span`, {
      className: `relative block min-w-0 flex-1`,
      children: [
        (0, N.jsx)(`span`, {
          ref: t,
          "data-proposal-front-scroll": ``,
          onScroll: s,
          className: `block w-full overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`,
          style: i
            ? {
                maskImage: `linear-gradient(to right, black calc(100% - 24px), transparent)`,
              }
            : void 0,
          title:
            n || i ? `Scroll sideways to read the full first line` : void 0,
          children: (0, N.jsx)(E, {
            source: o,
            className: `!inline-block !min-w-max !max-w-none !whitespace-nowrap ![overflow-wrap:normal] [&_.katex]:!text-[1em]`,
          }),
        }),
        (n || i) &&
          (0, N.jsx)(`span`, {
            "data-proposal-front-cue": ``,
            "aria-hidden": `true`,
            className:
              `pointer-events-none absolute top-1/2 -translate-y-1/2 text-label text-ink-2 ` +
              (i ? `right-0` : `left-0`),
            children: i ? `›` : `‹`,
          }),
      ],
    })
  );
}
function oe({ proposal: e, busy: t, commit: n }) {
  let r = !!o(),
    i = c(0),
    s = l(i, [-300, 300], [-15, 15]),
    d = l(i, [0, 55], [0, 1]),
    p = l(i, [-55, 0], [1, 0]),
    [m, h] = (0, k.useState)(!1),
    _ = (0, k.useRef)(null),
    v = e.card,
    y = e.cardEdit,
    b =
      v?.front ?? (m ? y?.current.front : (y?.front ?? y?.current.front)) ?? ``,
    x = v?.back ?? (m ? y?.current.back : (y?.back ?? y?.current.back)) ?? ``;
  return (0, N.jsx)(a.div, {
    ref: _,
    drag: !1,
    dragConstraints: { left: 0, right: 0 },
    dragElastic: 0.6,
    style: { x: i, rotate: r ? 0 : s, touchAction: `pan-y` },
    onDragEnd: (e, t) => {
      let r = _.current?.getBoundingClientRect().width ?? 300;
      (Math.abs(t.offset.x) > r * 0.3 || Math.abs(t.velocity.x) > 600) &&
        n((Math.abs(t.offset.x) > r * 0.3 ? t.offset.x : t.velocity.x) > 0);
    },
    initial: r ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: r ? 0.15 : 0.55 },
    "aria-label": `Proposal card, use the labeled Approve or Reject buttons below`,
    children: (0, N.jsxs)(w, {
      id: "lemma-proposal-detail", tabIndex:-1, className: `rounded-slab p-5`,
      children: [
        (0, N.jsxs)(`div`, {
          className: `flex items-center gap-2 text-label font-medium text-ink-3`,
          children: [
            (0, N.jsx)(f, { size: 15, className: `text-amber` }),
            (0, N.jsx)(`span`, {
              children: y ? `Fix for N${y.note_no}` : (v?.kind ?? `Card`),
            }),
            (0, N.jsxs)(`span`, {
              className: `ml-auto`,
              children: [
                e.projectGlyph,
                ` `,
                v?.checkpoint,
                ` `,
                e.sessionNumber ? ` · S${e.sessionNumber}` : ``,
              ],
            }),
          ],
        }),
        y &&
          (0, N.jsx)(`div`, {
            className: `mt-4`,
            children: (0, N.jsx)(D, {
              label: `Card version`,
              value: m ? `before` : `after`,
              onChange: (e) => h(e === `before`),
              options: [
                { value: `before`, label: `Before` },
                { value: `after`, label: `After` },
              ],
            }),
          }),
        (0, N.jsx)(`div`, {
          className: `mt-6 font-math`,
          children: (0, N.jsx)(T, {
            source: b,
            variant: `card`,
            cloze: v?.type === `cloze` ? { ord: 1, revealed: !1 } : void 0,
          }),
        }),
        (0, N.jsx)(`div`, {
          "aria-hidden": `true`,
          className: `my-5 h-px bg-amber-line`,
        }),
        (0, N.jsx)(T, {
          source: x,
          variant: `answer`,
          cloze: v?.type === `cloze` ? { ord: 1, revealed: !0 } : void 0,
        }),
        y?.comments
          .filter((e) => y.resolves?.includes(e.no))
          .map((e) =>
            (0, N.jsxs)(
              `p`,
              {
                className: `mt-5 text-label text-ink-3`,
                children: [`Your note: `, e.body],
              },
              e.no,
            ),
          ),
        e.reason &&
          (0,N.jsxs)(`details`,{className:`mt-6 rounded-ctl border border-edge bg-[var(--paper)] px-3 text-label text-ink-2`,children:[
            (0,N.jsxs)(`summary`,{className:`flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-ink`,children:[
              (0,N.jsx)(f,{size:15,className:`text-amber`,"aria-hidden":true}),`Why this card?`]}),
            (0,N.jsx)(`p`,{className:`pb-3 leading-relaxed`,children:/^Tutor proposal \d+$/i.test(e.reason)?'The example proposal has no tutor rationale. Review the question and answer before approving it.':e.reason})
          ]}),
        (0, N.jsx)(a.span, {
          "aria-hidden": `true`,
          style: { opacity: d },
          className: `absolute right-6 top-16 rounded-ctl border border-easy bg-success-tint p-3 text-easy`,
          children: (0, N.jsx)(u, {}),
        }),
        (0, N.jsx)(a.span, {
          "aria-hidden": `true`,
          style: { opacity: p },
          className: `absolute left-6 top-16 rounded-ctl border border-again bg-danger-tint p-3 text-again`,
          children: (0, N.jsx)(g, {}),
        }),
      ],
    }),
  });
}
// W16: a page-independent thirty-second decision ledger. Persist only operations,
// never assume an ambiguous network response means a successful save.
const lemmaDecisionLedger = (() => {
  const key=`lemma.ui.proposalDecisions.v2`;
  const activeStates=new Set([`pending`,`sending`,`uncertain`]);
  let entries=[];
  try{
    const saved=JSON.parse(localStorage.getItem(key)||`[]`);
    if(Array.isArray(saved)) entries=saved.filter(r=>r && typeof r.id===`string` && Array.isArray(r.ids) && r.ids.length && typeof r.state===`string`).slice(-60);
  }catch{}
  // Any operation interrupted while sending must be reconciled, not retried.
  for(const item of entries){
    if(item.state===`sending` || (item.state===`pending` && item.deadline<=Date.now())) item.state=`uncertain`;
  }
  let version=0, runner=null, refresh=null, ready=false;
  const listeners=new Set(), timers=new Map();
  const snapshot=()=>entries.map(e=>({...e,ids:[...e.ids],results:e.results?{...e.results}:undefined}));
  function publish(){
    try{localStorage.setItem(key,JSON.stringify(entries.slice(-60)))}catch{}
    version++;for(const fn of listeners)fn(snapshot());
  }
  function reserved(){return new Set(entries.filter(e=>activeStates.has(e.state)||e.state===`confirmed`).flatMap(e=>e.ids))}
  function subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn)}
  function stage(input){
    const ids=[...new Set(input.ids)].filter(x=>typeof x===`string` && !reserved().has(x));
    if(!ids.length)return null;
    const now=Date.now();
    const record={id:`decision-${now}-${Math.random().toString(36).slice(2,9)}`,
      ids,projectSlug:input.projectSlug,action:input.action,label:input.label,
      edit:input.edit??null,previous:input.previous??null,createdAt:now,
      deadline:now+30000,state:`pending`,results:{}};
    entries.push(record);publish();schedule(record);return record;
  }
  function undo(id){
    const item=entries.find(e=>e.id===id);
    if(!item||item.state!==`pending`)return null;
    clearTimeout(timers.get(id));timers.delete(id);
    entries=entries.filter(e=>e.id!==id);publish();return item;
  }
  async function send(id){
    const item=entries.find(e=>e.id===id);
    if(!item||item.state!==`pending`||!runner||!ready)return;
    if(window.__lemmaFeedback?.isInteracting()){item.deadline=Date.now()+30000;schedule(item);return}
    if(item.deadline>Date.now()){schedule(item);return}
    item.state=`sending`;publish();
    for(const proposalId of item.ids){
      try{
        await runner(item,proposalId);
        item.results[proposalId]=`confirmed`;
        if(item.edit&&item.projectSlug)
          try{localStorage.removeItem(`lemma.proposal.draft:${item.projectSlug}:${proposalId}`)}catch{}
      }catch{
        // The server may have committed before a lost response. No blind retry.
        item.results[proposalId]=`uncertain`;
      }
      publish();
    }
    item.state=Object.values(item.results).every(v=>v===`confirmed`)?`confirmed`:`uncertain`;
    publish();
    if(!entries.some(entry=>entry.state==='pending'))window.__lemmaFeedback?.show(item.state==='confirmed'?'Inbox decisions saved.':'Some decisions need a connection check.',{clearAction:'Undo decisions'});
    if(typeof refresh===`function`)try{await refresh()}catch{}
  }
  function schedule(item){
    if(!runner||!ready||item.state!==`pending`)return;
    clearTimeout(timers.get(item.id));
    timers.set(item.id,setTimeout(()=>{timers.delete(item.id);void send(item.id)},Math.max(0,item.deadline-Date.now())));
  }
  function undoAll(){const pending=entries.filter(entry=>entry.state==='pending');for(const entry of pending)undo(entry.id);return pending}
  function bind(sendMutation,refetch){runner=sendMutation;refresh=refetch;}
  function reconcile(pendingIds){
    if(!(pendingIds instanceof Set))return;
    ready=true;
    for(const item of entries){
      if(item.state===`pending`){
        // On reload, only still-pending server IDs can be dispatched.
        if(item.ids.some(id=>!pendingIds.has(id))){item.state=`uncertain`;}
        else if(item.deadline<=Date.now()){item.state=`uncertain`;}
        else schedule(item);
      } else if(item.state===`uncertain` && item.ids.every(id=>!pendingIds.has(id))){
        item.state=`confirmed`;
      }
    }
    publish();
  }
  function dispose(id){
    const item=entries.find(e=>e.id===id);
    if(!item||item.state===`pending`||item.state===`sending`)return false;
    entries=entries.filter(e=>e.id!==id);publish();return true;
  }
  return {snapshot,subscribe,stage,undo,undoAll,bind,reconcile,dispose,reserved};
})();

function F() {
  let e = te(),
    t = v(),
    n = ee(),
    a = x(),
    [o, s] = r(),
    c = o.get(`tab`) === `plan` ? `plan` : `cards`,
    [l, w] = (0, k.useState)(null),
    [ledger, setLedger] = (0, k.useState)(()=>lemmaDecisionLedger.snapshot()),
    [M, F] = (0, k.useState)(null),
    [I, L] = (0, k.useState)(0),
    [R, z] = (0, k.useState)(0),
    [se, B] = (0, k.useState)(!1),
    [ce, V] = (0, k.useState)(!1),
    [H, U] = (0, k.useState)(``),
    [W, G] = (0, k.useState)(``),
    [editorBase,setEditorBase]=(0,k.useState)(null),
    [editorStart,setEditorStart]=(0,k.useState)(null),
    [draftConflict,setDraftConflict]=(0,k.useState)(false),
    [le, K] = (0, k.useState)(!1),
    [q, ue] = (0, k.useState)(0),
    [queueOpen, setQueueOpen] = (0,k.useState)(false),
    queueOpener=(0,k.useRef)(null),
    queuePanel=(0,k.useRef)(null),
    J = t.isPending || n.isPending;
  ((0, k.useEffect)(() => {
    if (!e.isLoading) {
      K(!1);
      return;
    }
    let t = setTimeout(() => K(!0), 300);
    return () => clearTimeout(t);
  }, [e.isLoading]),
    (0, k.useEffect)(() => {
      e.isError &&
        a(`Couldn't load proposals.`, {
          tone: `danger`,
          action: { label: `Try again`, onClick: () => void e.refetch() },
        });
    }, [e.isError]));
  (0,k.useEffect)(()=>lemmaDecisionLedger.subscribe(setLedger),[]);
  (0,k.useEffect)(()=>{
    const desktop=()=>{if(window.innerWidth>=800)setQueueOpen(false)};
    window.addEventListener(`resize`,desktop);
    return()=>window.removeEventListener(`resize`,desktop);
  },[]);
  (0,k.useEffect)(()=>{
    if(!queueOpen)return;
    const panel=queuePanel.current;
    if(!panel)return;
    const priorOverflow=document.body.style.overflow;
    document.body.style.overflow=`hidden`;
    // One scroll owner while the queue is modal on mobile.
    const focusable=()=>Array.from(panel.querySelectorAll(`button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]`))
      .filter(el=>el.getClientRects().length>0);
    requestAnimationFrame(()=>{
      try{if(panel.showPopover&&!panel.matches(`:popover-open`))panel.showPopover()}catch{}
      panel.querySelector(`[data-queue-close]`)?.focus();
    });
    const onKey=(event)=>{
      if(event.key===`Escape`){event.preventDefault();setQueueOpen(false);return}
      if(event.key!==`Tab`)return;
      const items=focusable();if(!items.length)return;
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){event.preventDefault();first.focus()}
    };
    document.addEventListener(`keydown`,onKey,true);
    return()=>{try{if(panel.hidePopover&&panel.matches(`:popover-open`))panel.hidePopover()}catch{}
      document.removeEventListener(`keydown`,onKey,true);document.body.style.overflow=priorOverflow;
      queueOpener.current?.focus({preventScroll:true})};
  },[queueOpen]);
  (0,k.useEffect)(()=>{
    lemmaDecisionLedger.bind(async(item,id)=>{
      if(item.action===`approve`) await t.mutateAsync(item.edit ? {id,edit:item.edit} : {id});
      else await n.mutateAsync(id);
    },()=>e.refetch());
  },[t.mutateAsync,n.mutateAsync,e.refetch]);
  (0,k.useEffect)(()=>{
    if(!e.isLoading && !e.isError && Array.isArray(e.data))
      lemmaDecisionLedger.reconcile(new Set(e.data.map(p=>p.id)));
  },[e.isLoading,e.isError,e.data]);
  let Y = e.data ?? [],
    serverCardCount=Y.filter(e=>e.kind===`card`||e.kind===`card_edit`).length,
    serverPlanCount=Y.filter(e=>e.kind===`plan`||e.kind===`plan_change`).length,
    reservedIds=lemmaDecisionLedger.reserved(),
    X = Y.filter((e) => (e.kind === `card` || e.kind === `card_edit`) && !reservedIds.has(e.id)),
    Z = Y.filter((e) => (e.kind === `plan` || e.kind === `plan_change`) && !reservedIds.has(e.id)),
    Q = X.find((e) => e.id === M) ?? X[0],
    de = A(Y.filter(e=>e.kind===`card`||e.kind===`card_edit`)),
    fe = A(j(X.slice(I * 20), 20)),
    pe = A(j(Z.slice(R * 20), 20));
  // Individual and batch decisions use the same reversible queue.
  const $ = (proposal,approve,edit) => {
    if(!proposal || J)return;
    const idx=X.findIndex(p=>p.id===proposal.id);
    const action=lemmaDecisionLedger.stage({ids:[proposal.id],projectSlug:proposal.projectSlug,
      action:approve?`approve`:`reject`,edit:edit??null,
      label:(approve?`Approve `:`Reject `)+(proposal.kind===`card`?`card`:`proposal`)+` · `+P(proposal.projectSlug),
      previous:proposal.id});
    if(!action){a(`A decision for this item already awaits saving or status verification`,{tone:`danger`});return}
    const next=X[idx+1]??X[idx-1];
    F(next?.id??null);L(Math.floor(Math.max(0,idx+1<X.length?idx+1:idx-1)/20));
    V(false);ue(v=>v+1);a(`Decision staged · at least 30 seconds to undo`,{action:{label:'Undo decisions',onClick:()=>{const restored=lemmaDecisionLedger.undoAll();F(restored[0]?.previous??null)}}});
  };
  const stageBatch=group=>{
    if(!group || J)return;
    const proposals=group.proposals.filter(p=>p.kind===`card` && !lemmaDecisionLedger.reserved().has(p.id));
    const ids=proposals.map(p=>p.id);
    if(!ids.length){a(`No available cards remain in this batch`,{tone:`danger`});return}
    const action=lemmaDecisionLedger.stage({ids,projectSlug:group.project,action:`approve`,
      label:P(group.project)+` · `+group.label,previous:Q?.id});
    if(action){F(null);w(null);B(false);a(`${action.ids.length} cards staged · at least 30 seconds to undo`,{action:{label:'Undo decisions',onClick:()=>lemmaDecisionLedger.undoAll()}})}
  };
  return (0, N.jsxs)(m, {
    title: `Inbox`,
    back: `/`,
    children: [
      (0, N.jsx)(D, {
        label: `Proposal types`,
        value: c,
        onChange: (e) => {
          let t = new URLSearchParams(o);
          (t.set(`tab`, e), s(t));
        },
        options: [
          { value: `cards`, label: `Cards`, count: serverCardCount },
          { value: `plan`, label: `Plans`, count: serverPlanCount },
        ],
      }),
      ledger.filter(item=>item.state!==`confirmed`).length>0 &&
        (0,N.jsxs)(`section`,{
          className:`flex flex-col gap-2 rounded-ctl border border-edge bg-[var(--paper)] p-3`,
          "aria-label":`Decision status and Undo`,
          children:[
            (0,N.jsx)(`p`,{className:`text-label font-semibold text-ink`,children:
              `${c===`cards`?X.length:Z.length} to inspect · ${ledger.filter(r=>r.state===`pending`).reduce((v,r)=>v+r.ids.length,0)} awaiting save · ${ledger.filter(r=>r.state===`uncertain`).length} need status check`}),
            ...ledger.filter(item=>item.state!==`confirmed`).map(item=>(0,N.jsxs)(`div`,{
              className:`flex min-h-11 flex-wrap items-center gap-2 border-t border-edge pt-2 text-label text-ink-2`,
              children:[
                (0,N.jsx)(`span`,{className:`min-w-0 flex-1 break-words`,children:
                  `${item.label} · ${item.ids.length} item${item.ids.length===1?``:`s`} · `+
                  (item.state===`pending`?`Awaiting save (30 s Undo window)`:
                   item.state===`sending`?`Sending…`:
                   `Needs status check · ${Object.values(item.results??{}).filter(v=>v===`confirmed`).length} confirmed`)}),
                item.state===`pending` && (0,N.jsx)(`button`,{
                  type:`button`,className:`min-h-11 rounded-ctl border border-edge px-3 font-semibold text-ink`,
                  onClick:()=>{const before=lemmaDecisionLedger.undo(item.id);if(before){F(before.previous??null);a(`Decision cancelled before save`)}},children:`Undo`
                }),
                item.state===`uncertain` && (0,N.jsx)(`button`,{
                  type:`button`,className:`min-h-11 rounded-ctl border border-edge px-3 font-semibold text-ink`,
                  onClick:()=>void e.refetch(),children:`Refresh status`
                }),
              ],
            },item.id))
          ],
        }),
      e.isLoading
        ? le
          ? (0, N.jsxs)(`div`, {
              className: `flex flex-col gap-4`,
              children: [
                (0, N.jsx)(_, { w: `100%`, h: 380 }),
                (0, N.jsx)(_, { w: `70%`, h: 48 }),
              ],
            })
          : null
        : e.isError
          ? (0, N.jsx)(C, {
              variant: `ghost`,
              onClick: () => void e.refetch(),
              children: `Try again`,
            })
          : c === `cards`
            ? Q
              ? (0, N.jsxs)(`div`, { className:"lemma-proposal-layout",
                  children: [
                    (0,N.jsxs)(`div`,{className:`lemma-queue-mobile-trigger`,children:[
                      (0,N.jsx)(`span`,{className:`text-label text-ink-2`,children:
                        P(Q.projectSlug)}),
                      (0,N.jsx)(`button`,{ref:queueOpener,type:`button`,className:`min-h-12 rounded-ctl border border-edge bg-[var(--paper)] px-4 text-label font-semibold text-ink`,
                        onClick:()=>setQueueOpen(true),children:`Browse queue`})
                    ]}),
                    (0, N.jsxs)(`section`, {
                      ref:queuePanel,
                      "aria-label": `Proposal groups`,"data-style":"role-proposal-groups",
                      popover:queueOpen?`manual`:undefined,
                      role:queueOpen?`dialog`:`region`,
                      "aria-modal":queueOpen?`true`:undefined,
                      "data-queue-open":queueOpen?`true`:`false`,
                      className: `lemma-proposal-queue flex flex-col gap-3`,
                      children: [
                        (0,N.jsxs)(`div`,{className:`lemma-queue-mobile-header`,children:[
                          (0,N.jsxs)(`div`,{children:[(0,N.jsx)(`strong`,{className:`text-body text-ink`,children:`Browse proposal queue`}),
                            (0,N.jsx)(`p`,{className:`text-label text-ink-2`,children:`${X.length.toLocaleString()} cards to inspect · 20 per page`})]}),
                          (0,N.jsx)(`button`,{type:`button`,"data-queue-close":true,className:`min-h-11 rounded-ctl border border-edge px-4 text-label font-semibold text-ink`,
                            onClick:()=>setQueueOpen(false),children:`Close queue`})
                        ]}),
                        (0, N.jsxs)(`p`, {
                          className: `text-label text-ink-3`,
                          children: [
                            Math.min(I * 20 + 1, X.length),
                            `–`,
                            Math.min((I + 1) * 20, X.length),
                            ` of `,
                            X.length,
                            ` card proposals · grouped by session and checkpoint`,
                          ],
                        }),
                        fe.map((e) =>
                          (0, N.jsxs)(
                            y,
                            {
                              className: `flex flex-col gap-2 p-3`,
                              children: [
                                (0, N.jsxs)(`div`, {
                                  className: `flex flex-wrap items-center justify-between gap-2`,
                                  children: [
                                    (0, N.jsxs)(`div`, {
                                      className: `min-w-0`,
                                      children: [
                                        (0, N.jsx)(`h2`, {
                                          className: `text-body font-semibold`,
                                          children: P(e.project),
                                        }),
                                        (0, N.jsxs)(`p`, {
                                          className: `text-caption text-ink-3`,
                                          children: [
                                            e.label,
                                            ` · `,
                                            e.proposals.length,
                                            ` shown · `,
                                            (de.find(t=>t.key===e.key)??e).proposals.length,
                                            ` pending in this group`,
                                          ],
                                        }),
                                      ],
                                    }),
                                    e.proposals.some(
                                      (e) => e.kind === `card`,
                                    ) &&
                                      (0, N.jsxs)(`button`, {
                                        type: `button`,
                                        disabled: J,
                                        className: `min-h-11 px-3 text-label font-semibold text-ink-2 underline decoration-current underline-offset-4 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-50`,
                                        onClick: () => {
                                          try{queuePanel.current?.hidePopover?.()}catch{}
                                          setQueueOpen(false);
                                          (w(
                                            de.find((t) => t.key === e.key) ??
                                              e,
                                          ),
                                            B(!0));
                                        },
                                        children: [
                                          `Inspect & approve `,
                                          (de.find(t=>t.key===e.key)??e).proposals.filter(p=>p.kind===`card`).length,
                                          ` cards`,
                                        ],
                                      }),
                                  ],
                                }),
                                (0, N.jsx)(`div`, {
                                  role: `group`,
                                  "aria-label": `Cards in this proposal group`,
                                  className: `flex flex-col divide-y divide-[var(--hair)]`,
                                  children: e.proposals.map((e) =>
                                    (0, N.jsxs)(
                                      `button`,
                                      {
                                        type: `button`,
                                        disabled: J,
                                        "aria-pressed": Q.id === e.id,
                                        onClick: () => {
                                          (F(e.id), V(!1),setQueueOpen(false)); requestAnimationFrame(()=>{const el=document.getElementById('lemma-proposal-detail');el?.scrollIntoView({block:'start'});el?.focus({preventScroll:true})});
                                        },
                                        className: `flex min-h-11 w-full items-center gap-3 px-2 py-2 text-left text-body ${Q.id === e.id ? `bg-[var(--paper-2)] text-ink` : `text-ink-2`}`,
                                        children: [
                                          (0, N.jsx)(`span`, {
                                            "aria-hidden": `true`,
                                            className: `flex size-5 shrink-0 items-center justify-center`,
                                            children:
                                              Q.id === e.id &&
                                              (0, N.jsx)(`span`, { children: `›` }),
                                          }),
                                          (0, N.jsx)(ae, {
                                            source:
                                              e.card?.front ??
                                              e.cardEdit?.front ??
                                              `Fix N` +
                                                (e.cardEdit?.note_no ?? ``),
                                          }),
                                        ],
                                      },
                                      e.id,
                                    ),
                                  ),
                                }),
                              ],
                            },
                            e.key,
                          ),
                        ),
                        (0, N.jsxs)(`div`, {
                          className: `flex gap-2`,
                          children: [
                            I > 0 &&
                              (0, N.jsx)(`button`, {
                                type: `button`,
                                className: `min-h-11 flex-1 rounded-ctl border border-edge px-3 text-body text-amber`,
                                onClick: () => L((e) => e - 1),
                                children: `Previous 20`,
                              }),
                            (I + 1) * 20 < X.length &&
                              (0, N.jsxs)(`button`, {
                                type: `button`,
                                className: `min-h-11 flex-1 rounded-ctl border border-edge px-3 text-body text-amber`,
                                onClick: () => L((e) => e + 1),
                                children: [
                                  `More proposals · `,
                                  X.length - (I + 1) * 20,
                                  ` remaining`,
                                ],
                              }),
                          ],
                        }),
                      ],
                    }),
                    (0,N.jsxs)("div",{className:"lemma-proposal-stepper",role:"group","aria-label":"Browse individual proposals",children:[
                      (0,N.jsx)("button",{type:"button",disabled:J||X.indexOf(Q)<=0,onClick:()=>{const pos=X.indexOf(Q)-1;F(X[pos].id);L(Math.floor(pos/20));V(false);requestAnimationFrame(()=>{document.getElementById('lemma-proposal-detail')?.focus({preventScroll:true})})},children:"‹",
                        "aria-label":"Previous proposal"}),
                      (0,N.jsx)("span",{children:`${X.indexOf(Q)+1} of ${X.length}`}),
                      (0,N.jsx)("button",{type:"button",disabled:J||X.indexOf(Q)>=X.length-1,onClick:()=>{const pos=X.indexOf(Q)+1;F(X[pos].id);L(Math.floor(pos/20));V(false);requestAnimationFrame(()=>{document.getElementById('lemma-proposal-detail')?.focus({preventScroll:true})})},children:"›",
                        "aria-label":"Next proposal"})
                    ]}),
                    (0, N.jsx)(
                      oe,
                      { proposal: Q, busy: J, commit: (e) => void $(Q, e) },
                      Q.id,
                    ),
                    (0, N.jsxs)(NotebookActionBar, {
                      "data-ui":`proposal-actions`,
                      className: `grid grid-cols-3 gap-2`,
                      children: [
                        (0, N.jsxs)(`button`, {
                          type: `button`,
                          "aria-label": `Reject card`,"data-ui":`proposal-reject`,
                          disabled: J,
                          onClick: () => void $(Q, !1),
                          className: `flex min-h-12 items-center justify-center gap-1 rounded-ctl border border-again bg-danger-tint px-2 text-again disabled:opacity-50`,
                          children: [
                            (0, N.jsx)(g, { size: 18 }),
                            (0, N.jsx)(`span`, {
                              className: `text-label`,
                              children: `Reject`,
                            }),
                          ],
                        }),
                        (0, N.jsxs)(`button`, {
                          type: `button`,
                          "aria-label": `Edit card`,
                          disabled: J || !Q.card,
                          onClick: () => {
                            if(!Q?.card)return;
                            let saved=null;
                            try{saved=JSON.parse(localStorage.getItem(`lemma.proposal.draft:${Q.projectSlug}:${Q.id}`)||`null`)}catch{}
                            const conflict=!!saved&&(saved.baseFront!==Q.card.front||saved.baseBack!==Q.card.back);
                            if(conflict)a(`This proposal changed since your draft. Compare both versions before approval.`,{tone:`danger`});
                            const nextFront=saved?.front??Q.card.front,nextBack=saved?.back??Q.card.back;
                            setEditorBase({id:Q.id,front:saved?.baseFront??Q.card.front,back:saved?.baseBack??Q.card.back});
                            setEditorStart({front:nextFront,back:nextBack});
                            setDraftConflict(conflict);
                            U(nextFront);G(nextBack);V(!0);
                          },
                          className: `flex min-h-12 items-center justify-center gap-1 rounded-ctl border border-edge bg-fill-1 px-2 text-ink-2 disabled:opacity-40`,
                          children: [
                            (0, N.jsx)(d, { size: 17 }),
                            (0, N.jsx)(`span`, {
                              className: `text-label`,
                              children: `Edit`,
                            }),
                          ],
                        }),
                        (0, N.jsxs)(`button`, {
                          type: `button`,
                          "aria-label": `Approve card`,
                          disabled: J,
                          onClick: () => void $(Q, !0),
                          className: `flex min-h-12 items-center justify-center gap-1 rounded-ctl bg-amber px-2 text-amber-ink disabled:opacity-50`,
                          children: [
                            (0, N.jsx)(u, { size: 18 }),
                            (0, N.jsx)(`span`, {
                              className: `text-label font-semibold`,
                              children: `Approve`,
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                })
              : (0, N.jsx)(p, {
                  art: `inbox`,
                  title: `All clear`,
                  body: `New cards join your next review.`,
                })
            : Z.length
              ? (0, N.jsxs)(`div`, {
                  className: `flex flex-col gap-4`,
                  children: [
                    pe.map((e) =>
                      (0, N.jsxs)(
                        `section`,
                        {
                          className: `flex flex-col gap-3`,
                          children: [
                            (0, N.jsxs)(`h2`, {
                              className: `text-label font-semibold text-ink-2`,
                              children: [
                                P(e.project),
                                ` · `,
                                e.label,
                                ` · `,
                                e.proposals.length,
                              ],
                            }),
                            e.proposals.map((e) =>
                              (0, N.jsxs)(
                                y,
                                {
                                  className: `p-5`,
                                  children: [
                                    (0, N.jsxs)(`div`, {
                                      className: `flex items-center gap-3`,
                                      children: [
                                        (0, N.jsx)(h, {
                                          subject: e.projectGlyph,
                                          size: 40,
                                        }),
                                        (0, N.jsxs)(`div`, {
                                          children: [
                                            (0, N.jsx)(`h2`, {
                                              className: `font-semibold`,
                                              children: P(e.projectSlug),
                                            }),
                                            (0, N.jsxs)(`p`, {
                                              className: `text-label text-ink-3`,
                                              children: [
                                                e.kind === `plan_change`
                                                  ? `Plan change`
                                                  : `New plan`,
                                                e.sessionNumber
                                                  ? ` · From S${e.sessionNumber}`
                                                  : ``,
                                              ],
                                            }),
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, N.jsxs)(`div`, {
                                      role: `region`,
                                      "aria-label": `Plan errata`,"data-style":"role-plan-errata",
                                      className: `my-5 flex flex-col`,
                                      children: [
                                        e.planChange?.ops
                                          .slice(0, 3)
                                          .map((e, t) =>
                                            (0, N.jsxs)(
                                              `div`,
                                              {
                                                className: `flex min-h-11 items-start gap-3 border-b border-edge py-3 text-body text-ink-soft last:border-0`,
                                                children: [
                                                  e.op === `add`
                                                    ? (0, N.jsx)(b, {
                                                        size: 17,
                                                        className: `text-easy`,
                                                      })
                                                    : e.op.startsWith(`prereq`)
                                                      ? (0, N.jsx)(re, {
                                                          size: 17,
                                                          className: `text-amber`,
                                                        })
                                                      : (0, N.jsx)(ne, {
                                                          size: 17,
                                                          className: `text-ink-3`,
                                                        }),
                                                  (0, N.jsx)(`span`, {
                                                    className: `min-w-0 flex-1`,
                                                    children: ie(e),
                                                  }),
                                                ],
                                              },
                                              t,
                                            ),
                                          ),
                                        (e.planChange?.ops.length ?? 0) > 3 &&
                                          (0, N.jsxs)(i, {
                                            to: `/proposals/${e.id}`,
                                            className: `min-h-11 py-3 text-label text-amber`,
                                            children: [
                                              `See all `,
                                              e.planChange.ops.length,
                                              ` changes`,
                                            ],
                                          }),
                                        e.plan &&
                                          (0, N.jsxs)(`p`, {
                                            className: `text-ink-soft`,
                                            children: [
                                              e.plan.checkpoints.length,
                                              ` checkpoints proposed`,
                                            ],
                                          }),
                                      ],
                                    }),
                                    e.reason &&
                                      (0, N.jsxs)(`p`, {
                                        className: `mb-4 flex gap-2 text-label italic text-ink-3`,
                                        children: [
                                          (0, N.jsx)(f, { size: 15 }),
                                          e.reason,
                                        ],
                                      }),
                                    (0, N.jsx)(i, {
                                      to: `/proposals/${e.id}`,
                                      className: `lemma-plan-inspect`,
                                      children: `See plan`,
                                    }),
                                    (0, N.jsxs)(`div`, {
                                      className: `lemma-plan-decisions`,
                                      children: [
                                        (0, N.jsx)(C, {
                                          variant: `ghost`,
                                          disabled: J,
                                          onClick: () => void $(e, !1),
                                          children: `Reject`,
                                        }),
                                        (0, N.jsx)(C, {
                                          disabled: J,
                                          onClick: () => void $(e, !0),
                                          children: `Approve`,
                                        }),
                                      ],
                                    }),
                                  ],
                                },
                                e.id,
                              ),
                            ),
                          ],
                        },
                        e.key,
                      ),
                    ),
                    (0, N.jsxs)(`div`, {
                      className: `flex gap-2`,
                      children: [
                        R > 0 &&
                          (0, N.jsx)(`button`, {
                            type: `button`,
                            className: `min-h-11 flex-1 rounded-ctl border border-edge px-3 text-body text-amber`,
                            onClick: () => z((e) => e - 1),
                            children: `Previous 20`,
                          }),
                        (R + 1) * 20 < Z.length &&
                          (0, N.jsxs)(`button`, {
                            type: `button`,
                            className: `min-h-11 flex-1 rounded-ctl border border-edge px-3 text-body text-amber`,
                            onClick: () => z((e) => e + 1),
                            children: [
                              `More plan proposals · `,
                              Z.length - (R + 1) * 20,
                              ` remaining`,
                            ],
                          }),
                      ],
                    }),
                  ],
                })
              : (0, N.jsx)(p, {
                  art: `inbox`,
                  title: `All clear`,
                  body: `New plans and changes will appear here.`,
                }),
      (0, N.jsxs)(S, {
        open: se,
        onClose: () => B(!1),
        title: `Approve ${l?.proposals.filter((e) => e.kind === `card`).length ?? 0} from ${l?.label ?? `group`}?`,
        children: [
          (0, N.jsx)(`p`, {
            className: `mb-3 text-ink-2`,
            children: `Preview the cards from this session and checkpoint. A six-second Undo window appears before anything is saved.`,
          }),
          (0, N.jsx)(`ul`, {
            className: `mb-4 min-w-0 text-ink-2`,
            tabIndex:0, role:"list", "aria-label":"Batch proposal contents",
            children: l?.proposals
              .filter((e) => e.kind === `card`)
              .map((e) =>
                (0, N.jsx)(
                  `li`,
                  {
                    className: `min-w-0 max-w-full overflow-x-auto border-b border-edge py-2`,
                    children: (0, N.jsx)(T, {
                      source: e.card?.front ?? ``,
                      variant: `body`,
                      className: `min-w-0 max-w-full text-base`,
                    }),
                  },
                  e.id,
                ),
              ),
          }),
          (0,N.jsx)(`p`,{
            className:`mb-3 text-label text-ink-3`,
            children:`All ${l?.proposals.filter(e=>e.kind===`card`).length??0} selected cards are listed above. No other group is included.`,
          }),
          (0, N.jsxs)(`div`, {
            className: `grid grid-cols-2 gap-3`,
            children: [
              (0, N.jsx)(C, {
                variant: `ghost`,
                onClick: () => B(!1),
                children: `Cancel`,
              }),
              (0, N.jsx)(C, {
                disabled: J || !l?.proposals.some((e) => e.kind === `card`),
                onClick: () => {
                  l &&
                    stageBatch(l);
                },
                children: `Approve ${l?.proposals.filter(e=>e.kind===`card`).length??0} cards`,
              }),
            ],
          }),
        ],
      }),
      (0, N.jsx)(S, {
        open: ce,
        onClose: () => {
          if(editorStart&&(H!==editorStart.front||W!==editorStart.back)&&!window.confirm(`Discard unsaved card edits?`))return;
          V(!1);
        },
        title: `Edit card`,
        children: (0, N.jsxs)(`div`, {
          className: `flex flex-col gap-4`,
          children: [
            (0, N.jsxs)(`label`, {
              className: `text-ink-2`,
              children: [
                `Front`,
                (0, N.jsx)(`textarea`, {
                  value: H,
                  onChange: (e) => U(e.target.value),
                  className: `mt-2 min-h-24 w-full rounded-ctl border border-edge bg-well p-3 text-ink`,
                }),
              ],
            }),
            (0, N.jsxs)(`label`, {
              className: `text-ink-2`,
              children: [
                `Back`,
                (0, N.jsx)(`textarea`, {
                  value: W,
                  onChange: (e) => G(e.target.value),
                  className: `mt-2 min-h-24 w-full rounded-ctl border border-edge bg-well p-3 text-ink`,
                }),
              ],
            }),
            (draftConflict || (editorBase&&Q?.card&&(Q.id!==editorBase.id||Q.card.front!==editorBase.front||Q.card.back!==editorBase.back)))&&
              (0,N.jsxs)(`section`,{role:`alert`,className:`flex flex-col gap-3 rounded-ctl border border-edge bg-[var(--paper)] p-3`,children:[
                (0,N.jsx)(`strong`,{className:`text-body text-ink`,children:`Proposal changed — review before approval`}),
                (0,N.jsx)(`p`,{className:`text-label text-ink-2`,children:`The current pending proposal differs from the version on which this draft was based. Compare the latest proposal with your edited content. Nothing has been approved.`}),
                (0,N.jsxs)(`div`,{className:`grid grid-cols-1 gap-2`,children:[
                  (0,N.jsxs)(`details`,{children:[(0,N.jsx)(`summary`,{className:`min-h-11 cursor-pointer font-semibold text-ink`,children:`Latest proposal from Inbox`}),
                    (0,N.jsx)(T,{source:Q.card?.front??``,variant:`card`}),(0,N.jsx)(T,{source:Q.card?.back??``,variant:`answer`})]}),
                  (0,N.jsxs)(`details`,{children:[(0,N.jsx)(`summary`,{className:`min-h-11 cursor-pointer font-semibold text-ink`,children:`My saved/edited draft`}),
                    (0,N.jsx)(T,{source:H,variant:`card`}),(0,N.jsx)(T,{source:W,variant:`answer`})]})
                ]}),
                (0,N.jsxs)(`div`,{className:`flex flex-wrap gap-2`,children:[
                  (0,N.jsx)(`button`,{type:`button`,className:`min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink`,
                    onClick:()=>{U(Q.card?.front??``);G(Q.card?.back??``);setEditorBase({id:Q.id,front:Q.card?.front??``,back:Q.card?.back??``});setDraftConflict(false)},children:`Use latest proposal`}),
                  (0,N.jsx)(`button`,{type:`button`,className:`min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink`,
                    onClick:()=>{setEditorBase({id:Q.id,front:Q.card?.front??``,back:Q.card?.back??``});setDraftConflict(false)},children:`Keep my draft after comparing`})
                ]})
              ]}),
            (0, N.jsx)(`p`, {
              className: `text-label text-ink-3`,
              children: `Preview`,
            }),
            (0, N.jsx)(T, { source: H, variant: `card` }),
            (0, N.jsx)(T, { source: W, variant: `answer` }),
            (0,N.jsxs)(`div`,{className:`grid grid-cols-3 gap-2`,children:[
              (0,N.jsx)(C,{variant:`ghost`,onClick:()=>{
                if(editorStart&&(H!==editorStart.front||W!==editorStart.back)&&!window.confirm(`Discard unsaved card edits?`))return;
                V(!1);
              },children:`Cancel`}),
              (0,N.jsx)(C,{variant:`ghost`,disabled:J||!Q?.card||!H.trim(),onClick:()=>{
                if(!Q?.card)return;
                try{localStorage.setItem(`lemma.proposal.draft:${Q.projectSlug}:${Q.id}`,JSON.stringify({front:H,back:W,
                  baseFront:editorBase?.front??Q.card.front,baseBack:editorBase?.back??Q.card.back,
                  savedAt:new Date().toISOString()}));a(`Draft saved on this device`);V(!1)}catch{a(`Could not save the local draft`,{tone:`danger`})}
              },children:`Save draft`}),
              (0,N.jsx)(C,{disabled:J||!H.trim()||draftConflict||!Q?.card||!editorBase||Q.id!==editorBase.id||Q.card.front!==editorBase.front||Q.card.back!==editorBase.back,
                onClick:()=>Q&&void $(Q,!0,{front:H,back:W}),children:`Approve edits`}),
            ]}),
          ],
        }),
      }),
    ],
  });
}
export { F as default };
