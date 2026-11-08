import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { t } from "@lemma/MathPreview-DJdjEKge.js";
import { d as n, l as ee, p as r, t as i } from "@lemma/data-HD2KrcdX.js";
import { n as a, t as o } from "@lemma/jsx-runtime-DApVmHJR.js";
import { s as te, t as ne, u as re } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as ie } from "@lemma/arrow-right-ydNMW8Db.js";
import { t as ae } from "@lemma/book-open-gof2bZqq.js";
import { t as oe } from "@lemma/check-BXZ7pTLx.js";
import {
  $ as se,
  B as ce,
  Ct as le,
  Ht as ue,
  I as s,
  Mt as de,
  P as c,
  R as l,
  St as u,
  X as d,
  Y as f,
  at as p,
  dt as fe,
  g as m,
} from "@lemma/index-DcUkykC4.js";
import { t as pe } from "@lemma/pause-Dg999iF5.js";
import { t as me } from "@lemma/pencil-line-0O_XRBVL.js";
import { t as he } from "@lemma/play-DwFWW3fX.js";
import { t as ge } from "@lemma/trash-_1FlU6hE.js";
import { Editor as _e } from "@lemma/Editor-BGzXmErs.js";
import { t as h } from "@lemma/Button-DTRYSO-L.js";
import { t as g } from "@lemma/Chip-AHlDYqiR.js";
import { t as _ } from "@lemma/MathText-BeTkDDIi.js";
import { t as ve } from "@lemma/Sparkline-5dHkjIwc.js";
var v = e(a(), 1),
  y = o();
function ye(e) {
  if (!e) return `New`;
  let t = Math.ceil((Date.parse(e) - Date.now()) / 864e5);
  return t <= 0 ? `Due now` : t === 1 ? `1 day` : `${t} days`;
}
function be(e) {
  let t = Math.floor((Date.now() - Date.parse(e)) / 864e5);
  return t <= 0 ? `today` : t === 1 ? `yesterday` : `${t} days ago`;
}
function b() {
  let { no: e = `0` } = re(),
    a = Number(e),
    o = se(a),
    b = fe(),
    xe = le(),
    x = d(),
    S = p(),
    C = de(),
    w = u(),
    T = f(),
    Se = te(),
    [E, D] = (0, v.useState)(!1),
    [O, k] = (0, v.useState)(!1),
    [A, j] = (0, v.useState)(``),
    [M, N] = (0, v.useState)([]),
    [P, F] = (0, v.useState)([]),
    [Ce, I] = (0, v.useState)(!1),
    we = (0, v.useCallback)(() => D(!1), []),
    Te = (0, v.useCallback)(() => k(!1), []);
  (0, v.useEffect)(() => {
    if (!o.isLoading) {
      I(!1);
      return;
    }
    let e = setTimeout(() => I(!0), 300);
    return () => clearTimeout(e);
  }, [o.isLoading]);
  let L = o.data,
    R = L?.note,
    z = b.data?.find((e) => e.slug === R?.projectSlug),
    B = L?.cards[0]?.state,
    V = P.at(-1) ?? null,
    H = M.at(-1) ?? null,
    U = r({
      queryKey: [`card-history-page`, a, V],
      queryFn: () => i().getCardHistoryPage(a, V),
      staleTime: 3e4,
      refetchOnWindowFocus: !0,
      enabled: V !== null,
    }),
    W = r({
      queryKey: [`card-comments-page`, a, H],
      queryFn: () => i().getCardCommentsPage(a, H),
      staleTime: 3e4,
      refetchOnWindowFocus: !0,
      enabled: H !== null,
    }),
    G = V === null ? null : U.data,
    K = H === null ? null : W.data,
    q = U.isFetching || W.isFetching,
    J = (H === null ? (L?.comments ?? []) : (K?.rows ?? [])).filter(
      (e) => e.status === `open` || e.status === `addressed`,
    ),
    Y = V === null ? (L?.history ?? []) : (G?.rows ?? []),
    Ee = !!(H === null ? L?.commentsNextCursor : K?.nextCursor),
    De = !!(V === null ? L?.historyNextCursor : G?.nextCursor);
  ((0, v.useEffect)(() => {
    (N([]), F([]));
  }, [a]),
    (0, v.useEffect)(() => {
      U.isError && T(`Couldn't load older reviews.`, { tone: `danger` });
    }, [U.errorUpdatedAt, U.isError, T]),
    (0, v.useEffect)(() => {
      W.isError && T(`Couldn't load older comments.`, { tone: `danger` });
    }, [W.errorUpdatedAt, W.isError, T]));
  let Oe = () => {
      if (q) return;
      let e = V === null ? L?.historyNextCursor : G?.nextCursor;
      e && F((t) => [...t, e]);
    },
    ke = () => {
      q || F((e) => e.slice(0, -1));
    },
    Ae = () => {
      if (q) return;
      let e = H === null ? L?.commentsNextCursor : K?.nextCursor;
      e && N((t) => [...t, e]);
    },
    X = () => {
      q || N((e) => e.slice(0, -1));
    },
    Z = (0, v.useMemo)(() => {
      let e = [...(L?.history ?? [])].sort(
        (e, t) => Date.parse(e.reviewedAt) - Date.parse(t.reviewedAt),
      );
      return e
        .slice(1)
        .map((t, n) => ({
          value: Math.max(
            0,
            (Date.parse(t.reviewedAt) - Date.parse(e[n].reviewedAt)) / 864e5,
          ),
          rating: t.rating,
        }));
    }, [L?.history]),
    Q =
      B?.lastReview && B.stability > 0
        ? n(
            xe.data?.fsrsWeights ?? ee,
            Math.max(0, (Date.now() - Date.parse(B.lastReview)) / 864e5),
            B.stability,
          )
        : null,
    je = async (e) => {
      if (R)
        try {
          (await C.mutateAsync({
            noteNo: R.noteNo,
            patch: {
              front: e.front,
              back: e.back,
              type: e.type,
              kind: e.kind,
              tags: e.tags,
            },
          }),
            D(!1),
            T(`Card updated`));
        } catch {
          T(`Couldn't save the card.`, { tone: `danger` });
        }
    },
    $ = async (e) => {
      if (R)
        try {
          (await w.mutateAsync({ noteNo: R.noteNo, status: e }),
            k(!1),
            T(
              e === `deleted`
                ? `Card deleted`
                : e === `suspended`
                  ? `Card paused`
                  : `Card resumed`,
            ),
            e === `deleted` && Se(`/cards`));
        } catch {
          T(`Couldn't update the card.`, { tone: `danger` });
        }
    },
    Me = async () => {
      if (R && A.trim() && !x.isPending)
        try {
          (await x.mutateAsync({ noteNo: R.noteNo, body: A.trim() }),
            j(``),
            T(`Saved for your tutor`));
        } catch {
          T(`Couldn't save your note.`, { tone: `danger` });
        }
    },
    Ne = async (e) => {
      try {
        (await S.mutateAsync(e), T(`Note dismissed`));
      } catch {
        T(`Couldn't dismiss your note.`, { tone: `danger` });
      }
    };
  return (0, y.jsx)(ce, {
    className: `[&_header_h1]:whitespace-nowrap [&_header_h1]:text-card`,
    title: `Card detail`,
    back: `/cards`,
    actions: R
      ? (0, y.jsxs)(y.Fragment, {
          children: [
            (0,y.jsx)(h,{variant:'ghost',onClick:() => D(!0),children:`Edit card`}),
            (0,y.jsx)(h,{variant:'ghost',disabled:w.isPending,onClick:() =>
                void $(R.status === `suspended` ? `active` : `suspended`),children:R.status === `suspended` ? `Resume card` : `Pause card`}),
            (0,y.jsx)(h,{variant:'danger',onClick:() => k(!0),children:`Delete card`}),
          ],
        })
      : void 0,
    children: o.isLoading
      ? Ce
        ? (0, y.jsxs)(y.Fragment, {
            children: [
              (0, y.jsx)(c, { w: `60%`, h: 20 }),
              (0, y.jsx)(c, { w: `100%`, h: 240 }),
              (0, y.jsx)(c, { w: `100%`, h: 150 }),
            ],
          })
        : null
      : o.isError || !R
        ? (0, y.jsxs)(`div`, {
            children: [
              (0, y.jsx)(`p`, {
                className: `text-ink-2`,
                children: `This card could not be loaded.`,
              }),
              (0, y.jsx)(h, {
                variant: `ghost`,
                onClick: () => void o.refetch(),
                children: `Try again`,
              }),
            ],
          })
        : (0, y.jsxs)(y.Fragment, {
            children: [
              (0, y.jsxs)(`p`, {
                className: `text-label text-ink-3`,
                children: [
                  (0, y.jsx)(`span`, {
                    "aria-hidden": `true`,
                    className: `mr-1 font-math text-card italic text-amber`,
                    children: z?.subject.glyph ?? `∫`,
                  }),
                  ` `,
                  z?.title ?? R.projectSlug,
                  ` `,
                  R.checkpointCode && `· ${R.checkpointCode}`,
                  ` · N`,
                  R.noteNo,
                ],
              }),
              (0, y.jsxs)(l, {
                as: `article`,
                className: `p-5`,
                "aria-label": `Card front and answer`,
                children: [
                  (0, y.jsx)(_, {
                    source: R.front,
                    variant: `card`,
                    interactiveMath: !0,
                    cloze:
                      R.type === `cloze`
                        ? { ord: L.cards[0]?.ord ?? 1, revealed: !1 }
                        : void 0,
                  }),
                  (0, y.jsx)(`div`, {
                    className: `my-6 h-px bg-amber`,
                    "aria-hidden": `true`,
                  }),
                  (0, y.jsx)(_, {
                    source: R.type === `cloze` ? R.front : R.back,
                    variant: `answer`,
                    interactiveMath: !0,
                    cloze:
                      R.type === `cloze`
                        ? { ord: L.cards[0]?.ord ?? 1, revealed: !0 }
                        : void 0,
                  }),
                  (0, y.jsxs)(`div`, {
                    className: `mt-5 flex flex-wrap gap-2`,
                    children: [
                      R.sourceShort &&
                        (0, y.jsxs)(g, {
                          icon: ae,
                          children: [
                            R.sourceShort,
                            R.pageLabel ? ` p. ${R.pageLabel}` : ``,
                          ],
                        }),
                      R.sessionNumber &&
                        (0, y.jsx)(ne, {
                          to: `/s/${R.projectSlug}/${R.sessionNumber}`,
                          className: `inline-flex min-h-11 items-center`,
                          children: (0, y.jsxs)(g, {
                            icon: ue,
                            children: [`S`, R.sessionNumber],
                          }),
                        }),
                      (0, y.jsx)(g, { children: ({why:"Explanation",other:"General"}[R.kind]||R.kind.charAt(0).toUpperCase()+R.kind.slice(1)) }),
                      R.status === `suspended` &&
                        (0, y.jsx)(g, { tone: `amber`, children: `Paused` }),
                    ],
                  }),
                ],
              }),
              (0, y.jsxs)(l, {
                className: `p-5`,
                children: [
                  (0, y.jsx)(`h2`, {
                    className: `mb-4 text-headline font-medium`,
                    style: { fontFamily: `var(--font-display)` },
                    children: `Memory`,
                  }),
                  B&&!Y.length&&(0,y.jsx)('p',{className:'lemma-memory-source',children:V!==null&&U.isPending?'Checking the review history…':U.isError?'Review history is unavailable. These estimates come from the saved schedule.':'Saved or imported schedule · no review events are stored here for this card. Recall is a scheduling estimate.'}),
                  (0, y.jsxs)(`div`, {
                    className: `grid grid-cols-3 gap-2`,
                    children: [
                      (0, y.jsxs)(`div`, {
                        children: [
                          (0, y.jsx)(`p`, {
                            className: `text-label text-ink-3`,
                            children: `Next review`,
                          }),
                          (0, y.jsx)(`p`, {
                            className: `mt-1 font-medium tabular-nums`,
                            style: { fontFamily: `var(--font-num)` },
                            children: ye(B?.due ?? null),
                          }),
                        ],
                      }),
                      (0, y.jsxs)(`div`, {
                        children: [
                          (0, y.jsx)(`p`, {
                            className: `text-label text-ink-3`,
                            children: `Spacing estimate`,
                          }),
                          (0, y.jsx)(`p`, {
                            className: `mt-1 font-medium tabular-nums`,
                            style: { fontFamily: `var(--font-num)` },
                            children:
                              B && B.stability > 0
                                ? `${Math.round(B.stability)} d`
                                : `—`,
                          }),
                        ],
                      }),
                      (0, y.jsxs)(`div`, {
                        children: [
                          (0, y.jsx)(`p`, {
                            className: `text-label text-ink-3`,
                            children: `Likely recall`,
                          }),
                          (0, y.jsx)(`p`, {
                            className: `mt-1 font-medium tabular-nums text-amber`,
                            style: { fontFamily: `var(--font-num)` },
                            children:
                              Q === null ? `—` : `${Math.round(Q * 100)}%`,
                          }),
                        ],
                      }),
                    ],
                  }),
                  Z.length > 0 &&
                    (0, y.jsx)(`div`, {
                      className: `mt-5`,
                      children: (0, y.jsx)(ve, {
                        data: Z,
                        width: 342,
                        height: 64,
                        title: `Intervals between reviews`,
                      }),
                    }),
                ],
              }),
              (0, y.jsxs)(`section`, {
                children: [
                  (0, y.jsx)(`h2`, {
                    className: `mb-4 text-headline font-medium`,
                    style: { fontFamily: `var(--font-display)` },
                    children: `For your tutor`,
                  }),
                  (0, y.jsxs)(`div`, {
                    className: `flex flex-col gap-3`,
                    children: [
                      J.filter((e) => e.status === `open`).map((e) =>
                        (0, y.jsxs)(
                          `div`,
                          {
                            "data-comment-row": !0,
                            className: `border-l-2 border-amber py-2 pl-4 pr-2`,
                            children: [
                              (0, y.jsx)(`p`, {
                                className: `font-math text-body-l italic`,
                                children: e.body,
                              }),
                              (0, y.jsxs)(`p`, {
                                className: `mt-3 text-label text-ink-3`,
                                children: [
                                  (0, y.jsx)(`span`, {
                                    className: `mr-2 inline-block size-1.5 rounded-full bg-amber`,
                                  }),
                                  `Next time you ask to update cards · `,
                                  be(e.createdAt),
                                ],
                              }),
                              (0, y.jsx)(`button`, {
                                className: `mt-2 min-h-11 text-label font-semibold text-amber`,
                                disabled: S.isPending,
                                onClick: () => void Ne(e.no),
                                children: `Dismiss`,
                              }),
                            ],
                          },
                          e.no,
                        ),
                      ),
                      J.filter((e) => e.status === `addressed`).map((e) =>
                        (0, y.jsxs)(
                          `details`,
                          {
                            "data-comment-row": !0,
                            className: `rounded-ctl bg-fill-1 p-4`,
                            children: [
                              (0, y.jsxs)(`summary`, {
                                className: `flex cursor-pointer items-center gap-2 text-label text-ink-2`,
                                children: [
                                  (0, y.jsx)(oe, {
                                    size: 15,
                                    className: `text-easy`,
                                  }),
                                  `Addressed`,
                                  e.resolvedByOrigin
                                    ? ` by ${e.resolvedByOrigin}`
                                    : ``,
                                ],
                              }),
                              (0, y.jsx)(`p`, {
                                className: `mt-3 text-ink-3`,
                                children: e.body,
                              }),
                            ],
                          },
                          e.no,
                        ),
                      ),
                      !J.length &&
                        (0, y.jsx)(`p`, {
                          className: `text-body text-ink-3`,
                          role: H !== null && W.isPending ? `status` : void 0,
                          children:
                            H !== null && W.isPending
                              ? `Loading comments…`
                              : `No active notes on this page.`,
                        }),
                      H !== null &&
                        W.isError &&
                        (0, y.jsx)(`button`, {
                          type: `button`,
                          className: `min-h-11 text-label font-semibold text-amber`,
                          onClick: () => void W.refetch(),
                          children: `Try loading comments again`,
                        }),
                      (0, y.jsxs)(`div`, {
                        className: `flex flex-wrap gap-3`,
                        children: [
                          M.length > 0 &&
                            (0, y.jsx)(`button`, {
                              type: `button`,
                              className: `min-h-11 text-label font-semibold text-amber`,
                              disabled: q,
                              onClick: () => void X(),
                              children: `Newer comments`,
                            }),
                          Ee &&
                            (0, y.jsx)(`button`, {
                              type: `button`,
                              className: `min-h-11 text-label font-semibold text-amber`,
                              disabled: q,
                              onClick: () => void Ae(),
                              children: `More comments`,
                            }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              (0, y.jsxs)(`section`, {
                "aria-label": `Review history`,
                children: [
                  (0, y.jsx)(`h2`, {
                    className: `mb-3 text-headline font-medium`,
                    children: `Recent reviews`,
                  }),
                  Y.map((e, t) =>
                    (0, y.jsxs)(
                      `div`,
                      {
                        "data-review-row": !0,
                        className: `flex min-h-11 items-center justify-between gap-3 border-b border-edge py-2 text-body`,
                        children: [
                          (0, y.jsx)(`span`, {
                            className: `text-ink-2`,
                            children: new Date(
                              e.reviewedAt,
                            ).toLocaleDateString(),
                          }),
                          (0, y.jsx)(`span`, {
                            className: `text-amber`,
                            children:
                              [``, `Again`, `Hard`, `Good`, `Easy`][e.rating] ??
                              `Reviewed`,
                          }),
                          (0, y.jsx)(`span`, {
                            className: `text-ink-3`,
                            children: e.confidence ?? `—`,
                          }),
                        ],
                      },
                      e.reviewedAt + `:` + t,
                    ),
                  ),
                  !Y.length &&
                    (0, y.jsx)(`p`, {
                      className: `text-label text-ink-3`,
                      role: V !== null && U.isPending ? `status` : void 0,
                      children:
                        V !== null && U.isPending
                          ? `Loading reviews…`
                          : `No review events stored here.`,
                    }),
                  V !== null &&
                    U.isError &&
                    (0, y.jsx)(`button`, {
                      type: `button`,
                      className: `min-h-11 text-label font-semibold text-amber`,
                      onClick: () => void U.refetch(),
                      children: `Try loading reviews again`,
                    }),
                  (0, y.jsxs)(`div`, {
                    className: `flex flex-wrap gap-3`,
                    children: [
                      P.length > 0 &&
                        (0, y.jsx)(`button`, {
                          type: `button`,
                          className: `min-h-11 text-label font-semibold text-amber`,
                          disabled: q,
                          onClick: () => void ke(),
                          children: `Newer reviews`,
                        }),
                      De &&
                        (0, y.jsx)(`button`, {
                          type: `button`,
                          className: `min-h-11 text-label font-semibold text-amber`,
                          disabled: q,
                          onClick: () => void Oe(),
                          children: `More reviews`,
                        }),
                    ],
                  }),
                ],
              }),
              (0, y.jsxs)(`form`, {
                className: `flex gap-2 rounded-ctl border border-edge bg-well p-2`,
                onSubmit: (e) => {
                  (e.preventDefault(), Me());
                },
                children: [
                  (0, y.jsx)(`label`, {
                    className: `sr-only`,
                    htmlFor: `tutor-note`,
                    children: `Note for your tutor`,
                  }),
                  (0, y.jsx)(`input`, {
                    id: `tutor-note`,
                    value: A,
                    onChange: (e) => j(e.target.value),
                    maxLength: 500,
                    placeholder: `Note for your tutor`,
                    className: `min-w-0 flex-1 bg-transparent px-2 text-ink outline-none placeholder:text-ink-3`,
                  }),
                  (0, y.jsx)(`button`, {
                    type: `submit`,
                    "aria-label": `Save note for your tutor`,"data-style":"role-note",
                    disabled: !A.trim() || x.isPending,
                    className: `flex size-11 items-center justify-center rounded-ctl bg-amber text-amber-ink disabled:opacity-40`,
                    children: (0, y.jsx)(ie, { size: 20 }),
                  }),
                ],
              }),
              (0, y.jsx)(t, { source: A }),
              (0, y.jsx)(m, {
                open: E,
                onClose: we,
                title: `Edit card`,
                children: (0, y.jsx)(_e, {
                  initial: R,
                  busy: C.isPending,
                  onSubmit: (e) => void je(e),
                }),
              }),
              (0, y.jsxs)(m, {
                open: O,
                onClose: Te,
                title: `Delete this card?`,
                children: [
                  (0, y.jsx)(`p`, {
                    className: `mb-5 text-ink-2`,
                    children: `This removes the card from your library and review queue.`,
                  }),
                  (0, y.jsxs)(`div`, {
                    className: `grid grid-cols-2 gap-3`,
                    children: [
                      (0, y.jsx)(h, {
                        variant: `ghost`,
                        onClick: () => k(!1),
                        children: `Cancel`,
                      }),
                      (0, y.jsx)(h, {
                        variant: `danger`,
                        disabled: w.isPending,
                        onClick: () => void $(`deleted`),
                        children: `Delete card`,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
  });
}
export { b as default };
