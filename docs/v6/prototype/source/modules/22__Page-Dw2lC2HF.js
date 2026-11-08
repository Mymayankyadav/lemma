import {NotebookMenu} from "@lemma/index-DcUkykC4.js";
import {r as lemmaMode} from "@lemma/data-HD2KrcdX.js";
import {H as cPlain} from "@lemma/index-DcUkykC4.js";
import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { n as t, t as n } from "@lemma/jsx-runtime-DApVmHJR.js";
import { t as r } from "@lemma/clock-BEn_QF7F.js";
import {
  Bt as i,
  Ct as a,
  H as o,
  Ht as s,
  J as c,
  L as l,
  R as u,
  Rt as d,
  Ut as f,
  st as p,
} from "@lemma/index-DcUkykC4.js";
import { t as m } from "@lemma/target-D3iujC2g.js";
import { t as h } from "@lemma/insights-DjL4G0LE.js";
import { a as g, o as _ } from "@lemma/data-HD2KrcdX.js";
import { t as v } from "@lemma/Segmented-DV1qg3lc.js";
import { n as y, r as b, t as x } from "@lemma/monotone-CFmykcrP.js";
import { t as S } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as C } from "@lemma/Tex-kn8bVMsW.js";
import { n as w, t as T } from "@lemma/GroupedBars-9KPd4Juw.js";
var E = e(t(), 1);
function D(e) {
  if (!Number.isFinite(e))
    return { short: `—`, exact: `Study time unavailable` };
  let t = Math.max(0, Math.round(e)),
    r = Math.floor(t / 60),
    i = t % 60,
    a = [
      r ? g(r) + ` ` + (r === 1 ? `hour` : `hours`) : null,
      i || !r ? i + ` ` + (i === 1 ? `minute` : `minutes`) : null,
    ]
      .filter(Boolean)
      .join(`, `);
  return {
    short:
      t >= 60
        ? g(Math.floor(t / 60)) + ` h` + (t % 60 ? ` ${t % 60}m` : ``)
        : _(t),
    exact: a,
  };
}
var O = n();
function k({ data: e, target: t }) {
  let n = (0, E.useId)(),
    r = (t) => 42 + (268 * t) / Math.max(1, e.length - 1),
    i = (e) => 120 - 108 * Math.max(0, Math.min(1, e)),
    a = e.map((e, t) => ({ ...e, index: t })),
    o = (e) => e.value !== null && Number.isFinite(e.value),
    s = b()
      .defined(o)
      .x((e) => r(e.index))
      .y((e) => i(e.value ?? 0))
      .curve(x)(a),
    c = y()
      .defined(o)
      .x((e) => r(e.index))
      .y0(120)
      .y1((e) => i(e.value ?? 0))
      .curve(x)(a),
    l = [...a].reverse().find(o),
    u = a.filter(o).length;
  return (0, O.jsxs)(`svg`, {
    role: `img`,
    "aria-label": `Recall over time: ${u} periods with data, latest ${l ? Math.round((l.value ?? 0) * 100) + `%` : `unavailable`}, target ${Math.round(t * 100)}%.`,
    viewBox: `0 0 320 146`,
    width: `100%`,
    className: `block`,
    children: [
      (0, O.jsx)(`defs`, {
        children: (0, O.jsx)(`pattern`, {
          id: n,
          width: `7`,
          height: `7`,
          patternUnits: `userSpaceOnUse`,
          patternTransform: `rotate(45)`,
          children: (0, O.jsx)(`line`, {
            x1: `0`,
            y1: `0`,
            x2: `0`,
            y2: `7`,
            stroke: `var(--ink-2)`,
            strokeOpacity: `.24`,
            strokeWidth: `1`,
          }),
        }),
      }),
      [0, 0.25, 0.5, 0.75, 1].map((e) =>
        (0, O.jsxs)(
          `g`,
          {
            children: [
              (0, O.jsx)(`line`, {
                x1: 42,
                x2: 310,
                y1: i(e),
                y2: i(e),
                stroke: `var(--line)`,
                strokeWidth: `.8`,
              }),
              (0, O.jsxs)(`text`, {
                x: 35,
                y: i(e) + 3,
                textAnchor: `end`,
                fill: `var(--ink-3)`,
                fontSize: `14`,
                children: [Math.round(e * 100), `%`],
              }),
            ],
          },
          e,
        ),
      ),
      (0, O.jsx)(`line`, {
        x1: 42,
        x2: 310,
        y1: i(t),
        y2: i(t),
        stroke: `var(--ink-2)`,
        strokeWidth: `1`,
        strokeDasharray: `4 4`,
      }),
      c && (0, O.jsx)(`path`, { d: c, fill: `url(#${n})` }),
      s &&
        (0, O.jsx)(`path`, {
          d: s,
          fill: `none`,
          stroke: `var(--ink-2)`,
          strokeWidth: `2`,
          strokeLinejoin: `round`,
        }),
      l &&
        (0, O.jsx)(`circle`, {
          cx: r(l.index),
          cy: i(l.value ?? 0),
          r: `3.5`,
          fill: `var(--ink-2)`,
        }),
      (0, O.jsx)(`text`, {
        x: 42,
        y: `141`,
        fill: `var(--ink-3)`,
        fontSize: `14`,
        children: e[0]?.label || ``,
      }),
      (0, O.jsx)(`text`, {
        x: 310,
        y: `141`,
        textAnchor: `end`,
        fill: `var(--ink-3)`,
        fontSize: `14`,
        children: e[e.length - 1]?.label || ``,
      }),
    ],
  });
}
function A(e, t = 6) {
  let n = [...e].sort(
      (e, t) =>
        t.minutes - e.minutes || e.subject.name.localeCompare(t.subject.name),
    ),
    r = n.slice(0, t),
    i = n.slice(t);
  return {
    top: r,
    other: i,
    otherMinutes: i.reduce((e, t) => e + t.minutes, 0),
  };
}
function j({ data: e, format: t }) {
  let [n, r] = (0, E.useState)(!1),
    [i, a] = (0, E.useState)(null),
    { top: s, other: c, otherMinutes: l } = A(e),
    otherAggregate={subject:{name:`Other`,glyph:`⋯`},minutes:l,aggregateOther:true},
    u = (n ? [...e] : c.length ? [...s,otherAggregate] : [...s])
      .sort((a,b)=>Number(Boolean(a.aggregateOther))-Number(Boolean(b.aggregateOther))||b.minutes-a.minutes||a.subject.name.localeCompare(b.subject.name)),
    d = Math.max(1, ...u.map((e) => e.minutes));
  return (0, O.jsx)(`div`, {
    role: `group`,
    "aria-label": `Time by subject`,
    className: `flex flex-col gap-3`,
    children:
      e.length === 0
        ? (0, O.jsx)(`p`, {
            className: `text-label text-ink-3`,
            children: `No study time recorded yet.`,
          })
        : (0, O.jsxs)(O.Fragment, {
            children: [
              u.map((e) =>
                (0, O.jsxs)(
                  `div`,
                  {
                    className: `flex flex-col gap-1`,
                    children: [
                      (0, O.jsxs)(`div`, {
                        className: `flex min-w-0 items-center justify-between gap-3 text-label`,
                        children: [
                          (0, O.jsxs)(`button`, {
                            type: `button`,
                            title: e.aggregateOther?`Expand ${c.length} other subjects`:o(e.subject.name),
                            "aria-label": e.aggregateOther?`Expand Other (${c.length}) subjects, ${t(l)} total`:o(e.subject.name),
                            "aria-expanded":e.aggregateOther?false:undefined,
                            onClick: () => e.aggregateOther?r(true):a(i === e.subject.name ? null : e.subject.name),
                            className: `flex min-h-11 min-w-0 flex-1 items-center text-left text-ink-2 ${i === e.subject.name ? `break-words` : `overflow-hidden`}`,
                            children: [
                              (0, O.jsx)(`span`, {
                                "aria-hidden": `true`,
                                className: `mr-2 shrink-0 font-math italic text-ink-2`,
                                children: e.subject.glyph,
                              }),
                              (0, O.jsx)(`span`, {
                                className:
                                  i === e.subject.name
                                    ? `min-w-0 max-w-full overflow-x-auto break-words text-body`
                                    : `min-w-0 clip-1 text-body`,
                                style:
                                  i === e.subject.name
                                    ? {
                                        maskImage: `linear-gradient(to right, black 0%, black calc(100% - 12px), transparent 100%)`,
                                      }
                                    : void 0,
                                children: (0, O.jsx)(C, {
                                  source: e.aggregateOther?`Other (${c.length}) · Expand`:e.subject.name,
                                }),
                              }),
                            ],
                          }),
                          (0, O.jsx)(`span`, {
                            className: `shrink-0 tabular-nums text-ink-2`,
                            children: t(e.minutes),
                          }),
                        ],
                      }),
                      (0, O.jsx)(`div`, {
                        className: `h-1 w-full overflow-hidden rounded-[1px] bg-fill-2`,
                        children: (0, O.jsx)(`div`, {
                          className: `h-full rounded-[1px] bg-[var(--ink-2)]`,
                          style: {
                            width: `${Math.max(0, Math.min(100, (e.minutes / d) * 100))}%`,
                          },
                        }),
                      }),
                    ],
                  },
                  e.subject.name,
                ),
              ),
              n && c.length>0 && (0,O.jsx)(`button`,{
                type:`button`,onClick:()=>r(false),
                className:`min-h-11 self-start rounded-ctl border border-edge px-3 text-label font-semibold text-ink`,
                children:`Collapse to top subjects and Other`,
              }),
            ],
          }),
  });
}
function M({ conceptName: e, label: t }) {
  let n = e || (t && !/no repeats yet/i.test(t) ? t : `No verified concept-linked repeats in this range`),
    r = new URLSearchParams();
  return (
    e &&
      (r.set(
        `focus`,
        e
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, `-`)
          .replace(/^-|-$/g, ``),
      ),
      r.set(`name`, e)),
    (0, O.jsxs)(S, {
      to: e ? `/atlas?` + r.toString() : `/atlas`,
      className: `tile`,
      "aria-label": `Most revisited: ` + o(n),
      children: [
        (0, O.jsxs)(`div`, {
          className: `mb-3 flex items-center justify-between text-ink-2`,
          children: [(0, O.jsx)(i, { size: 20 }), (0, O.jsx)(d, { size: 16 })],
        }),
        (0, O.jsx)(`span`, {
          className: `block text-label text-ink-2`,
          children: `Most revisited`,
        }),
        (0, O.jsx)(`strong`, {
          className: `block min-w-0 max-w-full overflow-x-auto break-words text-headline`,
          title: o(n),
          style: {
            maskImage: `linear-gradient(to right, black 0%, black calc(100% - 12px), transparent 100%)`,
          },
          children: (0, O.jsx)(C, { source: n }),
        }),
      ],
    })
  );
}
function N({ data: e }) {
  return (0, O.jsx)(`div`, {
    role: `img`,
    "aria-label": `Self-rated recall by confidence: ${e.map((e) => e.confidence + ` ` + e.right + ` of ` + e.total + ` recalled`).join(`; `)}.`,
    className: `flex flex-col gap-4`,
    children: e.map((e) =>
      (0, O.jsxs)(
        `div`,
        {
          className: `lemma-confidence-row`,
          children: [
            (0, O.jsx)(`span`, {
              className: `capitalize text-ink-2`,
              children: e.confidence,
            }),
            (0, O.jsx)(`div`, {
              className: `h-1 overflow-hidden rounded-[1px] bg-fill-2`,
              children: (0, O.jsx)(`div`, {
                className: `h-full rounded-[1px] bg-[var(--ink-2)]`,
                style: {
                  width: `${Math.max(0, Math.min(100, (e.rate ?? 0) * 100))}%`,
                },
              }),
            }),
            (0, O.jsx)(`span`, {
              className: `text-right tabular-nums text-ink`,
              title: `${e.right} recalled of ${e.total} self-rated reviews`,
              children:
                e.rate === null
                  ? `${e.total} reviews`
                  : `${Math.round(e.rate * 100)}% · ${e.right}/${e.total}`,
            }),
          ],
        },
        e.confidence,
      ),
    ),
  });
}
var P = (e) => (e === null ? `—` : `${Math.round(e * 100)}%`);
function lemmaDate(e) {
  if (!e) return `Date unavailable`;
  const d = new Date(e + `T12:00:00Z`);
  return Number.isNaN(d.valueOf())
    ? e
    : d.toLocaleDateString(`en-GB`, {
        day: `numeric`,
        month: `short`,
        timeZone: `UTC`,
      });
}
function lemmaPeriod(row) {
  return row.date && row.endDate && row.date !== row.endDate
    ? `${lemmaDate(row.date)}–${lemmaDate(row.endDate)}`
    : lemmaDate(row.date);
} /* v8: Insights study rhythm is a React-owned view, not post-render DOM surgery.
   Sample panels are explicitly labelled and do not claim personal measurement. */
function LemmaNativeRhythm() {
  const snapshot = () => ({
    session: window.__carrelIntegration?.getState?.() || {},
    settings: window.__carrelIntegration?.getPreferences?.() || {},
  });
  const [state, setState] = (0, E.useState)(snapshot);
  const [tab, setTab] = (0, E.useState)(
    () => snapshot().settings.insightTab || "focus",
  );
  (0, E.useEffect)(() => {
    const sync = () => {
      const next = snapshot();
      setState(next);
      setTab(next.settings.insightTab || "focus");
    };
    window.addEventListener("lemma:integrationchange", sync);
    window.addEventListener("lemma:sessionchange", sync);window.addEventListener('lemma:notebookchange',sync);
    sync();
    return () => {
      window.removeEventListener("lemma:integrationchange", sync);
      window.removeEventListener("lemma:sessionchange", sync);window.removeEventListener('lemma:notebookchange',sync);
    };
  }, []);
  const s = state.session,
    u = state.settings,
    r = s.settings || {};
  const changeTab = (id) => {
    setTab(id);
    window.__carrelIntegration?.setRhythmTab?.(id);
  };
  const planReview = () =>
    window.__carrelIntegration?.open?.("plan", null, {
      reviewBlock: true,
      minutes: u.reviewMinutes || 15,
    });
  const focus = () => window.__carrelIntegration?.open?.("timer", "focus");
  const notice = () => window.__carrelIntegration?.open?.("timer", "noticed");
  const park = () => window.__carrelIntegration?.open?.("distractions", "park");
  const [showExample,setShowExample]=(0,E.useState)(false);
  const sample = [
    ["09", 2],
    ["11", 2.1],
    ["13", 1.9],
    ["15", 2.3],
    ["17", 2.5],
    ["19", 2.8],
    ["20", 2.9],
    ["22", 2.6],
  ];
  const b = (text, onClick) =>
    (0, O.jsx)("button", {
      type: "button",
      onClick,
      className: "cr-button text",
      children: text,
    });
  const rhythmNow=Date.now(),minimum=Number(s.settings?.minDay)||25,days=Array.from({length:7},(_,index)=>{const date=new Date(rhythmNow);date.setDate(date.getDate()-6+index);const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');return {label:date.toLocaleDateString(undefined,{weekday:'short'}),minutes:window.__lemmaEffortMetrics.forDay(s.entries||[],null,key,rhythmNow).committedMinutes}}),activeDays=days.filter(day=>day.minutes>=minimum).length;
  const lastDay=days.findLastIndex(day=>day.minutes>0),dateNow=new Date(rhythmNow),freshStart=activeDays<4&&lastDay>=0&&(lastDay<=3||dateNow.getDay()===1||dateNow.getDate()===1);
  return (0, O.jsxs)("section", {
    className: "cr cr-joint lemma-native-rhythm",
    "aria-label": "Study rhythm and session context",
    children: [
      (0,O.jsxs)('section',{className:'lemma-forgiving-rhythm','aria-label':'Saved seven-day study rhythm',children:[(0,O.jsx)('h2',{children:activeDays+' of the last 7 days'}),(0,O.jsx)('p',{children:minimum+' min minimum · saved study time, with future records excluded.'}),(0,O.jsx)('div',{className:'lemma-rhythm-days',children:days.map((day,index)=>(0,O.jsxs)('span',{'data-met':day.minutes>=minimum,'aria-label':day.label+', '+Math.round(day.minutes)+' minutes'+(day.minutes>=minimum?', minimum met':''),children:[(0,O.jsx)('span',{children:day.label}),(0,O.jsx)('strong',{'aria-hidden':true,children:day.minutes>=minimum?'✓':'·'})]},index))}),
      (0,O.jsx)('p',{children:activeDays>=4?'A steady rhythm leaves room for rest.':freshStart?'Welcome back · a clean page. Pick up with one useful task.':'A small session is a useful beginning. Rest days stay part of the week.'}),freshStart&&(0,O.jsx)('button',{type:'button',className:'notebook-text-button',onClick:()=>window.__lemmaNotebook.addTask(),children:'Choose a small next step'})]}),
      (0, O.jsxs)("div", {
        className: "cr-row",
        children: [
          (0, O.jsx)("h2", { children: "Session context" }),
          (0, O.jsx)("span", {
            className: "cr-period-tag",
            children:
              tab === "attention"
                ? "Demo session log"
                : showExample ? "Example · not personal data" : "No measured focus/estimate history",
          }),
        ],
      }),
      (0, O.jsxs)("div", {
        className: "cr-paper",
        children: [
          (0, O.jsx)("p", {
            className: "cr-meta cr-sample-disclosure",
            children:
              tab === "attention"
                ? "Local demonstration activity, not a verified account history"
                : showExample
                  ? "Illustrative examples, not measurements or predictions of your focus"
                  : "These records do not contain verified focus-by-hour or estimation accuracy history.",
          }),
          (0, O.jsx)("div", {
            className: "cr-joint-tabs",
            role: "tablist",
            "aria-label": "Study rhythm views",
            children: [
              ["focus", "Focus"],
              ["planning", "Planning"],
              ["attention", "Attention"],
            ].map(([id, label]) =>
              (0, O.jsx)(
                "button",
                {
                  type: "button",
                  role: "tab",
                  "aria-selected": tab === id,
                  onClick: () => changeTab(id),
                  children: label,
                },
                id,
              ),
            ),
          }),
          tab!=="attention" && (0,O.jsx)(`button`,{
            type:`button`,onClick:()=>setShowExample(value=>!value),
            className:`min-h-11 self-start rounded-ctl border border-edge bg-[var(--paper)] px-3 text-label font-semibold text-ink`,
            "aria-pressed":showExample,
            children:showExample?`Hide example`:`View example`,
          }),
          !showExample && tab!=="attention"
            ? (0,O.jsx)(`div`,{role:`tabpanel`,className:`py-3 text-label text-ink-2`,children:
                `Not available from these records. Choose View example for an illustrative ${tab===`focus`?`focus-by-hour`:`planning accuracy`} chart.`})
            : tab === "focus"
            ? (0, O.jsxs)("div", {
                role: "tabpanel",
                children: [
                  (0, O.jsx)("p", {
                    className: "cr-insight-subline",
                    children:
                      "Example ratings at observed hours · 1 scattered / 3 deep",
                  }),
                  (0, O.jsx)("div", {
                    className: "cr-hour-bars",
                    style:{"--hour-count":sample.length},
                    role: "img",
                    "aria-label":
                      "Illustrative focus ratings, from 09:00 to 22:00; strongest example value at 20:00",
                    children: sample.map(([hour, value]) =>
                      (0, O.jsxs)(
                        "div",
                        {
                          className:
                            "cr-hour-bar " + (Number(hour) >= 19 ? "peak" : ""),
                          
                          children: [
                            (0, O.jsx)("b", { children: value.toFixed(1) }),
                            (0, O.jsx)("i", {
                              style: {
                                height: Math.round((value / 3) * 80) + "px",
                              },
                            }),
                            (0, O.jsx)("span", { children: hour }),
                          ],
                        },
                        hour,
                      ),
                    ),
                  }),
                  (0, O.jsx)("p", {
                    className: "cr-meta",
                    children:
                      "The focus-window example is synthetic. Recall grades measure something different.",
                  }),
                ],
              })
            : tab === "planning"
              ? (0, O.jsxs)("div", {
                  role: "tabpanel",
                  children: [
                    (0, O.jsx)("p", {
                      className: "cr-insight-subline",
                      children:
                        "Example estimated versus completed time · synthetic history",
                    }),
                    ...[
                      ["Topology", "×1.3", "A 50m estimate becomes 65m"],
                      ["Linear Algebra", "×1.1", "A 50m estimate becomes 55m"],
                      [
                        "Real Analysis",
                        "×1.0",
                        "Estimates match in this example",
                      ],
                    ].map(([name, multiple, description]) =>
                      (0, O.jsxs)(
                        "div",
                        {
                          className: "cr-planning-row",
                          children: [
                            (0, O.jsxs)("div", {
                              children: [
                                (0, O.jsx)("strong", { children: name }),
                                (0, O.jsx)("p", { children: description }),
                              ],
                            }),
                            (0, O.jsx)("span", {
                              className: "cr-badge",
                              children: multiple,
                            }),
                          ],
                        },
                        name,
                      ),
                    ),
                    (0, O.jsx)("p", {
                      className: "cr-meta",
                      children:
                        "These multipliers are illustrative, not fitted to your completed sessions.",
                    }),
                  ],
                })
              : (0, O.jsxs)("div", {
                  role: "tabpanel",
                  children: [
                    (0, O.jsx)("p", {
                      className: "cr-insight-subline",
                      children: "Attention · local demonstration session",
                    }),
                    (0, O.jsx)("div", {
                      className: "cr-attention-stats",
                      children: [
                        ["Noticed", Number(s.notices) || 0],
                        ["Drift logged (minutes)", Number(s.drift) || 0],
                        [
                          "Thoughts parked",
                          (s.parked || []).filter((x) => !x.done).length,
                        ],
                      ].map(([name, value]) =>
                        (0, O.jsxs)(
                          "div",
                          {
                            children: [
                              (0, O.jsx)("b", { children: value }),
                              (0, O.jsx)("span", { children: name }),
                            ],
                          },
                          name,
                        ),
                      ),
                    }),
                    (0, O.jsx)("p", {
                      className: "cr-meta",
                      children:
                        "Distractions are recorded separately from focused study time.",
                    }),
                    (0, O.jsxs)("div", {
                      className: "cr-row",
                      children: [
                        b("Log distraction", notice),
                        b("Park a thought", park),
                      ],
                    }),
                  ],
                }),
          (0, O.jsxs)("div", {
            className: "cr-ledger-foot",
            children: [
              (0, O.jsx)("a", {
                href: "#/settings",
                className: "cr-button text",
                children: "Study preferences",
              }),
              (0, O.jsx)("a", {
                href: "#/calendar",
                className: "cr-button text",
                children: "Calendar",
              }),
            ],
          }),
        ],
      }),
      (0, O.jsxs)("div", {
        className: "cr-paper lemma-rhythm-next",
        children: [
          (0, O.jsx)("h3", {
            children: "Make time for the next mathematical step",
          }),
          (0, O.jsx)("p", {
            className: "cr-meta",
            children:
              "Plan one focused study block or reserve review time. Checkpoint progress and due-card counts remain in their respective Lemma pages.",
          }),
          (0, O.jsxs)("div", {
            className: "cr-row",
            children: [
              b("Open focus", focus),
              b("Reserve review time", planReview),
            ],
          }),
        ],
      }),
    ],
  });
}
function F() {
  const [notebookRevision,setNotebookRevision]=(0,E.useState)(0);
  (0,E.useEffect)(()=>{const sync=()=>setNotebookRevision(value=>value+1);window.addEventListener('lemma:notebookchange',sync);return()=>window.removeEventListener('lemma:notebookchange',sync)},[]);
  const saved=(()=>{try{return JSON.parse(sessionStorage.getItem(`lemma.progress.view`)||`{}`)}catch{return {}}})();
  const initialView=new URLSearchParams(location.hash.split(`?`)[1]||``).get(`view`)||saved.view||`overview`;
  const [view,setView]=(0,E.useState)([`overview`,`learning`,`time`].includes(initialView)?initialView:`overview`);
  const [subject,setSubject]=(0,E.useState)(saved.subject||`all`);
  let [e,t]=(0,E.useState)([7,30,90].includes(saved.days)?saved.days:30),n=p(e),i=a();
  const o=(0,E.useMemo)(()=>n.data?h(n.data,e,{timeZone:i.data?.timeZone??`UTC`,rolloverHour:i.data?.rolloverHour??4}):null,[n.data,e,i.data?.timeZone,i.data?.rolloverHour,notebookRevision]);
  (0,E.useEffect)(()=>{sessionStorage.setItem(`lemma.progress.view`,JSON.stringify({view,subject,days:e}))},[view,subject,e]);
  const d=[{name:`Again`,color:`bg-[var(--bad)]`},{name:`Hard`,color:`bg-[var(--warn)]`},{name:`Good`,color:`bg-[var(--grade-good)]`},{name:`Easy`,color:`bg-[var(--easy)]`}];
  const y=o?D(o.minutes):null;
  const completed=o?o.checkpointWeeks.reduce((sum,row)=>sum+(Number(row.demonstrated)||0),0):0;
  const first=o?.reviewBuckets[0]?.date,last=o?.reviewBuckets.at(-1)?.endDate||o?.reviewBuckets.at(-1)?.date;
  const metric=(label,value,definition)=> (0,O.jsxs)(`div`,{className:`notebook-metric`,children:[(0,O.jsx)(`span`,{children:label}),(0,O.jsx)(`strong`,{children:value}),(0,O.jsx)(`small`,{children:definition})]},label);
  return (0,O.jsxs)(`section`,{className:`lemma-insights-page notebook-progress`,children:[
    (0,O.jsxs)(`header`,{className:`notebook-page-intro`,children:[(0,O.jsx)(`h1`,{children:`Progress`}),(0,O.jsx)(NotebookMenu,{}),(0,O.jsx)(`p`,{children:`Small steps, seen over time.`})]}),
    lemmaMode()===`demo`&&(0,O.jsx)(`p`,{className:`lemma-sample-label`,children:`Example workspace · demonstration history`}),
    (0,O.jsxs)('label',{className:'lemma-progress-range',children:[(0,O.jsx)('span',{children:'Time range'}),(0,O.jsx)('select',{'aria-label':'Time range',value:String(e),onChange:event=>t(Number(event.target.value)),children:[7,30,90].map(days=>(0,O.jsx)('option',{value:String(days),children:days+' days'},days))})]}),
    (0,O.jsx)(v,{label:`Progress view`,value:view,onChange:setView,options:[{value:`overview`,label:`Overview`},{value:`learning`,label:`Learning`},{value:`time`,label:`Time`}]}),
    n.isPending||i.isPending?(0,O.jsx)(`p`,{role:`status`,children:`Loading progress…`}):n.isError||i.isError?(0,O.jsxs)(`div`,{role:`alert`,children:[`Couldn’t load progress. `,(0,O.jsx)(`button`,{onClick:()=>{n.refetch();i.refetch()},children:`Try again`})]}):o&&(0,O.jsxs)(`div`,{className:`notebook-progress-content`,"aria-label":`${view} · ${e} days`,children:[
      o.timeNeedsReview&&(0,O.jsxs)('div',{className:'lemma-log-warning',children:[(0,O.jsx)('p',{children:'Some saved time entries overlap or need correction. Each minute is counted once.'}),(0,O.jsx)('button',{type:'button',onClick:()=>window.__carrelIntegration.open('log'),children:'Check your log'})]}),(0,O.jsx)(`p`,{className:`notebook-range-caption`,children:`${lemmaDate(first)} – ${lemmaDate(last)} · ${e} days`}),
      view===`overview`&&(0,O.jsx)(`div`,{className:`notebook-metrics`,"aria-label":`Study totals`,children:[
        metric(`Logged study time`,y?.short,`Recorded session time`),
        metric(`Reviews completed`,g(o.reviews),`Completed responses`),
        metric(`Recall on review`,P(o.recall),`${g(o.reviews)} responses in range`),
        metric(`Checkpoints demonstrated`,g(completed),`Demonstrated events in range`),
      ]}),
      view!==`time`&&(0, O.jsxs)(u, {
                  className: `flex flex-col gap-3 p-4`,
                  children: [
                    (0, O.jsxs)(`div`, {
                      className: `flex items-center justify-between`,
                      children: [
                        (0, O.jsx)(c, { children: `Review-response recall` }),
                        (0, O.jsx)(`strong`, {
                          className: `text-num-l font-medium tabular-nums text-ink`,
                          style: { fontFamily: `var(--font-num)` },
                          children: P(o.recall),
                        }),
                      ],
                    }),
                    (0, O.jsx)(`p`, {
                      className: `text-label text-ink-2`,
                      children: `Share of reviews rated Hard, Good or Easy · target ${Math.round((i.data?.desiredRetention ?? 0.9) * 100)}% · ${o.reviews} reviews in range`,
                    }),
                    (0, O.jsx)(k, {
                      data: o.recallBuckets.map((t, n) => ({
                        label:
                          n === 0
                            ? lemmaDate(t.date)
                            : n === o.recallBuckets.length - 1
                              ? lemmaDate(t.endDate || t.date)
                              : ``,
                        value: t.recall,
                        count: t.count,
                        date: t.date,
                        endDate: t.endDate,
                      })),
                      target: i.data?.desiredRetention ?? 0.9,
                    }),
                    (0, O.jsxs)(`details`, {
                      className: `lemma-chart-data`,
                      children: [
                        (0, O.jsx)(`summary`, {
                          children: `View recall data · ${o.recallBuckets.length} periods`,
                        }),
                        (0, O.jsx)(`div`, {
                          className: `lemma-chart-data-scroll`,
                          children: (0, O.jsxs)(`table`, {
                            children: [
                              (0, O.jsx)(`thead`, {
                                children: (0, O.jsx)(`tr`, {
                                  children: [`Period`, `Recall`, `Reviews`].map(
                                    (v) =>
                                      (0, O.jsx)(
                                        `th`,
                                        { scope: `col`, children: v },
                                        v,
                                      ),
                                  ),
                                }),
                              }),
                              (0, O.jsx)(`tbody`, {
                                children: o.recallBuckets.map((row, index) =>
                                  (0, O.jsxs)(
                                    `tr`,
                                    {
                                      children: [
                                        (0, O.jsx)(`th`, {
                                          scope: `row`,
                                          children: lemmaPeriod(row),
                                        }),
                                        (0, O.jsx)(`td`, {
                                          children:
                                            row.recall === null
                                              ? `—`
                                              : `${Math.round(row.recall * 100)}%`,
                                        }),
                                        (0, O.jsx)(`td`, {
                                          children: Number(row.count) || 0,
                                        }),
                                      ],
                                    },
                                    index,
                                  ),
                                ),
                              }),
                            ],
                          }),
                        }),
                      ],
                    }),
                  ],
                }),
      view===`learning`&&(0, O.jsxs)(u, {
                  className: `flex flex-col gap-3 p-4`,
                  children: [
                    (0, O.jsxs)(c, {
                      children: [`Reviews by `, e===90?`week`:e===30?`six-day period`:`day`],
                    }),
                    (0, O.jsx)(`p`, {
                      className: `text-label text-ink-2`,
                      children: `${lemmaDate(o.reviewBuckets[0]?.date)} – ${lemmaDate(o.reviewBuckets[o.reviewBuckets.length - 1]?.endDate || o.reviewBuckets[o.reviewBuckets.length - 1]?.date)} · ${e===90?`weekly`:e===30?`six-day`:`daily`} counts`,
                    }),
                    (0, O.jsx)(w, {
                      title: e===90?`Reviews by week`:e===30?`Reviews by six-day period`:`Reviews by day`,
                      data: o.reviewBuckets.map((t, n) => ({
                        label: lemmaPeriod(t),
                        fullLabel: lemmaPeriod(t),
                        again: t.again,
                        hard: t.hard,
                        good: t.good,
                        easy: t.easy,
                      })),
                    }),
                  ],
                }),
      view===`learning`&&(0, O.jsxs)(u, {
                  className: `flex flex-col gap-3 p-4`,
                  children: [
                    (0, O.jsx)(c, { children: `Self-rated confidence` }),
                    (0, O.jsx)(`p`, {
                      className: `text-label text-ink-2`,
                      children: `Percent recalled after rating how sure you felt · counts shown beside each bar`,
                    }),
                    (0, O.jsx)(N, { data: o.calibration }),
                    o.calibrationMessage &&
                      (0, O.jsx)(`p`, {
                        className: `border-l-2 border-[var(--ink-2)] pl-3 font-math text-label italic text-ink-2`,
                        children: o.calibrationMessage,
                      }),
                  ],
                }),
      view===`learning`&&(0, O.jsxs)(u, {
                  className: `flex flex-col gap-3 p-4`,
                  children: [
                    (0, O.jsx)(c, {
                      children: `Checkpoint events · selected range`,
                    }),
                    (0, O.jsx)(T, {
                      title:`Checkpoint events · selected ${e}-day range`,
                      data: o.checkpointWeeks.map((row) => ({
                        ...row,
                        label: row.date ? lemmaPeriod(row) : row.label,
                      })),
                      tone: `ink`,
                    }),
                  ],
                }),
      view===`learning`&&(0,O.jsx)(M,{conceptName:o.mostRevisited?.conceptName,label:o.mostRevisited?.label}),
      view==='time'&&(0,O.jsx)('button',{type:'button',className:'notebook-text-button',onClick:()=>window.__carrelIntegration.open('log'),children:'Edit study log'}),view===`time`&&(0,O.jsxs)(`label`,{className:`notebook-stage-picker`,children:[`Time subject`,(0,O.jsxs)(`select`,{"aria-label":"Time subject",value:subject,onChange:event=>setSubject(event.target.value),children:[(0,O.jsx)(`option`,{value:`all`,children:`All subjects`}),...o.subjects.map(row=>(0,O.jsx)(`option`,{value:row.subject.id,children:cPlain(row.subject.name)},row.subject.id))]})]}),
      view===`time`&&(0, O.jsxs)(u, {
                  className: `flex flex-col gap-3 p-4`,
                  children: [
                    (0, O.jsx)(c, { children: `Time by subject` }),
                    (0, O.jsx)(j, {
                      data: o.subjects.filter(row=>subject===`all`||row.subject.id===subject),
                      format: (minutes) => D(minutes).short,
                    }),
                  ],
                }),
      view===`time`&&(0,O.jsx)(`div`,{className:`notebook-metrics`,children:[metric(`Timed sessions`,g(o.sessions),`All subjects · selected range`),metric(`Typical session`,o.typicalSession===null?`—`:D(o.typicalSession).short,`Median duration · all subjects`)]}),
      view===`time`&&(0,O.jsxs)(`details`,{className:`notebook-rhythm-details`,children:[(0,O.jsx)(`summary`,{children:`Study rhythm & examples`}),(0,O.jsx)(`p`,{className:`text-ink-2`,children:`Session context and illustrative examples below are separate from the dated totals above.`}),(0,O.jsx)(LemmaNativeRhythm,{})]}),
    ]}),
  ]});
}
export { F as default };
