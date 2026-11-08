const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f ||
    (m.f = [
      "assets/Editor-BGzXmErs.js",
      "assets/rolldown-runtime-BWaJ3C7D.js",
      "assets/MathPreview-DJdjEKge.js",
      "assets/jsx-runtime-DApVmHJR.js",
      "assets/MathText-BeTkDDIi.js",
      "assets/index-DcUkykC4.js",
      "assets/data-HD2KrcdX.js",
      "assets/api-D6yZPQ_0.js",
      "assets/card-cursor-NnR01fr2.js",
      "assets/derive-BTXnCYPV.js",
      "assets/queue-PP9pbc_d.js",
      "assets/preload-helper-ClvlChHw.js",
      "assets/chunk-6KYCQHYJ-E8utj2VS.js",
      "assets/createLucideIcon-C9eAT1Le.js",
      "assets/motion-DL_I35iP.js",
      "assets/Button-DTRYSO-L.js",
      "assets/arrow-left-wpmFch2_.js",
      "assets/PlugArt-YVnZzBq4.js",
      "assets/Tex-kn8bVMsW.js",
      "assets/render-BH3C9UJ0.js",
      "assets/render-eq8tD27Q.css",
      "assets/math-C0d8VK7L.css",
      "assets/index-DLdcYTsr.css",
    ]),
) => i.map((i) => d[i]);
import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { n as t, t as n } from "@lemma/jsx-runtime-DApVmHJR.js";
import { s as r, t as i } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import {
  _ as a,
  h as o,
  m as s,
  t as c,
  v as l,
} from "@lemma/data-HD2KrcdX.js";
import {
  B as u,
  H as d,
  I as f,
  P as p,
  V as m,
  Vt as h,
  Y as ee,
  dt as g,
  g as _,
  tt as v,
  zt as y,
} from "@lemma/index-DcUkykC4.js";
import { t as b } from "@lemma/Button-DTRYSO-L.js";
import { t as x } from "@lemma/Chip-AHlDYqiR.js";
import { t as S } from "@lemma/Tex-kn8bVMsW.js";
import { t as C } from "@lemma/preload-helper-ClvlChHw.js";
var w = class extends o {
  constructor(e, t) {
    super(e, t);
  }
  bindMethods() {
    (super.bindMethods(),
      (this.fetchNextPage = this.fetchNextPage.bind(this)),
      (this.fetchPreviousPage = this.fetchPreviousPage.bind(this)));
  }
  setOptions(e) {
    ((e._type = `infinite`), super.setOptions(e));
  }
  getOptimisticResult(e) {
    return ((e._type = `infinite`), super.getOptimisticResult(e));
  }
  fetchNextPage(e) {
    return this.fetch({ ...e, meta: { fetchMore: { direction: `forward` } } });
  }
  fetchPreviousPage(e) {
    return this.fetch({ ...e, meta: { fetchMore: { direction: `backward` } } });
  }
  createResult(e, t) {
    let { state: n } = e,
      r = super.createResult(e, t),
      { isFetching: i, isRefetching: o, isError: s, isRefetchError: c } = r,
      u = n.fetchMeta?.fetchMore?.direction,
      d = s && u === `forward`,
      f = i && u === `forward`,
      p = s && u === `backward`,
      m = i && u === `backward`;
    return {
      ...r,
      fetchNextPage: this.fetchNextPage,
      fetchPreviousPage: this.fetchPreviousPage,
      hasNextPage: a(t, n.data),
      hasPreviousPage: l(t, n.data),
      isFetchNextPageError: d,
      isFetchingNextPage: f,
      isFetchPreviousPageError: p,
      isFetchingPreviousPage: m,
      isRefetchError: c && !d && !p,
      isRefetching: o && !f && !m,
    };
  }
};
function T(e, t) {
  return s(e, w, t);
}
var E = e(t(), 1),
  D = new Set([
    `\\`,
    `$`,
    "`",
    `*`,
    `_`,
    `~`,
    `[`,
    `]`,
    `<`,
    `>`,
    `!`,
    `#`,
    `|`,
    `&`,
    `\r`,
    `
`,
  ]);
function O(e) {
  if (!e.length) return !1;
  for (let t of e) if (D.has(t)) return !1;
  return !0;
}
var k = n();
function A(e) {
  return d(e);
}
function j(e) {
  return (
    /[\\$*_`\[\]<>~#!\r\n{}|]/.test(e) ||
    /https?:\/\/|www\.|(?:^|[\s(])[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?=$|[\s),.!?;:])|[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(
      e,
    ) ||
    /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(e)
  );
}
function te({ title: e }) {
  return (0, k.jsx)(`span`, {
    className: `whitespace-nowrap text-base`,
    children: j(e) ? (0, k.jsx)(S, { source: e }) : e,
  });
}
var ne = (0, E.lazy)(() =>
    C(
      () =>
        import(`@lemma/Editor-BGzXmErs.js`).then((e) => ({
          default: e.Editor,
        })),
      __vite__mapDeps([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22,
      ]),
    ),
  ),
  M = 92,
  N = 6;
function P(e) {
  if (!e) return `New`;
  let t = Math.ceil((Date.parse(e) - Date.now()) / 864e5);
  return t <= 0 ? `Due` : t === 1 ? `in 1d` : `in ` + t + `d`;
}
function F() {
  (0,E.useEffect)(()=>{const open=()=>R(true);window.addEventListener('lemma:new-card',open);return()=>window.removeEventListener('lemma:new-card',open)},[]);
  const [visibleCards,setVisibleCards]=(0,E.useState)(20);
  const [filtersOpen,setFiltersOpen]=(0,E.useState)(false);

  let [e, t] = (0, E.useState)(``),
    [n, a] = (0, E.useState)(``),
    [o, s] = (0, E.useState)(``),
    [l, d] = (0, E.useState)(``),
    [C, w] = (0, E.useState)(``),
    [D, j] = (0, E.useState)(``),
    [F, I] = (0, E.useState)(!1),
    [L, R] = (0, E.useState)(()=>new URLSearchParams(location.hash.split('?')[1]||'').get('new')==='1'),
    [z, B] = (0, E.useState)(0),
    [re, V] = (0, E.useState)(500),
    H = (0, E.useRef)(null),
    U = (0, E.useRef)(null),
    [W, G] = (0, E.useState)({ left: !1, right: !1 }),
    K = (0, E.useCallback)(() => {
      let e = U.current;
      if (!e) return;
      let t = e.scrollLeft > 1,
        n = e.scrollLeft + e.clientWidth < e.scrollWidth - 1;
      G((e) => (e.left === t && e.right === n ? e : { left: t, right: n }));
    }, []),
    q = g(),
    J = v(),
    Y = ee(),
    ie = r(),
    ae = (0, E.useCallback)(() => R(!1), []),
    oe = (0, E.useMemo)(
      () =>
        q.data?.map((e) =>
          (0, k.jsx)(
            `span`,
            {
              "data-project-slug": e.slug,
              className: `inline-flex shrink-0`,
              children: (0, k.jsxs)(x, {
                className: `shrink-0 whitespace-nowrap`,
                selected: o === e.slug,
                onClick: () => {
                  (s(e.slug), d(``));
                },
                children: [
                  (0, k.jsx)(`span`, {
                    "aria-hidden": `true`,
                    children: e.subject.glyph,
                  }),
                  (0, k.jsx)(te, { title: e.title }),
                ],
              }),
            },
            e.id,
          ),
        ),
      [q.data, o],
    ),
    se = (0, E.useMemo)(
      () =>
        q.data?.map((e) =>
          (0, k.jsx)(`option`, { value: e.slug, children: A(e.title) }, e.id),
        ),
      [q.data],
    );
  ((0, E.useEffect)(() => {
    let e = U.current;
    if (!e || (K(), typeof ResizeObserver > `u`)) return;
    let t = new ResizeObserver(K);
    return (t.observe(e), () => t.disconnect());
  }, [q.data, K]),
    (0, E.useEffect)(() => {
      let t = setTimeout(() => a(e), 250);
      return () => clearTimeout(t);
    }, [e]));
  let X = T({
      queryKey: [`cards-page-infinite`, n, o, l, C, D, F],
      initialPageParam: 0,
      queryFn: ({ pageParam: e }) =>
        c().searchCardsPage({
          query: n,
          projectSlug: o || void 0,
          checkpointCode: l.trim() || void 0,
          state: C === `` ? void 0 : Number(C),
          noteStatus: D === `` ? void 0 : D,
          hasOpenComments: F || void 0,
          offset: e,

        }),
      getNextPageParam: (e) => e.nextOffset ?? void 0,
      staleTime: 3e4,
    }),
    Z = (0, E.useMemo)(
      () => X.data?.pages.flatMap((e) => e.rows) ?? [],
      [X.data],
    );
  ((0, E.useEffect)(() => {
    setVisibleCards(20);H.current && ((H.current.scrollTop = 0), B(0));
  }, [n, o, l, C, D, F]),
    (0, E.useEffect)(() => {
      let e = H.current;
      if (!e) return;
      let t = () => V(e.clientHeight);
      t();
      let n = new ResizeObserver(t);
      return (n.observe(e), () => n.disconnect());
    }, [X.isPending]));
  let Q = 0,
    $ = Z.length,
    ce = Z.slice(0,visibleCards),
    le = async (e) => {
      try {
        let t = await J.mutateAsync({
          front: e.front,
          back: e.back,
          type: e.type,
          kind: e.kind,
          projectSlug: e.projectSlug,
          checkpointCode: e.checkpointCode,
        });
        (R(!1), Y(`Card created`), ie(`/cards/` + t.noteNo));
      } catch {
        Y(`Couldn't create the card.`, { tone: `danger` });
      }
    },
    ue = X.isPending,
    de =
      W.left && W.right
        ? `linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)`
        : W.left
          ? `linear-gradient(to right, transparent, black 16px, black 100%)`
          : W.right
            ? `linear-gradient(to right, black 0%, black calc(100% - 16px), transparent)`
            : void 0;
  return (0, k.jsxs)(u, {
    title: `Cards`,
    back: `/`,

    children: [
      (0, k.jsxs)(`label`, {
        className: `flex min-h-[var(--row)] min-w-0 items-center gap-3 rounded-ctl border border-edge bg-well px-4 text-ink-3`,
        children: [
          (0, k.jsx)(y, { size: 19 }),
          (0, k.jsx)(`span`, {
            className: `sr-only`,
            children: `Search cards`,
          }),
          (0, k.jsx)(`input`, {
            value: e,
            onChange: (e) => t(e.target.value),
            placeholder: `Search cards`,
            className: `min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3`,
          }),
        ],
      }),
      (0,k.jsxs)(k.Fragment,{children:[
  (0,k.jsxs)('div',{className:'lemma-filter-summary',children:[
    (0,k.jsx)(b,{variant:'ghost',onClick:()=>setFiltersOpen(true),children:'Filters'+([o,l,C,D,F].filter(Boolean).length?' ('+[o,l,C,D,F].filter(Boolean).length+')':'')}),
    (0,k.jsxs)('div',{className:'lemma-active-filters',children:[
      o&&(0,k.jsx)('button',{type:'button',onClick:()=>{s('');d('')},'aria-label':'Remove project filter',children:(q.data?.find(project=>project.slug===o)?.title||o)+' ×'}),
      l&&(0,k.jsx)('button',{type:'button',onClick:()=>d(''),'aria-label':'Remove checkpoint filter',children:l+' ×'}),
      C&&(0,k.jsx)('button',{type:'button',onClick:()=>w(''),'aria-label':'Remove scheduling filter',children:({0:'New',1:'Learning',2:'Review',3:'Relearning'}[C]||C)+' ×'}),
      D&&(0,k.jsx)('button',{type:'button',onClick:()=>j(''),'aria-label':'Remove status filter',children:(D==='suspended'?'Paused':'Active')+' ×'}),
      F&&(0,k.jsx)('button',{type:'button',onClick:()=>I(false),'aria-label':'Remove has notes filter',children:'Has notes ×'})
    ]})
  ]}),
  (0,k.jsxs)(_,{open:filtersOpen,onClose:()=>setFiltersOpen(false),title:'Filter cards',children:[(0, k.jsxs)(`div`, {
        className: `flex min-w-0 flex-wrap gap-2`,
        "aria-label": `Advanced card filters`,
        children: [
          (0, k.jsxs)(`label`, {
            className: `min-w-0 flex-1 text-label text-ink-2`,
            children: [
              `Project`,
              (0, k.jsxs)(`select`, {
                "aria-label": `Filter project`,
                value: o,
                onChange: (e) => {
                  (s(e.target.value), d(``));
                },
                className: `mt-1 min-h-11 w-full min-w-0 rounded-ctl border border-edge bg-well px-2 text-body text-ink`,
                children: [
                  (0, k.jsx)(`option`, { value: ``, children: `All projects` }),
                  se,
                ],
              }),
            ],
          }),
          (0, k.jsxs)(`label`, {
            className: `min-w-0 flex-1 text-label text-ink-2`,
            children: [
              `Checkpoint`,
              (0, k.jsx)(`input`, {
                "aria-label": `Filter checkpoint`,
                value: l,
                onChange: (e) => d(e.target.value),
                className: `mt-1 min-h-11 w-full min-w-0 rounded-ctl border border-edge bg-well px-2 text-body text-ink`,
                placeholder: `All`,
              }),
            ],
          }),
        ],
      }),
      (0, k.jsxs)(`div`, {
        className: `flex w-full min-w-0 flex-wrap gap-2`,
        role: `group`,
        "aria-label": `Scheduling filters`,
        children: [
          (0, k.jsxs)(`label`, {
            className: `min-w-[105px] flex-1 text-label text-ink-2`,
            children: [
              `Scheduling`,
              (0, k.jsxs)(`select`, {
                value: C,
                onChange: (e) => w(e.target.value),
                "aria-label": `Filter scheduling state`,
                className: `mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well px-2 text-body text-ink`,
                children: [
                  (0, k.jsx)(`option`, { value: ``, children: `All states` }),
                  (0, k.jsx)(`option`, { value: `0`, children: `New` }),
                  (0, k.jsx)(`option`, { value: `1`, children: `Learning` }),
                  (0, k.jsx)(`option`, { value: `2`, children: `Review` }),
                  (0, k.jsx)(`option`, { value: `3`, children: `Relearning` }),
                ],
              }),
            ],
          }),
          (0, k.jsxs)(`label`, {
            className: `min-w-[105px] flex-1 text-label text-ink-2`,
            children: [
              `Status`,
              (0, k.jsxs)(`select`, {
                value: D,
                onChange: (e) => j(e.target.value),
                "aria-label": `Filter note status`,"data-style":"role-note",
                className: `mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well px-2 text-body text-ink`,
                children: [
                  (0, k.jsx)(`option`, { value: ``, children: `All statuses` }),
                  (0, k.jsx)(`option`, { value: `active`, children: `Active` }),
                  (0, k.jsx)(`option`, {
                    value: `suspended`,
                    children: `Paused`,
                  }),
                ],
              }),
            ],
          }),
          (0, k.jsx)(x, {
            selected: F,
            onClick: () => I((e) => !e),
            className: `self-end whitespace-nowrap`,
            children: `Has notes`,
          }),
        ],
      }),(0,k.jsx)(b,{onClick:()=>setFiltersOpen(false),children:'Show matching cards'})]})
]}),
      (0, k.jsxs)(`div`, {
        className: `flex items-center justify-between text-label text-ink-3`,
        children: [
          (0, k.jsxs)(`span`, {
            "aria-live": `polite`,
            children: [
              Math.min(Z.length,visibleCards).toLocaleString(),
              ` shown`,
              X.hasNextPage ? ` · more available` : ``,
            ],
          }),
          (o || l || C || D || F || e) &&
            (0, k.jsx)(`button`, {
              type: `button`,
              className: `min-h-11 text-ink-2 underline-offset-2 hover:underline`,
              onClick: () => {
                (s(``), d(``), w(``), j(``), I(!1), t(``), a(``));
              },
              children: `Clear filters`,
            }),
        ],
      }),
      ue
        ? (0, k.jsx)(`div`, {
            className: `flex flex-col gap-2`,
            children: [1, 2, 3, 4].map((e) => (0, k.jsx)(p, { h: 92 }, e)),
          })
        : X.isError
          ? (0, k.jsx)(b, {
              variant: `ghost`,
              onClick: () => void X.refetch(),
              children: `Try again`,
            })
          : Z.length
            ? (0, k.jsxs)(`div`, {
                ref: H,
                "data-card-list": true,
                className: `lemma-card-list`,


                children: [
                  (0, k.jsx)(`div`, {
                    style: { height: Q * M },
                    "aria-hidden": `true`,
                  }),
                  ce.map((e) =>
                    (0, k.jsxs)(
                      i,
                      {
                        to: `/cards/` + e.noteNo,
                        "data-card-row": !0,
                        className: `flex min-w-0 items-center gap-3 overflow-hidden border-b border-edge px-2 py-2 focus-visible:outline-2 focus-visible:outline-amber`,
                        style: { minHeight: M },
                        children: [
                          (0, k.jsx)(`span`, {
                            "aria-hidden": `true`,
                            "data-card-subject-glyph": !0,
                            className: `w-6 shrink-0 text-center font-math text-card italic text-ink-2`,
                            children: e.glyph,
                          }),
                          (0, k.jsxs)(`div`, {
                            className: `min-w-0 flex-1`,
                            children: [
                              (0, k.jsx)(`div`, {
                                "data-card-front": ``,
                                "data-card-front-preview": ``,
                                className:
                                  `min-w-0 max-w-full font-math text-headline leading-snug text-ink ` +
                                  (m(e.front)
                                    ? `block overflow-x-auto whitespace-nowrap`
                                    : `line-clamp-2 overflow-hidden`),
                                style: m(e.front)
                                  ? {
                                      maskImage: `linear-gradient(to right, black 0%, black calc(100% - 12px), transparent 100%)`,
                                    }
                                  : void 0,
                                children: (0, k.jsx)(`span`, {
                                  className: m(e.front)
                                    ? `inline-block min-w-max pr-4`
                                    : void 0,
                                  children: O(e.front)
                                    ? e.front
                                    : (0, k.jsx)(S, { source: e.front }),
                                }),
                              }),
                              (0, k.jsxs)(`span`, {
                                className: `mt-1 flex flex-wrap items-center gap-2 text-label text-ink-3`,
                                children: [
                                  (0, k.jsx)(`span`, {
                                    className: `inline-flex min-w-10 justify-center rounded-[3px] border border-edge px-1 py-0.5`,
                                    children: e.checkpointCode ?? `—`,
                                  }),
                                  (0, k.jsx)(`span`, {
                                    children:
                                      e.status === `suspended`
                                        ? `Paused`
                                        : P(e.due),
                                  }),
                                  e.openComments > 0 &&
                                    (0, k.jsxs)(`span`, {
                                      "data-card-open-comments": !0,
                                      className: `text-ink-2`,
                                      children: [e.openComments, ` notes`],
                                    }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      },
                      e.noteNo,
                    ),
                  ),
                  (0, k.jsx)(`div`, {
                    style: { height: 0 },
                    "aria-hidden": `true`,
                  }),
                ],
              })
            : (0, k.jsxs)(`div`, {
                className: `py-12 text-center`,
                children: [
                  (0, k.jsx)(`h2`, {
                    className: `text-card font-semibold`,
                    children: `No cards match`,
                  }),
                  (0, k.jsx)(b, {
                    variant: `text`,
                    onClick: () => {
                      (t(``), s(``), w(``), j(``), d(``), I(!1));
                    },
                    children: `Clear filters`,
                  }),
                ],
              }),
      (X.hasNextPage||visibleCards<Z.length) &&
        (0, k.jsx)(b, {
          variant: `ghost`,
          disabled: X.isFetchingNextPage,
          onClick: async () => {if(visibleCards+20>Z.length&&X.hasNextPage)await X.fetchNextPage();setVisibleCards(n=>n+20)},
          children: X.isFetchingNextPage ? `Loading 20 more…` : `Load 20 more`,
        }),
      (0, k.jsx)(_, {
        open: L,
        onClose: ae,
        title: `New card`,
        children: (0, k.jsx)(E.Suspense, {
          fallback: (0, k.jsx)(p, { h: 180 }),
          children:
            L &&
            (0, k.jsx)(ne, {
              creating: !0,
              busy: J.isPending,
              onSubmit: (e) => void le(e),
            }),
        }),
      }),
    ],
  });
}
export { F as default };
