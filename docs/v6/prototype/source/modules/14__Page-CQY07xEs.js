import { a as e } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { t } from "@lemma/MathPreview-DJdjEKge.js";
import { n, t as r } from "@lemma/jsx-runtime-DApVmHJR.js";
import { s as i } from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as a } from "@lemma/triangle-alert-Ch3x0hWo.js";
import { t as o } from "@lemma/check-BXZ7pTLx.js";
import {
  Gt as s,
  Vt as c,
  W as l,
  Y as u,
  Z as d,
  _ as f,
  g as p,
  nt as m,
} from "@lemma/index-DcUkykC4.js";
import { t as h } from "@lemma/file-text-DDHC2M3y.js";
import { t as g } from "@lemma/trash-_1FlU6hE.js";
import { i as _ } from "@lemma/ingest-CSWZS6YK.js";
import { t as v } from "@lemma/Button-DTRYSO-L.js";
import { t as y } from "@lemma/Rail-D7h5PCRp.js";
var b = e(n(), 1),
  x = r(),
  S = 52428800,
  C = (e) => _(e) && e.size > 0 && e.size <= S,
  w = (e) =>
    e >= 1048576
      ? (e / 1048576).toFixed(1) + ` MB`
      : Math.ceil(e / 1024) + ` KB`;
async function T(e) {
  let t = await crypto.subtle.digest(`SHA-256`, await e.arrayBuffer());
  return Array.from(new Uint8Array(t), (e) =>
    e.toString(16).padStart(2, `0`),
  ).join(``);
}
function E() {
 const [nameError,setNameError]=(0,b.useState)('');
  let e = i(),
    n = u(),
    r = m(),
    _ = d(),
    [S, E] = (0, b.useState)(``),
    [D, O] = (0, b.useState)([]),
    [k, A] = (0, b.useState)(null),
    [j, M] = (0, b.useState)(!1),
    [N, P] = (0, b.useState)(null),
    F = (0, b.useRef)(null),
    I = (0, b.useRef)(0),
    L = (0, b.useCallback)(() => e(`/projects`), [e]);
  function R(e) {
    let t = Array.from(e),
      n = [],
      r = [];
    for (let e of t)
      C(e)
        ? n.push({
            id: ++I.current,
            file: e,
            name: e.name,
            size: e.size,
            status: `queued`,
            progress: null,
            error: null,
            sha256: null,
          })
        : r.push(e.name);
    (O((e) => [...e, ...n]),
      A(
        r.length
          ? `Sources must be PDF, .tex or .md files, nonempty and at most 50 MB: ` +
              r.join(`, `)
          : null,
      ));
  }
  function z(e, t) {
    O((n) => n.map((n) => (n.id === e ? { ...n, ...t } : n)));
  }
  async function B(t) {
    t.preventDefault();if(j)return;if(!S.trim()){setNameError('Name your project so you can find it later.');document.getElementById('project-title')?.focus();return}setNameError('');
    (M(!0), A(null));
    let i = N;
    try {
      i || ((i = await r.mutateAsync({ title: S.trim() })), P(i));
      let t = new Set(
          D.filter((e) => e.status === `ready` && e.sha256).map(
            (e) => e.sha256,
          ),
        ),
        a = !1;
      for (let e of D)
        if (e.status !== `ready`)
          try {
            let n = e.file;
            if (!n)
              throw Error(`File no longer available. Remove and reselect it.`);
            z(e.id, { status: `reading`, error: null });
            let r = await T(n);
            if (t.has(r)) {
              (z(e.id, { status: `failed`, error: `Already added`, sha256: r }),
                (a = !0));
              continue;
            }
            (await _.mutateAsync({
              projectId: i.id,
              file: n,
              onProgress: (t) => {
                z(e.id, {
                  progress: t,
                  status:
                    t.phase === `done`
                      ? `saving`
                      : t.phase === `failed`
                        ? `failed`
                        : t.phase,
                });
              },
            }),
              t.add(r),
              z(e.id, { status: `ready`, file: null, sha256: r, error: null }));
          } catch (t) {
            (z(e.id, {
              status: `failed`,
              error: t instanceof Error ? t.message : `Upload failed`,
            }),
              (a = !0));
          }
      if (a) {
        n(`Project saved. Retry or remove failed files to continue.`, {
          tone: `danger`,
        });
        return;
      }
      (n(`Project created. Tell your tutor: ` + l(i.title), {
        tone: `success`,
      }),
        e(`/p/` + i.slug + `?tab=sources`));
    } catch (e) {
      (A(e instanceof Error ? e.message : `Could not create project`),
        n(`Could not save your project`, { tone: `danger` }));
    } finally {
      M(!1);
    }
  }
  let V = D.filter((e) => e.status !== `ready`).length;
  return (0, x.jsxs)(x.Fragment, {
    children: [
      (0, x.jsx)(`div`, {
        "data-sheet-background": !0,
        "aria-hidden": `true`,
        inert: !0,
        children: (0, x.jsx)(f, {}),
      }),
      (0, x.jsx)(`h1`, { className: `sr-only`, children: `New project` }),
      (0, x.jsx)(p, {
        open: !0,
        onClose: L,
        title: `New project`,
        children: (0, x.jsxs)(`form`, {
          noValidate:true,
          onSubmit: (e) => {
            B(e);
          },
          className: `flex flex-col gap-5`,
          children: [
            (0, x.jsxs)(`section`, {
              className: `flex flex-col gap-2`,
              children: [
                (0, x.jsx)(`label`, {
                  htmlFor: `project-title`,
                  className: `text-label font-medium text-ink-2`,
                  children: `Name`,
                }),
                (0, x.jsx)(`input`, {
                  id: `project-title`,
                  "aria-describedby": nameError?`project-name-error`:!S.trim()?`project-name-help`:void 0,
                  "aria-invalid":Boolean(nameError),
                  required: !0,
                  maxLength: 100,
                  autoFocus: !0,
                  autoComplete: `off`,
                  value: S,
                  onChange: (e) => {E(e.target.value);setNameError('')},
                  disabled: j || !!N,
                  placeholder: `e.g. Differential geometry`,
                  className: `min-h-12 w-full rounded-ctl border border-edge-2 bg-well px-3 text-headline text-ink`,
                }),
                nameError&&(0,x.jsx)('p',{id:'project-name-error',role:'alert',className:'lemma-field-error',children:nameError}),(0, x.jsx)(t, { source: S }),
                (0, x.jsx)(`p`, {
                  className: `text-label text-ink-2`,
                  children: `Your tutor fills in the subject, goal, teaching style and study plan.`,
                }),
              ],
            }),
            (0, x.jsxs)(`section`, {
              "aria-label": `Sources`,"data-style":"role-sources",
              className: `flex flex-col gap-3`,
              onDragOver: (e) => e.preventDefault(),
              onDrop: (e) => {
                (e.preventDefault(), j || R(e.dataTransfer.files));
              },
              children: [
                (0, x.jsxs)(`div`, {
                  className: `flex items-center justify-between gap-2`,
                  children: [
                    (0, x.jsx)(`h3`, {
                      className: `text-body font-semibold text-ink-2`,
                      children: `Sources (optional)`,
                    }),
                    (0, x.jsx)(`span`, {
                      className: `text-label text-ink-3`,
                      children: `PDF, .tex, .md · 50 MB each`,
                    }),
                  ],
                }),
                (0, x.jsx)(`input`, {
                  ref: F,
                  hidden: !0,
                  type: `file`,
                  multiple: !0,
                  accept: `.pdf,application/pdf,.tex,.latex,.ltx,application/x-tex,text/x-tex,.md,.markdown,text/markdown`,
                  onChange: (e) => {
                    (e.currentTarget.files && R(e.currentTarget.files),
                      (e.currentTarget.value = ``));
                  },
                }),
                (0, x.jsxs)(`button`, {
                  type: `button`,
                  disabled: j,
                  onClick: () => F.current?.click(),
                  className: `flex min-h-24 items-center justify-center gap-2 rounded-slab border border-dashed border-edge-3 bg-fill-1 text-body text-ink-2`,
                  children: [
                    (0, x.jsx)(c, { size: 20, className: `text-ink-2` }),
                    `Add PDFs, .tex or .md files`,
                  ],
                }),
                (0, x.jsx)(`ul`, {
                  "aria-label": `Upload queue`,
                  className: `flex flex-col gap-2`,
                  children: D.map((e) =>
                    (0, x.jsxs)(
                      `li`,
                      {
                        className: `flex min-w-0 items-start gap-3 rounded-slab border border-edge bg-raised p-3`,
                        children: [
                          (0, x.jsx)(h, {
                            size: 19,
                            className: `mt-1 shrink-0 text-ink-2`,
                            "aria-hidden": `true`,
                          }),
                          (0, x.jsxs)(`div`, {
                            className: `min-w-0 flex-1`,
                            children: [
                              (0, x.jsx)(`p`, {
                                className: `truncate text-body font-semibold`,
                                children: e.name,
                              }),
                              (0, x.jsxs)(`p`, {
                                className: `text-label text-ink-3`,
                                children: [
                                  w(e.size),
                                  ` · `,
                                  e.status,
                                  e.progress?.pageCount
                                    ? ` · ` +
                                      e.progress.page +
                                      `/` +
                                      e.progress.pageCount +
                                      ` pages`
                                    : ``,
                                ],
                              }),
                              e.progress &&
                                e.status !== `ready` &&
                                (0, x.jsx)(y, {
                                  className: `mt-2`,
                                  value: e.progress.pageCount
                                    ? e.progress.page / e.progress.pageCount
                                    : 0,
                                  label: `Progress for ` + e.name,
                                }),
                              e.error &&
                                (0, x.jsx)(`p`, {
                                  role: `alert`,
                                  className: `text-label text-again`,
                                  children: e.error,
                                }),
                            ],
                          }),
                          e.status === `ready`
                            ? (0, x.jsx)(o, {
                                size: 18,
                                className: `text-easy`,
                              })
                            : !j &&
                              (0, x.jsx)(`button`, {
                                type: `button`,
                                "aria-label": `Remove ` + e.name,
                                onClick: () =>
                                  O((t) => t.filter((t) => t.id !== e.id)),
                                className: `flex size-11 shrink-0 items-center justify-center text-ink-3`,
                                children: (0, x.jsx)(g, { size: 17 }),
                              }),
                        ],
                      },
                      e.id,
                    ),
                  ),
                }),
              ],
            }),
            k &&
              (0, x.jsxs)(`p`, {
                role: `alert`,
                className: `flex gap-2 text-label text-again`,
                children: [(0, x.jsx)(a, { size: 16 }), k],
              }),
            !S.trim() && (0,x.jsx)(`p`,{
              id:`project-name-help`,
              className:`text-label text-ink-2`,
              children:`Enter a project name to continue.`,
            }),
            (0, x.jsx)(v, {
              size: `xl`,
              className: `w-full`,
              type: `submit`,
              variant: `lit`,
              disabled: j,
              loading: j,
              children: j
                ? `Saving project and sources`
                : N && V
                  ? `Retry remaining uploads`
                  : `Create project`,
            }),
            (0, x.jsxs)(`button`, {
              type: `button`,
              className: `flex min-h-11 items-center justify-center gap-2 text-label text-ink-2 underline-offset-4 hover:underline focus-visible:underline`,
              onClick: () => {
                navigator.clipboard
                  .writeText(l(S.trim() || `your project`))
                  .then(() => n(`Prompt copied`, { tone: `success` }))
                  .catch(() => n(`Copy unavailable`, { tone: `danger` }));
              },
              children: [
                (0, x.jsx)(s, { size: 15 }),
                `Tell your tutor: `,
                l(S.trim() || `your project`),
              ],
            }),
          ],
        }),
      }),
    ],
  });
}
export { E as default };
