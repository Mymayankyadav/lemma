const __vite__mapDeps = (i) => [];
import { a as e, r as t, t as n } from "@lemma/rolldown-runtime-BWaJ3C7D.js";
import { n as r, t as i } from "@lemma/jsx-runtime-DApVmHJR.js";
import {
  A as a,
  C as o,
  D as s,
  E as c,
  F as l,
  I as u,
  L as d,
  M as f,
  N as p,
  O as m,
  P as h,
  S as g,
  T as _,
  a as v,
  b as y,
  c as b,
  g as ee,
  j as te,
  k as ne,
  n as re,
  p as x,
  r as ie,
  t as S,
  w as ae,
  x as oe,
  y as se,
} from "@lemma/data-HD2KrcdX.js";
import {
  a as ce,
  c as le,
  d as ue,
  f as de,
  i as C,
  l as fe,
  n as pe,
  o as me,
  r as he,
  s as ge,
  t as _e,
} from "@lemma/chunk-6KYCQHYJ-E8utj2VS.js";
import { t as ve } from "@lemma/api-D6yZPQ_0.js";
import {
  _ as ye,
  a as be,
  g as xe,
  h as Se,
  i as Ce,
  n as we,
  o as w,
  r as T,
  t as E,
  v as Te,
} from "@lemma/createLucideIcon-C9eAT1Le.js";
import { t as D } from "@lemma/preload-helper-ClvlChHw.js";
import {
  a as Ee,
  i as De,
  n as O,
  r as Oe,
  t as ke,
} from "@lemma/motion-DL_I35iP.js";
import { t as Ae } from "@lemma/Button-DTRYSO-L.js";
import { t as je } from "@lemma/arrow-left-wpmFch2_.js";
import { n as Me, t as Ne } from "@lemma/PlugArt-YVnZzBq4.js";
import { t as Pe } from "@lemma/Tex-kn8bVMsW.js";
import { n as lemmaEstimateMinutes } from "@lemma/insights-DjL4G0LE.js";
(function () {
  let e = document.createElement(`link`).relList;
  if (e && e.supports && e.supports(`modulepreload`)) return;
  for (let e of document.querySelectorAll(`link[rel="modulepreload"]`)) n(e);
  new MutationObserver((e) => {
    for (let t of e)
      if (t.type === `childList`)
        for (let e of t.addedNodes)
          e.tagName === `LINK` && e.rel === `modulepreload` && n(e);
  }).observe(document, { childList: !0, subtree: !0 });
  function t(e) {
    let t = {};
    return (
      e.integrity && (t.integrity = e.integrity),
      e.referrerPolicy && (t.referrerPolicy = e.referrerPolicy),
      (t.credentials =
        e.crossOrigin === `use-credentials`
          ? `include`
          : e.crossOrigin === `anonymous`
            ? `omit`
            : `same-origin`),
      t
    );
  }
  function n(e) {
    if (e.ep) return;
    e.ep = !0;
    let n = t(e);
    fetch(e.href, n);
  }
})();
var Fe = n((e) => {
    function t(e, t) {
      var n = e.length;
      e.push(t);
      a: for (; 0 < n;) {
        var r = (n - 1) >>> 1,
          a = e[r];
        if (0 < i(a, t)) ((e[r] = t), (e[n] = a), (n = r));
        else break a;
      }
    }
    function n(e) {
      return e.length === 0 ? null : e[0];
    }
    function r(e) {
      if (e.length === 0) return null;
      var t = e[0],
        n = e.pop();
      if (n !== t) {
        e[0] = n;
        a: for (var r = 0, a = e.length, o = a >>> 1; r < o;) {
          var s = 2 * (r + 1) - 1,
            c = e[s],
            l = s + 1,
            u = e[l];
          if (0 > i(c, n))
            l < a && 0 > i(u, c)
              ? ((e[r] = u), (e[l] = n), (r = l))
              : ((e[r] = c), (e[s] = n), (r = s));
          else if (l < a && 0 > i(u, n)) ((e[r] = u), (e[l] = n), (r = l));
          else break a;
        }
      }
      return t;
    }
    function i(e, t) {
      var n = e.sortIndex - t.sortIndex;
      return n === 0 ? e.id - t.id : n;
    }
    if (
      ((e.unstable_now = void 0),
      typeof performance == `object` && typeof performance.now == `function`)
    ) {
      var a = performance;
      e.unstable_now = function () {
        return a.now();
      };
    } else {
      var o = Date,
        s = o.now();
      e.unstable_now = function () {
        return o.now() - s;
      };
    }
    var c = [],
      l = [],
      u = 1,
      d = null,
      f = 3,
      p = !1,
      m = !1,
      h = !1,
      g = !1,
      _ = typeof setTimeout == `function` ? setTimeout : null,
      v = typeof clearTimeout == `function` ? clearTimeout : null,
      y = typeof setImmediate < `u` ? setImmediate : null;
    function b(e) {
      for (var i = n(l); i !== null;) {
        if (i.callback === null) r(l);
        else if (i.startTime <= e)
          (r(l), (i.sortIndex = i.expirationTime), t(c, i));
        else break;
        i = n(l);
      }
    }
    function ee(e) {
      if (((h = !1), b(e), !m)) {
        if (n(c) !== null) ((m = !0), te || ((te = !0), ae()));
        else {
          var t = n(l);
          t !== null && ce(ee, t.startTime - e);
        }
      }
    }
    var te = !1,
      ne = -1,
      re = 5,
      x = -1;
    function ie() {
      return g ? !0 : !(e.unstable_now() - x < re);
    }
    function S() {
      if (((g = !1), te)) {
        var t = e.unstable_now();
        x = t;
        var i = !0;
        try {
          a: {
            ((m = !1), h && ((h = !1), v(ne), (ne = -1)), (p = !0));
            var a = f;
            try {
              b: {
                for (
                  b(t), d = n(c);
                  d !== null && !(d.expirationTime > t && ie());
                ) {
                  var o = d.callback;
                  if (typeof o == `function`) {
                    ((d.callback = null), (f = d.priorityLevel));
                    var s = o(d.expirationTime <= t);
                    if (((t = e.unstable_now()), typeof s == `function`)) {
                      ((d.callback = s), b(t), (i = !0));
                      break b;
                    }
                    (d === n(c) && r(c), b(t));
                  } else r(c);
                  d = n(c);
                }
                if (d !== null) i = !0;
                else {
                  var u = n(l);
                  (u !== null && ce(ee, u.startTime - t), (i = !1));
                }
              }
              break a;
            } finally {
              ((d = null), (f = a), (p = !1));
            }
            i = void 0;
          }
        } finally {
          i ? ae() : (te = !1);
        }
      }
    }
    var ae;
    if (typeof y == `function`)
      ae = function () {
        y(S);
      };
    else if (typeof MessageChannel < `u`) {
      var oe = new MessageChannel(),
        se = oe.port2;
      ((oe.port1.onmessage = S),
        (ae = function () {
          se.postMessage(null);
        }));
    } else
      ae = function () {
        _(S, 0);
      };
    function ce(t, n) {
      ne = _(function () {
        t(e.unstable_now());
      }, n);
    }
    ((e.unstable_IdlePriority = 5),
      (e.unstable_ImmediatePriority = 1),
      (e.unstable_LowPriority = 4),
      (e.unstable_NormalPriority = 3),
      (e.unstable_Profiling = null),
      (e.unstable_UserBlockingPriority = 2),
      (e.unstable_cancelCallback = function (e) {
        e.callback = null;
      }),
      (e.unstable_forceFrameRate = function (e) {
        0 > e || 125 < e
          ? console.error(
              `forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported`,
            )
          : (re = 0 < e ? Math.floor(1e3 / e) : 5);
      }),
      (e.unstable_getCurrentPriorityLevel = function () {
        return f;
      }),
      (e.unstable_next = function (e) {
        switch (f) {
          case 1:
          case 2:
          case 3:
            var t = 3;
            break;
          default:
            t = f;
        }
        var n = f;
        f = t;
        try {
          return e();
        } finally {
          f = n;
        }
      }),
      (e.unstable_requestPaint = function () {
        g = !0;
      }),
      (e.unstable_runWithPriority = function (e, t) {
        switch (e) {
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
            break;
          default:
            e = 3;
        }
        var n = f;
        f = e;
        try {
          return t();
        } finally {
          f = n;
        }
      }),
      (e.unstable_scheduleCallback = function (r, i, a) {
        var o = e.unstable_now();
        switch (
          (typeof a == `object` && a
            ? ((a = a.delay), (a = typeof a == `number` && 0 < a ? o + a : o))
            : (a = o),
          r)
        ) {
          case 1:
            var s = -1;
            break;
          case 2:
            s = 250;
            break;
          case 5:
            s = 1073741823;
            break;
          case 4:
            s = 1e4;
            break;
          default:
            s = 5e3;
        }
        return (
          (s = a + s),
          (r = {
            id: u++,
            callback: i,
            priorityLevel: r,
            startTime: a,
            expirationTime: s,
            sortIndex: -1,
          }),
          a > o
            ? ((r.sortIndex = a),
              t(l, r),
              n(c) === null &&
                r === n(l) &&
                (h ? (v(ne), (ne = -1)) : (h = !0), ce(ee, a - o)))
            : ((r.sortIndex = s),
              t(c, r),
              m || p || ((m = !0), te || ((te = !0), ae()))),
          r
        );
      }),
      (e.unstable_shouldYield = ie),
      (e.unstable_wrapCallback = function (e) {
        var t = f;
        return function () {
          var n = f;
          f = t;
          try {
            return e.apply(this, arguments);
          } finally {
            f = n;
          }
        };
      }));
  }),
  Ie = n((e, t) => {
    t.exports = Fe();
  }),
  Le = n((e) => {
    var t = r();
    function n(e) {
      var t = `https://react.dev/errors/` + e;
      if (1 < arguments.length) {
        t += `?args[]=` + encodeURIComponent(arguments[1]);
        for (var n = 2; n < arguments.length; n++)
          t += `&args[]=` + encodeURIComponent(arguments[n]);
      }
      return (
        `Minified React error #` +
        e +
        `; visit ` +
        t +
        ` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`
      );
    }
    function i() {}
    var a = {
        d: {
          f: i,
          r: function () {
            throw Error(n(522));
          },
          D: i,
          C: i,
          L: i,
          m: i,
          X: i,
          S: i,
          M: i,
        },
        p: 0,
        findDOMNode: null,
      },
      o = Symbol.for(`react.portal`),
      s = Symbol.for(`react.recoverable`),
      c = Symbol.for(`react.optimistic_key`);
    function l(e, t, n) {
      var r =
        3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
      return {
        $$typeof: o,
        key: r == null ? null : r === c ? c : `` + r,
        children: e,
        containerInfo: t,
        implementation: n,
      };
    }
    var u = t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    function d(e, t) {
      if (e === `font`) return ``;
      if (typeof t == `string`) return t === `use-credentials` ? t : ``;
    }
    ((e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = a),
      (e.browser = function (e) {
        return { $$typeof: s, _reason: e };
      }),
      (e.createPortal = function (e, t) {
        var r =
          2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
        if (!t || (t.nodeType !== 1 && t.nodeType !== 9 && t.nodeType !== 11))
          throw Error(n(299));
        return l(e, t, null, r);
      }),
      (e.flushSync = function (e) {
        var t = u.T,
          n = a.p;
        try {
          if (((u.T = null), (a.p = 2), e)) return e();
        } finally {
          ((u.T = t), (a.p = n), a.d.f());
        }
      }),
      (e.preconnect = function (e, t) {
        typeof e == `string` &&
          (t
            ? ((t = t.crossOrigin),
              (t =
                typeof t == `string`
                  ? t === `use-credentials`
                    ? t
                    : ``
                  : void 0))
            : (t = null),
          a.d.C(e, t));
      }),
      (e.prefetchDNS = function (e) {
        typeof e == `string` && a.d.D(e);
      }),
      (e.preinit = function (e, t) {
        if (typeof e == `string` && t && typeof t.as == `string`) {
          var n = t.as,
            r = d(n, t.crossOrigin),
            i = typeof t.integrity == `string` ? t.integrity : void 0,
            o = typeof t.fetchPriority == `string` ? t.fetchPriority : void 0;
          n === `style`
            ? a.d.S(
                e,
                typeof t.precedence == `string` ? t.precedence : void 0,
                { crossOrigin: r, integrity: i, fetchPriority: o },
              )
            : n === `script` &&
              a.d.X(e, {
                crossOrigin: r,
                integrity: i,
                fetchPriority: o,
                nonce: typeof t.nonce == `string` ? t.nonce : void 0,
              });
        }
      }),
      (e.preinitModule = function (e, t) {
        if (typeof e == `string`) {
          if (typeof t == `object` && t) {
            if (t.as == null || t.as === `script`) {
              var n = d(t.as, t.crossOrigin);
              a.d.M(e, {
                crossOrigin: n,
                integrity:
                  typeof t.integrity == `string` ? t.integrity : void 0,
                nonce: typeof t.nonce == `string` ? t.nonce : void 0,
                fetchPriority:
                  typeof t.fetchPriority == `string` ? t.fetchPriority : void 0,
              });
            }
          } else t ?? a.d.M(e);
        }
      }),
      (e.preload = function (e, t) {
        if (
          typeof e == `string` &&
          typeof t == `object` &&
          t &&
          typeof t.as == `string`
        ) {
          var n = t.as,
            r = d(n, t.crossOrigin);
          a.d.L(e, n, {
            crossOrigin: r,
            integrity: typeof t.integrity == `string` ? t.integrity : void 0,
            nonce: typeof t.nonce == `string` ? t.nonce : void 0,
            type: typeof t.type == `string` ? t.type : void 0,
            fetchPriority:
              typeof t.fetchPriority == `string` ? t.fetchPriority : void 0,
            referrerPolicy:
              typeof t.referrerPolicy == `string` ? t.referrerPolicy : void 0,
            imageSrcSet:
              typeof t.imageSrcSet == `string` ? t.imageSrcSet : void 0,
            imageSizes: typeof t.imageSizes == `string` ? t.imageSizes : void 0,
            media: typeof t.media == `string` ? t.media : void 0,
          });
        }
      }),
      (e.preloadModule = function (e, t) {
        if (typeof e == `string`) {
          if (t) {
            var n = d(t.as, t.crossOrigin);
            a.d.m(e, {
              as: typeof t.as == `string` && t.as !== `script` ? t.as : void 0,
              crossOrigin: n,
              integrity: typeof t.integrity == `string` ? t.integrity : void 0,
              nonce: typeof t.nonce == `string` ? t.nonce : void 0,
              fetchPriority:
                typeof t.fetchPriority == `string` ? t.fetchPriority : void 0,
            });
          } else a.d.m(e);
        }
      }),
      (e.requestFormReset = function (e) {
        a.d.r(e);
      }),
      (e.unstable_batchedUpdates = function (e, t) {
        return e(t);
      }),
      (e.useFormState = function (e, t, n) {
        return u.H.useFormState(e, t, n);
      }),
      (e.useFormStatus = function () {
        return u.H.useHostTransitionStatus();
      }),
      (e.version = `19.3.1`));
  }),
  Re = n((e, t) => {
    function n() {
      if (
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < `u` &&
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE == `function`
      )
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
        } catch (e) {
          console.error(e);
        }
    }
    (n(), (t.exports = Le()));
  }),
  ze = n((e) => {
    var t = Ie(),
      n = r(),
      i = Re();
    function a(e) {
      var t = `https://react.dev/errors/` + e;
      if (1 < arguments.length) {
        t += `?args[]=` + encodeURIComponent(arguments[1]);
        for (var n = 2; n < arguments.length; n++)
          t += `&args[]=` + encodeURIComponent(arguments[n]);
      }
      return (
        `Minified React error #` +
        e +
        `; visit ` +
        t +
        ` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`
      );
    }
    function o(e) {
      return !(
        !e ||
        (e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11)
      );
    }
    function s(e) {
      for (var t = e, n = t; n && !n.alternate;)
        ((t = n), t.flags & 4098 && (e = t.return), (n = t.return));
      for (; t.return;) t = t.return;
      return t.tag === 3 ? e : null;
    }
    function c(e) {
      if (e.tag === 13) {
        var t = e.memoizedState;
        if (
          (t === null &&
            ((e = e.alternate), e !== null && (t = e.memoizedState)),
          t !== null)
        )
          return t.dehydrated;
      }
      return null;
    }
    function l(e) {
      if (e.tag === 31) {
        var t = e.memoizedState;
        if (
          (t === null &&
            ((e = e.alternate), e !== null && (t = e.memoizedState)),
          t !== null)
        )
          return t.dehydrated;
      }
      return null;
    }
    function u(e) {
      if (s(e) !== e) throw Error(a(188));
    }
    function d(e) {
      var t = e.alternate;
      if (!t) {
        if (((t = s(e)), t === null)) throw Error(a(188));
        return t === e ? e : null;
      }
      for (var n = e, r = t; ;) {
        var i = n.return;
        if (i === null) break;
        var o = i.alternate;
        if (o === null) {
          if (((r = i.return), r !== null)) {
            n = r;
            continue;
          }
          break;
        }
        if (i.child === o.child) {
          for (o = i.child; o;) {
            if (o === n) return (u(i), e);
            if (o === r) return (u(i), t);
            o = o.sibling;
          }
          throw Error(a(188));
        }
        if (n.return !== r.return) ((n = i), (r = o));
        else {
          for (var c = !1, l = i.child; l;) {
            if (l === n) {
              ((c = !0), (n = i), (r = o));
              break;
            }
            if (l === r) {
              ((c = !0), (r = i), (n = o));
              break;
            }
            l = l.sibling;
          }
          if (!c) {
            for (l = o.child; l;) {
              if (l === n) {
                ((c = !0), (n = o), (r = i));
                break;
              }
              if (l === r) {
                ((c = !0), (r = o), (n = i));
                break;
              }
              l = l.sibling;
            }
            if (!c) throw Error(a(189));
          }
        }
        if (n.alternate !== r) throw Error(a(190));
      }
      if (n.tag !== 3) throw Error(a(188));
      return n.stateNode.current === n ? e : t;
    }
    function f(e) {
      var t = e.tag;
      if (t === 5 || t === 26 || t === 27 || t === 6) return e;
      for (e = e.child; e !== null;) {
        if (((t = f(e)), t !== null)) return t;
        e = e.sibling;
      }
      return null;
    }
    function p(e, t, n, r, i, a) {
      for (; e !== null;) {
        if (
          ((e.tag === 5 || e.tag === 27 || e.tag === 6) && n(e, r, i, a)) ||
          ((e.tag !== 22 || e.memoizedState === null) &&
            (t || (e.tag !== 5 && e.tag !== 27)) &&
            p(e.child, t, n, r, i, a))
        )
          return !0;
        e = e.sibling;
      }
      return !1;
    }
    function m(e) {
      for (e = e.return; e !== null;) {
        if (e.tag === 3 || e.tag === 5 || e.tag === 27) return e;
        e = e.return;
      }
      return null;
    }
    function h(e) {
      var t = !1;
      for (
        e = e.return;
        e !== null &&
        (e.tag === 4 && (t = !0), e.tag !== 3 && e.tag !== 5 && e.tag !== 27);
      )
        e = e.return;
      return t;
    }
    function g(e) {
      var t = [null, null],
        n = m(e);
      return (n === null || _(t, e, n.child, { foundSelf: !1 }), t);
    }
    function _(e, t, n, r) {
      for (; n !== null;) {
        if (n === t) r.foundSelf = !0;
        else if (n.tag === 5 || n.tag === 27 || n.tag === 6) {
          if (r.foundSelf) return ((e[1] = n), !0);
          e[0] = n;
        } else if (
          (n.tag !== 22 || n.memoizedState === null) &&
          _(e, t, n.child, r)
        )
          return !0;
        n = n.sibling;
      }
      return !1;
    }
    function v(e) {
      switch (e.tag) {
        case 5:
        case 27:
        case 6:
          return e.stateNode;
        case 3:
          return e.stateNode.containerInfo;
        default:
          throw Error(a(559));
      }
    }
    var y = null,
      b = null;
    function ee(e, t, n) {
      return e === n || (e === t && ((y = e), !0));
    }
    function te(e, t, n) {
      return e === n ? ((b = e), !1) : e === t && (b !== null && (y = e), !0);
    }
    function ne(e) {
      if (e === null) return null;
      do e = e === null ? null : e.return;
      while (e && e.tag !== 5 && e.tag !== 27 && e.tag !== 3);
      return e || null;
    }
    function re(e, t, n) {
      for (var r = 0, i = e; i; i = n(i)) r++;
      i = 0;
      for (var a = t; a; a = n(a)) i++;
      for (; 0 < r - i;) ((e = n(e)), r--);
      for (; 0 < i - r;) ((t = n(t)), i--);
      for (; r--;) {
        if (e === t || (t !== null && e === t.alternate)) return e;
        ((e = n(e)), (t = n(t)));
      }
      return null;
    }
    var x = Object.assign,
      ie = Symbol.for(`react.element`),
      S = Symbol.for(`react.transitional.element`),
      ae = Symbol.for(`react.portal`),
      oe = Symbol.for(`react.fragment`),
      se = Symbol.for(`react.strict_mode`),
      ce = Symbol.for(`react.profiler`),
      le = Symbol.for(`react.consumer`),
      ue = Symbol.for(`react.context`),
      de = Symbol.for(`react.forward_ref`),
      C = Symbol.for(`react.suspense`),
      fe = Symbol.for(`react.suspense_list`),
      pe = Symbol.for(`react.memo`),
      me = Symbol.for(`react.lazy`),
      he = Symbol.for(`react.activity`),
      ge = Symbol.for(`react.legacy_hidden`),
      _e = Symbol.for(`react.memo_cache_sentinel`),
      ve = Symbol.for(`react.view_transition`),
      ye = Symbol.for(`react.recoverable`),
      be = Symbol.iterator;
    function xe(e) {
      return typeof e != `object` || !e
        ? null
        : ((e = (be && e[be]) || e[`@@iterator`]),
          typeof e == `function` ? e : null);
    }
    var Se = Symbol.for(`react.client.reference`);
    function Ce(e) {
      if (e == null) return null;
      if (typeof e == `function`)
        return e.$$typeof === Se ? null : e.displayName || e.name || null;
      if (typeof e == `string`) return e;
      switch (e) {
        case oe:
          return `Fragment`;
        case ce:
          return `Profiler`;
        case se:
          return `StrictMode`;
        case C:
          return `Suspense`;
        case fe:
          return `SuspenseList`;
        case he:
          return `Activity`;
        case ve:
          return `ViewTransition`;
      }
      if (typeof e == `object`)
        switch (e.$$typeof) {
          case ae:
            return `Portal`;
          case ue:
            return e.displayName || `Context`;
          case le:
            return (e._context.displayName || `Context`) + `.Consumer`;
          case de:
            var t = e.render;
            return (
              (e = e.displayName),
              (e ||=
                ((e = t.displayName || t.name || ``),
                e === `` ? `ForwardRef` : `ForwardRef(` + e + `)`)),
              e
            );
          case pe:
            return (
              (t = e.displayName || null),
              t === null ? Ce(e.type) || `Memo` : t
            );
          case me:
            ((t = e._payload), (e = e._init));
            try {
              return Ce(e(t));
            } catch {}
        }
      return null;
    }
    var we = Array.isArray,
      w = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      T = i.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      E = { pending: !1, data: null, method: null, action: null },
      Te = [],
      D = -1;
    function Ee(e) {
      return { current: e };
    }
    function De(e) {
      0 > D || ((e.current = Te[D]), (Te[D] = null), D--);
    }
    function O(e, t) {
      (D++, (Te[D] = e.current), (e.current = t));
    }
    var Oe = Ee(null),
      ke = Ee(null),
      Ae = Ee(null),
      je = Ee(null);
    function Me(e, t) {
      switch ((O(Ae, t), O(ke, e), O(Oe, null), t.nodeType)) {
        case 9:
        case 11:
          e = (e = t.documentElement) && (e = e.namespaceURI) ? up(e) : 0;
          break;
        default:
          if (((e = t.tagName), (t = t.namespaceURI)))
            ((t = up(t)), (e = dp(t, e)));
          else
            switch (e) {
              case `svg`:
                e = 1;
                break;
              case `math`:
                e = 2;
                break;
              default:
                e = 0;
            }
      }
      (De(Oe), O(Oe, e));
    }
    function Ne() {
      (De(Oe), De(ke), De(Ae));
    }
    function Pe(e) {
      var t = e.memoizedState;
      (t !== null && ((sh._currentValue = t.memoizedState), O(je, e)),
        (t = Oe.current));
      var n = dp(t, e.type);
      t !== n && (O(ke, e), O(Oe, n));
    }
    function Fe(e) {
      (ke.current === e && (De(Oe), De(ke)),
        je.current === e && (De(je), (sh._currentValue = E)));
    }
    var Le, ze;
    function Be(e) {
      if (Le === void 0)
        try {
          throw Error();
        } catch (e) {
          var t = e.stack.trim().match(/\n( *(at )?)/);
          ((Le = (t && t[1]) || ``),
            (ze =
              -1 <
              e.stack.indexOf(`
    at`)
                ? ` (<anonymous>)`
                : -1 < e.stack.indexOf(`@`)
                  ? `@unknown:0:0`
                  : ``));
        }
      return (
        `
` +
        Le +
        e +
        ze
      );
    }
    var Ve = !1;
    function He(e, t) {
      if (!e || Ve) return ``;
      Ve = !0;
      var n = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      try {
        var r = {
          DetermineComponentFrameRoot: function () {
            try {
              if (t) {
                var n = function () {
                  throw Error();
                };
                if (
                  (Object.defineProperty(n.prototype, "props", {
                    set: function () {
                      throw Error();
                    },
                  }),
                  typeof Reflect == `object` && Reflect.construct)
                ) {
                  try {
                    Reflect.construct(n, []);
                  } catch (e) {
                    var r = e;
                  }
                  Reflect.construct(e, [], n);
                } else {
                  try {
                    n.call();
                  } catch (e) {
                    r = e;
                  }
                  n = !1;
                  try {
                    var i = Object.getOwnPropertyDescriptor(
                      e.prototype,
                      `props`,
                    );
                    (Object.defineProperty(e.prototype, "props", {
                      configurable: !0,
                      set: function () {
                        throw Error();
                      },
                    }),
                      (n = !0),
                      new e());
                  } finally {
                    n &&
                      (i === void 0
                        ? delete e.prototype.props
                        : Object.defineProperty(e.prototype, "props", i));
                  }
                }
              } else {
                try {
                  throw Error();
                } catch (e) {
                  r = e;
                }
                (n = e()) &&
                  typeof n.catch == `function` &&
                  n.catch(function () {});
              }
            } catch (e) {
              if (e && r && typeof e.stack == `string`)
                return [e.stack, r.stack];
            }
            return [null, null];
          },
        };
        r.DetermineComponentFrameRoot.displayName = `DetermineComponentFrameRoot`;
        var i = Object.getOwnPropertyDescriptor(
          r.DetermineComponentFrameRoot,
          `name`,
        );
        i &&
          i.configurable &&
          Object.defineProperty(r.DetermineComponentFrameRoot, "name", {
            value: `DetermineComponentFrameRoot`,
          });
        var a = r.DetermineComponentFrameRoot(),
          o = a[0],
          s = a[1];
        if (o && s) {
          var c = o.split(`
`),
            l = s.split(`
`);
          for (
            i = r = 0;
            r < c.length && !c[r].includes(`DetermineComponentFrameRoot`);
          )
            r++;
          for (; i < l.length && !l[i].includes(`DetermineComponentFrameRoot`);)
            i++;
          if (r === c.length || i === l.length)
            for (
              r = c.length - 1, i = l.length - 1;
              1 <= r && 0 <= i && c[r] !== l[i];
            )
              i--;
          for (; 1 <= r && 0 <= i; r--, i--)
            if (c[r] !== l[i]) {
              if (r !== 1 || i !== 1)
                do
                  if ((r--, i--, 0 > i || c[r] !== l[i])) {
                    var u =
                      `
` + c[r].replace(` at new `, ` at `);
                    return (
                      e.displayName &&
                        u.includes(`<anonymous>`) &&
                        (u = u.replace(`<anonymous>`, e.displayName)),
                      u
                    );
                  }
                while (1 <= r && 0 <= i);
              break;
            }
        }
      } finally {
        ((Ve = !1), (Error.prepareStackTrace = n));
      }
      return (n = e ? e.displayName || e.name : ``) ? Be(n) : ``;
    }
    function Ue(e, t) {
      switch (e.tag) {
        case 26:
        case 27:
        case 5:
          return Be(e.type);
        case 16:
          return Be(`Lazy`);
        case 13:
          return e.child !== t && t !== null
            ? Be(`Suspense Fallback`)
            : Be(`Suspense`);
        case 19:
          return Be(`SuspenseList`);
        case 0:
        case 15:
          return He(e.type, !1);
        case 11:
          return He(e.type.render, !1);
        case 1:
          return He(e.type, !0);
        case 31:
          return Be(`Activity`);
        case 30:
          return Be(`ViewTransition`);
        default:
          return ``;
      }
    }
    function We(e) {
      try {
        var t = ``,
          n = null;
        do ((t += Ue(e, n)), (n = e), (e = e.return));
        while (e);
        return t;
      } catch (e) {
        return (
          `
Error generating stack: ` +
          e.message +
          `
` +
          e.stack
        );
      }
    }
    var Ge = Object.prototype.hasOwnProperty,
      Ke = t.unstable_scheduleCallback,
      qe = t.unstable_cancelCallback,
      k = t.unstable_shouldYield,
      Je = t.unstable_requestPaint,
      Ye = t.unstable_now,
      Xe = t.unstable_getCurrentPriorityLevel,
      Ze = t.unstable_ImmediatePriority,
      A = t.unstable_UserBlockingPriority,
      Qe = t.unstable_NormalPriority,
      $e = t.unstable_LowPriority,
      et = t.unstable_IdlePriority,
      tt = t.log,
      nt = t.unstable_setDisableYieldValue,
      rt = null,
      it = null;
    function at(e) {
      if (
        (typeof tt == `function` && nt(e),
        it && typeof it.setStrictMode == `function`)
      )
        try {
          it.setStrictMode(rt, e);
        } catch {}
    }
    var ot = Math.clz32 ? Math.clz32 : lt,
      st = Math.log,
      ct = Math.LN2;
    function lt(e) {
      return ((e >>>= 0), e === 0 ? 32 : (31 - ((st(e) / ct) | 0)) | 0);
    }
    var ut = 256,
      dt = 262144,
      ft = 4194304;
    function pt(e) {
      var t = e & 42;
      if (t !== 0) return t;
      switch (e & -e) {
        case 1:
          return 1;
        case 2:
          return 2;
        case 4:
          return 4;
        case 8:
          return 8;
        case 16:
          return 16;
        case 32:
          return 32;
        case 64:
          return 64;
        case 128:
          return 128;
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
          return e & -e;
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return e & 3932160;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return e & 62914560;
        case 67108864:
          return 67108864;
        case 134217728:
          return 134217728;
        case 268435456:
          return 268435456;
        case 536870912:
          return 536870912;
        case 1073741824:
          return 0;
        default:
          return e;
      }
    }
    function mt(e, t, n) {
      var r = e.pendingLanes;
      if (r === 0) return 0;
      var i = 0,
        a = e.suspendedLanes,
        o = e.pingedLanes;
      e = e.warmLanes;
      var s = r & 134217727;
      return (
        s === 0
          ? ((s = r & ~a),
            s === 0
              ? o === 0
                ? n || ((n = r & ~e), n !== 0 && (i = pt(n)))
                : (i = pt(o))
              : (i = pt(s)))
          : ((r = s & ~a),
            r === 0
              ? ((o &= s),
                o === 0
                  ? n || ((n = s & ~e), n !== 0 && (i = pt(n)))
                  : (i = pt(o)))
              : (i = pt(r))),
        i === 0
          ? 0
          : t !== 0 &&
              t !== i &&
              (t & a) === 0 &&
              ((a = i & -i), (n = t & -t), a >= n || (a === 32 && n & 4194048))
            ? t
            : i
      );
    }
    function ht(e, t) {
      return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
    }
    function gt(e, t) {
      t & 8 && (t |= t & 32);
      var n = e.entangledLanes;
      if (n !== 0)
        for (e = e.entanglements, n &= t; 0 < n;) {
          var r = 31 - ot(n),
            i = 1 << r;
          ((t |= e[r]), (n &= ~i));
        }
      return t;
    }
    function _t(e, t) {
      switch (e) {
        case 1:
        case 2:
        case 4:
        case 8:
        case 64:
          return t + 250;
        case 16:
        case 32:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return t + 5e3;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return -1;
        case 67108864:
        case 134217728:
        case 268435456:
        case 536870912:
        case 1073741824:
          return -1;
        default:
          return -1;
      }
    }
    function vt() {
      var e = ft;
      return ((ft <<= 1), !(ft & 62914560) && (ft = 4194304), e);
    }
    function yt(e) {
      for (var t = [], n = 0; 31 > n; n++) t.push(e);
      return t;
    }
    function bt(e, t) {
      ((e.pendingLanes |= t),
        t !== 268435456 &&
          ((e.suspendedLanes = 0), (e.pingedLanes = 0), (e.warmLanes = 0)));
    }
    function xt(e, t, n, r, i, a) {
      var o = e.pendingLanes;
      ((e.pendingLanes = n),
        (e.suspendedLanes = 0),
        (e.pingedLanes = 0),
        (e.warmLanes = 0),
        (e.expiredLanes &= n),
        (e.entangledLanes &= n),
        (e.errorRecoveryDisabledLanes &= n),
        (e.shellSuspendCounter = 0));
      var s = e.entanglements,
        c = e.expirationTimes,
        l = e.hiddenUpdates;
      for (n = o & ~n; 0 < n;) {
        var u = 31 - ot(n),
          d = 1 << u;
        ((s[u] = 0), (c[u] = -1));
        var f = l[u];
        if (f !== null)
          for (l[u] = null, u = 0; u < f.length; u++) {
            var p = f[u];
            p !== null && (p.lane &= -536870913);
          }
        n &= ~d;
      }
      (r !== 0 && St(e, r, 0),
        a !== 0 &&
          i === 0 &&
          e.tag !== 0 &&
          (e.suspendedLanes |= a & ~(o & ~t)));
    }
    function St(e, t, n) {
      ((e.pendingLanes |= t), (e.suspendedLanes &= ~t));
      var r = 31 - ot(t);
      ((e.entangledLanes |= t),
        (e.entanglements[r] = e.entanglements[r] | 1073741824 | (n & 261930)));
    }
    function Ct(e, t) {
      var n = (e.entangledLanes |= t);
      for (e = e.entanglements; n;) {
        var r = 31 - ot(n),
          i = 1 << r;
        ((i & t) | (e[r] & t) && (e[r] |= t), (n &= ~i));
      }
    }
    function wt(e, t) {
      var n = t & -t;
      return (
        (n = n & 42 ? 1 : Tt(n)),
        (n & (e.suspendedLanes | t)) === 0 ? n : 0
      );
    }
    function Tt(e) {
      switch (e) {
        case 2:
          e = 1;
          break;
        case 8:
          e = 4;
          break;
        case 32:
          e = 16;
          break;
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          e = 128;
          break;
        case 268435456:
          e = 134217728;
          break;
        default:
          e = 0;
      }
      return e;
    }
    function Et(e) {
      return (
        (e &= -e),
        2 < e ? (8 < e ? (e & 134217727 ? 32 : 268435456) : 8) : 2
      );
    }
    function Dt() {
      var e = T.p;
      return e === 0 ? ((e = window.event), e === void 0 ? 32 : Ch(e.type)) : e;
    }
    function Ot(e, t) {
      var n = T.p;
      try {
        return ((T.p = e), t());
      } finally {
        T.p = n;
      }
    }
    var kt = Math.random().toString(36).slice(2),
      At = `__reactFiber$` + kt,
      jt = `__reactProps$` + kt,
      Mt = `__reactContainer$` + kt,
      Nt = `__reactEvents$` + kt,
      Pt = `__reactListeners$` + kt,
      Ft = `__reactHandles$` + kt,
      It = `__reactResources$` + kt,
      Lt = `__reactMarker$` + kt,
      Rt = `__reactLoad$` + kt;
    function zt(e) {
      (delete e[At], delete e[jt], delete e[Pt], delete e[Ft]);
    }
    function Bt(e) {
      var t;
      if ((t = e[At])) return t;
      for (var n = e.parentNode; n;) {
        if ((t = n[Mt] || n[At])) {
          if (
            ((n = t.alternate),
            t.child !== null || (n !== null && n.child !== null))
          )
            for (e = fm(e); e !== null;) {
              if ((n = e[At])) return n;
              e = fm(e);
            }
          return t;
        }
        ((e = n), (n = e.parentNode));
      }
      return null;
    }
    function Vt(e) {
      if ((e = e[At] || e[Mt])) {
        var t = e.tag;
        if (
          t === 5 ||
          t === 6 ||
          t === 13 ||
          t === 31 ||
          t === 26 ||
          t === 27 ||
          t === 3
        )
          return e;
      }
      return null;
    }
    function j(e) {
      var t = e.tag;
      if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
      throw Error(a(33));
    }
    function Ht(e) {
      var t = e[It];
      return (
        (t ||= e[It] =
          { hoistableStyles: new Map(), hoistableScripts: new Map() }),
        t
      );
    }
    function Ut(e) {
      e[Lt] = !0;
    }
    function Wt(e) {
      e[Rt] = void 0;
    }
    var Gt = new Set(),
      Kt = {};
    function qt(e, t) {
      (Jt(e, t), Jt(e + `Capture`, t));
    }
    function Jt(e, t) {
      for (Kt[e] = t, e = 0; e < t.length; e++) Gt.add(t[e]);
    }
    var Yt = RegExp(
        `^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`,
      ),
      Xt = {},
      Zt = {};
    function Qt(e) {
      return Ge.call(Zt, e)
        ? !0
        : Ge.call(Xt, e)
          ? !1
          : Yt.test(e)
            ? (Zt[e] = !0)
            : ((Xt[e] = !0), !1);
    }
    var M = !1;
    function $t() {
      var e = M;
      return ((M = !1), e);
    }
    function en(e, t, n) {
      if (Qt(t)) {
        if (n === null) e.removeAttribute(t);
        else {
          switch (typeof n) {
            case `undefined`:
            case `function`:
            case `symbol`:
              e.removeAttribute(t);
              return;
            case `boolean`:
              var r = t.toLowerCase().slice(0, 5);
              if (r !== `data-` && r !== `aria-`) {
                e.removeAttribute(t);
                return;
              }
          }
          e.setAttribute(t, n);
        }
      }
    }
    function tn(e, t, n) {
      if (n === null) e.removeAttribute(t);
      else {
        switch (typeof n) {
          case `undefined`:
          case `function`:
          case `symbol`:
          case `boolean`:
            e.removeAttribute(t);
            return;
        }
        e.setAttribute(t, n);
      }
    }
    function nn(e, t, n, r) {
      if (r === null) e.removeAttribute(n);
      else {
        switch (typeof r) {
          case `undefined`:
          case `function`:
          case `symbol`:
          case `boolean`:
            e.removeAttribute(n);
            return;
        }
        e.setAttributeNS(t, n, r);
      }
    }
    function rn(e) {
      switch (typeof e) {
        case `bigint`:
        case `boolean`:
        case `number`:
        case `string`:
        case `undefined`:
          return e;
        case `object`:
          return e;
        default:
          return ``;
      }
    }
    function an(e) {
      var t = e.type;
      return (
        (e = e.nodeName) &&
        e.toLowerCase() === `input` &&
        (t === `checkbox` || t === `radio`)
      );
    }
    function on(e, t, n) {
      var r = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
      if (
        !e.hasOwnProperty(t) &&
        r !== void 0 &&
        typeof r.get == `function` &&
        typeof r.set == `function`
      ) {
        var i = r.get,
          a = r.set;
        return (
          Object.defineProperty(e, t, {
            configurable: !0,
            get: function () {
              return i.call(this);
            },
            set: function (e) {
              ((n = `` + e), a.call(this, e));
            },
          }),
          Object.defineProperty(e, t, { enumerable: r.enumerable }),
          {
            getValue: function () {
              return n;
            },
            setValue: function (e) {
              n = `` + e;
            },
            stopTracking: function () {
              ((e._valueTracker = null), delete e[t]);
            },
          }
        );
      }
    }
    function N(e) {
      if (!e._valueTracker) {
        var t = an(e) ? `checked` : `value`;
        e._valueTracker = on(e, t, `` + e[t]);
      }
    }
    function sn(e) {
      if (!e) return !1;
      var t = e._valueTracker;
      if (!t) return !0;
      var n = t.getValue(),
        r = ``;
      return (
        e && (r = an(e) ? (e.checked ? `true` : `false`) : e.value),
        (e = r),
        e !== n && (t.setValue(e), !0)
      );
    }
    var cn = /[\n"\\]/g;
    function ln(e) {
      return e.replace(cn, function (e) {
        return `\\` + e.charCodeAt(0).toString(16) + ` `;
      });
    }
    function un(e, t, n, r, i, a, o, s) {
      ((e.name = ``),
        o != null &&
        typeof o != `function` &&
        typeof o != `symbol` &&
        typeof o != `boolean`
          ? (e.type = o)
          : e.removeAttribute(`type`),
        t == null
          ? (o !== `submit` && o !== `reset`) || e.removeAttribute(`value`)
          : o === `number`
            ? ((t === 0 && e.value === ``) || e.value != t) &&
              (e.value = `` + rn(t))
            : e.value !== `` + rn(t) && (e.value = `` + rn(t)),
        t == null
          ? n == null
            ? r != null && e.removeAttribute(`value`)
            : fn(e, rn(n))
          : o === `number` && e.value == t
            ? fn(e, rn(e.value))
            : fn(e, rn(t)),
        i == null && a != null && (e.defaultChecked = !!a),
        i != null &&
          (e.checked = i && typeof i != `function` && typeof i != `symbol`),
        s != null &&
        typeof s != `function` &&
        typeof s != `symbol` &&
        typeof s != `boolean`
          ? (e.name = `` + rn(s))
          : e.removeAttribute(`name`));
    }
    function dn(e, t, n, r, i, a, o, s) {
      if (
        (a != null &&
          typeof a != `function` &&
          typeof a != `symbol` &&
          typeof a != `boolean` &&
          (e.type = a),
        t != null || n != null)
      ) {
        if (!((a !== `submit` && a !== `reset`) || t != null)) {
          N(e);
          return;
        }
        ((n = n == null ? `` : `` + rn(n)),
          (t = t == null ? n : `` + rn(t)),
          s || t === e.value || (e.value = t),
          (e.defaultValue = t));
      }
      ((r ??= i),
        (r = typeof r != `function` && typeof r != `symbol` && !!r),
        (e.checked = s ? e.checked : !!r),
        (e.defaultChecked = !!r),
        o != null &&
          typeof o != `function` &&
          typeof o != `symbol` &&
          typeof o != `boolean` &&
          (e.name = o),
        N(e));
    }
    function fn(e, t) {
      e.defaultValue !== `` + t && (e.defaultValue = `` + t);
    }
    function pn(e, t, n, r) {
      if (((e = e.options), t)) {
        t = {};
        for (var i = 0; i < n.length; i++) t[`$` + n[i]] = !0;
        for (n = 0; n < e.length; n++)
          ((i = t.hasOwnProperty(`$` + e[n].value)),
            e[n].selected !== i && (e[n].selected = i),
            i && r && (e[n].defaultSelected = !0));
      } else {
        for (n = `` + rn(n), t = null, i = 0; i < e.length; i++) {
          if (e[i].value === n) {
            ((e[i].selected = !0), r && (e[i].defaultSelected = !0));
            return;
          }
          t !== null || e[i].disabled || (t = e[i]);
        }
        t !== null && (t.selected = !0);
      }
    }
    function mn(e, t, n) {
      t != null && ((t = `` + rn(t)), t !== e.value && (e.value = t), n == null)
        ? e.defaultValue !== t && (e.defaultValue = t)
        : (e.defaultValue = n == null ? `` : `` + rn(n));
    }
    function hn(e, t, n, r) {
      if (t == null) {
        if (r != null) {
          if (n != null) throw Error(a(92));
          if (we(r)) {
            if (1 < r.length) throw Error(a(93));
            r = r[0];
          }
          n = r;
        }
        ((n ??= ``), (t = n));
      }
      ((n = rn(t)),
        (e.defaultValue = n),
        (r = e.textContent),
        r === n && r !== `` && r !== null && (e.value = r),
        N(e));
    }
    function gn(e, t) {
      if (t) {
        var n = e.firstChild;
        if (n && n === e.lastChild && n.nodeType === 3) {
          n.nodeValue = t;
          return;
        }
      }
      e.textContent = t;
    }
    var _n = new Set(
      `animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp`.split(
        ` `,
      ),
    );
    function vn(e, t, n) {
      var r = t.indexOf(`--`) === 0;
      n == null || typeof n == `boolean` || n === ``
        ? r
          ? e.setProperty(t, ``)
          : t === `float`
            ? (e.cssFloat = ``)
            : (e[t] = ``)
        : r
          ? e.setProperty(t, n)
          : typeof n != `number` || n === 0 || _n.has(t)
            ? t === `float`
              ? (e.cssFloat = n)
              : (e[t] = (`` + n).trim())
            : (e[t] = n + `px`);
    }
    function yn(e, t, n) {
      if (t != null && typeof t != `object`) throw Error(a(62));
      if (((e = e.style), n != null)) {
        for (var r in n)
          !n.hasOwnProperty(r) ||
            (t != null && t.hasOwnProperty(r)) ||
            (r.indexOf(`--`) === 0
              ? e.setProperty(r, ``)
              : r === `float`
                ? (e.cssFloat = ``)
                : (e[r] = ``),
            (M = !0));
        for (var i in t)
          ((r = t[i]),
            t.hasOwnProperty(i) && n[i] !== r && (vn(e, i, r), (M = !0)));
      } else for (var o in t) t.hasOwnProperty(o) && vn(e, o, t[o]);
    }
    function bn(e) {
      if (e.indexOf(`-`) === -1) return !1;
      switch (e) {
        case `annotation-xml`:
        case `color-profile`:
        case `font-face`:
        case `font-face-src`:
        case `font-face-uri`:
        case `font-face-format`:
        case `font-face-name`:
        case `missing-glyph`:
          return !1;
        default:
          return !0;
      }
    }
    var xn = new Map([
        [`acceptCharset`, `accept-charset`],
        [`htmlFor`, `for`],
        [`httpEquiv`, `http-equiv`],
        [`crossOrigin`, `crossorigin`],
        [`accentHeight`, `accent-height`],
        [`alignmentBaseline`, `alignment-baseline`],
        [`arabicForm`, `arabic-form`],
        [`baselineShift`, `baseline-shift`],
        [`capHeight`, `cap-height`],
        [`clipPath`, `clip-path`],
        [`clipRule`, `clip-rule`],
        [`colorInterpolation`, `color-interpolation`],
        [`colorInterpolationFilters`, `color-interpolation-filters`],
        [`colorProfile`, `color-profile`],
        [`colorRendering`, `color-rendering`],
        [`dominantBaseline`, `dominant-baseline`],
        [`enableBackground`, `enable-background`],
        [`fillOpacity`, `fill-opacity`],
        [`fillRule`, `fill-rule`],
        [`floodColor`, `flood-color`],
        [`floodOpacity`, `flood-opacity`],
        [`fontFamily`, `font-family`],
        [`fontSize`, `font-size`],
        [`fontSizeAdjust`, `font-size-adjust`],
        [`fontStretch`, `font-stretch`],
        [`fontStyle`, `font-style`],
        [`fontVariant`, `font-variant`],
        [`fontWeight`, `font-weight`],
        [`glyphName`, `glyph-name`],
        [`glyphOrientationHorizontal`, `glyph-orientation-horizontal`],
        [`glyphOrientationVertical`, `glyph-orientation-vertical`],
        [`horizAdvX`, `horiz-adv-x`],
        [`horizOriginX`, `horiz-origin-x`],
        [`imageRendering`, `image-rendering`],
        [`letterSpacing`, `letter-spacing`],
        [`lightingColor`, `lighting-color`],
        [`markerEnd`, `marker-end`],
        [`markerMid`, `marker-mid`],
        [`markerStart`, `marker-start`],
        [`maskType`, `mask-type`],
        [`overlinePosition`, `overline-position`],
        [`overlineThickness`, `overline-thickness`],
        [`paintOrder`, `paint-order`],
        [`panose-1`, `panose-1`],
        [`pointerEvents`, `pointer-events`],
        [`renderingIntent`, `rendering-intent`],
        [`shapeRendering`, `shape-rendering`],
        [`stopColor`, `stop-color`],
        [`stopOpacity`, `stop-opacity`],
        [`strikethroughPosition`, `strikethrough-position`],
        [`strikethroughThickness`, `strikethrough-thickness`],
        [`strokeDasharray`, `stroke-dasharray`],
        [`strokeDashoffset`, `stroke-dashoffset`],
        [`strokeLinecap`, `stroke-linecap`],
        [`strokeLinejoin`, `stroke-linejoin`],
        [`strokeMiterlimit`, `stroke-miterlimit`],
        [`strokeOpacity`, `stroke-opacity`],
        [`strokeWidth`, `stroke-width`],
        [`textAnchor`, `text-anchor`],
        [`textDecoration`, `text-decoration`],
        [`textRendering`, `text-rendering`],
        [`transformOrigin`, `transform-origin`],
        [`underlinePosition`, `underline-position`],
        [`underlineThickness`, `underline-thickness`],
        [`unicodeBidi`, `unicode-bidi`],
        [`unicodeRange`, `unicode-range`],
        [`unitsPerEm`, `units-per-em`],
        [`vAlphabetic`, `v-alphabetic`],
        [`vHanging`, `v-hanging`],
        [`vIdeographic`, `v-ideographic`],
        [`vMathematical`, `v-mathematical`],
        [`vectorEffect`, `vector-effect`],
        [`vertAdvY`, `vert-adv-y`],
        [`vertOriginX`, `vert-origin-x`],
        [`vertOriginY`, `vert-origin-y`],
        [`wordSpacing`, `word-spacing`],
        [`writingMode`, `writing-mode`],
        [`xmlnsXlink`, `xmlns:xlink`],
        [`xHeight`, `x-height`],
      ]),
      Sn =
        /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
    function Cn(e) {
      return Sn.test(`` + e)
        ? `javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')`
        : e;
    }
    function wn() {}
    var Tn = null;
    function En(e) {
      return (
        (e = e.target || e.srcElement || window),
        e.correspondingUseElement && (e = e.correspondingUseElement),
        e.nodeType === 3 ? e.parentNode : e
      );
    }
    var Dn = null,
      On = null;
    function kn(e) {
      var t = Vt(e);
      if (t && (e = t.stateNode)) {
        var n = e[jt] || null;
        a: switch (((e = t.stateNode), t.type)) {
          case `input`:
            if (
              (un(
                e,
                n.value,
                n.defaultValue,
                n.defaultValue,
                n.checked,
                n.defaultChecked,
                n.type,
                n.name,
              ),
              (t = n.name),
              n.type === `radio` && t != null)
            ) {
              for (n = e; n.parentNode;) n = n.parentNode;
              for (
                n = n.querySelectorAll(
                  `input[name="` + ln(`` + t) + `"][type="radio"]`,
                ),
                  t = 0;
                t < n.length;
                t++
              ) {
                var r = n[t];
                if (r !== e && r.form === e.form) {
                  var i = r[jt] || null;
                  if (!i) throw Error(a(90));
                  un(
                    r,
                    i.value,
                    i.defaultValue,
                    i.defaultValue,
                    i.checked,
                    i.defaultChecked,
                    i.type,
                    i.name,
                  );
                }
              }
              for (t = 0; t < n.length; t++)
                ((r = n[t]), r.form === e.form && sn(r));
            }
            break a;
          case `textarea`:
            mn(e, n.value, n.defaultValue);
            break a;
          case `select`:
            ((t = n.value), t != null && pn(e, !!n.multiple, t, !1));
        }
      }
    }
    var An = !1;
    function jn(e, t, n) {
      if (An) return e(t, n);
      An = !0;
      try {
        return e(t);
      } finally {
        if (
          ((An = !1),
          (Dn !== null || On !== null) &&
            (zd(), Dn && ((t = Dn), (e = On), (On = Dn = null), kn(t), e)))
        )
          for (t = 0; t < e.length; t++) kn(e[t]);
      }
    }
    function Mn(e, t) {
      var n = e.stateNode;
      if (n === null) return null;
      var r = n[jt] || null;
      if (r === null) return null;
      n = r[t];
      a: switch (t) {
        case `onClick`:
        case `onClickCapture`:
        case `onDoubleClick`:
        case `onDoubleClickCapture`:
        case `onMouseDown`:
        case `onMouseDownCapture`:
        case `onMouseMove`:
        case `onMouseMoveCapture`:
        case `onMouseUp`:
        case `onMouseUpCapture`:
        case `onMouseEnter`:
          ((r = !r.disabled) ||
            ((e = e.type),
            (r =
              e !== `button` &&
              e !== `input` &&
              e !== `select` &&
              e !== `textarea`)),
            (e = !r));
          break a;
        default:
          e = !1;
      }
      if (e) return null;
      if (n && typeof n != `function`) throw Error(a(231, t, typeof n));
      return n;
    }
    var Nn =
        typeof window < `u` &&
        window.document !== void 0 &&
        window.document.createElement !== void 0,
      Pn = !1;
    if (Nn)
      try {
        var Fn = {};
        (Object.defineProperty(Fn, "passive", {
          get: function () {
            Pn = !0;
          },
        }),
          window.addEventListener(`test`, Fn, Fn),
          window.removeEventListener(`test`, Fn, Fn));
      } catch {
        Pn = !1;
      }
    var In = null,
      Ln = null,
      Rn = null;
    function zn() {
      if (Rn) return Rn;
      var e,
        t = Ln,
        n = t.length,
        r,
        i = `value` in In ? In.value : In.textContent,
        a = i.length;
      for (e = 0; e < n && t[e] === i[e]; e++);
      var o = n - e;
      for (r = 1; r <= o && t[n - r] === i[a - r]; r++);
      return (Rn = i.slice(e, 1 < r ? 1 - r : void 0));
    }
    function Bn(e) {
      var t = e.keyCode;
      return (
        `charCode` in e
          ? ((e = e.charCode), e === 0 && t === 13 && (e = 13))
          : (e = t),
        e === 10 && (e = 13),
        32 <= e || e === 13 ? e : 0
      );
    }
    function Vn() {
      return !0;
    }
    function Hn() {
      return !1;
    }
    function Un(e) {
      function t(t, n, r, i, a) {
        for (var o in ((this._reactName = t),
        (this._targetInst = r),
        (this.type = n),
        (this.nativeEvent = i),
        (this.target = a),
        (this.currentTarget = null),
        e))
          e.hasOwnProperty(o) && ((t = e[o]), (this[o] = t ? t(i) : i[o]));
        return (
          (this.isDefaultPrevented = (
            i.defaultPrevented == null
              ? !1 === i.returnValue
              : i.defaultPrevented
          )
            ? Vn
            : Hn),
          (this.isPropagationStopped = Hn),
          this
        );
      }
      return (
        x(t.prototype, {
          preventDefault: function () {
            this.defaultPrevented = !0;
            var e = this.nativeEvent;
            e &&
              (e.preventDefault
                ? e.preventDefault()
                : typeof e.returnValue != `unknown` && (e.returnValue = !1),
              (this.isDefaultPrevented = Vn));
          },
          stopPropagation: function () {
            var e = this.nativeEvent;
            e &&
              (e.stopPropagation
                ? e.stopPropagation()
                : typeof e.cancelBubble != `unknown` && (e.cancelBubble = !0),
              (this.isPropagationStopped = Vn));
          },
          persist: function () {},
          isPersistent: Vn,
        }),
        t
      );
    }
    var Wn = {
        eventPhase: 0,
        bubbles: 0,
        cancelable: 0,
        timeStamp: function (e) {
          return e.timeStamp || Date.now();
        },
        defaultPrevented: 0,
        isTrusted: 0,
      },
      Gn = Un(Wn),
      Kn = x({}, Wn, { view: 0, detail: 0 }),
      qn = Un(Kn),
      Jn,
      Yn,
      Xn,
      P = x({}, Kn, {
        screenX: 0,
        screenY: 0,
        clientX: 0,
        clientY: 0,
        pageX: 0,
        pageY: 0,
        ctrlKey: 0,
        shiftKey: 0,
        altKey: 0,
        metaKey: 0,
        getModifierState: sr,
        button: 0,
        buttons: 0,
        relatedTarget: function (e) {
          return e.relatedTarget === void 0
            ? e.fromElement === e.srcElement
              ? e.toElement
              : e.fromElement
            : e.relatedTarget;
        },
        movementX: function (e) {
          return `movementX` in e
            ? e.movementX
            : (e !== Xn &&
                (Xn && e.type === `mousemove`
                  ? ((Jn = e.screenX - Xn.screenX),
                    (Yn = e.screenY - Xn.screenY))
                  : (Yn = Jn = 0),
                (Xn = e)),
              Jn);
        },
        movementY: function (e) {
          return `movementY` in e ? e.movementY : Yn;
        },
      }),
      Zn = Un(P),
      Qn = Un(x({}, P, { dataTransfer: 0 })),
      $n = Un(x({}, Kn, { relatedTarget: 0 })),
      er = Un(
        x({}, Wn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }),
      ),
      tr = Un(
        x({}, Wn, {
          clipboardData: function (e) {
            return `clipboardData` in e
              ? e.clipboardData
              : window.clipboardData;
          },
        }),
      ),
      nr = Un(x({}, Wn, { data: 0 })),
      rr = {
        Esc: `Escape`,
        Spacebar: ` `,
        Left: `ArrowLeft`,
        Up: `ArrowUp`,
        Right: `ArrowRight`,
        Down: `ArrowDown`,
        Del: `Delete`,
        Win: `OS`,
        Menu: `ContextMenu`,
        Apps: `ContextMenu`,
        Scroll: `ScrollLock`,
        MozPrintableKey: `Unidentified`,
      },
      ir = {
        8: `Backspace`,
        9: `Tab`,
        12: `Clear`,
        13: `Enter`,
        16: `Shift`,
        17: `Control`,
        18: `Alt`,
        19: `Pause`,
        20: `CapsLock`,
        27: `Escape`,
        32: ` `,
        33: `PageUp`,
        34: `PageDown`,
        35: `End`,
        36: `Home`,
        37: `ArrowLeft`,
        38: `ArrowUp`,
        39: `ArrowRight`,
        40: `ArrowDown`,
        45: `Insert`,
        46: `Delete`,
        112: `F1`,
        113: `F2`,
        114: `F3`,
        115: `F4`,
        116: `F5`,
        117: `F6`,
        118: `F7`,
        119: `F8`,
        120: `F9`,
        121: `F10`,
        122: `F11`,
        123: `F12`,
        144: `NumLock`,
        145: `ScrollLock`,
        224: `Meta`,
      },
      ar = {
        Alt: `altKey`,
        Control: `ctrlKey`,
        Meta: `metaKey`,
        Shift: `shiftKey`,
      };
    function or(e) {
      var t = this.nativeEvent;
      return t.getModifierState
        ? t.getModifierState(e)
        : (e = ar[e])
          ? !!t[e]
          : !1;
    }
    function sr() {
      return or;
    }
    var cr = Un(
        x({}, Kn, {
          key: function (e) {
            if (e.key) {
              var t = rr[e.key] || e.key;
              if (t !== `Unidentified`) return t;
            }
            return e.type === `keypress`
              ? ((e = Bn(e)), e === 13 ? `Enter` : String.fromCharCode(e))
              : e.type === `keydown` || e.type === `keyup`
                ? ir[e.keyCode] || `Unidentified`
                : ``;
          },
          code: 0,
          location: 0,
          ctrlKey: 0,
          shiftKey: 0,
          altKey: 0,
          metaKey: 0,
          repeat: 0,
          locale: 0,
          getModifierState: sr,
          charCode: function (e) {
            return e.type === `keypress` ? Bn(e) : 0;
          },
          keyCode: function (e) {
            return e.type === `keydown` || e.type === `keyup` ? e.keyCode : 0;
          },
          which: function (e) {
            return e.type === `keypress`
              ? Bn(e)
              : e.type === `keydown` || e.type === `keyup`
                ? e.keyCode
                : 0;
          },
        }),
      ),
      lr = Un(
        x({}, P, {
          pointerId: 0,
          width: 0,
          height: 0,
          pressure: 0,
          tangentialPressure: 0,
          tiltX: 0,
          tiltY: 0,
          twist: 0,
          pointerType: 0,
          isPrimary: 0,
        }),
      ),
      ur = Un(x({}, Wn, { submitter: 0 })),
      dr = Un(
        x({}, Kn, {
          touches: 0,
          targetTouches: 0,
          changedTouches: 0,
          altKey: 0,
          metaKey: 0,
          ctrlKey: 0,
          shiftKey: 0,
          getModifierState: sr,
        }),
      ),
      fr = Un(x({}, Wn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 })),
      pr = Un(
        x({}, P, {
          deltaX: function (e) {
            return `deltaX` in e
              ? e.deltaX
              : `wheelDeltaX` in e
                ? -e.wheelDeltaX
                : 0;
          },
          deltaY: function (e) {
            return `deltaY` in e
              ? e.deltaY
              : `wheelDeltaY` in e
                ? -e.wheelDeltaY
                : `wheelDelta` in e
                  ? -e.wheelDelta
                  : 0;
          },
          deltaZ: 0,
          deltaMode: 0,
        }),
      ),
      mr = Un(x({}, Wn, { newState: 0, oldState: 0, source: 0 })),
      hr = [9, 13, 27, 32],
      gr = Nn && `CompositionEvent` in window,
      _r = null;
    Nn && `documentMode` in document && (_r = document.documentMode);
    var vr = Nn && `TextEvent` in window && !_r,
      yr = Nn && (!gr || (_r && 8 < _r && 11 >= _r)),
      br = ` `,
      xr = !1;
    function Sr(e, t) {
      switch (e) {
        case `keyup`:
          return hr.indexOf(t.keyCode) !== -1;
        case `keydown`:
          return t.keyCode !== 229;
        case `keypress`:
        case `mousedown`:
        case `focusout`:
          return !0;
        default:
          return !1;
      }
    }
    function Cr(e) {
      return (
        (e = e.detail),
        typeof e == `object` && `data` in e ? e.data : null
      );
    }
    var wr = !1;
    function Tr(e, t) {
      switch (e) {
        case `compositionend`:
          return Cr(t);
        case `keypress`:
          return t.which === 32 ? ((xr = !0), br) : null;
        case `textInput`:
          return ((e = t.data), e === br && xr ? null : e);
        default:
          return null;
      }
    }
    function Er(e, t) {
      if (wr)
        return e === `compositionend` || (!gr && Sr(e, t))
          ? ((e = zn()), (Rn = Ln = In = null), (wr = !1), e)
          : null;
      switch (e) {
        case `paste`:
          return null;
        case `keypress`:
          if (
            !(t.ctrlKey || t.altKey || t.metaKey) ||
            (t.ctrlKey && t.altKey)
          ) {
            if (t.char && 1 < t.char.length) return t.char;
            if (t.which) return String.fromCharCode(t.which);
          }
          return null;
        case `compositionend`:
          return yr && t.locale !== `ko` ? null : t.data;
        default:
          return null;
      }
    }
    var Dr = {
      color: !0,
      date: !0,
      datetime: !0,
      "datetime-local": !0,
      email: !0,
      month: !0,
      number: !0,
      password: !0,
      range: !0,
      search: !0,
      tel: !0,
      text: !0,
      time: !0,
      url: !0,
      week: !0,
    };
    function Or(e) {
      var t = e && e.nodeName && e.nodeName.toLowerCase();
      return t === `input` ? !!Dr[e.type] : t === `textarea`;
    }
    function kr(e, t, n, r) {
      (Dn ? (On ? On.push(r) : (On = [r])) : (Dn = r),
        (t = Jf(t, `onChange`)),
        0 < t.length &&
          ((n = new Gn(`onChange`, `change`, null, n, r)),
          e.push({ event: n, listeners: t })));
    }
    var Ar = null,
      jr = null;
    function Mr(e) {
      Vf(e, 0);
    }
    function Nr(e) {
      if (sn(j(e))) return e;
    }
    function Pr(e, t) {
      if (e === `change`) return t;
    }
    var Fr = !1;
    if (Nn) {
      var Ir;
      if (Nn) {
        var Lr = `oninput` in document;
        if (!Lr) {
          var Rr = document.createElement(`div`);
          (Rr.setAttribute(`oninput`, `return;`),
            (Lr = typeof Rr.oninput == `function`));
        }
        Ir = Lr;
      } else Ir = !1;
      Fr = Ir && (!document.documentMode || 9 < document.documentMode);
    }
    function zr() {
      Ar && (Ar.detachEvent(`onpropertychange`, Br), (jr = Ar = null));
    }
    function Br(e) {
      if (e.propertyName === `value` && Nr(jr)) {
        var t = [];
        (kr(t, jr, e, En(e)), jn(Mr, t));
      }
    }
    function Vr(e, t, n) {
      e === `focusin`
        ? (zr(), (Ar = t), (jr = n), Ar.attachEvent(`onpropertychange`, Br))
        : e === `focusout` && zr();
    }
    function Hr(e) {
      if (e === `selectionchange` || e === `keyup` || e === `keydown`)
        return Nr(jr);
    }
    function Ur(e, t) {
      if (e === `click`) return Nr(t);
    }
    function Wr(e, t) {
      if (e === `input` || e === `change`) return Nr(t);
    }
    function Gr(e, t) {
      return (e === t && (e !== 0 || 1 / e == 1 / t)) || (e !== e && t !== t);
    }
    var Kr = typeof Object.is == `function` ? Object.is : Gr;
    function qr(e, t) {
      if (Kr(e, t)) return !0;
      if (typeof e != `object` || !e || typeof t != `object` || !t) return !1;
      var n = Object.keys(e),
        r = Object.keys(t);
      if (n.length !== r.length) return !1;
      for (r = 0; r < n.length; r++) {
        var i = n[r];
        if (!Ge.call(t, i) || !Kr(e[i], t[i])) return !1;
      }
      return !0;
    }
    function Jr(e) {
      if (((e ||= typeof document < `u` ? document : void 0), e === void 0))
        return null;
      try {
        return e.activeElement || e.body;
      } catch {
        return e.body;
      }
    }
    function Yr(e) {
      for (; e && e.firstChild;) e = e.firstChild;
      return e;
    }
    function Xr(e, t) {
      var n = Yr(e);
      e = 0;
      for (var r; n;) {
        if (n.nodeType === 3) {
          if (((r = e + n.textContent.length), e <= t && r >= t))
            return { node: n, offset: t - e };
          e = r;
        }
        a: {
          for (; n;) {
            if (n.nextSibling) {
              n = n.nextSibling;
              break a;
            }
            n = n.parentNode;
          }
          n = void 0;
        }
        n = Yr(n);
      }
    }
    function Zr(e, t) {
      return e && t
        ? e === t
          ? !0
          : e && e.nodeType === 3
            ? !1
            : t && t.nodeType === 3
              ? Zr(e, t.parentNode)
              : `contains` in e
                ? e.contains(t)
                : e.compareDocumentPosition
                  ? !!(e.compareDocumentPosition(t) & 16)
                  : !1
        : !1;
    }
    function Qr(e) {
      e =
        e != null &&
        e.ownerDocument != null &&
        e.ownerDocument.defaultView != null
          ? e.ownerDocument.defaultView
          : window;
      for (var t = Jr(e.document); t instanceof e.HTMLIFrameElement;) {
        try {
          var n = typeof t.contentWindow.location.href == `string`;
        } catch {
          n = !1;
        }
        if (n) e = t.contentWindow;
        else break;
        t = Jr(e.document);
      }
      return t;
    }
    function $r(e) {
      var t = e && e.nodeName && e.nodeName.toLowerCase();
      return (
        t &&
        ((t === `input` &&
          (e.type === `text` ||
            e.type === `search` ||
            e.type === `tel` ||
            e.type === `url` ||
            e.type === `password`)) ||
          t === `textarea` ||
          e.contentEditable === `true`)
      );
    }
    var ei = Nn && `documentMode` in document && 11 >= document.documentMode,
      ti = null,
      ni = null,
      ri = null,
      ii = !1;
    function ai(e, t, n) {
      var r =
        n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
      ii ||
        ti == null ||
        ti !== Jr(r) ||
        ((r = ti),
        `selectionStart` in r && $r(r)
          ? (r = { start: r.selectionStart, end: r.selectionEnd })
          : ((r = (
              (r.ownerDocument && r.ownerDocument.defaultView) ||
              window
            ).getSelection()),
            (r = {
              anchorNode: r.anchorNode,
              anchorOffset: r.anchorOffset,
              focusNode: r.focusNode,
              focusOffset: r.focusOffset,
            })),
        (ri && qr(ri, r)) ||
          ((ri = r),
          (r = Jf(ni, `onSelect`)),
          0 < r.length &&
            ((t = new Gn(`onSelect`, `select`, null, t, n)),
            e.push({ event: t, listeners: r }),
            (t.target = ti))));
    }
    function oi(e, t) {
      var n = {};
      return (
        (n[e.toLowerCase()] = t.toLowerCase()),
        (n[`Webkit` + e] = `webkit` + t),
        (n[`Moz` + e] = `moz` + t),
        n
      );
    }
    var si = {
        animationend: oi(`Animation`, `AnimationEnd`),
        animationiteration: oi(`Animation`, `AnimationIteration`),
        animationstart: oi(`Animation`, `AnimationStart`),
        transitionrun: oi(`Transition`, `TransitionRun`),
        transitionstart: oi(`Transition`, `TransitionStart`),
        transitioncancel: oi(`Transition`, `TransitionCancel`),
        transitionend: oi(`Transition`, `TransitionEnd`),
      },
      ci = {},
      li = {};
    Nn &&
      ((li = document.createElement(`div`).style),
      `AnimationEvent` in window ||
        (delete si.animationend.animation,
        delete si.animationiteration.animation,
        delete si.animationstart.animation),
      `TransitionEvent` in window || delete si.transitionend.transition);
    function ui(e) {
      if (ci[e]) return ci[e];
      if (!si[e]) return e;
      var t = si[e],
        n;
      for (n in t) if (t.hasOwnProperty(n) && n in li) return (ci[e] = t[n]);
      return e;
    }
    var di = ui(`animationend`),
      fi = ui(`animationiteration`),
      pi = ui(`animationstart`),
      mi = ui(`transitionrun`),
      hi = ui(`transitionstart`),
      gi = ui(`transitioncancel`),
      _i = ui(`transitionend`),
      vi = new Map(),
      yi =
        `abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error fullscreenChange fullscreenError gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel`.split(
          ` `,
        );
    yi.push(`scrollEnd`);
    function bi(e, t) {
      (vi.set(e, t), qt(t, [e]));
    }
    var xi = 0;
    function Si(e, t) {
      if (e.name != null && e.name !== `auto`) return e.name;
      if (t.autoName !== null) return t.autoName;
      e = bd.identifierPrefix;
      var n = xi++;
      return ((e = `_` + e + `t_` + n.toString(32) + `_`), (t.autoName = e));
    }
    function Ci(e) {
      if (e == null || typeof e == `string`) return e;
      var t = null,
        n = Od;
      if (n !== null)
        for (var r = 0; r < n.length; r++) {
          var i = e[n[r]];
          if (i != null) {
            if (i === `none`) return `none`;
            t = t == null ? i : t + (` ` + i);
          }
        }
      return t ?? e.default;
    }
    function wi(e, t) {
      return (
        (e = Ci(e)),
        (t = Ci(t)),
        t == null ? (e === `auto` ? null : e) : t === `auto` ? null : t
      );
    }
    var Ti =
        typeof reportError == `function`
          ? reportError
          : function (e) {
              if (
                typeof window == `object` &&
                typeof window.ErrorEvent == `function`
              ) {
                var t = new window.ErrorEvent(`error`, {
                  bubbles: !0,
                  cancelable: !0,
                  message:
                    typeof e == `object` && e && typeof e.message == `string`
                      ? String(e.message)
                      : String(e),
                  error: e,
                });
                if (!window.dispatchEvent(t)) return;
              } else if (
                typeof process == `object` &&
                typeof process.emit == `function`
              ) {
                process.emit(`uncaughtException`, e);
                return;
              }
              console.error(e);
            },
      Ei = [],
      Di = 0,
      Oi = 0;
    function ki() {
      for (var e = Di, t = (Oi = Di = 0); t < e;) {
        var n = Ei[t];
        Ei[t++] = null;
        var r = Ei[t];
        Ei[t++] = null;
        var i = Ei[t];
        Ei[t++] = null;
        var a = Ei[t];
        if (((Ei[t++] = null), r !== null && i !== null)) {
          var o = r.pending;
          (o === null ? (i.next = i) : ((i.next = o.next), (o.next = i)),
            (r.pending = i));
        }
        a !== 0 && Ni(n, i, a);
      }
    }
    function Ai(e, t, n, r) {
      ((Ei[Di++] = e),
        (Ei[Di++] = t),
        (Ei[Di++] = n),
        (Ei[Di++] = r),
        (Oi |= r),
        (e.lanes |= r),
        (e = e.alternate),
        e !== null && (e.lanes |= r));
    }
    function ji(e, t, n, r) {
      return (Ai(e, t, n, r), Pi(e));
    }
    function Mi(e, t) {
      return (Ai(e, null, null, t), Pi(e));
    }
    function Ni(e, t, n) {
      e.lanes |= n;
      var r = e.alternate;
      r !== null && (r.lanes |= n);
      for (var i = !1, a = e.return; a !== null;)
        ((a.childLanes |= n),
          (r = a.alternate),
          r !== null && (r.childLanes |= n),
          a.tag === 22 &&
            ((e = a.stateNode), e === null || e._visibility & 1 || (i = !0)),
          (e = a),
          (a = a.return));
      return e.tag === 3
        ? ((a = e.stateNode),
          i &&
            t !== null &&
            ((i = 31 - ot(n)),
            (e = a.hiddenUpdates),
            (r = e[i]),
            r === null ? (e[i] = [t]) : r.push(t),
            (t.lane = n | 536870912)),
          a)
        : null;
    }
    function Pi(e) {
      if (50 < kd) throw ((kd = 0), (Ad = null), Error(a(185)));
      for (var t = e.return; t !== null;) ((e = t), (t = e.return));
      return e.tag === 3 ? e.stateNode : null;
    }
    var Fi = {};
    function Ii(e, t, n, r) {
      ((this.tag = e),
        (this.key = n),
        (this.sibling =
          this.child =
          this.return =
          this.stateNode =
          this.type =
          this.elementType =
            null),
        (this.index = 0),
        (this.refCleanup = this.ref = null),
        (this.pendingProps = t),
        (this.dependencies =
          this.memoizedState =
          this.updateQueue =
          this.memoizedProps =
            null),
        (this.mode = r),
        (this.subtreeFlags = this.flags = 0),
        (this.deletions = null),
        (this.childLanes = this.lanes = 0),
        (this.alternate = null));
    }
    function Li(e, t, n, r) {
      return new Ii(e, t, n, r);
    }
    function Ri(e) {
      return ((e = e.prototype), !(!e || !e.isReactComponent));
    }
    function zi(e, t) {
      var n = e.alternate;
      return (
        n === null
          ? ((n = Li(e.tag, t, e.key, e.mode)),
            (n.elementType = e.elementType),
            (n.type = e.type),
            (n.stateNode = e.stateNode),
            (n.alternate = e),
            (e.alternate = n))
          : ((n.pendingProps = t),
            (n.type = e.type),
            (n.flags = 0),
            (n.subtreeFlags = 0),
            (n.deletions = null)),
        (n.flags = e.flags & 1206910976),
        (n.childLanes = e.childLanes),
        (n.lanes = e.lanes),
        (n.child = e.child),
        (n.memoizedProps = e.memoizedProps),
        (n.memoizedState = e.memoizedState),
        (n.updateQueue = e.updateQueue),
        (t = e.dependencies),
        (n.dependencies =
          t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }),
        (n.sibling = e.sibling),
        (n.index = e.index),
        (n.ref = e.ref),
        (n.refCleanup = e.refCleanup),
        n
      );
    }
    function Bi(e, t) {
      e.flags &= 1206910978;
      var n = e.alternate;
      return (
        n === null
          ? ((e.childLanes = 0),
            (e.lanes = t),
            (e.child = null),
            (e.subtreeFlags = 0),
            (e.memoizedProps = null),
            (e.memoizedState = null),
            (e.updateQueue = null),
            (e.dependencies = null),
            (e.stateNode = null))
          : ((e.childLanes = n.childLanes),
            (e.lanes = n.lanes),
            (e.child = n.child),
            (e.subtreeFlags = 0),
            (e.deletions = null),
            (e.memoizedProps = n.memoizedProps),
            (e.memoizedState = n.memoizedState),
            (e.updateQueue = n.updateQueue),
            (e.type = n.type),
            (t = n.dependencies),
            (e.dependencies =
              t === null
                ? null
                : { lanes: t.lanes, firstContext: t.firstContext })),
        e
      );
    }
    function Vi(e, t, n, r, i, o) {
      var s = 0;
      if (((r = e), typeof r == `function`)) Ri(r) && (s = 1);
      else if (typeof r == `string`)
        s = qm(e, n, Oe.current)
          ? 26
          : e === `html` || e === `head` || e === `body`
            ? 27
            : 5;
      else
        a: switch (r) {
          case he:
            return (
              (e = Li(31, n, t, i)),
              (e.elementType = he),
              (e.lanes = o),
              e
            );
          case oe:
            return Hi(n.children, i, o, t);
          case se:
            ((s = 8), (i |= 24));
            break;
          case ce:
            return (
              (e = Li(12, n, t, i | 2)),
              (e.elementType = ce),
              (e.lanes = o),
              e
            );
          case C:
            return (
              (e = Li(13, n, t, i)),
              (e.elementType = C),
              (e.lanes = o),
              e
            );
          case fe:
            return (
              (e = Li(19, n, t, i)),
              (e.elementType = fe),
              (e.lanes = o),
              e
            );
          case ge:
          case ve:
            return (
              (e = i | 32),
              (e = Li(30, n, t, e)),
              (e.elementType = ve),
              (e.lanes = o),
              (e.stateNode = {
                autoName: null,
                paired: null,
                clones: null,
                ref: null,
              }),
              e
            );
          default:
            if (typeof r == `object` && r)
              switch (r.$$typeof) {
                case ue:
                  s = 10;
                  break a;
                case le:
                  s = 9;
                  break a;
                case de:
                  s = 11;
                  break a;
                case pe:
                  s = 14;
                  break a;
                case me:
                  ((s = 16), (r = null));
                  break a;
              }
            ((s = 29),
              (n = Error(a(130, e === null ? `null` : typeof e, ``))),
              (r = null));
        }
      return (
        (t = Li(s, n, t, i)),
        (t.elementType = e),
        (t.type = r),
        (t.lanes = o),
        t
      );
    }
    function Hi(e, t, n, r) {
      return ((e = Li(7, e, r, t)), (e.lanes = n), e);
    }
    function Ui(e, t, n) {
      return ((e = Li(6, e, null, t)), (e.lanes = n), e);
    }
    function Wi(e) {
      var t = Li(18, null, null, 0);
      return ((t.stateNode = e), t);
    }
    function Gi(e, t, n) {
      return (
        (t = Li(4, e.children === null ? [] : e.children, e.key, t)),
        (t.lanes = n),
        (t.stateNode = {
          containerInfo: e.containerInfo,
          pendingChildren: null,
          implementation: e.implementation,
        }),
        t
      );
    }
    var Ki = new WeakMap();
    function qi(e, t) {
      if (typeof e == `object` && e) {
        var n = Ki.get(e);
        return n === void 0
          ? ((t = { value: e, source: t, stack: We(t) }), Ki.set(e, t), t)
          : n;
      }
      return { value: e, source: t, stack: We(t) };
    }
    var Ji = [],
      Yi = 0,
      Xi = null,
      Zi = 0,
      Qi = [],
      $i = 0,
      ea = null,
      ta = 1,
      na = ``;
    function ra(e, t) {
      ((Ji[Yi++] = Zi), (Ji[Yi++] = Xi), (Xi = e), (Zi = t));
    }
    function ia(e, t, n) {
      ((Qi[$i++] = ta), (Qi[$i++] = na), (Qi[$i++] = ea), (ea = e));
      var r = ta;
      e = na;
      var i = 32 - ot(r) - 1;
      ((r &= ~(1 << i)), (n += 1));
      var a = 32 - ot(t) + i;
      if (30 < a) {
        var o = i - (i % 5);
        ((a = (r & ((1 << o) - 1)).toString(32)),
          (r >>= o),
          (i -= o),
          (ta = (1 << (32 - ot(t) + i)) | (n << i) | r),
          (na = a + e));
      } else ((ta = (1 << a) | (n << i) | r), (na = e));
    }
    function aa(e) {
      e.return !== null && (ra(e, 1), ia(e, 1, 0));
    }
    function oa(e) {
      for (; e === Xi;)
        ((Xi = Ji[--Yi]), (Ji[Yi] = null), (Zi = Ji[--Yi]), (Ji[Yi] = null));
      for (; e === ea;)
        ((ea = Qi[--$i]),
          (Qi[$i] = null),
          (na = Qi[--$i]),
          (Qi[$i] = null),
          (ta = Qi[--$i]),
          (Qi[$i] = null));
    }
    function sa(e, t) {
      ((Qi[$i++] = ta),
        (Qi[$i++] = na),
        (Qi[$i++] = ea),
        (ta = t.id),
        (na = t.overflow),
        (ea = e));
    }
    var F = null,
      I = null,
      L = !1,
      ca = null,
      la = !1,
      ua = Error(a(519));
    function da(e) {
      throw (
        _a(
          qi(
            Error(
              a(
                418,
                1 < arguments.length && arguments[1] !== void 0 && arguments[1]
                  ? `text`
                  : `HTML`,
                ``,
              ),
            ),
            e,
          ),
        ),
        ua
      );
    }
    function fa(e) {
      var t = e.stateNode,
        n = e.type,
        r = e.memoizedProps;
      switch (((t[At] = e), (t[jt] = r), n)) {
        case `dialog`:
          (Q(`cancel`, t), Q(`close`, t));
          break;
        case `iframe`:
        case `object`:
        case `embed`:
          Q(`load`, t);
          break;
        case `video`:
        case `audio`:
          for (n = 0; n < zf.length; n++) Q(zf[n], t);
          break;
        case `source`:
          Q(`error`, t);
          break;
        case `img`:
        case `image`:
        case `link`:
          (Q(`error`, t), Q(`load`, t));
          break;
        case `details`:
          Q(`toggle`, t);
          break;
        case `input`:
          (Q(`invalid`, t),
            dn(
              t,
              r.value,
              r.defaultValue,
              r.checked,
              r.defaultChecked,
              r.type,
              r.name,
              !0,
            ));
          break;
        case `select`:
          Q(`invalid`, t);
          break;
        case `textarea`:
          (Q(`invalid`, t), hn(t, r.value, r.defaultValue, r.children));
      }
      ((n = r.children),
        (typeof n != `string` &&
          typeof n != `number` &&
          typeof n != `bigint`) ||
        t.textContent === `` + n ||
        !0 === r.suppressHydrationWarning ||
        ep(t.textContent, n)
          ? (r.popover != null && (Q(`beforetoggle`, t), Q(`toggle`, t)),
            r.onScroll != null && Q(`scroll`, t),
            r.onScrollEnd != null && Q(`scrollend`, t),
            r.onClick != null && (t.onclick = wn),
            (t = !0))
          : (t = !1),
        t || da(e, !0));
    }
    function pa(e) {
      for (F = e.return; F;)
        switch (F.tag) {
          case 5:
          case 31:
          case 13:
            la = !1;
            return;
          case 27:
          case 3:
            la = !0;
            return;
          default:
            F = F.return;
        }
    }
    function ma(e) {
      if (e !== F) return !1;
      if (!L) return (pa(e), (L = !0), !1);
      var t = e.tag,
        n;
      if (
        ((n = t !== 3 && t !== 27) &&
          ((n = t === 5) &&
            ((n = e.type),
            (n =
              n === `form` || n === `button` || pp(e.type, e.memoizedProps))),
          (n = !n)),
        n && I && da(e),
        pa(e),
        t === 13)
      ) {
        if (((e = e.memoizedState), (e = e === null ? null : e.dehydrated), !e))
          throw Error(a(317));
        I = dm(e);
      } else if (t === 31) {
        if (((e = e.memoizedState), (e = e === null ? null : e.dehydrated), !e))
          throw Error(a(317));
        I = dm(e);
      } else
        t === 27
          ? ((t = I), Sp(e.type) ? ((e = um), (um = null), (I = e)) : (I = t))
          : (I = F ? lm(e.stateNode.nextSibling) : null);
      return !0;
    }
    function ha() {
      ((I = F = null), (L = !1));
    }
    function ga() {
      var e = ca;
      return (
        e !== null &&
          (pd === null ? (pd = e) : pd.push.apply(pd, e), (ca = null)),
        e
      );
    }
    function _a(e) {
      ca === null ? (ca = [e]) : ca.push(e);
    }
    var va = Ee(null),
      ya = null,
      ba = null;
    function xa(e, t, n) {
      (O(va, t._currentValue), (t._currentValue = n));
    }
    function Sa(e) {
      ((e._currentValue = va.current), De(va));
    }
    function Ca(e, t, n) {
      for (; e !== null;) {
        var r = e.alternate;
        if (
          ((e.childLanes & t) === t
            ? r !== null && (r.childLanes & t) !== t && (r.childLanes |= t)
            : ((e.childLanes |= t), r !== null && (r.childLanes |= t)),
          e === n)
        )
          break;
        e = e.return;
      }
    }
    function wa(e, t, n, r) {
      var i = e.child;
      for (i !== null && (i.return = e); i !== null;) {
        var o = i.dependencies;
        if (o !== null) {
          var s = i.child;
          o = o.firstContext;
          a: for (; o !== null;) {
            var c = o;
            o = i;
            for (var l = 0; l < t.length; l++)
              if (c.context === t[l]) {
                ((o.lanes |= n),
                  (c = o.alternate),
                  c !== null && (c.lanes |= n),
                  Ca(o.return, n, e),
                  r || (s = null));
                break a;
              }
            o = c.next;
          }
        } else if (i.tag === 18) {
          if (((s = i.return), s === null)) throw Error(a(341));
          ((s.lanes |= n),
            (o = s.alternate),
            o !== null && (o.lanes |= n),
            Ca(s, n, e),
            (s = null));
        } else
          i.tag === 13 &&
          i.memoizedState !== null &&
          i.memoizedState.dehydrated === null
            ? ((i.lanes |= n),
              (s = i.alternate),
              s !== null && (s.lanes |= n),
              Ca(i.return, n, e),
              (s = i.child),
              (s = s === null ? null : s.sibling))
            : (s = i.child);
        if (s !== null) s.return = i;
        else
          for (s = i; s !== null;) {
            if (s === e) {
              s = null;
              break;
            }
            if (((i = s.sibling), i !== null)) {
              ((i.return = s.return), (s = i));
              break;
            }
            s = s.return;
          }
        i = s;
      }
    }
    function Ta(e, t, n, r) {
      e = null;
      for (var i = t, o = !1; i !== null;) {
        if (!o) {
          if (i.flags & 524288) o = !0;
          else if (i.flags & 262144) break;
        }
        if (i.tag === 10) {
          var s = i.alternate;
          if (s === null) throw Error(a(387));
          if (((s = s.memoizedProps), s !== null)) {
            var c = i.type;
            Kr(i.pendingProps.value, s.value) ||
              (e === null ? (e = [c]) : e.push(c));
          }
        } else if (i === je.current) {
          if (((s = i.alternate), s === null)) throw Error(a(387));
          s.memoizedState.memoizedState !== i.memoizedState.memoizedState &&
            (e === null ? (e = [sh]) : e.push(sh));
        }
        i = i.return;
      }
      return (e !== null && wa(t, e, n, r), (t.flags |= 262144), e !== null);
    }
    function Ea(e) {
      for (e = e.firstContext; e !== null;) {
        if (!Kr(e.context._currentValue, e.memoizedValue)) return !0;
        e = e.next;
      }
      return !1;
    }
    function Da(e) {
      ((ya = e),
        (ba = null),
        (e = e.dependencies),
        e !== null && (e.firstContext = null));
    }
    function R(e) {
      return ka(ya, e);
    }
    function Oa(e, t) {
      return (ya === null && Da(e), ka(e, t));
    }
    function ka(e, t) {
      var n = t._currentValue;
      if (((t = { context: t, memoizedValue: n, next: null }), ba === null)) {
        if (e === null) throw Error(a(308));
        ((ba = t),
          (e.dependencies = { lanes: 0, firstContext: t }),
          (e.flags |= 524288));
      } else ba = ba.next = t;
      return n;
    }
    var Aa =
        typeof AbortController < `u`
          ? AbortController
          : function () {
              var e = [],
                t = (this.signal = {
                  aborted: !1,
                  addEventListener: function (t, n) {
                    e.push(n);
                  },
                });
              this.abort = function () {
                ((t.aborted = !0),
                  e.forEach(function (e) {
                    return e();
                  }));
              };
            },
      ja = t.unstable_scheduleCallback,
      Ma = t.unstable_NormalPriority,
      z = {
        $$typeof: ue,
        Consumer: null,
        Provider: null,
        _currentValue: null,
        _currentValue2: null,
        _threadCount: 0,
      };
    function Na() {
      return { controller: new Aa(), data: new Map(), refCount: 0 };
    }
    function Pa(e) {
      (e.refCount--,
        e.refCount === 0 &&
          ja(Ma, function () {
            e.controller.abort();
          }));
    }
    function Fa(e, t) {
      if (e.pendingLanes & 4194048) {
        var n = e.transitionTypes;
        for (
          n === null && (n = e.transitionTypes = []), e = 0;
          e < t.length;
          e++
        ) {
          var r = t[e];
          n.indexOf(r) === -1 && n.push(r);
        }
      }
    }
    var Ia = null;
    function La(e) {
      var t = e.transitionTypes;
      return ((e.transitionTypes = null), t);
    }
    var Ra = null,
      za = 0,
      Ba = 0,
      Va = null;
    function Ha(e, t) {
      if (Ra === null) {
        var n = (Ra = []);
        ((za = 0),
          (Ba = Pf()),
          (Va = {
            status: `pending`,
            value: void 0,
            then: function (e) {
              n.push(e);
            },
          }));
      }
      return (za++, t.then(Ua, Ua), t);
    }
    function Ua() {
      if (--za === 0 && ((Ia = null), Ra !== null)) {
        Va !== null && (Va.status = `fulfilled`);
        var e = Ra;
        ((Ra = null), (Ba = 0), (Va = null));
        for (var t = 0; t < e.length; t++) (0, e[t])();
      }
    }
    function Wa(e, t) {
      var n = [],
        r = {
          status: `pending`,
          value: null,
          reason: null,
          then: function (e) {
            n.push(e);
          },
        };
      return (
        e.then(
          function () {
            ((r.status = `fulfilled`), (r.value = t));
            for (var e = 0; e < n.length; e++) (0, n[e])(t);
          },
          function (e) {
            for (r.status = `rejected`, r.reason = e, e = 0; e < n.length; e++)
              (0, n[e])(void 0);
          },
        ),
        r
      );
    }
    var Ga = w.S;
    w.S = function (e, t) {
      if (
        ((gd = Ye()),
        typeof t == `object` && t && typeof t.then == `function` && Ha(e, t),
        Ia !== null)
      )
        for (var n = bf; n !== null;) (Fa(n, Ia), (n = n.next));
      if (((n = e.types), n !== null)) {
        for (var r = bf; r !== null;) (Fa(r, n), (r = r.next));
        if (Ba !== 0) {
          ((r = Ia), r === null && (r = Ia = []));
          for (var i = 0; i < n.length; i++) {
            var a = n[i];
            r.indexOf(a) === -1 && r.push(a);
          }
        }
      }
      Ga !== null && Ga(e, t);
    };
    var Ka = Ee(null);
    function qa() {
      var e = Ka.current;
      return e === null ? K.pooledCache : e;
    }
    function Ja(e, t) {
      t === null ? O(Ka, Ka.current) : O(Ka, t.pool);
    }
    function Ya() {
      var e = qa();
      return e === null ? null : { parent: z._currentValue, pool: e };
    }
    var Xa = Error(a(460)),
      Za = Error(a(474)),
      Qa = Error(a(542)),
      $a = { then: function () {} };
    function eo(e) {
      return ((e = e.status), e === `fulfilled` || e === `rejected`);
    }
    function to(e, t, n) {
      switch (
        ((n = e[n]),
        n === void 0 ? e.push(t) : n !== t && (t.then(wn, wn), (t = n)),
        t.status)
      ) {
        case `fulfilled`:
          return t.value;
        case `rejected`:
          throw (
            (e = t.reason),
            ao(e),
            e === void 0 && !(`reason` in t) ? Error(a(600)) : e
          );
        default:
          if (typeof t.status == `string`) t.then(wn, wn);
          else {
            if (((e = K), e !== null && 100 < e.shellSuspendCounter))
              throw Error(a(482));
            ((e = t),
              (e.status = `pending`),
              e.then(
                function (e) {
                  if (t.status === `pending`) {
                    var n = t;
                    ((n.status = `fulfilled`), (n.value = e));
                  }
                },
                function (e) {
                  if (t.status === `pending`) {
                    var n = t;
                    ((n.status = `rejected`), (n.reason = e));
                  }
                },
              ));
          }
          switch (t.status) {
            case `fulfilled`:
              return t.value;
            case `rejected`:
              throw ((e = t.reason), ao(e), e);
          }
          throw ((ro = t), Xa);
      }
    }
    function no(e) {
      try {
        var t = e._init;
        return t(e._payload);
      } catch (e) {
        throw typeof e == `object` && e && typeof e.then == `function`
          ? ((ro = e), Xa)
          : e;
      }
    }
    var ro = null;
    function io() {
      if (ro === null) throw Error(a(459));
      var e = ro;
      return ((ro = null), e);
    }
    function ao(e) {
      if (e === Xa || e === Qa) throw Error(a(483));
    }
    var oo = null,
      so = 0;
    function co(e) {
      var t = so;
      return ((so += 1), oo === null && (oo = []), to(oo, e, t));
    }
    function lo(e, t) {
      ((t = t.props.ref), (e.ref = t === void 0 ? null : t));
    }
    function uo(e, t) {
      throw t.$$typeof === ie
        ? Error(a(525))
        : ((e = Object.prototype.toString.call(t)),
          Error(
            a(
              31,
              e === `[object Object]`
                ? `object with keys {` + Object.keys(t).join(`, `) + `}`
                : e,
            ),
          ));
    }
    function fo(e) {
      function t(t, n) {
        if (e) {
          var r = t.deletions;
          r === null ? ((t.deletions = [n]), (t.flags |= 16)) : r.push(n);
        }
      }
      function n(n, r) {
        if (!e) return null;
        for (; r !== null;) (t(n, r), (r = r.sibling));
        return null;
      }
      function r(e) {
        for (var t = new Map(); e !== null;)
          (e.key === null ? t.set(e.index, e) : t.set(e.key, e),
            (e = e.sibling));
        return t;
      }
      function i(e, t) {
        return ((e = zi(e, t)), (e.index = 0), (e.sibling = null), e);
      }
      function o(t, n, r) {
        return (
          (t.index = r),
          e
            ? ((r = t.alternate),
              r === null
                ? ((t.flags |= 134217730), n)
                : ((r = r.index), r < n ? ((t.flags |= 2), n) : r))
            : ((t.flags |= 1048576), n)
        );
      }
      function s(t) {
        return (e && t.alternate === null && (t.flags |= 134217730), t);
      }
      function c(e, t, n, r) {
        return t === null || t.tag !== 6
          ? ((t = Ui(n, e.mode, r)), (t.return = e), t)
          : ((t = i(t, n)), (t.return = e), t);
      }
      function l(e, t, n, r) {
        var a = n.type;
        return a === oe
          ? ((e = d(e, t, n.props.children, r, n.key)), lo(e, n), e)
          : t !== null &&
              (t.elementType === a ||
                (typeof a == `object` &&
                  a &&
                  a.$$typeof === me &&
                  no(a) === t.type))
            ? ((t = i(t, n.props)), lo(t, n), (t.return = e), t)
            : ((t = Vi(n.type, n.key, n.props, null, e.mode, r)),
              lo(t, n),
              (t.return = e),
              t);
      }
      function u(e, t, n, r) {
        return t === null ||
          t.tag !== 4 ||
          t.stateNode.containerInfo !== n.containerInfo ||
          t.stateNode.implementation !== n.implementation
          ? ((t = Gi(n, e.mode, r)), (t.return = e), t)
          : ((t = i(t, n.children || [])), (t.return = e), t);
      }
      function d(e, t, n, r, a) {
        return t === null || t.tag !== 7
          ? ((t = Hi(n, e.mode, r, a)), (t.return = e), t)
          : ((t = i(t, n)), (t.return = e), t);
      }
      function f(e, t, n) {
        if (
          (typeof t == `string` && t !== ``) ||
          typeof t == `number` ||
          typeof t == `bigint`
        )
          return ((t = Ui(`` + t, e.mode, n)), (t.return = e), t);
        if (typeof t == `object` && t) {
          switch (t.$$typeof) {
            case S:
              return (
                (n = Vi(t.type, t.key, t.props, null, e.mode, n)),
                lo(n, t),
                (n.return = e),
                n
              );
            case ae:
              return ((t = Gi(t, e.mode, n)), (t.return = e), t);
            case me:
              return ((t = no(t)), f(e, t, n));
          }
          if (we(t) || xe(t))
            return ((t = Hi(t, e.mode, n, null)), (t.return = e), t);
          if (typeof t.then == `function`) return f(e, co(t), n);
          if (t.$$typeof === ue) return f(e, Oa(e, t), n);
          uo(e, t);
        }
        return null;
      }
      function p(e, t, n, r) {
        var i = t === null ? null : t.key;
        if (
          (typeof n == `string` && n !== ``) ||
          typeof n == `number` ||
          typeof n == `bigint`
        )
          return i === null ? c(e, t, `` + n, r) : null;
        if (typeof n == `object` && n) {
          switch (n.$$typeof) {
            case S:
              return n.key === i ? l(e, t, n, r) : null;
            case ae:
              return n.key === i ? u(e, t, n, r) : null;
            case me:
              return ((n = no(n)), p(e, t, n, r));
          }
          if (we(n) || xe(n)) return i === null ? d(e, t, n, r, null) : null;
          if (typeof n.then == `function`) return p(e, t, co(n), r);
          if (n.$$typeof === ue) return p(e, t, Oa(e, n), r);
          uo(e, n);
        }
        return null;
      }
      function m(e, t, n, r, i) {
        if (
          (typeof r == `string` && r !== ``) ||
          typeof r == `number` ||
          typeof r == `bigint`
        )
          return ((e = e.get(n) || null), c(t, e, `` + r, i));
        if (typeof r == `object` && r) {
          switch (r.$$typeof) {
            case S:
              return (
                (e = e.get(r.key === null ? n : r.key) || null),
                l(t, e, r, i)
              );
            case ae:
              return (
                (e = e.get(r.key === null ? n : r.key) || null),
                u(t, e, r, i)
              );
            case me:
              return ((r = no(r)), m(e, t, n, r, i));
          }
          if (we(r) || xe(r))
            return ((e = e.get(n) || null), d(t, e, r, i, null));
          if (typeof r.then == `function`) return m(e, t, n, co(r), i);
          if (r.$$typeof === ue) return m(e, t, n, Oa(t, r), i);
          uo(t, r);
        }
        return null;
      }
      function h(i, a, s, c) {
        for (
          var l = null, u = null, d = a, h = (a = 0), g = null;
          d !== null && h < s.length;
          h++
        ) {
          d.index > h ? ((g = d), (d = null)) : (g = d.sibling);
          var _ = p(i, d, s[h], c);
          if (_ === null) {
            d === null && (d = g);
            break;
          }
          (e && d && _.alternate === null && t(i, d),
            (a = o(_, a, h)),
            u === null ? (l = _) : (u.sibling = _),
            (u = _),
            (d = g));
        }
        if (h === s.length) return (n(i, d), L && ra(i, h), l);
        if (d === null) {
          for (; h < s.length; h++)
            ((d = f(i, s[h], c)),
              d !== null &&
                ((a = o(d, a, h)),
                u === null ? (l = d) : (u.sibling = d),
                (u = d)));
          return (L && ra(i, h), l);
        }
        for (d = r(d); h < s.length; h++)
          ((g = m(d, i, h, s[h], c)),
            g !== null &&
              (e &&
                ((_ = g.alternate),
                _ !== null && d.delete(_.key === null ? h : _.key)),
              (a = o(g, a, h)),
              u === null ? (l = g) : (u.sibling = g),
              (u = g)));
        return (
          e &&
            d.forEach(function (e) {
              return t(i, e);
            }),
          L && ra(i, h),
          l
        );
      }
      function g(i, s, c, l) {
        if (c == null) throw Error(a(151));
        for (
          var u = null, d = null, h = s, g = (s = 0), _ = null, v = c.next();
          h !== null && !v.done;
          g++, v = c.next()
        ) {
          h.index > g ? ((_ = h), (h = null)) : (_ = h.sibling);
          var y = p(i, h, v.value, l);
          if (y === null) {
            h === null && (h = _);
            break;
          }
          (e && h && y.alternate === null && t(i, h),
            (s = o(y, s, g)),
            d === null ? (u = y) : (d.sibling = y),
            (d = y),
            (h = _));
        }
        if (v.done) return (n(i, h), L && ra(i, g), u);
        if (h === null) {
          for (; !v.done; g++, v = c.next())
            ((v = f(i, v.value, l)),
              v !== null &&
                ((s = o(v, s, g)),
                d === null ? (u = v) : (d.sibling = v),
                (d = v)));
          return (L && ra(i, g), u);
        }
        for (h = r(h); !v.done; g++, v = c.next())
          ((v = m(h, i, g, v.value, l)),
            v !== null &&
              (e &&
                ((_ = v.alternate),
                _ !== null && h.delete(_.key === null ? g : _.key)),
              (s = o(v, s, g)),
              d === null ? (u = v) : (d.sibling = v),
              (d = v)));
        return (
          e &&
            h.forEach(function (e) {
              return t(i, e);
            }),
          L && ra(i, g),
          u
        );
      }
      function _(e, r, o, c) {
        if (
          (typeof o == `object` &&
            o &&
            o.type === oe &&
            o.key === null &&
            o.props.ref === void 0 &&
            (o = o.props.children),
          typeof o == `object` && o)
        ) {
          switch (o.$$typeof) {
            case S:
              a: {
                for (var l = o.key; r !== null;) {
                  if (r.key === l) {
                    if (((l = o.type), l === oe)) {
                      if (r.tag === 7) {
                        (n(e, r.sibling),
                          (c = i(r, o.props.children)),
                          lo(c, o),
                          (c.return = e),
                          (e = c));
                        break a;
                      }
                    } else if (
                      r.elementType === l ||
                      (typeof l == `object` &&
                        l &&
                        l.$$typeof === me &&
                        no(l) === r.type)
                    ) {
                      (n(e, r.sibling),
                        (c = i(r, o.props)),
                        lo(c, o),
                        (c.return = e),
                        (e = c));
                      break a;
                    }
                    n(e, r);
                    break;
                  }
                  (t(e, r), (r = r.sibling));
                }
                o.type === oe
                  ? ((c = Hi(o.props.children, e.mode, c, o.key)),
                    lo(c, o),
                    (c.return = e),
                    (e = c))
                  : ((c = Vi(o.type, o.key, o.props, null, e.mode, c)),
                    lo(c, o),
                    (c.return = e),
                    (e = c));
              }
              return s(e);
            case ae:
              a: {
                for (l = o.key; r !== null;) {
                  if (r.key === l) {
                    if (
                      r.tag === 4 &&
                      r.stateNode.containerInfo === o.containerInfo &&
                      r.stateNode.implementation === o.implementation
                    ) {
                      (n(e, r.sibling),
                        (c = i(r, o.children || [])),
                        (c.return = e),
                        (e = c));
                      break a;
                    }
                    n(e, r);
                    break;
                  }
                  (t(e, r), (r = r.sibling));
                }
                ((c = Gi(o, e.mode, c)), (c.return = e), (e = c));
              }
              return s(e);
            case me:
              return ((o = no(o)), _(e, r, o, c));
          }
          if (we(o)) return h(e, r, o, c);
          if (xe(o)) {
            if (((l = xe(o)), typeof l != `function`)) throw Error(a(150));
            return ((o = l.call(o)), g(e, r, o, c));
          }
          if (typeof o.then == `function`) return _(e, r, co(o), c);
          if (o.$$typeof === ue) return _(e, r, Oa(e, o), c);
          uo(e, o);
        }
        return (typeof o == `string` && o !== ``) ||
          typeof o == `number` ||
          typeof o == `bigint`
          ? ((o = `` + o),
            r !== null && r.tag === 6
              ? (n(e, r.sibling), (c = i(r, o)), (c.return = e), (e = c))
              : (n(e, r), (c = Ui(o, e.mode, c)), (c.return = e), (e = c)),
            s(e))
          : n(e, r);
      }
      return function (e, t, n, r) {
        try {
          so = 0;
          var i = _(e, t, n, r);
          return ((oo = null), i);
        } catch (t) {
          if (t === Xa || t === Qa) throw t;
          var a = Li(29, t, null, e.mode);
          return ((a.lanes = r), (a.return = e), a);
        }
      };
    }
    var po = fo(!0),
      mo = fo(!1),
      ho = !1;
    function go(e) {
      e.updateQueue = {
        baseState: e.memoizedState,
        firstBaseUpdate: null,
        lastBaseUpdate: null,
        shared: { pending: null, lanes: 0, hiddenCallbacks: null },
        callbacks: null,
      };
    }
    function _o(e, t) {
      ((e = e.updateQueue),
        t.updateQueue === e &&
          (t.updateQueue = {
            baseState: e.baseState,
            firstBaseUpdate: e.firstBaseUpdate,
            lastBaseUpdate: e.lastBaseUpdate,
            shared: e.shared,
            callbacks: null,
          }));
    }
    function vo(e) {
      return { lane: e, tag: 0, payload: null, callback: null, next: null };
    }
    function yo(e, t, n) {
      var r = e.updateQueue;
      if (r === null) return null;
      if (((r = r.shared), G & 2)) {
        var i = r.pending;
        return (
          i === null ? (t.next = t) : ((t.next = i.next), (i.next = t)),
          (r.pending = t),
          (t = Pi(e)),
          Ni(e, null, n),
          t
        );
      }
      return (Ai(e, r, t, n), Pi(e));
    }
    function bo(e, t, n) {
      if (((t = t.updateQueue), t !== null && ((t = t.shared), n & 4194048))) {
        var r = t.lanes;
        ((r &= e.pendingLanes), (n |= r), (t.lanes = n), Ct(e, n));
      }
    }
    function xo(e, t) {
      var n = e.updateQueue,
        r = e.alternate;
      if (r !== null && ((r = r.updateQueue), n === r)) {
        var i = null,
          a = null;
        if (((n = n.firstBaseUpdate), n !== null)) {
          do {
            var o = {
              lane: n.lane,
              tag: n.tag,
              payload: n.payload,
              callback: null,
              next: null,
            };
            (a === null ? (i = a = o) : (a = a.next = o), (n = n.next));
          } while (n !== null);
          a === null ? (i = a = t) : (a = a.next = t);
        } else i = a = t;
        ((n = {
          baseState: r.baseState,
          firstBaseUpdate: i,
          lastBaseUpdate: a,
          shared: r.shared,
          callbacks: r.callbacks,
        }),
          (e.updateQueue = n));
      } else
        ((e = n.lastBaseUpdate),
          e === null ? (n.firstBaseUpdate = t) : (e.next = t),
          (n.lastBaseUpdate = t));
    }
    var So = !1;
    function Co() {
      if (So) {
        var e = Va;
        if (e !== null) throw e;
      }
    }
    function wo(e, t, n, r) {
      So = !1;
      var i = e.updateQueue;
      ho = !1;
      var a = i.firstBaseUpdate,
        o = i.lastBaseUpdate,
        s = i.shared.pending;
      if (s !== null) {
        i.shared.pending = null;
        var c = s,
          l = c.next;
        ((c.next = null), o === null ? (a = l) : (o.next = l), (o = c));
        var u = e.alternate;
        u !== null &&
          ((u = u.updateQueue),
          (s = u.lastBaseUpdate),
          s !== o &&
            (s === null ? (u.firstBaseUpdate = l) : (s.next = l),
            (u.lastBaseUpdate = c)));
      }
      if (a !== null) {
        var d = i.baseState;
        ((o = 0), (u = l = c = null), (s = a));
        do {
          var f = s.lane & -536870913,
            p = f !== s.lane;
          if (p ? (J & f) === f : (r & f) === f) {
            (f !== 0 && f === Ba && (So = !0),
              u !== null &&
                (u = u.next =
                  {
                    lane: 0,
                    tag: s.tag,
                    payload: s.payload,
                    callback: null,
                    next: null,
                  }));
            a: {
              var m = e,
                h = s;
              f = t;
              var g = n;
              switch (h.tag) {
                case 1:
                  if (((m = h.payload), typeof m == `function`)) {
                    d = m.call(g, d, f);
                    break a;
                  }
                  d = m;
                  break a;
                case 3:
                  m.flags = (m.flags & -65537) | 128;
                case 0:
                  if (
                    ((m = h.payload),
                    (f = typeof m == `function` ? m.call(g, d, f) : m),
                    f == null)
                  )
                    break a;
                  d = x({}, d, f);
                  break a;
                case 2:
                  ho = !0;
              }
            }
            ((f = s.callback),
              f !== null &&
                ((e.flags |= 64),
                p && (e.flags |= 8192),
                (p = i.callbacks),
                p === null ? (i.callbacks = [f]) : p.push(f)));
          } else
            ((p = {
              lane: f,
              tag: s.tag,
              payload: s.payload,
              callback: s.callback,
              next: null,
            }),
              u === null ? ((l = u = p), (c = d)) : (u = u.next = p),
              (o |= f));
          if (((s = s.next), s === null)) {
            if (((s = i.shared.pending), s === null)) break;
            ((p = s),
              (s = p.next),
              (p.next = null),
              (i.lastBaseUpdate = p),
              (i.shared.pending = null));
          }
        } while (1);
        (u === null && (c = d),
          (i.baseState = c),
          (i.firstBaseUpdate = l),
          (i.lastBaseUpdate = u),
          a === null && (i.shared.lanes = 0),
          (sd |= o),
          (e.lanes = o),
          (e.memoizedState = d));
      }
    }
    function To(e, t) {
      if (typeof e != `function`) throw Error(a(191, e));
      e.call(t);
    }
    function Eo(e, t) {
      var n = e.callbacks;
      if (n !== null)
        for (e.callbacks = null, e = 0; e < n.length; e++) To(n[e], t);
    }
    var Do = Ee(null),
      Oo = Ee(0);
    function ko(e, t) {
      ((e = ad), O(Oo, e), O(Do, t), (ad = e | t.baseLanes));
    }
    function Ao() {
      (O(Oo, ad), O(Do, Do.current));
    }
    function jo() {
      ((ad = Oo.current), De(Do), De(Oo));
    }
    var Mo = Ee(null),
      No = null;
    function Po(e) {
      var t = e.alternate;
      (O(zo, zo.current & 1),
        O(Mo, e),
        No === null &&
          (t === null || Do.current !== null || t.memoizedState !== null) &&
          (No = e));
    }
    function Fo(e) {
      (O(zo, zo.current), O(Mo, e), No === null && (No = e));
    }
    function Io(e) {
      e.tag === 22
        ? (O(zo, zo.current), O(Mo, e), No === null && (No = e))
        : Lo();
    }
    function Lo() {
      (O(zo, zo.current), O(Mo, Mo.current));
    }
    function Ro(e) {
      (De(Mo), No === e && (No = null), De(zo));
    }
    var zo = Ee(0);
    function Bo(e, t) {
      (O(Mo, Mo.current), O(zo, t));
    }
    function Vo(e) {
      (De(zo), De(Mo), No === e && (No = null));
    }
    function Ho(e) {
      for (var t = e; t !== null;) {
        if (t.tag === 13) {
          var n = t.memoizedState;
          if (n !== null && ((n = n.dehydrated), n === null || om(n) || sm(n)))
            return t;
        } else if (
          t.tag === 19 &&
          t.memoizedProps.revealOrder !== `independent`
        ) {
          if (t.flags & 128) return t;
        } else if (t.child !== null) {
          ((t.child.return = t), (t = t.child));
          continue;
        }
        if (t === e) break;
        for (; t.sibling === null;) {
          if (t.return === null || t.return === e) return null;
          t = t.return;
        }
        ((t.sibling.return = t.return), (t = t.sibling));
      }
      return null;
    }
    var Uo = 0,
      B = null,
      V = null,
      Wo = null,
      Go = !1,
      Ko = !1,
      qo = !1,
      Jo = 0,
      Yo = 0,
      Xo = null,
      Zo = 0;
    function Qo() {
      throw Error(a(321));
    }
    function $o(e, t) {
      if (t === null) return !1;
      for (var n = 0; n < t.length && n < e.length; n++)
        if (!Kr(e[n], t[n])) return !1;
      return !0;
    }
    function es(e, t, n, r, i, a) {
      return (
        (Uo = a),
        (B = t),
        (t.memoizedState = null),
        (t.updateQueue = null),
        (t.lanes = 0),
        (w.H = e === null || e.memoizedState === null ? _c : vc),
        (qo = !1),
        (a = n(r, i)),
        (qo = !1),
        Ko && (a = ns(t, n, r, i)),
        ts(e),
        a
      );
    }
    function ts(e) {
      w.H = gc;
      var t = V !== null && V.next !== null;
      if (((Uo = 0), (Wo = V = B = null), (Go = !1), (Yo = 0), (Xo = null), t))
        throw Error(a(300));
      e === null ||
        Fc ||
        ((e = e.dependencies), e !== null && Ea(e) && (Fc = !0));
    }
    function ns(e, t, n, r) {
      B = e;
      var i = 0;
      do {
        if ((Ko && (Xo = null), (Yo = 0), (Ko = !1), 25 <= i))
          throw Error(a(301));
        if (((i += 1), (Wo = V = null), e.updateQueue != null)) {
          var o = e.updateQueue;
          ((o.lastEffect = null),
            (o.events = null),
            (o.stores = null),
            o.memoCache != null && (o.memoCache.index = 0));
        }
        ((w.H = yc), (o = t(n, r)));
      } while (Ko);
      return o;
    }
    function rs() {
      var e = w.H,
        t = e.useState()[0];
      return (
        (t = typeof t.then == `function` ? us(t) : t),
        (e = e.useState()[0]),
        (V === null ? null : V.memoizedState) !== e && (B.flags |= 1024),
        t
      );
    }
    function is() {
      var e = Jo !== 0;
      return ((Jo = 0), e);
    }
    function as(e, t, n) {
      ((t.updateQueue = e.updateQueue), (t.flags &= -2053), (e.lanes &= ~n));
    }
    function os(e) {
      if (Go) {
        for (e = e.memoizedState; e !== null;) {
          var t = e.queue;
          (t !== null && (t.pending = null), (e = e.next));
        }
        Go = !1;
      }
      ((Uo = 0), (Wo = V = B = null), (Ko = !1), (Yo = Jo = 0), (Xo = null));
    }
    function ss() {
      var e = {
        memoizedState: null,
        baseState: null,
        baseQueue: null,
        queue: null,
        next: null,
      };
      return (
        Wo === null ? (B.memoizedState = Wo = e) : (Wo = Wo.next = e),
        Wo
      );
    }
    function cs() {
      if (V === null) {
        var e = B.alternate;
        e = e === null ? null : e.memoizedState;
      } else e = V.next;
      var t = Wo === null ? B.memoizedState : Wo.next;
      if (t !== null) ((Wo = t), (V = e));
      else {
        if (e === null)
          throw B.alternate === null ? Error(a(467)) : Error(a(310));
        ((V = e),
          (e = {
            memoizedState: V.memoizedState,
            baseState: V.baseState,
            baseQueue: V.baseQueue,
            queue: V.queue,
            next: null,
          }),
          Wo === null ? (B.memoizedState = Wo = e) : (Wo = Wo.next = e));
      }
      return Wo;
    }
    function ls() {
      return { lastEffect: null, events: null, stores: null, memoCache: null };
    }
    function us(e) {
      var t = Yo;
      return (
        (Yo += 1),
        Xo === null && (Xo = []),
        (e = to(Xo, e, t)),
        (t = B),
        (Wo === null ? t.memoizedState : Wo.next) === null &&
          ((t = t.alternate),
          (w.H = t === null || t.memoizedState === null ? _c : vc)),
        e
      );
    }
    function ds(e) {
      if (typeof e == `object` && e) {
        if (typeof e.then == `function`) return us(e);
        if (e.$$typeof === ye) return;
        if (e.$$typeof === ue) return R(e);
      }
      throw Error(a(438, String(e)));
    }
    function fs(e) {
      var t = null,
        n = B.updateQueue;
      if ((n !== null && (t = n.memoCache), t == null)) {
        var r = B.alternate;
        r !== null &&
          ((r = r.updateQueue),
          r !== null &&
            ((r = r.memoCache),
            r != null &&
              (t = {
                data: r.data.map(function (e) {
                  return e.slice();
                }),
                index: 0,
              })));
      }
      if (
        ((t ??= { data: [], index: 0 }),
        n === null && ((n = ls()), (B.updateQueue = n)),
        (n.memoCache = t),
        (n = t.data[t.index]),
        n === void 0)
      )
        for (n = t.data[t.index] = Array(e), r = 0; r < e; r++) n[r] = _e;
      return (t.index++, n);
    }
    function ps(e, t) {
      return typeof t == `function` ? t(e) : t;
    }
    function ms(e) {
      return hs(cs(), V, e);
    }
    function hs(e, t, n) {
      var r = e.queue;
      if (r === null) throw Error(a(311));
      r.lastRenderedReducer = n;
      var i = e.baseQueue,
        o = r.pending;
      if (o !== null) {
        if (i !== null) {
          var s = i.next;
          ((i.next = o.next), (o.next = s));
        }
        ((t.baseQueue = i = o), (r.pending = null));
      }
      if (((o = e.baseState), i === null)) e.memoizedState = o;
      else {
        t = i.next;
        var c = (s = null),
          l = null,
          u = t,
          d = !1;
        do {
          var f = u.lane & -536870913;
          if (f === u.lane ? (Uo & f) === f : (J & f) === f) {
            var p = u.revertLane;
            if (p === 0)
              (l !== null &&
                (l = l.next =
                  {
                    lane: 0,
                    revertLane: 0,
                    gesture: null,
                    action: u.action,
                    hasEagerState: u.hasEagerState,
                    eagerState: u.eagerState,
                    next: null,
                  }),
                f === Ba && (d = !0));
            else if ((Uo & p) === p) {
              ((u = u.next), p === Ba && (d = !0));
              continue;
            } else
              ((f = {
                lane: 0,
                revertLane: u.revertLane,
                gesture: null,
                action: u.action,
                hasEagerState: u.hasEagerState,
                eagerState: u.eagerState,
                next: null,
              }),
                l === null ? ((c = l = f), (s = o)) : (l = l.next = f),
                (B.lanes |= p),
                (sd |= p));
            ((f = u.action),
              qo && n(o, f),
              (o = u.hasEagerState ? u.eagerState : n(o, f)));
          } else
            ((p = {
              lane: f,
              revertLane: u.revertLane,
              gesture: u.gesture,
              action: u.action,
              hasEagerState: u.hasEagerState,
              eagerState: u.eagerState,
              next: null,
            }),
              l === null ? ((c = l = p), (s = o)) : (l = l.next = p),
              (B.lanes |= f),
              (sd |= f));
          u = u.next;
        } while (u !== null && u !== t);
        if (
          (l === null ? (s = o) : (l.next = c),
          !Kr(o, e.memoizedState) && ((Fc = !0), d && ((n = Va), n !== null)))
        )
          throw n;
        ((e.memoizedState = o),
          (e.baseState = s),
          (e.baseQueue = l),
          (r.lastRenderedState = o));
      }
      return (i === null && (r.lanes = 0), [e.memoizedState, r.dispatch]);
    }
    function gs(e) {
      var t = cs(),
        n = t.queue;
      if (n === null) throw Error(a(311));
      n.lastRenderedReducer = e;
      var r = n.dispatch,
        i = n.pending,
        o = t.memoizedState;
      if (i !== null) {
        n.pending = null;
        var s = (i = i.next);
        do ((o = e(o, s.action)), (s = s.next));
        while (s !== i);
        (Kr(o, t.memoizedState) || (Fc = !0),
          (t.memoizedState = o),
          t.baseQueue === null && (t.baseState = o),
          (n.lastRenderedState = o));
      }
      return [o, r];
    }
    function _s(e, t, n) {
      var r = B,
        i = cs(),
        o = L;
      if (o) {
        if (n === void 0) throw Error(a(407));
        n = n();
      } else n = t();
      var s = !Kr((V || i).memoizedState, n);
      if (
        (s && ((i.memoizedState = n), (Fc = !0)),
        (i = i.queue),
        Hs(bs.bind(null, r, i, e), [e]),
        (e =
          i.getSnapshot !== t ||
          s ||
          (Wo !== null && !!(Wo.memoizedState.tag & 1))),
        Ls(e ? 9 : 8, { destroy: void 0 }, ys.bind(null, r, i, n, t), null),
        e)
      ) {
        if (((r.flags |= 2048), K === null)) throw Error(a(349));
        o || Uo & 127 || vs(r, t, n);
      }
      return n;
    }
    function vs(e, t, n) {
      ((e.flags |= 16384),
        (e = { getSnapshot: t, value: n }),
        (t = B.updateQueue),
        t === null
          ? ((t = ls()), (B.updateQueue = t), (t.stores = [e]))
          : ((n = t.stores), n === null ? (t.stores = [e]) : n.push(e)));
    }
    function ys(e, t, n, r) {
      ((t.value = n), (t.getSnapshot = r), xs(t) && Ss(e));
    }
    function bs(e, t, n) {
      return n(function () {
        xs(t) && Ss(e);
      });
    }
    function xs(e) {
      var t = e.getSnapshot;
      e = e.value;
      try {
        var n = t();
        return !Kr(e, n);
      } catch {
        return !0;
      }
    }
    function Ss(e) {
      var t = Mi(e, 2);
      t !== null && Pd(t, e, 2);
    }
    function Cs(e) {
      var t = ss();
      if (typeof e == `function`) {
        var n = e;
        if (((e = n()), qo)) {
          at(!0);
          try {
            n();
          } finally {
            at(!1);
          }
        }
      }
      return (
        (t.memoizedState = t.baseState = e),
        (t.queue = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: ps,
          lastRenderedState: e,
        }),
        t
      );
    }
    function ws(e, t, n, r) {
      return ((e.baseState = n), hs(e, V, typeof r == `function` ? r : ps));
    }
    function Ts(e, t, n, r, i) {
      if (pc(e)) throw Error(a(485));
      if (((e = t.action), e !== null)) {
        var o = {
          payload: i,
          action: e,
          next: null,
          isTransition: !0,
          status: `pending`,
          value: null,
          reason: null,
          listeners: [],
          then: function (e) {
            o.listeners.push(e);
          },
        };
        (w.T === null ? (o.isTransition = !1) : n(!0),
          r(o),
          (n = t.pending),
          n === null
            ? ((o.next = t.pending = o), Es(t, o))
            : ((o.next = n.next), (t.pending = n.next = o)));
      }
    }
    function Es(e, t) {
      var n = t.action,
        r = t.payload,
        i = e.state;
      if (t.isTransition) {
        var a = w.T,
          o = {};
        ((o.types = a === null ? null : a.types), (w.T = o));
        try {
          var s = n(i, r),
            c = w.S;
          (c !== null && c(o, s), Ds(e, t, s));
        } catch (n) {
          ks(e, t, n);
        } finally {
          (a !== null && o.types !== null && (a.types = o.types), (w.T = a));
        }
      } else
        try {
          ((a = n(i, r)), Ds(e, t, a));
        } catch (n) {
          ks(e, t, n);
        }
    }
    function Ds(e, t, n) {
      typeof n == `object` && n && typeof n.then == `function`
        ? n.then(
            function (n) {
              Os(e, t, n);
            },
            function (n) {
              return ks(e, t, n);
            },
          )
        : Os(e, t, n);
    }
    function Os(e, t, n) {
      ((t.status = `fulfilled`),
        (t.value = n),
        As(t),
        (e.state = n),
        (t = e.pending),
        t !== null &&
          ((n = t.next),
          n === t
            ? (e.pending = null)
            : ((n = n.next), (t.next = n), Es(e, n))));
    }
    function ks(e, t, n) {
      var r = e.pending;
      if (((e.pending = null), r !== null)) {
        r = r.next;
        do ((t.status = `rejected`), (t.reason = n), As(t), (t = t.next));
        while (t !== r);
      }
      e.action = null;
    }
    function As(e) {
      e = e.listeners;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
    function js(e, t) {
      return t;
    }
    function Ms(e, t) {
      if (L) {
        var n = K.formState;
        if (n !== null) {
          a: {
            var r = B;
            if (L) {
              if (I) {
                b: {
                  for (var i = I, a = la; i.nodeType !== 8;)
                    if (!a || ((i = lm(i.nextSibling)), i === null)) {
                      i = null;
                      break b;
                    }
                  ((a = i.data), (i = a === `F!` || a === `F` ? i : null));
                }
                if (i) {
                  ((I = lm(i.nextSibling)), (r = i.data === `F!`));
                  break a;
                }
              }
              da(r);
            }
            r = !1;
          }
          r && (t = n[0]);
        }
      }
      return (
        (n = ss()),
        (n.memoizedState = n.baseState = t),
        (r = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: js,
          lastRenderedState: t,
        }),
        (n.queue = r),
        (n = uc.bind(null, B, r)),
        (r.dispatch = n),
        (r = Cs(!1)),
        (a = fc.bind(null, B, !1, r.queue)),
        (r = ss()),
        (i = { state: t, dispatch: null, action: e, pending: null }),
        (r.queue = i),
        (n = Ts.bind(null, B, i, a, n)),
        (i.dispatch = n),
        (r.memoizedState = e),
        [t, n, !1]
      );
    }
    function Ns(e) {
      return Ps(cs(), V, e);
    }
    function Ps(e, t, n) {
      if (
        ((t = hs(e, t, js)[0]),
        (e = ms(ps)[0]),
        typeof t == `object` && t && typeof t.then == `function`)
      )
        try {
          var r = us(t);
        } catch (e) {
          throw e === Xa ? Qa : e;
        }
      else r = t;
      t = cs();
      var i = t.queue,
        a = i.dispatch;
      return (
        n !== t.memoizedState &&
          ((B.flags |= 2048),
          Ls(9, { destroy: void 0 }, Fs.bind(null, i, n), null)),
        [r, a, e]
      );
    }
    function Fs(e, t) {
      e.action = t;
    }
    function Is(e) {
      var t = cs(),
        n = V;
      if (n !== null) return Ps(t, n, e);
      (cs(), (t = t.memoizedState), (n = cs()));
      var r = n.queue.dispatch;
      return ((n.memoizedState = e), [t, r, !1]);
    }
    function Ls(e, t, n, r) {
      return (
        (e = { tag: e, create: n, deps: r, inst: t, next: null }),
        (t = B.updateQueue),
        t === null && ((t = ls()), (B.updateQueue = t)),
        (n = t.lastEffect),
        n === null
          ? (t.lastEffect = e.next = e)
          : ((r = n.next), (n.next = e), (e.next = r), (t.lastEffect = e)),
        e
      );
    }
    function Rs() {
      return cs().memoizedState;
    }
    function zs(e, t, n, r) {
      var i = ss();
      ((B.flags |= e),
        (i.memoizedState = Ls(
          1 | t,
          { destroy: void 0 },
          n,
          r === void 0 ? null : r,
        )));
    }
    function Bs(e, t, n, r) {
      var i = cs();
      r = r === void 0 ? null : r;
      var a = i.memoizedState.inst;
      V !== null && r !== null && $o(r, V.memoizedState.deps)
        ? (i.memoizedState = Ls(t, a, n, r))
        : ((B.flags |= e), (i.memoizedState = Ls(1 | t, a, n, r)));
    }
    function Vs(e, t) {
      zs(8390656, 8, e, t);
    }
    function Hs(e, t) {
      Bs(2048, 8, e, t);
    }
    function Us(e) {
      B.flags |= 4;
      var t = B.updateQueue;
      if (t === null) ((t = ls()), (B.updateQueue = t), (t.events = [e]));
      else {
        var n = t.events;
        n === null ? (t.events = [e]) : n.push(e);
      }
    }
    function Ws(e) {
      var t = cs().memoizedState;
      return (
        Us({ ref: t, nextImpl: e }),
        function () {
          if (G & 2) throw Error(a(440));
          return t.impl.apply(void 0, arguments);
        }
      );
    }
    function Gs(e, t) {
      return Bs(4, 2, e, t);
    }
    function Ks(e, t) {
      return Bs(4, 4, e, t);
    }
    function qs(e, t) {
      if (typeof t == `function`) {
        e = e();
        var n = t(e);
        return function () {
          typeof n == `function` ? n() : t(null);
        };
      }
      if (t != null)
        return (
          (e = e()),
          (t.current = e),
          function () {
            t.current = null;
          }
        );
    }
    function Js(e, t, n) {
      ((n = n == null ? null : n.concat([e])),
        Bs(4, 4, qs.bind(null, t, e), n));
    }
    function Ys() {}
    function Xs(e, t) {
      var n = cs();
      t = t === void 0 ? null : t;
      var r = n.memoizedState;
      return t !== null && $o(t, r[1]) ? r[0] : ((n.memoizedState = [e, t]), e);
    }
    function Zs(e, t) {
      var n = cs();
      t = t === void 0 ? null : t;
      var r = n.memoizedState;
      if (t !== null && $o(t, r[1])) return r[0];
      if (((r = e()), qo)) {
        at(!0);
        try {
          e();
        } finally {
          at(!1);
        }
      }
      return ((n.memoizedState = [r, t]), r);
    }
    function Qs(e, t, n) {
      return n === void 0 || (Uo & 1073741824 && !(J & 261930))
        ? (e.memoizedState = t)
        : ((e.memoizedState = n), (e = Md()), (B.lanes |= e), (sd |= e), n);
    }
    function $s(e, t, n, r) {
      return Kr(n, t)
        ? n
        : Do.current === null
          ? !(Uo & 106) || (Uo & 1073741824 && !(J & 261930))
            ? ((Fc = !0), (e.memoizedState = n))
            : ((e = Md()), (B.lanes |= e), (sd |= e), t)
          : ((e = Qs(e, n, r)), Kr(e, t) || (Fc = !0), e);
    }
    function ec(e, t, n, r, i) {
      var a = T.p;
      T.p = a !== 0 && 8 > a ? a : 8;
      var o = w.T,
        s = {};
      ((s.types = o === null ? null : o.types), (w.T = s), fc(e, !1, t, n));
      try {
        var c = i(),
          l = w.S;
        (l !== null && l(s, c),
          typeof c == `object` && c && typeof c.then == `function`
            ? dc(e, t, Wa(c, r), jd(e))
            : dc(e, t, r, jd(e)));
      } catch (n) {
        dc(e, t, { then: function () {}, status: `rejected`, reason: n }, jd());
      } finally {
        ((T.p = a),
          o !== null && s.types !== null && (o.types = s.types),
          (w.T = o));
      }
    }
    function tc() {}
    function nc(e, t, n, r) {
      if (e.tag !== 5) throw Error(a(476));
      var i = rc(e).queue;
      ec(
        e,
        i,
        t,
        E,
        n === null
          ? tc
          : function () {
              return (ic(e), n(r));
            },
      );
    }
    function rc(e) {
      var t = e.memoizedState;
      if (t !== null) return t;
      t = {
        memoizedState: E,
        baseState: E,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: ps,
          lastRenderedState: E,
        },
        next: null,
      };
      var n = {};
      return (
        (t.next = {
          memoizedState: n,
          baseState: n,
          baseQueue: null,
          queue: {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: ps,
            lastRenderedState: n,
          },
          next: null,
        }),
        (e.memoizedState = t),
        (e = e.alternate),
        e !== null && (e.memoizedState = t),
        t
      );
    }
    function ic(e) {
      var t = rc(e);
      (t.next === null && (t = e.alternate.memoizedState),
        dc(e, t.next.queue, {}, jd()));
    }
    function ac() {
      return R(sh);
    }
    function oc() {
      return cs().memoizedState;
    }
    function sc() {
      return cs().memoizedState;
    }
    function cc(e) {
      for (var t = e.return; t !== null;) {
        switch (t.tag) {
          case 24:
          case 3:
            var n = jd();
            e = vo(n);
            var r = yo(t, e, n);
            (r !== null && (Pd(r, t, n), bo(r, t, n)),
              (t = { cache: Na() }),
              (e.payload = t));
            return;
        }
        t = t.return;
      }
    }
    function lc(e, t, n) {
      var r = jd();
      ((n = {
        lane: r,
        revertLane: 0,
        gesture: null,
        action: n,
        hasEagerState: !1,
        eagerState: null,
        next: null,
      }),
        pc(e)
          ? mc(t, n)
          : ((n = ji(e, t, n, r)), n !== null && (Pd(n, e, r), hc(n, t, r))));
    }
    function uc(e, t, n) {
      dc(e, t, n, jd());
    }
    function dc(e, t, n, r) {
      var i = {
        lane: r,
        revertLane: 0,
        gesture: null,
        action: n,
        hasEagerState: !1,
        eagerState: null,
        next: null,
      };
      if (pc(e)) mc(t, i);
      else {
        var a = e.alternate;
        if (
          e.lanes === 0 &&
          (a === null || a.lanes === 0) &&
          ((a = t.lastRenderedReducer), a !== null)
        )
          try {
            var o = t.lastRenderedState,
              s = a(o, n);
            if (((i.hasEagerState = !0), (i.eagerState = s), Kr(s, o)))
              return (Ai(e, t, i, 0), K === null && ki(), !1);
          } catch {}
        if (((n = ji(e, t, i, r)), n !== null))
          return (Pd(n, e, r), hc(n, t, r), !0);
      }
      return !1;
    }
    function fc(e, t, n, r) {
      if (
        ((r = {
          lane: 2,
          revertLane: Pf(),
          gesture: null,
          action: r,
          hasEagerState: !1,
          eagerState: null,
          next: null,
        }),
        pc(e))
      ) {
        if (t) throw Error(a(479));
      } else ((t = ji(e, n, r, 2)), t !== null && Pd(t, e, 2));
    }
    function pc(e) {
      var t = e.alternate;
      return e === B || (t !== null && t === B);
    }
    function mc(e, t) {
      Ko = Go = !0;
      var n = e.pending;
      (n === null ? (t.next = t) : ((t.next = n.next), (n.next = t)),
        (e.pending = t));
    }
    function hc(e, t, n) {
      if (n & 4194048) {
        var r = t.lanes;
        ((r &= e.pendingLanes), (n |= r), (t.lanes = n), Ct(e, n));
      }
    }
    var gc = {
        readContext: R,
        use: ds,
        useCallback: Qo,
        useContext: Qo,
        useEffect: Qo,
        useImperativeHandle: Qo,
        useLayoutEffect: Qo,
        useInsertionEffect: Qo,
        useMemo: Qo,
        useReducer: Qo,
        useRef: Qo,
        useState: Qo,
        useDebugValue: Qo,
        useDeferredValue: Qo,
        useTransition: Qo,
        useSyncExternalStore: Qo,
        useId: Qo,
        useHostTransitionStatus: Qo,
        useFormState: Qo,
        useActionState: Qo,
        useOptimistic: Qo,
        useMemoCache: Qo,
        useCacheRefresh: Qo,
        useEffectEvent: Qo,
      },
      _c = {
        readContext: R,
        use: ds,
        useCallback: function (e, t) {
          return ((ss().memoizedState = [e, t === void 0 ? null : t]), e);
        },
        useContext: R,
        useEffect: Vs,
        useImperativeHandle: function (e, t, n) {
          ((n = n == null ? null : n.concat([e])),
            zs(4194308, 4, qs.bind(null, t, e), n));
        },
        useLayoutEffect: function (e, t) {
          return zs(4194308, 4, e, t);
        },
        useInsertionEffect: function (e, t) {
          zs(4, 2, e, t);
        },
        useMemo: function (e, t) {
          var n = ss();
          t = t === void 0 ? null : t;
          var r = e();
          if (qo) {
            at(!0);
            try {
              e();
            } finally {
              at(!1);
            }
          }
          return ((n.memoizedState = [r, t]), r);
        },
        useReducer: function (e, t, n) {
          var r = ss();
          if (n !== void 0) {
            var i = n(t);
            if (qo) {
              at(!0);
              try {
                n(t);
              } finally {
                at(!1);
              }
            }
          } else i = t;
          return (
            (r.memoizedState = r.baseState = i),
            (e = {
              pending: null,
              lanes: 0,
              dispatch: null,
              lastRenderedReducer: e,
              lastRenderedState: i,
            }),
            (r.queue = e),
            (e = e.dispatch = lc.bind(null, B, e)),
            [r.memoizedState, e]
          );
        },
        useRef: function (e) {
          var t = ss();
          return ((e = { current: e }), (t.memoizedState = e));
        },
        useState: function (e) {
          e = Cs(e);
          var t = e.queue,
            n = uc.bind(null, B, t);
          return ((t.dispatch = n), [e.memoizedState, n]);
        },
        useDebugValue: Ys,
        useDeferredValue: function (e, t) {
          return Qs(ss(), e, t);
        },
        useTransition: function () {
          var e = Cs(!1);
          return (
            (e = ec.bind(null, B, e.queue, !0, !1)),
            (ss().memoizedState = e),
            [!1, e]
          );
        },
        useSyncExternalStore: function (e, t, n) {
          var r = B,
            i = ss();
          if (L) {
            if (n === void 0) throw Error(a(407));
            n = n();
          } else {
            if (((n = t()), K === null)) throw Error(a(349));
            J & 127 || vs(r, t, n);
          }
          i.memoizedState = n;
          var o = { value: n, getSnapshot: t };
          return (
            (i.queue = o),
            Vs(bs.bind(null, r, o, e), [e]),
            (r.flags |= 2048),
            Ls(9, { destroy: void 0 }, ys.bind(null, r, o, n, t), null),
            n
          );
        },
        useId: function () {
          var e = ss(),
            t = K.identifierPrefix;
          if (L) {
            var n = na,
              r = ta;
            ((n = (r & ~(1 << (32 - ot(r) - 1))).toString(32) + n),
              (t = `_` + t + `R_` + n),
              (n = Jo++),
              0 < n && (t += `H` + n.toString(32)),
              (t += `_`));
          } else ((n = Zo++), (t = `_` + t + `r_` + n.toString(32) + `_`));
          return (e.memoizedState = t);
        },
        useHostTransitionStatus: ac,
        useFormState: Ms,
        useActionState: Ms,
        useOptimistic: function (e) {
          var t = ss();
          t.memoizedState = t.baseState = e;
          var n = {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: null,
            lastRenderedState: null,
          };
          return (
            (t.queue = n),
            (t = fc.bind(null, B, !0, n)),
            (n.dispatch = t),
            [e, t]
          );
        },
        useMemoCache: fs,
        useCacheRefresh: function () {
          return (ss().memoizedState = cc.bind(null, B));
        },
        useEffectEvent: function (e) {
          var t = ss(),
            n = { impl: e };
          return (
            (t.memoizedState = n),
            function () {
              if (G & 2) throw Error(a(440));
              return n.impl.apply(void 0, arguments);
            }
          );
        },
      },
      vc = {
        readContext: R,
        use: ds,
        useCallback: Xs,
        useContext: R,
        useEffect: Hs,
        useImperativeHandle: Js,
        useInsertionEffect: Gs,
        useLayoutEffect: Ks,
        useMemo: Zs,
        useReducer: ms,
        useRef: Rs,
        useState: function () {
          return ms(ps);
        },
        useDebugValue: Ys,
        useDeferredValue: function (e, t) {
          return $s(cs(), V.memoizedState, e, t);
        },
        useTransition: function () {
          var e = ms(ps)[0],
            t = cs().memoizedState;
          return [typeof e == `boolean` ? e : us(e), t];
        },
        useSyncExternalStore: _s,
        useId: oc,
        useHostTransitionStatus: ac,
        useFormState: Ns,
        useActionState: Ns,
        useOptimistic: function (e, t) {
          return ws(cs(), V, e, t);
        },
        useMemoCache: fs,
        useCacheRefresh: sc,
        useEffectEvent: Ws,
      },
      yc = {
        readContext: R,
        use: ds,
        useCallback: Xs,
        useContext: R,
        useEffect: Hs,
        useImperativeHandle: Js,
        useInsertionEffect: Gs,
        useLayoutEffect: Ks,
        useMemo: Zs,
        useReducer: gs,
        useRef: Rs,
        useState: function () {
          return gs(ps);
        },
        useDebugValue: Ys,
        useDeferredValue: function (e, t) {
          var n = cs();
          return V === null ? Qs(n, e, t) : $s(n, V.memoizedState, e, t);
        },
        useTransition: function () {
          var e = gs(ps)[0],
            t = cs().memoizedState;
          return [typeof e == `boolean` ? e : us(e), t];
        },
        useSyncExternalStore: _s,
        useId: oc,
        useHostTransitionStatus: ac,
        useFormState: Is,
        useActionState: Is,
        useOptimistic: function (e, t) {
          var n = cs();
          return V === null
            ? ((n.baseState = e), [e, n.queue.dispatch])
            : ws(n, V, e, t);
        },
        useMemoCache: fs,
        useCacheRefresh: sc,
        useEffectEvent: Ws,
      };
    function bc(e, t, n, r) {
      ((t = e.memoizedState),
        (n = n(r, t)),
        (n = n == null ? t : x({}, t, n)),
        (e.memoizedState = n),
        e.lanes === 0 && (e.updateQueue.baseState = n));
    }
    var xc = {
      enqueueSetState: function (e, t, n) {
        e = e._reactInternals;
        var r = jd(),
          i = vo(r);
        ((i.payload = t),
          n != null && (i.callback = n),
          (t = yo(e, i, r)),
          t !== null && (Pd(t, e, r), bo(t, e, r)));
      },
      enqueueReplaceState: function (e, t, n) {
        e = e._reactInternals;
        var r = jd(),
          i = vo(r);
        ((i.tag = 1),
          (i.payload = t),
          n != null && (i.callback = n),
          (t = yo(e, i, r)),
          t !== null && (Pd(t, e, r), bo(t, e, r)));
      },
      enqueueForceUpdate: function (e, t) {
        e = e._reactInternals;
        var n = jd(),
          r = vo(n);
        ((r.tag = 2),
          t != null && (r.callback = t),
          (t = yo(e, r, n)),
          t !== null && (Pd(t, e, n), bo(t, e, n)));
      },
    };
    function Sc(e, t, n, r, i, a, o) {
      return (
        (e = e.stateNode),
        typeof e.shouldComponentUpdate == `function`
          ? e.shouldComponentUpdate(r, a, o)
          : t.prototype && t.prototype.isPureReactComponent
            ? !qr(n, r) || !qr(i, a)
            : !0
      );
    }
    function Cc(e, t, n, r) {
      ((e = t.state),
        typeof t.componentWillReceiveProps == `function` &&
          t.componentWillReceiveProps(n, r),
        typeof t.UNSAFE_componentWillReceiveProps == `function` &&
          t.UNSAFE_componentWillReceiveProps(n, r),
        t.state !== e && xc.enqueueReplaceState(t, t.state, null));
    }
    function wc(e, t) {
      var n = t;
      if (`ref` in t) for (var r in ((n = {}), t)) r !== `ref` && (n[r] = t[r]);
      if ((e = e.defaultProps))
        for (var i in (n === t && (n = x({}, n)), e))
          n[i] === void 0 && (n[i] = e[i]);
      return n;
    }
    function Tc(e) {
      Ti(e);
    }
    function Ec(e) {
      console.error(e);
    }
    function Dc(e) {
      Ti(e);
    }
    function Oc(e, t) {
      try {
        var n = e.onUncaughtError;
        n(t.value, { componentStack: t.stack });
      } catch (e) {
        setTimeout(function () {
          throw e;
        });
      }
    }
    function kc(e, t, n) {
      try {
        var r = e.onCaughtError;
        r(n.value, {
          componentStack: n.stack,
          errorBoundary: t.tag === 1 ? t.stateNode : null,
        });
      } catch (e) {
        setTimeout(function () {
          throw e;
        });
      }
    }
    function Ac(e, t, n) {
      return (
        (n = vo(n)),
        (n.tag = 3),
        (n.payload = { element: null }),
        (n.callback = function () {
          Oc(e, t);
        }),
        n
      );
    }
    function jc(e) {
      return ((e = vo(e)), (e.tag = 3), e);
    }
    function Mc(e, t, n, r) {
      var i = n.type.getDerivedStateFromError;
      if (typeof i == `function`) {
        var a = r.value;
        ((e.payload = function () {
          return i(a);
        }),
          (e.callback = function () {
            kc(t, n, r);
          }));
      }
      var o = n.stateNode;
      o !== null &&
        typeof o.componentDidCatch == `function` &&
        (e.callback = function () {
          (kc(t, n, r),
            typeof i != `function` &&
              (yd === null ? (yd = new Set([this])) : yd.add(this)));
          var e = r.stack;
          this.componentDidCatch(r.value, {
            componentStack: e === null ? `` : e,
          });
        });
    }
    function Nc(e, t, n, r, i) {
      if (
        ((n.flags |= 32768),
        typeof r == `object` && r && typeof r.then == `function`)
      ) {
        if (
          ((t = n.alternate),
          t !== null && Ta(t, n, i, !0),
          (n = Mo.current),
          n !== null)
        ) {
          switch (n.tag) {
            case 31:
            case 13:
            case 19:
              return (
                No === null
                  ? Kd()
                  : n.alternate === null && od === 0 && (od = 3),
                (n.flags &= -257),
                (n.flags |= 65536),
                (n.lanes = i),
                r === $a
                  ? (n.flags |= 16384)
                  : ((t = n.updateQueue),
                    t === null ? (n.updateQueue = new Set([r])) : t.add(r),
                    mf(e, r, i)),
                !1
              );
            case 22:
              return (
                (n.flags |= 65536),
                r === $a
                  ? (n.flags |= 16384)
                  : ((t = n.updateQueue),
                    t === null
                      ? ((t = {
                          transitions: null,
                          markerInstances: null,
                          retryQueue: new Set([r]),
                        }),
                        (n.updateQueue = t))
                      : ((n = t.retryQueue),
                        n === null ? (t.retryQueue = new Set([r])) : n.add(r)),
                    mf(e, r, i)),
                !1
              );
          }
          throw Error(a(435, n.tag));
        }
        return (mf(e, r, i), Kd(), !1);
      }
      if (L)
        return (
          (t = Mo.current),
          t === null
            ? (r !== ua && ((t = Error(a(423), { cause: r })), _a(qi(t, n))),
              (e = e.current.alternate),
              (e.flags |= 65536),
              (i &= -i),
              (e.lanes |= i),
              (r = qi(r, n)),
              (i = Ac(e.stateNode, r, i)),
              xo(e, i),
              od !== 4 && (od = 2))
            : (!(t.flags & 65536) && (t.flags |= 256),
              (t.flags |= 65536),
              (t.lanes = i),
              r !== ua && ((e = Error(a(422), { cause: r })), _a(qi(e, n)))),
          !1
        );
      var o = Error(a(520), { cause: r });
      if (
        ((o = qi(o, n)),
        fd === null ? (fd = [o]) : fd.push(o),
        od !== 4 && (od = 2),
        t === null)
      )
        return !0;
      ((r = qi(r, n)), (n = t));
      do {
        switch (n.tag) {
          case 3:
            return (
              (n.flags |= 65536),
              (e = i & -i),
              (n.lanes |= e),
              (e = Ac(n.stateNode, r, e)),
              xo(n, e),
              !1
            );
          case 1:
            if (
              ((t = n.type),
              (o = n.stateNode),
              !(n.flags & 128) &&
                (typeof t.getDerivedStateFromError == `function` ||
                  (o !== null &&
                    typeof o.componentDidCatch == `function` &&
                    (yd === null || !yd.has(o)))))
            )
              return (
                (n.flags |= 65536),
                (i &= -i),
                (n.lanes |= i),
                (i = jc(i)),
                Mc(i, e, n, r),
                xo(n, i),
                !1
              );
            break;
          case 22:
            if (n.memoizedState !== null) return ((n.flags |= 65536), !1);
        }
        n = n.return;
      } while (n !== null);
      return !1;
    }
    var Pc = Error(a(461)),
      Fc = !1;
    function Ic(e, t, n, r) {
      t.child = e === null ? mo(t, null, n, r) : po(t, e.child, n, r);
    }
    function Lc(e, t, n, r, i) {
      n = n.render;
      var a = t.ref;
      if (`ref` in r) {
        var o = {};
        for (var s in r) s !== `ref` && (o[s] = r[s]);
      } else o = r;
      return (
        Da(t),
        (r = es(e, t, n, o, a, i)),
        (s = is()),
        e !== null && !Fc
          ? (as(e, t, i), dl(e, t, i))
          : (L && s && aa(t), (t.flags |= 1), Ic(e, t, r, i), t.child)
      );
    }
    function Rc(e, t, n, r, i) {
      if (e === null) {
        var a = n.type;
        return typeof a == `function` &&
          !Ri(a) &&
          a.defaultProps === void 0 &&
          n.compare === null
          ? ((t.tag = 15), (t.type = a), zc(e, t, a, r, i))
          : ((e = Vi(n.type, null, r, t, t.mode, i)),
            (e.ref = t.ref),
            (e.return = t),
            (t.child = e));
      }
      if (((a = e.child), !fl(e, i))) {
        var o = a.memoizedProps;
        if (
          ((n = n.compare),
          (n = n === null ? qr : n),
          n(o, r) && e.ref === t.ref)
        )
          return dl(e, t, i);
      }
      return (
        (t.flags |= 1),
        (e = zi(a, r)),
        (e.ref = t.ref),
        (e.return = t),
        (t.child = e)
      );
    }
    function zc(e, t, n, r, i) {
      if (e !== null) {
        var a = e.memoizedProps;
        if (qr(a, r) && e.ref === t.ref) {
          if (((Fc = !1), (t.pendingProps = r = a), fl(e, i)))
            e.flags & 131072 && (Fc = !0);
          else return ((t.lanes = e.lanes), dl(e, t, i));
        }
      }
      return qc(e, t, n, r, i);
    }
    function Bc(e, t, n, r) {
      var i = r.children,
        a = e === null ? null : e.memoizedState;
      if (
        (e === null &&
          t.stateNode === null &&
          (t.stateNode = {
            _visibility: 1,
            _pendingMarkers: null,
            _retryCache: null,
            _transitions: null,
          }),
        r.mode === `hidden`)
      ) {
        if (t.flags & 128) {
          if (((a = a === null ? n : a.baseLanes | n), e !== null)) {
            for (r = t.child = e.child, i = 0; r !== null;)
              ((i = i | r.lanes | r.childLanes), (r = r.sibling));
            r = i & ~a;
          } else ((r = 0), (t.child = null));
          return Hc(e, t, a, n, r);
        }
        if (n & 536870912)
          ((t.memoizedState = { baseLanes: 0, cachePool: null }),
            e !== null && Ja(t, a === null ? null : a.cachePool),
            a === null ? Ao() : ko(t, a),
            Io(t));
        else
          return (
            (r = t.lanes = 536870912),
            Hc(e, t, a === null ? n : a.baseLanes | n, n, r)
          );
      } else
        a === null
          ? (e !== null && Ja(t, null), Ao(), Lo())
          : (Ja(t, a.cachePool), ko(t, a), Lo(), (t.memoizedState = null));
      return (Ic(e, t, i, n), t.child);
    }
    function Vc(e, t) {
      return (
        (e !== null && e.tag === 22) ||
          t.stateNode !== null ||
          (t.stateNode = {
            _visibility: 1,
            _pendingMarkers: null,
            _retryCache: null,
            _transitions: null,
          }),
        t.sibling
      );
    }
    function Hc(e, t, n, r, i) {
      var a = qa();
      return (
        (a = a === null ? null : { parent: z._currentValue, pool: a }),
        (t.memoizedState = { baseLanes: n, cachePool: a }),
        e !== null && Ja(t, null),
        Ao(),
        Io(t),
        e !== null && Ta(e, t, r, !0),
        (t.childLanes = i),
        null
      );
    }
    function Uc(e, t) {
      return (
        (t = nl({ mode: t.mode, children: t.children }, e.mode)),
        (t.ref = e.ref),
        (e.child = t),
        (t.return = e),
        t
      );
    }
    function Wc(e, t, n) {
      return (
        po(t, e.child, null, n),
        (e = Uc(t, t.pendingProps)),
        (e.flags |= 2),
        Ro(t),
        (t.memoizedState = null),
        e
      );
    }
    function Gc(e, t, n) {
      var r = t.pendingProps,
        i = !!(t.flags & 128);
      if (((t.flags &= -129), e === null)) {
        if (L) {
          if (r.mode === `hidden`)
            return (
              (e = Uc(t, r)),
              (t.lanes = 536870912),
              (e.memoizedState = { baseLanes: 0, cachePool: null }),
              Vc(null, e)
            );
          if (
            (Fo(t),
            (e = I)
              ? ((e = am(e, la)),
                (e = e !== null && e.data === `&` ? e : null),
                e !== null &&
                  ((t.memoizedState = {
                    dehydrated: e,
                    treeContext: ea === null ? null : { id: ta, overflow: na },
                    retryLane: 536870912,
                    hydrationErrors: null,
                  }),
                  (n = Wi(e)),
                  (n.return = t),
                  (t.child = n),
                  (F = t),
                  (I = null)))
              : (e = null),
            e === null)
          )
            throw da(t);
          return ((t.lanes = 536870912), null);
        }
        return Uc(t, r);
      }
      var o = e.memoizedState;
      if (o !== null) {
        var s = o.dehydrated;
        if ((Fo(t), i)) {
          if (t.flags & 256) ((t.flags &= -257), (t = Wc(e, t, n)));
          else if (t.memoizedState !== null)
            ((t.child = e.child), (t.flags |= 128), (t = null));
          else throw Error(a(558));
        } else if (
          (Fc || Ta(e, t, n, !1), (i = (n & e.childLanes) !== 0), Fc || i)
        ) {
          if (Do.current === null) {
            if (
              ((r = K),
              r !== null && ((s = wt(r, n)), s !== 0 && s !== o.retryLane))
            )
              throw ((o.retryLane = s), Mi(e, s), Pd(r, e, s), Pc);
            Kd();
          }
          t = Wc(e, t, n);
        } else
          ((e = o.treeContext),
            (I = lm(s.nextSibling)),
            (F = t),
            (L = !0),
            (ca = null),
            (la = !1),
            e !== null && sa(t, e),
            (t = Uc(t, r)),
            (t.flags |= 134221824));
        return t;
      }
      return (
        (e = zi(e.child, { mode: r.mode, children: r.children })),
        (e.ref = t.ref),
        (t.child = e),
        (e.return = t),
        e
      );
    }
    function Kc(e, t) {
      var n = t.ref;
      if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816);
      else {
        if (typeof n != `function` && typeof n != `object`) throw Error(a(284));
        (e === null || e.ref !== n) && (t.flags |= 4194816);
      }
    }
    function qc(e, t, n, r, i) {
      return (
        Da(t),
        (n = es(e, t, n, r, void 0, i)),
        (r = is()),
        e !== null && !Fc
          ? (as(e, t, i), dl(e, t, i))
          : (L && r && aa(t), (t.flags |= 1), Ic(e, t, n, i), t.child)
      );
    }
    function Jc(e, t, n, r, i, a) {
      return (
        Da(t),
        (t.updateQueue = null),
        (n = ns(t, r, n, i)),
        ts(e),
        (r = is()),
        e !== null && !Fc
          ? (as(e, t, a), dl(e, t, a))
          : (L && r && aa(t), (t.flags |= 1), Ic(e, t, n, a), t.child)
      );
    }
    function Yc(e, t, n, r, i) {
      if ((Da(t), t.stateNode === null)) {
        var a = Fi,
          o = n.contextType;
        (typeof o == `object` && o && (a = R(o)),
          (a = new n(r, a)),
          (t.memoizedState =
            a.state !== null && a.state !== void 0 ? a.state : null),
          (a.updater = xc),
          (t.stateNode = a),
          (a._reactInternals = t),
          (a = t.stateNode),
          (a.props = r),
          (a.state = t.memoizedState),
          (a.refs = {}),
          go(t),
          (o = n.contextType),
          (a.context = typeof o == `object` && o ? R(o) : Fi),
          (a.state = t.memoizedState),
          (o = n.getDerivedStateFromProps),
          typeof o == `function` &&
            (bc(t, n, o, r), (a.state = t.memoizedState)),
          typeof n.getDerivedStateFromProps == `function` ||
            typeof a.getSnapshotBeforeUpdate == `function` ||
            (typeof a.UNSAFE_componentWillMount != `function` &&
              typeof a.componentWillMount != `function`) ||
            ((o = a.state),
            typeof a.componentWillMount == `function` && a.componentWillMount(),
            typeof a.UNSAFE_componentWillMount == `function` &&
              a.UNSAFE_componentWillMount(),
            o !== a.state && xc.enqueueReplaceState(a, a.state, null),
            wo(t, r, a, i),
            Co(),
            (a.state = t.memoizedState)),
          typeof a.componentDidMount == `function` && (t.flags |= 4194308),
          (r = !0));
      } else if (e === null) {
        a = t.stateNode;
        var s = t.memoizedProps,
          c = wc(n, s);
        a.props = c;
        var l = a.context,
          u = n.contextType;
        ((o = Fi), typeof u == `object` && u && (o = R(u)));
        var d = n.getDerivedStateFromProps;
        ((u =
          typeof d == `function` ||
          typeof a.getSnapshotBeforeUpdate == `function`),
          (s = t.pendingProps !== s),
          u ||
            (typeof a.UNSAFE_componentWillReceiveProps != `function` &&
              typeof a.componentWillReceiveProps != `function`) ||
            ((s || l !== o) && Cc(t, a, r, o)),
          (ho = !1));
        var f = t.memoizedState;
        ((a.state = f),
          wo(t, r, a, i),
          Co(),
          (l = t.memoizedState),
          s || f !== l || ho
            ? (typeof d == `function` &&
                (bc(t, n, d, r), (l = t.memoizedState)),
              (c = ho || Sc(t, n, c, r, f, l, o))
                ? (u ||
                    (typeof a.UNSAFE_componentWillMount != `function` &&
                      typeof a.componentWillMount != `function`) ||
                    (typeof a.componentWillMount == `function` &&
                      a.componentWillMount(),
                    typeof a.UNSAFE_componentWillMount == `function` &&
                      a.UNSAFE_componentWillMount()),
                  typeof a.componentDidMount == `function` &&
                    (t.flags |= 4194308))
                : (typeof a.componentDidMount == `function` &&
                    (t.flags |= 4194308),
                  (t.memoizedProps = r),
                  (t.memoizedState = l)),
              (a.props = r),
              (a.state = l),
              (a.context = o),
              (r = c))
            : (typeof a.componentDidMount == `function` && (t.flags |= 4194308),
              (r = !1)));
      } else {
        ((a = t.stateNode),
          _o(e, t),
          (o = t.memoizedProps),
          (u = wc(n, o)),
          (a.props = u),
          (d = t.pendingProps),
          (f = a.context),
          (l = n.contextType),
          (c = Fi),
          typeof l == `object` && l && (c = R(l)),
          (s = n.getDerivedStateFromProps),
          (l =
            typeof s == `function` ||
            typeof a.getSnapshotBeforeUpdate == `function`) ||
            (typeof a.UNSAFE_componentWillReceiveProps != `function` &&
              typeof a.componentWillReceiveProps != `function`) ||
            ((o !== d || f !== c) && Cc(t, a, r, c)),
          (ho = !1),
          (f = t.memoizedState),
          (a.state = f),
          wo(t, r, a, i),
          Co());
        var p = t.memoizedState;
        o !== d ||
        f !== p ||
        ho ||
        (e !== null && e.dependencies !== null && Ea(e.dependencies))
          ? (typeof s == `function` && (bc(t, n, s, r), (p = t.memoizedState)),
            (u =
              ho ||
              Sc(t, n, u, r, f, p, c) ||
              (e !== null && e.dependencies !== null && Ea(e.dependencies)))
              ? (l ||
                  (typeof a.UNSAFE_componentWillUpdate != `function` &&
                    typeof a.componentWillUpdate != `function`) ||
                  (typeof a.componentWillUpdate == `function` &&
                    a.componentWillUpdate(r, p, c),
                  typeof a.UNSAFE_componentWillUpdate == `function` &&
                    a.UNSAFE_componentWillUpdate(r, p, c)),
                typeof a.componentDidUpdate == `function` && (t.flags |= 4),
                typeof a.getSnapshotBeforeUpdate == `function` &&
                  (t.flags |= 1024))
              : (typeof a.componentDidUpdate != `function` ||
                  (o === e.memoizedProps && f === e.memoizedState) ||
                  (t.flags |= 4),
                typeof a.getSnapshotBeforeUpdate != `function` ||
                  (o === e.memoizedProps && f === e.memoizedState) ||
                  (t.flags |= 1024),
                (t.memoizedProps = r),
                (t.memoizedState = p)),
            (a.props = r),
            (a.state = p),
            (a.context = c),
            (r = u))
          : (typeof a.componentDidUpdate != `function` ||
              (o === e.memoizedProps && f === e.memoizedState) ||
              (t.flags |= 4),
            typeof a.getSnapshotBeforeUpdate != `function` ||
              (o === e.memoizedProps && f === e.memoizedState) ||
              (t.flags |= 1024),
            (r = !1));
      }
      return (
        (a = r),
        Kc(e, t),
        (r = !!(t.flags & 128)),
        a || r
          ? ((a = t.stateNode),
            (n =
              r && typeof n.getDerivedStateFromError != `function`
                ? null
                : a.render()),
            (t.flags |= 1),
            e !== null && r
              ? ((t.child = po(t, e.child, null, i)),
                (t.child = po(t, null, n, i)))
              : Ic(e, t, n, i),
            (t.memoizedState = a.state),
            (e = t.child))
          : (e = dl(e, t, i)),
        e
      );
    }
    function Xc(e, t, n, r) {
      return (ha(), (t.flags |= 256), Ic(e, t, n, r), t.child);
    }
    var Zc = {
      dehydrated: null,
      treeContext: null,
      retryLane: 0,
      hydrationErrors: null,
    };
    function Qc(e) {
      return { baseLanes: e, cachePool: Ya() };
    }
    function $c(e, t, n) {
      return ((e = e === null ? 0 : e.childLanes & ~n), t && (e |= ud), e);
    }
    function el(e, t, n) {
      var r = t.pendingProps,
        i = !1,
        a = !!(t.flags & 128),
        o;
      if (
        ((o = a) ||
          (o =
            e !== null && e.memoizedState === null ? !1 : !!(zo.current & 2)),
        o && ((i = !0), (t.flags &= -129)),
        (o = !!(t.flags & 32)),
        (t.flags &= -33),
        e === null)
      ) {
        if (L) {
          if (
            (i ? Po(t) : Lo(),
            (e = I)
              ? ((e = am(e, la)),
                (e = e !== null && e.data !== `&` ? e : null),
                e !== null &&
                  ((t.memoizedState = {
                    dehydrated: e,
                    treeContext: ea === null ? null : { id: ta, overflow: na },
                    retryLane: 536870912,
                    hydrationErrors: null,
                  }),
                  (n = Wi(e)),
                  (n.return = t),
                  (t.child = n),
                  (F = t),
                  (I = null)))
              : (e = null),
            e === null)
          )
            throw da(t);
          return ((t.lanes = sm(e) ? 32 : 536870912), null);
        }
        return (
          (a = r.children),
          (r = r.fallback),
          i
            ? (Lo(),
              (i = t.mode),
              (a = nl({ mode: `hidden`, children: a }, i)),
              (r = Hi(r, i, n, null)),
              (a.return = t),
              (r.return = t),
              (a.sibling = r),
              (t.child = a),
              (r = t.child),
              (r.memoizedState = Qc(n)),
              (r.childLanes = $c(e, o, n)),
              (t.memoizedState = Zc),
              Vc(null, r))
            : (Po(t), tl(t, a))
        );
      }
      var s = e.memoizedState;
      if (s !== null) {
        var c = s.dehydrated;
        if (c !== null) return il(e, t, a, o, r, c, s, n);
      }
      return i
        ? (Lo(),
          (i = r.fallback),
          (a = t.mode),
          (s = e.child),
          (c = s.sibling),
          (r = zi(s, { mode: `hidden`, children: r.children })),
          (r.subtreeFlags = s.subtreeFlags & 1206910976),
          c === null
            ? ((i = Hi(i, a, n, null)), (i.flags |= 2))
            : (i = zi(c, i)),
          (i.return = t),
          (r.return = t),
          (r.sibling = i),
          (t.child = r),
          Vc(null, r),
          (r = t.child),
          (i = e.child.memoizedState),
          i === null
            ? (i = Qc(n))
            : ((a = i.cachePool),
              a === null
                ? (a = Ya())
                : ((s = z._currentValue),
                  (a = a.parent === s ? a : { parent: s, pool: s })),
              (i = { baseLanes: i.baseLanes | n, cachePool: a })),
          (r.memoizedState = i),
          (r.childLanes = $c(e, o, n)),
          (t.memoizedState = Zc),
          Vc(e.child, r))
        : (Po(t),
          (n = e.child),
          (e = n.sibling),
          (n = zi(n, { mode: `visible`, children: r.children })),
          (n.return = t),
          (n.sibling = null),
          e !== null &&
            ((o = t.deletions),
            o === null ? ((t.deletions = [e]), (t.flags |= 16)) : o.push(e)),
          (t.child = n),
          (t.memoizedState = null),
          n);
    }
    function tl(e, t) {
      return (
        (t = nl({ mode: `visible`, children: t }, e.mode)),
        (t.return = e),
        (e.child = t)
      );
    }
    function nl(e, t) {
      return ((e = Li(22, e, null, t)), (e.lanes = 0), e);
    }
    function rl(e, t, n) {
      return (
        po(t, e.child, null, n),
        (e = tl(t, t.pendingProps.children)),
        (e.flags |= 2),
        (t.memoizedState = null),
        e
      );
    }
    function il(e, t, n, r, i, o, s, c) {
      if (n)
        return t.flags & 256
          ? (Po(t), (t.flags &= -257), rl(e, t, c))
          : t.memoizedState === null
            ? (Lo(),
              (o = i.fallback),
              (s = t.mode),
              (i = nl({ mode: `visible`, children: i.children }, s)),
              (o = Hi(o, s, c, null)),
              (o.flags |= 2),
              (i.return = t),
              (o.return = t),
              (i.sibling = o),
              (t.child = i),
              po(t, e.child, null, c),
              (i = t.child),
              (i.memoizedState = Qc(c)),
              (i.childLanes = $c(e, r, c)),
              (t.memoizedState = Zc),
              Vc(null, i))
            : (Lo(), (t.child = e.child), (t.flags |= 128), null);
      if ((Po(t), sm(o))) {
        if (((r = o.nextSibling && o.nextSibling.dataset), r)) var l = r.dgst;
        return (
          (r = l),
          r !== `` &&
            ((i = Error(a(419))),
            (i.stack = ``),
            (i.digest = r),
            _a({ value: i, source: null, stack: null })),
          rl(e, t, c)
        );
      }
      if ((Fc || Ta(e, t, c, !1), (r = (c & e.childLanes) !== 0), Fc || r)) {
        if (Do.current !== null) return rl(e, t, c);
        if (
          ((r = K),
          r !== null && ((i = wt(r, c)), i !== 0 && i !== s.retryLane))
        )
          throw ((s.retryLane = i), Mi(e, i), Pd(r, e, i), Pc);
        return (om(o) || Kd(), rl(e, t, c));
      }
      return om(o)
        ? ((t.flags |= 192), (t.child = e.child), null)
        : ((e = s.treeContext),
          (I = lm(o.nextSibling)),
          (F = t),
          (L = !0),
          (ca = null),
          (la = !1),
          e !== null && sa(t, e),
          (t = tl(t, i.children)),
          (t.flags |= 134221824),
          t);
    }
    function al(e, t, n) {
      e.lanes |= t;
      var r = e.alternate;
      (r !== null && (r.lanes |= t), Ca(e.return, t, n));
    }
    function ol(e) {
      for (var t = null; e !== null;) {
        var n = e.alternate;
        (n !== null && Ho(n) === null && (t = e), (e = e.sibling));
      }
      return t;
    }
    function sl(e, t, n, r, i, a) {
      var o = e.memoizedState;
      o === null
        ? (e.memoizedState = {
            isBackwards: t,
            rendering: null,
            renderingStartTime: 0,
            last: r,
            tail: n,
            tailMode: i,
            treeForkCount: a,
          })
        : ((o.isBackwards = t),
          (o.rendering = null),
          (o.renderingStartTime = 0),
          (o.last = r),
          (o.tail = n),
          (o.tailMode = i),
          (o.treeForkCount = a));
    }
    function cl(e) {
      var t = e.child;
      for (e.child = null; t !== null;) {
        var n = t.sibling;
        ((t.sibling = e.child), (e.child = t), (t = n));
      }
    }
    function ll(e, t, n) {
      var r = t.pendingProps,
        i = r.revealOrder,
        a = r.tail;
      r = r.children;
      var o = zo.current;
      if (t.flags & 128) return (Bo(t, o), null);
      var s = !!(o & 2);
      if (
        (s ? ((o = (o & 1) | 2), (t.flags |= 128)) : (o &= 1),
        Bo(t, o),
        i === `backwards` && e !== null
          ? (cl(e), Ic(e, t, r, n), cl(e))
          : Ic(e, t, r, n),
        (r = L ? Zi : 0),
        !s && e !== null && e.flags & 128)
      )
        a: for (e = t.child; e !== null;) {
          if (e.tag === 13) e.memoizedState !== null && al(e, n, t);
          else if (e.tag === 19) al(e, n, t);
          else if (e.child !== null) {
            ((e.child.return = e), (e = e.child));
            continue;
          }
          if (e === t) break a;
          for (; e.sibling === null;) {
            if (e.return === null || e.return === t) break a;
            e = e.return;
          }
          ((e.sibling.return = e.return), (e = e.sibling));
        }
      switch (i) {
        case `backwards`:
          ((n = ol(t.child)),
            n === null
              ? ((i = t.child), (t.child = null))
              : ((i = n.sibling), (n.sibling = null), cl(t)),
            sl(t, !0, i, null, a, r));
          break;
        case `unstable_legacy-backwards`:
          for (n = null, i = t.child, t.child = null; i !== null;) {
            if (((e = i.alternate), e !== null && Ho(e) === null)) {
              t.child = i;
              break;
            }
            ((e = i.sibling), (i.sibling = n), (n = i), (i = e));
          }
          sl(t, !0, n, null, a, r);
          break;
        case `together`:
          sl(t, !1, null, null, void 0, r);
          break;
        case `independent`:
          t.memoizedState = null;
          break;
        default:
          ((n = ol(t.child)),
            n === null
              ? ((i = t.child), (t.child = null))
              : ((i = n.sibling), (n.sibling = null)),
            sl(t, !1, i, n, a, r));
      }
      return t.child;
    }
    function ul(e, t, n) {
      var r = t.pendingProps;
      return (xa(t, t.type, r.value), Ic(e, t, r.children, n), t.child);
    }
    function dl(e, t, n) {
      if (
        (e !== null && (t.dependencies = e.dependencies),
        (sd |= t.lanes),
        (n & t.childLanes) === 0)
      ) {
        if (e !== null) {
          if ((Ta(e, t, n, !1), (n & t.childLanes) === 0)) return null;
        } else return null;
      }
      if (e !== null && t.child !== e.child) throw Error(a(153));
      if (t.child !== null) {
        for (
          e = t.child, n = zi(e, e.pendingProps), t.child = n, n.return = t;
          e.sibling !== null;
        )
          ((e = e.sibling),
            (n = n.sibling = zi(e, e.pendingProps)),
            (n.return = t));
        n.sibling = null;
      }
      return t.child;
    }
    function fl(e, t) {
      return (
        (e.lanes & t) !== 0 || ((e = e.dependencies), !!(e !== null && Ea(e)))
      );
    }
    function pl(e, t, n) {
      switch (t.tag) {
        case 3:
          (Me(t, t.stateNode.containerInfo),
            xa(t, z, e.memoizedState.cache),
            ha());
          break;
        case 27:
        case 5:
          Pe(t);
          break;
        case 4:
          Me(t, t.stateNode.containerInfo);
          break;
        case 10:
          xa(t, t.type, t.memoizedProps.value);
          break;
        case 31:
          if (t.memoizedState !== null) return ((t.flags |= 128), Fo(t), null);
          break;
        case 13:
          var r = t.memoizedState;
          if (r !== null) {
            if (r.dehydrated !== null) return (Po(t), (t.flags |= 128), null);
            r = Ta(e, t, n, !1);
            var i = t.child.childLanes;
            return r || (n & i) !== 0
              ? el(e, t, n)
              : (Po(t), (e = dl(e, t, n)), e === null ? null : e.sibling);
          }
          Po(t);
          break;
        case 19:
          if (t.flags & 128) return ll(e, t, n);
          if (
            ((i = !!(e.flags & 128)),
            (r = (n & t.childLanes) !== 0),
            (r ||= (Ta(e, t, n, !1), (n & t.childLanes) !== 0)),
            i)
          ) {
            if (r) return ll(e, t, n);
            t.flags |= 128;
          }
          if (
            ((i = t.memoizedState),
            i !== null &&
              ((i.rendering = null), (i.tail = null), (i.lastEffect = null)),
            Bo(t, zo.current),
            r)
          )
            break;
          return null;
        case 22:
          return ((t.lanes = 0), Bc(e, t, n, t.pendingProps));
        case 24:
          xa(t, z, e.memoizedState.cache);
      }
      return dl(e, t, n);
    }
    function ml(e, t, n) {
      if (e !== null) {
        if (e.memoizedProps !== t.pendingProps) Fc = !0;
        else {
          if (!fl(e, n) && !(t.flags & 128)) return ((Fc = !1), pl(e, t, n));
          Fc = !!(e.flags & 131072);
        }
      } else ((Fc = !1), L && t.flags & 1048576 && ia(t, Zi, t.index));
      switch (((t.lanes = 0), t.tag)) {
        case 16:
          a: {
            var r = t.pendingProps;
            if (((e = no(t.elementType)), (t.type = e), typeof e == `function`))
              Ri(e)
                ? ((r = wc(e, r)), (t.tag = 1), (t = Yc(null, t, e, r, n)))
                : ((t.tag = 0), (t = qc(null, t, e, r, n)));
            else {
              if (e != null) {
                var i = e.$$typeof;
                if (i === de) {
                  ((t.tag = 11), (t = Lc(null, t, e, r, n)));
                  break a;
                }
                if (i === pe) {
                  ((t.tag = 14), (t = Rc(null, t, e, r, n)));
                  break a;
                }
                if (i === ue) {
                  ((t.tag = 10), (t.type = e), (t = ul(null, t, n)));
                  break a;
                }
              }
              throw ((t = Ce(e) || e), Error(a(306, t, ``)));
            }
          }
          return t;
        case 0:
          return qc(e, t, t.type, t.pendingProps, n);
        case 1:
          return ((r = t.type), (i = wc(r, t.pendingProps)), Yc(e, t, r, i, n));
        case 3:
          a: {
            if ((Me(t, t.stateNode.containerInfo), e === null))
              throw Error(a(387));
            r = t.pendingProps;
            var o = t.memoizedState;
            ((i = o.element), _o(e, t), wo(t, r, null, n));
            var s = t.memoizedState;
            if (
              ((r = s.cache),
              xa(t, z, r),
              r !== o.cache && wa(t, [z], n, !0),
              Co(),
              (r = s.element),
              o.isDehydrated)
            ) {
              if (
                ((o = { element: r, isDehydrated: !1, cache: s.cache }),
                (t.updateQueue.baseState = o),
                (t.memoizedState = o),
                t.flags & 256)
              ) {
                t = Xc(e, t, r, n);
                break a;
              }
              if (r !== i) {
                ((i = qi(Error(a(424)), t)), _a(i), (t = Xc(e, t, r, n)));
                break a;
              }
              switch (((e = t.stateNode.containerInfo), e.nodeType)) {
                case 9:
                  e = e.body;
                  break;
                default:
                  e = e.nodeName === `HTML` ? e.ownerDocument.body : e;
              }
              for (
                I = lm(e.firstChild),
                  F = t,
                  L = !0,
                  ca = null,
                  la = !0,
                  n = mo(t, null, r, n),
                  t.child = n;
                n;
              )
                ((n.flags = (n.flags & -3) | 134221824), (n = n.sibling));
            } else {
              if ((ha(), r === i)) {
                t = dl(e, t, n);
                break a;
              }
              Ic(e, t, r, n);
            }
            t = t.child;
          }
          return t;
        case 26:
          return (
            Kc(e, t),
            e === null
              ? (n = Nm(t.type, null, t.pendingProps, null))
                ? (t.memoizedState = n)
                : L || (t.stateNode = fp(t.type, t.pendingProps, Ae.current, t))
              : (t.memoizedState = Nm(
                  t.type,
                  e.memoizedProps,
                  t.pendingProps,
                  e.memoizedState,
                )),
            null
          );
        case 27:
          return (
            Pe(t),
            e === null &&
              L &&
              ((r = t.stateNode = hm(t.type, t.pendingProps, Ae.current)),
              (F = t),
              (la = !0),
              (i = I),
              Sp(t.type) ? ((um = i), (I = lm(r.firstChild))) : (I = i)),
            Ic(e, t, t.pendingProps.children, n),
            Kc(e, t),
            e === null && (t.flags |= 4194304),
            t.child
          );
        case 5:
          return (
            e === null &&
              L &&
              ((i = r = I) &&
                ((r = rm(r, t.type, t.pendingProps, la)),
                r === null
                  ? (i = !1)
                  : ((t.stateNode = r),
                    (F = t),
                    (I = lm(r.firstChild)),
                    (la = !1),
                    (i = !0))),
              i || da(t)),
            Pe(t),
            (i = t.type),
            (o = t.pendingProps),
            (s = e === null ? null : e.memoizedProps),
            (r = o.children),
            pp(i, o) ? (r = null) : s !== null && pp(i, s) && (t.flags |= 32),
            t.memoizedState !== null &&
              ((i = es(e, t, rs, null, null, n)), (sh._currentValue = i)),
            Kc(e, t),
            Ic(e, t, r, n),
            t.child
          );
        case 6:
          return (
            e === null &&
              L &&
              ((e = n = I) &&
                ((n = im(n, t.pendingProps, la)),
                n === null
                  ? (e = !1)
                  : ((t.stateNode = n), (F = t), (I = null), (e = !0))),
              e || da(t)),
            null
          );
        case 13:
          return el(e, t, n);
        case 4:
          return (
            Me(t, t.stateNode.containerInfo),
            (r = t.pendingProps),
            e === null ? (t.child = po(t, null, r, n)) : Ic(e, t, r, n),
            t.child
          );
        case 11:
          return Lc(e, t, t.type, t.pendingProps, n);
        case 7:
          return ((r = t.pendingProps), Kc(e, t), Ic(e, t, r, n), t.child);
        case 8:
          return (Ic(e, t, t.pendingProps.children, n), t.child);
        case 12:
          return (Ic(e, t, t.pendingProps.children, n), t.child);
        case 10:
          return ul(e, t, n);
        case 9:
          return (
            (i = t.type._context),
            (r = t.pendingProps.children),
            Da(t),
            (i = R(i)),
            (r = r(i)),
            (t.flags |= 1),
            Ic(e, t, r, n),
            t.child
          );
        case 14:
          return Rc(e, t, t.type, t.pendingProps, n);
        case 15:
          return zc(e, t, t.type, t.pendingProps, n);
        case 19:
          return ll(e, t, n);
        case 31:
          return Gc(e, t, n);
        case 22:
          return Bc(e, t, n, t.pendingProps);
        case 24:
          return (
            Da(t),
            (r = R(z)),
            e === null
              ? ((i = qa()),
                i === null &&
                  ((i = K),
                  (o = Na()),
                  (i.pooledCache = o),
                  o.refCount++,
                  o !== null && (i.pooledCacheLanes |= n),
                  (i = o)),
                (t.memoizedState = { parent: r, cache: i }),
                go(t),
                xa(t, z, i))
              : ((e.lanes & n) !== 0 && (_o(e, t), wo(t, null, null, n), Co()),
                (i = e.memoizedState),
                (o = t.memoizedState),
                i.parent === r
                  ? ((r = o.cache),
                    xa(t, z, r),
                    r !== i.cache && wa(t, [z], n, !0))
                  : ((i = { parent: r, cache: r }),
                    (t.memoizedState = i),
                    t.lanes === 0 &&
                      (t.memoizedState = t.updateQueue.baseState = i),
                    xa(t, z, r))),
            Ic(e, t, t.pendingProps.children, n),
            t.child
          );
        case 30:
          return (
            t.stateNode === null &&
              (t.stateNode = {
                autoName: null,
                paired: null,
                clones: null,
                ref: null,
              }),
            (r = t.pendingProps),
            r.name != null && r.name !== `auto`
              ? (t.flags |= e === null ? 18882560 : 18874368)
              : L && aa(t),
            e !== null && e.memoizedProps.name !== r.name
              ? (t.flags |= 4194816)
              : Kc(e, t),
            Ic(e, t, r.children, n),
            t.child
          );
        case 29:
          throw t.pendingProps;
      }
      throw Error(a(156, t.tag));
    }
    function hl(e) {
      e.flags |= 4;
    }
    function gl(e, t, n, r, i) {
      var a;
      if (
        ((a = !!(e.mode & 32)) &&
          (a =
            n === null
              ? Jm(t, r)
              : Jm(t, r) && (r.src !== n.src || r.srcSet !== n.srcSet)),
        a)
      ) {
        if (((e.flags |= 16777216), (i & 335544128) === i)) {
          if (e.stateNode.complete) e.flags |= 8192;
          else if (Ud()) e.flags |= 8192;
          else throw ((ro = $a), Za);
        }
      } else e.flags &= -16777217;
    }
    function _l(e, t) {
      if (t.type !== `stylesheet` || t.state.loading & 4) e.flags &= -16777217;
      else if (((e.flags |= 16777216), !Ym(t))) {
        if (Ud()) e.flags |= 8192;
        else throw ((ro = $a), Za);
      }
    }
    function vl(e, t) {
      (t !== null && (e.flags |= 4),
        e.flags & 16384 &&
          ((t = e.tag === 22 ? 536870912 : vt()), (e.lanes |= t), (dd |= t)));
    }
    function yl(e, t) {
      if (!L)
        switch (e.tailMode) {
          case `visible`:
            break;
          case `collapsed`:
            for (var n = e.tail, r = null; n !== null;)
              (n.alternate !== null && (r = n), (n = n.sibling));
            r === null
              ? t || e.tail === null
                ? (e.tail = null)
                : (e.tail.sibling = null)
              : (r.sibling = null);
            break;
          default:
            for (t = e.tail, n = null; t !== null;)
              (t.alternate !== null && (n = t), (t = t.sibling));
            n === null ? (e.tail = null) : (n.sibling = null);
        }
    }
    function H(e) {
      var t = e.alternate !== null && e.alternate.child === e.child,
        n = 0,
        r = 0;
      if (t)
        for (var i = e.child; i !== null;)
          ((n |= i.lanes | i.childLanes),
            (r |= i.subtreeFlags & 1206910976),
            (r |= i.flags & 1206910976),
            (i.return = e),
            (i = i.sibling));
      else
        for (i = e.child; i !== null;)
          ((n |= i.lanes | i.childLanes),
            (r |= i.subtreeFlags),
            (r |= i.flags),
            (i.return = e),
            (i = i.sibling));
      return ((e.subtreeFlags |= r), (e.childLanes = n), t);
    }
    function bl(e, t, n) {
      var r = t.pendingProps;
      switch ((oa(t), t.tag)) {
        case 16:
        case 15:
        case 0:
        case 11:
        case 7:
        case 8:
        case 12:
        case 9:
        case 14:
          return (H(t), null);
        case 1:
          return (H(t), null);
        case 3:
          return (
            (n = t.stateNode),
            (r = null),
            e !== null && (r = e.memoizedState.cache),
            t.memoizedState.cache !== r && (t.flags |= 2048),
            Sa(z),
            Ne(),
            n.pendingContext &&
              ((n.context = n.pendingContext), (n.pendingContext = null)),
            (e === null || e.child === null) &&
              (ma(t)
                ? hl(t)
                : e === null ||
                  (e.memoizedState.isDehydrated && !(t.flags & 256)) ||
                  ((t.flags |= 1024), ga())),
            H(t),
            null
          );
        case 26:
          var i = t.type,
            o = t.memoizedState;
          return (
            e === null
              ? (hl(t),
                o === null ? (H(t), gl(t, i, null, r, n)) : (H(t), _l(t, o)))
              : o
                ? o === e.memoizedState
                  ? (H(t), (t.flags &= -16777217))
                  : (hl(t), H(t), _l(t, o))
                : ((e = e.memoizedProps),
                  e !== r && hl(t),
                  H(t),
                  gl(t, i, e, r, n)),
            null
          );
        case 27:
          if (
            (Fe(t),
            (n = Ae.current),
            (i = t.type),
            e !== null && t.stateNode != null)
          )
            e.memoizedProps !== r && hl(t);
          else {
            if (!r) {
              if (t.stateNode === null) throw Error(a(166));
              return (H(t), (t.subtreeFlags &= -33554433), null);
            }
            ((e = Oe.current),
              ma(t) ? fa(t, e) : ((e = hm(i, r, n)), (t.stateNode = e), hl(t)));
          }
          return (H(t), (t.subtreeFlags &= -33554433), null);
        case 5:
          if ((Fe(t), (i = t.type), e !== null && t.stateNode != null))
            e.memoizedProps !== r && hl(t);
          else {
            if (!r) {
              if (t.stateNode === null) throw Error(a(166));
              return (H(t), (t.subtreeFlags &= -33554433), null);
            }
            if (((o = Oe.current), ma(t))) fa(t, o);
            else {
              var s = lp(Ae.current);
              switch (o) {
                case 1:
                  o = s.createElementNS(`http://www.w3.org/2000/svg`, i);
                  break;
                case 2:
                  o = s.createElementNS(
                    `http://www.w3.org/1998/Math/MathML`,
                    i,
                  );
                  break;
                default:
                  switch (i) {
                    case `svg`:
                      o = s.createElementNS(`http://www.w3.org/2000/svg`, i);
                      break;
                    case `math`:
                      o = s.createElementNS(
                        `http://www.w3.org/1998/Math/MathML`,
                        i,
                      );
                      break;
                    case `script`:
                      ((o = s.createElement(`div`)),
                        (o.innerHTML = `<script><\/script>`),
                        (o = o.removeChild(o.firstChild)));
                      break;
                    case `select`:
                      ((o =
                        typeof r.is == `string`
                          ? s.createElement(`select`, { is: r.is })
                          : s.createElement(`select`)),
                        r.multiple
                          ? (o.multiple = !0)
                          : r.size && (o.size = r.size));
                      break;
                    default:
                      o =
                        typeof r.is == `string`
                          ? s.createElement(i, { is: r.is })
                          : s.createElement(i);
                  }
              }
              ((o[At] = t), (o[jt] = r));
              a: for (s = t.child; s !== null;) {
                if (s.tag === 5 || s.tag === 6) o.appendChild(s.stateNode);
                else if (s.tag !== 4 && s.tag !== 27 && s.child !== null) {
                  ((s.child.return = s), (s = s.child));
                  continue;
                }
                if (s === t) break a;
                for (; s.sibling === null;) {
                  if (s.return === null || s.return === t) break a;
                  s = s.return;
                }
                ((s.sibling.return = s.return), (s = s.sibling));
              }
              t.stateNode = o;
              a: switch ((np(o, i, r), i)) {
                case `button`:
                case `input`:
                case `select`:
                case `textarea`:
                  r = !!r.autoFocus;
                  break a;
                case `img`:
                  r = !0;
                  break a;
                default:
                  r = !1;
              }
              r && hl(t);
            }
          }
          return (
            H(t),
            (t.subtreeFlags &= -33554433),
            gl(
              t,
              t.type,
              e === null ? null : e.memoizedProps,
              t.pendingProps,
              n,
            ),
            null
          );
        case 6:
          if (e && t.stateNode != null) e.memoizedProps !== r && hl(t);
          else {
            if (typeof r != `string` && t.stateNode === null)
              throw Error(a(166));
            if (((e = Ae.current), ma(t))) {
              if (
                ((e = t.stateNode),
                (n = t.memoizedProps),
                (r = null),
                (i = F),
                i !== null)
              )
                switch (i.tag) {
                  case 27:
                  case 5:
                    r = i.memoizedProps;
                }
              ((e[At] = t),
                (e = !!(
                  e.nodeValue === n ||
                  (r !== null && !0 === r.suppressHydrationWarning) ||
                  ep(e.nodeValue, n)
                )),
                e || da(t, !0));
            } else
              ((e = lp(e).createTextNode(r)), (e[At] = t), (t.stateNode = e));
          }
          return (H(t), null);
        case 31:
          if (((n = t.memoizedState), e === null || e.memoizedState !== null)) {
            if (((r = ma(t)), n !== null)) {
              if (e === null) {
                if (!r) throw Error(a(318));
                if (
                  ((e = t.memoizedState),
                  (e = e === null ? null : e.dehydrated),
                  !e)
                )
                  throw Error(a(557));
                e[At] = t;
              } else
                (ha(),
                  !(t.flags & 128) && (t.memoizedState = null),
                  (t.flags |= 4));
              (H(t), (e = !1));
            } else
              ((n = ga()),
                e !== null &&
                  e.memoizedState !== null &&
                  (e.memoizedState.hydrationErrors = n),
                (e = !0));
            if (!e) return t.flags & 256 ? (Ro(t), t) : (Ro(t), null);
            if (t.flags & 128) throw Error(a(558));
          }
          return (H(t), null);
        case 13:
          if (
            ((r = t.memoizedState),
            e === null ||
              (e.memoizedState !== null && e.memoizedState.dehydrated !== null))
          ) {
            if (((i = ma(t)), r !== null && r.dehydrated !== null)) {
              if (e === null) {
                if (!i) throw Error(a(318));
                if (
                  ((i = t.memoizedState),
                  (i = i === null ? null : i.dehydrated),
                  !i)
                )
                  throw Error(a(317));
                i[At] = t;
              } else
                (ha(),
                  !(t.flags & 128) && (t.memoizedState = null),
                  (t.flags |= 4));
              (H(t), (i = !1));
            } else
              ((i = ga()),
                e !== null &&
                  e.memoizedState !== null &&
                  (e.memoizedState.hydrationErrors = i),
                (i = !0));
            if (!i) return t.flags & 256 ? (Ro(t), t) : (Ro(t), null);
          }
          return (
            Ro(t),
            t.flags & 128
              ? ((t.lanes = n), t)
              : ((n = r !== null),
                (e = e !== null && e.memoizedState !== null),
                n &&
                  ((r = t.child),
                  (i = null),
                  r.alternate !== null &&
                    r.alternate.memoizedState !== null &&
                    r.alternate.memoizedState.cachePool !== null &&
                    (i = r.alternate.memoizedState.cachePool.pool),
                  (o = null),
                  r.memoizedState !== null &&
                    r.memoizedState.cachePool !== null &&
                    (o = r.memoizedState.cachePool.pool),
                  o !== i && (r.flags |= 2048)),
                n !== e && n && (t.child.flags |= 8192),
                vl(t, t.updateQueue),
                H(t),
                null)
          );
        case 4:
          return (
            Ne(),
            e === null && Wf(t.stateNode.containerInfo),
            (t.flags |= 67108864),
            H(t),
            null
          );
        case 10:
          return (Sa(t.type), H(t), null);
        case 19:
          if ((Vo(t), (r = t.memoizedState), r === null)) return (H(t), null);
          if (((i = !!(t.flags & 128)), (o = r.rendering), o === null)) {
            if (i) yl(r, !1);
            else {
              if (od !== 0 || (e !== null && e.flags & 128))
                for (e = t.child; e !== null;) {
                  if (((o = Ho(e)), o !== null)) {
                    for (
                      t.flags |= 128,
                        yl(r, !1),
                        e = o.updateQueue,
                        t.updateQueue = e,
                        vl(t, e),
                        t.subtreeFlags = 0,
                        e = n,
                        n = t.child;
                      n !== null;
                    )
                      (Bi(n, e), (n = n.sibling));
                    return (
                      Bo(t, (zo.current & 1) | 2),
                      L && ra(t, r.treeForkCount),
                      t.child
                    );
                  }
                  e = e.sibling;
                }
              r.tail !== null &&
                Ye() > _d &&
                ((t.flags |= 128), (i = !0), yl(r, !1), (t.lanes = 4194304));
            }
          } else {
            if (!i) {
              if (((e = Ho(o)), e !== null)) {
                if (
                  ((t.flags |= 128),
                  (i = !0),
                  (e = e.updateQueue),
                  (t.updateQueue = e),
                  vl(t, e),
                  yl(r, !0),
                  r.tail === null &&
                    r.tailMode !== `collapsed` &&
                    r.tailMode !== `visible` &&
                    !o.alternate &&
                    !L)
                )
                  return (H(t), null);
              } else
                2 * Ye() - r.renderingStartTime > _d &&
                  n !== 536870912 &&
                  ((t.flags |= 128), (i = !0), yl(r, !1), (t.lanes = 4194304));
            }
            r.isBackwards
              ? ((o.sibling = t.child), (t.child = o))
              : ((e = r.last),
                e === null ? (t.child = o) : (e.sibling = o),
                (r.last = o));
          }
          if (r.tail !== null) {
            e = r.tail;
            a: {
              for (n = e; n !== null;) {
                if (n.alternate !== null) {
                  n = !1;
                  break a;
                }
                n = n.sibling;
              }
              n = !0;
            }
            return (
              (r.rendering = e),
              (r.tail = e.sibling),
              (r.renderingStartTime = Ye()),
              (e.sibling = null),
              (o = zo.current),
              (o = i ? (o & 1) | 2 : o & 1),
              r.tailMode === `visible` || r.tailMode === `collapsed` || !n || L
                ? Bo(t, o)
                : ((n = o), O(Mo, t), O(zo, n), No === null && (No = t)),
              L && ra(t, r.treeForkCount),
              e
            );
          }
          return (H(t), null);
        case 22:
        case 23:
          return (
            Ro(t),
            jo(),
            (r = t.memoizedState !== null),
            e === null
              ? r && (t.flags |= 8192)
              : (e.memoizedState !== null) !== r && (t.flags |= 8192),
            r
              ? n & 536870912 &&
                !(t.flags & 128) &&
                (H(t), t.subtreeFlags & 6 && (t.flags |= 8192))
              : H(t),
            (n = t.updateQueue),
            n !== null && vl(t, n.retryQueue),
            (n = null),
            e !== null &&
              e.memoizedState !== null &&
              e.memoizedState.cachePool !== null &&
              (n = e.memoizedState.cachePool.pool),
            (r = null),
            t.memoizedState !== null &&
              t.memoizedState.cachePool !== null &&
              (r = t.memoizedState.cachePool.pool),
            r !== n && (t.flags |= 2048),
            e !== null && De(Ka),
            null
          );
        case 24:
          return (
            (n = null),
            e !== null && (n = e.memoizedState.cache),
            t.memoizedState.cache !== n && (t.flags |= 2048),
            Sa(z),
            H(t),
            null
          );
        case 25:
          return null;
        case 30:
          return ((t.flags |= 33554432), H(t), null);
      }
      throw Error(a(156, t.tag));
    }
    function xl(e, t) {
      switch ((oa(t), t.tag)) {
        case 1:
          return (
            (e = t.flags),
            e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
          );
        case 3:
          return (
            Sa(z),
            Ne(),
            (e = t.flags),
            e & 65536 && !(e & 128) ? ((t.flags = (e & -65537) | 128), t) : null
          );
        case 26:
        case 27:
        case 5:
          return (Fe(t), null);
        case 31:
          if (t.memoizedState !== null) {
            if ((Ro(t), t.alternate === null)) throw Error(a(340));
            ha();
          }
          return (
            (e = t.flags),
            e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
          );
        case 13:
          if (
            (Ro(t), (e = t.memoizedState), e !== null && e.dehydrated !== null)
          ) {
            if (t.alternate === null) throw Error(a(340));
            ha();
          }
          return (
            (e = t.flags),
            e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
          );
        case 19:
          return (
            Vo(t),
            (e = t.flags),
            e & 65536
              ? ((t.flags = (e & -65537) | 128),
                (e = t.memoizedState),
                e !== null && ((e.rendering = null), (e.tail = null)),
                (t.flags |= 4),
                t)
              : null
          );
        case 4:
          return (Ne(), null);
        case 10:
          return (Sa(t.type), null);
        case 22:
        case 23:
          return (
            Ro(t),
            jo(),
            e !== null && De(Ka),
            (e = t.flags),
            e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
          );
        case 24:
          return (Sa(z), null);
        case 25:
          return null;
        default:
          return null;
      }
    }
    function Sl(e, t) {
      switch ((oa(t), t.tag)) {
        case 3:
          (Sa(z), Ne());
          break;
        case 26:
        case 27:
        case 5:
          Fe(t);
          break;
        case 4:
          Ne();
          break;
        case 31:
          t.memoizedState !== null && Ro(t);
          break;
        case 13:
          Ro(t);
          break;
        case 19:
          Vo(t);
          break;
        case 10:
          Sa(t.type);
          break;
        case 22:
        case 23:
          (Ro(t), jo(), e !== null && De(Ka));
          break;
        case 24:
          Sa(z);
      }
    }
    function Cl(e, t) {
      try {
        var n = t.updateQueue,
          r = n === null ? null : n.lastEffect;
        if (r !== null) {
          var i = r.next;
          n = i;
          do {
            if ((n.tag & e) === e) {
              r = void 0;
              var a = n.create,
                o = n.inst;
              ((r = a()), (o.destroy = r));
            }
            n = n.next;
          } while (n !== i);
        }
      } catch (e) {
        Z(t, t.return, e);
      }
    }
    function wl(e, t, n) {
      try {
        var r = t.updateQueue,
          i = r === null ? null : r.lastEffect;
        if (i !== null) {
          var a = i.next;
          r = a;
          do {
            if ((r.tag & e) === e) {
              var o = r.inst,
                s = o.destroy;
              if (s !== void 0) {
                ((o.destroy = void 0), (i = t));
                var c = n,
                  l = s;
                try {
                  l();
                } catch (e) {
                  Z(i, c, e);
                }
              }
            }
            r = r.next;
          } while (r !== a);
        }
      } catch (e) {
        Z(t, t.return, e);
      }
    }
    function Tl(e) {
      var t = e.updateQueue;
      if (t !== null) {
        var n = e.stateNode;
        try {
          Eo(t, n);
        } catch (t) {
          Z(e, e.return, t);
        }
      }
    }
    function El(e, t, n) {
      ((n.props = wc(e.type, e.memoizedProps)), (n.state = e.memoizedState));
      try {
        n.componentWillUnmount();
      } catch (n) {
        Z(e, t, n);
      }
    }
    function Dl(e, t) {
      try {
        var n = e.ref;
        if (n !== null) {
          switch (e.tag) {
            case 26:
            case 27:
            case 5:
              var r = e.stateNode;
              break;
            case 30:
              var i = e.stateNode,
                a = Si(e.memoizedProps, i);
              ((i.ref === null || i.ref.name !== a) && (i.ref = Pp(a)),
                (r = i.ref));
              break;
            case 7:
              if (e.stateNode === null) {
                var o = new Fp(e);
                (p(e.child, !1, Qp, o, void 0, void 0), (e.stateNode = o));
              }
              r = e.stateNode;
              break;
            default:
              r = e.stateNode;
          }
          typeof n == `function` ? (e.refCleanup = n(r)) : (n.current = r);
        }
      } catch (n) {
        Z(e, t, n);
      }
    }
    function Ol(e, t) {
      var n = e.ref,
        r = e.refCleanup;
      if (n !== null) {
        if (typeof r == `function`)
          try {
            r();
          } catch (n) {
            Z(e, t, n);
          } finally {
            ((e.refCleanup = null),
              (e = e.alternate),
              e != null && (e.refCleanup = null));
          }
        else if (typeof n == `function`)
          try {
            n(null);
          } catch (n) {
            Z(e, t, n);
          }
        else n.current = null;
      }
    }
    function kl(e, t) {
      if (
        (e.tag === 5 || e.tag === 27 || e.tag === 6) &&
        e.alternate === null &&
        t !== null
      )
        for (var n = 0; n < t.length; n++) em(e.stateNode, t[n]);
    }
    function Al(e) {
      for (
        var t = e.return;
        t !== null && (Nl(t) && em(e.stateNode, t.stateNode), !Ml(t));
      )
        t = t.return;
    }
    function jl(e) {
      for (
        var t = e.return;
        t !== null && (Nl(t) && tm(e.stateNode, t.stateNode), !Ml(t));
      )
        t = t.return;
    }
    function Ml(e) {
      return e.tag === 5 || e.tag === 3 || e.tag === 27;
    }
    function Nl(e) {
      return e && e.tag === 7 && e.stateNode !== null;
    }
    function Pl(e) {
      var t = e.type,
        n = e.memoizedProps,
        r = e.stateNode;
      try {
        a: switch (t) {
          case `button`:
          case `input`:
          case `select`:
          case `textarea`:
            n.autoFocus && r.focus();
            break a;
          case `img`:
            n.src ? (r.src = n.src) : n.srcSet && (r.srcset = n.srcSet);
        }
      } catch (t) {
        Z(e, e.return, t);
      }
    }
    function Fl(e, t, n) {
      try {
        var r = e.stateNode;
        (ip(r, e.type, n, t), (r[jt] = t));
      } catch (t) {
        Z(e, e.return, t);
      }
    }
    function Il(e) {
      return (
        e.tag === 5 ||
        e.tag === 3 ||
        e.tag === 26 ||
        (e.tag === 27 && Sp(e.type)) ||
        e.tag === 4
      );
    }
    function Ll(e) {
      a: for (;;) {
        for (; e.sibling === null;) {
          if (e.return === null || Il(e.return)) return null;
          e = e.return;
        }
        for (
          e.sibling.return = e.return, e = e.sibling;
          e.tag !== 5 && e.tag !== 6 && e.tag !== 18;
        ) {
          if (
            (e.tag === 27 && Sp(e.type)) ||
            e.flags & 2 ||
            e.child === null ||
            e.tag === 4
          )
            continue a;
          ((e.child.return = e), (e = e.child));
        }
        if (!(e.flags & 2)) return e.stateNode;
      }
    }
    function Rl(e, t, n, r) {
      var i = e.tag;
      if (i === 5 || i === 6)
        ((i = e.stateNode),
          t
            ? (n.nodeType === 9
                ? n.body
                : n.nodeName === `HTML`
                  ? n.ownerDocument.body
                  : n
              ).insertBefore(i, t)
            : ((t =
                n.nodeType === 9
                  ? n.body
                  : n.nodeName === `HTML`
                    ? n.ownerDocument.body
                    : n),
              t.appendChild(i),
              (n = n._reactRootContainer),
              n != null || t.onclick !== null || (t.onclick = wn)),
          kl(e, r),
          (M = !0));
      else if (
        i !== 4 &&
        (i === 27 &&
          (kl(e, r), (r = null), Sp(e.type) && ((n = e.stateNode), (t = null))),
        (e = e.child),
        e !== null)
      )
        for (Rl(e, t, n, r), e = e.sibling; e !== null;)
          (Rl(e, t, n, r), (e = e.sibling));
    }
    function zl(e, t, n, r) {
      var i = e.tag;
      if (i === 5 || i === 6)
        ((i = e.stateNode),
          t ? n.insertBefore(i, t) : n.appendChild(i),
          kl(e, r),
          (M = !0));
      else if (
        i !== 4 &&
        (i === 27 && (kl(e, r), (r = null), Sp(e.type) && (n = e.stateNode)),
        (e = e.child),
        e !== null)
      )
        for (zl(e, t, n, r), e = e.sibling; e !== null;)
          (zl(e, t, n, r), (e = e.sibling));
    }
    function Bl(e) {
      var t = e.stateNode,
        n = e.memoizedProps;
      try {
        for (var r = e.type, i = t.attributes; i.length;)
          t.removeAttributeNode(i[0]);
        (np(t, r, n), (t[At] = e), (t[jt] = n));
      } catch (t) {
        Z(e, e.return, t);
      }
    }
    var Vl = !1,
      Hl = null;
    function Ul(e) {
      (e.tag === 30 || e.subtreeFlags & 33554432) && (Vl = !0);
    }
    var Wl = null;
    function Gl() {
      var e = Wl;
      return ((Wl = null), e);
    }
    var Kl = 0;
    function ql(e, t, n, r, i) {
      return ((Kl = 0), Jl(e.child, t, n, r, i));
    }
    function Jl(e, t, n, r, i) {
      for (var a = !1; e !== null;) {
        if (e.tag === 5) {
          var o = e.stateNode;
          if (r !== null) {
            var s = Op(o);
            (r.push(s), s.view && (a = !0));
          } else a || (Op(o).view && (a = !0));
          ((Vl = !0), Tp(o, Kl === 0 ? t : t + `_` + Kl, n), Kl++);
        } else
          (e.tag === 22 && e.memoizedState !== null) ||
            (e.tag === 30 && i) ||
            (Jl(e.child, t, n, r, i) && (a = !0));
        e = e.sibling;
      }
      return a;
    }
    function Yl(e, t) {
      for (; e !== null;)
        (e.tag === 5
          ? Ep(e.stateNode, e.memoizedProps)
          : (e.tag === 22 && e.memoizedState !== null) ||
            (e.tag === 30 && t) ||
            Yl(e.child, t),
          (e = e.sibling));
    }
    function Xl(e) {
      if (e.subtreeFlags & 18874368)
        for (e = e.child; e !== null;) {
          if (
            (e.tag !== 22 || e.memoizedState === null) &&
            (Xl(e), e.tag === 30 && e.flags & 18874368 && e.stateNode.paired)
          ) {
            var t = e.memoizedProps;
            if (t.name == null || t.name === `auto`) throw Error(a(544));
            var n = t.name;
            ((t = wi(t.default, t.share)),
              t !== `none` && (ql(e, n, t, null, !1) || Yl(e.child, !1)));
          }
          e = e.sibling;
        }
    }
    function Zl(e, t) {
      if (e.tag === 30) {
        var n = e.stateNode,
          r = e.memoizedProps,
          i = Si(r, n),
          a = wi(r.default, n.paired ? r.share : r.enter);
        a === `none`
          ? Xl(e)
          : ql(e, i, a, null, !1)
            ? (Xl(e), n.paired || t || Nd(e, r.onEnter))
            : Yl(e.child, !1);
      } else if (e.subtreeFlags & 33554432)
        for (e = e.child; e !== null;) (Zl(e, t), (e = e.sibling));
      else Xl(e);
    }
    function Ql(e) {
      if (Hl !== null && Hl.size !== 0) {
        var t = Hl;
        if (e.subtreeFlags & 18874368)
          for (e = e.child; e !== null;) {
            if (e.tag !== 22 || e.memoizedState === null) {
              if (e.tag === 30 && e.flags & 18874368) {
                var n = e.memoizedProps,
                  r = n.name;
                if (r != null && r !== `auto`) {
                  var i = t.get(r);
                  if (i !== void 0) {
                    var a = wi(n.default, n.share);
                    if (
                      (a !== `none` &&
                        (ql(e, r, a, null, !1)
                          ? ((a = e.stateNode),
                            (i.paired = a),
                            (a.paired = i),
                            Nd(e, n.onShare))
                          : Yl(e.child, !1)),
                      t.delete(r),
                      t.size === 0)
                    )
                      break;
                  }
                }
              }
              Ql(e);
            }
            e = e.sibling;
          }
      }
    }
    function $l(e) {
      if (e.tag === 30) {
        var t = e.memoizedProps,
          n = Si(t, e.stateNode),
          r = Hl === null ? void 0 : Hl.get(n),
          i = wi(t.default, r === void 0 ? t.exit : t.share);
        (i !== `none` &&
          (ql(e, n, i, null, !1)
            ? r === void 0
              ? Nd(e, t.onExit)
              : ((i = e.stateNode),
                (r.paired = i),
                (i.paired = r),
                Hl.delete(n),
                Nd(e, t.onShare))
            : Yl(e.child, !1)),
          Hl !== null && Ql(e));
      } else if (e.subtreeFlags & 33554432)
        for (e = e.child; e !== null;) ($l(e), (e = e.sibling));
      else Hl !== null && Ql(e);
    }
    function eu(e) {
      for (e = e.child; e !== null;) {
        if (e.tag === 30) {
          var t = e.memoizedProps,
            n = Si(t, e.stateNode);
          ((t = wi(t.default, t.update)),
            (e.flags &= -5),
            t !== `none` && ql(e, n, t, (e.memoizedState = []), !1));
        } else e.subtreeFlags & 33554432 && eu(e);
        e = e.sibling;
      }
    }
    function tu(e) {
      if (e.subtreeFlags & 18874368)
        for (e = e.child; e !== null;) {
          if (e.tag !== 22 || e.memoizedState === null) {
            if (e.tag === 30 && e.flags & 18874368) {
              var t = e.stateNode;
              t.paired !== null && ((t.paired = null), Yl(e.child, !1));
            }
            tu(e);
          }
          e = e.sibling;
        }
    }
    function nu(e) {
      if (e.tag === 30) ((e.stateNode.paired = null), Yl(e.child, !1), tu(e));
      else if (e.subtreeFlags & 33554432)
        for (e = e.child; e !== null;) (nu(e), (e = e.sibling));
      else tu(e);
    }
    function ru(e) {
      for (e = e.child; e !== null;)
        (e.tag === 30 ? Yl(e.child, !1) : e.subtreeFlags & 33554432 && ru(e),
          (e = e.sibling));
    }
    function iu(e, t, n, r, i, a, o) {
      for (var s = !1; t !== null;) {
        if (t.tag === 5) {
          var c = t.stateNode;
          if (a !== null && Kl < a.length) {
            var l = a[Kl],
              u = Op(c);
            (l.view || u.view) && (s = !0);
            var d;
            if ((d = !(e.flags & 4))) {
              if (u.clip) d = !0;
              else {
                d = l.rect;
                var f = u.rect;
                d =
                  d.y !== f.y ||
                  d.x !== f.x ||
                  d.height !== f.height ||
                  d.width !== f.width;
              }
            }
            (d && (e.flags |= 4),
              u.abs
                ? (u = !l.abs)
                : ((l = l.rect),
                  (u = u.rect),
                  (u = l.height !== u.height || l.width !== u.width)),
              u && (e.flags |= 32));
          } else e.flags |= 32;
          (e.flags & 4 && Tp(c, Kl === 0 ? n : n + `_` + Kl, i),
            (s && e.flags & 4) ||
              (Wl === null && (Wl = []),
              Wl.push(c, Kl === 0 ? r : r + `_` + Kl, t.memoizedProps)),
            Kl++);
        } else
          (t.tag !== 22 || t.memoizedState === null) &&
            (t.tag === 30 && o
              ? (e.flags |= t.flags & 32)
              : iu(e, t.child, n, r, i, a, o) && (s = !0));
        t = t.sibling;
      }
      return s;
    }
    function au(e, t) {
      for (e = e.child; e !== null;) {
        if (e.tag === 30) {
          var n = e.memoizedProps,
            r = e.stateNode,
            i = Si(n, r),
            a = wi(n.default, n.update);
          if (t) {
            r = r.clones;
            var o = r === null ? null : r.map(kp);
          } else ((o = e.memoizedState), (e.memoizedState = null));
          r = e;
          var s = e.child;
          ((Kl = 0),
            (i = iu(r, s, i, i, a, o, !1)),
            e.flags & 4 && i && (t || Nd(e, n.onUpdate)));
        } else e.subtreeFlags & 33554432 && au(e, t);
        e = e.sibling;
      }
    }
    var ou = !1,
      U = !1,
      su = !1,
      cu = !1,
      lu = typeof WeakSet == `function` ? WeakSet : Set,
      uu = null,
      du = !1,
      fu = !1,
      pu = !1,
      mu = !1;
    function hu(e, t, n) {
      if (((e = e.containerInfo), (sp = gh), (e = Qr(e)), $r(e))) {
        if (`selectionStart` in e)
          var r = { start: e.selectionStart, end: e.selectionEnd };
        else
          a: {
            r = ((r = e.ownerDocument) && r.defaultView) || window;
            var i = r.getSelection && r.getSelection();
            if (i && i.rangeCount !== 0) {
              r = i.anchorNode;
              var a = i.anchorOffset,
                o = i.focusNode;
              i = i.focusOffset;
              try {
                (r.nodeType, o.nodeType);
              } catch {
                r = null;
                break a;
              }
              var s = 0,
                c = -1,
                l = -1,
                u = 0,
                d = 0,
                f = e,
                p = null;
              b: for (;;) {
                for (
                  var m;
                  f !== r || (a !== 0 && f.nodeType !== 3) || (c = s + a),
                    f !== o || (i !== 0 && f.nodeType !== 3) || (l = s + i),
                    f.nodeType === 3 && (s += f.nodeValue.length),
                    (m = f.firstChild) !== null;
                )
                  ((p = f), (f = m));
                for (;;) {
                  if (f === e) break b;
                  if (
                    (p === r && ++u === a && (c = s),
                    p === o && ++d === i && (l = s),
                    (m = f.nextSibling) !== null)
                  )
                    break;
                  ((f = p), (p = f.parentNode));
                }
                f = m;
              }
              r = c === -1 || l === -1 ? null : { start: c, end: l };
            } else r = null;
          }
        r ||= { start: 0, end: 0 };
      } else r = null;
      for (
        cp = { focusedElem: e, selectionRange: r },
          gh = !1,
          n = (n & 335544064) === n,
          uu = t,
          t = n ? 9270 : 1024;
        uu !== null;
      ) {
        if (((e = uu), n && ((r = e.deletions), r !== null)))
          for (a = 0; a < r.length; a++) n && $l(r[a]);
        if (e.alternate === null && e.flags & 2) (n && Ul(e), gu(n));
        else {
          if (e.tag === 22) {
            if (((r = e.alternate), e.memoizedState !== null)) {
              (r !== null && r.memoizedState === null && n && $l(r), gu(n));
              continue;
            }
            if (r !== null && r.memoizedState !== null) {
              (n && Ul(e), gu(n));
              continue;
            }
          }
          ((r = e.child),
            (e.subtreeFlags & t) !== 0 && r !== null
              ? ((r.return = e), (uu = r))
              : (n && eu(e), gu(n)));
        }
      }
      Hl = null;
    }
    function gu(e) {
      for (; uu !== null;) {
        var t = uu,
          n = e,
          r = t.alternate,
          i = t.flags;
        switch (t.tag) {
          case 0:
          case 11:
          case 15:
            break;
          case 1:
            if (i & 1024 && r !== null) {
              ((n = void 0), (i = r.memoizedProps), (r = r.memoizedState));
              var o = t.stateNode;
              try {
                var s = wc(t.type, i);
                ((n = o.getSnapshotBeforeUpdate(s, r)),
                  (o.__reactInternalSnapshotBeforeUpdate = n));
              } catch (e) {
                Z(t, t.return, e);
              }
            }
            break;
          case 3:
            if (i & 1024) {
              if (((r = t.stateNode.containerInfo), (n = r.nodeType), n === 9))
                nm(r);
              else if (n === 1)
                switch (r.nodeName) {
                  case `HEAD`:
                  case `HTML`:
                  case `BODY`:
                    nm(r);
                    break;
                  default:
                    r.textContent = ``;
                }
            }
            break;
          case 5:
          case 26:
          case 27:
          case 6:
          case 4:
          case 17:
            break;
          case 30:
            n &&
              r !== null &&
              ((n = Si(r.memoizedProps, r.stateNode)),
              (i = t.memoizedProps),
              (i = wi(i.default, i.update)),
              i !== `none` && ql(r, n, i, (r.memoizedState = []), !0));
            break;
          default:
            if (i & 1024) throw Error(a(163));
        }
        if (((r = t.sibling), r !== null)) {
          ((r.return = t.return), (uu = r));
          break;
        }
        uu = t.return;
      }
    }
    function _u(e, t, n) {
      var r = n.flags;
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          (Iu(e, n), r & 4 && Cl(5, n));
          break;
        case 1:
          if ((Iu(e, n), r & 4)) {
            if (((e = n.stateNode), t === null))
              try {
                e.componentDidMount();
              } catch (e) {
                Z(n, n.return, e);
              }
            else {
              var i = wc(n.type, t.memoizedProps);
              t = t.memoizedState;
              try {
                e.componentDidUpdate(
                  i,
                  t,
                  e.__reactInternalSnapshotBeforeUpdate,
                );
              } catch (e) {
                Z(n, n.return, e);
              }
            }
          }
          (r & 64 && Tl(n), r & 512 && Dl(n, n.return));
          break;
        case 3:
          if ((Iu(e, n), r & 64 && ((e = n.updateQueue), e !== null))) {
            if (((t = null), n.child !== null))
              switch (n.child.tag) {
                case 27:
                case 5:
                  t = n.child.stateNode;
                  break;
                case 1:
                  t = n.child.stateNode;
              }
            try {
              Eo(e, t);
            } catch (e) {
              Z(n, n.return, e);
            }
          }
          break;
        case 27:
          t === null && r & 4 && Bl(n);
        case 26:
        case 5:
          (Iu(e, n), t === null && r & 4 && Pl(n), r & 512 && Dl(n, n.return));
          break;
        case 12:
          Iu(e, n);
          break;
        case 31:
          (Iu(e, n), r & 4 && Tu(e, n));
          break;
        case 13:
          (Iu(e, n),
            r & 4 && Eu(e, n),
            r & 64 &&
              ((e = n.memoizedState),
              e !== null &&
                ((e = e.dehydrated),
                e !== null && ((n = _f.bind(null, n)), cm(e, n)))));
          break;
        case 22:
          if (((r = n.memoizedState !== null || ou), !r)) {
            var a = (t !== null && t.memoizedState !== null) || U;
            ((t = ou),
              (i = U),
              (ou = r),
              (U = a) && !i
                ? ((r = 2), n.subtreeFlags & 8772 && (r |= 1), Ru(e, n, r))
                : Iu(e, n),
              (ou = t),
              (U = i));
          }
          break;
        case 30:
          (Iu(e, n), r & 512 && Dl(n, n.return));
          break;
        case 7:
          r & 512 && Dl(n, n.return);
        default:
          Iu(e, n);
      }
    }
    function vu(e, t) {
      for (e = e.child; e !== null;) (yu(e, t), (e = e.sibling));
    }
    function yu(e, t) {
      switch (e.tag) {
        case 5:
        case 26:
          try {
            var n = e.stateNode;
            if (t) {
              var r = n.style;
              typeof r.setProperty == `function`
                ? r.setProperty(`display`, `none`, `important`)
                : (r.display = `none`);
            } else {
              var i = e.stateNode,
                a = e.memoizedProps.style,
                o = a != null && a.hasOwnProperty(`display`) ? a.display : null;
              i.style.display =
                o == null || typeof o == `boolean` ? `` : (`` + o).trim();
            }
          } catch (t) {
            Z(e, e.return, t);
          }
          bu(e, t);
          break;
        case 6:
          try {
            ((e.stateNode.nodeValue = t ? `` : e.memoizedProps), (M = !0));
          } catch (t) {
            Z(e, e.return, t);
          }
          break;
        case 18:
          try {
            var s = e.stateNode;
            t ? wp(s, !0) : wp(e.stateNode, !1);
          } catch (t) {
            Z(e, e.return, t);
          }
          break;
        case 22:
        case 23:
          e.memoizedState === null && vu(e, t);
          break;
        default:
          vu(e, t);
      }
    }
    function bu(e, t) {
      if (e.subtreeFlags & 67108864)
        for (e = e.child; e !== null;) {
          a: {
            var n = e,
              r = t;
            switch (n.tag) {
              case 4:
                yu(n, r);
                break a;
              case 22:
                n.memoizedState === null && bu(n, r);
                break a;
              default:
                bu(n, r);
            }
          }
          e = e.sibling;
        }
    }
    function xu(e) {
      var t = e.alternate;
      (t !== null && ((e.alternate = null), xu(t)),
        (e.child = null),
        (e.deletions = null),
        (e.sibling = null),
        e.tag === 5 && ((t = e.stateNode), t !== null && zt(t)),
        (e.stateNode = null),
        (e.return = null),
        (e.dependencies = null),
        (e.memoizedProps = null),
        (e.memoizedState = null),
        (e.pendingProps = null),
        (e.stateNode = null),
        (e.updateQueue = null));
    }
    var W = null,
      Su = !1;
    function Cu(e, t, n) {
      for (n = n.child; n !== null;) (wu(e, t, n), (n = n.sibling));
    }
    function wu(e, t, n) {
      if (it && typeof it.onCommitFiberUnmount == `function`)
        try {
          it.onCommitFiberUnmount(rt, n);
        } catch {}
      switch (n.tag) {
        case 26:
          (U || Ol(n, t),
            Cu(e, t, n),
            n.memoizedState
              ? n.memoizedState.count--
              : n.stateNode &&
                !U &&
                ((n = n.stateNode), n.parentNode.removeChild(n)));
          break;
        case 27:
          (U || Ol(n, t), jl(n));
          var r = W,
            i = Su;
          (Sp(n.type) && ((W = n.stateNode), (Su = !1)),
            Cu(e, t, n),
            gm(n.stateNode, n.type, n.memoizedProps),
            (W = r),
            (Su = i));
          break;
        case 5:
          (U || Ol(n, t), jl(n));
        case 6:
          if (
            (n.tag === 6 && jl(n),
            (r = W),
            (i = Su),
            (W = null),
            Cu(e, t, n),
            (W = r),
            (Su = i),
            W !== null)
          ) {
            if (Su)
              try {
                ((W.nodeType === 9
                  ? W.body
                  : W.nodeName === `HTML`
                    ? W.ownerDocument.body
                    : W
                ).removeChild(n.stateNode),
                  (M = !0));
              } catch (e) {
                Z(n, t, e);
              }
            else
              try {
                (W.removeChild(n.stateNode), (M = !0));
              } catch (e) {
                Z(n, t, e);
              }
          }
          break;
        case 18:
          W !== null &&
            (Su
              ? ((e = W),
                Cp(
                  e.nodeType === 9
                    ? e.body
                    : e.nodeName === `HTML`
                      ? e.ownerDocument.body
                      : e,
                  n.stateNode,
                ),
                Hh(e))
              : Cp(W, n.stateNode));
          break;
        case 4:
          ((r = W),
            (i = Su),
            (W = n.stateNode.containerInfo),
            (Su = !0),
            Cu(e, t, n),
            (W = r),
            (Su = i));
          break;
        case 0:
        case 11:
        case 14:
        case 15:
          (wl(2, n, t), U || wl(4, n, t), Cu(e, t, n));
          break;
        case 1:
          (U ||
            (Ol(n, t),
            (r = n.stateNode),
            typeof r.componentWillUnmount == `function` && El(n, t, r)),
            Cu(e, t, n));
          break;
        case 21:
          Cu(e, t, n);
          break;
        case 22:
          ((U = (r = U) || n.memoizedState !== null), Cu(e, t, n), (U = r));
          break;
        case 30:
          (Ol(n, t), Cu(e, t, n));
          break;
        case 7:
          (U || Ol(n, t), Cu(e, t, n));
          break;
        default:
          Cu(e, t, n);
      }
    }
    function Tu(e, t) {
      if (
        t.memoizedState === null &&
        ((e = t.alternate), e !== null && ((e = e.memoizedState), e !== null))
      ) {
        e = e.dehydrated;
        try {
          Hh(e);
        } catch (e) {
          Z(t, t.return, e);
        }
      }
    }
    function Eu(e, t) {
      if (
        t.memoizedState === null &&
        ((e = t.alternate),
        e !== null &&
          ((e = e.memoizedState),
          e !== null && ((e = e.dehydrated), e !== null)))
      )
        try {
          Hh(e);
        } catch (e) {
          Z(t, t.return, e);
        }
    }
    function Du(e) {
      switch (e.tag) {
        case 31:
        case 13:
        case 19:
          var t = e.stateNode;
          return (t === null && (t = e.stateNode = new lu()), t);
        case 22:
          return (
            (e = e.stateNode),
            (t = e._retryCache),
            t === null && (t = e._retryCache = new lu()),
            t
          );
        default:
          throw Error(a(435, e.tag));
      }
    }
    function Ou(e, t) {
      var n = Du(e);
      t.forEach(function (t) {
        if (!n.has(t)) {
          n.add(t);
          var r = vf.bind(null, e, t);
          t.then(r, r);
        }
      });
    }
    function ku(e, t, n) {
      var r = t.deletions;
      if (r !== null)
        for (var i = 0; i < r.length; i++) {
          var o = r[i],
            s = e,
            c = t,
            l = c;
          a: for (; l !== null;) {
            switch (l.tag) {
              case 27:
                if (Sp(l.type)) {
                  ((W = l.stateNode), (Su = !1));
                  break a;
                }
                break;
              case 5:
                ((W = l.stateNode), (Su = !1));
                break a;
              case 3:
              case 4:
                ((W = l.stateNode.containerInfo), (Su = !0));
                break a;
            }
            l = l.return;
          }
          if (W === null) throw Error(a(160));
          (wu(s, c, o),
            (W = null),
            (Su = !1),
            (s = o.alternate),
            s !== null && (s.return = null),
            (o.return = null));
        }
      if (t.subtreeFlags & 13886)
        for (t = t.child; t !== null;) (ju(t, e, n), (t = t.sibling));
    }
    var Au = null;
    function ju(e, t, n) {
      var r = e.alternate,
        i = e.flags;
      switch (e.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          if (
            i & 4 &&
            ((r = e.updateQueue),
            (r = r === null ? null : r.events),
            r !== null)
          )
            for (var o = 0; o < r.length; o++) {
              var s = r[o];
              s.ref.impl = s.nextImpl;
            }
          (ku(t, e, n),
            Mu(e),
            i & 4 && (wl(3, e, e.return), Cl(3, e), wl(5, e, e.return)));
          break;
        case 1:
          (ku(t, e, n),
            Mu(e),
            i & 512 && (U || r === null || Ol(r, r.return)),
            i & 64 &&
              ou &&
              ((e = e.updateQueue),
              e !== null &&
                ((t = e.callbacks),
                t !== null &&
                  ((n = e.shared.hiddenCallbacks),
                  (e.shared.hiddenCallbacks = n === null ? t : n.concat(t))))));
          break;
        case 26:
          if (
            ((o = Au),
            ku(t, e, n),
            Mu(e),
            i & 512 && (U || r === null || Ol(r, r.return)),
            i & 4)
          ) {
            if (
              ((i = r === null ? null : r.memoizedState),
              (n = e.memoizedState),
              r === null)
            ) {
              if (n === null) {
                if (e.stateNode === null) {
                  if (ou)
                    e.stateNode = fp(
                      e.type,
                      e.memoizedProps,
                      t.containerInfo,
                      e,
                    );
                  else {
                    a: {
                      ((t = e.type),
                        (n = e.memoizedProps),
                        (i = o.ownerDocument || o));
                      b: switch (t) {
                        case `title`:
                          ((r = i.getElementsByTagName(`title`)[0]),
                            (!r ||
                              r[Lt] ||
                              r[At] ||
                              r.namespaceURI === `http://www.w3.org/2000/svg` ||
                              r.hasAttribute(`itemprop`)) &&
                              ((r = i.createElement(t)),
                              i.head.insertBefore(
                                r,
                                i.querySelector(`head > title`),
                              )),
                            np(r, t, n),
                            (r[At] = e),
                            Ut(r),
                            (t = r));
                          break a;
                        case `link`:
                          if (
                            (o = Gm(`link`, `href`, i).get(t + (n.href || ``)))
                          ) {
                            for (s = 0; s < o.length; s++)
                              if (
                                ((r = o[s]),
                                r.getAttribute(`href`) ===
                                  (n.href == null || n.href === ``
                                    ? null
                                    : n.href) &&
                                  r.getAttribute(`rel`) ===
                                    (n.rel == null ? null : n.rel) &&
                                  r.getAttribute(`title`) ===
                                    (n.title == null ? null : n.title) &&
                                  r.getAttribute(`crossorigin`) ===
                                    (n.crossOrigin == null
                                      ? null
                                      : n.crossOrigin))
                              ) {
                                o.splice(s, 1);
                                break b;
                              }
                          }
                          ((r = i.createElement(t)),
                            np(r, t, n),
                            i.head.appendChild(r));
                          break;
                        case `meta`:
                          if (
                            (o = Gm(`meta`, `content`, i).get(
                              t + (n.content || ``),
                            ))
                          ) {
                            for (s = 0; s < o.length; s++)
                              if (
                                ((r = o[s]),
                                r.getAttribute(`content`) ===
                                  (n.content == null ? null : `` + n.content) &&
                                  r.getAttribute(`name`) ===
                                    (n.name == null ? null : n.name) &&
                                  r.getAttribute(`property`) ===
                                    (n.property == null ? null : n.property) &&
                                  r.getAttribute(`http-equiv`) ===
                                    (n.httpEquiv == null
                                      ? null
                                      : n.httpEquiv) &&
                                  r.getAttribute(`charset`) ===
                                    (n.charSet == null ? null : n.charSet))
                              ) {
                                o.splice(s, 1);
                                break b;
                              }
                          }
                          ((r = i.createElement(t)),
                            np(r, t, n),
                            i.head.appendChild(r));
                          break;
                        default:
                          throw Error(a(468, t));
                      }
                      ((r[At] = e), Ut(r), (t = r));
                    }
                    e.stateNode = t;
                  }
                } else ou || Km(o, e.type, e.stateNode);
              } else e.stateNode = Bm(o, n, e.memoizedProps);
            } else
              i === n
                ? n === null &&
                  e.stateNode !== null &&
                  Fl(e, e.memoizedProps, r.memoizedProps)
                : (i === null
                    ? ((t = r.stateNode),
                      t === null || U || t.parentNode.removeChild(t))
                    : i.count--,
                  n === null
                    ? ou || Km(o, e.type, e.stateNode)
                    : Bm(o, n, e.memoizedProps));
          }
          break;
        case 27:
          (ku(t, e, n),
            Mu(e),
            i & 512 && (U || r === null || Ol(r, r.return)),
            r !== null && i & 4 && Fl(e, e.memoizedProps, r.memoizedProps));
          break;
        case 5:
          if (
            ((o = su),
            (su = !1),
            ku(t, e, n),
            (su = o),
            Mu(e),
            i & 512 && (U || r === null || Ol(r, r.return)),
            e.flags & 32)
          ) {
            t = e.stateNode;
            try {
              (gn(t, ``), (M = !0));
            } catch (t) {
              Z(e, e.return, t);
            }
          }
          (i & 4 &&
            e.stateNode != null &&
            ((t = e.memoizedProps), Fl(e, t, r === null ? t : r.memoizedProps)),
            i & 1024 && (cu = !0));
          break;
        case 6:
          if ((ku(t, e, n), Mu(e), i & 4)) {
            if (e.stateNode === null) throw Error(a(162));
            ((t = e.memoizedProps), (n = e.stateNode));
            try {
              ((n.nodeValue = t), (M = !0));
            } catch (t) {
              Z(e, e.return, t);
            }
          }
          break;
        case 3:
          if (
            ((M = !1),
            (Wm = null),
            (o = Au),
            (Au = bm(t.containerInfo)),
            ku(t, e, n),
            (Au = o),
            Mu(e),
            i & 4 && r !== null && r.memoizedState.isDehydrated)
          )
            try {
              Hh(t.containerInfo);
            } catch (t) {
              Z(e, e.return, t);
            }
          (cu && ((cu = !1), Nu(e)), (M = !1));
          break;
        case 4:
          ((i = su),
            (su = ou),
            (r = $t()),
            (o = Au),
            (Au = bm(e.stateNode.containerInfo)),
            ku(t, e, n),
            Mu(e),
            (Au = o),
            M && fu && (pu = !0),
            (M = r),
            (su = i));
          break;
        case 12:
          (ku(t, e, n), Mu(e));
          break;
        case 31:
          (ku(t, e, n),
            Mu(e),
            i & 4 &&
              ((t = e.updateQueue),
              t !== null && ((e.updateQueue = null), Ou(e, t))));
          break;
        case 13:
          (ku(t, e, n),
            Mu(e),
            e.child.flags & 8192 &&
              (e.memoizedState !== null) !=
                (r !== null && r.memoizedState !== null) &&
              (hd = Ye()),
            i & 4 &&
              ((t = e.updateQueue),
              t !== null && ((e.updateQueue = null), Ou(e, t))));
          break;
        case 22:
          ((o = e.memoizedState !== null),
            (s = r !== null && r.memoizedState !== null));
          var c = ou,
            l = U,
            u = su;
          ((ou = c || o),
            (su = u || o),
            (U = l || s),
            ku(t, e, n),
            (U = l),
            (su = u),
            (ou = c),
            Mu(e),
            i & 8192 &&
              ((t = e.stateNode),
              (t._visibility = o ? t._visibility & -2 : t._visibility | 1),
              !o ||
                r === null ||
                s ||
                ou ||
                U ||
                ((t = s || U),
                (n = ou),
                (r = U),
                (ou = o || ou),
                (U = t),
                Lu(e, 2),
                (ou = n),
                (U = r)),
              (!o && su) || vu(e, o)),
            i & 4 &&
              ((t = e.updateQueue),
              t !== null &&
                ((n = t.retryQueue),
                n !== null && ((t.retryQueue = null), Ou(e, n)))));
          break;
        case 19:
          (ku(t, e, n),
            Mu(e),
            i & 4 &&
              ((t = e.updateQueue),
              t !== null && ((e.updateQueue = null), Ou(e, t))));
          break;
        case 30:
          (i & 512 && (U || r === null || Ol(r, r.return)),
            (i = $t()),
            (o = fu),
            (s = (n & 335544064) === n),
            (c = e.memoizedProps),
            (fu = s && wi(c.default, c.update) !== `none`),
            ku(t, e, n),
            Mu(e),
            s && r !== null && M && (e.flags |= 4),
            (fu = o),
            (M = i));
          break;
        case 21:
          break;
        case 7:
          (i & 512 && (U || r === null || Ol(r, r.return)),
            r && r.stateNode !== null && (r.stateNode._fragmentFiber = e));
        default:
          (ku(t, e, n), Mu(e));
      }
    }
    function Mu(e) {
      var t = e.flags;
      if (t & 2) {
        try {
          for (var n, r = e.return; r !== null;) {
            if (Il(r)) {
              n = r;
              break;
            }
            r = r.return;
          }
          r = null;
          for (var i = e.return; i !== null;) {
            if (Nl(i)) {
              var o = i.stateNode;
              r === null ? (r = [o]) : r.push(o);
            }
            if (Ml(i)) break;
            i = i.return;
          }
          var s = r;
          if (n == null) throw Error(a(160));
          switch (n.tag) {
            case 27:
              var c = n.stateNode;
              zl(e, Ll(e), c, s);
              break;
            case 5:
              var l = n.stateNode;
              (n.flags & 32 && (gn(l, ``), (n.flags &= -33)),
                zl(e, Ll(e), l, s));
              break;
            case 3:
            case 4:
              var u = n.stateNode.containerInfo;
              Rl(e, Ll(e), u, s);
              break;
            default:
              throw Error(a(161));
          }
        } catch (t) {
          Z(e, e.return, t);
        }
        e.flags &= -3;
      }
      t & 4096 && (e.flags &= -4097);
    }
    function Nu(e) {
      if (e.subtreeFlags & 1024)
        for (e = e.child; e !== null;) {
          var t = e;
          (Nu(t),
            t.tag === 5 &&
              t.flags & 1024 &&
              ((t = t.stateNode), (gh = !0), t.reset(), (gh = !1)),
            (e = e.sibling));
        }
    }
    function Pu(e, t) {
      if (t.subtreeFlags & 9270)
        for (t = t.child; t !== null;) (Fu(t, e), (t = t.sibling));
      else au(t, !1);
    }
    function Fu(e, t) {
      var n = e.alternate;
      if (n === null) Zl(e, !1);
      else
        switch (e.tag) {
          case 3:
            if (((mu = du = !1), Gl(), Pu(t, e), !du && !pu)) {
              if (((e = Wl), e !== null))
                for (var r = 0; r < e.length; r += 3) {
                  n = e[r];
                  var i = e[r + 1];
                  (Ep(n, e[r + 2]),
                    (n = n.ownerDocument.documentElement),
                    n !== null &&
                      n.animate(
                        { opacity: [0, 0], pointerEvents: [`none`, `none`] },
                        {
                          duration: 0,
                          fill: `forwards`,
                          pseudoElement: `::view-transition-group(` + i + `)`,
                        },
                      ));
                }
              ((e = t.containerInfo),
                (e =
                  e.nodeType === 9
                    ? e.documentElement
                    : e.ownerDocument.documentElement),
                e !== null &&
                  e.style.viewTransitionName === `` &&
                  ((e.style.viewTransitionName = `none`),
                  e.animate(
                    { opacity: [0, 0], pointerEvents: [`none`, `none`] },
                    {
                      duration: 0,
                      fill: `forwards`,
                      pseudoElement: `::view-transition-group(root)`,
                    },
                  ),
                  e.animate(
                    { width: [0, 0], height: [0, 0] },
                    {
                      duration: 0,
                      fill: `forwards`,
                      pseudoElement: `::view-transition`,
                    },
                  )),
                (mu = !0));
            }
            Wl = null;
            break;
          case 5:
            Pu(t, e);
            break;
          case 4:
            ((r = du), (du = !1), Pu(t, e), du && (pu = !0), (du = r));
            break;
          case 22:
            e.memoizedState === null &&
              (n.memoizedState === null ? Pu(t, e) : Zl(e, !1));
            break;
          case 30:
            ((r = du), (i = Gl()), (du = !1), Pu(t, e), du && (e.flags |= 4));
            var a = e.memoizedProps,
              o = e.stateNode;
            ((t = Si(a, o)), (o = Si(n.memoizedProps, o)));
            var s = wi(a.default, a.update);
            (s === `none`
              ? (t = !1)
              : ((a = n.memoizedState),
                (n.memoizedState = null),
                (n = e.child),
                (Kl = 0),
                (t = iu(e, n, t, o, s, a, !0)),
                Kl !== (a === null ? 0 : a.length) && (e.flags |= 32)),
              e.flags & 4 && t
                ? (Nd(e, e.memoizedProps.onUpdate), (Wl = i))
                : i !== null && (i.push.apply(i, Wl), (Wl = i)),
              (du = e.flags & 32 ? !0 : r));
            break;
          default:
            Pu(t, e);
        }
    }
    function Iu(e, t) {
      if (t.subtreeFlags & 8772)
        for (t = t.child; t !== null;) (_u(e, t.alternate, t), (t = t.sibling));
    }
    function Lu(e, t) {
      for (e = e.child; e !== null;) {
        var n = e,
          r = t;
        switch (n.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            (wl(4, n, n.return), Lu(n, r));
            break;
          case 1:
            Ol(n, n.return);
            var i = n.stateNode;
            (typeof i.componentWillUnmount == `function` && El(n, n.return, i),
              Lu(n, r));
            break;
          case 27:
            r & 2 && gm(n.stateNode, n.type, n.memoizedProps);
          case 5:
            (Ol(n, n.return), (n.tag !== 5 && n.tag !== 27) || jl(n), Lu(n, r));
            break;
          case 6:
            jl(n);
            break;
          case 26:
            (Ol(n, n.return),
              (i = n.stateNode),
              n.memoizedState !== null ||
                i === null ||
                U ||
                i.parentNode.removeChild(i),
              Lu(n, r));
            break;
          case 22:
            n.memoizedState === null && Lu(n, r);
            break;
          case 30:
            (Ol(n, n.return), Lu(n, r));
            break;
          case 7:
            Ol(n, n.return);
          default:
            Lu(n, r);
        }
        e = e.sibling;
      }
    }
    function Ru(e, t, n) {
      for (n = t.subtreeFlags & 8772 ? n : n & -2, t = t.child; t !== null;) {
        var r = t.alternate,
          i = e,
          a = t,
          o = a.flags,
          s = !!(n & 1);
        switch (a.tag) {
          case 0:
          case 11:
          case 15:
            (Ru(i, a, n), Cl(4, a));
            break;
          case 1:
            if (
              (Ru(i, a, n),
              (r = a),
              (i = r.stateNode),
              typeof i.componentDidMount == `function`)
            )
              try {
                i.componentDidMount();
              } catch (e) {
                Z(r, r.return, e);
              }
            if (((r = a), (i = r.updateQueue), i !== null)) {
              var c = r.stateNode;
              try {
                var l = i.shared.hiddenCallbacks;
                if (l !== null)
                  for (
                    i.shared.hiddenCallbacks = null, i = 0;
                    i < l.length;
                    i++
                  )
                    To(l[i], c);
              } catch (e) {
                Z(r, r.return, e);
              }
            }
            (s && o & 64 && Tl(a), Dl(a, a.return));
            break;
          case 27:
            n & 2 && Bl(a);
          case 5:
            ((a.tag !== 5 && a.tag !== 27) || Al(a),
              Ru(i, a, n),
              s && r === null && o & 4 && Pl(a),
              Dl(a, a.return));
            break;
          case 6:
            Al(a);
            break;
          case 26:
            ((c = a.stateNode),
              a.memoizedState !== null ||
                c === null ||
                ou ||
                Km(bm(c.ownerDocument), a.type, c),
              Ru(i, a, n),
              s && r === null && o & 4 && Pl(a),
              Dl(a, a.return));
            break;
          case 12:
            Ru(i, a, n);
            break;
          case 31:
            (Ru(i, a, n), s && o & 4 && Tu(i, a));
            break;
          case 13:
            (Ru(i, a, n), s && o & 4 && Eu(i, a));
            break;
          case 22:
            (a.memoizedState === null && Ru(i, a, n), Dl(a, a.return));
            break;
          case 30:
            (Ru(i, a, n), Dl(a, a.return));
            break;
          case 7:
            Dl(a, a.return);
          default:
            Ru(i, a, n);
        }
        t = t.sibling;
      }
    }
    function zu(e, t) {
      var n = null;
      (e !== null &&
        e.memoizedState !== null &&
        e.memoizedState.cachePool !== null &&
        (n = e.memoizedState.cachePool.pool),
        (e = null),
        t.memoizedState !== null &&
          t.memoizedState.cachePool !== null &&
          (e = t.memoizedState.cachePool.pool),
        e !== n && (e != null && e.refCount++, n != null && Pa(n)));
    }
    function Bu(e, t) {
      ((e = null),
        t.alternate !== null && (e = t.alternate.memoizedState.cache),
        (t = t.memoizedState.cache),
        t !== e && (t.refCount++, e != null && Pa(e)));
    }
    function Vu(e, t, n, r) {
      var i = (n & 335544064) === n;
      if (t.subtreeFlags & (i ? 10262 : 10256))
        for (t = t.child; t !== null;) (Hu(e, t, n, r), (t = t.sibling));
      else i && ru(t);
    }
    function Hu(e, t, n, r) {
      var i = (n & 335544064) === n;
      i &&
        t.alternate === null &&
        t.return !== null &&
        t.return.alternate !== null &&
        nu(t);
      var a = t.flags;
      switch (t.tag) {
        case 0:
        case 11:
        case 15:
          (Vu(e, t, n, r), a & 2048 && Cl(9, t));
          break;
        case 1:
          Vu(e, t, n, r);
          break;
        case 3:
          (Vu(e, t, n, r),
            i &&
              mu &&
              ((e = e.containerInfo),
              (e =
                e.nodeType === 9
                  ? e.body
                  : e.nodeName === `HTML`
                    ? e.ownerDocument.body
                    : e),
              e.style.viewTransitionName === `root` &&
                (e.style.viewTransitionName = ``),
              (e = e.ownerDocument.documentElement),
              e !== null &&
                e.style.viewTransitionName === `none` &&
                (e.style.viewTransitionName = ``)),
            a & 2048 &&
              ((a = null),
              t.alternate !== null && (a = t.alternate.memoizedState.cache),
              (t = t.memoizedState.cache),
              t !== a && (t.refCount++, a != null && Pa(a))));
          break;
        case 12:
          if (a & 2048) {
            (Vu(e, t, n, r), (a = t.stateNode));
            try {
              var o = t.memoizedProps,
                s = o.id,
                c = o.onPostCommit;
              typeof c == `function` &&
                c(
                  s,
                  t.alternate === null ? `mount` : `update`,
                  a.passiveEffectDuration,
                  -0,
                );
            } catch (e) {
              Z(t, t.return, e);
            }
          } else Vu(e, t, n, r);
          break;
        case 31:
          Vu(e, t, n, r);
          break;
        case 13:
          Vu(e, t, n, r);
          break;
        case 23:
          break;
        case 22:
          ((o = t.stateNode),
            (s = t.alternate),
            t.memoizedState === null
              ? (i && s !== null && s.memoizedState !== null && nu(t),
                o._visibility & 2
                  ? Vu(e, t, n, r)
                  : ((o._visibility |= 2),
                    Uu(e, t, n, r, !!(t.subtreeFlags & 10256) || !1)))
              : (i && s !== null && s.memoizedState === null && nu(s),
                o._visibility & 2 ? Vu(e, t, n, r) : Wu(e, t)),
            a & 2048 && zu(s, t));
          break;
        case 24:
          (Vu(e, t, n, r), a & 2048 && Bu(t.alternate, t));
          break;
        case 30:
          (i &&
            ((a = t.alternate),
            a !== null && (Yl(a.child, !0), Yl(t.child, !0))),
            Vu(e, t, n, r));
          break;
        default:
          Vu(e, t, n, r);
      }
    }
    function Uu(e, t, n, r, i) {
      for (i &&= !!(t.subtreeFlags & 10256) || !1, t = t.child; t !== null;) {
        var a = e,
          o = t,
          s = n,
          c = r,
          l = o.flags;
        switch (o.tag) {
          case 0:
          case 11:
          case 15:
            (Uu(a, o, s, c, i), Cl(8, o));
            break;
          case 23:
            break;
          case 22:
            var u = o.stateNode;
            (o.memoizedState === null
              ? ((u._visibility |= 2), Uu(a, o, s, c, i))
              : u._visibility & 2
                ? Uu(a, o, s, c, i)
                : Wu(a, o),
              i && l & 2048 && zu(o.alternate, o));
            break;
          case 24:
            (Uu(a, o, s, c, i), i && l & 2048 && Bu(o.alternate, o));
            break;
          default:
            Uu(a, o, s, c, i);
        }
        t = t.sibling;
      }
    }
    function Wu(e, t) {
      if (t.subtreeFlags & 10256)
        for (t = t.child; t !== null;) {
          var n = e,
            r = t,
            i = r.flags;
          switch (r.tag) {
            case 22:
              (Wu(n, r), i & 2048 && zu(r.alternate, r));
              break;
            case 24:
              (Wu(n, r), i & 2048 && Bu(r.alternate, r));
              break;
            default:
              Wu(n, r);
          }
          t = t.sibling;
        }
    }
    var Gu = 8192;
    function Ku(e, t, n) {
      if (e.subtreeFlags & Gu)
        for (e = e.child; e !== null;) (qu(e, t, n), (e = e.sibling));
    }
    function qu(e, t, n) {
      switch (e.tag) {
        case 26:
          (Ku(e, t, n),
            e.flags & Gu &&
              (e.memoizedState === null
                ? ((e = e.stateNode), (t & 335544128) === t && Zm(n, e))
                : Qm(n, Au, e.memoizedState, e.memoizedProps)));
          break;
        case 5:
          (Ku(e, t, n),
            e.flags & Gu &&
              ((e = e.stateNode), (t & 335544128) === t && Zm(n, e)));
          break;
        case 3:
        case 4:
          var r = Au;
          ((Au = bm(e.stateNode.containerInfo)), Ku(e, t, n), (Au = r));
          break;
        case 22:
          e.memoizedState === null &&
            ((r = e.alternate),
            r !== null && r.memoizedState !== null
              ? ((r = Gu), (Gu = 16777216), Ku(e, t, n), (Gu = r))
              : Ku(e, t, n));
          break;
        case 30:
          if (
            (e.flags & Gu) !== 0 &&
            ((r = e.memoizedProps.name), r != null && r !== `auto`)
          ) {
            var i = e.stateNode;
            ((i.paired = null), Hl === null && (Hl = new Map()), Hl.set(r, i));
          }
          Ku(e, t, n);
          break;
        default:
          Ku(e, t, n);
      }
    }
    function Ju(e) {
      var t = e.alternate;
      if (t !== null && ((e = t.child), e !== null)) {
        t.child = null;
        do ((t = e.sibling), (e.sibling = null), (e = t));
        while (e !== null);
      }
    }
    function Yu(e) {
      var t = e.deletions;
      if (e.flags & 16) {
        if (t !== null)
          for (var n = 0; n < t.length; n++) {
            var r = t[n];
            ((uu = r), Qu(r, e));
          }
        Ju(e);
      }
      if (e.subtreeFlags & 10256)
        for (e = e.child; e !== null;) (Xu(e), (e = e.sibling));
    }
    function Xu(e) {
      switch (e.tag) {
        case 0:
        case 11:
        case 15:
          (Yu(e), e.flags & 2048 && wl(9, e, e.return));
          break;
        case 3:
          Yu(e);
          break;
        case 12:
          Yu(e);
          break;
        case 22:
          var t = e.stateNode;
          e.memoizedState !== null &&
          t._visibility & 2 &&
          (e.return === null || e.return.tag !== 13)
            ? ((t._visibility &= -3), Zu(e))
            : Yu(e);
          break;
        default:
          Yu(e);
      }
    }
    function Zu(e) {
      var t = e.deletions;
      if (e.flags & 16) {
        if (t !== null)
          for (var n = 0; n < t.length; n++) {
            var r = t[n];
            ((uu = r), Qu(r, e));
          }
        Ju(e);
      }
      for (e = e.child; e !== null;) {
        switch (((t = e), t.tag)) {
          case 0:
          case 11:
          case 15:
            (wl(8, t, t.return), Zu(t));
            break;
          case 22:
            ((n = t.stateNode),
              n._visibility & 2 && ((n._visibility &= -3), Zu(t)));
            break;
          default:
            Zu(t);
        }
        e = e.sibling;
      }
    }
    function Qu(e, t) {
      for (; uu !== null;) {
        var n = uu;
        switch (n.tag) {
          case 0:
          case 11:
          case 15:
            wl(8, n, t);
            break;
          case 23:
          case 22:
            if (
              n.memoizedState !== null &&
              n.memoizedState.cachePool !== null
            ) {
              var r = n.memoizedState.cachePool.pool;
              r != null && r.refCount++;
            }
            break;
          case 24:
            Pa(n.memoizedState.cache);
        }
        if (((r = n.child), r !== null)) ((r.return = n), (uu = r));
        else
          a: for (n = e; uu !== null;) {
            r = uu;
            var i = r.sibling,
              a = r.return;
            if ((xu(r), r === n)) {
              uu = null;
              break a;
            }
            if (i !== null) {
              ((i.return = a), (uu = i));
              break a;
            }
            uu = a;
          }
      }
    }
    var $u = {
        getCacheForType: function (e) {
          var t = R(z),
            n = t.data.get(e);
          return (n === void 0 && ((n = e()), t.data.set(e, n)), n);
        },
        cacheSignal: function () {
          return R(z).controller.signal;
        },
      },
      ed = typeof WeakMap == `function` ? WeakMap : Map,
      G = 0,
      K = null,
      q = null,
      J = 0,
      Y = 0,
      td = null,
      nd = !1,
      rd = !1,
      id = !1,
      ad = 0,
      od = 0,
      sd = 0,
      cd = 0,
      ld = 0,
      ud = 0,
      dd = 0,
      fd = null,
      pd = null,
      md = !1,
      hd = 0,
      gd = 0,
      _d = 1 / 0,
      vd = null,
      yd = null,
      X = 0,
      bd = null,
      xd = null,
      Sd = 0,
      Cd = 0,
      wd = null,
      Td = null,
      Ed = null,
      Dd = null,
      Od = null,
      kd = 0,
      Ad = null;
    function jd() {
      return G & 2 && J !== 0 ? J & -J : w.T === null ? Dt() : Pf();
    }
    function Md() {
      if (ud === 0) {
        if (!(J & 536870912) || L) {
          var e = dt;
          ((dt <<= 1), !(dt & 3932160) && (dt = 262144), (ud = e));
        } else ud = 536870912;
      }
      return ((e = Mo.current), e !== null && (e.flags |= 32), ud);
    }
    function Nd(e, t) {
      if (t != null) {
        var n = e.stateNode,
          r = n.ref;
        (r === null && (r = n.ref = Pp(Si(e.memoizedProps, n))),
          Dd === null && (Dd = []),
          Dd.push(t.bind(null, r)));
      }
    }
    function Pd(e, t, n) {
      (((e === K && (Y === 2 || Y === 9)) || e.cancelPendingCommit !== null) &&
        (Vd(e, 0), Rd(e, J, ud, !1)),
        bt(e, n),
        (G & 2 && e === K) ||
          (e === K && (!(G & 2) && (cd |= n), od === 4 && Rd(e, J, ud, !1)),
          Ef(e)));
    }
    function Fd(e, t, n) {
      if (G & 6) throw Error(a(327));
      var r = (!n && !(t & 127) && (t & e.expiredLanes) === 0) || ht(e, t),
        i = r ? Yd(e, t) : qd(e, t, !0),
        o = r;
      do {
        if (i === 0) {
          rd && !r && Rd(e, t, 0, !1);
          break;
        }
        if (((n = e.current.alternate), o && !Ld(n)))
          ((i = qd(e, t, !1)), (o = !1));
        else {
          if (i === 2) {
            if (((o = t), e.errorRecoveryDisabledLanes & o)) var s = 0;
            else
              ((s = e.pendingLanes & -536870913),
                (s = s === 0 ? (s & 536870912 ? 536870912 : 0) : s));
            if (s !== 0) {
              t = s;
              a: {
                var c = e;
                i = fd;
                var l = c.current.memoizedState.isDehydrated;
                if (
                  (l && (Vd(c, s).flags |= 256),
                  (s = qd(c, s, !1)),
                  s !== 2 && s !== 6)
                ) {
                  if (id && !l) {
                    ((c.errorRecoveryDisabledLanes |= o), (cd |= o), (i = 4));
                    break a;
                  }
                  ((o = pd),
                    (pd = i),
                    o !== null &&
                      (pd === null ? (pd = o) : pd.push.apply(pd, o)));
                }
                i = s;
              }
              if (((o = !1), i !== 2)) continue;
            }
          }
          if (i === 1) {
            (Vd(e, 0), Rd(e, t, 0, !0));
            break;
          }
          a: {
            switch (((r = e), (o = i), o)) {
              case 0:
              case 1:
                throw Error(a(345));
              case 4:
                if ((t & 4194048) !== t && (t & 62914560) !== t) break;
              case 6:
                Rd(r, t, ud, !nd);
                break a;
              case 2:
                pd = null;
                break;
              case 3:
              case 5:
                break;
              default:
                throw Error(a(329));
            }
            if ((t & 62914560) === t && ((i = hd + 300 - Ye()), 10 < i)) {
              if ((Rd(r, t, ud, !nd), mt(r, 0, !0) !== 0)) break a;
              ((Sd = t),
                (r.timeoutHandle = gp(
                  Id.bind(
                    null,
                    r,
                    n,
                    pd,
                    vd,
                    md,
                    t,
                    ud,
                    cd,
                    dd,
                    nd,
                    o,
                    `Throttled`,
                    -0,
                    0,
                  ),
                  i,
                )));
              break a;
            }
            Id(r, n, pd, vd, md, t, ud, cd, dd, nd, o, null, -0, 0);
          }
          break;
        }
      } while (1);
      Ef(e);
    }
    function Id(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
      e.timeoutHandle = -1;
      var m = t.subtreeFlags,
        h = (a & 335544064) === a;
      ((d = null),
        (h || m & 8192 || (m & 16785408) == 16785408) &&
        ((d = {
          stylesheets: null,
          count: 0,
          imgCount: 0,
          imgBytes: 0,
          suspenseyImages: [],
          waitingForImages: !0,
          waitingForViewTransition: !1,
          unsuspend: wn,
        }),
        (Hl = null),
        qu(t, a, d),
        h &&
          ((m = d),
          (h = e.containerInfo),
          (h = (h.nodeType === 9 ? h : h.ownerDocument).__reactViewTransition),
          h != null &&
            (m.count++,
            (m.waitingForViewTransition = !0),
            (m = nh.bind(m)),
            h.finished.then(m, m))),
        (m =
          (a & 62914560) === a
            ? hd - Ye()
            : (a & 4194048) === a
              ? gd - Ye()
              : 0),
        (m = eh(d, m)),
        m !== null)
          ? ((Sd = a),
            (e.cancelPendingCommit = m(
              nf.bind(null, e, t, a, n, r, i, o, s, c, l, u, d, null, f, p),
            )),
            Rd(e, a, o, !l))
          : nf(e, t, a, n, r, i, o, s, c, l, u, d));
    }
    function Ld(e) {
      for (var t = e; ;) {
        var n = t.tag;
        if (
          (n === 0 || n === 11 || n === 15) &&
          t.flags & 16384 &&
          ((n = t.updateQueue), n !== null && ((n = n.stores), n !== null))
        )
          for (var r = 0; r < n.length; r++) {
            var i = n[r],
              a = i.getSnapshot;
            i = i.value;
            try {
              if (!Kr(a(), i)) return !1;
            } catch {
              return !1;
            }
          }
        if (((n = t.child), t.subtreeFlags & 16384 && n !== null))
          ((n.return = t), (t = n));
        else {
          if (t === e) break;
          for (; t.sibling === null;) {
            if (t.return === null || t.return === e) return !0;
            t = t.return;
          }
          ((t.sibling.return = t.return), (t = t.sibling));
        }
      }
      return !0;
    }
    function Rd(e, t, n, r) {
      ((t = gt(e, t)),
        (t &= ~ld),
        (t &= ~cd),
        (e.suspendedLanes |= t),
        (e.pingedLanes &= ~t),
        r && (e.warmLanes |= t),
        (r = e.expirationTimes));
      for (var i = t; 0 < i;) {
        var a = 31 - ot(i),
          o = 1 << a;
        ((r[a] = -1), (i &= ~o));
      }
      n !== 0 && St(e, n, t);
    }
    function zd() {
      return G & 6 ? !0 : (Df(0, !1), !1);
    }
    function Bd() {
      if (q !== null) {
        if (Y === 0) var e = q.return;
        else ((e = q), (ba = ya = null), os(e), (oo = null), (so = 0), (e = q));
        for (; e !== null;) (Sl(e.alternate, e), (e = e.return));
        q = null;
      }
    }
    function Vd(e, t) {
      var n = e.timeoutHandle;
      return (
        n !== -1 && ((e.timeoutHandle = -1), _p(n)),
        (n = e.cancelPendingCommit),
        n !== null && ((e.cancelPendingCommit = null), n()),
        (Sd = 0),
        Bd(),
        (K = e),
        (q = n = zi(e.current, null)),
        (J = t),
        (Y = 0),
        (td = null),
        (nd = !1),
        (rd = ht(e, t)),
        (id = !1),
        (dd = ud = ld = cd = sd = od = 0),
        (pd = fd = null),
        (md = !1),
        (ad = gt(e, t)),
        ki(),
        n
      );
    }
    function Hd(e, t) {
      ((B = null),
        (w.H = gc),
        t === Xa || t === Qa
          ? ((t = io()), (Y = 3))
          : t === Za
            ? ((t = io()), (Y = 4))
            : (Y =
                t === Pc
                  ? 8
                  : typeof t == `object` && t && typeof t.then == `function`
                    ? 6
                    : 1),
        (td = t),
        q === null && ((od = 1), Oc(e, qi(t, e.current))));
    }
    function Ud() {
      var e = Mo.current;
      return e === null
        ? !0
        : (J & 4194048) === J
          ? No === null
          : (J & 62914560) === J || J & 536870912
            ? e === No
            : !1;
    }
    function Wd() {
      var e = w.H;
      return ((w.H = gc), e === null ? gc : e);
    }
    function Gd() {
      var e = w.A;
      return ((w.A = $u), e);
    }
    function Kd() {
      ((od = 4),
        nd || ((J & 4194048) !== J && Mo.current !== null) || (rd = !0),
        (!(sd & 134217727) && !(cd & 134217727)) ||
          K === null ||
          Rd(K, J, ud, !1));
    }
    function qd(e, t, n) {
      var r = G;
      G |= 2;
      var i = Wd(),
        a = Gd();
      ((K !== e || J !== t) && ((vd = null), Vd(e, t)), (t = !1));
      var o = od;
      a: do
        try {
          if (Y !== 0 && q !== null) {
            var s = q,
              c = td;
            switch (Y) {
              case 8:
                (Bd(), (o = 6));
                break a;
              case 3:
              case 2:
              case 9:
              case 6:
                Mo.current === null && (t = !0);
                var l = Y;
                if (((Y = 0), (td = null), $d(e, s, c, l), n && rd)) {
                  o = 0;
                  break a;
                }
                break;
              default:
                ((l = Y), (Y = 0), (td = null), $d(e, s, c, l));
            }
          }
          (Jd(), (o = od));
          break;
        } catch (t) {
          Hd(e, t);
        }
      while (1);
      return (
        t && e.shellSuspendCounter++,
        (ba = ya = null),
        (G = r),
        (w.H = i),
        (w.A = a),
        q === null && ((K = null), (J = 0), ki()),
        o
      );
    }
    function Jd() {
      for (; q !== null;) Zd(q);
    }
    function Yd(e, t) {
      var n = G;
      G |= 2;
      var r = Wd(),
        i = Gd();
      K !== e || J !== t
        ? ((vd = null), (_d = Ye() + 500), Vd(e, t))
        : (rd = ht(e, t));
      a: do
        try {
          if (Y !== 0 && q !== null) {
            t = q;
            var o = td;
            b: switch (Y) {
              case 1:
                ((Y = 0), (td = null), $d(e, t, o, 1));
                break;
              case 2:
              case 9:
                if (eo(o)) {
                  ((Y = 0), (td = null), Qd(t));
                  break;
                }
                ((t = function () {
                  ((Y !== 2 && Y !== 9) || K !== e || (Y = 7), Ef(e));
                }),
                  o.then(t, t));
                break a;
              case 3:
                Y = 7;
                break a;
              case 4:
                Y = 5;
                break a;
              case 7:
                eo(o)
                  ? ((Y = 0), (td = null), Qd(t))
                  : ((Y = 0), (td = null), $d(e, t, o, 7));
                break;
              case 5:
                var s = null;
                switch (q.tag) {
                  case 26:
                    s = q.memoizedState;
                  case 5:
                  case 27:
                    var c = q;
                    if (s ? Ym(s) : c.stateNode.complete) {
                      ((Y = 0), (td = null));
                      var l = c.sibling;
                      if (l !== null) q = l;
                      else {
                        var u = c.return;
                        u === null ? (q = null) : ((q = u), ef(u));
                      }
                      break b;
                    }
                }
                ((Y = 0), (td = null), $d(e, t, o, 5));
                break;
              case 6:
                ((Y = 0), (td = null), $d(e, t, o, 6));
                break;
              case 8:
                (Bd(), (od = 6));
                break a;
              default:
                throw Error(a(462));
            }
          }
          Xd();
          break;
        } catch (t) {
          Hd(e, t);
        }
      while (1);
      return (
        (ba = ya = null),
        (w.H = r),
        (w.A = i),
        (G = n),
        q === null ? ((K = null), (J = 0), ki(), od) : 0
      );
    }
    function Xd() {
      for (; q !== null && !k();) Zd(q);
    }
    function Zd(e) {
      var t = ml(e.alternate, e, ad);
      ((e.memoizedProps = e.pendingProps), t === null ? ef(e) : (q = t));
    }
    function Qd(e) {
      var t = e,
        n = t.alternate;
      switch (t.tag) {
        case 15:
        case 0:
          t = Jc(n, t, t.pendingProps, t.type, void 0, J);
          break;
        case 11:
          t = Jc(n, t, t.pendingProps, t.type.render, t.ref, J);
          break;
        case 5:
          os(t);
          var r = t;
          r === F &&
            (L
              ? (pa(r), r.tag === 5 && r.stateNode != null && (I = r.stateNode))
              : (pa(r), (L = !0)));
        default:
          (Sl(n, t), (t = q = Bi(t, ad)), (t = ml(n, t, ad)));
      }
      ((e.memoizedProps = e.pendingProps), t === null ? ef(e) : (q = t));
    }
    function $d(e, t, n, r) {
      ((ba = ya = null), os(t), (oo = null), (so = 0));
      var i = t.return;
      try {
        if (Nc(e, i, t, n, J)) {
          ((od = 1), Oc(e, qi(n, e.current)), (q = null));
          return;
        }
      } catch (t) {
        if (i !== null) throw ((q = i), t);
        ((od = 1), Oc(e, qi(n, e.current)), (q = null));
        return;
      }
      t.flags & 32768
        ? (L || r === 1
            ? (e = !0)
            : rd || J & 536870912
              ? (e = !1)
              : ((nd = e = !0),
                (r === 2 || r === 9 || r === 3 || r === 6) &&
                  ((r = Mo.current),
                  r !== null && r.tag === 13 && (r.flags |= 16384))),
          tf(t, e))
        : ef(t);
    }
    function ef(e) {
      var t = e;
      do {
        if (t.flags & 32768) {
          tf(t, nd);
          return;
        }
        e = t.return;
        var n = bl(t.alternate, t, ad);
        if (n !== null) {
          q = n;
          return;
        }
        if (((t = t.sibling), t !== null)) {
          q = t;
          return;
        }
        q = t = e;
      } while (t !== null);
      od === 0 && (od = 5);
    }
    function tf(e, t) {
      do {
        var n = xl(e.alternate, e);
        if (n !== null) {
          ((n.flags &= 32767), (q = n));
          return;
        }
        if (
          ((n = e.return),
          n !== null &&
            ((n.flags |= 32768), (n.subtreeFlags = 0), (n.deletions = null)),
          !t && ((e = e.sibling), e !== null))
        ) {
          q = e;
          return;
        }
        q = e = n;
      } while (e !== null);
      ((od = 6), (q = null));
    }
    function nf(e, t, n, r, i, o, s, c, l, u, d, f) {
      e.cancelPendingCommit = null;
      do df();
      while (X !== 0);
      if (G & 6) throw Error(a(327));
      if (t !== null) {
        if (t === e.current) throw Error(a(177));
        (e === K && ((q = K = null), (J = 0)),
          (xd = t),
          (bd = e),
          (Sd = n),
          (wd = i),
          (Td = r),
          rf(e, t, n, s, c, l, f));
      }
    }
    function rf(e, t, n, r, i, a, o) {
      var s = t.lanes | t.childLanes;
      if (
        ((Cd = s),
        (s |= Oi),
        xt(e, n, s, r, i, a),
        (Dd = null),
        (n & 335544064) === n
          ? ((Od = La(e)), (r = 10262))
          : ((Od = null), (r = 10256)),
        (t.subtreeFlags & r) !== 0 || (t.flags & r) !== 0
          ? ((e.callbackNode = null),
            (e.callbackPriority = 0),
            yf(Qe, function () {
              return (ff(), null);
            }))
          : ((e.callbackNode = null), (e.callbackPriority = 0)),
        (Vl = !1),
        (r = !!(t.flags & 13878)),
        t.subtreeFlags & 13878 || r)
      ) {
        ((r = w.T), (w.T = null), (i = T.p), (T.p = 2), (a = G), (G |= 4));
        try {
          hu(e, t, n);
        } finally {
          ((G = a), (T.p = i), (w.T = r));
        }
      }
      ((X = 1),
        Vl
          ? (Ed = Mp(
              o,
              e.containerInfo,
              Od,
              sf,
              cf,
              of,
              lf,
              ff,
              af,
              null,
              null,
            ))
          : (sf(), cf(), lf()));
    }
    function af(e) {
      if (X !== 0) {
        var t = bd.onRecoverableError;
        t(e, { componentStack: null });
      }
    }
    function of() {
      X === 3 && ((X = 0), Fu(xd, bd), (X = 4));
    }
    function sf() {
      if (X === 1) {
        X = 0;
        var e = bd,
          t = xd,
          n = Sd,
          r = !!(t.flags & 13878);
        if (t.subtreeFlags & 13878 || r) {
          ((r = w.T), (w.T = null));
          var i = T.p;
          T.p = 2;
          var a = G;
          G |= 4;
          try {
            ((fu = pu = !1), ju(t, e, n), (n = cp));
            var o = Qr(e.containerInfo),
              s = n.focusedElem,
              c = n.selectionRange;
            if (
              o !== s &&
              s &&
              s.ownerDocument &&
              Zr(s.ownerDocument.documentElement, s)
            ) {
              if (c !== null && $r(s)) {
                var l = c.start,
                  u = c.end;
                if ((u === void 0 && (u = l), `selectionStart` in s))
                  ((s.selectionStart = l),
                    (s.selectionEnd = Math.min(u, s.value.length)));
                else {
                  var d = s.ownerDocument || document,
                    f = (d && d.defaultView) || window;
                  if (f.getSelection) {
                    var p = f.getSelection(),
                      m = s.textContent.length,
                      h = Math.min(c.start, m),
                      g = c.end === void 0 ? h : Math.min(c.end, m);
                    !p.extend && h > g && ((o = g), (g = h), (h = o));
                    var _ = Xr(s, h),
                      v = Xr(s, g);
                    if (
                      _ &&
                      v &&
                      (p.rangeCount !== 1 ||
                        p.anchorNode !== _.node ||
                        p.anchorOffset !== _.offset ||
                        p.focusNode !== v.node ||
                        p.focusOffset !== v.offset)
                    ) {
                      var y = d.createRange();
                      (y.setStart(_.node, _.offset),
                        p.removeAllRanges(),
                        h > g
                          ? (p.addRange(y), p.extend(v.node, v.offset))
                          : (y.setEnd(v.node, v.offset), p.addRange(y)));
                    }
                  }
                }
              }
              for (d = [], p = s; (p = p.parentNode);)
                p.nodeType === 1 &&
                  d.push({ element: p, left: p.scrollLeft, top: p.scrollTop });
              for (
                typeof s.focus == `function` && s.focus(), s = 0;
                s < d.length;
                s++
              ) {
                var b = d[s];
                ((b.element.scrollLeft = b.left),
                  (b.element.scrollTop = b.top));
              }
            }
            ((gh = !!sp), (cp = sp = null));
          } finally {
            ((G = a), (T.p = i), (w.T = r));
          }
        }
        ((e.current = t), (X = 2));
      }
    }
    function cf() {
      if (X === 2) {
        X = 0;
        var e = bd,
          t = xd,
          n = !!(t.flags & 8772);
        if (t.subtreeFlags & 8772 || n) {
          ((n = w.T), (w.T = null));
          var r = T.p;
          T.p = 2;
          var i = G;
          G |= 4;
          try {
            _u(e, t.alternate, t);
          } finally {
            ((G = i), (T.p = r), (w.T = n));
          }
        }
        X = 3;
      }
    }
    function lf() {
      if (X === 4 || X === 3) {
        X = 0;
        var e = Ed;
        ((Ed = null), Je());
        var t = bd,
          n = xd,
          r = Sd,
          i = Td,
          a = (r & 335544064) === r ? 10262 : 10256;
        if (
          ((n.subtreeFlags & a) !== 0 || (n.flags & a) !== 0
            ? (X = 5)
            : ((X = 0), (xd = bd = null), uf(t, t.pendingLanes)),
          (a = t.pendingLanes),
          a === 0 && (yd = null),
          Et(r),
          (n = n.stateNode),
          it && typeof it.onCommitFiberRoot == `function`)
        )
          try {
            it.onCommitFiberRoot(rt, n, void 0, (n.current.flags & 128) == 128);
          } catch {}
        if (i !== null) {
          ((n = w.T), (a = T.p), (T.p = 2), (w.T = null));
          try {
            for (var o = t.onRecoverableError, s = 0; s < i.length; s++) {
              var c = i[s];
              o(c.value, { componentStack: c.stack });
            }
          } finally {
            ((w.T = n), (T.p = a));
          }
        }
        if (
          ((i = Dd),
          (o = Od),
          (Od = null),
          i !== null && ((Dd = null), o === null && (o = []), e !== null))
        )
          for (c = 0; c < i.length; c++)
            ((n = (0, i[c])(o)), n !== void 0 && e.finished.finally(n));
        (Sd & 3 && df(),
          Ef(t),
          (a = t.pendingLanes),
          r & 261930 && a & 42
            ? t === Ad
              ? kd++
              : ((kd = 0), (Ad = t))
            : ((kd = 0), (Ad = null)),
          Df(0, !1));
      }
    }
    function uf(e, t) {
      (e.pooledCacheLanes &= t) === 0 &&
        ((t = e.pooledCache), t != null && ((e.pooledCache = null), Pa(t)));
    }
    function df() {
      return (
        Ed !== null && (Ed.skipTransition(), (Ed = null)),
        sf(),
        cf(),
        lf(),
        ff()
      );
    }
    function ff() {
      if (X !== 5) return !1;
      var e = bd,
        t = Cd;
      Cd = 0;
      var n = Et(Sd),
        r = w.T,
        i = T.p;
      try {
        ((T.p = 32 > n ? 32 : n), (w.T = null), (n = wd), (wd = null));
        var o = bd,
          s = Sd;
        if (((X = 0), (xd = bd = null), (Sd = 0), G & 6)) throw Error(a(331));
        var c = G;
        if (
          ((G |= 4),
          Xu(o.current),
          Hu(o, o.current, s, n),
          (G = c),
          Df(0, !1),
          it && typeof it.onPostCommitFiberRoot == `function`)
        )
          try {
            it.onPostCommitFiberRoot(rt, o);
          } catch {}
        return !0;
      } finally {
        ((T.p = i), (w.T = r), uf(e, t));
      }
    }
    function pf(e, t, n) {
      ((t = qi(n, t)),
        (t = Ac(e.stateNode, t, 2)),
        (e = yo(e, t, 2)),
        e !== null && (bt(e, 2), Ef(e)));
    }
    function Z(e, t, n) {
      if (e.tag === 3) pf(e, e, n);
      else
        for (; t !== null;) {
          if (t.tag === 3) {
            pf(t, e, n);
            break;
          }
          if (t.tag === 1) {
            var r = t.stateNode;
            if (
              typeof t.type.getDerivedStateFromError == `function` ||
              (typeof r.componentDidCatch == `function` &&
                (yd === null || !yd.has(r)))
            ) {
              ((e = qi(n, e)),
                (n = jc(2)),
                (r = yo(t, n, 2)),
                r !== null && (Mc(n, r, t, e), bt(r, 2), Ef(r)));
              break;
            }
          }
          t = t.return;
        }
    }
    function mf(e, t, n) {
      var r = e.pingCache;
      if (r === null) {
        r = e.pingCache = new ed();
        var i = new Set();
        r.set(t, i);
      } else ((i = r.get(t)), i === void 0 && ((i = new Set()), r.set(t, i)));
      i.has(n) ||
        ((id = !0), i.add(n), (e = hf.bind(null, e, t, n)), t.then(e, e));
    }
    function hf(e, t, n) {
      var r = e.pingCache;
      (r !== null && r.delete(t),
        (e.pingedLanes |= e.suspendedLanes & n),
        (e.warmLanes &= ~n),
        K === e &&
          (J & n) === n &&
          (od === 4 || (od === 3 && (J & 62914560) === J && 300 > Ye() - hd)
            ? G & 2
              ? (ld |= n)
              : Vd(e, 0)
            : (ld |= n),
          dd === J && (dd = 0)),
        Ef(e));
    }
    function gf(e, t) {
      (t === 0 && (t = vt()), (e = Mi(e, t)), e !== null && (bt(e, t), Ef(e)));
    }
    function _f(e) {
      var t = e.memoizedState,
        n = 0;
      (t !== null && (n = t.retryLane), gf(e, n));
    }
    function vf(e, t) {
      var n = 0;
      switch (e.tag) {
        case 31:
        case 13:
          var r = e.stateNode,
            i = e.memoizedState;
          i !== null && (n = i.retryLane);
          break;
        case 19:
          r = e.stateNode;
          break;
        case 22:
          r = e.stateNode._retryCache;
          break;
        default:
          throw Error(a(314));
      }
      (r !== null && r.delete(t), gf(e, n));
    }
    function yf(e, t) {
      return Ke(e, t);
    }
    var bf = null,
      xf = null,
      Sf = !1,
      Cf = !1,
      wf = !1,
      Tf = 0;
    function Ef(e) {
      (e !== xf &&
        e.next === null &&
        (xf === null ? (bf = xf = e) : (xf = xf.next = e)),
        (Cf = !0),
        Sf || ((Sf = !0), Nf()));
    }
    function Df(e, t) {
      if (!wf && Cf) {
        wf = !0;
        do
          for (var n = !1, r = bf; r !== null;) {
            if (!t) {
              if (e !== 0) {
                var i = r.pendingLanes;
                if (i === 0) var a = 0;
                else {
                  var o = r.suspendedLanes,
                    s = r.pingedLanes;
                  ((a = (1 << (31 - ot(42 | e) + 1)) - 1),
                    (a &= i & ~(o & ~s)),
                    (a = a & 201326741 ? (a & 201326741) | 1 : a ? a | 2 : 0));
                }
                a !== 0 && ((n = !0), Mf(r, a));
              } else
                ((a = J),
                  (a = mt(
                    r,
                    r === K ? a : 0,
                    r.cancelPendingCommit !== null || r.timeoutHandle !== -1,
                  )),
                  !(a & 3) || ht(r, a) || ((n = !0), Mf(r, a)));
            }
            r = r.next;
          }
        while (n);
        wf = !1;
      }
    }
    function Of() {
      kf();
    }
    function kf() {
      Cf = Sf = !1;
      var e = 0;
      Tf !== 0 && hp() && (e = Tf);
      for (var t = Ye(), n = null, r = bf; r !== null;) {
        var i = r.next,
          a = Af(r, t);
        (a === 0
          ? ((r.next = null),
            n === null ? (bf = i) : (n.next = i),
            i === null && (xf = n))
          : ((n = r), (e !== 0 || a & 3) && (Cf = !0)),
          (r = i));
      }
      ((X !== 0 && X !== 5) || Df(e, !1), Tf !== 0 && (Tf = 0));
    }
    function Af(e, t) {
      for (
        var n = e.suspendedLanes,
          r = e.pingedLanes,
          i = e.expirationTimes,
          a = e.pendingLanes & -62914561;
        0 < a;
      ) {
        var o = 31 - ot(a),
          s = 1 << o,
          c = i[o];
        (c === -1
          ? ((s & n) === 0 || (s & r) !== 0) && (i[o] = _t(s, t))
          : c <= t && (e.expiredLanes |= s),
          (a &= ~s));
      }
      if (
        ((t = K),
        (n = J),
        (n = mt(
          e,
          e === t ? n : 0,
          e.cancelPendingCommit !== null || e.timeoutHandle !== -1,
        )),
        (r = e.callbackNode),
        n === 0 ||
          (e === t && (Y === 2 || Y === 9)) ||
          e.cancelPendingCommit !== null)
      )
        return (
          r !== null && r !== null && qe(r),
          (e.callbackNode = null),
          (e.callbackPriority = 0)
        );
      if (!(n & 3) || ht(e, n)) {
        if (((t = n & -n), t === e.callbackPriority)) return t;
        switch ((r !== null && qe(r), Et(n))) {
          case 2:
          case 8:
            n = A;
            break;
          case 32:
            n = Qe;
            break;
          case 268435456:
            n = et;
            break;
          default:
            n = Qe;
        }
        return (
          (r = jf.bind(null, e)),
          (n = Ke(n, r)),
          (e.callbackPriority = t),
          (e.callbackNode = n),
          t
        );
      }
      return (
        r !== null && r !== null && qe(r),
        (e.callbackPriority = 2),
        (e.callbackNode = null),
        2
      );
    }
    function jf(e, t) {
      if (X !== 0 && X !== 5)
        return ((e.callbackNode = null), (e.callbackPriority = 0), null);
      var n = e.callbackNode;
      if (df() && e.callbackNode !== n) return null;
      var r = J;
      return (
        (r = mt(
          e,
          e === K ? r : 0,
          e.cancelPendingCommit !== null || e.timeoutHandle !== -1,
        )),
        r === 0
          ? null
          : (Fd(e, r, t),
            Af(e, Ye()),
            e.callbackNode != null && e.callbackNode === n
              ? jf.bind(null, e)
              : null)
      );
    }
    function Mf(e, t) {
      if (df()) return null;
      Fd(e, t, !0);
    }
    function Nf() {
      bp(function () {
        G & 6 ? Ke(Ze, Of) : kf();
      });
    }
    function Pf() {
      if (Tf === 0) {
        var e = Ba;
        (e === 0 && ((e = ut), (ut <<= 1), !(ut & 261888) && (ut = 256)),
          (Tf = e));
      }
      return Tf;
    }
    function Ff(e) {
      return e == null || typeof e == `symbol` || typeof e == `boolean`
        ? null
        : typeof e == `function`
          ? e
          : Cn(e);
    }
    function If(e, t, n, r, i) {
      if (t === `submit` && n && n.stateNode === i) {
        var a = Ff((i[jt] || null).action),
          o = r.submitter;
        o &&
          ((t = (t = o[jt] || null)
            ? Ff(t.formAction)
            : o.getAttribute(`formAction`)),
          t !== null && ((a = t), (o = null)));
        var s = new Gn(`action`, `action`, null, r, i);
        e.push({
          event: s,
          listeners: [
            {
              instance: null,
              listener: function () {
                if (r.defaultPrevented) {
                  if (Tf !== 0) {
                    var e = new FormData(i, o);
                    nc(
                      n,
                      { pending: !0, data: e, method: i.method, action: a },
                      null,
                      e,
                    );
                  }
                } else
                  typeof a == `function` &&
                    (s.preventDefault(),
                    (e = new FormData(i, o)),
                    nc(
                      n,
                      { pending: !0, data: e, method: i.method, action: a },
                      a,
                      e,
                    ));
              },
              currentTarget: i,
            },
          ],
        });
      }
    }
    for (var Lf = 0; Lf < yi.length; Lf++) {
      var Rf = yi[Lf];
      bi(Rf.toLowerCase(), `on` + (Rf[0].toUpperCase() + Rf.slice(1)));
    }
    (bi(di, `onAnimationEnd`),
      bi(fi, `onAnimationIteration`),
      bi(pi, `onAnimationStart`),
      bi(`dblclick`, `onDoubleClick`),
      bi(`focusin`, `onFocus`),
      bi(`focusout`, `onBlur`),
      bi(mi, `onTransitionRun`),
      bi(hi, `onTransitionStart`),
      bi(gi, `onTransitionCancel`),
      bi(_i, `onTransitionEnd`),
      Jt(`onMouseEnter`, [`mouseout`, `mouseover`]),
      Jt(`onMouseLeave`, [`mouseout`, `mouseover`]),
      Jt(`onPointerEnter`, [`pointerout`, `pointerover`]),
      Jt(`onPointerLeave`, [`pointerout`, `pointerover`]),
      qt(
        `onChange`,
        `change click focusin focusout input keydown keyup selectionchange`.split(
          ` `,
        ),
      ),
      qt(
        `onSelect`,
        `focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange`.split(
          ` `,
        ),
      ),
      qt(`onBeforeInput`, [`compositionend`, `keypress`, `textInput`, `paste`]),
      qt(
        `onCompositionEnd`,
        `compositionend focusout keydown keypress keyup mousedown`.split(` `),
      ),
      qt(
        `onCompositionStart`,
        `compositionstart focusout keydown keypress keyup mousedown`.split(` `),
      ),
      qt(
        `onCompositionUpdate`,
        `compositionupdate focusout keydown keypress keyup mousedown`.split(
          ` `,
        ),
      ));
    var zf =
        `abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting`.split(
          ` `,
        ),
      Bf = new Set(
        `beforetoggle cancel close invalid load scroll scrollend toggle`
          .split(` `)
          .concat(zf),
      );
    function Vf(e, t) {
      t = !!(t & 4);
      for (var n = 0; n < e.length; n++) {
        var r = e[n],
          i = r.event;
        r = r.listeners;
        a: {
          var a = void 0;
          if (t)
            for (var o = r.length - 1; 0 <= o; o--) {
              var s = r[o],
                c = s.instance,
                l = s.currentTarget;
              if (((s = s.listener), c !== a && i.isPropagationStopped()))
                break a;
              ((a = s), (i.currentTarget = l));
              try {
                a(i);
              } catch (e) {
                Ti(e);
              }
              ((i.currentTarget = null), (a = c));
            }
          else
            for (o = 0; o < r.length; o++) {
              if (
                ((s = r[o]),
                (c = s.instance),
                (l = s.currentTarget),
                (s = s.listener),
                c !== a && i.isPropagationStopped())
              )
                break a;
              ((a = s), (i.currentTarget = l));
              try {
                a(i);
              } catch (e) {
                Ti(e);
              }
              ((i.currentTarget = null), (a = c));
            }
        }
      }
    }
    function Q(e, t) {
      var n = t[Nt];
      n === void 0 && (n = t[Nt] = new Set());
      var r = e + `__bubble`;
      n.has(r) || (Gf(t, e, 2, !1), n.add(r));
    }
    function Hf(e, t, n) {
      var r = 0;
      (t && (r |= 4), Gf(n, e, r, t));
    }
    var Uf = `_reactListening` + Math.random().toString(36).slice(2);
    function Wf(e) {
      if (!e[Uf]) {
        ((e[Uf] = !0),
          Gt.forEach(function (t) {
            t !== `selectionchange` &&
              (Bf.has(t) || Hf(t, !1, e), Hf(t, !0, e));
          }));
        var t = e.nodeType === 9 ? e : e.ownerDocument;
        t === null || t[Uf] || ((t[Uf] = !0), Hf(`selectionchange`, !1, t));
      }
    }
    function Gf(e, t, n, r) {
      switch (Ch(t)) {
        case 2:
          var i = _h;
          break;
        case 8:
          i = vh;
          break;
        default:
          i = yh;
      }
      ((n = i.bind(null, t, n, e)),
        (i = void 0),
        !Pn ||
          (t !== `touchstart` && t !== `touchmove` && t !== `wheel`) ||
          (i = !0),
        r
          ? i === void 0
            ? e.addEventListener(t, n, !0)
            : e.addEventListener(t, n, { capture: !0, passive: i })
          : i === void 0
            ? e.addEventListener(t, n, !1)
            : e.addEventListener(t, n, { passive: i }));
    }
    function Kf(e, t, n, r, i) {
      var a = r;
      if (!(t & 1) && !(t & 2) && r !== null)
        a: for (;;) {
          if (r === null) return;
          var o = r.tag;
          if (o === 3 || o === 4) {
            var c = r.stateNode.containerInfo;
            if (c === i) break;
            if (o === 4)
              for (o = r.return; o !== null;) {
                var l = o.tag;
                if ((l === 3 || l === 4) && o.stateNode.containerInfo === i)
                  return;
                o = o.return;
              }
            for (; c !== null;) {
              if (((o = Bt(c)), o === null)) return;
              if (((l = o.tag), l === 5 || l === 6 || l === 26 || l === 27)) {
                r = a = o;
                continue a;
              }
              c = c.parentNode;
            }
          }
          r = r.return;
        }
      jn(function () {
        var r = a,
          i = En(n),
          o = [];
        a: {
          var c = vi.get(e);
          if (c !== void 0) {
            var l = Gn,
              u = e;
            switch (e) {
              case `keypress`:
                if (Bn(n) === 0) break a;
              case `keydown`:
              case `keyup`:
                l = cr;
                break;
              case `focusin`:
                ((u = `focus`), (l = $n));
                break;
              case `focusout`:
                ((u = `blur`), (l = $n));
                break;
              case `beforeblur`:
              case `afterblur`:
                l = $n;
                break;
              case `click`:
                if (n.button === 2) break a;
              case `auxclick`:
              case `dblclick`:
              case `mousedown`:
              case `mousemove`:
              case `mouseup`:
              case `mouseout`:
              case `mouseover`:
              case `contextmenu`:
                l = Zn;
                break;
              case `drag`:
              case `dragend`:
              case `dragenter`:
              case `dragexit`:
              case `dragleave`:
              case `dragover`:
              case `dragstart`:
              case `drop`:
                l = Qn;
                break;
              case `touchcancel`:
              case `touchend`:
              case `touchmove`:
              case `touchstart`:
                l = dr;
                break;
              case di:
              case fi:
              case pi:
                l = er;
                break;
              case _i:
                l = fr;
                break;
              case `scroll`:
              case `scrollend`:
                l = qn;
                break;
              case `wheel`:
                l = pr;
                break;
              case `copy`:
              case `cut`:
              case `paste`:
                l = tr;
                break;
              case `gotpointercapture`:
              case `lostpointercapture`:
              case `pointercancel`:
              case `pointerdown`:
              case `pointermove`:
              case `pointerout`:
              case `pointerover`:
              case `pointerup`:
                l = lr;
                break;
              case `submit`:
                l = ur;
                break;
              case `toggle`:
              case `beforetoggle`:
                l = mr;
            }
            var d = !!(t & 4),
              f = !d && (e === `scroll` || e === `scrollend`),
              p = d ? (c === null ? null : c + `Capture`) : c;
            d = [];
            for (var m = r, h; m !== null;) {
              var g = m;
              if (
                ((h = g.stateNode),
                (g = g.tag),
                (g !== 5 && g !== 26 && g !== 27) ||
                  h === null ||
                  p === null ||
                  ((g = Mn(m, p)), g != null && d.push(qf(m, g, h))),
                f)
              )
                break;
              m = m.return;
            }
            0 < d.length &&
              ((c = new l(c, u, null, n, i)),
              o.push({ event: c, listeners: d }));
          }
        }
        if (!(t & 7)) {
          a: {
            if (
              ((l = e === `mouseover` || e === `pointerover`),
              (c = e === `mouseout` || e === `pointerout`),
              l &&
                n !== Tn &&
                (u = n.relatedTarget || n.fromElement) &&
                (Bt(u) || u[Mt]))
            )
              break a;
            (c || l) &&
              ((u =
                i.window === i
                  ? i
                  : (l = i.ownerDocument)
                    ? l.defaultView || l.parentWindow
                    : window),
              c
                ? ((l = n.relatedTarget || n.toElement),
                  (c = r),
                  (l = l ? Bt(l) : null),
                  l !== null &&
                    ((f = s(l)),
                    (d = l.tag),
                    l !== f || (d !== 5 && d !== 27 && d !== 6)) &&
                    (l = null))
                : ((c = null), (l = r)),
              c !== l &&
                ((d = Zn),
                (g = `onMouseLeave`),
                (p = `onMouseEnter`),
                (m = `mouse`),
                (e === `pointerout` || e === `pointerover`) &&
                  ((d = lr),
                  (g = `onPointerLeave`),
                  (p = `onPointerEnter`),
                  (m = `pointer`)),
                (f = c == null ? u : j(c)),
                (h = l == null ? u : j(l)),
                (u = new d(g, m + `leave`, c, n, i)),
                (u.target = f),
                (u.relatedTarget = h),
                (g = null),
                Bt(i) === r &&
                  ((d = new d(p, m + `enter`, l, n, i)),
                  (d.target = h),
                  (d.relatedTarget = f),
                  (g = d)),
                (f = g),
                (d = c && l ? re(c, l, Yf) : null),
                c !== null && Xf(o, u, c, d, !1),
                l !== null && f !== null && Xf(o, f, l, d, !0)));
          }
          a: {
            if (
              ((c = r ? j(r) : window),
              (l = c.nodeName && c.nodeName.toLowerCase()),
              l === `select` || (l === `input` && c.type === `file`))
            )
              var _ = Pr;
            else if (Or(c)) {
              if (Fr) _ = Wr;
              else {
                _ = Hr;
                var v = Vr;
              }
            } else
              ((l = c.nodeName),
                !l ||
                l.toLowerCase() !== `input` ||
                (c.type !== `checkbox` && c.type !== `radio`)
                  ? r && bn(r.elementType) && (_ = Pr)
                  : (_ = Ur));
            if ((_ &&= _(e, r))) {
              kr(o, _, n, i);
              break a;
            }
            v && v(e, c, r);
          }
          switch (((v = r ? j(r) : window), e)) {
            case `focusin`:
              (Or(v) || v.contentEditable === `true`) &&
                ((ti = v), (ni = r), (ri = null));
              break;
            case `focusout`:
              ri = ni = ti = null;
              break;
            case `mousedown`:
              ii = !0;
              break;
            case `contextmenu`:
            case `mouseup`:
            case `dragend`:
              ((ii = !1), ai(o, n, i));
              break;
            case `selectionchange`:
              if (ei) break;
            case `keydown`:
            case `keyup`:
              ai(o, n, i);
          }
          var y;
          if (gr)
            b: {
              switch (e) {
                case `compositionstart`:
                  var b = `onCompositionStart`;
                  break b;
                case `compositionend`:
                  b = `onCompositionEnd`;
                  break b;
                case `compositionupdate`:
                  b = `onCompositionUpdate`;
                  break b;
              }
              b = void 0;
            }
          else
            wr
              ? Sr(e, n) && (b = `onCompositionEnd`)
              : e === `keydown` &&
                n.keyCode === 229 &&
                (b = `onCompositionStart`);
          (b &&
            (yr &&
              n.locale !== `ko` &&
              (wr || b !== `onCompositionStart`
                ? b === `onCompositionEnd` && wr && (y = zn())
                : ((In = i),
                  (Ln = `value` in In ? In.value : In.textContent),
                  (wr = !0))),
            (v = Jf(r, b)),
            0 < v.length &&
              ((b = new nr(b, e, null, n, i)),
              o.push({ event: b, listeners: v }),
              y ? (b.data = y) : ((y = Cr(n)), y !== null && (b.data = y)))),
            (y = vr ? Tr(e, n) : Er(e, n)) &&
              ((b = Jf(r, `onBeforeInput`)),
              0 < b.length &&
                ((v = new nr(`onBeforeInput`, `beforeinput`, null, n, i)),
                o.push({ event: v, listeners: b }),
                (v.data = y))),
            If(o, e, r, n, i));
        }
        Vf(o, t);
      });
    }
    function qf(e, t, n) {
      return { instance: e, listener: t, currentTarget: n };
    }
    function Jf(e, t) {
      for (var n = t + `Capture`, r = []; e !== null;) {
        var i = e,
          a = i.stateNode;
        if (
          ((i = i.tag),
          (i !== 5 && i !== 26 && i !== 27) ||
            a === null ||
            ((i = Mn(e, n)),
            i != null && r.unshift(qf(e, i, a)),
            (i = Mn(e, t)),
            i != null && r.push(qf(e, i, a))),
          e.tag === 3)
        )
          return r;
        e = e.return;
      }
      return [];
    }
    function Yf(e) {
      if (e === null) return null;
      do e = e.return;
      while (e && e.tag !== 5 && e.tag !== 27);
      return e || null;
    }
    function Xf(e, t, n, r, i) {
      for (var a = t._reactName, o = []; n !== null && n !== r;) {
        var s = n,
          c = s.alternate,
          l = s.stateNode;
        if (((s = s.tag), c !== null && c === r)) break;
        ((s !== 5 && s !== 26 && s !== 27) ||
          l === null ||
          ((c = l),
          i
            ? ((l = Mn(n, a)), l != null && o.unshift(qf(n, l, c)))
            : i || ((l = Mn(n, a)), l != null && o.push(qf(n, l, c)))),
          (n = n.return));
      }
      o.length !== 0 && e.push({ event: t, listeners: o });
    }
    var Zf = /\r\n?/g,
      Qf = /\u0000|\uFFFD/g;
    function $f(e) {
      return (typeof e == `string` ? e : `` + e)
        .replace(
          Zf,
          `
`,
        )
        .replace(Qf, ``);
    }
    function ep(e, t) {
      return ((t = $f(t)), $f(e) === t);
    }
    function $(e, t, n, r, i, o) {
      switch (n) {
        case `children`:
          if (typeof r == `string`)
            t === `body` || (t === `textarea` && r === ``) || gn(e, r);
          else if (typeof r == `number` || typeof r == `bigint`)
            t !== `body` && gn(e, `` + r);
          else return;
          break;
        case `className`:
          tn(e, `class`, r);
          break;
        case `tabIndex`:
          tn(e, `tabindex`, r);
          break;
        case `dir`:
        case `role`:
        case `viewBox`:
        case `width`:
        case `height`:
          tn(e, n, r);
          break;
        case `style`:
          yn(e, r, o);
          return;
        case `data`:
          if (t !== `object`) {
            tn(e, `data`, r);
            break;
          }
        case `src`:
        case `href`:
          if (
            (r === `` && (t !== `a` || n !== `href`)) ||
            r == null ||
            typeof r == `function` ||
            typeof r == `symbol` ||
            typeof r == `boolean`
          ) {
            e.removeAttribute(n);
            break;
          }
          ((r = Cn(r)), e.setAttribute(n, r));
          break;
        case `action`:
        case `formAction`:
          if (typeof r == `function`) {
            e.setAttribute(
              n,
              `javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')`,
            );
            break;
          }
          if (
            (typeof o == `function` &&
              (n === `formAction`
                ? (t !== `input` && $(e, t, `name`, i.name, i, null),
                  $(e, t, `formEncType`, i.formEncType, i, null),
                  $(e, t, `formMethod`, i.formMethod, i, null),
                  $(e, t, `formTarget`, i.formTarget, i, null))
                : ($(e, t, `encType`, i.encType, i, null),
                  $(e, t, `method`, i.method, i, null),
                  $(e, t, `target`, i.target, i, null))),
            r == null || typeof r == `symbol` || typeof r == `boolean`)
          ) {
            e.removeAttribute(n);
            break;
          }
          ((r = Cn(r)), e.setAttribute(n, r));
          break;
        case `onClick`:
          r != null && (e.onclick = wn);
          return;
        case `onScroll`:
          r != null && Q(`scroll`, e);
          return;
        case `onScrollEnd`:
          r != null && Q(`scrollend`, e);
          return;
        case `dangerouslySetInnerHTML`:
          if (r != null) {
            if (typeof r != `object` || !(`__html` in r)) throw Error(a(61));
            if (((n = r.__html), n != null)) {
              if (i.children != null) throw Error(a(60));
              o?.__html !== n && (e.innerHTML = n);
            }
          }
          break;
        case `multiple`:
          e.multiple = r && typeof r != `function` && typeof r != `symbol`;
          break;
        case `muted`:
          e.muted = r && typeof r != `function` && typeof r != `symbol`;
          break;
        case `suppressContentEditableWarning`:
        case `suppressHydrationWarning`:
        case `defaultValue`:
        case `defaultChecked`:
        case `innerHTML`:
        case `ref`:
          break;
        case `autoFocus`:
          break;
        case `xlinkHref`:
          if (
            r == null ||
            typeof r == `function` ||
            typeof r == `boolean` ||
            typeof r == `symbol`
          ) {
            e.removeAttribute(`xlink:href`);
            break;
          }
          ((n = Cn(r)),
            e.setAttributeNS(`http://www.w3.org/1999/xlink`, `xlink:href`, n));
          break;
        case `contentEditable`:
        case `spellCheck`:
        case `draggable`:
        case `value`:
        case `autoReverse`:
        case `externalResourcesRequired`:
        case `focusable`:
        case `preserveAlpha`:
          r != null && typeof r != `function` && typeof r != `symbol`
            ? e.setAttribute(n, r)
            : e.removeAttribute(n);
          break;
        case `inert`:
        case `allowFullScreen`:
        case `async`:
        case `autoPlay`:
        case `controls`:
        case `credentialless`:
        case `default`:
        case `defer`:
        case `disabled`:
        case `disablePictureInPicture`:
        case `disableRemotePlayback`:
        case `formNoValidate`:
        case `hidden`:
        case `loop`:
        case `noModule`:
        case `noValidate`:
        case `open`:
        case `playsInline`:
        case `readOnly`:
        case `required`:
        case `reversed`:
        case `scoped`:
        case `seamless`:
        case `itemScope`:
          r && typeof r != `function` && typeof r != `symbol`
            ? e.setAttribute(n, ``)
            : e.removeAttribute(n);
          break;
        case `capture`:
        case `download`:
          !0 === r
            ? e.setAttribute(n, ``)
            : !1 !== r &&
                r != null &&
                typeof r != `function` &&
                typeof r != `symbol`
              ? e.setAttribute(n, r)
              : e.removeAttribute(n);
          break;
        case `cols`:
        case `rows`:
        case `size`:
        case `span`:
          r != null &&
          typeof r != `function` &&
          typeof r != `symbol` &&
          !isNaN(r) &&
          1 <= r
            ? e.setAttribute(n, r)
            : e.removeAttribute(n);
          break;
        case `rowSpan`:
        case `start`:
          r == null ||
          typeof r == `function` ||
          typeof r == `symbol` ||
          isNaN(r)
            ? e.removeAttribute(n)
            : e.setAttribute(n, r);
          break;
        case `popover`:
          (Q(`beforetoggle`, e), Q(`toggle`, e), en(e, `popover`, r));
          break;
        case `xlinkActuate`:
          nn(e, `http://www.w3.org/1999/xlink`, `xlink:actuate`, r);
          break;
        case `xlinkArcrole`:
          nn(e, `http://www.w3.org/1999/xlink`, `xlink:arcrole`, r);
          break;
        case `xlinkRole`:
          nn(e, `http://www.w3.org/1999/xlink`, `xlink:role`, r);
          break;
        case `xlinkShow`:
          nn(e, `http://www.w3.org/1999/xlink`, `xlink:show`, r);
          break;
        case `xlinkTitle`:
          nn(e, `http://www.w3.org/1999/xlink`, `xlink:title`, r);
          break;
        case `xlinkType`:
          nn(e, `http://www.w3.org/1999/xlink`, `xlink:type`, r);
          break;
        case `xmlBase`:
          nn(e, `http://www.w3.org/XML/1998/namespace`, `xml:base`, r);
          break;
        case `xmlLang`:
          nn(e, `http://www.w3.org/XML/1998/namespace`, `xml:lang`, r);
          break;
        case `xmlSpace`:
          nn(e, `http://www.w3.org/XML/1998/namespace`, `xml:space`, r);
          break;
        case `is`:
          en(e, `is`, r);
          break;
        case `innerText`:
        case `textContent`:
          return;
        default:
          if (
            !(2 < n.length) ||
            (n[0] !== `o` && n[0] !== `O`) ||
            (n[1] !== `n` && n[1] !== `N`)
          )
            ((n = xn.get(n) || n), en(e, n, r));
          else return;
      }
      M = !0;
    }
    function tp(e, t, n, r, i, o) {
      switch (n) {
        case `style`:
          yn(e, r, o);
          return;
        case `dangerouslySetInnerHTML`:
          if (r != null) {
            if (typeof r != `object` || !(`__html` in r)) throw Error(a(61));
            if (((n = r.__html), n != null)) {
              if (i.children != null) throw Error(a(60));
              o?.__html !== n && (e.innerHTML = n);
            }
          }
          break;
        case `children`:
          if (typeof r == `string`) gn(e, r);
          else if (typeof r == `number` || typeof r == `bigint`) gn(e, `` + r);
          else return;
          break;
        case `onScroll`:
          r != null && Q(`scroll`, e);
          return;
        case `onScrollEnd`:
          r != null && Q(`scrollend`, e);
          return;
        case `onClick`:
          r != null && (e.onclick = wn);
          return;
        case `suppressContentEditableWarning`:
        case `suppressHydrationWarning`:
        case `innerHTML`:
        case `ref`:
          return;
        case `innerText`:
        case `textContent`:
          return;
        default:
          if (!Kt.hasOwnProperty(n))
            a: {
              if (
                n[0] === `o` &&
                n[1] === `n` &&
                ((i = n.endsWith(`Capture`)),
                (o = n.slice(2, i ? n.length - 7 : void 0)),
                (t = e[jt] || null),
                (t = t == null ? null : t[n]),
                typeof t == `function` && e.removeEventListener(o, t, i),
                typeof r == `function`)
              ) {
                (typeof t != `function` &&
                  t !== null &&
                  (n in e
                    ? (e[n] = null)
                    : e.hasAttribute(n) && e.removeAttribute(n)),
                  e.addEventListener(o, r, i));
                break a;
              }
              ((M = !0),
                n in e
                  ? (e[n] = r)
                  : !0 === r
                    ? e.setAttribute(n, ``)
                    : en(e, n, r));
            }
          return;
      }
      M = !0;
    }
    function np(e, t, n) {
      switch (t) {
        case `div`:
        case `span`:
        case `svg`:
        case `path`:
        case `a`:
        case `g`:
        case `p`:
        case `li`:
          break;
        case `img`:
          (Q(`error`, e), Q(`load`, e));
          var r = !1,
            i = !1,
            o;
          for (o in n)
            if (n.hasOwnProperty(o)) {
              var s = n[o];
              if (s != null)
                switch (o) {
                  case `src`:
                    r = !0;
                    break;
                  case `srcSet`:
                    i = !0;
                    break;
                  case `children`:
                  case `dangerouslySetInnerHTML`:
                    throw Error(a(137, t));
                  default:
                    $(e, t, o, s, n, null);
                }
            }
          (i && $(e, t, `srcSet`, n.srcSet, n, null),
            r && $(e, t, `src`, n.src, n, null));
          return;
        case `input`:
          Q(`invalid`, e);
          var c = (o = s = i = null),
            l = null,
            u = null;
          for (r in n)
            if (n.hasOwnProperty(r)) {
              var d = n[r];
              if (d != null)
                switch (r) {
                  case `name`:
                    i = d;
                    break;
                  case `type`:
                    s = d;
                    break;
                  case `checked`:
                    l = d;
                    break;
                  case `defaultChecked`:
                    u = d;
                    break;
                  case `value`:
                    o = d;
                    break;
                  case `defaultValue`:
                    c = d;
                    break;
                  case `children`:
                  case `dangerouslySetInnerHTML`:
                    if (d != null) throw Error(a(137, t));
                    break;
                  default:
                    $(e, t, r, d, n, null);
                }
            }
          dn(e, o, c, l, u, s, i, !1);
          return;
        case `select`:
          for (i in (Q(`invalid`, e), (r = s = o = null), n))
            if (n.hasOwnProperty(i) && ((c = n[i]), c != null))
              switch (i) {
                case `value`:
                  o = c;
                  break;
                case `defaultValue`:
                  s = c;
                  break;
                case `multiple`:
                  r = c;
                default:
                  $(e, t, i, c, n, null);
              }
          ((t = o),
            (n = s),
            (e.multiple = !!r),
            t == null ? n != null && pn(e, !!r, n, !0) : pn(e, !!r, t, !1));
          return;
        case `textarea`:
          for (s in (Q(`invalid`, e), (o = i = r = null), n))
            if (n.hasOwnProperty(s) && ((c = n[s]), c != null))
              switch (s) {
                case `value`:
                  r = c;
                  break;
                case `defaultValue`:
                  i = c;
                  break;
                case `children`:
                  o = c;
                  break;
                case `dangerouslySetInnerHTML`:
                  if (c != null) throw Error(a(91));
                  break;
                default:
                  $(e, t, s, c, n, null);
              }
          hn(e, r, i, o);
          return;
        case `option`:
          for (l in n)
            if (n.hasOwnProperty(l) && ((r = n[l]), r != null))
              switch (l) {
                case `selected`:
                  e.selected =
                    r && typeof r != `function` && typeof r != `symbol`;
                  break;
                default:
                  $(e, t, l, r, n, null);
              }
          return;
        case `dialog`:
          (Q(`beforetoggle`, e), Q(`toggle`, e), Q(`cancel`, e), Q(`close`, e));
          break;
        case `iframe`:
        case `object`:
          Q(`load`, e);
          break;
        case `video`:
        case `audio`:
          for (r = 0; r < zf.length; r++) Q(zf[r], e);
          break;
        case `image`:
          (Q(`error`, e), Q(`load`, e));
          break;
        case `details`:
          Q(`toggle`, e);
          break;
        case `embed`:
        case `source`:
        case `link`:
          (Q(`error`, e), Q(`load`, e));
        case `area`:
        case `base`:
        case `br`:
        case `col`:
        case `hr`:
        case `keygen`:
        case `meta`:
        case `param`:
        case `track`:
        case `wbr`:
        case `menuitem`:
          for (u in n)
            if (n.hasOwnProperty(u) && ((r = n[u]), r != null))
              switch (u) {
                case `children`:
                case `dangerouslySetInnerHTML`:
                  throw Error(a(137, t));
                default:
                  $(e, t, u, r, n, null);
              }
          return;
        default:
          if (bn(t)) {
            for (d in n)
              n.hasOwnProperty(d) &&
                ((r = n[d]), r !== void 0 && tp(e, t, d, r, n, void 0));
            return;
          }
      }
      for (c in n)
        n.hasOwnProperty(c) &&
          ((r = n[c]), r != null && $(e, t, c, r, n, null));
    }
    var rp = {};
    function ip(e, t, n, r) {
      switch (t) {
        case `div`:
        case `span`:
        case `svg`:
        case `path`:
        case `a`:
        case `g`:
        case `p`:
        case `li`:
          break;
        case `input`:
          var i = null,
            o = null,
            s = null,
            c = null,
            l = null,
            u = null,
            d = null;
          for (m in n) {
            var f = n[m];
            if (n.hasOwnProperty(m) && f != null)
              switch (m) {
                case `checked`:
                  break;
                case `value`:
                  break;
                case `defaultValue`:
                  l = f;
                default:
                  r.hasOwnProperty(m) || $(e, t, m, null, r, f);
              }
          }
          for (var p in r) {
            var m = r[p];
            if (((f = n[p]), r.hasOwnProperty(p) && (m != null || f != null)))
              switch (p) {
                case `type`:
                  (m !== f && (M = !0), (o = m));
                  break;
                case `name`:
                  (m !== f && (M = !0), (i = m));
                  break;
                case `checked`:
                  (m !== f && (M = !0), (u = m));
                  break;
                case `defaultChecked`:
                  (m !== f && (M = !0), (d = m));
                  break;
                case `value`:
                  (m !== f && (M = !0), (s = m));
                  break;
                case `defaultValue`:
                  (m !== f && (M = !0), (c = m));
                  break;
                case `children`:
                case `dangerouslySetInnerHTML`:
                  if (m != null) throw Error(a(137, t));
                  break;
                default:
                  m !== f && $(e, t, p, m, r, f);
              }
          }
          un(e, s, c, l, u, d, o, i);
          return;
        case `select`:
          for (o in ((m = s = c = p = null), n))
            if (((l = n[o]), n.hasOwnProperty(o) && l != null))
              switch (o) {
                case `value`:
                  break;
                case `multiple`:
                  m = l;
                default:
                  r.hasOwnProperty(o) || $(e, t, o, null, r, l);
              }
          for (i in r)
            if (
              ((o = r[i]),
              (l = n[i]),
              r.hasOwnProperty(i) && (o != null || l != null))
            )
              switch (i) {
                case `value`:
                  (o !== l && (M = !0), (p = o));
                  break;
                case `defaultValue`:
                  (o !== l && (M = !0), (c = o));
                  break;
                case `multiple`:
                  (o !== l && (M = !0), (s = o));
                default:
                  o !== l && $(e, t, i, o, r, l);
              }
          ((t = c),
            (n = s),
            (r = m),
            p == null
              ? !!r != !!n &&
                (t == null ? pn(e, !!n, n ? [] : ``, !1) : pn(e, !!n, t, !0))
              : pn(e, !!n, p, !1));
          return;
        case `textarea`:
          for (c in ((m = p = null), n))
            if (
              ((i = n[c]),
              n.hasOwnProperty(c) && i != null && !r.hasOwnProperty(c))
            )
              switch (c) {
                case `value`:
                  break;
                case `children`:
                  break;
                default:
                  $(e, t, c, null, r, i);
              }
          for (s in r)
            if (
              ((i = r[s]),
              (o = n[s]),
              r.hasOwnProperty(s) && (i != null || o != null))
            )
              switch (s) {
                case `value`:
                  (i !== o && (M = !0), (p = i));
                  break;
                case `defaultValue`:
                  (i !== o && (M = !0), (m = i));
                  break;
                case `children`:
                  break;
                case `dangerouslySetInnerHTML`:
                  if (i != null) throw Error(a(91));
                  break;
                default:
                  i !== o && $(e, t, s, i, r, o);
              }
          mn(e, p, m);
          return;
        case `option`:
          for (var h in n)
            if (
              ((p = n[h]),
              n.hasOwnProperty(h) && p != null && !r.hasOwnProperty(h))
            )
              switch (h) {
                case `selected`:
                  e.selected = !1;
                  break;
                default:
                  $(e, t, h, null, r, p);
              }
          for (l in r)
            if (
              ((p = r[l]),
              (m = n[l]),
              r.hasOwnProperty(l) && p !== m && (p != null || m != null))
            )
              switch (l) {
                case `selected`:
                  (p !== m && (M = !0),
                    (e.selected =
                      p && typeof p != `function` && typeof p != `symbol`));
                  break;
                default:
                  $(e, t, l, p, r, m);
              }
          return;
        case `img`:
        case `link`:
        case `area`:
        case `base`:
        case `br`:
        case `col`:
        case `embed`:
        case `hr`:
        case `keygen`:
        case `meta`:
        case `param`:
        case `source`:
        case `track`:
        case `wbr`:
        case `menuitem`:
          for (var g in n)
            ((p = n[g]),
              n.hasOwnProperty(g) &&
                p != null &&
                !r.hasOwnProperty(g) &&
                $(e, t, g, null, r, p));
          for (u in r)
            if (
              ((p = r[u]),
              (m = n[u]),
              r.hasOwnProperty(u) && p !== m && (p != null || m != null))
            )
              switch (u) {
                case `children`:
                case `dangerouslySetInnerHTML`:
                  if (p != null) throw Error(a(137, t));
                  break;
                default:
                  $(e, t, u, p, r, m);
              }
          return;
        default:
          if (bn(t)) {
            for (var _ in n)
              ((p = n[_]),
                n.hasOwnProperty(_) &&
                  p !== void 0 &&
                  !r.hasOwnProperty(_) &&
                  tp(e, t, _, void 0, r, p));
            for (d in r)
              ((p = r[d]),
                (m = n[d]),
                !r.hasOwnProperty(d) ||
                  p === m ||
                  (p === void 0 && m === void 0) ||
                  tp(e, t, d, p, r, m));
            return;
          }
      }
      for (var v in n)
        ((p = n[v]),
          n.hasOwnProperty(v) &&
            p != null &&
            !r.hasOwnProperty(v) &&
            $(e, t, v, null, r, p));
      for (f in r)
        ((p = r[f]),
          (m = n[f]),
          !r.hasOwnProperty(f) ||
            p === m ||
            (p == null && m == null) ||
            $(e, t, f, p, r, m));
    }
    function ap(e) {
      switch (e) {
        case `css`:
        case `script`:
        case `font`:
        case `img`:
        case `image`:
        case `input`:
        case `link`:
          return !0;
        default:
          return !1;
      }
    }
    function op() {
      if (typeof performance.getEntriesByType == `function`) {
        for (
          var e = 0, t = 0, n = performance.getEntriesByType(`resource`), r = 0;
          r < n.length;
          r++
        ) {
          var i = n[r],
            a = i.transferSize,
            o = i.initiatorType,
            s = i.duration;
          if (a && s && ap(o)) {
            for (o = 0, s = i.responseEnd, r += 1; r < n.length; r++) {
              var c = n[r],
                l = c.startTime;
              if (l > s) break;
              var u = c.transferSize,
                d = c.initiatorType;
              u &&
                ap(d) &&
                ((c = c.responseEnd),
                (o += u * (c < s ? 1 : (s - l) / (c - l))));
            }
            if ((--r, (t += (8 * (a + o)) / (i.duration / 1e3)), e++, 10 < e))
              break;
          }
        }
        if (0 < e) return t / e / 1e6;
      }
      return navigator.connection &&
        ((e = navigator.connection.downlink), typeof e == `number`)
        ? e
        : 5;
    }
    var sp = null,
      cp = null;
    function lp(e) {
      return e.nodeType === 9 ? e : e.ownerDocument;
    }
    function up(e) {
      switch (e) {
        case `http://www.w3.org/2000/svg`:
          return 1;
        case `http://www.w3.org/1998/Math/MathML`:
          return 2;
        default:
          return 0;
      }
    }
    function dp(e, t) {
      if (e === 0)
        switch (t) {
          case `svg`:
            return 1;
          case `math`:
            return 2;
          default:
            return 0;
        }
      return e === 1 && t === `foreignObject` ? 0 : e;
    }
    function fp(e, t, n, r) {
      return (
        (n = lp(n).createElement(e)),
        (n[At] = r),
        (n[jt] = t),
        np(n, e, t),
        Ut(n),
        n
      );
    }
    function pp(e, t) {
      return (
        e === `textarea` ||
        e === `noscript` ||
        typeof t.children == `string` ||
        typeof t.children == `number` ||
        typeof t.children == `bigint` ||
        (typeof t.dangerouslySetInnerHTML == `object` &&
          t.dangerouslySetInnerHTML !== null &&
          t.dangerouslySetInnerHTML.__html != null)
      );
    }
    var mp = null;
    function hp() {
      var e = window.event;
      return e && e.type === `popstate`
        ? e !== mp && ((mp = e), !0)
        : ((mp = null), !1);
    }
    var gp = typeof setTimeout == `function` ? setTimeout : void 0,
      _p = typeof clearTimeout == `function` ? clearTimeout : void 0,
      vp = typeof Promise == `function` ? Promise : void 0,
      yp =
        typeof requestAnimationFrame == `function` ? requestAnimationFrame : gp,
      bp =
        typeof queueMicrotask == `function`
          ? queueMicrotask
          : vp === void 0
            ? gp
            : function (e) {
                return vp.resolve(null).then(e).catch(xp);
              };
    function xp(e) {
      setTimeout(function () {
        throw e;
      });
    }
    function Sp(e) {
      return e === `head`;
    }
    function Cp(e, t) {
      var n = t,
        r = 0;
      do {
        var i = n.nextSibling;
        if ((e.removeChild(n), i && i.nodeType === 8)) {
          if (((n = i.data), n === `/$` || n === `/&`)) {
            if (r === 0) {
              (e.removeChild(i), Hh(t));
              return;
            }
            r--;
          } else if (
            n === `$` ||
            n === `$?` ||
            n === `$~` ||
            n === `$!` ||
            n === `&`
          )
            r++;
          else if (n === `html`) _m(e.ownerDocument.documentElement);
          else if (n === `head`) {
            ((n = e.ownerDocument.head), _m(n));
            for (var a = n.firstChild; a;) {
              var o = a.nextSibling,
                s = a.nodeName;
              (a[Lt] ||
                s === `SCRIPT` ||
                s === `STYLE` ||
                (s === `LINK` && a.rel.toLowerCase() === `stylesheet`) ||
                n.removeChild(a),
                (a = o));
            }
          } else n === `body` && _m(e.ownerDocument.body);
        }
        n = i;
      } while (n);
      Hh(t);
    }
    function wp(e, t) {
      var n = e;
      e = 0;
      do {
        var r = n.nextSibling;
        if (
          (n.nodeType === 1
            ? t
              ? ((n._stashedDisplay = n.style.display),
                (n.style.display = `none`))
              : ((n.style.display = n._stashedDisplay || ``),
                n.getAttribute(`style`) === `` && n.removeAttribute(`style`))
            : n.nodeType === 3 &&
              (t
                ? ((n._stashedText = n.nodeValue), (n.nodeValue = ``))
                : (n.nodeValue = n._stashedText || ``)),
          r && r.nodeType === 8)
        ) {
          if (((n = r.data), n === `/$`)) {
            if (e === 0) break;
            e--;
          } else (n !== `$` && n !== `$?` && n !== `$~` && n !== `$!`) || e++;
        }
        n = r;
      } while (n);
    }
    function Tp(e, t, n) {
      if (
        ((t = CSS.escape(t) === t ? t : `r-` + btoa(t).replace(/=/g, ``)),
        (e.style.viewTransitionName = t),
        n != null && (e.style.viewTransitionClass = n),
        (n = getComputedStyle(e)),
        n.display === `inline`)
      ) {
        if (((t = e.getClientRects()), t.length === 1)) var r = 1;
        else
          for (var i = (r = 0); i < t.length; i++) {
            var a = t[i];
            0 < a.width && 0 < a.height && r++;
          }
        r === 1 &&
          ((e = e.style),
          (e.display = t.length === 1 ? `inline-block` : `block`),
          (e.marginTop = `-` + n.paddingTop),
          (e.marginBottom = `-` + n.paddingBottom));
      }
    }
    function Ep(e, t) {
      ((e = e.style), (t = t.style));
      var n =
        t == null
          ? null
          : t.hasOwnProperty(`viewTransitionName`)
            ? t.viewTransitionName
            : t.hasOwnProperty(`view-transition-name`)
              ? t[`view-transition-name`]
              : null;
      ((e.viewTransitionName =
        n == null || typeof n == `boolean` ? `` : (`` + n).trim()),
        (n =
          t == null
            ? null
            : t.hasOwnProperty(`viewTransitionClass`)
              ? t.viewTransitionClass
              : t.hasOwnProperty(`view-transition-class`)
                ? t[`view-transition-class`]
                : null),
        (e.viewTransitionClass =
          n == null || typeof n == `boolean` ? `` : (`` + n).trim()),
        e.display === `inline-block` &&
          (t == null
            ? (e.display = e.margin = ``)
            : ((n = t.display),
              (e.display = n == null || typeof n == `boolean` ? `` : n),
              (n = t.margin),
              n == null
                ? ((n = t.hasOwnProperty(`marginTop`)
                    ? t.marginTop
                    : t[`margin-top`]),
                  (e.marginTop = n == null || typeof n == `boolean` ? `` : n),
                  (t = t.hasOwnProperty(`marginBottom`)
                    ? t.marginBottom
                    : t[`margin-bottom`]),
                  (e.marginBottom =
                    t == null || typeof t == `boolean` ? `` : t))
                : (e.margin = n))));
    }
    function Dp(e, t, n) {
      return (
        (n = n.ownerDocument.defaultView),
        {
          rect: e,
          abs: t.position === `absolute` || t.position === `fixed`,
          clip:
            t.clipPath !== `none` ||
            t.overflow !== `visible` ||
            t.filter !== `none` ||
            t.mask !== `none` ||
            t.mask !== `none` ||
            t.borderRadius !== `0px`,
          view:
            0 <= e.bottom &&
            0 <= e.right &&
            e.top <= n.innerHeight &&
            e.left <= n.innerWidth,
        }
      );
    }
    function Op(e) {
      return Dp(e.getBoundingClientRect(), getComputedStyle(e), e);
    }
    function kp(e) {
      var t = e.getBoundingClientRect();
      t = new DOMRect(t.x + 2e4, t.y + 2e4, t.width, t.height);
      var n = getComputedStyle(e);
      return Dp(t, n, e);
    }
    function Ap(e) {
      return e.documentElement.clientHeight;
    }
    function jp(e) {
      (this.addEventListener(`load`, e), this.addEventListener(`error`, e));
    }
    function Mp(e, t, n, r, i, a, o, s, c) {
      var l = t.nodeType === 9 ? t : t.ownerDocument;
      try {
        var u = l.startViewTransition({
          update: function () {
            var t = l.defaultView,
              n = t.navigation && t.navigation.transition,
              o = l.fonts.status;
            r();
            var s = [];
            if (
              (o === `loaded` &&
                (Ap(l), l.fonts.status === `loading` && s.push(l.fonts.ready)),
              (o = s.length),
              e !== null)
            )
              for (var c = e.suspenseyImages, u = 0, d = 0; d < c.length; d++) {
                var f = c[d];
                if (!f.complete) {
                  var p = f.getBoundingClientRect();
                  if (
                    0 < p.bottom &&
                    0 < p.right &&
                    p.top < t.innerHeight &&
                    p.left < t.innerWidth
                  ) {
                    if (((u += Xm(f)), u > $m)) {
                      s.length = o;
                      break;
                    }
                    ((f = new Promise(jp.bind(f))), s.push(f));
                  }
                }
              }
            if (0 < s.length)
              return (
                (t = Promise.race([
                  Promise.all(s),
                  new Promise(function (e) {
                    return setTimeout(e, 500);
                  }),
                ]).then(i, i)),
                (n ? Promise.allSettled([n.finished, t]) : t).then(a, a)
              );
            if ((i(), n)) return n.finished.then(a, a);
            a();
          },
          types: n,
        });
        l.__reactViewTransition = u;
        var d = [];
        return (
          u.ready.then(
            function () {
              for (
                var e = l.documentElement.getAnimations({ subtree: !0 }), t = 0;
                t < e.length;
                t++
              ) {
                var n = e[t],
                  r = n.effect,
                  i = r.pseudoElement;
                if (i != null && i.startsWith(`::view-transition`)) {
                  (d.push(n), (n = r.getKeyframes()));
                  for (var a = (i = void 0), s = !0, c = 0; c < n.length; c++) {
                    var u = n[c],
                      f = u.width;
                    if (i === void 0) i = f;
                    else if (i !== f) {
                      s = !1;
                      break;
                    }
                    if (((f = u.height), a === void 0)) a = f;
                    else if (a !== f) {
                      s = !1;
                      break;
                    }
                    (delete u.width,
                      delete u.height,
                      u.transform === `none` && delete u.transform);
                  }
                  s &&
                    i !== void 0 &&
                    a !== void 0 &&
                    (r.setKeyframes(n),
                    (s = getComputedStyle(r.target, r.pseudoElement)),
                    s.width !== i || s.height !== a) &&
                    ((s = n[0]),
                    (s.width = i),
                    (s.height = a),
                    (s = n[n.length - 1]),
                    (s.width = i),
                    (s.height = a),
                    r.setKeyframes(n));
                }
              }
              o();
            },
            function (e) {
              l.__reactViewTransition === u && (l.__reactViewTransition = null);
              try {
                if (typeof e == `object` && e)
                  switch (e.name) {
                    case `InvalidStateError`:
                      (e.message ===
                        `View transition was skipped because document visibility state is hidden.` ||
                        e.message ===
                          `Skipping view transition because document visibility state has become hidden.` ||
                        e.message ===
                          `Skipping view transition because viewport size changed.` ||
                        e.message ===
                          `Transition was aborted because of invalid state`) &&
                        (e = null);
                  }
                e !== null && c(e);
              } finally {
                (r(), i(), o());
              }
            },
          ),
          u.finished.finally(function () {
            for (var e = 0; e < d.length; e++) d[e].cancel();
            (l.__reactViewTransition === u && (l.__reactViewTransition = null),
              s());
          }),
          u
        );
      } catch {
        return (r(), i(), o(), null);
      }
    }
    function Np(e, t) {
      ((this._scope = document.documentElement),
        (this._selector = `::view-transition-` + e + `(` + t + `)`));
    }
    ((Np.prototype.animate = function (e, t) {
      return (
        (t = typeof t == `number` ? { duration: t } : x({}, t)),
        (t.pseudoElement = this._selector),
        this._scope.animate(e, t)
      );
    }),
      (Np.prototype.getAnimations = function () {
        for (
          var e = this._scope,
            t = this._selector,
            n = e.getAnimations({ subtree: !0 }),
            r = [],
            i = 0;
          i < n.length;
          i++
        ) {
          var a = n[i].effect;
          a !== null && a.target === e && a.pseudoElement === t && r.push(n[i]);
        }
        return r;
      }),
      (Np.prototype.getComputedStyle = function () {
        return getComputedStyle(this._scope, this._selector);
      }));
    function Pp(e) {
      return {
        name: e,
        group: new Np(`group`, e),
        imagePair: new Np(`image-pair`, e),
        old: new Np(`old`, e),
        new: new Np(`new`, e),
      };
    }
    function Fp(e) {
      ((this._fragmentFiber = e),
        (this._observers = this._eventListeners = null));
    }
    Fp.prototype.addEventListener = function (e, t, n) {
      var r = null,
        i = null;
      if (!(
        n != null &&
        typeof n != `boolean` &&
        ((r = n.signal || null), r !== null && r.aborted)
      )) {
        this._eventListeners === null && (this._eventListeners = []);
        var a = this._eventListeners;
        if (Bp(a, e, t, n) === -1) {
          var o = this,
            s = t;
          (n != null &&
            typeof n != `boolean` &&
            !0 === n.once &&
            (s = function (r) {
              (o.removeEventListener(e, t, n),
                typeof t == `function` ? t.call(this, r) : t.handleEvent(r));
            }),
            r !== null &&
              ((i = o.removeEventListener.bind(o, e, t, n)),
              r.addEventListener(`abort`, i, { once: !0 }),
              (i = r.removeEventListener.bind(r, `abort`, i))),
            (r = Rp(n)),
            a.push({
              type: e,
              listener: t,
              optionsOrUseCapture: n,
              attachedListener: s,
              cleanup: i,
            }),
            p(this._fragmentFiber.child, !1, Ip, e, s, r));
        }
        this._eventListeners = a;
      }
    };
    function Ip(e, t, n, r) {
      return (v(e).addEventListener(t, n, r), !1);
    }
    Fp.prototype.removeEventListener = function (e, t, n) {
      var r = this._eventListeners;
      if (r !== null && ((t = Bp(r, e, t, n)), t !== -1)) {
        var i = r[t];
        n = i.attachedListener;
        var a = i.cleanup;
        ((i = Rp(i.optionsOrUseCapture)),
          p(this._fragmentFiber.child, !1, Lp, e, n, i),
          r.splice(t, 1),
          a !== null && a());
      }
    };
    function Lp(e, t, n, r) {
      return (v(e).removeEventListener(t, n, r), !1);
    }
    function Rp(e) {
      return e != null &&
        typeof e != `boolean` &&
        (!0 === e.once || e.signal instanceof AbortSignal)
        ? { capture: e.capture, passive: e.passive }
        : e;
    }
    function zp(e) {
      return e == null
        ? `c=0`
        : typeof e == `boolean`
          ? `c=` + (e ? `1` : `0`)
          : `c=` + (e.capture ? `1` : `0`);
    }
    function Bp(e, t, n, r) {
      if (e.length === 0) return -1;
      r = zp(r);
      for (var i = 0; i < e.length; i++) {
        var a = e[i];
        if (a.type === t && a.listener === n && zp(a.optionsOrUseCapture) === r)
          return i;
      }
      return -1;
    }
    ((Fp.prototype.dispatchEvent = function (e) {
      var t = m(this._fragmentFiber);
      if (t === null) return !0;
      t = v(t);
      var n = this._eventListeners;
      if ((n !== null && 0 < n.length) || !e.bubbles) {
        var r =
          t.nodeType === 9 ? t.createComment(``) : document.createTextNode(``);
        if (n)
          for (var i = 0; i < n.length; i++) {
            var a = n[i];
            r.addEventListener(
              a.type,
              a.attachedListener,
              Rp(a.optionsOrUseCapture),
            );
          }
        if ((t.appendChild(r), (e = r.dispatchEvent(e)), n))
          for (i = 0; i < n.length; i++)
            ((a = n[i]),
              r.removeEventListener(
                a.type,
                a.attachedListener,
                Rp(a.optionsOrUseCapture),
              ));
        return (t.removeChild(r), e);
      }
      return t.dispatchEvent(e);
    }),
      (Fp.prototype.focus = function (e) {
        p(this._fragmentFiber.child, !0, Vp, e, void 0, void 0);
      }));
    function Vp(e, t) {
      return e.tag !== 6 && ((e = v(e)), pm(e, t));
    }
    Fp.prototype.focusLast = function (e) {
      var t = [];
      p(this._fragmentFiber.child, !0, Hp, t, void 0, void 0);
      for (var n = t.length - 1; 0 <= n && !Vp(t[n], e); n--);
    };
    function Hp(e, t) {
      return (t.push(e), !1);
    }
    Fp.prototype.blur = function () {
      var e = m(this._fragmentFiber);
      e !== null &&
        ((e = v(e)),
        (e = lp(e).activeElement),
        e !== null && p(this._fragmentFiber.child, !1, Up, e, void 0, void 0));
    };
    function Up(e, t) {
      return (
        e.tag !== 6 &&
        ((e = v(e)), e === t || e.contains(t) ? (t.blur(), !0) : !1)
      );
    }
    Fp.prototype.observeUsing = function (e) {
      (this._observers === null && (this._observers = new Set()),
        this._observers.add(e),
        p(this._fragmentFiber.child, !1, Wp, e, void 0, void 0));
    };
    function Wp(e, t) {
      return (e.tag === 6 || ((e = v(e)), t.observe(e)), !1);
    }
    Fp.prototype.unobserveUsing = function (e) {
      var t = this._observers;
      if (t !== null && t.has(e)) {
        (t.delete(e), p(this._fragmentFiber.child, !1, Gp, e, void 0, void 0));
        for (var n = (t = 0); n < Kp.length; n++) {
          var r = Kp[n];
          r.fragmentInstance === this && r.observer === e
            ? e.unobserve(r.instance)
            : (Kp[t++] = r);
        }
        Kp.length = t;
      }
    };
    function Gp(e, t) {
      return (e.tag === 6 || ((e = v(e)), t.unobserve(e)), !1);
    }
    var Kp = [],
      qp = !1;
    function Jp(e, t, n) {
      (Kp.push({ fragmentInstance: e, observer: t, instance: n }),
        qp ||
          ((qp = !0),
          mm(function () {
            qp = !1;
            var e = Kp;
            Kp = [];
            for (var t = 0; t < e.length; t++) {
              var n = e[t];
              n.observer.unobserve(n.instance);
            }
          })));
    }
    Fp.prototype.getClientRects = function () {
      var e = [];
      return (p(this._fragmentFiber.child, !1, Yp, e, void 0, void 0), e);
    };
    function Yp(e, t) {
      if (e.tag === 6) {
        e = e.stateNode;
        var n = e.ownerDocument.createRange();
        (n.selectNodeContents(e), t.push.apply(t, n.getClientRects()));
      } else ((e = v(e)), t.push.apply(t, e.getClientRects()));
      return !1;
    }
    ((Fp.prototype.getRootNode = function (e) {
      var t = m(this._fragmentFiber);
      return t === null ? this : v(t).getRootNode(e);
    }),
      (Fp.prototype.compareDocumentPosition = function (e) {
        var t = m(this._fragmentFiber);
        if (t === null) return Node.DOCUMENT_POSITION_DISCONNECTED;
        var n = [];
        p(this._fragmentFiber.child, !1, Hp, n, void 0, void 0);
        var r = v(t);
        if (n.length === 0) {
          if (((n = r), h(this._fragmentFiber))) {
            a: {
              for (t = this._fragmentFiber.return; t !== null;) {
                if (t.tag === 4) {
                  t = t.stateNode.containerInfo;
                  break a;
                }
                if (t.tag === 3 || t.tag === 5 || t.tag === 27) break;
                t = t.return;
              }
              t = null;
            }
            t != null && (n = t);
          }
          t = this._fragmentFiber;
          var i = (r = n.compareDocumentPosition(e));
          return (
            n === e
              ? (i = Node.DOCUMENT_POSITION_CONTAINS)
              : r & Node.DOCUMENT_POSITION_CONTAINED_BY &&
                ((n = g(t)[1]),
                n === null
                  ? (i = Node.DOCUMENT_POSITION_PRECEDING)
                  : ((e = v(n).compareDocumentPosition(e)),
                    (i =
                      e === 0 || e & Node.DOCUMENT_POSITION_FOLLOWING
                        ? Node.DOCUMENT_POSITION_FOLLOWING
                        : Node.DOCUMENT_POSITION_PRECEDING))),
            (i |= Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC)
          );
        }
        ((t = v(n[0])), (i = v(n[n.length - 1])));
        var a = h(this._fragmentFiber) ? t.parentElement : r;
        if (a == null) return Node.DOCUMENT_POSITION_DISCONNECTED;
        ((r =
          a.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_CONTAINED_BY),
          (a =
            a.compareDocumentPosition(i) &
            Node.DOCUMENT_POSITION_CONTAINED_BY));
        var o = t.compareDocumentPosition(e),
          s = i.compareDocumentPosition(e),
          c =
            o & Node.DOCUMENT_POSITION_CONTAINED_BY ||
            s & Node.DOCUMENT_POSITION_CONTAINED_BY;
        return (
          (s =
            r &&
            a &&
            o & Node.DOCUMENT_POSITION_FOLLOWING &&
            s & Node.DOCUMENT_POSITION_PRECEDING),
          (t =
            (r && t === e) || (a && i === e) || c || s
              ? Node.DOCUMENT_POSITION_CONTAINED_BY
              : (!r && t === e) || (!a && i === e)
                ? Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC
                : o),
          t & Node.DOCUMENT_POSITION_DISCONNECTED ||
          t & Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC ||
          Xp(t, this._fragmentFiber, n[0], n[n.length - 1], e)
            ? t
            : Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC
        );
      }));
    function Xp(e, t, n, r, i) {
      var a = Bt(i);
      if (e & Node.DOCUMENT_POSITION_CONTAINED_BY) {
        if ((n = !!a))
          a: {
            for (; a !== null;) {
              if (a.tag === 7 && (a === t || a.alternate === t)) {
                n = !0;
                break a;
              }
              a = a.return;
            }
            n = !1;
          }
        return n;
      }
      if (e & Node.DOCUMENT_POSITION_CONTAINS) {
        if (a === null)
          return (
            (a = i.ownerDocument),
            i === a || i === a.documentElement || i === a.body
          );
        a: {
          for (a = t, t = m(t); a !== null;) {
            if (!(
              (a.tag !== 5 && a.tag !== 3 && a.tag !== 27) ||
              (a !== t && a.alternate !== t)
            )) {
              a = !0;
              break a;
            }
            a = a.return;
          }
          a = !1;
        }
        return a;
      }
      return e & Node.DOCUMENT_POSITION_PRECEDING
        ? ((t = !!a) &&
            !(t = a === n) &&
            ((t = re(n, a, ne)),
            t === null
              ? (t = !1)
              : (p(t, !0, ee, a, n), (a = y), (y = null), (t = a !== null))),
          t)
        : e & Node.DOCUMENT_POSITION_FOLLOWING
          ? ((t = !!a) &&
              !(t = a === r) &&
              ((t = re(r, a, ne)),
              t === null
                ? (t = !1)
                : (p(t, !0, te, a, r),
                  (a = y),
                  (b = y = null),
                  (t = a !== null))),
            t)
          : !1;
    }
    function Zp(e, t) {
      var n = e.ownerDocument.createRange();
      (n.selectNodeContents(e),
        (e = n.getBoundingClientRect()),
        window.scrollTo(
          window.scrollX + e.left,
          t
            ? window.scrollY + e.top
            : window.scrollY + e.bottom - window.innerHeight,
        ));
    }
    Fp.prototype.scrollIntoView = function (e) {
      if (typeof e == `object`) throw Error(a(566));
      var t = [];
      p(this._fragmentFiber.child, !1, Hp, t, void 0, void 0);
      var n = !1 !== e;
      if (t.length === 0) {
        var r = g(this._fragmentFiber);
        if (
          ((r = n ? r[1] || r[0] || m(this._fragmentFiber) : r[0] || r[1]),
          r === null)
        )
          return;
        if (r.tag === 6) {
          ((e = v(r)), Zp(e, n));
          return;
        }
        if (((r = v(r)), r.nodeType !== 9)) {
          if (r.nodeType === 11) {
            ((n = `host` in r ? r.host : null),
              n !== null && n.scrollIntoView(e));
            return;
          }
          r.scrollIntoView(e);
        }
      }
      for (r = n ? t.length - 1 : 0; r !== (n ? -1 : t.length);) {
        var i = t[r];
        (i.tag === 6 ? ((i = v(i)), Zp(i, n)) : v(i).scrollIntoView(e),
          (r += n ? -1 : 1));
      }
    };
    function Qp(e, t) {
      return ((e = v(e)), $p(e, t), !1);
    }
    function $p(e, t) {
      ((e.reactFragments ??= new Set()), e.reactFragments.add(t));
    }
    function em(e, t) {
      var n = t._eventListeners;
      if (n !== null)
        for (var r = 0; r < n.length; r++) {
          var i = n[r];
          e.addEventListener(
            i.type,
            i.attachedListener,
            Rp(i.optionsOrUseCapture),
          );
        }
      e.nodeType !== 3 &&
        ((n = t._observers),
        n !== null &&
          n.forEach(function (n) {
            for (var r = 0, i = 0; i < Kp.length; i++) {
              var a = Kp[i];
              (a.fragmentInstance !== t ||
                a.observer !== n ||
                a.instance !== e) &&
                (Kp[r++] = a);
            }
            ((Kp.length = r), n.observe(e));
          }),
        $p(e, t));
    }
    function tm(e, t) {
      var n = t._eventListeners;
      if (n !== null)
        for (var r = 0; r < n.length; r++) {
          var i = n[r];
          e.removeEventListener(
            i.type,
            i.attachedListener,
            Rp(i.optionsOrUseCapture),
          );
        }
      e.nodeType !== 3 &&
        ((n = t._observers),
        n !== null &&
          n.forEach(function (n) {
            typeof n.rootMargin == `string` ? Jp(t, n, e) : n.unobserve(e);
          }),
        e.reactFragments != null && e.reactFragments.delete(t));
    }
    function nm(e) {
      var t = e.firstChild;
      for (t && t.nodeType === 10 && (t = t.nextSibling); t;) {
        var n = t;
        switch (((t = t.nextSibling), n.nodeName)) {
          case `HTML`:
          case `HEAD`:
          case `BODY`:
            (nm(n), zt(n));
            continue;
          case `SCRIPT`:
          case `STYLE`:
            continue;
          case `LINK`:
            if (n.rel.toLowerCase() === `stylesheet`) continue;
        }
        e.removeChild(n);
      }
    }
    function rm(e, t, n, r) {
      for (; e.nodeType === 1;) {
        var i = n;
        if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
          if (!r && (e.nodeName !== `INPUT` || e.type !== `hidden`)) break;
        } else if (!r) {
          if (t === `input` && e.type === `hidden`) {
            var a = i.name == null ? null : `` + i.name;
            if (i.type === `hidden` && e.getAttribute(`name`) === a) return e;
          } else return e;
        } else if (!e[Lt])
          switch (t) {
            case `meta`:
              if (!e.hasAttribute(`itemprop`)) break;
              return e;
            case `link`:
              if (
                ((a = e.getAttribute(`rel`)),
                (a === `stylesheet` && e.hasAttribute(`data-precedence`)) ||
                  a !== i.rel ||
                  e.getAttribute(`href`) !==
                    (i.href == null || i.href === `` ? null : i.href) ||
                  e.getAttribute(`crossorigin`) !==
                    (i.crossOrigin == null ? null : i.crossOrigin) ||
                  e.getAttribute(`title`) !==
                    (i.title == null ? null : i.title))
              )
                break;
              return e;
            case `style`:
              if (e.hasAttribute(`data-precedence`)) break;
              return e;
            case `script`:
              if (
                ((a = e.getAttribute(`src`)),
                (a !== (i.src == null ? null : i.src) ||
                  e.getAttribute(`type`) !== (i.type == null ? null : i.type) ||
                  e.getAttribute(`crossorigin`) !==
                    (i.crossOrigin == null ? null : i.crossOrigin)) &&
                  a &&
                  e.hasAttribute(`async`) &&
                  !e.hasAttribute(`itemprop`))
              )
                break;
              return e;
            default:
              return e;
          }
        if (((e = lm(e.nextSibling)), e === null)) break;
      }
      return null;
    }
    function im(e, t, n) {
      if (t === ``) return null;
      for (; e.nodeType !== 3;)
        if (
          ((e.nodeType !== 1 ||
            e.nodeName !== `INPUT` ||
            e.type !== `hidden`) &&
            !n) ||
          ((e = lm(e.nextSibling)), e === null)
        )
          return null;
      return e;
    }
    function am(e, t) {
      for (; e.nodeType !== 8;)
        if (
          ((e.nodeType !== 1 ||
            e.nodeName !== `INPUT` ||
            e.type !== `hidden`) &&
            !t) ||
          ((e = lm(e.nextSibling)), e === null)
        )
          return null;
      return e;
    }
    function om(e) {
      return e.data === `$?` || e.data === `$~`;
    }
    function sm(e) {
      return (
        e.data === `$!` ||
        (e.data === `$?` && e.ownerDocument.readyState !== `loading`)
      );
    }
    function cm(e, t) {
      var n = e.ownerDocument;
      if (e.data === `$~`) e._reactRetry = t;
      else if (e.data !== `$?` || n.readyState !== `loading`) t();
      else {
        var r = function () {
          (t(), n.removeEventListener(`DOMContentLoaded`, r));
        };
        (n.addEventListener(`DOMContentLoaded`, r), (e._reactRetry = r));
      }
    }
    function lm(e) {
      for (; e != null; e = e.nextSibling) {
        var t = e.nodeType;
        if (t === 1 || t === 3) break;
        if (t === 8) {
          if (
            ((t = e.data),
            t === `$` ||
              t === `$!` ||
              t === `$?` ||
              t === `$~` ||
              t === `&` ||
              t === `F!` ||
              t === `F`)
          )
            break;
          if (t === `/$` || t === `/&`) return null;
        }
      }
      return e;
    }
    var um = null;
    function dm(e) {
      e = e.nextSibling;
      for (var t = 0; e;) {
        if (e.nodeType === 8) {
          var n = e.data;
          if (n === `/$` || n === `/&`) {
            if (t === 0) return lm(e.nextSibling);
            t--;
          } else
            (n !== `$` &&
              n !== `$!` &&
              n !== `$?` &&
              n !== `$~` &&
              n !== `&`) ||
              t++;
        }
        e = e.nextSibling;
      }
      return null;
    }
    function fm(e) {
      e = e.previousSibling;
      for (var t = 0; e;) {
        if (e.nodeType === 8) {
          var n = e.data;
          if (
            n === `$` ||
            n === `$!` ||
            n === `$?` ||
            n === `$~` ||
            n === `&`
          ) {
            if (t === 0) return e;
            t--;
          } else (n !== `/$` && n !== `/&`) || t++;
        }
        e = e.previousSibling;
      }
      return null;
    }
    function pm(e, t) {
      function n() {
        r = !0;
      }
      if (e.ownerDocument.activeElement === e) return !0;
      var r = !1;
      try {
        (e.ownerDocument.addEventListener(`focus`, n, !0),
          (e.focus || HTMLElement.prototype.focus).call(e, t));
      } finally {
        e.ownerDocument.removeEventListener(`focus`, n, !0);
      }
      return r;
    }
    function mm(e) {
      yp(function () {
        yp(function (t) {
          return e(t);
        });
      });
    }
    function hm(e, t, n) {
      switch (((t = lp(n)), e)) {
        case `html`:
          if (((e = t.documentElement), !e)) throw Error(a(452));
          return e;
        case `head`:
          if (((e = t.head), !e)) throw Error(a(453));
          return e;
        case `body`:
          if (((e = t.body), !e)) throw Error(a(454));
          return e;
        default:
          throw Error(a(451));
      }
    }
    function gm(e, t, n) {
      for (var r in n) {
        var i = n[r];
        n.hasOwnProperty(r) && i != null && $(e, t, r, null, rp, i);
      }
      (n.dangerouslySetInnerHTML != null && (e.textContent = ``),
        e.onclick === wn && (e.onclick = null),
        zt(e));
    }
    function _m(e) {
      for (var t = e.attributes; t.length;) e.removeAttributeNode(t[0]);
      zt(e);
    }
    var vm = new Map(),
      ym = new Set();
    function bm(e) {
      if (typeof e.getRootNode == `function`) {
        var t = e.getRootNode();
        if (t.nodeType === 9 || t.nodeType === 11) return t;
      }
      return e.nodeType === 9 ? e : e.ownerDocument;
    }
    var xm = T.d;
    T.d = { f: Sm, r: Cm, D: Em, C: Dm, L: Om, m: km, X: jm, S: Am, M: Mm };
    function Sm() {
      var e = xm.f(),
        t = zd();
      return e || t;
    }
    function Cm(e) {
      var t = Vt(e);
      t !== null && t.tag === 5 && t.type === `form` ? ic(t) : xm.r(e);
    }
    var wm = typeof document > `u` ? null : document;
    function Tm(e, t, n) {
      var r = wm;
      if (r && typeof t == `string` && t) {
        var i = ln(t);
        ((i = `link[rel="` + e + `"][href="` + i + `"]`),
          typeof n == `string` && (i += `[crossorigin="` + n + `"]`),
          ym.has(i) ||
            (ym.add(i),
            (e = { rel: e, crossOrigin: n, href: t }),
            r.querySelector(i) === null &&
              ((t = r.createElement(`link`)),
              np(t, `link`, e),
              Ut(t),
              r.head.appendChild(t))));
      }
    }
    function Em(e) {
      (xm.D(e), Tm(`dns-prefetch`, e, null));
    }
    function Dm(e, t) {
      (xm.C(e, t), Tm(`preconnect`, e, t));
    }
    function Om(e, t, n) {
      xm.L(e, t, n);
      var r = wm;
      if (r && e && t) {
        var i = `link[rel="preload"][as="` + ln(t) + `"]`;
        t === `image` && n && n.imageSrcSet
          ? ((i += `[imagesrcset="` + ln(n.imageSrcSet) + `"]`),
            typeof n.imageSizes == `string` &&
              (i += `[imagesizes="` + ln(n.imageSizes) + `"]`))
          : (i += `[href="` + ln(e) + `"]`);
        var a = i;
        switch (t) {
          case `style`:
            a = Pm(e);
            break;
          case `script`:
            a = Rm(e);
        }
        if (!(
          vm.has(a) ||
          ((e = x(
            {
              rel: `preload`,
              href: t === `image` && n && n.imageSrcSet ? void 0 : e,
              as: t,
            },
            n,
          )),
          vm.set(a, e),
          r.querySelector(i) !== null ||
            (t === `style` && r.querySelector(Fm(a))) ||
            (t === `script` && r.querySelector(zm(a))))
        )) {
          var o = r.createElement(`link`);
          (np(o, `link`, e),
            t === `style` &&
              ((o[Rt] = !0),
              (o.onload = o.onerror =
                function () {
                  Wt(o);
                })),
            Ut(o),
            r.head.appendChild(o));
        }
      }
    }
    function km(e, t) {
      xm.m(e, t);
      var n = wm;
      if (n && e) {
        var r = t && typeof t.as == `string` ? t.as : `script`,
          i =
            `link[rel="modulepreload"][as="` +
            ln(r) +
            `"][href="` +
            ln(e) +
            `"]`,
          a = i;
        switch (r) {
          case `audioworklet`:
          case `paintworklet`:
          case `serviceworker`:
          case `sharedworker`:
          case `worker`:
          case `script`:
            a = Rm(e);
        }
        if (
          !vm.has(a) &&
          ((e = x({ rel: `modulepreload`, href: e }, t)),
          vm.set(a, e),
          n.querySelector(i) === null)
        ) {
          switch (r) {
            case `audioworklet`:
            case `paintworklet`:
            case `serviceworker`:
            case `sharedworker`:
            case `worker`:
            case `script`:
              if (n.querySelector(zm(a))) return;
          }
          ((r = n.createElement(`link`)),
            np(r, `link`, e),
            Ut(r),
            n.head.appendChild(r));
        }
      }
    }
    function Am(e, t, n) {
      xm.S(e, t, n);
      var r = wm;
      if (r && e) {
        var i = Ht(r).hoistableStyles,
          a = Pm(e);
        t ||= `default`;
        var o = i.get(a);
        if (!o) {
          var s = { loading: 0, preload: null };
          if ((o = r.querySelector(Fm(a)))) s.loading = 5;
          else {
            ((e = x({ rel: `stylesheet`, href: e, "data-precedence": t }, n)),
              (n = vm.get(a)) && Hm(e, n));
            var c = (o = r.createElement(`link`));
            (Ut(c),
              np(c, `link`, e),
              (c._p = new Promise(function (e, t) {
                ((c.onload = e), (c.onerror = t));
              })),
              c.addEventListener(`load`, function () {
                s.loading |= 1;
              }),
              c.addEventListener(`error`, function () {
                s.loading |= 2;
              }),
              (s.loading |= 4),
              Vm(o, t, r));
          }
          ((o = { type: `stylesheet`, instance: o, count: 1, state: s }),
            i.set(a, o));
        }
      }
    }
    function jm(e, t) {
      xm.X(e, t);
      var n = wm;
      if (n && e) {
        var r = Ht(n).hoistableScripts,
          i = Rm(e),
          a = r.get(i);
        a ||
          ((a = n.querySelector(zm(i))),
          a ||
            ((e = x({ src: e, async: !0 }, t)),
            (t = vm.get(i)) && Um(e, t),
            (a = n.createElement(`script`)),
            Ut(a),
            np(a, `link`, e),
            n.head.appendChild(a)),
          (a = { type: `script`, instance: a, count: 1, state: null }),
          r.set(i, a));
      }
    }
    function Mm(e, t) {
      xm.M(e, t);
      var n = wm;
      if (n && e) {
        var r = Ht(n).hoistableScripts,
          i = Rm(e),
          a = r.get(i);
        a ||
          ((a = n.querySelector(zm(i))),
          a ||
            ((e = x({ src: e, async: !0, type: `module` }, t)),
            (t = vm.get(i)) && Um(e, t),
            (a = n.createElement(`script`)),
            Ut(a),
            np(a, `link`, e),
            n.head.appendChild(a)),
          (a = { type: `script`, instance: a, count: 1, state: null }),
          r.set(i, a));
      }
    }
    function Nm(e, t, n, r) {
      var i = (i = Ae.current) ? bm(i) : null;
      if (!i) throw Error(a(446));
      switch (e) {
        case `meta`:
        case `title`:
          return null;
        case `style`:
          return typeof n.precedence == `string` && typeof n.href == `string`
            ? ((n = Pm(n.href)),
              (t = Ht(i).hoistableStyles),
              (r = t.get(n)),
              r ||
                ((r = { type: `style`, instance: null, count: 0, state: null }),
                t.set(n, r)),
              r)
            : { type: `void`, instance: null, count: 0, state: null };
        case `link`:
          if (
            n.rel === `stylesheet` &&
            typeof n.href == `string` &&
            typeof n.precedence == `string`
          ) {
            e = Pm(n.href);
            var o = Ht(i).hoistableStyles,
              s = o.get(e);
            if (
              (s ||
                ((i = i.ownerDocument || i),
                (s = {
                  type: `stylesheet`,
                  instance: null,
                  count: 0,
                  state: { loading: 0, preload: null },
                }),
                o.set(e, s),
                (o = i.querySelector(Fm(e)))
                  ? o._p || ((s.instance = o), (s.state.loading = 5))
                  : ((o = vm.get(e)),
                    o ||
                      ((o = {
                        rel: `preload`,
                        as: `style`,
                        href: n.href,
                        crossOrigin: n.crossOrigin,
                        integrity: n.integrity,
                        media: n.media,
                        hrefLang: n.hrefLang,
                        referrerPolicy: n.referrerPolicy,
                      }),
                      vm.set(e, o)),
                    Lm(i, e, o, s.state))),
              t && r === null)
            )
              throw Error(a(528, ``));
            return s;
          }
          if (t && r !== null) throw Error(a(529, ``));
          return null;
        case `script`:
          return (
            (t = n.async),
            (n = n.src),
            typeof n == `string` &&
            t &&
            typeof t != `function` &&
            typeof t != `symbol`
              ? ((n = Rm(n)),
                (t = Ht(i).hoistableScripts),
                (r = t.get(n)),
                r ||
                  ((r = {
                    type: `script`,
                    instance: null,
                    count: 0,
                    state: null,
                  }),
                  t.set(n, r)),
                r)
              : { type: `void`, instance: null, count: 0, state: null }
          );
        default:
          throw Error(a(444, e));
      }
    }
    function Pm(e) {
      return `href="` + ln(e) + `"`;
    }
    function Fm(e) {
      return `link[rel="stylesheet"][` + e + `]`;
    }
    function Im(e) {
      return x({}, e, { "data-precedence": e.precedence, precedence: null });
    }
    function Lm(e, t, n, r) {
      if ((t = e.querySelector(`link[rel="preload"][as="style"][` + t + `]`))) {
        if (!0 !== t[Rt]) {
          r.loading = 1;
          return;
        }
      } else
        ((t = e.createElement(`link`)),
          (t[Rt] = !0),
          (t.onload = t.onerror = Wt.bind(null, t)),
          np(t, `link`, n),
          Ut(t),
          e.head.appendChild(t));
      ((r.preload = t),
        t.addEventListener(`load`, function () {
          return (r.loading |= 1);
        }),
        t.addEventListener(`error`, function () {
          return (r.loading |= 2);
        }));
    }
    function Rm(e) {
      return `[src="` + ln(e) + `"]`;
    }
    function zm(e) {
      return `script[async]` + e;
    }
    function Bm(e, t, n) {
      if ((t.count++, t.instance === null))
        switch (t.type) {
          case `style`:
            var r = e.querySelector(`style[data-href~="` + ln(n.href) + `"]`);
            if (r) return ((t.instance = r), Ut(r), r);
            var i = x({}, n, {
              "data-href": n.href,
              "data-precedence": n.precedence,
              href: null,
              precedence: null,
            });
            return (
              (r = (e.ownerDocument || e).createElement(`style`)),
              Ut(r),
              np(r, `style`, i),
              Vm(r, n.precedence, e),
              (t.instance = r)
            );
          case `stylesheet`:
            i = Pm(n.href);
            var o = e.querySelector(Fm(i));
            if (o) return ((t.state.loading |= 4), (t.instance = o), Ut(o), o);
            ((r = Im(n)),
              (i = vm.get(i)) && Hm(r, i),
              (o = (e.ownerDocument || e).createElement(`link`)),
              Ut(o));
            var s = o;
            return (
              (s._p = new Promise(function (e, t) {
                ((s.onload = e), (s.onerror = t));
              })),
              np(o, `link`, r),
              (t.state.loading |= 4),
              Vm(o, n.precedence, e),
              (t.instance = o)
            );
          case `script`:
            return (
              (o = Rm(n.src)),
              (i = e.querySelector(zm(o)))
                ? ((t.instance = i), Ut(i), i)
                : ((r = n),
                  (i = vm.get(o)) && ((r = x({}, n)), Um(r, i)),
                  (e = e.ownerDocument || e),
                  (i = e.createElement(`script`)),
                  Ut(i),
                  np(i, `link`, r),
                  e.head.appendChild(i),
                  (t.instance = i))
            );
          case `void`:
            return null;
          default:
            throw Error(a(443, t.type));
        }
      else
        t.type === `stylesheet` &&
          !(t.state.loading & 4) &&
          ((r = t.instance), (t.state.loading |= 4), Vm(r, n.precedence, e));
      return t.instance;
    }
    function Vm(e, t, n) {
      for (
        var r = n.querySelectorAll(
            `link[rel="stylesheet"][data-precedence],style[data-precedence]`,
          ),
          i = r.length ? r[r.length - 1] : null,
          a = i,
          o = 0;
        o < r.length;
        o++
      ) {
        var s = r[o];
        if (s.dataset.precedence === t) a = s;
        else if (a !== i) break;
      }
      a
        ? a.parentNode.insertBefore(e, a.nextSibling)
        : ((t = n.nodeType === 9 ? n.head : n),
          t.insertBefore(e, t.firstChild));
    }
    function Hm(e, t) {
      ((e.crossOrigin ??= t.crossOrigin),
        (e.referrerPolicy ??= t.referrerPolicy),
        (e.title ??= t.title));
    }
    function Um(e, t) {
      ((e.crossOrigin ??= t.crossOrigin),
        (e.referrerPolicy ??= t.referrerPolicy),
        (e.integrity ??= t.integrity));
    }
    var Wm = null;
    function Gm(e, t, n) {
      if (Wm === null) {
        var r = new Map(),
          i = (Wm = new Map());
        i.set(n, r);
      } else ((i = Wm), (r = i.get(n)), r || ((r = new Map()), i.set(n, r)));
      if (r.has(e)) return r;
      for (
        r.set(e, null), n = n.getElementsByTagName(e), i = 0;
        i < n.length;
        i++
      ) {
        var a = n[i];
        if (
          !(
            a[Lt] ||
            a[At] ||
            (e === `link` && a.getAttribute(`rel`) === `stylesheet`)
          ) &&
          a.namespaceURI !== `http://www.w3.org/2000/svg`
        ) {
          var o = a.getAttribute(t) || ``;
          o = e + o;
          var s = r.get(o);
          s ? s.push(a) : r.set(o, [a]);
        }
      }
      return r;
    }
    function Km(e, t, n) {
      ((e = e.ownerDocument || e),
        e.head.insertBefore(
          n,
          t === `title` ? e.querySelector(`head > title`) : null,
        ));
    }
    function qm(e, t, n) {
      if (n === 1 || t.itemProp != null) return !1;
      switch (e) {
        case `meta`:
        case `title`:
          return !0;
        case `style`:
          if (
            typeof t.precedence != `string` ||
            typeof t.href != `string` ||
            t.href === ``
          )
            break;
          return !0;
        case `link`:
          if (
            typeof t.rel != `string` ||
            typeof t.href != `string` ||
            t.href === `` ||
            t.onLoad ||
            t.onError
          )
            break;
          switch (t.rel) {
            case `stylesheet`:
              return (
                (e = t.disabled),
                typeof t.precedence == `string` && e == null
              );
            default:
              return !0;
          }
        case `script`:
          if (
            t.async &&
            typeof t.async != `function` &&
            typeof t.async != `symbol` &&
            !t.onLoad &&
            !t.onError &&
            t.src &&
            typeof t.src == `string`
          )
            return !0;
      }
      return !1;
    }
    function Jm(e, t) {
      return (
        e === `img` &&
        t.src != null &&
        t.src !== `` &&
        t.onLoad == null &&
        t.loading !== `lazy`
      );
    }
    function Ym(e) {
      return !(e.type === `stylesheet` && !(e.state.loading & 3));
    }
    function Xm(e) {
      return (
        (e.width || 100) *
        (e.height || 100) *
        (typeof devicePixelRatio == `number` ? devicePixelRatio : 1) *
        0.25
      );
    }
    function Zm(e, t) {
      typeof t.decode == `function` &&
        (e.imgCount++,
        t.complete || ((e.imgBytes += Xm(t)), e.suspenseyImages.push(t)),
        (e = rh.bind(e)),
        t.decode().then(e, e));
    }
    function Qm(e, t, n, r) {
      if (
        n.type === `stylesheet` &&
        (typeof r.media != `string` || !1 !== matchMedia(r.media).matches) &&
        !(n.state.loading & 4)
      ) {
        if (n.instance === null) {
          var i = Pm(r.href),
            a = t.querySelector(Fm(i));
          if (a) {
            ((t = a._p),
              typeof t == `object` &&
                t &&
                typeof t.then == `function` &&
                (e.count++, (e = nh.bind(e)), t.then(e, e)),
              (n.state.loading |= 4),
              (n.instance = a),
              Ut(a));
            return;
          }
          ((a = t.ownerDocument || t),
            (r = Im(r)),
            (i = vm.get(i)) && Hm(r, i),
            (a = a.createElement(`link`)),
            Ut(a));
          var o = a;
          ((o._p = new Promise(function (e, t) {
            ((o.onload = e), (o.onerror = t));
          })),
            np(a, `link`, r),
            (n.instance = a));
        }
        (e.stylesheets === null && (e.stylesheets = new Map()),
          e.stylesheets.set(n, t),
          (t = n.state.preload) &&
            !(n.state.loading & 3) &&
            (e.count++,
            (n = nh.bind(e)),
            t.addEventListener(`load`, n),
            t.addEventListener(`error`, n)));
      }
    }
    var $m = 0;
    function eh(e, t) {
      return (
        e.stylesheets && e.count === 0 && ah(e, e.stylesheets),
        0 < e.count || 0 < e.imgCount
          ? function (n) {
              var r = setTimeout(function () {
                if ((e.stylesheets && ah(e, e.stylesheets), e.unsuspend)) {
                  var t = e.unsuspend;
                  ((e.unsuspend = null), t());
                }
              }, 6e4 + t);
              0 < e.imgBytes && $m === 0 && ($m = 62500 * op());
              var i = setTimeout(
                function () {
                  if (
                    ((e.waitingForImages = !1),
                    e.count === 0 &&
                      (e.stylesheets && ah(e, e.stylesheets), e.unsuspend))
                  ) {
                    var t = e.unsuspend;
                    ((e.unsuspend = null), t());
                  }
                },
                (e.imgBytes > $m ? 50 : 800) + t,
              );
              return (
                (e.unsuspend = n),
                function () {
                  ((e.unsuspend = null), clearTimeout(r), clearTimeout(i));
                }
              );
            }
          : null
      );
    }
    function th(e) {
      if (e.count === 0 && (e.imgCount === 0 || !e.waitingForImages)) {
        if (e.stylesheets) ah(e, e.stylesheets);
        else if (e.unsuspend) {
          var t = e.unsuspend;
          ((e.unsuspend = null), t());
        }
      }
    }
    function nh() {
      (this.count--, th(this));
    }
    function rh() {
      (this.imgCount--, th(this));
    }
    var ih = null;
    function ah(e, t) {
      ((e.stylesheets = null),
        e.unsuspend !== null &&
          (e.count++,
          (ih = new Map()),
          t.forEach(oh, e),
          (ih = null),
          nh.call(e)));
    }
    function oh(e, t) {
      if (!(t.state.loading & 4)) {
        var n = ih.get(e);
        if (n) var r = n.get(null);
        else {
          ((n = new Map()), ih.set(e, n));
          for (
            var i = e.querySelectorAll(
                `link[data-precedence],style[data-precedence]`,
              ),
              a = 0;
            a < i.length;
            a++
          ) {
            var o = i[a];
            (o.nodeName === `LINK` || o.getAttribute(`media`) !== `not all`) &&
              (n.set(o.dataset.precedence, o), (r = o));
          }
          r && n.set(null, r);
        }
        ((i = t.instance),
          (o = i.getAttribute(`data-precedence`)),
          (a = n.get(o) || r),
          a === r && n.set(null, i),
          n.set(o, i),
          this.count++,
          (r = nh.bind(this)),
          i.addEventListener(`load`, r),
          i.addEventListener(`error`, r),
          a
            ? a.parentNode.insertBefore(i, a.nextSibling)
            : ((e = e.nodeType === 9 ? e.head : e),
              e.insertBefore(i, e.firstChild)),
          (t.state.loading |= 4));
      }
    }
    var sh = {
      $$typeof: ue,
      Provider: null,
      Consumer: null,
      _currentValue: E,
      _currentValue2: E,
      _threadCount: 0,
    };
    function ch(e, t, n, r, i, a, o, s, c) {
      ((this.tag = 1),
        (this.containerInfo = e),
        (this.pingCache = this.current = this.pendingChildren = null),
        (this.timeoutHandle = -1),
        (this.callbackNode =
          this.next =
          this.pendingContext =
          this.context =
          this.cancelPendingCommit =
            null),
        (this.callbackPriority = 0),
        (this.expirationTimes = yt(-1)),
        (this.entangledLanes =
          this.shellSuspendCounter =
          this.errorRecoveryDisabledLanes =
          this.expiredLanes =
          this.warmLanes =
          this.pingedLanes =
          this.suspendedLanes =
          this.pendingLanes =
            0),
        (this.entanglements = yt(0)),
        (this.hiddenUpdates = yt(null)),
        (this.identifierPrefix = r),
        (this.onUncaughtError = i),
        (this.onCaughtError = a),
        (this.onRecoverableError = o),
        (this.pooledCache = null),
        (this.pooledCacheLanes = 0),
        (this.formState = c),
        (this.transitionTypes = null),
        (this.incompleteTransitions = new Map()));
    }
    function lh(e, t, n, r, i, a, o, s, c, l, u, d) {
      return (
        (e = new ch(e, t, n, o, c, l, u, d, s)),
        (t = 1),
        !0 === a && (t |= 24),
        (a = Li(3, null, null, t)),
        (e.current = a),
        (a.stateNode = e),
        (t = Na()),
        t.refCount++,
        (e.pooledCache = t),
        t.refCount++,
        (a.memoizedState = { element: r, isDehydrated: n, cache: t }),
        go(a),
        e
      );
    }
    function uh(e) {
      return e ? ((e = Fi), e) : Fi;
    }
    function dh(e, t, n, r, i, a) {
      ((i = uh(i)),
        r.context === null ? (r.context = i) : (r.pendingContext = i),
        (r = vo(t)),
        (r.payload = { element: n }),
        (a = a === void 0 ? null : a),
        a !== null && (r.callback = a),
        (n = yo(e, r, t)),
        n !== null && (Pd(n, e, t), bo(n, e, t)));
    }
    function fh(e, t) {
      if (((e = e.memoizedState), e !== null && e.dehydrated !== null)) {
        var n = e.retryLane;
        e.retryLane = n !== 0 && n < t ? n : t;
      }
    }
    function ph(e, t) {
      (fh(e, t), (e = e.alternate) && fh(e, t));
    }
    function mh(e) {
      if (e.tag === 13 || e.tag === 31) {
        var t = Mi(e, 67108864);
        (t !== null && Pd(t, e, 67108864), ph(e, 67108864));
      }
    }
    function hh(e) {
      if (e.tag === 13 || e.tag === 31) {
        var t = jd();
        t = Tt(t);
        var n = Mi(e, t);
        (n !== null && Pd(n, e, t), ph(e, t));
      }
    }
    var gh = !0;
    function _h(e, t, n, r) {
      var i = w.T;
      w.T = null;
      var a = T.p;
      try {
        ((T.p = 2), yh(e, t, n, r));
      } finally {
        ((T.p = a), (w.T = i));
      }
    }
    function vh(e, t, n, r) {
      var i = w.T;
      w.T = null;
      var a = T.p;
      try {
        ((T.p = 8), yh(e, t, n, r));
      } finally {
        ((T.p = a), (w.T = i));
      }
    }
    function yh(e, t, n, r) {
      if (gh) {
        var i = bh(r);
        if (i === null) (Kf(e, t, r, xh, n), Mh(e, r));
        else if (Ph(i, e, t, n, r)) r.stopPropagation();
        else if ((Mh(e, r), t & 4 && -1 < jh.indexOf(e))) {
          for (; i !== null;) {
            var a = Vt(i);
            if (a !== null)
              switch (a.tag) {
                case 3:
                  if (
                    ((a = a.stateNode), a.current.memoizedState.isDehydrated)
                  ) {
                    var o = pt(a.pendingLanes);
                    if (o !== 0) {
                      var s = a;
                      for (s.pendingLanes |= 2, s.entangledLanes |= 2; o;) {
                        var c = 1 << (31 - ot(o));
                        ((s.entanglements[1] |= c), (o &= ~c));
                      }
                      (Ef(a), !(G & 6) && ((_d = Ye() + 500), Df(0, !1)));
                    }
                  }
                  break;
                case 31:
                case 13:
                  ((s = Mi(a, 2)), s !== null && Pd(s, a, 2), zd(), ph(a, 2));
              }
            if (((a = bh(r)), a === null && Kf(e, t, r, xh, n), a === i)) break;
            i = a;
          }
          i !== null && r.stopPropagation();
        } else Kf(e, t, r, null, n);
      }
    }
    function bh(e) {
      return ((e = En(e)), Sh(e));
    }
    var xh = null;
    function Sh(e) {
      if (((xh = null), (e = Bt(e)), e !== null)) {
        var t = s(e);
        if (t === null) e = null;
        else {
          var n = t.tag;
          if (n === 13) {
            if (((e = c(t)), e !== null)) return e;
            e = null;
          } else if (n === 31) {
            if (((e = l(t)), e !== null)) return e;
            e = null;
          } else if (n === 3) {
            if (t.stateNode.current.memoizedState.isDehydrated)
              return t.tag === 3 ? t.stateNode.containerInfo : null;
            e = null;
          } else t !== e && (e = null);
        }
      }
      return ((xh = e), null);
    }
    function Ch(e) {
      switch (e) {
        case `beforetoggle`:
        case `cancel`:
        case `click`:
        case `close`:
        case `contextmenu`:
        case `copy`:
        case `cut`:
        case `auxclick`:
        case `dblclick`:
        case `dragend`:
        case `dragstart`:
        case `drop`:
        case `focusin`:
        case `focusout`:
        case `input`:
        case `invalid`:
        case `keydown`:
        case `keypress`:
        case `keyup`:
        case `mousedown`:
        case `mouseup`:
        case `paste`:
        case `pause`:
        case `play`:
        case `pointercancel`:
        case `pointerdown`:
        case `pointerup`:
        case `ratechange`:
        case `reset`:
        case `seeked`:
        case `submit`:
        case `toggle`:
        case `touchcancel`:
        case `touchend`:
        case `touchstart`:
        case `volumechange`:
        case `change`:
        case `selectionchange`:
        case `textInput`:
        case `compositionstart`:
        case `compositionend`:
        case `compositionupdate`:
        case `beforeblur`:
        case `afterblur`:
        case `beforeinput`:
        case `blur`:
        case `fullscreenchange`:
        case `fullscreenerror`:
        case `focus`:
        case `hashchange`:
        case `popstate`:
        case `select`:
        case `selectstart`:
          return 2;
        case `drag`:
        case `dragenter`:
        case `dragexit`:
        case `dragleave`:
        case `dragover`:
        case `mousemove`:
        case `mouseout`:
        case `mouseover`:
        case `pointermove`:
        case `pointerout`:
        case `pointerover`:
        case `resize`:
        case `scroll`:
        case `touchmove`:
        case `wheel`:
        case `mouseenter`:
        case `mouseleave`:
        case `pointerenter`:
        case `pointerleave`:
          return 8;
        case `message`:
          switch (Xe()) {
            case Ze:
              return 2;
            case A:
              return 8;
            case Qe:
            case $e:
              return 32;
            case et:
              return 268435456;
            default:
              return 32;
          }
        default:
          return 32;
      }
    }
    var wh = !1,
      Th = null,
      Eh = null,
      Dh = null,
      Oh = new Map(),
      kh = new Map(),
      Ah = [],
      jh =
        `mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset`.split(
          ` `,
        );
    function Mh(e, t) {
      switch (e) {
        case `focusin`:
        case `focusout`:
          Th = null;
          break;
        case `dragenter`:
        case `dragleave`:
          Eh = null;
          break;
        case `mouseover`:
        case `mouseout`:
          Dh = null;
          break;
        case `pointerover`:
        case `pointerout`:
          Oh.delete(t.pointerId);
          break;
        case `gotpointercapture`:
        case `lostpointercapture`:
          kh.delete(t.pointerId);
      }
    }
    function Nh(e, t, n, r, i, a) {
      return e === null || e.nativeEvent !== a
        ? ((e = {
            blockedOn: t,
            domEventName: n,
            eventSystemFlags: r,
            nativeEvent: a,
            targetContainers: [i],
          }),
          t !== null && ((t = Vt(t)), t !== null && mh(t)),
          e)
        : ((e.eventSystemFlags |= r),
          (t = e.targetContainers),
          i !== null && t.indexOf(i) === -1 && t.push(i),
          e);
    }
    function Ph(e, t, n, r, i) {
      switch (t) {
        case `focusin`:
          return ((Th = Nh(Th, e, t, n, r, i)), !0);
        case `dragenter`:
          return ((Eh = Nh(Eh, e, t, n, r, i)), !0);
        case `mouseover`:
          return ((Dh = Nh(Dh, e, t, n, r, i)), !0);
        case `pointerover`:
          var a = i.pointerId;
          return (Oh.set(a, Nh(Oh.get(a) || null, e, t, n, r, i)), !0);
        case `gotpointercapture`:
          return (
            (a = i.pointerId),
            kh.set(a, Nh(kh.get(a) || null, e, t, n, r, i)),
            !0
          );
      }
      return !1;
    }
    function Fh(e) {
      var t = Bt(e.target);
      if (t !== null) {
        var n = s(t);
        if (n !== null) {
          if (((t = n.tag), t === 13)) {
            if (((t = c(n)), t !== null)) {
              ((e.blockedOn = t),
                Ot(e.priority, function () {
                  hh(n);
                }));
              return;
            }
          } else if (t === 31) {
            if (((t = l(n)), t !== null)) {
              ((e.blockedOn = t),
                Ot(e.priority, function () {
                  hh(n);
                }));
              return;
            }
          } else if (
            t === 3 &&
            n.stateNode.current.memoizedState.isDehydrated
          ) {
            e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
            return;
          }
        }
      }
      e.blockedOn = null;
    }
    function Ih(e) {
      if (e.blockedOn !== null) return !1;
      for (var t = e.targetContainers; 0 < t.length;) {
        var n = bh(e.nativeEvent);
        if (n === null) {
          n = e.nativeEvent;
          var r = new n.constructor(n.type, n);
          ((Tn = r), n.target.dispatchEvent(r), (Tn = null));
        } else return ((t = Vt(n)), t !== null && mh(t), (e.blockedOn = n), !1);
        t.shift();
      }
      return !0;
    }
    function Lh(e, t, n) {
      Ih(e) && n.delete(t);
    }
    function Rh() {
      ((wh = !1),
        Th !== null && Ih(Th) && (Th = null),
        Eh !== null && Ih(Eh) && (Eh = null),
        Dh !== null && Ih(Dh) && (Dh = null),
        Oh.forEach(Lh),
        kh.forEach(Lh));
    }
    function zh(e, n) {
      e.blockedOn === n &&
        ((e.blockedOn = null),
        wh ||
          ((wh = !0),
          t.unstable_scheduleCallback(t.unstable_NormalPriority, Rh)));
    }
    var Bh = null;
    function Vh(e) {
      Bh !== e &&
        ((Bh = e),
        t.unstable_scheduleCallback(t.unstable_NormalPriority, function () {
          Bh === e && (Bh = null);
          for (var t = 0; t < e.length; t += 3) {
            var n = e[t],
              r = e[t + 1],
              i = e[t + 2];
            if (typeof r != `function`) {
              if (Sh(r || n) === null) continue;
              break;
            }
            var a = Vt(n);
            a !== null &&
              (e.splice(t, 3),
              (t -= 3),
              nc(
                a,
                { pending: !0, data: i, method: n.method, action: r },
                r,
                i,
              ));
          }
        }));
    }
    function Hh(e) {
      function t(t) {
        return zh(t, e);
      }
      (Th !== null && zh(Th, e),
        Eh !== null && zh(Eh, e),
        Dh !== null && zh(Dh, e),
        Oh.forEach(t),
        kh.forEach(t));
      for (var n = 0; n < Ah.length; n++) {
        var r = Ah[n];
        r.blockedOn === e && (r.blockedOn = null);
      }
      for (; 0 < Ah.length && ((n = Ah[0]), n.blockedOn === null);)
        (Fh(n), n.blockedOn === null && Ah.shift());
      if (((n = (e.ownerDocument || e).$$reactFormReplay), n != null))
        for (r = 0; r < n.length; r += 3) {
          var i = n[r],
            a = n[r + 1],
            o = i[jt] || null;
          if (typeof a == `function`) o || Vh(n);
          else if (o) {
            var s = null;
            if (a && a.hasAttribute(`formAction`)) {
              if (((i = a), (o = a[jt] || null))) s = o.formAction;
              else if (Sh(i) !== null) continue;
            } else s = o.action;
            (typeof s == `function`
              ? (n[r + 1] = s)
              : (n.splice(r, 3), (r -= 3)),
              Vh(n));
          }
        }
    }
    function Uh() {
      function e(e) {
        e.canIntercept &&
          e.info === `react-transition` &&
          e.intercept({
            handler: function () {
              return new Promise(function (e) {
                return (i = e);
              });
            },
            focusReset: `manual`,
            scroll: `manual`,
          });
      }
      function t() {
        (i !== null && (i(), (i = null)), r || setTimeout(n, 20));
      }
      function n() {
        if (!r && !navigation.transition) {
          var e = navigation.currentEntry;
          e &&
            e.url != null &&
            navigation.navigate(e.url, {
              state: e.getState(),
              info: `react-transition`,
              history: `replace`,
            });
        }
      }
      if (typeof navigation == `object`) {
        var r = !1,
          i = null;
        return (
          navigation.addEventListener(`navigate`, e),
          navigation.addEventListener(`navigatesuccess`, t),
          navigation.addEventListener(`navigateerror`, t),
          setTimeout(n, 100),
          function () {
            ((r = !0),
              navigation.removeEventListener(`navigate`, e),
              navigation.removeEventListener(`navigatesuccess`, t),
              navigation.removeEventListener(`navigateerror`, t),
              i !== null && (i(), (i = null)));
          }
        );
      }
    }
    function Wh(e) {
      this._internalRoot = e;
    }
    ((Gh.prototype.render = Wh.prototype.render =
      function (e) {
        var t = this._internalRoot;
        if (t === null) throw Error(a(409));
        var n = t.current;
        dh(n, jd(), e, t, null, null);
      }),
      (Gh.prototype.unmount = Wh.prototype.unmount =
        function () {
          var e = this._internalRoot;
          if (e !== null) {
            this._internalRoot = null;
            var t = e.containerInfo;
            (dh(e.current, 2, null, e, null, null), zd(), (t[Mt] = null));
          }
        }));
    function Gh(e) {
      this._internalRoot = e;
    }
    Gh.prototype.unstable_scheduleHydration = function (e) {
      if (e) {
        var t = Dt();
        e = { blockedOn: null, target: e, priority: t };
        for (var n = 0; n < Ah.length && t !== 0 && t < Ah[n].priority; n++);
        (Ah.splice(n, 0, e), n === 0 && Fh(e));
      }
    };
    var Kh = n.version;
    if (Kh !== `19.3.1`) throw Error(a(527, Kh, `19.3.1`));
    T.findDOMNode = function (e) {
      var t = e._reactInternals;
      if (t === void 0)
        throw typeof e.render == `function`
          ? Error(a(188))
          : ((e = Object.keys(e).join(`,`)), Error(a(268, e)));
      return (
        (e = d(t)),
        (e = e === null ? null : f(e)),
        (e = e === null ? null : e.stateNode),
        e
      );
    };
    var qh = {
      bundleType: 0,
      version: `19.3.1`,
      rendererPackageName: `react-dom`,
      currentDispatcherRef: w,
      reconcilerVersion: `19.3.1`,
    };
    if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < `u`) {
      var Jh = __REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!Jh.isDisabled && Jh.supportsFiber)
        try {
          ((rt = Jh.inject(qh)), (it = Jh));
        } catch {}
    }
    e.createRoot = function (e, t) {
      if (!o(e)) throw Error(a(299));
      var n = !1,
        r = ``,
        i = Tc,
        s = Ec,
        c = Dc;
      return (
        t != null &&
          (!0 === t.unstable_strictMode && (n = !0),
          t.identifierPrefix !== void 0 && (r = t.identifierPrefix),
          t.onUncaughtError !== void 0 && (i = t.onUncaughtError),
          t.onCaughtError !== void 0 && (s = t.onCaughtError),
          t.onRecoverableError !== void 0 && (c = t.onRecoverableError)),
        (t = lh(e, 1, !1, null, null, n, r, null, i, s, c, Uh)),
        (e[Mt] = t.current),
        Wf(e),
        new Wh(t)
      );
    };
  }),
  Be = n((e, t) => {
    function n() {
      if (
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < `u` &&
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE == `function`
      )
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
        } catch (e) {
          console.error(e);
        }
    }
    (n(), (t.exports = ze()));
  }),
  Ve = class extends se {
    #e;
    #t;
    #n;
    #r;
    constructor(e) {
      (super(),
        (this.#e = e.client),
        (this.mutationId = e.mutationId),
        (this.#n = e.mutationCache),
        (this.#t = []),
        (this.state = e.state || He()),
        this.setOptions(e.options),
        this.scheduleGc());
    }
    setOptions(e) {
      ((this.options = e), this.updateGcTime(this.options.gcTime));
    }
    get meta() {
      return this.options.meta;
    }
    addObserver(e) {
      this.#t.includes(e) ||
        (this.#t.push(e),
        this.clearGcTimeout(),
        this.#n.notify({ type: `observerAdded`, mutation: this, observer: e }));
    }
    removeObserver(e) {
      ((this.#t = this.#t.filter((t) => t !== e)),
        this.scheduleGc(),
        this.#n.notify({
          type: `observerRemoved`,
          mutation: this,
          observer: e,
        }));
    }
    optionalRemove() {
      this.#t.length ||
        (this.state.status === `pending`
          ? this.scheduleGc()
          : this.#n.remove(this));
    }
    continue() {
      return (
        this.#r?.continue() ??
        (this.state.status === `pending`
          ? this.execute(this.state.variables)
          : Promise.resolve())
      );
    }
    async execute(e) {
      let t = () => {
          this.#i({ type: `continue` });
        },
        n = {
          client: this.#e,
          meta: this.options.meta,
          mutationKey: this.options.mutationKey,
        },
        r = (this.#r = y({
          fn: () =>
            this.options.mutationFn
              ? this.options.mutationFn(e, n)
              : Promise.reject(Error(`No mutationFn found`)),
          onFail: (e, t) => {
            this.#i({ type: `failed`, failureCount: e, error: t });
          },
          onPause: () => {
            this.#i({ type: `pause` });
          },
          onContinue: t,
          retry: this.options.retry ?? 0,
          retryDelay: this.options.retryDelay,
          networkMode: this.options.networkMode,
          canRun: () => this.#n.canRun(this),
        })),
        i = this.state.status === `pending`,
        a = !r.canStart();
      try {
        if (i) t();
        else {
          (this.#i({ type: `pending`, variables: e, isPaused: a }),
            this.#n.config.onMutate &&
              (await this.#n.config.onMutate(e, this, n)));
          let t = await this.options.onMutate?.(e, n);
          t !== this.state.context &&
            this.#i({ type: `pending`, context: t, variables: e, isPaused: a });
        }
        let o = await r.start();
        return (
          await this.#n.config.onSuccess?.(o, e, this.state.context, this, n),
          await this.options.onSuccess?.(o, e, this.state.context, n),
          await this.#n.config.onSettled?.(
            o,
            null,
            this.state.variables,
            this.state.context,
            this,
            n,
          ),
          await this.options.onSettled?.(o, null, e, this.state.context, n),
          this.#i({ type: `success`, data: o }),
          o
        );
      } catch (t) {
        try {
          await this.#n.config.onError?.(t, e, this.state.context, this, n);
        } catch (e) {
          Promise.reject(e);
        }
        try {
          await this.options.onError?.(t, e, this.state.context, n);
        } catch (e) {
          Promise.reject(e);
        }
        try {
          await this.#n.config.onSettled?.(
            void 0,
            t,
            this.state.variables,
            this.state.context,
            this,
            n,
          );
        } catch (e) {
          Promise.reject(e);
        }
        try {
          await this.options.onSettled?.(void 0, t, e, this.state.context, n);
        } catch (e) {
          Promise.reject(e);
        }
        throw (this.#i({ type: `error`, error: t }), t);
      } finally {
        (this.#r === r && (this.#r = void 0), this.#n.runNext(this));
      }
    }
    #i(e) {
      let t = (t) => {
        switch (e.type) {
          case `failed`:
            return {
              ...t,
              failureCount: e.failureCount,
              failureReason: e.error,
            };
          case `pause`:
            return { ...t, isPaused: !0 };
          case `continue`:
            return { ...t, isPaused: !1 };
          case `pending`:
            return {
              ...t,
              context: e.context,
              data: void 0,
              failureCount: 0,
              failureReason: null,
              error: null,
              isPaused: e.isPaused,
              status: `pending`,
              variables: e.variables,
              submittedAt: Date.now(),
            };
          case `success`:
            return {
              ...t,
              data: e.data,
              failureCount: 0,
              failureReason: null,
              error: null,
              status: `success`,
              isPaused: !1,
            };
          case `error`:
            return {
              ...t,
              data: void 0,
              error: e.error,
              failureCount: t.failureCount + 1,
              failureReason: e.error,
              isPaused: !1,
              status: `error`,
            };
        }
      };
      ((this.state = t(this.state)),
        g.batch(() => {
          (this.#t.forEach((t) => {
            t.onMutationUpdate(e);
          }),
            this.#n.notify({ mutation: this, type: `updated`, action: e }));
        }));
    }
  };
function He() {
  return {
    context: void 0,
    data: void 0,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: !1,
    status: `idle`,
    variables: void 0,
    submittedAt: 0,
  };
}
var Ue = class extends ae {
  #e;
  #t;
  #n;
  constructor(e = {}) {
    (super(),
      (this.config = e),
      (this.#e = new Set()),
      (this.#t = new Map()),
      (this.#n = 0));
  }
  build(e, t, n) {
    let r = new Ve({
      client: e,
      mutationCache: this,
      mutationId: ++this.#n,
      options: e.defaultMutationOptions(t),
      state: n,
    });
    return (this.add(r), r);
  }
  add(e) {
    this.#e.add(e);
    let t = We(e);
    if (typeof t == `string`) {
      let n = this.#t.get(t);
      n ? n.push(e) : this.#t.set(t, [e]);
    }
    this.notify({ type: `added`, mutation: e });
  }
  remove(e) {
    if (this.#e.delete(e)) {
      let t = We(e);
      if (typeof t == `string`) {
        let n = this.#t.get(t);
        if (n) {
          if (n.length > 1) {
            let t = n.indexOf(e);
            t !== -1 && n.splice(t, 1);
          } else n[0] === e && this.#t.delete(t);
        }
      }
    }
    this.notify({ type: `removed`, mutation: e });
  }
  canRun(e) {
    let t = We(e);
    if (typeof t == `string`) {
      let n = this.#t.get(t)?.find((e) => e.state.status === `pending`);
      return !n || n === e;
    }
    return !0;
  }
  runNext(e) {
    let t = We(e);
    return typeof t == `string`
      ? (this.#t
          .get(t)
          ?.find((t) => t !== e && t.state.isPaused)
          ?.continue() ?? Promise.resolve())
      : Promise.resolve();
  }
  clear() {
    g.batch(() => {
      let e = this.getAll();
      (this.#e.clear(),
        this.#t.clear(),
        e.forEach((e) => {
          this.notify({ type: `removed`, mutation: e });
        }));
    });
  }
  getAll() {
    return Array.from(this.#e);
  }
  find(e) {
    let t = { exact: !0, ...e };
    return this.getAll().find((e) => m(t, e));
  }
  findAll(e = {}) {
    return this.getAll().filter((t) => m(e, t));
  }
  notify(e) {
    g.batch(() => {
      this.listeners.forEach((t) => {
        t(e);
      });
    });
  }
  resumePausedMutations() {
    let e = this.getAll().filter((e) => e.state.isPaused);
    return g.batch(() => Promise.all(e.map((e) => e.continue().catch(a))));
  }
};
function We(e) {
  return e.options.scope?.id;
}
var Ge = class extends ae {
    #e;
    #t = void 0;
    #n;
    #r;
    constructor(e, t) {
      (super(),
        (this.#e = e),
        this.setOptions(t),
        this.bindMethods(),
        this.#i());
    }
    bindMethods() {
      ((this.mutate = this.mutate.bind(this)),
        (this.reset = this.reset.bind(this)));
    }
    setOptions(e) {
      let t = this.options;
      ((this.options = this.#e.defaultMutationOptions(e)),
        p(this.options, t) ||
          this.#e
            .getMutationCache()
            .notify({
              type: `observerOptionsUpdated`,
              mutation: this.#n,
              observer: this,
            }),
        t?.mutationKey &&
        this.options.mutationKey &&
        c(t.mutationKey) !== c(this.options.mutationKey)
          ? this.reset()
          : this.#n?.state.status === `pending` &&
            this.#n.setOptions(this.options));
    }
    onSubscribe() {
      this.listeners.size === 1 &&
        this.#n &&
        (this.#n.addObserver(this), this.#i());
    }
    onUnsubscribe() {
      this.hasListeners() || this.#n?.removeObserver(this);
    }
    onMutationUpdate(e) {
      (this.#i(), this.#a(e));
    }
    getCurrentResult() {
      return this.#t;
    }
    reset() {
      (this.#n?.removeObserver(this), (this.#n = void 0), this.#i(), this.#a());
    }
    mutate(e, t) {
      return (
        (this.#r = t),
        this.#n?.removeObserver(this),
        (this.#n = this.#e.getMutationCache().build(this.#e, this.options)),
        this.#n.addObserver(this),
        this.#n.execute(e)
      );
    }
    #i() {
      let e = this.#n?.state ?? He();
      this.#t = {
        ...e,
        isPending: e.status === `pending`,
        isSuccess: e.status === `success`,
        isError: e.status === `error`,
        isIdle: e.status === `idle`,
        mutate: this.mutate,
        reset: this.reset,
      };
    }
    #a(e) {
      g.batch(() => {
        let t = this.#r;
        if (t && this.hasListeners()) {
          let n = this.#t.variables,
            r = this.#t.context,
            i = {
              client: this.#e,
              meta: this.options.meta,
              mutationKey: this.options.mutationKey,
            };
          if (e?.type === `success`) {
            try {
              t.onSuccess?.(e.data, n, r, i);
            } catch (e) {
              Promise.reject(e);
            }
            try {
              t.onSettled?.(e.data, null, n, r, i);
            } catch (e) {
              Promise.reject(e);
            }
          } else if (e?.type === `error`) {
            try {
              t.onError?.(e.error, n, r, i);
            } catch (e) {
              Promise.reject(e);
            }
            try {
              t.onSettled?.(void 0, e.error, n, r, i);
            } catch (e) {
              Promise.reject(e);
            }
          }
        }
        this.listeners.forEach((e) => {
          e(this.#t);
        });
      });
    }
  },
  Ke = class extends ae {
    #e;
    constructor(e = {}) {
      (super(), (this.config = e), (this.#e = new Map()));
    }
    build(e, t, n) {
      let r = t.queryKey,
        i = t.queryHash ?? s(r, t),
        a = this.get(i);
      return (
        a ||
          ((a = new ee({
            client: e,
            queryKey: r,
            queryHash: i,
            options: e.defaultQueryOptions(t),
            state: n,
            defaultOptions: e.getQueryDefaults(r),
          })),
          this.add(a)),
        a
      );
    }
    add(e) {
      this.#e.has(e.queryHash) ||
        (this.#e.set(e.queryHash, e), this.notify({ type: `added`, query: e }));
    }
    remove(e) {
      this.#e.get(e.queryHash) === e &&
        (e.destroy(),
        this.#e.delete(e.queryHash),
        this.notify({ type: `removed`, query: e }));
    }
    clear() {
      g.batch(() => {
        this.getAll().forEach((e) => {
          this.remove(e);
        });
      });
    }
    get(e) {
      return this.#e.get(e);
    }
    getAll() {
      return [...this.#e.values()];
    }
    find(e) {
      let t = { exact: !0, ...e };
      return this.getAll().find((e) => ne(t, e));
    }
    findAll(e = {}) {
      let t = this.getAll();
      return Object.keys(e).length > 0 ? t.filter((t) => ne(e, t)) : t;
    }
    notify(e) {
      g.batch(() => {
        this.listeners.forEach((t) => {
          t(e);
        });
      });
    }
    onFocus() {
      g.batch(() => {
        this.getAll().forEach((e) => {
          e.onFocus();
        });
      });
    }
    onOnline() {
      g.batch(() => {
        this.getAll().forEach((e) => {
          e.onOnline();
        });
      });
    }
  },
  qe = class {
    #e;
    #t;
    #n;
    #r;
    #i;
    #a;
    #o;
    #s;
    constructor(e = {}) {
      ((this.#e = e.queryCache || new Ke()),
        (this.#t = e.mutationCache || new Ue()),
        (this.#n = e.defaultOptions || {}),
        (this.#r = new Map()),
        (this.#i = new Map()),
        (this.#a = 0));
    }
    mount() {
      (this.#a++,
        this.#a === 1 &&
          ((this.#o = o.subscribe(async (e) => {
            e && (await this.resumePausedMutations(), this.#e.onFocus());
          })),
          (this.#s = oe.subscribe(async (e) => {
            e && (await this.resumePausedMutations(), this.#e.onOnline());
          }))));
    }
    unmount() {
      (this.#a--,
        this.#a === 0 &&
          (this.#o?.(), (this.#o = void 0), this.#s?.(), (this.#s = void 0)));
    }
    isFetching(e) {
      return this.#e.findAll({ ...e, fetchStatus: `fetching` }).length;
    }
    isMutating(e) {
      return this.#t.findAll({ ...e, status: `pending` }).length;
    }
    getQueryData(e) {
      let t = this.defaultQueryOptions({ queryKey: e });
      return this.#e.get(t.queryHash)?.state.data;
    }
    ensureQueryData(e) {
      let t = this.defaultQueryOptions(e),
        n = this.#e.build(this, t),
        r = n.state.data;
      return r === void 0
        ? this.fetchQuery(e)
        : (e.revalidateIfStale &&
            n.isStaleByTime(f(t.staleTime, n)) &&
            this.prefetchQuery(t),
          Promise.resolve(r));
    }
    getQueriesData(e) {
      return this.#e.findAll(e).map(({ queryKey: e, state: t }) => [e, t.data]);
    }
    setQueryData(e, t, n) {
      let r = this.defaultQueryOptions({ queryKey: e }),
        i = this.#e.get(r.queryHash)?.state.data,
        a = _(t, i);
      if (a !== void 0)
        return this.#e.build(this, r).setData(a, { ...n, manual: !0 });
    }
    setQueriesData(e, t, n) {
      return g.batch(() =>
        this.#e
          .findAll(e)
          .map(({ queryKey: e }) => [e, this.setQueryData(e, t, n)]),
      );
    }
    getQueryState(e) {
      let t = this.defaultQueryOptions({ queryKey: e });
      return this.#e.get(t.queryHash)?.state;
    }
    removeQueries(e) {
      let t = this.#e;
      g.batch(() => {
        t.findAll(e).forEach((e) => {
          t.remove(e);
        });
      });
    }
    resetQueries(e, t) {
      let n = this.#e;
      return g.batch(() => {
        let r = n.findAll(e),
          i = new Set(r);
        return (
          r.forEach((e) => {
            e.reset();
          }),
          this.refetchQueries({ type: `active`, predicate: (e) => i.has(e) }, t)
        );
      });
    }
    cancelQueries(e, t = {}) {
      let n = { revert: !0, ...t },
        r = g.batch(() => this.#e.findAll(e).map((e) => e.cancel(n)));
      return Promise.all(r).then(a).catch(a);
    }
    invalidateQueries(e, t = {}) {
      return g.batch(
        () => (
          this.#e.findAll(e).forEach((e) => {
            e.invalidate();
          }),
          e?.refetchType === `none`
            ? Promise.resolve()
            : this.refetchQueries(
                { ...e, type: e?.refetchType ?? e?.type ?? `active` },
                t,
              )
        ),
      );
    }
    refetchQueries(e, t = {}) {
      let n = { ...t, cancelRefetch: t.cancelRefetch ?? !0 },
        r = g.batch(() =>
          this.#e
            .findAll(e)
            .filter((e) => !e.isDisabled() && !e.isStatic())
            .map((e) => {
              let t = e.fetch(void 0, n);
              return (
                n.throwOnError || (t = t.catch(a)),
                e.state.fetchStatus === `paused` ? Promise.resolve() : t
              );
            }),
        );
      return Promise.all(r).then(a);
    }
    async query(e) {
      let t = this.defaultQueryOptions(e);
      t.retry === void 0 && (t.retry = !1);
      let n = this.#e.build(this, t),
        r = n.isStaleByTime(f(t.staleTime, n))
          ? await n.fetch(t)
          : n.state.data,
        i = t.select;
      return i ? i(r) : r;
    }
    fetchQuery(e) {
      let t = this.defaultQueryOptions(e);
      t.retry === void 0 && (t.retry = !1);
      let n = this.#e.build(this, t);
      return n.isStaleByTime(f(t.staleTime, n))
        ? n.fetch(t)
        : Promise.resolve(n.state.data);
    }
    prefetchQuery(e) {
      return this.fetchQuery(e).then(a).catch(a);
    }
    infiniteQuery(e) {
      return ((e._type = `infinite`), this.query(e));
    }
    fetchInfiniteQuery(e) {
      return ((e._type = `infinite`), this.fetchQuery(e));
    }
    prefetchInfiniteQuery(e) {
      return this.fetchInfiniteQuery(e).then(a).catch(a);
    }
    ensureInfiniteQueryData(e) {
      return ((e._type = `infinite`), this.ensureQueryData(e));
    }
    resumePausedMutations() {
      return oe.isOnline()
        ? this.#t.resumePausedMutations()
        : Promise.resolve();
    }
    getQueryCache() {
      return this.#e;
    }
    getMutationCache() {
      return this.#t;
    }
    getDefaultOptions() {
      return this.#n;
    }
    setDefaultOptions(e) {
      this.#n = e;
    }
    setQueryDefaults(e, t) {
      this.#r.set(c(e), { queryKey: e, defaultOptions: t });
    }
    getQueryDefaults(e) {
      let t = [...this.#r.values()],
        n = {};
      return (
        t.forEach((t) => {
          te(e, t.queryKey) && Object.assign(n, t.defaultOptions);
        }),
        n
      );
    }
    setMutationDefaults(e, t) {
      this.#i.set(c(e), { mutationKey: e, defaultOptions: t });
    }
    getMutationDefaults(e) {
      let t = [...this.#i.values()],
        n = {};
      return (
        t.forEach((t) => {
          te(e, t.mutationKey) && Object.assign(n, t.defaultOptions);
        }),
        n
      );
    }
    defaultQueryOptions(e) {
      if (e._defaulted) return e;
      let t = {
        ...this.#n.queries,
        ...this.getQueryDefaults(e.queryKey),
        ...e,
        _defaulted: !0,
      };
      return (
        (t.queryHash ||= s(t.queryKey, t)),
        t.refetchOnReconnect === void 0 &&
          (t.refetchOnReconnect = t.networkMode !== `always`),
        t.throwOnError === void 0 && (t.throwOnError = !!t.suspense),
        !t.networkMode && t.persister && (t.networkMode = `offlineFirst`),
        t.queryFn === l && (t.enabled = !1),
        t
      );
    }
    defaultMutationOptions(e) {
      return e?._defaulted
        ? e
        : {
            ...this.#n.mutations,
            ...(e?.mutationKey && this.getMutationDefaults(e.mutationKey)),
            ...e,
            _defaulted: !0,
          };
    }
    clear() {
      (this.#e.clear(), this.#t.clear());
    }
  },
  k = e(r(), 1);
function Je(e, t) {
  let n = d(t),
    [r] = k.useState(() => new Ge(n, e));
  k.useEffect(() => {
    r.setOptions(e);
  }, [r, e]);
  let i = k.useSyncExternalStore(
      k.useCallback((e) => r.subscribe(g.batchCalls(e)), [r]),
      () => r.getCurrentResult(),
      () => r.getCurrentResult(),
    ),
    o = k.useCallback(
      (...e) => {
        r.mutate(e[0], e[1]).catch(a);
      },
      [r],
    );
  if (i.error && h(r.options.throwOnError, [i.error])) throw i.error;
  return { ...i, mutate: o, mutateAsync: i.mutate };
}
function Ye(e, t) {
  if (typeof e == `function`) return e(t);
  e != null && (e.current = t);
}
function Xe(...e) {
  return (t) => {
    let n = !1,
      r = e.map((e) => {
        let r = Ye(e, t);
        return (!n && typeof r == `function` && (n = !0), r);
      });
    if (n)
      return () => {
        for (let t = 0; t < r.length; t++) {
          let n = r[t];
          typeof n == `function` ? n() : Ye(e[t], null);
        }
      };
  };
}
function Ze(...e) {
  return k.useCallback(Xe(...e), e);
}
var A = i(),
  Qe = class extends k.Component {
    getSnapshotBeforeUpdate(e) {
      let t = this.props.childRef.current;
      if (
        w(t) &&
        e.isPresent &&
        !this.props.isPresent &&
        this.props.pop !== !1
      ) {
        let e = t.offsetParent,
          n = (w(e) && e.offsetWidth) || 0,
          r = (w(e) && e.offsetHeight) || 0,
          i = getComputedStyle(t),
          a = this.props.sizeRef.current;
        ((a.height = parseFloat(i.height)),
          (a.width = parseFloat(i.width)),
          (a.top = t.offsetTop),
          (a.left = t.offsetLeft),
          (a.right = n - a.width - a.left),
          (a.bottom = r - a.height - a.top),
          (a.direction = i.direction));
      }
      return null;
    }
    componentDidUpdate() {}
    render() {
      return this.props.children;
    }
  };
function $e({
  children: e,
  isPresent: t,
  anchorX: n,
  anchorY: r,
  root: i,
  pop: a,
}) {
  let o = (0, k.useId)(),
    s = (0, k.useRef)(null),
    c = (0, k.useRef)({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      direction: `ltr`,
    }),
    { nonce: l } = (0, k.useContext)(be),
    u = Ze(s, a === !1 ? void 0 : (e.props?.ref ?? e?.ref));
  return (
    (0, k.useInsertionEffect)(() => {
      let {
        width: e,
        height: u,
        top: d,
        left: f,
        right: p,
        bottom: m,
        direction: h,
      } = c.current;
      if (t || a === !1 || !s.current || !e || !u) return;
      let g = h === `rtl`,
        _ =
          n === `left`
            ? g
              ? `right: ${p}`
              : `left: ${f}`
            : g
              ? `left: ${f}`
              : `right: ${p}`,
        v = r === `bottom` ? `bottom: ${m}` : `top: ${d}`;
      s.current.dataset.motionPopId = o;
      let y = document.createElement(`style`);
      l && (y.nonce = l);
      let b = i ?? document.head;
      return (
        b.appendChild(y),
        y.sheet &&
          y.sheet.insertRule(`
          [data-motion-pop-id="${o}"] {
            position: absolute !important;
            width: ${e}px !important;
            height: ${u}px !important;
            ${_}px !important;
            ${v}px !important;
          }
        `),
        () => {
          (s.current?.removeAttribute(`data-motion-pop-id`),
            b.contains(y) && b.removeChild(y));
        }
      );
    }, [t]),
    (0, A.jsx)(Qe, {
      isPresent: t,
      childRef: s,
      sizeRef: c,
      pop: a,
      children: a === !1 ? e : k.cloneElement(e, { ref: u }),
    })
  );
}
var et = ({
  children: e,
  initial: t,
  isPresent: n,
  onExitComplete: r,
  custom: i,
  presenceAffectsLayout: a,
  mode: o,
  anchorX: s,
  anchorY: c,
  root: l,
}) => {
  let u = ye(tt),
    d = (0, k.useId)(),
    f = (0, k.useRef)(n),
    p = (0, k.useRef)(r);
  xe(() => {
    ((f.current = n), (p.current = r));
  });
  let m = !0,
    h = (0, k.useMemo)(
      () => (
        (m = !1),
        {
          id: d,
          initial: t,
          isPresent: n,
          custom: i,
          onExitComplete: (e) => {
            u.set(e, !0);
            for (let e of u.values()) if (!e) return;
            r && r();
          },
          register: (e) => (
            u.set(e, !1),
            () => {
              (u.delete(e), !f.current && !u.size && p.current?.());
            }
          ),
        }
      ),
      [n, u, r],
    );
  return (
    a && m && (h = { ...h }),
    (0, k.useMemo)(() => {
      u.forEach((e, t) => u.set(t, !1));
    }, [n]),
    k.useEffect(() => {
      !n && !u.size && r && r();
    }, [n]),
    (e = (0, A.jsx)($e, {
      pop: o === `popLayout`,
      isPresent: n,
      anchorX: s,
      anchorY: c,
      root: l,
      children: e,
    })),
    (0, A.jsx)(Se.Provider, { value: h, children: e })
  );
};
function tt() {
  return new Map();
}
var nt = (e) => e.key || ``;
function rt(e) {
  let t = [];
  return (
    k.Children.forEach(e, (e) => {
      (0, k.isValidElement)(e) && t.push(e);
    }),
    t
  );
}
var it = ({
    children: e,
    custom: t,
    initial: n = !0,
    onExitComplete: r,
    presenceAffectsLayout: i = !0,
    mode: a = `sync`,
    propagate: o = !1,
    anchorX: s = `left`,
    anchorY: c = `top`,
    root: l,
  }) => {
    let [u, d] = Ce(o),
      f = (0, k.useMemo)(() => rt(e), [e]),
      p = o && !u ? [] : f.map(nt),
      m = (0, k.useRef)(!0),
      h = (0, k.useRef)(f),
      g = ye(() => new Map()),
      _ = (0, k.useRef)(new Set()),
      [v, y] = (0, k.useState)(f),
      [b, ee] = (0, k.useState)(f);
    xe(() => {
      ((m.current = !1), (h.current = f));
      for (let e = 0; e < b.length; e++) {
        let t = nt(b[e]);
        p.includes(t)
          ? (g.delete(t), _.current.delete(t))
          : g.get(t) !== !0 && g.set(t, !1);
      }
    }, [b, p.length, p.join(`-`)]);
    let te = [];
    if (f !== v) {
      let e = [...f];
      for (let t = 0; t < b.length; t++) {
        let n = b[t],
          r = nt(n);
        p.includes(r) || (e.splice(t, 0, n), te.push(n));
      }
      return (a === `wait` && te.length && (e = te), ee(rt(e)), y(f), null);
    }
    let { forceRender: ne } = (0, k.useContext)(Te);
    return (0, A.jsx)(A.Fragment, {
      children: b.map((e) => {
        let v = nt(e),
          y = o && !u ? !1 : f === b || p.includes(v);
        return (0, A.jsx)(
          et,
          {
            isPresent: y,
            initial: !m.current || n ? void 0 : !1,
            custom: t,
            presenceAffectsLayout: i,
            mode: a,
            root: l,
            onExitComplete: y
              ? void 0
              : () => {
                  if (_.current.has(v)) return;
                  if (g.has(v)) (_.current.add(v), g.set(v, !0));
                  else return;
                  let e = !0;
                  (g.forEach((t) => {
                    t || (e = !1);
                  }),
                    e && (ne?.(), ee(h.current), o && d?.(), r && r()));
                },
            anchorX: s,
            anchorY: c,
            children: e,
          },
          v,
        );
      }),
    });
  },
  at = {
    name: `chart-column`,
    size: 24,
    node: [
      [`path`, { d: `M3 3v16a2 2 0 0 0 2 2h16`, key: `c24i48` }],
      [`path`, { d: `M18 17V9`, key: `2bz60n` }],
      [`path`, { d: `M13 17V5`, key: `1frdt8` }],
      [`path`, { d: `M8 17v-3`, key: `17ska0` }],
    ],
    aliases: [`bar-chart-3`],
  };
at.node;
var ot = E(at),
  st = {
    name: `chevron-down`,
    size: 24,
    node: [[`path`, { d: `m6 9 6 6 6-6`, key: `qrunsl` }]],
  };
st.node;
var ct = E(st),
  lt = {
    name: `chevron-right`,
    size: 24,
    node: [[`path`, { d: `m9 18 6-6-6-6`, key: `mthhwq` }]],
  };
lt.node;
var ut = E(lt),
  dt = {
    name: `cloud-off`,
    size: 24,
    node: [
      [
        `path`,
        {
          d: `M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057`,
          key: `1uxyv8`,
        },
      ],
      [
        `path`,
        {
          d: `M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78`,
          key: `99tcn7`,
        },
      ],
      [`path`, { d: `m2 2 20 20`, key: `1ooewy` }],
    ],
  };
dt.node;
var ft = E(dt),
  pt = {
    name: `copy`,
    size: 24,
    node: [
      [
        `rect`,
        {
          width: `14`,
          height: `14`,
          x: `8`,
          y: `8`,
          rx: `2`,
          ry: `2`,
          key: `17jyea`,
        },
      ],
      [
        `path`,
        {
          d: `M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2`,
          key: `zix9uf`,
        },
      ],
    ],
  };
pt.node;
var mt = E(pt),
  ht = {
    name: `ellipsis`,
    size: 24,
    node: [
      [`circle`, { cx: `12`, cy: `12`, r: `1`, key: `41hilf` }],
      [`circle`, { cx: `19`, cy: `12`, r: `1`, key: `1wjl8i` }],
      [`circle`, { cx: `5`, cy: `12`, r: `1`, key: `1pcz8c` }],
    ],
    aliases: [`more-horizontal`],
  };
ht.node;
var gt = E(ht),
  _t = {
    name: `folder`,
    size: 24,
    node: [
      [
        `path`,
        {
          d: `M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z`,
          key: `1kt360`,
        },
      ],
    ],
  };
_t.node;
var vt = E(_t),
  yt = {
    name: `house`,
    size: 24,
    node: [
      [
        `path`,
        { d: `M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8`, key: `5wwlr5` },
      ],
      [
        `path`,
        {
          d: `M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z`,
          key: `r6nss1`,
        },
      ],
    ],
    aliases: [`home`],
  };
yt.node;
var bt = E(yt),
  xt = {
    name: `inbox`,
    size: 24,
    node: [
      [
        `polyline`,
        { points: `22 12 16 12 14 15 10 15 8 12 2 12`, key: `o97t9d` },
      ],
      [
        `path`,
        {
          d: `M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z`,
          key: `oot6mr`,
        },
      ],
    ],
  };
xt.node;
var St = E(xt),
  Ct = {
    name: `info`,
    size: 24,
    node: [
      [`circle`, { cx: `12`, cy: `12`, r: `10`, key: `1mglay` }],
      [`path`, { d: `M12 16v-4`, key: `1dtifu` }],
      [`path`, { d: `M12 8h.01`, key: `e9boi3` }],
    ],
  };
Ct.node;
var wt = E(Ct),
  Tt = {
    name: `layers`,
    size: 24,
    node: [
      [
        `path`,
        {
          d: `M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z`,
          key: `zw3jo`,
        },
      ],
      [
        `path`,
        {
          d: `M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12`,
          key: `1wduqc`,
        },
      ],
      [
        `path`,
        {
          d: `M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17`,
          key: `kqbvx6`,
        },
      ],
    ],
    aliases: [`layers-3`],
  };
Tt.node;
var Et = E(Tt),
  Dt = {
    name: `message-circle`,
    size: 24,
    node: [
      [
        `path`,
        {
          d: `M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719`,
          key: `1sd12s`,
        },
      ],
    ],
  };
Dt.node;
var Ot = E(Dt),
  kt = {
    name: `plus`,
    size: 24,
    node: [
      [`path`, { d: `M5 12h14`, key: `1ays0h` }],
      [`path`, { d: `M12 5v14`, key: `s699le` }],
    ],
  };
kt.node;
var At = E(kt),
  jt = {
    name: `rotate-ccw`,
    size: 24,
    node: [
      [
        `path`,
        {
          d: `M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8`,
          key: `1357e3`,
        },
      ],
      [`path`, { d: `M3 3v5h5`, key: `1xhq8a` }],
    ],
  };
jt.node;
var Mt = E(jt),
  Nt = {
    name: `search`,
    size: 24,
    node: [
      [`path`, { d: `m21 21-4.34-4.34`, key: `14j7rj` }],
      [`circle`, { cx: `11`, cy: `11`, r: `8`, key: `4ej97u` }],
    ],
  };
Nt.node;
var Pt = E(Nt),
  Ft = {
    name: `sliders-horizontal`,
    size: 24,
    node: [
      [`path`, { d: `M10 5H3`, key: `1qgfaw` }],
      [`path`, { d: `M12 19H3`, key: `yhmn1j` }],
      [`path`, { d: `M14 3v4`, key: `1sua03` }],
      [`path`, { d: `M16 17v4`, key: `1q0r14` }],
      [`path`, { d: `M21 12h-9`, key: `1o4lsq` }],
      [`path`, { d: `M21 19h-5`, key: `1rlt1p` }],
      [`path`, { d: `M21 5h-7`, key: `1oszz2` }],
      [`path`, { d: `M8 10v4`, key: `tgpxqk` }],
      [`path`, { d: `M8 12H3`, key: `a7s4jb` }],
    ],
  };
Ft.node;
var It = E(Ft),
  Lt = {
    name: `waypoints`,
    size: 24,
    node: [
      [`path`, { d: `m10.586 5.414-5.172 5.172`, key: `4mc350` }],
      [`path`, { d: `m18.586 13.414-5.172 5.172`, key: `8c96vv` }],
      [`path`, { d: `M6 12h12`, key: `8npq4p` }],
      [`circle`, { cx: `12`, cy: `20`, r: `2`, key: `144qzu` }],
      [`circle`, { cx: `12`, cy: `4`, r: `2`, key: `muu5ef` }],
      [`circle`, { cx: `20`, cy: `12`, r: `2`, key: `1xzzfp` }],
      [`circle`, { cx: `4`, cy: `12`, r: `2`, key: `1hvhnz` }],
    ],
  };
Lt.node;
var Rt = E(Lt),
  zt = {
    name: `x`,
    size: 24,
    node: [
      [`path`, { d: `M18 6 6 18`, key: `1bl5f8` }],
      [`path`, { d: `m6 6 12 12`, key: `d8bk6v` }],
    ],
  };
zt.node;
var Bt = E(zt),
  Vt = Be(),
  j = { staleTime: 3e4, refetchOnWindowFocus: !0 };
function Ht(...e) {
  return x({ ...j, queryKey: [`home`], queryFn: () => S().getHome() });
}
function Ut(...e) {
  return x({ ...j, queryKey: [`projects`], queryFn: () => S().listProjects() });
}
function Wt(...e) {
  return x({
    ...j,
    queryKey: [`plan-revisions`, e[0]],
    queryFn: () => S().listPlanRevisions(e[0]),
  });
}
function Gt(...e) {
  return x({
    ...j,
    queryKey: [`project`, e[0]],
    queryFn: () => S().getProject(e[0]),
  });
}
function Kt(...e) {
  return x({
    ...j,
    queryKey: [`checkpoint`, e[0], e[1]],
    queryFn: () => S().getCheckpoint(e[0], e[1]),
  });
}
function qt(...e) {
  return x({
    ...j,
    queryKey: [`sessions`, e[0] ?? `all`],
    queryFn: () => S().listSessions(e[0]),
  });
}
function Jt(...e) {
  return x({
    ...j,
    queryKey: [`session`, e[0], e[1]],
    queryFn: () => S().getSession(e[0], e[1]),
  });
}
function Yt(...e) {
  return x({
    ...j,
    queryKey: [`proposals`],
    queryFn: () => S().listProposals(),
  });
}
function Xt(...e) {
  return x({
    ...j,
    queryKey: [`proposal`, e[0]],
    queryFn: () => S().getProposal(e[0]),
  });
}
function Zt(...e) {
  return x({ ...j, queryKey: [`decks`], queryFn: () => S().getDeckTree() });
}
function Qt(...e) {
  return x({
    ...j,
    queryKey: [`review-items`, e[0]],
    queryFn: () => S().getReviewItems(e[0]),
  });
}
function M(...e) {
  return x({
    ...j,
    queryKey: [`card`, e[0]],
    queryFn: () => S().getCard(e[0]),
  });
}
function $t(...e) {
  return x({ ...j, queryKey: [`atlas`], queryFn: () => S().getAtlas() });
}
function en(...e) {
  return x({
    ...j,
    queryKey: [`insights`, e[0]],
    queryFn: () => S().getInsightData(e[0]),
  });
}
function tn(...e) {
  return x({ ...j, queryKey: [`settings`], queryFn: () => S().getSettings() });
}
function nn(...e) {
  return x({ ...j, queryKey: [`styles`], queryFn: () => S().listStyles() });
}
function rn(...e) {
  return x({ ...j, queryKey: [`subjects`], queryFn: () => S().listSubjects() });
}
function an(...e) {
  return x({ ...j, queryKey: [`auth`], queryFn: () => S().getAuth() });
}
function on(...e) {
  return x({
    ...j,
    queryKey: [`review-log`],
    queryFn: () => S().getReviewLog(),
  });
}
function N(e, t) {
  let n = d();
  return Je({
    mutationFn: (t) => e(S(), t),
    onSuccess: async () => {
      if(t.includes(`subjects`))await window.__lemmaNotebook?.refreshCatalog?.();
      t.includes(`*`)
        ? n.clear()
        : await Promise.all(
            t.map((e) => n.invalidateQueries({ queryKey: [e] })),
          );
    },
  });
}
function sn() {
  return N((e, t) => e.signIn(), [`auth`]);
}
function cn() {
  return N((e, t) => e.signOut(), [`*`]);
}
function ln() {
  return N((e, t) => e.updateSettings(t), [`settings`]);
}
function un() {
  return N((e, t) => e.rotateConnectorSecret(), [`settings`]);
}
export function useCreateSubject(){return N((api,input)=>api.createSubject(input),['subjects','projects','home','atlas'])}
function dn() {
  return N(
    (e, t) => e.updateSubject(t.id, t.patch),
    [`subjects`, `projects`, `atlas`],
  );
}
function fn() {
  return N(
    (e, t) => e.mergeSubjects(t.sourceId, t.targetId),
    [`subjects`, `projects`, `project`, `home`, `atlas`],
  );
}
function pn() {
  return N((e, t) => e.createProjectDraft(t), [`projects`, `home`]);
}
function mn() {
  return N(
    (e, t) => e.updateSource(t.id, t.patch),
    [`project`, `projects`, `home`, `plan-revisions`],
  );
}
function hn() {
  return N(
    (e, t) => e.updateProject(t.id, t.patch),
    [`projects`, `home`, `project`],
  );
}
function gn() {
  return N(
    (e, t) => e.addSource(t.projectId, t.file, t.onProgress),
    [`project`, `projects`, `home`],
  );
}
function _n() {
  return N((e, t) => e.deleteSource(t), [`project`, `projects`, `home`]);
}
function vn() {
  return N(
    (e, t) => e.approveProposal(t.id, t.edit),
    [
      `proposals`,
      `proposal`,
      `home`,
      `decks`,
      `project`,
      `projects`,
      `session`,
      `sessions`,
      `atlas`,
      `cards`,
      `card`,
    ],
  );
}
function yn() {
  return N(
    (e, t) => e.rejectProposal(t),
    [`proposals`, `proposal`, `home`, `project`, `session`],
  );
}
function bn() {
  return N(
    (e, t) => e.recordReview(t),
    [
      `card`,
      `cards`,
      `card-history-page`,
      `decks`,
      `home`,
      `insights`,
      `review-log`,
    ],
  );
}
function xn() {
  return N(
    (e, t) => e.undoReview(t),
    [
      `card`,
      `cards`,
      `card-history-page`,
      `decks`,
      `home`,
      `insights`,
      `review-log`,
    ],
  );
}
function Sn() {
  return N(
    (e, t) => e.createNote(t),
    [`card`, `cards`, `decks`, `home`, `projects`, `project`],
  );
}
function Cn() {
  return N(
    (e, t) => e.updateNote(t.noteNo, t.patch),
    [`card`, `cards`, `decks`, `home`],
  );
}
function wn() {
  return N(
    (e, t) => e.setNoteStatus(t.noteNo, t.status),
    [`card`, `cards`, `decks`, `home`],
  );
}
function Tn() {
  return N(
    (e, t) => e.addComment(t.noteNo, t.body),
    [`card`, `cards`, `card-comments-page`],
  );
}
function En() {
  return N(
    (e, t) => e.dismissComment(t),
    [`card`, `cards`, `card-comments-page`],
  );
}
function Dn() {
  return N(
    (e, t) => e.resolveMisconception(t),
    [`atlas`, `session`, `project`],
  );
}
function On(e) {
  return x({
    ...j,
    queryKey: [`source-transcript-stats`, e],
    queryFn: () => S().getSourceTranscriptionStats(e),
    enabled: !!e,
  });
}
function kn(e, t) {
  return x({
    ...j,
    queryKey: [`source-transcript-page`, e, t],
    queryFn: () => S().getSourcePage(e, t),
    enabled: !!e && t >= 1,
  });
}
function An(e) {
  return x({
    ...j,
    queryKey: [`source-pdf-url`, e],
    queryFn: () => S().getSourcePdfUrl(e),
    enabled: !!e,
    staleTime: 24e4,
  });
}
function jn() {
  return N(
    (e, t) => e.updateSourcePage(t.sourceId, t.page, t.patch),
    [`source-transcript-page`, `source-transcript-stats`],
  );
}
function CrCalendarGlyph(e) {
  return (0, A.jsx)(`svg`, {
    xmlns: `http://www.w3.org/2000/svg`,
    width: e.size ?? 22,
    height: e.size ?? 22,
    viewBox: `0 0 24 24`,
    fill: `none`,
    stroke: `currentColor`,
    strokeWidth: e.strokeWidth ?? 1.75,
    strokeLinecap: `round`,
    strokeLinejoin: `round`,
    "aria-hidden": !0,
    children: (0, A.jsx)(`path`, {
      d: `M4 5h16v16H4z M8 3v4m8-4v4M4 10h16 M8 14h2m4 0h2m-8 3h2`,
    }),
  });
}
function CrCalendarPage(){return (0,A.jsxs)('section',{className:'cr-calendar-native',children:[(0,A.jsxs)('header',{className:'cr-calendar-title','data-ui':'calendar-header',children:[(0,A.jsx)('h1',{children:'Calendar'}),(0,A.jsx)(NotebookMenu,{})]}),(0,A.jsx)('lemma-native-calendar',{id:'cr-calendar-native-host',style:{display:'block',height:'auto',minHeight:0,overflow:'visible'}})]});}
var Mn = [
  { to: `/`, label: `Today`, icon: bt },
  { to: `/projects`, label: `Paths`, icon: vt },
  { to: `/review`, label: `Review`, icon: Et },
  { to: `/calendar`, label: `Calendar`, icon: CrCalendarGlyph },
  { to: `/insights`, label: `Progress`, icon: ot },
];
function NotebookNavLink({to,className,children,end,...props}){const path=me().pathname,active=path===to||(to==='/projects'&&path.startsWith('/p/'));return (0,A.jsx)(_e,{...props,to,'aria-current':active?'page':undefined,className:typeof className==='function'?className({isActive:active}):className,children:typeof children==='function'?children({isActive:active}):children});}
// Shared chrome lives outside route transforms so fixed controls use the viewport.
export function NotebookActionBar(props){return Le().createPortal((0,A.jsx)('div',props),document.body,'lemma-proposal-actions');}
export function getLemmaBatch(due){
 const budget=Number(localStorage.getItem('lemma.review.batch'))||33;
 let snapshot=null;try{snapshot=JSON.parse(localStorage.getItem('lemma.review.selection')||'null')}catch{}
 if(snapshot){
  const stale=snapshot.budget!==budget||(Number.isFinite(due)&&snapshot.totalDue!==due);
  if(snapshot.status!=='ready'||stale)return {count:null,budget,status:stale?'stale':snapshot.status};
  return {count:snapshot.count,budget,status:'ready'};
 }
 return {count:Number.isFinite(due)?Math.min(budget,Math.max(0,due)):budget,budget,status:'ready'};
}
function useLemmaBatch(due){const[,update]=(0,k.useState)(0);(0,k.useEffect)(()=>{const sync=()=>update(x=>x+1);window.addEventListener('lemma:review-selection',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('lemma:review-selection',sync);window.removeEventListener('storage',sync)}},[]);return getLemmaBatch(due);}
function Nn() {
  let e = !!T(),
    { data: t } = Ht(),
    currentPath = me().pathname;
  const batch=useLemmaBatch(Number(t?.due)||0).count;
  return (0, A.jsx)(`nav`, {
    "aria-label": `Main navigation`,"data-ui":`main-navigation`,
    className: `fixed inset-x-0 bottom-0 z-30 flex h-[calc(var(--tab)+env(safe-area-inset-bottom))] w-full items-center justify-around border-t border-edge-2 bg-[var(--tab-bg)] px-1 pb-[env(safe-area-inset-bottom)]`,
    children: Mn.filter(
      (e) => !window.__carrelDisabled || e.to !== `/calendar`,
    ).map(({ to: n, label: r, icon: i }) =>
      (0, A.jsx)(
        NotebookNavLink,
        {
          to: n,
          end: !0,
          "aria-label": r,
          id: r === `Calendar` ? `cr-calendar-tab` : void 0,
          className: ({ isActive: e }) =>
            `relative flex min-h-11 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-[2px] rounded-ctl ${(e || (r === `Paths` && (currentPath.startsWith(`/p/`) || currentPath === `/projects/new`)) || (r === `Review` && (currentPath.startsWith(`/cards`) || currentPath.startsWith(`/review/`)))) ? `text-ink border-t-2 border-current` : `text-ink-3`}`,
          children: ({ isActive: n }) =>
            (0, A.jsxs)(A.Fragment, {
              children: [
                (0, A.jsxs)(`span`, {
                    className: `relative inline-flex items-center gap-1`,
                  children: [
                    (0, A.jsx)(i, {
                      "aria-hidden": `true`,
                      size: 22,
                      strokeWidth: 1.75,
                    }),

                  ],
                }),
                (0, A.jsx)(`span`, {
                    className: `lemma-nav-active-label text-[12px] font-semibold whitespace-nowrap`,
                    children: r,
                  }),
              ],
            }),
        },
        n,
      ),
    ),
  });
}
function Pn({ floating: e = !1 }) {
  return null;
}
var Fn = { tl: `8% -6%`, tr: `108% -6%`, center: `50% 20%`, none: `50% 50%` };
function In({
  lamp: e = `tl`,
  deep: t = !1,
  className: n = ``,
  style: r,
  ...i
}) {
  return (0, A.jsx)(`div`, {
    "aria-hidden": `true`,
    ...i,
    className: `ground pointer-events-none fixed inset-0 z-0 ${n}`,
    style: {
      "--lamp-position": Fn[e],
      ...(t ? { backgroundColor: `var(--obsidian-deep)` } : {}),
      ...r,
    },
  });
}
var Ln = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/ReviewCurve-BpDcRz7B.js`),
      __vite__mapDeps([0, 1, 2, 3, 4, 5]),
    ),
  ),
  Rn = (e) =>
    e
      .map(([e, t], n) => (n ? `L` : `M`) + e.toFixed(2) + ` ` + t.toFixed(2))
      .join(` `);
function zn(e, t, n, r) {
  return Rn(
    Array.from({ length: 101 }, (i, a) => {
      let o = t + ((n - t) * a) / 100;
      return r(o, e(o));
    }),
  );
}
var Bn = {
  today: {
    path: zn(
      (e) => e * e * e - 3 * e,
      -2,
      2,
      (e, t) => [150 + e * 58, 115 - t * 23],
    ),
    label: `y = x³ − 3x`,
    turns: [
      [92, 69],
      [208, 161],
    ],
  },
  paths: {
    path: zn(
      (e) => 1 / (1 + Math.exp(-e)),
      -5,
      5,
      (e, t) => [150 + e * 25, 185 - t * 122],
    ),
    label: `Learning curve`,
  },
  review: {
    path: zn(
      (e) => Math.exp(-e / 3),
      0,
      6,
      (e, t) => [30 + e * 42, 185 - t * 122],
    ),
    second: zn(
      (e) => Math.exp(-e / 4.6),
      0,
      6,
      (e, t) => [30 + e * 42, 185 - t * 122],
    ),
    label: `y = e⁻ˣ⁄³`,
  },
  insights: {
    path: zn(
      (e) => Math.exp((-e * e) / 2),
      -3,
      3,
      (e, t) => [150 + e * 42, 185 - t * 122],
    ),
    label: `Normal density`,
  },
  unit: {
    path: zn(
      (e) => Math.sin(e),
      0,
      Math.PI * 2,
      (e, t) => [150 + 74 * Math.cos(e), 111 - 74 * t],
    ),
    label: `Unit circle`,
  },
};
function Vn(e) {
  return e === `/`
    ? `today`
    : e === `/projects` || e.startsWith(`/p/`)
      ? `paths`
      : e === `/review`
        ? `review`
        : e === `/insights`
          ? `insights`
          : e === `/settings` || e === `/sign-in`
            ? `unit`
            : null;
}
function Hn({ path: e }) {
  let [t, n] = (0, k.useState)(() => document.documentElement.dataset.theme);
  (0, k.useEffect)(() => {
    let e = () => n(document.documentElement.dataset.theme);
    return (
      window.addEventListener(`lemma-ui-change`, e),
      () => window.removeEventListener(`lemma-ui-change`, e)
    );
  }, []);
  let r = Vn(e);
  if (!r || (t !== `graph` && t !== `graph-night`)) return null;
  let i = Bn[r],
    a = t === `graph-night` ? 0.13 : 0.12;
  return (0, A.jsxs)(`svg`, {
    "aria-hidden": `true`,
    "data-graph-sketch": r,
    viewBox: `0 0 300 220`,
    preserveAspectRatio: `xMidYMid meet`,
    className: `pointer-events-none absolute right-2 top-0 z-0 h-auto w-[min(34vw,150px)] overflow-hidden`,
    style: { maxHeight: `120px` },
    children: [
      (0, A.jsxs)(`g`, {
        fill: `none`,
        stroke: `var(--ink)`,
        strokeWidth: `1`,
        opacity: `.12`,
        children: [
          (0, A.jsx)(`path`, { d: `M14 185H289M30 15V205` }),
          Array.from({ length: 8 }, (e, t) =>
            (0, A.jsx)(`path`, { d: `M${30 + t * 35} 181v8` }, `x` + t),
          ),
          Array.from({ length: 5 }, (e, t) =>
            (0, A.jsx)(`path`, { d: `M26 ${45 + t * 35}h8` }, `y` + t),
          ),
        ],
      }),
      (0, A.jsx)(`path`, {
        d: i.path,
        fill: `none`,
        stroke: `var(--accent)`,
        strokeWidth: `2`,
        opacity: a,
        strokeLinecap: `round`,
      }),
      r === `review` &&
        i.second &&
        (0, A.jsx)(k.Suspense, {
          fallback: null,
          children: (0, A.jsx)(Ln, { path: i.second, opacity: a * 0.7 }),
        }),
      i.turns?.map(([e, t], n) =>
        (0, A.jsx)(
          `circle`,
          { cx: e, cy: t, r: `3`, fill: `var(--accent)`, opacity: a },
          n,
        ),
      ),
    ],
  });
}
var Un = new Set([`/`, `/projects`, `/calendar`, `/review`, `/insights`]);
var BrowseDetailPaths = new Set([`/atlas`, `/settings`, `/proposals`, `/projects/new`, `/cards`, `/review/done`, `/kit`]);
function Wn() {
  let e = fe(),
    t = me(),
    n = le(),
    r = !!T(),
    i = Un.has(t.pathname) || BrowseDetailPaths.has(t.pathname) || t.pathname.startsWith(`/p/`) || t.pathname.startsWith(`/cards/`) || t.pathname.startsWith(`/s/`) || t.pathname.startsWith(`/proposals/`),
    a = t.pathname === `/atlas`,
    o = Un.has(t.pathname),
    s = n === `POP`;
  (0,k.useEffect)(()=>{
    const names={'/':'Today','/projects':'Paths','/calendar':'Calendar','/review':'Review','/review/run':'Card review','/review/done':'Review complete','/insights':'Progress','/atlas':'Concept map','/proposals':'Inbox','/cards':'Card library','/settings':'Settings','/sign-in':'Sign in','/kit':'Components'};
    const label=names[t.pathname]||(t.pathname.includes('/cp/')?'Checkpoint':t.pathname.startsWith('/p/')?'Learning path':t.pathname.startsWith('/s/')?'Study session':t.pathname.startsWith('/cards/')?'Card':'Lemma');
    document.title=label+' · Lemma';let tries=0,id,lastHeading=null;
    const focus=()=>{const heading=document.querySelector('#main-content h1');if(heading&&heading!==lastHeading&&!document.querySelector('dialog[open]')){const active=document.activeElement;heading.setAttribute('tabindex','-1');if(n!=='POP'&&(!lastHeading||!active||active===document.body||active===lastHeading||!active.isConnected))heading.focus({preventScroll:true});lastHeading=heading}if(++tries<100)id=setTimeout(focus,50)};
    id=setTimeout(focus,80);return()=>clearTimeout(id);
  },[t.pathname]);
  (0,k.useEffect)(()=>{
    let previous=window.scrollY;const scroll=()=>{const y=window.scrollY;document.documentElement.toggleAttribute('data-chrome-compact',y>140&&y>=previous);previous=y};window.addEventListener('scroll',scroll,{passive:true});return()=>window.removeEventListener('scroll',scroll);
  },[]);
  (0,k.useEffect)(()=>{
    const root=document.documentElement;
    document.body.dataset.lemmaRoute=t.pathname;document.body.dataset.lemmaPage=t.pathname.split("/")[1]||"today";
    const ro=new ResizeObserver(measure);
    const observed=new Set();
    function visible(node){return node&&getComputedStyle(node).display!==`none`&&node.getBoundingClientRect().height>0}
    function measure(){
      const nav=document.querySelector('nav[aria-label="Main navigation"]');
      const dock=document.querySelector('#cr-mobile-dock');
      const actions=document.querySelector('[data-ui=proposal-actions]');
      root.style.setProperty('--lemma-action-height',visible(actions)?actions.getBoundingClientRect().height+'px':'0px');
      if(nav)root.style.setProperty('--lemma-nav-height',nav.getBoundingClientRect().height+'px');
      for(const node of [nav,dock,actions])if(node&&!observed.has(node)){ro.observe(node);observed.add(node)}
      const top=Math.min(...[nav,dock].filter(visible).map(node=>node.getBoundingClientRect().top));
      const height=Number.isFinite(top)?Math.max(0,Math.ceil(innerHeight-top)):0;
      root.style.setProperty('--lemma-bottom-chrome',height+'px');
    }
    const mo=new MutationObserver(measure);
    mo.observe(document.body,{childList:true,subtree:true});
    mo.observe(root,{attributes:true,attributeFilter:['data-chrome-compact','data-large-text']});
    const reveal=event=>{const node=event.target;if(node?.shadowRoot||(event.composedPath?.()||[]).some(node=>node.tagName==='DIALOG')||!node?.closest?.('#main-content')||node.closest('dialog'))return;requestAnimationFrame(()=>{measure();const chrome=[document.querySelector('nav[aria-label="Main navigation"]'),document.querySelector('#cr-mobile-dock'),document.querySelector('[data-ui=proposal-actions]')].filter(visible),bottom=Math.min(innerHeight,...chrome.map(node=>node.getBoundingClientRect().top))-16,rect=node.getBoundingClientRect();if(rect.bottom>bottom)window.scrollBy({top:rect.bottom-bottom,behavior:'instant'})})};
    const modality=event=>{root.dataset.inputModality=event.type==='keydown'?'keyboard':'pointer'};
    window.addEventListener('resize',measure);window.addEventListener('scroll',measure,{passive:true});window.visualViewport?.addEventListener('resize',measure);document.addEventListener('focusin',reveal);document.addEventListener('keydown',modality);document.addEventListener('pointerdown',modality);
    requestAnimationFrame(measure);
    return ()=>{mo.disconnect();ro.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure);window.visualViewport?.removeEventListener('resize',measure);document.removeEventListener('focusin',reveal);document.removeEventListener('keydown',modality);document.removeEventListener('pointerdown',modality)};
  },[t.pathname]);
  return (0, A.jsxs)(A.Fragment, {
    children: [
      (0, A.jsx)(In, {
        lamp:
          t.pathname === `/atlas`
            ? `none`
            : t.pathname.startsWith(`/review`)
              ? `tr`
              : `tl`,
        deep: t.pathname === `/atlas`,
      }),
      a && (0, A.jsx)(Pn, { floating: !0 }),
      (0, A.jsxs)(`main`, {
        id: `main-content`,
        style: i?{paddingBottom:`calc(var(--lemma-bottom-chrome,56px) + var(--lemma-action-height,0px) + 12px)`}:undefined,
        className: a
          ? `relative min-h-dvh w-full overflow-x-clip pb-[calc(var(--tab)+env(safe-area-inset-bottom)+24px)]`
          : `relative mx-auto min-h-dvh max-w-[528px] px-6 pt-[calc(max(env(safe-area-inset-top),12px)+16px)] ` +
            (i
              ? `pb-[calc(var(--tab)+env(safe-area-inset-bottom)+24px)]`
              : `pb-6`),
        children: [
          !a && (0, A.jsx)(Pn, {}),
          (0, A.jsx)(Hn, { path: t.pathname }),
          r
            ? (0, A.jsx)(`div`, { children: e }, t.pathname)
            : (0, A.jsx)(it, {
                mode: `wait`,
                initial: !1,
                children: (0, A.jsx)(
                  we.div,
                  {
                    initial: a
                      ? !1
                      : r
                        ? { opacity: 0 }
                        : o
                          ? { opacity: 0, y: 8 }
                          : { opacity: 0, x: s ? -30 : `24%` },
                    animate: a
                      ? { opacity: 1 }
                      : {
                          opacity: 1,
                          x: 0,
                          y: 0,
                          scale: 1,
                          filter: `brightness(1)`,
                        },
                    exit:
                      a || r
                        ? { opacity: 0 }
                        : o
                          ? { opacity: 0, y: -8 }
                          : {
                              opacity: 0,
                              x: s ? `24%` : -14,
                              scale: 0.94,
                              filter: `brightness(0.6)`,
                            },
                    transition: {
                      duration: r ? 0.15 : o ? 0.2 : 0.36,
                      ease: ke,
                    },
                    children: e,
                  },
                  t.pathname,
                ),
              }),
        ],
      }),
      i && (0, A.jsx)(Nn, {}),
    ],
  });
}
function Gn(e) {
  if (!e) return null;
  let t = e.replace(/^#/, ``);
  return t.startsWith(`/`) &&
    !t.startsWith(`//`) &&
    !t.includes(`\\`) &&
    t.split(/[?#]/)[0] !== `/sign-in`
    ? t
    : null;
}
function Kn({ children: e, email: t }) {
  let n = me(),
    r = ge(),
    i = d(),
    [a] = (0, k.useState)(
      () =>
        Gn(sessionStorage.getItem(`lemma:sign-in-return`)) ??
        Gn(sessionStorage.getItem(`lemma:oauth-return`)) ??
        Gn(n.state?.from) ??
        Gn(n.pathname + n.search) ??
        `/`,
    ),
    [o, s] = (0, k.useState)(!1),
    c = x({
      queryKey: [`bootstrap`, t],
      queryFn: () => S().bootstrap(),
      staleTime: 1 / 0,
      retry: !1,
      refetchOnWindowFocus: !1,
    });
  return (
    (0, k.useEffect)(() => {
      if (!c.isSuccess || o) return;
      (i.setQueryData([`settings`], c.data),
        sessionStorage.removeItem(`lemma:sign-in-return`),
        sessionStorage.removeItem(`lemma:oauth-return`));
      let e = new URL(window.location.href);
      (e.searchParams.delete(`code`),
        window.history.replaceState(
          window.history.state,
          ``,
          e.pathname + e.search + e.hash,
        ),
        r(a, { replace: !0 }),
        s(!0));
    }, [c.isSuccess, c.data, o, r, a, i]),
    c.isError
      ? (0, A.jsxs)(`section`, {
          className: `p-6 text-ink-2`,
          children: [
            (0, A.jsx)(`p`, {
              role: `alert`,
              children: `Couldn't finish sign-in. Your study data hasn't loaded.`,
            }),
            (0, A.jsx)(Ae, {
              className: `mt-4`,
              onClick: () => void c.refetch(),
              children: `Try again`,
            }),
          ],
        })
      : !c.isSuccess || !o
        ? (0, A.jsx)(`p`, {
            role: `status`,
            className: `p-6 text-ink-2`,
            children: `Finishing sign-in…`,
          })
        : e
  );
}
function qn({ children: e }) {
  let t = an(),
    n = me();
  return t.isPending
    ? (0, A.jsx)(`p`, {
        role: `status`,
        className: `p-6 text-ink-2`,
        children: `Checking sign-in…`,
      })
    : t.isError
      ? (0, A.jsxs)(`section`, {
          className: `p-6 text-ink-2`,
          children: [
            (0, A.jsx)(`p`, {
              role: `alert`,
              children: `Couldn't check sign-in.`,
            }),
            (0, A.jsx)(Ae, {
              className: `mt-4`,
              onClick: () => void t.refetch(),
              children: `Try again`,
            }),
          ],
        })
      : t.data
        ? (0, A.jsx)(Kn, { email: t.data.email, children: e }, t.data.email)
        : n.pathname === `/sign-in`
          ? e
          : (0, A.jsx)(he, {
              to: `/sign-in`,
              replace: !0,
              state: { from: n.pathname + n.search },
            });
}
function Jn({ children: e }) {
  return ie() === `demo` ? e : (0, A.jsx)(qn, { children: e });
}
var Yn = class extends k.Component {
    state = { failed: !1 };
    static getDerivedStateFromError() {
      return { failed: !0 };
    }
    render() {
      return this.state.failed
        ? (0, A.jsxs)(`main`, {
            className: `relative mx-auto max-w-[528px] p-6`,
            children: [
              (0, A.jsx)(`h1`, {
                className: `text-2xl font-semibold`,
                children: `Couldn't open Lemma`,
              }),
              (0, A.jsx)(`p`, {
                className: `my-4 text-ink-2`,
                children: `Reload to try again.`,
              }),
              (0, A.jsx)(`button`, {
                className: `lit px-6`,
                onClick: () => window.location.reload(),
                children: `Try again`,
              }),
            ],
          })
        : this.props.children;
    }
  },
  Xn = (e) => {
    let t = e instanceof Error ? e.message : String(e ?? ``);
    return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      t,
    );
  };
function P() {
  let e = Xn(ue());
  return (
    (0, k.useEffect)(() => {
      if (!e) return;
      let t = `lemma:chunk-reload:${window.location.pathname}${window.location.hash}`;
      try {
        if (sessionStorage.getItem(t)) return;
        (sessionStorage.setItem(t, `1`), window.location.reload());
      } catch {}
    }, [e]),
    (0, A.jsxs)(`main`, {
      role: `alert`,
      className: `mx-auto flex min-h-dvh max-w-[560px] flex-col gap-4 bg-obsidian p-6 text-ink`,
      children: [
        (0, A.jsx)(`h1`, {
          className: `font-serif text-title`,
          children: `Couldn’t open this screen`,
        }),
        (0, A.jsx)(`p`, {
          className: `text-body text-ink-2`,
          children: `This page could not be displayed. Your pending work has not been approved or discarded.`,
        }),
        (0, A.jsxs)(`div`, {
          className: `flex flex-wrap gap-3`,
          children: [
            (0, A.jsx)(_e, {
              to: `/`,
              className: `ghost flex min-h-11 items-center rounded-ctl px-4`,
              children: `Back to Today`,
            }),
            (0, A.jsx)(`button`, {
              type: `button`,
              onClick: () => window.location.reload(),
              className: `lit min-h-11 px-4`,
              children: `Reload screen`,
            }),
          ],
        }),
      ],
    })
  );
}
function Zn() {
  return (0, A.jsxs)(`main`, {
    role: `status`,
    "aria-live": `polite`,
    className: `mx-auto min-h-dvh max-w-[560px] bg-obsidian p-6 text-ink`,
    children: [
      (0, A.jsx)(`h1`, {
        className: `font-serif text-title`,
        children: `Loading screen…`,
      }),
      (0, A.jsx)(`div`, {
        "aria-hidden": `true`,
        className: `mt-6 h-20 animate-pulse rounded-slab bg-fill-1`,
      }),
      (0, A.jsx)(`div`, {
        "aria-hidden": `true`,
        className: `mt-3 h-48 animate-pulse rounded-slab bg-fill-1`,
      }),
    ],
  });
}
var Qn = (0, k.lazy)(() =>
    D(
      () =>
        import(`@lemma/Tex-kn8bVMsW.js`)
          .then((e) => e.n)
          .then((e) => ({ default: e.Tex })),
      __vite__mapDeps([6, 2, 3, 7, 8, 9]),
    ),
  ),
  $n = new Set([
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
function er({ source: e }) {
  return e && !Array.from(e).some((e) => $n.has(e))
    ? (0, A.jsx)(`span`, { children: e })
    : (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(`span`, {
          role: `status`,
          "aria-label": `Rendering notification text`,
          children: `…`,
        }),
        children: (0, A.jsx)(Qn, { source: e }),
      });
}
var tr = 0,
  nr = [],
  rr = new Set(),
  ir = new Map(),
  ar = () => {
    for (let e of rr) e();
  };
function or(e) {
  return (
    rr.add(e),
    () => {
      rr.delete(e);
    }
  );
}
function sr() {
  return nr;
}
function cr(e) {
  let t = ir.get(e);
  (t !== void 0 && clearTimeout(t), ir.delete(e));
}
function lr(e) {
  (cr(e), (nr = nr.filter((t) => t.id !== e)), ar());
}
function ur(e) {
  (cr(e),
    nr.some((t) => t.id === e) &&
      ir.set(
        e,
        setTimeout(() => lr(e), 4e3),
      ));
}
function dr(message,options={}){return window.__lemmaFeedback.show(message,options);}
function fr() {
  return dr;
}
function pr({ item: e, reduce: t }) {
  let [n, r] = (0, k.useState)(!1),
    [i, a] = (0, k.useState)(!1),
    o = (0, k.useRef)(null);
  (0, k.useLayoutEffect)(() => {
    let e = o.current;
    if (!e || n) return;
    let t = () =>
      a(
        e.scrollHeight > e.clientHeight + 1 ||
          e.scrollWidth > e.clientWidth + 1,
      );
    t();
    let r = typeof ResizeObserver > `u` ? null : new ResizeObserver(t);
    return (r?.observe(e), () => r?.disconnect());
  }, [e.message, n]);
  let s = `toast-message-` + e.id;
  return (0, A.jsxs)(we.div, {
    role: `status`,
    initial: { opacity: 0, y: t ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: t ? 0.15 : 0.22 },
    className: `glass pointer-events-auto flex min-h-12 items-center gap-3 rounded-chip px-4 py-2 text-label ${e.tone === `danger` ? `text-again` : e.tone === `success` ? `text-easy` : `text-ink`}`,
    children: [
      (0, A.jsx)(`span`, {
        ref: o,
        id: s,
        className: `min-w-0 flex-1 ${n ? `wrap max-h-[50vh] overflow-y-auto` : `line-clamp-2`}`,
        children: (0, A.jsx)(er, { source: e.message }),
      }),
      i &&
        (0, A.jsx)(`button`, {
          type: `button`,
          "aria-label": n
            ? `Collapse notification details`
            : `Show notification details`,
          "aria-expanded": n,
          "aria-controls": s,
          className: `flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1 text-amber`,
          onClick: () => {
            n ? (r(!1), ur(e.id)) : (cr(e.id), r(!0));
          },
          children: n ? `Less` : `More`,
        }),
      e.action &&
        (0, A.jsx)(`button`, {
          className: `flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1 font-semibold text-amber`,
          onClick: () => {
            (e.action?.onClick(), lr(e.id));
          },
          children: (0, A.jsx)(er, { source: e.action.label }),
        }),
      (0, A.jsx)(`button`, {
        type: `button`,
        "aria-label": `Dismiss notification`,
        className: `flex size-11 shrink-0 items-center justify-center`,
        onClick: () => lr(e.id),
        children: (0, A.jsx)(Bt, { size: 16 }),
      }),
    ],
  });
}
function mr(){return null;}
function hr() {
  let e = d(),
    [t, n] = (0, k.useState)(typeof navigator < `u` && !navigator.onLine);
  return (
    (0, k.useEffect)(() => {
      let t = () => {
        (n(!navigator.onLine),
          navigator.onLine && e.invalidateQueries({ refetchType: `active` }));
      };
      return (
        window.addEventListener(`offline`, t),
        window.addEventListener(`online`, t),
        () => {
          (window.removeEventListener(`offline`, t),
            window.removeEventListener(`online`, t));
        }
      );
    }, [e]),
    t
      ? (0, A.jsxs)(`div`, {
          role: `status`,
          "aria-live": `polite`,
          className: `pointer-events-none fixed inset-x-4 top-[calc(12px+env(safe-area-inset-top))] z-[70] mx-auto flex max-w-[480px] items-center justify-center gap-2 rounded-ctl border border-amber-line bg-obsidian px-4 py-3 text-[13px] text-amber shadow-lg`,
          children: [
            (0, A.jsx)(ft, { size: 17, "aria-hidden": `true` }),
            `You're offline. Answers and approvals are not saved until connected.`,
          ],
        })
      : null
  );
}
var gr = `Lemma is ready to open offline. Changes still require a connection to save.`;
function _r(e) {
  return e === `live` ? gr : null;
}
function vr() {
  let e = fr();
  return (
    (0, k.useEffect)(() => {
      if (!(`serviceWorker` in navigator)) return;
      let t = !0;
      return (
        D(
          async () => {
            let { registerSW: e } = await import(
              `@lemma/virtual_pwa-register-ZPRlJO5G.js`
            );
            return { registerSW: e };
          },
          __vite__mapDeps([10, 11]),
        )
          .then(({ registerSW: n }) => {
            if (!t) return;
            let r = n({
              immediate: !0,
              onNeedRefresh() {
                e(`A new version of Lemma is ready.`, {
                  action: {
                    label: `Update`,
                    onClick: () => {
                      r(!0);
                    },
                  },
                });
              },
              onOfflineReady() {
                let t = _r(ie());
                t && e(t, { tone: `success` });
              },
              onRegisterError() {
                e(
                  `Offline app setup failed. You can still use Lemma while online.`,
                  { tone: `danger` },
                );
              },
            });
          })
          .catch(() => {
            t &&
              e(
                `Offline app setup failed. You can still use Lemma while online.`,
                { tone: `danger` },
              );
          }),
        () => {
          t = !1;
        }
      );
    }, [e]),
    null
  );
}
function yr({ children: e, className: t = ``, as: n = `h2`, ...r }) {
  return (0, A.jsx)(n, {
    ...r,
    className: t ? `ui-section-heading ${t}` : `ui-section-heading`,
    children: e,
  });
}
var br = (e) => `Resume ${e}`,
  xr = (e, t, n) => `Study ${e}${t ? `, ${t}${n ? ` ${n}` : ``}` : ``}`,
  Sr = (e) => `Plan ${e}`,
  Cr = (e, t) => `Revise the plan for ${e}: ${t}`;
function wr(e, t) {
  return `${e === `claude` ? `https://claude.ai/new?q=` : `https://chatgpt.com/?q=`}${encodeURIComponent(t)}`;
}
var Tr = {
    mapsto: `↦`,
    to: `→`,
    rightarrow: `→`,
    leftarrow: `←`,
    leftrightarrow: `↔`,
    implies: `⇒`,
    iff: `⇔`,
    in: `∈`,
    notin: `∉`,
    subset: `⊂`,
    subseteq: `⊆`,
    supseteq: `⊇`,
    cup: `∪`,
    cap: `∩`,
    emptyset: `∅`,
    varnothing: `∅`,
    forall: `∀`,
    exists: `∃`,
    times: `×`,
    cdot: `·`,
    cong: `≅`,
    simeq: `≃`,
    approx: `≈`,
    le: `≤`,
    leq: `≤`,
    ge: `≥`,
    geq: `≥`,
    ne: `≠`,
    neq: `≠`,
    ell: `ℓ`,
    alpha: `α`,
    beta: `β`,
    gamma: `γ`,
    delta: `δ`,
    epsilon: `ε`,
    varepsilon: `ε`,
    theta: `θ`,
    lambda: `λ`,
    mu: `μ`,
    pi: `π`,
    sigma: `σ`,
    tau: `τ`,
    phi: `φ`,
    varphi: `φ`,
    Gamma: `Γ`,
    Delta: `Δ`,
    Sigma: `Σ`,
    Pi: `Π`,
    infty: `∞`,
    circ: `∘`,
    oplus: `⊕`,
  },
  Er = { R: `ℝ`, N: `ℕ`, Z: `ℤ`, Q: `ℚ`, C: `ℂ`, F: `𝔽`, P: `ℙ` },
  Dr = {
    0: `⁰`,
    1: `¹`,
    2: `²`,
    3: `³`,
    4: `⁴`,
    5: `⁵`,
    6: `⁶`,
    7: `⁷`,
    8: `⁸`,
    9: `⁹`,
    n: `ⁿ`,
    i: `ⁱ`,
    H: `ᴴ`,
    T: `ᵀ`,
    m: `ᵐ`,
    x: `ˣ`,
    k: `ᵏ`,
    a: `ᵃ`,
    b: `ᵇ`,
    p: `ᵖ`,
    "+": `⁺`,
    "-": `⁻`,
  },
  Or = {
    0: `₀`,
    1: `₁`,
    2: `₂`,
    3: `₃`,
    4: `₄`,
    5: `₅`,
    6: `₆`,
    7: `₇`,
    8: `₈`,
    9: `₉`,
    n: `ₙ`,
    i: `ᵢ`,
    k: `ₖ`,
    m: `ₘ`,
    x: `ₓ`,
    a: `ₐ`,
    b: `ᵦ`,
    p: `ₚ`,
  },
  kr = (e, t) =>
    Array.from(e)
      .map((e) => t[e] || e)
      .join(``);
function Ar(e) {
  return e
    .replace(/\\mathbb(?:\{([^}]*)\}|\s*([A-Za-z]))/g, (e, t, n) =>
      Array.from(t ?? n ?? ``)
        .map((e) => Er[e] || e)
        .join(``),
    )
    .replace(/\\(?:mathcal|mathrm|mathbf|operatorname|text)\{([^}]*)\}/g, `$1`)
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, `($1/$2)`)
    .replace(/\\([A-Za-z]+)/g, (e, t) => Tr[t] ?? t)
    .replace(/\\(?:\(|\)|\[|\])/g, ``)
    .replace(/\\([{}[\](),.;:!?%$])/g, `$1`)
    .replace(/\^\{([^}]+)\}/g, (e, t) => kr(t, Dr))
    .replace(/\^([A-Za-z0-9+-])/g, (e, t) => kr(t, Dr))
    .replace(/_\{([^}]+)\}/g, (e, t) => kr(t, Or))
    .replace(/_([A-Za-z0-9])/g, (e, t) => kr(t, Or))
    .replace(/\$\$?|\u005c\(|\u005c\)|\u005c\[|\u005c\]/g, ``)
    .replace(/[\\$]/g, ``);
}
function jr(e) {
  return /(^|[^\\])\$/.test(e) || e.includes(`\\(`) || e.includes(`\\[`);
}
function Mr(e, t, n, r) {
  return (
    Ar(e) +
    `. ` +
    Ar(t) +
    n.replace(` · step`, `, step`) +
    (r ? `. Paused ` + r : ``)
  );
}
var Nr = typeof window > `u` ? null : window.location.hash;
function Pr(e, t) {
  let n = (e) => e.replace(/^#/, ``).split(`?`)[0] || `/`;
  return n(e) === n(t);
}
export function NotebookMenu({compact:requestedCompact}={}){
 const route=me().pathname,{data:home}=Ht(),pending=Number(home?.pendingProposals)||0;
 const compact=requestedCompact??(!Un.has(route)&&!['/cards','/proposals'].includes(route));
 const invoke=(event,screen,action)=>{event.currentTarget.closest('details')?.removeAttribute('open');window.__carrelIntegration?.open(screen,action)};
 const addItems=[(0,A.jsx)('button',{type:'button',onClick:event=>invoke(event,'plan','new-task'),children:'Task'},'task'),(0,A.jsx)('button',{type:'button',onClick:event=>invoke(event,'plan','new-block'),children:'Time block'},'block'),(0,A.jsx)(_e,{to:'/cards?new=1',onClick:()=>window.dispatchEvent(new Event('lemma:new-card')),children:'Card'},'card'),(0,A.jsx)(_e,{to:'/projects/new',children:'Learning path'},'path')];
 return (0,A.jsxs)('div',{className:'lemma-header-cluster',key:route,children:[
  !compact&&(0,A.jsxs)(_e,{to:'/proposals',className:'lemma-header-inbox','aria-label':pending?`Inbox, ${pending.toLocaleString()} pending proposals`:'Inbox',title:'Inbox',children:[(0,A.jsx)(St,{size:20,'aria-hidden':true}),pending>0&&(0,A.jsx)('span',{className:'lemma-header-badge','aria-hidden':true,children:pending>99?'99+':pending})]}),
  !compact&&(0,A.jsxs)('details',{className:'lemma-add-menu',children:[(0,A.jsx)('summary',{'aria-label':'Add to notebook',title:'Add',children:(0,A.jsx)(At,{size:20,'aria-hidden':true})}),(0,A.jsx)('nav',{'aria-label':'Add to notebook',children:addItems})]}),
  (0,A.jsxs)('details',{'data-ui':'utility-menu',children:[(0,A.jsx)('summary',{'aria-label':'Notebook menu',title:'Notebook menu',children:(0,A.jsx)(gt,{size:20,'aria-hidden':true})}),
   (0,A.jsxs)('nav',{'aria-label':'Notebook destinations',children:[
    compact&&(0,A.jsx)(_e,{to:'/proposals',children:pending?'Inbox · '+pending.toLocaleString():'Inbox'}),
    compact&&(0,A.jsxs)('div',{className:'lemma-menu-add',children:[(0,A.jsx)('span',{className:'lemma-menu-label',children:'Add to notebook'}),...addItems]}),
    ...[['/atlas','Concept map'],['/cards','Card library'],['/settings','Settings']].filter(([to])=>to!==route).map(([to,label])=>(0,A.jsx)(_e,{to,children:label},to)),
    ...[['/','Today'],['/projects','Paths'],['/review','Review'],['/calendar','Calendar'],['/insights','Progress']].map(([to,label])=>(0,A.jsx)(_e,{to,className:'lemma-landscape-destination',children:label},to))
   ]})]})
 ]});
}
export function NotebookHeader({title,back,onBack,actions,compact,titleText}){
 return (0,A.jsxs)('header',{'data-ui':'page-header','data-back':!!(back||onBack),'data-header-layout':actions?'with-actions':'compact',className:'page-header lemma-page-header',children:[
  (0,A.jsxs)('div',{className:'lemma-page-title-row',children:[
   (back||onBack)&&(0,A.jsx)(onBack?'button':_e,{type:onBack?'button':undefined,to:onBack?undefined:back,onClick:onBack,'aria-label':'Back','data-ui':'page-back',className:'lemma-page-back',children:(0,A.jsx)(je,{size:22,'aria-hidden':true})}),
   (0,A.jsx)('h1',{title:titleText||(typeof title==='string'?title:undefined),children:title}),
   (0,A.jsx)(NotebookMenu,{compact})
  ]}),
  actions&&(0,A.jsx)('div',{'data-ui':'page-actions',className:'page-actions lemma-page-action-row',children:actions})
 ]});
}
function Fr({title:e,back:t,onBack,actions:n,tabBar:r=false,children:i,className:a=''}){
 const o=!!T(),s=Nr!==null&&Pr(Nr,window.location.hash);
 return (0,A.jsxs)(we.section,{initial:!s&&'hidden',animate:'visible',variants:Ee(Oe,o),className:`relative flex flex-col gap-[var(--gap)] ${r?'pb-2':''} ${a}`,children:[(e||t||n)&&(0,A.jsx)(NotebookHeader,{title:e,back:t,onBack,actions:n}),i]});
}
var Ir = (0, k.createContext)(!1);
function Lr({
  as: e = `div`,
  lamp: t = !1,
  className: n = ``,
  children: r,
  ...i
}) {
  let a = (0, k.useContext)(Ir);
  return (0, A.jsxs)(e, {
    ...i,
    "data-paper-group": a || void 0,
    className: `${a ? `ui-paper-group relative` : `slab relative isolate overflow-hidden`} ${n}`,
    children: [
      t &&
        !a &&
        (0, A.jsx)(`span`, {
          "aria-hidden": `true`,
          className: `pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full opacity-40`,
          style: {
            background: `radial-gradient(closest-side,var(--amber-tint),transparent)`,
          },
        }),
      (0, A.jsx)(Ir.Provider, { value: !0, children: r }),
    ],
  });
}
function Rr({ as: e = `div`, children: t, className: n = ``, ...r }) {
  let i = (0, k.useContext)(Ir);
  return (0, A.jsx)(e, {
    ...r,
    "data-paper-group": i || void 0,
    className: `${i ? `ui-paper-group` : `tile`} ${n}`,
    children: (0, A.jsx)(Ir.Provider, { value: !0, children: t }),
  });
}
function zr({
  icon: e,
  label: t,
  to: n,
  tone: r = `glass`,
  badge: i,
  className: a = ``,
  ...o
}) {
  let s = `ui-icon-button relative inline-flex size-11 shrink-0 items-center justify-center rounded-ctl ${r === `amber` ? `bg-amber-tint text-amber` : r === `plain` ? `text-ink-2 hover:bg-fill-1` : `glass text-ink`} ${a}`,
    c = (0, A.jsxs)(A.Fragment, {
      children: [
        (0, A.jsx)(e, { size: 22, strokeWidth: 1.75, "aria-hidden": `true` }),
        i !== void 0 &&
          (0, A.jsx)(`span`, {
            "aria-hidden": `true`,
            className: `absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full bg-amber text-micro font-bold text-amber-ink`,
            children:
              i === `dot`
                ? (0, A.jsx)(`span`, {
                    className: `size-1.5 rounded-full bg-amber-ink`,
                  })
                : i,
          }),
      ],
    });
  return n
    ? (0, A.jsx)(_e, { to: n, "aria-label": t, className: s, children: c })
    : (0, A.jsx)(`button`, {
        ...o,
        type: o.type || `button`,
        "aria-label": t,
        className: s,
        children: c,
      });
}
function Br({ subject: e, size: t = 40, active: n = !1, hue: r = `amber` }) {
  let i = e.trim().slice(0, 2) || `∫`,
    a = n ? `var(--amber)` : `var(--${r})`;
  return (0, A.jsx)(`span`, {
    role: `img`,
    "aria-label": e,
    className: `inline-flex shrink-0 items-center justify-center ui-glyph rounded-s font-math text-card italic ${n ? `bg-amber-tint` : `bg-fill-1`}`,
    style: { width: t, height: t, color: a },
    children: i,
  });
}
function Vr({
  w: e = `100%`,
  h: t = 20,
  radius: n = `var(--r-s)`,
  className: r = ``,
}) {
  let [i, a] = (0, k.useState)(!1);
  return (
    (0, k.useEffect)(() => {
      let e = window.setTimeout(() => a(!0), 300);
      return () => window.clearTimeout(e);
    }, []),
    i
      ? (0, A.jsx)(`div`, {
          "aria-hidden": `true`,
          className: `animate-pulse bg-fill-2 ${r}`,
          style: { width: e, height: t, borderRadius: n },
        })
      : null
  );
}
function Hr({ size: e = 170, className: t = `` }) {
  let n = Me(),
    r = (0, k.useId)();
  return (0, A.jsxs)(`svg`, {
    role: `img`,
    "aria-label": `Compass illustration`,
    viewBox: `0 0 180 180`,
    width: e,
    height: e,
    className: t,
    children: [
      (0, A.jsx)(`defs`, {
        children: (0, A.jsxs)(`radialGradient`, {
          id: r,
          children: [
            (0, A.jsx)(`stop`, {
              stopColor: `var(--amber)`,
              stopOpacity: `.24`,
            }),
            (0, A.jsx)(`stop`, {
              offset: `1`,
              stopColor: `var(--amber)`,
              stopOpacity: `0`,
            }),
          ],
        }),
      }),
      (0, A.jsx)(`circle`, { cx: `90`, cy: `90`, r: `81`, fill: `url(#${r})` }),
      (0, A.jsx)(`circle`, {
        cx: `90`,
        cy: `90`,
        r: `62`,
        fill: `none`,
        stroke: `var(--amber-line)`,
        strokeWidth: `1.5`,
        strokeDasharray: `3 6`,
      }),
      (0, A.jsx)(`circle`, {
        cx: `90`,
        cy: `90`,
        r: `46`,
        fill: `var(--tile)`,
        stroke: `var(--edge-3)`,
        strokeWidth: `2`,
      }),
      (0, A.jsxs)(we.g, {
        style: { transformOrigin: `90px 90px` },
        animate: n ? { rotate: [-8, 8, -8] } : { rotate: 0 },
        transition: { duration: 8, repeat: 1 / 0, ease: `easeInOut` },
        children: [
          (0, A.jsx)(`path`, {
            d: `M90 47 106 90 90 133 74 90Z`,
            fill: `var(--amber-tint-2)`,
            stroke: `var(--amber)`,
            strokeWidth: `1.4`,
          }),
          (0, A.jsx)(`path`, {
            d: `M90 47 106 90 90 88Z`,
            fill: `var(--amber)`,
          }),
          (0, A.jsx)(`path`, {
            d: `M90 133 74 90 90 92Z`,
            fill: `var(--ink-3)`,
          }),
        ],
      }),
      (0, A.jsx)(`circle`, {
        cx: `90`,
        cy: `90`,
        r: `5`,
        fill: `var(--amber-hi)`,
      }),
      [0, 90, 180, 270].map((e) =>
        (0, A.jsx)(
          `g`,
          {
            transform: `rotate(${e} 90 90)`,
            children: (0, A.jsx)(`path`, {
              d: `M90 21v10`,
              stroke: `var(--amber)`,
              strokeWidth: `2`,
              strokeLinecap: `round`,
            }),
          },
          e,
        ),
      ),
      (0, A.jsx)(we.circle, {
        r: `3`,
        cx: `154`,
        cy: `90`,
        fill: `var(--amber-glow)`,
        animate: n ? { opacity: [0.35, 1, 0.35] } : { opacity: 1 },
        transition: { duration: 3.2, repeat: 1 / 0 },
      }),
    ],
  });
}
function Ur({ size: e = 170, className: t = `` }) {
  let n = Me();
  return (0, A.jsxs)(`svg`, {
    role: `img`,
    "aria-label": `Study card illustration`,
    viewBox: `0 0 180 180`,
    width: e,
    height: e,
    className: t,
    children: [
      (0, A.jsx)(`ellipse`, {
        cx: `91`,
        cy: `146`,
        rx: `64`,
        ry: `15`,
        fill: `var(--amber-tint)`,
      }),
      [
        { angle: -18, x: 46, y: 40 },
        { angle: 18, x: 70, y: 40 },
        { angle: 0, x: 58, y: 30 },
      ].map((e, t) =>
        (0, A.jsxs)(
          we.g,
          {
            style: { transformOrigin: `${e.x + 31}px ${e.y + 44}px` },
            initial: n ? { opacity: 0, y: 16, rotate: 0 } : !1,
            animate: { opacity: 1, y: 0, rotate: e.angle },
            transition: { duration: 0.6, delay: t * 0.12 },
            children: [
              (0, A.jsx)(`rect`, {
                x: e.x,
                y: e.y,
                width: `65`,
                height: `88`,
                rx: `11`,
                fill: t === 2 ? `var(--raised)` : `var(--tile)`,
                stroke: t === 2 ? `var(--amber-line-2)` : `var(--edge-3)`,
              }),
              (0, A.jsx)(`path`, {
                d: `M${e.x + 15} ${e.y + 28}h34 M${e.x + 15} ${e.y + 42}h26 M${e.x + 15} ${e.y + 56}h32`,
                stroke: t === 2 ? `var(--amber)` : `var(--ink-3)`,
                strokeWidth: `2.5`,
                strokeLinecap: `round`,
              }),
            ],
          },
          t,
        ),
      ),
      (0, A.jsx)(we.path, {
        d: `m138 28 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z`,
        fill: `var(--amber-hi)`,
        animate: n
          ? { scale: [0.85, 1.16, 0.85], opacity: [0.6, 1, 0.6] }
          : { scale: 1, opacity: 1 },
        transition: { repeat: 1 / 0, duration: 3 },
      }),
    ],
  });
}
function Wr({ size: e = 170, className: t = `` }) {
  let n = Me();
  return (0, A.jsxs)(`svg`, {
    role: `img`,
    "aria-label": `Completed review illustration`,
    viewBox: `0 0 180 180`,
    width: e,
    height: e,
    className: t,
    children: [
      (0, A.jsx)(`circle`, {
        cx: `90`,
        cy: `90`,
        r: `66`,
        fill: `var(--amber-tint)`,
      }),
      (0, A.jsx)(we.circle, {
        cx: `90`,
        cy: `90`,
        r: `48`,
        fill: `var(--raised)`,
        stroke: `var(--amber)`,
        strokeWidth: `3`,
        strokeLinecap: `round`,
        pathLength: 1,
        initial: n ? { strokeDasharray: `0 1` } : !1,
        animate: { strokeDasharray: `1 0` },
        transition: { duration: 1.1 },
      }),
      (0, A.jsx)(we.path, {
        d: `m64 91 18 18 35-39`,
        fill: `none`,
        stroke: `var(--amber-hi)`,
        strokeWidth: `7`,
        strokeLinecap: `round`,
        strokeLinejoin: `round`,
        pathLength: 1,
        initial: n ? { pathLength: 0 } : !1,
        animate: { pathLength: 1 },
        transition: { duration: 0.5, delay: 0.5 },
      }),
      Array.from({ length: 8 }, (e, t) => {
        let r = (t * Math.PI) / 4,
          i = 90 + Math.cos(r) * 65,
          a = 90 + Math.sin(r) * 65;
        return (0, A.jsx)(
          we.path,
          {
            d: `M${i} ${a}l${Math.cos(r) * 10} ${Math.sin(r) * 10}`,
            stroke: `var(--amber-glow)`,
            strokeWidth: `3`,
            strokeLinecap: `round`,
            initial: n ? { opacity: 0, scale: 0.1 } : !1,
            animate: { opacity: 1, scale: 1 },
            transition: { duration: 0.42, delay: 0.55 + t * 0.05 },
          },
          t,
        );
      }),
    ],
  });
}
var Gr = { compass: Hr, deck: Ur, plug: Ne, inbox: Wr };
function Kr({ art: e, title: t, body: n, action: r, className: i = `` }) {
  let a = Gr[e];
  return (0, A.jsxs)(`section`, {
    className: `mx-auto flex max-w-sm flex-col items-center justify-center gap-3 py-8 text-center ${i}`,
    children: [
      e === `plug`
        ? (0, A.jsx)(Ne, { connected: !1 })
        : (0, A.jsx)(a, { connected: !1 }),
      (0, A.jsx)(`h2`, {
        className: `mt-1 text-card font-semibold tracking-tight`,
        children: t,
      }),
      (0, A.jsx)(`p`, {
        className: `font-math text-headline leading-relaxed text-ink-2`,
        children: n,
      }),
      r?.to
        ? (0, A.jsx)(_e, {
            to: r.to,
            className: `lit mt-3 inline-flex min-h-[52px] items-center justify-center px-6`,
            children: r.label,
          })
        : r?.onClick
          ? (0, A.jsx)(Ae, {
              className: `mt-3`,
              onClick: r.onClick,
              children: r.label,
            })
          : null,
    ],
  });
}
var qr = (0, k.lazy)(() =>
    D(
      () =>
        import(`@lemma/Tex-kn8bVMsW.js`)
          .then((e) => e.n)
          .then((e) => ({ default: e.Tex })),
      __vite__mapDeps([6, 2, 3, 7, 8, 9]),
    ),
  ),
  Jr = new Set([
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
function Yr(e) {
  if (!e.length) return !1;
  for (let t of e) if (Jr.has(t)) return !1;
  return !0;
}
function Xr({ source: e, className: t = `` }) {
  let n = `lemma-math lemma-tex-inline ${t}`;
  return Yr(e)
    ? (0, A.jsx)(`span`, { className: n, children: e })
    : (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(`span`, {
          role: `status`,
          "aria-label": `Rendering mathematical text`,
          className: n,
          children: `…`,
        }),
        children: (0, A.jsx)(qr, { source: e, className: t }),
      });
}
var Zr = { complete: 0, unscheduled: 1, dated: 2, behind: 3 };
function Qr(e, t, n) {
  if (!e.length) return [];
  let r = Math.max(48, Number.isFinite(t) ? t : 48),
    i = Math.max(1, Math.floor(r / 8)),
    a = e.findIndex((e) => e.done < e.total),
    o =
      n === void 0
        ? a < 0
          ? e.length - 1
          : a
        : Math.max(0, Math.min(e.length - 1, Math.floor(n))),
    s = e.map((e, t) => {
      let n = Math.max(0, e.total);
      return {
        start: t,
        end: t,
        label: e.label,
        total: n,
        done: Math.min(n, Math.max(0, e.done)),
        schedule: e.schedule,
        groupedCount: 1,
      };
    });
  for (; s.length > i;) {
    let t = -1;
    for (let e = s.length - 2; e >= 0; e--)
      if (s[e].start > o && s[e + 1].start > o) {
        t = e;
        break;
      }
    if (t < 0) {
      for (let e = 0; e < s.length - 1; e++)
        if (s[e].end < o && s[e + 1].end < o) {
          t = e;
          break;
        }
    }
    if (t < 0) {
      let e = s.findIndex((e) => e.start <= o && e.end >= o);
      t = Math.max(0, Math.min(s.length - 2, e));
    }
    let n = s[t],
      r = s[t + 1];
    s.splice(t, 2, {
      start: n.start,
      end: r.end,
      label: e[n.start].label + `–` + e[r.end].label,
      total: n.total + r.total,
      done: n.done + r.done,
      schedule: Zr[n.schedule] >= Zr[r.schedule] ? n.schedule : r.schedule,
      groupedCount: n.groupedCount + r.groupedCount,
    });
  }
  let c = r - 8 * s.length,
    l = s.reduce((e, t) => e + t.total, 0);
  return s.map(({ start: e, end: t, ...n }) => ({
    ...n,
    widthPercent: (100 * (8 + c * (l ? n.total / l : 1 / s.length))) / r,
  }));
}
function $r(e, t, n) {
  let r = t.reduce((e, t) => e + Math.max(0, t.total), 0),
    i = e?.trim();
  if (i) {
    let e = 0,
      n = (e) => /^(.*?)(\d+)$/.exec(e);
    for (let r of t) {
      let t = Math.max(0, r.total);
      if (t > 0) {
        if (i === r.firstCode) return e + 0.5;
        if (i === r.lastCode) return e + t - 0.5;
        let a = n(r.firstCode),
          o = n(r.lastCode),
          s = n(i);
        if (a && o && s && a[1] === o[1] && s[1] === a[1]) {
          let n = Number(a[2]),
            r = Number(o[2]),
            i = Number(s[2]);
          if (n !== r && i >= Math.min(n, r) && i <= Math.max(n, r))
            return e + 0.5 + ((i - n) / (r - n)) * (t - 1);
        }
      }
      e += t;
    }
    let a = /^CP(\d+)$/i.exec(i);
    if (a && Number(a[1]) >= 1 && Number(a[1]) <= r) return Number(a[1]) - 0.5;
  }
  return Math.max(0, Math.min(r, n >= r ? r : n + 0.5));
}
function ei(e, t, n, r) {
  if (t <= 0 || n <= 0) return null;
  let i = Math.max(0, Math.min(t, e)),
    a = i / t;
  if (r?.length) {
    let e = i,
      t = 0;
    for (let [n, i] of r.entries()) {
      if (e <= i.total || n === r.length - 1) {
        t +=
          i.widthPercent *
          (i.total ? Math.max(0, Math.min(1, e / i.total)) : 0);
        break;
      }
      ((t += i.widthPercent), (e -= i.total));
    }
    a = Math.max(0, Math.min(1, t / 100));
  }
  let o = a === 0 ? 0 : a === 1 ? n : Math.max(9, Math.min(n - 9, n * a));
  return {
    x: o,
    percent: (o / n) * 100,
    edge: a === 0 ? `start` : a === 1 ? `end` : `middle`,
  };
}
function ti({project:e}){return (0,A.jsx)('div',{className:'notebook-progress-rail',role:'progressbar','aria-label':e.title+' checkpoint progress','aria-valuemin':0,'aria-valuemax':Math.max(1,e.total),'aria-valuenow':e.done,'aria-valuetext':e.done+' of '+e.total+' checkpoints',children:(0,A.jsx)('span',{'aria-hidden':true,style:{width:Math.min(100,e.total?e.done/e.total*100:0)+'%'}})});}
var ni = 864e5;
function ri(e) {
  if (!e || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(e)) return null;
  let t = Date.parse(e.slice(0, 10) + `T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / ni) : null;
}
function ii(e) {
  return Math.floor(Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) / ni);
}
function ai(e) {
  return new Date(e * ni).toISOString().slice(0, 10);
}
function oi(e) {
  return e.ui === `done` || e.ui === `revisit`;
}
function si(e) {
  return !oi(e) && e.ui !== `proposed`;
}
function ci(e) {
  return Math.max(1, e.stepsTotal || 1);
}
function li(e, t = {}) {
  let n = ii(t.now ?? new Date()),
    r = ri(t.targetDate),
    i = e.filter(si).reduce((e, t) => e + ci(t), 0),
    a = 0,
    o = Math.max(0.25, t.pacePerWeek ?? 0.25);
  return e.map((e) => {
    let t = oi(e);
    si(e) && (a += ci(e));
    let s = ri(e.dueOn),
      c = s === null && r !== null && si(e),
      l = s ?? (c ? n + Math.round(((r - n) * a) / Math.max(1, i)) : null),
      u = null,
      d = !1;
    if (t) u = ri(e.demonstratedAt);
    else if (e.ui === `now` && l !== null) {
      let t = Math.max(1, e.stepsTotal - Math.max(0, e.currentStep - 1));
      ((u = n + Math.ceil((7 * t) / ci(e) / o)), (d = !0));
    }
    let f = l !== null && u !== null ? u - l : null,
      p = `unscheduled`;
    return (
      l !== null &&
        (f === null
          ? si(e) && (p = l < n ? `late` : `future`)
          : (p = f >= 3 ? `late` : f <= -3 ? `early` : `on_time`)),
      {
        checkpoint: e,
        dueOn: l === null ? null : ai(l),
        inferred: c,
        state: p,
        deltaDays: f,
        actualOn: u === null ? null : ai(u),
        projected: d,
      }
    );
  });
}
function ui(e) {
  let t = e.find((e) => e.checkpoint.ui === `now` && e.dueOn);
  if (t) {
    let e = t.deltaDays;
    return e === null
      ? null
      : e >= 3
        ? e + ` days behind`
        : e <= -3
          ? Math.abs(e) + ` days ahead`
          : `On schedule`;
  }
  return e.filter((e) => e.state === `late` && e.checkpoint.ui !== `proposed`)
    .length
    ? `Behind schedule`
    : e.some((e) => e.dueOn)
      ? `On schedule`
      : null;
}
function di(e) {
  let t = ri(e);
  return t === null
    ? e
    : new Date(t * ni).toLocaleDateString(`en-GB`, {
        day: `numeric`,
        month: `short`,
        timeZone: `UTC`,
      });
}
function fi(e) {
  if (!e.dueOn) return null;
  let t = `Planned ` + di(e.dueOn);
  if (!e.actualOn) return t;
  let n = e.deltaDays ?? 0,
    r = Math.abs(n) + ` days ` + (n < 0 ? `early` : `late`);
  return (
    t +
    `, ` +
    (e.projected ? `expected ` : `done `) +
    di(e.actualOn) +
    `: ` +
    (Math.abs(n) <= 2 ? `on time` : r)
  );
}
function pi(e, t, n = Date.now()) {
  let r = n - 28 * ni,
    i = new Set(
      e
        .filter(
          (e) =>
            e.projectId === t &&
            e.kind === `demonstrated` &&
            Date.parse(e.at) >= r &&
            Date.parse(e.at) <= n,
        )
        .map((e) => e.checkpointCode),
    );
  return Math.max(1, i.size) / 4;
}
var mi = {
  early: `var(--early)`,
  on_time: `var(--ink-2)`,
  late: `var(--late)`,
  future: `var(--ink-4)`,
  unscheduled: `var(--hair)`,
};
function hi(e) {
  let t = [];
  for (let n = 0; n < e.length; n++) {
    let r = e[n],
      i = r.stage?.trim(),
      a = t.at(-1);
    i && a?.name === i && a.end === n - 1
      ? (a.checkpoints.push(r), (a.end = n))
      : !i && a && !a.checkpoints[0].stage?.trim() && a.checkpoints.length < 8
        ? (a.checkpoints.push(r),
          (a.end = n),
          (a.name = a.checkpoints[0].code + `–` + r.code.replace(/^CP/, ``)))
        : t.push({
            key: (i ?? `auto`) + `:` + n,
            name: i || r.code,
            start: n,
            end: n,
            checkpoints: [r],
          });
  }
  return t;
}
function gi(e) {
  let t = e.findIndex((e) => e.ui === `now`);
  if (t >= 0) return t;
  let n = e.findIndex((e) => e.ui === `revisit`);
  if (n >= 0) return n;
  let r = e.findIndex((e) => e.ui === `next`);
  return Math.max(0, r);
}
function _i(e) {
  return e.some((e) => e.state === `late`)
    ? `late`
    : e.some((e) => e.state === `on_time`)
      ? `on_time`
      : e.some((e) => e.state === `future`)
        ? `future`
        : e.some((e) => e.state === `early`)
          ? `early`
          : `unscheduled`;
}
var vi = 864e5;
function yi(e) {
  let {
      projectId: t,
      done: n,
      total: r,
      targetDate: i,
      dueDates: a = [],
      events: o = [],
      now: s = Date.now(),
    } = e,
    c = Math.max(0, r - n),
    l = o.filter(
      (e) =>
        e.projectId === t &&
        e.kind === `demonstrated` &&
        Number.isFinite(Date.parse(e.at)) &&
        Date.parse(e.at) <= s,
    ),
    u =
      l.some((e) => Date.parse(e.at) <= s - 28 * vi) &&
      l.some((e) => Date.parse(e.at) > s - 28 * vi),
    d = (e) =>
      e && /^\d{4}-\d{2}-\d{2}/.test(e)
        ? Date.parse(e.slice(0, 10) + `T12:00:00Z`)
        : NaN;
  if (u) {
    let e = pi(o, t, s),
      n = new Date(s + (c / e) * 7 * vi),
      r = d(i);
    return {
      pace: e,
      finish: n,
      source: `measured`,
      spare: Number.isFinite(r) ? Math.floor((r - n.getTime()) / vi) : null,
    };
  }
  let f = a.map((e) => d(e)).filter((e) => Number.isFinite(e)),
    p = d(i),
    m = Math.max(...f, ...(Number.isFinite(p) ? [p] : []), -1 / 0);
  return Number.isFinite(m) && m > s
    ? {
        pace: c > 0 ? Math.max(0.01, (c * 7 * vi) / (m - s)) : 0,
        finish: new Date(m),
        source: `plan`,
        spare: Number.isFinite(p) ? Math.floor((p - m) / vi) : null,
      }
    : c === 0
      ? { pace: 0, finish: new Date(s), source: `plan`, spare: null }
      : { pace: null, finish: null, source: `none`, spare: null };
}
function bi(e, t = [], n = Date.now()) {
  let r = yi({
    projectId: e.project.id,
    total: e.total,
    done: e.done,
    targetDate: e.project.targetDate,
    events: t,
    dueDates: e.checkpoints
      .filter((e) => e.ui !== `done` && e.ui !== `revisit`)
      .map((e) => e.dueOn),
    now: n,
  });
  return {
    estimate: r,
    rows: li(e.checkpoints, {
      targetDate: e.project.targetDate,
      pacePerWeek: r.pace ?? void 0,
      now: new Date(n),
    }),
  };
}
var xi = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/GoalCard-zdeOtvSo.js`),
      __vite__mapDeps([12, 13, 2, 3, 14, 6, 7, 8, 9]),
    ),
  ),
  Si = (e) =>
    /behind/i.test(e.scheduleHeadline ?? ``) ||
    (!!e.targetDate &&
      Date.parse(e.targetDate) < Date.now() &&
      e.done < e.total),
  Ci = (e, t) => {
    let n = Number(Si(t)) - Number(Si(e));
    if (n) return n;
    let r = (e) => (e.targetDate ? Date.parse(e.targetDate) : 1 / 0);
    return r(e) === r(t)
      ? (Date.parse(t.lastActivityAt ?? ``) || 0) -
          (Date.parse(e.lastActivityAt ?? ``) || 0)
      : r(e) - r(t);
  };
function LemmaGoalForecast({project}) {
  const detail=Gt(project.slug),insights=en(30);
  const estimate=detail.data?bi(detail.data,insights.data?.checkpointEvents).estimate:null;
  const format=d=>d.toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'});
  return (0,A.jsxs)('div',{className:'lemma-goal-dates',children:[
    project.targetDate&&(0,A.jsxs)('p',{children:['Goal target · ',(0,A.jsx)('time',{dateTime:project.targetDate,children:format(new Date(project.targetDate+'T12:00:00'))})]}),
    estimate?.finish?(0,A.jsxs)('p',{children:['Goal forecast ≈ ',(0,A.jsx)('time',{'data-goal-forecast':'',dateTime:estimate.finish.toISOString().slice(0,10),children:format(estimate.finish)}),estimate.spare===null?'':estimate.spare<0?' · '+Math.abs(estimate.spare)+' days after target':estimate.spare===0?' · meets target':' · '+estimate.spare+' days before target']}):(0,A.jsx)('p',{children:detail.isPending?'Loading forecast…':'Forecast unavailable · open project for details'})
  ]});
}
function wi({project:e,events:t}){
 const progress=e.total?Math.round(100*e.done/e.total):0;
 return (0,A.jsxs)(Lr,{as:'article','aria-label':'Goal progress for '+e.title,'data-summary-goal':'',children:[
  (0,A.jsxs)('div',{className:'summary-goal-head',children:[(0,A.jsx)(Br,{subject:e.subject?.glyph??'∫',hue:e.subject?.hue??'slate',size:32}),(0,A.jsxs)(_e,{to:'/p/'+e.slug,className:'summary-goal-link',children:[(0,A.jsx)('strong',{children:(0,A.jsx)(Xr,{source:e.title})}),(0,A.jsxs)('span',{children:[e.done+'/'+e.total+' checkpoints',e.current?' · '+e.current.code+' ':null,e.current?(0,A.jsx)(Xr,{source:e.current.title}):null]})]}),(0,A.jsx)('span',{className:'summary-goal-percent',children:progress+'%'})]}),
  (0,A.jsx)('div',{className:'summary-goal-path','aria-label':'Path progress for '+e.title,children:(0,A.jsx)(ti,{project:e})}),
  (0,A.jsx)(LemmaGoalForecast,{project:e}),
  e.scheduleHeadline?(0,A.jsxs)('details',{children:[(0,A.jsx)('summary',{children:'Checkpoint pace'}),(0,A.jsx)('p',{children:e.scheduleHeadline})]}):null
 ]});
}

function Ti({ projects: e }) {
  let t = e.filter((e) => e.status === `active`).sort(Ci),
    [n, r] = (0, k.useState)(!1);
  (0, k.useEffect)(() => {
    if (ie() !== `demo` || re() === "default") return;
    performance.getEntriesByName(`lemma-stress-goal-mounted`, `mark`).length ===
      0 && performance.mark(`lemma-stress-goal-mounted`);
    let e = 0,
      t = !1,
      n = () => {
        let r = document.querySelector(`[data-summary-goal]`),
          i = r?.getBoundingClientRect(),
          a =
            !!i &&
            i.width > 0 &&
            i.height > 0 &&
            i.top < window.innerHeight &&
            i.bottom > 0 &&
            i.left < window.innerWidth &&
            i.right > 0;
        for (let e = r ?? null; a && e; e = e.parentElement) {
          let t = getComputedStyle(e);
          if (
            ((t.display === `none` ||
              t.visibility === `hidden` ||
              Number(t.opacity) < 0.99) &&
              (a = !1),
            e.id === `main-content`)
          )
            break;
        }
        a && t
          ? performance.getEntriesByName(
              `lemma-stress-first-goal-paint`,
              `mark`,
            ).length === 0 && performance.mark(`lemma-stress-first-goal-paint`)
          : ((t = a), (e = requestAnimationFrame(n)));
      };
    return ((e = requestAnimationFrame(n)), () => cancelAnimationFrame(e));
  }, []);
  let i = x({
      queryKey: [`insights`, 30],
      queryFn: () => S().getInsightData(30),
      enabled: ie() === `demo` && re() === "default",
    }),
    a = t.slice(0, 3),
    o = t.slice(3),
    s = o.filter(Si).length;
  return (0, A.jsxs)(`section`, {
    "aria-label": `Distance to your goals`,"data-style":"role-distance-to-your-goals",
    className: `flex min-w-0 flex-col gap-3`,
    children: [
      (0, A.jsxs)(`div`, {
        className: `flex min-h-11 items-center justify-between gap-3`,
        children: [
          (0, A.jsx)(`h2`, {
            className: `font-[var(--font-display)] text-title-s italic text-ink`,
            children: `Distance to your goals`,
          }),
          (0, A.jsx)(_e, {
            to: `/projects`,
            className: `flex min-h-11 items-center text-label text-ink-2 underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]`,
            children: `All paths`,
          }),
        ],
      }),
      t.length === 0
        ? (0, A.jsx)(`p`, {
            className: `text-label text-ink-2`,
            children: `Create a project and plan to begin tracking your goals.`,
          })
        : (0, A.jsxs)(A.Fragment, {
            children: [
              a.map((e) =>
                e.total > 14
                  ? (0, A.jsx)(
                      wi,
                      { project: e, events: i.data?.checkpointEvents },
                      e.id,
                    )
                  : (0, A.jsx)(
                      k.Suspense,
                      {
                        fallback: (0, A.jsx)(Vr, { h: 200 }),
                        children: (0, A.jsx)(xi, {
                          project: e,
                          events: i.data?.checkpointEvents,
                        }),
                      },
                      e.id,
                    ),
              ),
              o.length > 0 &&
                (0, A.jsxs)(`div`, {
                  className: `min-w-0 rounded-slab border border-edge bg-[var(--card)] p-2`,
                  "data-compact-goals": ``,
                  children: [
                    (0, A.jsxs)(`p`, {
                      className: `px-2 py-2 text-label font-semibold text-ink-2`,
                      children: [
                        o.length, ` additional projects`,
                      ],
                    }),
                    o
                      .slice(0, n ? o.length : 3)
                      .map((e) =>
                        (0, A.jsxs)(
                          `div`,
                          {
                            className: `flex min-h-11 items-center gap-2 border-t border-edge px-2 py-1`,
                            "data-compact-goal": e.slug,
                            children: [
                              (0, A.jsx)(_e, {
                                className: `flex min-h-11 min-w-0 flex-[2] items-center truncate text-label text-ink`,
                                to: `/p/` + e.slug,
                                children: (0, A.jsx)(Xr, { source: e.title }),
                              }),
                              (0, A.jsx)(ti, { project: e }),
                              (0, A.jsxs)(`span`, {
                                className: `w-9 shrink-0 text-right text-caption tabular-nums text-ink-2`,
                                children: [
                                  e.total
                                    ? Math.round((e.done / e.total) * 100)
                                    : 0,
                                  `%`,
                                ],
                              }),
                            ],
                          },
                          e.id,
                        ),
                      ),
                    o.length > 3 &&
                      (0, A.jsx)(`button`, {
                        type: `button`,
                        onClick: () => r((e) => !e),
                        "aria-expanded": n,
                        className: `min-h-11 w-full text-label text-ink-2`,
                        children: n
                          ? `Show fewer`
                          : `Show all ` + o.length + ` projects`,
                      }),
                  ],
                }),
            ],
          }),
    ],
  });
}
function Ei(e) {
  let t = 0;
  for (let n of e) if (n.status === `active` && ++t > 4) return !0;
  return !1;
}
function Di(e, t) {
  return t === `demo` && e > 4;
}
var Oi = (0, k.lazy)(() =>
    D(
      () =>
        import(`@lemma/GoalDistance-Ddx5kFfr.js`).then((e) => ({
          default: e.GoalDistance,
        })),
      __vite__mapDeps([15, 2, 3, 16, 17, 18, 5, 4, 11, 13]),
    ),
  ),
  ki = (0, k.lazy)(() =>
    D(
      () =>
        import(`@lemma/ReviewOutlook-KIo9eEhV.js`).then((e) => ({
          default: e.ReviewOutlook,
        })),
      __vite__mapDeps([19, 16, 2, 3, 17, 18, 5, 4, 11, 6, 7, 8, 9]),
    ),
  );
function Ai() {
  const date = new Date();
  return (0, A.jsxs)(`header`, {
    className: `notebook-header`,
    children: [
      (0, A.jsxs)(`div`, {className:`notebook-identity`, children:[
        (0,A.jsx)(`span`, {className:`notebook-mark`, "aria-hidden":true, children:`ℓ`}),
        (0,A.jsxs)(`div`, {children:[
          (0,A.jsx)(`h1`, {children:`Lemma`}),
          (0,A.jsx)(`time`, {dateTime:date.toLocaleDateString('en-CA'), children:new Intl.DateTimeFormat(`en`,{weekday:`short`,month:`short`,day:`numeric`}).format(date)}),
        ]}),
      ]}),
      (0,A.jsx)(NotebookMenu,{}),
    ],
  });
}
function ji() {
  return (0, A.jsxs)(Fr, {
    tabBar: !0,
    children: [
      (0, A.jsx)(Ai, { pending: 0 }),
      (0, A.jsxs)(Lr, {
        className: `flex min-h-[200px] flex-col gap-3 p-[var(--pad)]`,
        children: [
          (0, A.jsxs)(`div`, {
            className: `flex items-center gap-4`,
            children: [
              (0, A.jsx)(Vr, { w: 40, h: 40 }),
              (0, A.jsxs)(`div`, {
                className: `flex flex-1 flex-col gap-2`,
                children: [
                  (0, A.jsx)(Vr, { w: `45%`, h: 15 }),
                  (0, A.jsx)(Vr, { w: `72%`, h: 22 }),
                ],
              }),
              (0, A.jsx)(Vr, { w: 76, h: 76, radius: 40 }),
            ],
          }),
          (0, A.jsx)(Vr, { h: 55 }),
          (0, A.jsx)(Vr, { h: 52, radius: 17 }),
        ],
      }),
      (0, A.jsxs)(`div`, {
        className: `grid grid-cols-2 gap-3`,
        children: [
          (0, A.jsx)(Vr, { h: 100, radius: 22 }),
          (0, A.jsx)(Vr, { h: 100, radius: 22 }),
        ],
      }),
      (0, A.jsx)(Vr, { w: `38%`, h: 22 }),
      (0, A.jsx)(Vr, { h: 56 }),
      (0, A.jsx)(Vr, { h: 56 }),
    ],
  });
}
function Mi({ defer: e }) {
  let [t, n] = (0, k.useState)(!e),
    r = (0, k.useRef)(null);
  return (
    (0, k.useEffect)(() => {
      if (t) return;
      if (typeof IntersectionObserver > `u`) {
        n(!0);
        return;
      }
      let e = new IntersectionObserver(
        (t) => {
          t.some((e) => e.isIntersecting) && (n(!0), e.disconnect());
        },
        { threshold: 0.25 },
      );
      return (r.current && e.observe(r.current), () => e.disconnect());
    }, [t]),
    (0, A.jsx)(`div`, {
      ref: r,
      "data-forecast-on-demand": ``,
      children: t
        ? (0, A.jsx)(k.Suspense, {
            fallback: (0, A.jsx)(`div`, {
              "aria-label": `Seven-day review forecast`,
              role: `status`,
              className: `flex min-h-20 items-center text-label text-ink-2`,
              children: `Loading seven-day forecast…`,
            }),
            children: (0, A.jsx)(ki, {}),
          })
        : (0, A.jsx)(`button`, {
            type: `button`,
            onClick: () => n(!0),
            className: `flex min-h-20 w-full items-center text-left text-label text-ink-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]`,
            children: `Show seven-day forecast`,
          }),
    })
  );
}
var Ni = { overflow: `hidden`, textOverflow: `ellipsis`, whiteSpace: `nowrap` };
function Pi({ home: e, onCopy: t }) {
  let n = e.resume;
  if (!n)
    return (0, A.jsxs)(Lr, {
      className: `flex min-h-16 items-center justify-between gap-3 px-3 py-2`,
      children: [
        (0, A.jsx)(`span`, {
          className: `min-w-0 text-label text-ink-2`,
          style: Ni,
          children: `No chat yet. Start a path to begin.`,
        }),
        (0, A.jsx)(_e, {
          to: `/projects/new`,
          className: `flex min-h-11 shrink-0 items-center text-label font-semibold text-amber`,
          children: `New path`,
        }),
      ],
    });
  let r = n.pausedAt ? b(n.pausedAt) : null,
    i = n.checkpointTitle ?? `Ready to study`,
    a =
      n.stepsTotal > 0
        ? ` · step ` +
          Math.min(Math.max(1, n.step), n.stepsTotal) +
          ` of ` +
          n.stepsTotal
        : ``,
    o = Mr(n.projectTitle, i, a, r);
  return (0, A.jsxs)(Lr, {
    as: `section`,
    "aria-label": `Resume where you stopped`,
    "data-ui":`continue-row`,
      className: `flex min-h-16 min-w-0 items-center gap-2`,
    style: { padding: `4px 12px` },
    children: [
      (0, A.jsx)(`span`, { className: `sr-only`, children: o }),
      (0, A.jsx)(Br, { subject: n.glyph, hue: `slate`, size: 32 }),
      (0, A.jsxs)(`div`, {
        "aria-hidden": `true`,
        className: `min-w-0 flex-1`,
        children: [
          (0, A.jsxs)(`p`, {
            "data-resume-title": ``,
            title: Ar(n.projectTitle) + a,
            style: Ni,
            className: `text-body font-medium text-ink`,
            children: [(0, A.jsx)(Xr, { source: n.projectTitle }), a],
          }),
          (0, A.jsxs)(`p`, {
            "data-resume-meta": ``,
            title: (r ? `Paused ` + r + ` · ` : ``) + Ar(i),
            style: {
              ...Ni,
              fontSize: `13.5px`,
              height: `24px`,
              lineHeight: `24px`,
            },
            className: `mt-1 text-caption text-ink-3`,
            children: [
              (0, A.jsx)(`span`, { children: r ? `Paused ` + r + ` · ` : `` }),
              (0, A.jsx)(Xr, { source: i }),
            ],
          }),
        ],
      }),
      (0, A.jsxs)(`button`, {
        type: `button`,
        onClick: () => t(n.projectTitle),
        "aria-label": `Copy resume prompt`,
        className: `flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-ctl px-2 text-label font-medium text-ink-2 hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber`,
        children: [(0, A.jsx)(mt, { size: 16, "aria-hidden": `true` }), `Copy resume prompt`],
      }),
    ],
  });
} /* Native Today sections: source state, never rendered DOM extraction. */
/* v10: Today time and timer surfaces are React-owned, sourced from dated records.
   No rendered-DOM observers, no hard-coded "next" appointments or phantom hours. */
/* v11: Focus lives inside the React tree; the native dialog provides focus
   containment, Escape and an inert background. No imperative innerHTML updates. */
function LemmaFocusDialog() {
  const [opened, setOpened] = (0, k.useState)(false);
  const [finishDraft,setFinishDraft]=(0,k.useState)(null);
  const [parkOpen,setParkOpen]=(0,k.useState)(false),[parkText,setParkText]=(0,k.useState)(''),[parkError,setParkError]=(0,k.useState)('');
  const [state, setState] = (0, k.useState)(
    () =>
      window.__carrelIntegration?.getState?.().timer ||
      window.__lemmaSessionStore?.get?.() ||
      {},
  );
  const [now, setNow] = (0, k.useState)(Date.now());
  const dialog = (0, k.useRef)(null);
  const returnTo = (0, k.useRef)(null);
  const closing = (0, k.useRef)(false);
  (0, k.useEffect)(() => {
    const open = () => {
      if (window.__carrelDisabled) return;
      returnTo.current = document.activeElement;
      closing.current = false;
      setState({
        ...(window.__lemmaSessionStore?.get?.() ||
          window.__carrelIntegration?.getState?.().timer ||
          {}),
      });
      setNow(Date.now());
      setFinishDraft(null);
      setOpened(true);
    };
    const close = () => {
      closing.current = true;
      dialog.current?.close?.();
      setOpened(false);
      const previous = returnTo.current;
      returnTo.current = null;
      requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus?.();
      });
    };
    const sync = () =>
      setState({
        ...(window.__lemmaSessionStore?.get?.() ||
          window.__carrelIntegration?.getState?.().timer ||
          {}),
      });
    const finish=()=>{
      const current=window.__lemmaSessionStore.get();if(!current?.running&&!current?.paused)return;
      returnTo.current=document.activeElement;
      if(current.running)window.__carrelIntegration.open('timer','pause');
      const paused=window.__lemmaSessionStore.get();const seconds=paused.phase==='break'?Number(paused.studyElapsed)||0:Number(paused.elapsed)||0;
      setState({...paused});setFinishDraft({minutes:Math.max(1,Math.round(seconds/60)),rating:'Unrated',note:'',error:''});setOpened(true);
    };
    const park=()=>{setParkOpen(true);setParkError('')};
    window.addEventListener('lemma:park-request',park);
    window.addEventListener('lemma:finish-request',finish);
    window.addEventListener("lemma:focus-open", open);
    window.addEventListener("lemma:focus-close", close);
    window.addEventListener("lemma:sessionchange", sync);
    window.addEventListener("lemma:integrationchange", sync);window.addEventListener("lemma:notebookchange",sync);
    sync();
    return () => {
      window.removeEventListener('lemma:park-request',park);
      window.removeEventListener('lemma:finish-request',finish);
      window.removeEventListener("lemma:focus-open", open);
      window.removeEventListener("lemma:focus-close", close);
      window.removeEventListener("lemma:sessionchange", sync);
      window.removeEventListener("lemma:integrationchange", sync);window.removeEventListener("lemma:notebookchange",sync);
    };
  }, []);
  (0, k.useEffect)(() => {
    if (!opened) return;
    const node = dialog.current;
    if (!node) return;
    try {
      if (!node.open) node.showModal();
      window.__lemmaFeedback.setHost(node);
    } catch (_) {
      setOpened(false);
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(id);
      window.__lemmaFeedback.setHost(null);
      if (node.open) node.close();
    };
  }, [opened]);
  const dismiss = () => {
    closing.current = true;
    dialog.current?.close?.();
    setOpened(false);
    const previous = returnTo.current;
    returnTo.current = null;
    requestAnimationFrame(() => {
      if (previous?.isConnected) previous.focus?.();
    });
  };
  const onClose = () => {
    setOpened(false);
    const previous = returnTo.current;
    returnTo.current = null;
    requestAnimationFrame(() => {
      if (previous?.isConnected && typeof previous.focus === "function")
        previous.focus();
    });
  };
  if (!opened) return null;
  const parks=window.__lemmaNotebook.getState().parked.filter(park=>!park.done&&state.sessionId&&park.sessionId===state.sessionId);
  const elapsed = Math.max(
    0,
    (Number(state.elapsed) || 0) +
      (state.running
        ? Math.max(0, now - (Number(state.stamp) || now)) / 1000
        : 0),
  );
  const phase = state.phase === "break";
  const limit =
    60 * (Number(phase ? state.breakLength || state.short : state.focus) || 50);
  const done = state.mode === "pomo" && elapsed >= limit;
  const remaining =
    state.mode === "pomo"
      ? Math.max(0, Math.ceil(limit - elapsed))
      : Math.max(0, Math.floor(elapsed));
  const time = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const status = done
    ? phase
      ? "Break finished"
      : "Focus interval complete"
    : state.paused
      ? "Paused"
      : !state.running
        ? "Ready to start"
        : phase
          ? "On a break"
          : "In focus";
  const action =
    done || (!state.running && !state.paused)
      ? "start"
      : state.paused
        ? "resume"
        : "pause";
  const primary = done
    ? "Start next focus"
    : state.paused
      ? "Resume"
      : !state.running
        ? "Start focus"
        : "Pause";
  const timerAction = (a) => window.__carrelIntegration?.open?.("timer", a);
  const parkThought=event=>{event.preventDefault();const text=parkText.trim();if(!text||text.length>180){setParkError('Write a thought, up to 180 characters.');return}if(window.__carrelIntegration.open('timer','park',{text})===false){setParkError('Could not park the thought. Try again.');return}setParkText('');setParkOpen(false);setParkError('')};
  const Btn = (text, onClick, cls) =>
    (0, A.jsx)("button", {
      type: "button",
      className: cls,
      onClick,
      children: text,
    });
  const finishForm=finishDraft&&(0,A.jsxs)('section',{className:'lemma-finish-form','aria-label':'Finish focus session',children:[
    (0,A.jsx)('h1',{tabIndex:-1,children:'Finish focus session'}),
    (0,A.jsx)('p',{children:`${state.activity||'Study'}${state.checkpoint?' · '+state.checkpoint:''}`}),
    (0,A.jsxs)('label',{htmlFor:'lemma-finish-minutes',children:['Logged time · minutes',(0,A.jsx)('input',{id:'lemma-finish-minutes',type:'number',inputMode:'numeric',min:1,max:1440,'aria-invalid':Boolean(finishDraft.error),'aria-describedby':finishDraft.error?'lemma-finish-error':undefined,value:finishDraft.minutes,onChange:event=>setFinishDraft({...finishDraft,minutes:event.target.value}),autoFocus:true})]}),
    (0,A.jsxs)('label',{htmlFor:'lemma-finish-rating',children:['Focus rating · optional',(0,A.jsx)('select',{id:'lemma-finish-rating',value:finishDraft.rating,onChange:event=>setFinishDraft({...finishDraft,rating:event.target.value}),children:['Unrated','Scattered','Okay','Deep'].map(value=>(0,A.jsx)('option',{value,children:value},value))})]}),
    (0,A.jsxs)('label',{htmlFor:'lemma-finish-note',children:['What did you learn? · optional',(0,A.jsx)('textarea',{id:'lemma-finish-note',rows:3,maxLength:500,value:finishDraft.note,onChange:event=>setFinishDraft({...finishDraft,note:event.target.value})})]}),
    parks.length>0&&(0,A.jsxs)('section',{className:'lemma-focus-parks','aria-label':'Parked thoughts',children:[(0,A.jsx)('h2',{children:'Parked · '+parks.length}),...parks.slice(0,5).map(park=>(0,A.jsxs)('div',{children:[(0,A.jsx)('p',{children:park.text}),(0,A.jsx)('button',{type:'button',onClick:()=>{if(window.__lemmaNotebook.resolvePark(park.id,'task'))window.__lemmaFeedback.show('Moved to backlog.')},children:'Make task'}),(0,A.jsx)('button',{type:'button',onClick:()=>window.__lemmaNotebook.resolvePark(park.id,'discard'),children:'Dismiss'})]},park.id)),(0,A.jsx)('small',{children:'Thoughts you keep remain available in Close my day.'})]}),
    finishDraft.error&&(0,A.jsx)('p',{id:'lemma-finish-error',role:'alert',className:'lemma-field-error',children:finishDraft.error}),
    (0,A.jsxs)('div',{className:'lemma-finish-actions',children:[
      (0,A.jsx)('button',{type:'button',className:'notebook-primary',onClick:()=>{
        const minutes=Number(finishDraft.minutes);if(!Number.isFinite(minutes)||minutes<1||minutes>1440){setFinishDraft({...finishDraft,error:'Enter a duration from 1 to 1,440 minutes.'});return}
        window.__carrelIntegration.open('timer','finish',{commit:true,minutes,rating:finishDraft.rating,note:finishDraft.note});setFinishDraft(null);dismiss();
      },children:'Save study time'}),
      (0,A.jsx)('button',{type:'button',className:'lemma-destructive-text',onClick:()=>{window.__carrelIntegration.open('timer','discard',{commit:true});setFinishDraft(null);dismiss()},children:'Discard session'}),
      (0,A.jsx)('button',{type:'button',className:'notebook-text-button',onClick:()=>setFinishDraft(null),children:'Back to paused session'}),
    ]}),
  ]});

  const overlay = (0, A.jsx)("dialog", {
    id: "cr-focus-overlay",
    ref: dialog,
    className: "cr cr-focus-overlay",
    "aria-label": "Fullscreen focus timer",
    onClose,
    onCancel: (e) => {
      e.preventDefault();
      dismiss();
    },
    children: finishForm || (0, A.jsxs)("div", {
      className: "cr-focus-wrap",
      children: [
        (0, A.jsxs)("header", {
          className: "cr-focus-header",
          children: [
            (0, A.jsxs)("span", {
              className: "cr-focus-wordmark",
              children: ["LEMMA ", (0, A.jsx)("span", { children: "/ FOCUS" })],
            }),
            (0, A.jsx)("button", {
              type: "button",
              className: "cr-icon",
              onClick: dismiss,
              "aria-label": "Close focus view",
              title: "Timer continues in the notebook",
              children: "×",
            }),
          ],
        }),
        (0, A.jsxs)("main", {
          className: "cr-focus-center",
          children: [
            (0, A.jsxs)("div", {
              className: "cr-focus-eyebrow",
              "aria-live": "polite",
              children: [
                (0, A.jsx)("span", {
                  className: "cr-focus-indicator",
                  "aria-hidden": true,
                }),
                status,
              ],
            }),
            (0, A.jsx)("div", {
              className: "cr-focus-subject",
              children: state.activity || "Study",
            }),
            (0, A.jsx)("p", {
              className: "cr-focus-checkpoint",
              children: state.checkpoint || "Independent study",
            }),
            (0, A.jsx)("div", {
              className: "cr-focus-clock cr-num",
              role: "timer",
              "aria-label": (phase ? "Break" : "Study") + " timer",
              children: time,
            }),
            (0, A.jsx)("div", {
              className: "cr-progress",
              "aria-label": "Progress through current interval",
              hidden: state.mode !== "pomo",
              role: "progressbar",
              "aria-valuenow": Math.min(
                100,
                Math.round((elapsed / Math.max(1, limit)) * 100),
              ),
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              children: (0, A.jsx)("i", {
                style: {
                  width:
                    Math.min(100, (elapsed / Math.max(1, limit)) * 100) + "%",
                },
              }),
            }),
            (0, A.jsx)("div", {
              className: "cr-focus-cycle",
              children: phase
                ? "Break"
                : state.mode!=='pomo' ? `${state.mode==='flow'?'Flowtime':'Open timer'} · elapsed study time` : `Pomodoro ${((Number(state.cycle)||1)-1) % (Number(state.every)||4)+1} of ${Number(state.every)||4} · ${state.focus||50} min focus / ${state.short||10} min break`,
            }),
            (0, A.jsx)("p", {
              className: "cr-focus-intent",
              children: state.intent || "Stay with the next step.",
            }),
            (0, A.jsxs)("div", {
              className: "cr-focus-buttons",
              children: [
                Btn(
                  primary,
                  () => timerAction(action),
                  "cr-button primary cr-focus-main",
                ),
                Btn(
                  phase ? "Back to study" : "Take a break",
                  () => timerAction("break"),
                  "cr-button cr-focus-secondary",
                ),
              ],
            }),
            (0, A.jsxs)("div", {
              className: "cr-focus-bottom",
              children: [
                (state.running || state.paused) && Btn('Noticed a distraction',()=>window.__carrelIntegration.open('timer','noticed'),'cr-button text'),
                (state.running || state.paused) && Btn('Park a thought'+(parks.length?' · '+parks.length:''),()=>{setParkOpen(true);setParkError('')},'cr-button text'),
                (state.running || state.paused) && Btn(
                  "Finish & log",
                  () => timerAction("finish"),
                  "cr-button lemma-focus-finish",
                ),

              ],
            }),
            parkOpen&&(0,A.jsxs)('form',{className:'lemma-focus-park',onSubmit:parkThought,children:[(0,A.jsx)('label',{htmlFor:'lemma-park-thought',children:'Set it down for later'}),(0,A.jsx)('input',{id:'lemma-park-thought',value:parkText,maxLength:180,autoFocus:true,placeholder:'e.g. Find a simpler counterexample','aria-invalid':Boolean(parkError),'aria-describedby':parkError?'lemma-park-error':undefined,onChange:event=>{setParkText(event.target.value);setParkError('')}}),parkError&&(0,A.jsx)('p',{id:'lemma-park-error',role:'alert',children:parkError}),(0,A.jsxs)('div',{children:[(0,A.jsx)('button',{type:'submit',className:'cr-button primary',children:'Park thought'}),Btn('Cancel',()=>setParkOpen(false),'cr-button')]})]}),
          ],
        }),
        (0, A.jsx)("footer", {
          className: "cr-focus-footnote",
          children:
            "One step at a time · study time stays linked to your project",
        }),
      ],
    }),
  });
  return Le().createPortal(overlay, document.body, "lemma-focus");
}
function LemmaQuickTask(){
 const [opened,setOpened]=(0,k.useState)(false),[draft,setDraft]=(0,k.useState)({}),[errors,setErrors]=(0,k.useState)({});
 const [catalog,setCatalog]=(0,k.useState)(()=>({subjects:window.__lemmaNotebook.subjects(),projects:window.__lemmaNotebook.getProjects()}));
 (0,k.useEffect)(()=>{const sync=()=>setCatalog({subjects:window.__lemmaNotebook.subjects(),projects:window.__lemmaNotebook.getProjects()}),open=()=>{if(window.__carrelDisabled)return;sync();setDraft({title:'',subject:window.__lemmaNotebook.getState().timer.activity||'Study',min:25,projectId:'',checkpointId:'',due:'',priority:2});setErrors({});setOpened(true)};window.addEventListener('lemma:quick-task',open);window.addEventListener('lemma:catalogchange',sync);return()=>{window.removeEventListener('lemma:quick-task',open);window.removeEventListener('lemma:catalogchange',sync)}},[]);
 const patch=(key,value)=>{setDraft(d=>({...d,[key]:value,...(key==='projectId'?{checkpointId:''}:{})}));setErrors(e=>({...e,[key]:''}))};
 const field=(label,key,type='text',extra={})=>(0,A.jsxs)('label',{htmlFor:'lemma-quick-'+key,children:[label,(0,A.jsx)('input',{id:'lemma-quick-'+key,type,value:draft[key]??'',onChange:event=>patch(key,event.target.value),'aria-invalid':Boolean(errors[key]),'aria-describedby':errors[key]?'lemma-quick-'+key+'-error':undefined,...extra}),errors[key]&&(0,A.jsx)('small',{id:'lemma-quick-'+key+'-error',className:'lemma-field-error',role:'alert',children:errors[key]})]});
 const save=event=>{
  event.preventDefault();const next={};if(!draft.title?.trim())next.title='Enter a short task title.';if(!Number.isFinite(Number(draft.min))||Number(draft.min)<5||Number(draft.min)>720)next.min='Enter 5–720 minutes.';if(draft.checkpointId&&!draft.projectId)next.checkpointId='Choose a learning path first.';
  if(Object.keys(next).length){setErrors(next);document.getElementById('lemma-quick-'+Object.keys(next)[0])?.focus();return}
  try{const task=window.__lemmaNotebook.saveQuickTask(draft);setOpened(false);
   const viewKey='quick-task-view';
   window.__lemmaFeedback.show('Task added to the top of your backlog.',{key:'quick-task-undo',action:{label:'Undo task',onClick:()=>{window.__lemmaNotebook.update(state=>{state.tasks=state.tasks.filter(row=>row.id!==task.id)},'quick-task-undo');window.__lemmaFeedback.show('Task removed.',{clearAction:viewKey})}}});
   window.__lemmaFeedback.show('Task added to the top of your backlog.',{key:viewKey,action:{label:'View in backlog',onClick:()=>window.__carrelIntegration.open('plan','backlog')}});
  }catch(error){setErrors({form:error.message||'Could not save the task.'})}
 };
 return (0,A.jsx)(Zi,{open:opened,onClose:()=>setOpened(false),title:'New task',children:(0,A.jsxs)('form',{className:'lemma-quick-task',onSubmit:save,noValidate:true,children:[
  field('Task','title','text',{maxLength:180,placeholder:'e.g. Prove the quotient-map criterion',autoFocus:true}),
  (0,A.jsxs)('label',{htmlFor:'lemma-quick-subject',children:['Subject',(0,A.jsx)('select',{id:'lemma-quick-subject',value:draft.subject,onChange:event=>patch('subject',event.target.value),children:[...new Set([draft.subject,...catalog.subjects])].filter(Boolean).map(subject=>(0,A.jsx)('option',{value:subject,children:subject},subject))})]}),
  (0,A.jsxs)('label',{htmlFor:'lemma-quick-projectId',children:['Learning path · optional',(0,A.jsxs)('select',{id:'lemma-quick-projectId',value:draft.projectId,onChange:event=>patch('projectId',event.target.value),children:[(0,A.jsx)('option',{value:'',children:'No linked path'}),...catalog.projects.filter(project=>project.status!=='archived').map(project=>(0,A.jsx)('option',{value:project.id,children:project.title},project.id))]})]}),
  field('Checkpoint · optional','checkpointId','text',{placeholder:'e.g. CP4',maxLength:20}),
  field('Estimate · minutes','min','number',{inputMode:'numeric',min:5,max:720}),
  (0,A.jsx)('div',{className:'lemma-duration-presets',role:'group','aria-label':'Task duration presets',children:[25,50,90].map(min=>(0,A.jsx)('button',{type:'button','aria-pressed':Number(draft.min)===min,onClick:()=>patch('min',min),children:min+' min'},min))}),
  field('Due date · optional','due','date'),
  (0,A.jsxs)('label',{htmlFor:'lemma-quick-priority',children:['Priority',(0,A.jsxs)('select',{id:'lemma-quick-priority',value:draft.priority,onChange:event=>patch('priority',Number(event.target.value)),children:[(0,A.jsx)('option',{value:2,children:'Normal'}),(0,A.jsx)('option',{value:1,children:'High'})]})]}),
  errors.form&&(0,A.jsx)('p',{role:'alert',className:'lemma-field-error',children:errors.form}),
  (0,A.jsx)('button',{type:'submit',className:'notebook-primary',children:'Save task'})
 ]})});
}
function LemmaTodayTime({inline=false}={}) {
  const [route,setRoute]=(0,k.useState)(location.hash.split('?')[0]);
  (0,k.useEffect)(()=>{const sync=()=>setRoute(location.hash.split('?')[0]);window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
  const read = () => ({
    session: window.__carrelIntegration?.getState?.() || {},
    prefs: window.__carrelIntegration?.getPreferences?.() || {},
  });
  const [snapshot, setSnapshot] = (0, k.useState)(read);
  const [now, setNow] = (0, k.useState)(Date.now());
  (0, k.useEffect)(() => {
    const sync = () => {setSnapshot(read());setNow(Date.now())};
    window.addEventListener("lemma:integrationchange", sync);window.addEventListener("lemma:notebookchange",sync);
    window.addEventListener("lemma:sessionchange", sync);
    const id = setInterval(() => {setNow(Date.now());setRoute(location.hash.split("?")[0]);}, 1000);
    sync();
    return () => {
      clearInterval(id);
      window.removeEventListener("lemma:integrationchange", sync);window.removeEventListener("lemma:notebookchange",sync);
      window.removeEventListener("lemma:sessionchange", sync);
    };
  }, []);
  const state = snapshot.session,
    timer = state.timer || {},
    settings = state.settings || {};
  const dayKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = dayKey(new Date(now));
  const effort = window.__lemmaEffortMetrics?.forDay?.(state.entries,timer,today,now);
  const entries = (Array.isArray(state.entries) ? state.entries : []).filter(
    (x) => x.date === today && Number.isFinite(Number(x.min ?? x.minutes)),
  );
  const logged = effort?.committedMinutes ?? entries.reduce(
    (n, x) => n + Math.max(0, Number(x.min ?? x.minutes) || 0),0);
  const focusInProgress = effort?.inProgressMinutes ?? 0;
  const blocks = (Array.isArray(state.blocks) ? state.blocks : []).filter(
    (x) =>
      x &&
      typeof x.date === "string" &&
      /^\d\d:\d\d$/.test(x.at || "") &&
      !x.actual &&
      !x.busy &&
      !x.current,
  );
  const upcoming = blocks
    .filter(
      (x) =>
        `${x.date}T${x.at}` >=
        `${today}T${new Date(now).toTimeString().slice(0, 5)}`,
    )
    .sort((a, b) =>
      (a.date + "T" + a.at).localeCompare(b.date + "T" + b.at),
    )[0];
  const clock = () => {
    const elapsed = Math.max(
      0,
      (Number(timer.elapsed) || 0) +
        (timer.running
          ? Math.max(0, now - (Number(timer.stamp) || now)) / 1000
          : 0),
    );
    const max =
      60 *
      (Number(
        timer.phase === "break"
          ? timer.breakLength || timer.short
          : timer.focus,
      ) || 50);
    const seconds =
      timer.mode === "pomo"
        ? Math.max(0, Math.ceil(max - elapsed))
        : Math.floor(elapsed);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const completed =
    timer.mode === "pomo" &&
    Math.max(
      0,
      (Number(timer.elapsed) || 0) +
        (timer.running
          ? Math.max(0, now - (Number(timer.stamp) || now)) / 1000
          : 0),
    ) >=
      60 *
        (Number(
          timer.phase === "break"
            ? timer.breakLength || timer.short
            : timer.focus,
        ) || 50);
  const label = completed
    ? timer.phase === "break"
      ? "Break finished"
      : "Focus interval complete"
    : timer.running
      ? timer.phase === "break"
        ? "On a break"
        : "In focus"
      : timer.paused
        ? "Paused"
        : "Not running";
  const fmt = (m) =>
    m >= 60
      ? `${Math.floor(m / 60)} h${m % 60 ? " " + Math.round(m % 60) + " min" : ""}`
      : `${Math.round(m)} min`;
  const calendar = () => window.__carrelIntegration?.open?.("plan", "today-agenda");
  const focus = () => window.__carrelIntegration?.open?.("timer");
  const action = completed
    ? "start"
    : timer.running
      ? "pause"
      : timer.paused
        ? "resume"
        : "start";
  const actionLabel = completed
    ? "Next focus"
    : timer.running
      ? "Pause"
      : timer.paused
        ? "Resume"
        : "Start";
  const sessionAction = () =>
    window.__carrelIntegration?.open?.("timer", action);
  const plannedHours = new Set(
    blocks.filter((x) => x.date === today).map((x) => Number(x.at.slice(0, 2))),
  );
  const loggedHours = new Set(effort?.loggedHours ?? entries
    .filter((x) => /^\d\d:\d\d$/.test(x.start || ""))
    .map((x) => Number(x.start.slice(0, 2))));
  const dayStart=new Date(new Date(now).setHours(0,0,0,0)).getTime(),dayEnd=new Date(new Date(now).setHours(24,0,0,0)).getTime();
  const ribbonSpans=[];
  const ribbonAdd=(start,end,kind,label)=>{start=Math.max(dayStart,start);end=Math.min(dayEnd,end);if(end>start)ribbonSpans.push({left:(start-dayStart)/(dayEnd-dayStart)*100,width:(end-start)/(dayEnd-dayStart)*100,kind,label});};
  for(const entry of state.entries||[])for(const part of window.__lemmaEffortMetrics?.pastIntervals(entry,now)||[])ribbonAdd(part.start,part.end,'logged',entry.title||'Logged study');
  for(const block of blocks){const start=+new Date(block.date+'T'+block.at);if(!block.actual)ribbonAdd(start,start+Number(block.min)*60000,'planned',block.title||'Planned study');}
  if(focusInProgress>0)ribbonAdd(now-focusInProgress*60000,now,'running','In progress');
  const ribbonKinds=['logged','planned','running'];
  const ribbonGroups=ribbonKinds.map(kind=>{const spans=ribbonSpans.filter(x=>x.kind===kind).sort((a,b)=>a.left-b.left),merged=[];for(const span of spans){const last=merged.at(-1);if(last&&span.left<=last.left+last.width){last.width=Math.max(last.left+last.width,span.left+span.width)-last.left;last.count++}else merged.push({...span,count:1})}return {kind,label:{logged:'Logged',planned:'Planned',running:'In progress'}[kind],spans:merged}});
  const nextLabel = upcoming
    ? `${upcoming.title || "Study block"} · ${upcoming.date === today ? "Today" : upcoming.date} ${upcoming.at} · ${fmt(Number(upcoming.min) || 0)}`
    : "No upcoming study blocks scheduled";
  const note = timer.checkpoint || "Independent study";
  const offer = (0, A.jsx)(`section`, {
    className: `cr cr-overview-addon lemma-today-session`,
    "aria-label": `Study time today`,
    "data-carrel": `addition`,
    children: (0, A.jsxs)(A.Fragment, {
      children: [
        (0, A.jsxs)(`div`, {
          className: `cr-row lemma-time-heading`,
          children: [
            (0, A.jsxs)(`div`, {
              children: [
                (0, A.jsx)(`strong`, {
                  className: `cr-label`,
                  children: `Study time today`,
                }),
                (0, A.jsx)(`p`, {
                  className: `cr-meta`,
                  children: `${fmt(logged)} logged${focusInProgress>0?` · ${fmt(focusInProgress)} in progress`:``} · ${fmt(Number(settings.daily) || 240)} intended`,
                }),
              ],
            }),
            (0, A.jsx)(`button`, {
              type: `button`,
              className: `cr-button`,
              onClick: calendar,
              children: `Open calendar`,
            }),
          ],
        }),
        (0,A.jsxs)(`div`,{className:`lemma-time-distribution`,role:`img`,'aria-label':`Study intervals today, shown in separate logged, planned and in-progress rows. The line marks the current time.`,children:[
         ...ribbonGroups.map(group=>(0,A.jsxs)(`div`,{className:`lemma-time-lane`,children:[(0,A.jsx)(`span`,{className:`lemma-time-lane-label`,children:group.label}),(0,A.jsxs)(`div`,{className:`lemma-time-track`,children:[...group.spans.map((span,index)=>(0,A.jsx)(`span`,{className:`lemma-time-span `+span.kind,style:{left:span.left+'%',width:span.width+'%'},title:group.label+' · '+span.count+' interval'+(span.count===1?'':'s'),'aria-hidden':true},index)),(0,A.jsx)(`i`,{className:`lemma-time-now`,style:{left:((now-dayStart)/(dayEnd-dayStart)*100)+'%'},'aria-hidden':true})]})]},group.kind)),
         (0,A.jsxs)(`div`,{className:`lemma-time-lane lemma-time-axis`,children:[(0,A.jsx)(`span`,{}),(0,A.jsx)(`div`,{className:`lemma-time-scale`,children:['00','06','12','18','24'].map(hour=>(0,A.jsx)(`span`,{children:hour},hour))})]})
        ]}),
        (0, A.jsxs)(`div`, {
          className: `cr-next-summary`,
          children: [
            (0, A.jsx)(`span`, { children: `Next · ${nextLabel}` }),
            (0, A.jsx)(`button`, {
              type: `button`,
              className: `cr-button`,
              onClick: focus,
              children: `Open focus`,
            }),
          ],
        }),
      ],
    }),
  });
  const timerButtons = (0, A.jsxs)(`div`, {
    className: `lemma-time-buttons`,
    children: [
      (0, A.jsx)(`button`, {
        type: `button`,
        className: `cr-button primary`,
        onClick: sessionAction,
        children: actionLabel,
      }),
      (0, A.jsx)(`button`, {
        type: `button`,
        className: `cr-button`,
        onClick: focus,
        children: `Focus view`,
      }),
    ],
  });
  const margin =
    snapshot.prefs.dayMargin &&
    (0, A.jsxs)(`aside`, {
      className: `cr cr-margin lemma-time-margin`,
      id: `cr-margin`,
      "data-carrel": `addition`,
      "aria-label": `Study session`,
      children: [
        (0, A.jsx)(`h2`, { children: `Focus timer` }),
        (0, A.jsx)(`p`, { className: `cr-meta`, children: label }),
        (0, A.jsx)(`strong`, {
          className: `cr-label`,
          children: timer.activity || "Study",
        }),
        (0, A.jsx)(`p`, { className: `cr-meta`, children: note }),
        (0, A.jsx)(`button`, {
          type: `button`,
          className: `cr-big-clock cr-num lemma-time-tap`,
          onClick: focus,
          "aria-label": `${clock()} remaining, open focus timer`,
          title: `Open focus timer`,
          children: clock(),
        }),
        timerButtons,
        (0, A.jsx)(`p`, {
          className: `cr-meta`,
          children: `Next · ${nextLabel}`,
        }),
        (0, A.jsx)(`button`, {
          type: `button`,
          className: `cr-button`,
          onClick: calendar,
          children: `Calendar`,
        }),
      ],
    });
  const dock =
    snapshot.prefs.dayMargin &&
    (0, A.jsxs)(`div`, {
      className: `cr cr-mobile-dock lemma-time-dock`,
      id: `cr-mobile-dock`,
      "data-carrel": `addition`,
      "aria-label": `Study session`,
      children: [
        (0, A.jsxs)(`button`, {
          type: `button`,
          className: `lemma-dock-context lemma-time-tap`,
          onClick: focus,
          "aria-label": `${timer.activity || "Study"}, ${label}, open timer details`,
          children: [
            (0, A.jsx)(`strong`, {
              className: `cr-label`,
              children: timer.activity || "Study",
            }),
            (0, A.jsx)(`small`, { className: `cr-meta`, children: label }),
            (0,A.jsx)(`time`,{title:clock(),children:Number(clock().split(':')[0])>=100?Math.floor(Number(clock().split(':')[0])/60)+'h'+String(Number(clock().split(':')[0])%60).padStart(2,'0'):clock()}),
          ],
        }),
        (0, A.jsx)(`button`, {
          type: `button`,
          className: `cr-button`,
          onClick: sessionAction,
          "aria-label": actionLabel + " session",
          "data-timer-action":actionLabel,
          children: actionLabel,
        }),

      ],
    });
  if (window.__carrelDisabled || route.startsWith('#/sign-in') || route.startsWith('#/review/run') || !(timer.running||timer.paused)) return null;
  return (0, A.jsxs)(A.Fragment, {
    children: [
      inline ? offer : null,
      !inline && margin && Le().createPortal(margin, document.body, `session-margin`),
      !inline && dock && Le().createPortal(dock, document.body, `session-dock`),
    ],
  });
}
function LemmaNativeWork({ home: e, onCopy: t }) {
  return (0, A.jsxs)(`section`, {
    "data-lemma-native-work": ``,
    className: `lemma-v4-desk flex min-w-0 flex-col gap-3`,
    children: [
      (0, A.jsx)(`h2`, {
        className: `ui-section-heading`,
        children: `Last tutor conversation`,
      }),
      (0, A.jsx)(`div`, {
        className: `lemma-v4-paper lemma-v4-desk-paper`,
        children: (0, A.jsx)(Pi, { home: e, onCopy: t }),
      }),
    ],
  });
}
function LemmaNativeReviews({ due: e, defer: t }) {
  // Use the same cached 30-day review sample and estimation policy as Review.
  const recentReviews=en(30);
  const selection=useLemmaBatch(Number(e)||0);
  const batch=selection.count;
  const minutes=lemmaEstimateMinutes(batch??0,recentReviews.data?.reviews??[]);
  return (0, A.jsxs)(`section`, {
    "data-lemma-native-review": ``,
    className: `lemma-v4-review flex min-w-0 flex-col gap-3`,
    children: [
      (0, A.jsx)(`h2`, {
        className: `ui-section-heading`,
        children: `Review cards`,
      }),
      (0, A.jsxs)(`div`, {
        className: `lemma-v4-paper`,
        children: [
          e > 0
            ? (0, A.jsxs)(`div`, {
                className: `lemma-v4-review-row`,
                children: [
                  (0, A.jsxs)(`div`, {
                    children: [
                      (0, A.jsxs)(`div`, {
                        className: `lemma-v4-review-count`,
                        children: [
                          batch===null?`Refresh batch`:batch,
                          (0, A.jsx)(`span`, {
                            style: { fontSize: 15, fontWeight: 400 },
                            children: batch===null?``:` cards today`,
                          }),
                        ],
                      }),
                      (0, A.jsxs)(`p`, {
                        className: `lemma-v4-review-sub`,
                        children: batch===null?[selection.status==='error'?`Review queue unavailable · open Review to retry · `:`Selection changed · open Review to refresh · `,Number(e).toLocaleString(),` total due`]:[`About `, minutes, ` min · `, Number(e).toLocaleString(), ` total due · catch-up plan available`],
                      }),
                    ],
                  }),
                  (0, A.jsx)(_e, {
                    to: `/review`,
                    className: `lemma-v4-action`,
                    children: `Review today`,
                  }),
                ],
              })
            : (0, A.jsx)(`p`, {
                className: `lemma-v4-review-sub`,
                children: `No cards due. You're up to date.`,
              }),
          (0, A.jsx)(`p`, {
            className: `lemma-v4-review-sub`,
            children: `Choose a manageable batch in Review.`,
          }),
          (0,A.jsxs)("details",{className:"lemma-forecast",children:[(0,A.jsx)("summary",{children:"View seven-day forecast"}),(0,A.jsx)(Mi,{defer:false})]}),
        ],
      }),
    ],
  });
}
function LemmaNativeProposalQueue({ pending: e }) {
  return e > 0
    ? (0, A.jsxs)(`section`, {
        "data-lemma-native-proposals": ``,
        className: `lemma-v4-proposal-queue flex min-w-0 flex-col gap-3`,
        children: [
          (0, A.jsx)(`h2`, {
            className: `ui-section-heading`,
            children: `Tutor proposals`,
          }),
          (0, A.jsxs)(`div`, {
            className: `lemma-v4-paper lemma-v4-tutor-line`,
            children: [
              (0, A.jsxs)(`div`, {
                children: [
                  (0, A.jsx)(`span`, {
                    className: `lemma-v4-kicker`,
                    children: `From your tutor`,
                  }),
                  (0, A.jsx)(`br`, {}),
                  (0, A.jsxs)(`strong`, {
                    children: [
                      e,
                      ` proposal`,
                      e === 1 ? `` : `s`,
                      ` awaiting your decision`,
                    ],
                  }),
                ],
              }),
              (0, A.jsx)(_e, {
                to: `/proposals`,
                className: `lemma-v4-text-link`,
                children: `Review proposals`,
              }),
              (0, A.jsx)(_e, {
                to: `/proposals?tab=plan`,
                className: `lemma-v4-text-link`,
                children: `Review plans`,
              }),
            ],
          }),
        ],
      })
    : null;
}
function Fi({ due: e, pending: t }) {
  return (0, A.jsxs)(`div`, {
    className: `grid grid-cols-2 gap-3`,
    children: [
      (0, A.jsx)(_e, {
        to: `/review`,
        "aria-label": e + ` cards due. Start reviewing`,
        className: `focus-visible:outline-2 focus-visible:outline-amber`,
        children: (0, A.jsxs)(Rr, {
          className: `relative flex h-[var(--summary-tile)] flex-col justify-between overflow-hidden p-[var(--pad-tile)]`,
          children: [
            (0, A.jsx)(`span`, {
              className: `text-[clamp(0.9rem,4vw,1.6rem)] font-semibold leading-none tracking-tight tabular-nums`,
              children: v(e),
            }),
            (0, A.jsx)(`span`, {
              className: `text-label text-ink-2`,
              children: e === 0 ? `all clear` : `cards due`,
            }),
          ],
        }),
      }),
      (0, A.jsx)(_e, {
        to: `/proposals`,
        "aria-label": t + ` proposals to approve`,
        className: `focus-visible:outline-2 focus-visible:outline-amber`,
        children: (0, A.jsxs)(Rr, {
          className: `relative flex h-[var(--summary-tile)] flex-col justify-between overflow-hidden p-[var(--pad-tile)]`,
          children: [
            (0, A.jsx)(`span`, {
              className: `text-[clamp(0.9rem,4vw,1.6rem)] font-semibold leading-none tracking-tight tabular-nums`,
              children: v(t),
            }),
            (0, A.jsx)(`span`, {
              className: `text-label text-ink-2`,
              children: t === 0 ? `inbox clear` : `to approve`,
            }),
          ],
        }),
      }),
    ],
  });
}

function selectTodayAction(home, timer, selection) {
  if (timer?.running || timer?.paused) return {kind:`focus`};
  if (home.resume) return {kind:`resume`, resume:home.resume};
  if (Number(home.due)>0 && selection.count!==0) return {kind:`review`};
  const project=(home.projects||[]).filter(p=>!p.system && p.status!==`archived` && p.status!==`paused`).find(p=>p.current);
  if (project) return {kind:`checkpoint`,project};
  if ((home.projects||[]).some(p=>!p.system && p.status!==`archived`)) return {kind:`paths`};
  return {kind:`empty`};
}
function LemmaTodayStudy({home,onCopy}) {
  const jsx=A.jsx, jsxs=A.jsxs;
  const read=()=>window.__carrelIntegration?.getState?.() || {};
  const [state,setState]=(0,k.useState)(read);
  const selection=useLemmaBatch(Number(home.due)||0);
  const reviews=en(30);
  const timer=state.timer||{};
  const active=!!(timer.running||timer.paused);
  const choice=selectTodayAction(home,timer,selection);
  const [now,setNow]=(0,k.useState)(Date.now());
  const heroRef=(0,k.useRef)(null);
  (0,k.useEffect)(()=>{
    const sync=()=>{setState(read());setNow(Date.now())};
    window.addEventListener(`lemma:integrationchange`,sync);window.addEventListener(`lemma:notebookchange`,sync);
    window.addEventListener(`lemma:sessionchange`,sync);
    sync();
    return()=>{window.removeEventListener(`lemma:integrationchange`,sync);window.removeEventListener(`lemma:notebookchange`,sync);window.removeEventListener(`lemma:sessionchange`,sync)};
  },[]);
  (0,k.useEffect)(()=>{if(!active)return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[active]);
  (0,k.useEffect)(()=>{
    if(choice.kind!==`focus`)return;
    const el=heroRef.current;
    const observer=new IntersectionObserver(([entry])=>{
      document.documentElement.toggleAttribute(`data-today-focus-visible`,entry.isIntersecting);
    },{threshold:0.15});
    if(el)observer.observe(el);
    return()=>{observer.disconnect();document.documentElement.removeAttribute(`data-today-focus-visible`)};
  },[choice.kind]);
  const date=new Date(now);
  const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,`0`)}-${String(date.getDate()).padStart(2,`0`)}`;
  const effort=window.__lemmaEffortMetrics?.forDay?.(state.entries,timer,day,now);
  const timeAvailable=Array.isArray(state.entries);
  const logged=effort?.committedMinutes ?? (state.entries||[]).filter(e=>e.date===day).reduce((sum,e)=>sum+Math.max(0,Number(e.min??e.minutes)||0),0);
  const fmt=minutes=>minutes>=60?`${Math.floor(minutes/60)} h ${Math.round(minutes%60)} min`:`${Math.round(minutes)} min`;
  const minutes=lemmaEstimateMinutes(selection.count??selection.budget,reviews.data?.reviews??[]);
  const resume=choice.resume;
  const cp=choice.project?.current;
  let title,meta,description,label,action,symbol=`∫`;
  if(choice.kind===`focus`){
    title=timer.activity||timer.project||`Your focus session`;
    meta=timer.paused?`PAUSED SESSION`:`CURRENT SESSION`;
    description=timer.intent||timer.checkpoint||`One thing at a time. Pick up where you left off.`;
    label=timer.paused?`Resume focus`:`Return to focus`;
    action=()=>{if(timer.paused)window.__carrelIntegration?.open?.(`timer`,`resume`);window.dispatchEvent(new Event(`lemma:focus-open`))};
    symbol=`τ`;
  }else if(choice.kind===`resume`){
    title=`Continue ${resume.checkpointTitle||resume.projectTitle}`;
    meta=resume.projectTitle+(resume.stepsTotal>0?` · Step ${Math.min(Math.max(1,(Number(resume.step)||0)+1),resume.stepsTotal)} of ${resume.stepsTotal}`:``);
    description=`Your last conversation is ready to pick up.`;
    label=`Copy resume prompt`;
    action=()=>onCopy(br(resume.projectTitle));
    symbol=resume.glyph||`∫`;
  }else if(choice.kind===`review`){
    title=selection.count===null?`A little practice, today`:`${selection.count.toLocaleString()} cards for today`;
    meta=`TODAY’S REVIEW`;
    description=selection.count===null?`Refresh your selected decks to prepare today’s batch.`:`About ${minutes} min. A manageable step to keep ideas close.`;
    label=`Review today`;
    symbol=`↻`;
  }else if(choice.kind===`checkpoint`){
    title=cp.title;
    meta=`${choice.project.title} · ${cp.code}`;
    description=`Your current checkpoint is ready. Open it to see the next step and the evidence to work toward.`;
    label=`Open checkpoint`;
    symbol=choice.project.subject?.glyph||`∫`;
  }else if(choice.kind===`paths`){
    title=`Find your next step`;
    meta=`YOUR LEARNING PATHS`;
    description=`Open a path to choose a checkpoint or resume your studies.`;
    label=`Open your paths`;
  }else{
    title=`Make room for an idea`;
    meta=`YOUR NOTEBOOK STARTS HERE`;
    description=`A path turns a subject you’re curious about into small, clear learning steps.`;
    label=`Create your first path`;
  }
  const elapsed=Math.max(0,(Number(timer.elapsed)||0)+(timer.running?Math.max(0,now-(Number(timer.stamp)||now))/1000:0));
  const seconds=timer.mode===`pomo`?Math.max(0,Math.ceil(60*(Number(timer.phase===`break`?timer.breakLength||timer.short:timer.focus)||50)-elapsed)):Math.floor(elapsed);
  const clock=`${String(Math.floor(seconds/60)).padStart(2,`0`)}:${String(seconds%60).padStart(2,`0`)}`;
  const to=choice.kind===`review`?`/review`:choice.kind===`checkpoint`?`/p/${choice.project.slug}/cp/${encodeURIComponent(cp.code)}`:choice.kind===`paths`?`/projects`:`/projects/new`;
  const next=(state.blocks||[]).filter(b=>!b.actual&&!b.busy&&!b.futureLog&&b.date===day&&b.at>=date.toTimeString().slice(0,5)).sort((a,b)=>a.at.localeCompare(b.at))[0];
  const row=(to,icon,title,sub)=>jsxs(_e,{to,className:`notebook-task-row`,children:[jsx(icon,{size:20,"aria-hidden":true}),jsxs(`span`,{children:[jsx(`strong`,{children:title}),jsx(`small`,{children:sub})]}),jsx(ut,{size:19,"aria-hidden":true})]},to);
  return jsxs(`div`,{className:`notebook-today`,children:[
    jsxs(`section`,{ref:heroRef,className:`notebook-study-card`,"data-primary-state":choice.kind,"aria-label":`Next study action`,children:[
      jsx(`span`,{className:`notebook-study-symbol`,"aria-hidden":true,children:jsx(Xr,{source:symbol})}),

      choice.kind!=='focus'&&jsx(`p`,{className:`notebook-study-meta`,children:jsx(Xr,{source:meta})}),
      jsx(`h2`,{children:jsx(Xr,{source:title})}),
      jsx(`p`,{className:`notebook-study-description`,children:jsx(Xr,{source:description})}),
      choice.kind===`focus`?jsxs(`div`,{className:`notebook-focus-status`,children:[jsx(`span`,{children:(timer.paused?`Paused`:timer.phase===`break`?`On a break`:`In focus`)+(timer.mode===`pomo`?` · remaining`:` · elapsed`)}),jsx(`time`,{"aria-label":`Session timer`,children:clock})]}):null,
      action?jsx(`button`,{type:`button`,className:`notebook-primary`,onClick:action,children:label}):jsx(_e,{to,className:`notebook-primary`,children:label}),
      choice.kind===`resume`?jsx(`p`,{className:`notebook-paste-note`,children:`Paste into your tutor to continue.`}):null,
    ]}),
    jsxs(_e,{to:`/insights?view=time`,className:`notebook-daily-progress`,children:[jsx(CrCalendarGlyph,{size:20,"aria-hidden":true}),jsxs(`span`,{children:[jsx(`strong`,{children:timeAvailable?`${fmt(logged)} logged today`:`Study time unavailable`}),jsx('span',{className:'notebook-progress-rail',role:'progressbar','aria-label':'Daily study intention','aria-valuemin':0,'aria-valuemax':Number(state.settings?.daily)||240,'aria-valuenow':Math.min(logged,Number(state.settings?.daily)||240),children:jsx('span',{style:{width:Math.min(100,logged/(Number(state.settings?.daily)||240)*100)+'%'}})}),jsx(`small`,{children:effort?.futureRecords?`${effort.futureRecords} records include future time · check your log`:effort?.needsReview?`Time records need review · check your log`:`See your study progress`})]}),jsx(ut,{size:19,"aria-hidden":true})]}),
    jsx(`h2`,{className:`notebook-also-heading`,children:`Also in your notebook`}),
    jsx(`div`,{className:`notebook-secondary-tasks`,children:[
      choice.kind!==`review`&&Number(home.due)>0?row(`/review`,Et,selection.count===null?`Today’s review`:`${selection.count.toLocaleString()} cards for today`,selection.count===null?`Refresh your selection in Review`:`About ${minutes} min · Review today`):null,
      next?jsxs('div',{className:'lemma-next-block-row',children:[
        jsxs(_e,{to:'/calendar',className:'notebook-task-row',children:[jsx(CrCalendarGlyph,{size:20,'aria-hidden':true}),jsxs('span',{children:[jsx('strong',{children:next.title||'Next study block'}),jsx('small',{children:'Next up · '+next.at+' · '+fmt(Number(next.min)||0)})]})]}),
        jsx('button',{type:'button',className:'lemma-next-block-start','aria-label':'Start '+(next.title||'next study block'),onClick:()=>window.__carrelIntegration?.open?.('timer','start-block',{blockId:next.id}),children:'Start'})
      ]}):row('/projects',vt,'Your learning paths','Find checkpoints, sessions and sources'),
    ].filter(Boolean).slice(0,2)}),
    ie()===`demo`?jsx(`p`,{className:`notebook-example-note`,children:`Example workspace · changes stay in this browser`}):null,
  ]});
}

function Ii() {
  let e = Ht(),
    t = tn(),
    n = fr(),
    r = ie() === `live`,
    i = x({
      queryKey: [`decks`],
      queryFn: () => S().getDeckTree(),
      enabled: r,
      staleTime: 3e4,
    }),
    a = x({
      queryKey: [`review-forecast`],
      queryFn: () => S().getReviewForecast(),
      enabled: r,
      staleTime: 3e4,
    }),
    [o, s] = (0, k.useState)(typeof navigator < `u` && !navigator.onLine);
  ((0, k.useEffect)(() => {
    let e = () => s(!navigator.onLine);
    return (
      window.addEventListener(`online`, e),
      window.addEventListener(`offline`, e),
      () => {
        (window.removeEventListener(`online`, e),
          window.removeEventListener(`offline`, e));
      }
    );
  }, []),
    (0, k.useEffect)(() => {
      e.error &&
        n(`Couldn't load your desk.`, {
          tone: `danger`,
          action: {
            label: `Try again`,
            onClick: () => {
              e.refetch();
            },
          },
        });
    }, [e.error, e.refetch, n]));
  async function c(e) {return window.__lemmaCopyPrompt(e,n);}

  if ((e.isPending && !e.data) || (r && (i.isPending || a.isPending)))
    return (0, A.jsx)(ji, {});
  if (e.error || !e.data)
    return (0, A.jsxs)(Fr, {
      tabBar: !0,
      children: [
        (0, A.jsx)(Ai, { pending: 0 }),
        (0, A.jsx)(Kr, {
          art: o ? `plug` : `compass`,
          title: o ? `You are offline` : `Couldn't load your desk`,
          body: o
            ? `Reconnect to resume studying.`
            : `Your study data is safe. Try loading again.`,
          action: {
            label: `Try again`,
            onClick: () => {
              e.refetch();
            },
          },
        }),
      ],
    });
  let l = e.data.projects
    .filter((e) => !e.system && e.status !== `archived`)
    .sort(
      (e, t) =>
        Number(!!t.pinned) - Number(!!e.pinned) ||
        (Date.parse(t.lastActivityAt ?? ``) || 0) -
          (Date.parse(e.lastActivityAt ?? ``) || 0),
    );
  return (0, A.jsxs)(Fr, {
    tabBar: !0,
    className: `gap-6`,
    children: [
      (0, A.jsx)(Ai, { pending: e.data.pendingProposals }),
      o &&
        (0, A.jsx)(`div`, {
          role: `status`,
          className: `rounded-ctl border border-edge-2 bg-fill-1 p-3 text-label text-ink-2`,
          children: `You're offline. Changes cannot be saved until you're connected.`,
        }),
      ie() === `live` &&
        t.data &&
        !t.data.connectorLastSeenAt &&
        (0, A.jsxs)(_e, {
          to: `/settings`,
          "aria-label": `Connect your tutor`,
          className: `flex min-h-12 items-center justify-between gap-3 rounded-ctl border border-amber-line bg-amber-tint px-4 py-3 text-label text-ink-soft`,
          children: [
            (0, A.jsxs)(`span`, {
              children: [
                (0, A.jsx)(`strong`, {
                  className: `text-amber`,
                  children: `Tutor not connected.`,
                }),
                ` Set up the connector in Settings to record study progress.`,
              ],
            }),
            (0, A.jsx)(ut, { size: 18, className: `shrink-0 text-amber` }),
          ],
        }),
      (0,A.jsx)(LemmaTodayStudy,{home:e.data,onCopy:c}),
    ],
  });
}
function Li(e, t, n) {
  return t === `demo`
    ? e.prefetchQuery({ queryKey: [`atlas`], queryFn: n, staleTime: 3e4 })
    : Promise.resolve();
}
function Ri(e) {
  let t = 0;
  for (let n of e) n.pinned && !n.system && n.status !== `archived` && t++;
  return t;
}
var zi = [`active`, `paused`, `done`],
  Bi = 16,
  Vi = (e) => e === `active` || e === `planning`,
  Hi = (e, t) => (t === `active` ? Vi(e.status) : e.status === t),
  Ui = (e, t) =>
    (Date.parse(t.lastActivityAt ?? ``) || 0) -
    (Date.parse(e.lastActivityAt ?? ``) || 0);
function Wi({ project: e }) {
  return (0, A.jsxs)(`div`, {
    "data-ui":`path-row`,
      className: `flex min-w-0 items-center gap-2`,
    children: [
      (0, A.jsx)(ti, { project: e }),
      (0, A.jsxs)(`span`, {
        "data-count-role": ``,
        className: `flex shrink-0 flex-col items-end font-[var(--font-ui)] text-caption tabular-nums text-ink-2`,
        children: [
          (0, A.jsxs)(`span`, { children: [e.done, ` of `, e.total] }),
          e.scheduleHeadline &&
            (0, A.jsx)(`span`, {
              "data-schedule-chip": ``,
              className: `whitespace-nowrap text-[12px]`,
              children: "Checkpoint schedule · " + e.scheduleHeadline,
            }),
        ],
      }),
    ],
  });
}
function Gi({ project: e, showSubject: t = !1, pinnedCount: n }) {
  let r = hn(),
    i = fr(),
    [a, o] = (0, k.useState)(!1),
    s = (0, k.useRef)(null),
    c = (0, k.useRef)(!1),
    l = () => {
      s.current !== null && (clearTimeout(s.current), (s.current = null));
    },
    u =
      e.status === `archived`
        ? [{ label: `Restore as active`, patch: { status: `active` } }]
        : [
            { label: e.pinned ? `Unpin` : `Pin`, patch: { pinned: !e.pinned } },
            { label: `Set active`, patch: { status: `active` } },
            { label: `Pause`, patch: { status: `paused` } },
            { label: `Finish`, patch: { status: `done` } },
            { label: `Archive`, patch: { status: `archived` } },
          ];
  const [phone,setPhone]=(0,k.useState)(()=>matchMedia('(max-width:600px)').matches);
  (0,k.useEffect)(()=>{const query=matchMedia('(max-width:600px)'),sync=()=>setPhone(query.matches);query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync)},[]);
  async function d(t, a) {
    if ((o(!1), a.pinned && n >= 4))
      i(`At most four projects can be pinned. Unpin one first.`, {
        tone: `danger`,
      });
    else
      try {
        (await r.mutateAsync({ id: e.id, patch: a }),
          i(t + ` saved`, { tone: `success` }));
      } catch (e) {
        i(e instanceof Error ? e.message : `Unable to update project`, {
          tone: `danger`,
        });
      }
  }
  return (
    (0, k.useEffect)(() => () => l(), []),
    (0, A.jsxs)(`article`, {
      "data-ui":`project-list-row`,
      className: `relative px-3 py-2 hover:bg-[var(--paper-2)]`,
      "data-project-row": e.slug,
      onContextMenu: (e) => {
        (e.preventDefault(), o(!0));
      },
      onPointerDown: (e) => {
        ((c.current = !1),
          e.pointerType !== `mouse` &&
            (l(),
            (s.current = setTimeout(() => {
              ((c.current = !0), o(!0));
            }, 550))));
      },
      onClickCapture: (e) => {
        c.current &&= (e.preventDefault(), e.stopPropagation(), !1);
      },
      onPointerUp: l,
      onPointerCancel: l,
      onPointerLeave: l,
      children: [
        (0, A.jsxs)(`div`, {
          className: `flex items-start gap-2`,
          children: [
            e.status === `archived`
              ? (0, A.jsx)(`button`, {
                  type: `button`,
                  onClick: () => o(!0),
                  "aria-label": `Restore options for ` + e.title,
                  className: `min-w-0 flex-1 rounded-ctl text-left focus-visible:outline-2 focus-visible:outline-amber`,
                  children: (0, A.jsxs)(`span`, {
                    className: `flex items-center gap-2`,
                    children: [
                      t && (0, A.jsx)(`span`, {
                        "aria-hidden": `true`,
                        className: `text-title-s text-ink-2`,
                        children: lemmaSubjectGlyph(e.subject),
                      }),
                      (0, A.jsx)(`span`, {
                        className: `min-w-0 flex-1 break-words text-body-l font-semibold`,
                        children: (0, A.jsx)(Pe, { source: e.title }),
                      }),
                      (0, A.jsx)(`span`, {
                        className: `text-caption text-ink-2`,
                        children: `Archived · restore`,
                      }),
                    ],
                  }),
                })
              : (0, A.jsxs)(_e, {
                  to: `/p/` + e.slug,
                  className: `min-w-0 flex-1 rounded-ctl focus-visible:outline-2 focus-visible:outline-amber`,
                  children: [
                    (0, A.jsxs)(`div`, {
                      className: `flex items-center gap-2`,
                      children: [
                        t && (0, A.jsx)(`span`, {
                          "aria-hidden": `true`,
                          className: `text-title-s text-ink-2`,
                          children: lemmaSubjectGlyph(e.subject),
                        }),
                        (0, A.jsx)(`span`, {
                          className: `min-w-0 flex-1 break-words text-body-l font-semibold`,
                          children: (0, A.jsx)(Pe, { source: e.title }),
                        }),
                        e.pinned &&
                          (0, A.jsx)(`span`, {
                            className: `shrink-0 text-caption text-ink-2`,
                            children: `Pinned`,
                          }),
                      ],
                    }),
                    (0, A.jsxs)(`div`, {
                      className: `mt-1 text-caption text-ink-2 [&_.katex]:text-[16px]`,
                      children: [
                        t &&
                          (0, A.jsxs)(`span`, {
                            className: `mr-2`,
                            children: [
                              (0, A.jsx)(Pe, {
                                source: e.subject?.name ?? `Unassigned`,
                              }),
                              ` ·`,
                            ],
                          }),
                        e.current
                          ? (0, A.jsxs)(A.Fragment, {
                              children: [
                                `Now `,
                                e.current.code,
                                ` `,
                                (0, A.jsx)(Pe, { source: e.current.title }),
                              ],
                            })
                          : e.total
                            ? `Plan complete`
                            : `Your tutor fills in the plan`,
                      ],
                    }),
                  ],
                }),
            (0, A.jsx)(`button`, {
              type: `button`,
              "aria-label": `Actions for ` + e.title,"data-style":"role-actions-for","data-ui":`path-actions`,
              "aria-expanded": a,
              "aria-haspopup": `dialog`,
              onClick: () => o((e) => !e),
              className: `path-action-control`,
              children: (0,A.jsx)(`span`,{className:`path-action-mark`,children:(0,A.jsx)(gt,{size:18})}),
            }),
          ],
        }),
        (0, A.jsx)(Wi, { project: e }),
        a &&
          (0, A.jsxs)(`dialog`, {
            ref:node=>{if(node&&!node.open)node.showModal()},
            onCancel:event=>{event.preventDefault();o(false)},
            'aria-modal':true,
            role: `dialog`,
            "aria-label": `Manage ` + e.title,
            className: `project-action-dialog`,
            onClick:event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)o(false)}},
            children: [
              (0,A.jsxs)(`div`,{className:`project-action-heading`,children:[
                (0,A.jsx)(`strong`,{className:`min-w-0 flex-1 break-words text-body text-ink`,children:`Manage `+e.title}),
                (0,A.jsx)(`button`,{type:`button`,className:`min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink`,onClick:()=>o(false),children:`Close`}),
              ]}),
              u
                .filter((t) => !(t.label === `Pin` && e.pinned) && t.patch.status!==e.status)
                .map((t) =>
                  (0, A.jsx)(
                    `button`,
                    {
                      type: `button`,
                      role: `button`,
                      disabled: r.isPending || t.patch.status === e.status,
                      onClick: () => void d(t.label, t.patch),
                      className: `min-h-11 rounded-ctl border border-edge bg-[var(--card-2)] px-2 text-left text-label disabled:opacity-40`,
                      "data-destructive": t.patch.status===`archived`?true:undefined,children:t.label,
                    },
                    t.label,
                  ),
                ),
            ],
          }),
      ],
    })
  );
}
function lemmaSubjectGlyph(subject){
  const name=String(subject?.name||'Unassigned').trim(),glyph=String(subject?.glyph||'').trim();
  const generic=!glyph||['∑','Σ','\\sum'].includes(glyph)||(glyph==='∫'&&/stress|subject|mathematics|unassigned|general/i.test(name));
  if(!generic)return glyph;
  if(/^unassigned$/i.test(name))return '?';
  const words=name.match(/[\p{L}\p{N}]+/gu)||[],number=name.match(/\d+(?![\s\S]*\d)/);
  if(number)return (words[0]?.[0]||'S').toLocaleUpperCase()+number[0];
  return words.slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase()||'?';
}
function Ki({
  name: e,
  glyph: t,
  items: n,
  total: r,
  collapsed: i,
  onToggle: a,
  pinnedCount: o,
}) {
  return (0, A.jsxs)(`section`, {
    "aria-label": e + ` projects`,"data-style":"role-projects",
    "data-group-size": r,
    className: `overflow-visible rounded-slab border border-edge bg-[var(--paper)]`,
    children: [
      (0, A.jsxs)(`button`, {
          type: `button`,
          "aria-expanded": !i,
          onClick: a,
          className: `flex min-h-12 w-full items-center gap-2 border-b border-edge px-3 text-left`,
          children: [
            (0, A.jsx)(`span`, {
              "aria-hidden": `true`,
              className: `text-title-s text-ink-2`,
              children: t,
            }),
            (0, A.jsx)(yr, {
              className: `min-w-0 flex-1 break-words`,
              children: (0, A.jsx)(Pe, { source: e }),
            }),
            (0, A.jsxs)(`span`, {
              className: `text-caption text-ink-2`,
              children: [r, ` `, r === 1 ? `project` : `projects`],
            }),
            (0, A.jsx)(ct, {
              size: 17,
              className:
                `text-ink-3 transition-transform ` + (i ? `-rotate-90` : ``),
            }),
          ],
        }),
      !i &&
        (0, A.jsx)(`div`, {
          className: `divide-y divide-[var(--hair)]`,
          children: n.map((e) =>
            (0, A.jsx)(
              Gi,
              { project: e, showSubject: false, pinnedCount: o },
              e.id,
            ),
          ),
        }),
    ],
  });
}
function qi() {
  let e = d();
  (0, k.useEffect)(() => {
    D(
      () => import(`@lemma/Page-DbdYWJ80.js`),
      __vite__mapDeps([
        20, 2, 3, 13, 16, 17, 18, 5, 4, 11, 21, 22, 23, 6, 7, 8, 9,
      ]),
    ).catch(() => {});
  }, []);
  let t = (0, k.useCallback)(() => {
      ie() === `demo` &&
        (D(() => Promise.resolve().then(() => Ra), void 0),
        Li(e, ie(), () => S().getAtlas()));
    }, [e]),
    n = Ut(),
    r = fr(),
    [i, a] = de(),
    [o, s] = (0, k.useState)(``),
    [c, l] = (0, k.useState)(()=>{try{const value=JSON.parse(sessionStorage.getItem(`lemma.paths.collapsed`)||`[]`);return Array.isArray(value)?value:[]}catch{return []}}),
    [u, f] = (0, k.useState)(0),
    p = [`active`, `paused`, `done`, `archived`].includes(i.get(`status`) ?? ``)
      ? i.get(`status`)
      : `active`;
  (0, k.useEffect)(() => {
    n.error &&
      r(`Couldn't load your paths.`, {
        tone: `danger`,
        action: {
          label: `Try again`,
          onClick: () => {
            n.refetch();
          },
        },
      });
  }, [n.error, n.refetch, r]);
  (0,k.useEffect)(()=>{sessionStorage.setItem(`lemma.paths.collapsed`,JSON.stringify(c))},[c]);
  let m = (0, k.useMemo)(
      () => (n.data ?? []).filter((e) => !e.system),
      [n.data],
    ),
    h = (0, k.useMemo)(() => Ri(m), [m]),
    g = (0, k.useMemo)(
      () =>
        m
          .filter(
            (e) =>
              Hi(e, p) &&
              (!o.trim() ||
                [
                  e.title,
                  e.subject?.name ?? `Unassigned`,
                  ...(e.sourceTitles ?? []),
                ].some((e) =>
                  e.toLocaleLowerCase().includes(o.trim().toLocaleLowerCase()),
                )),
          )
          .sort(Ui),
      [m, p, o],
    ),
    _ = (0, k.useMemo)(() => g.filter((e) => e.pinned).slice(0, 4), [g]),
    v = (0, k.useMemo)(() => new Set(_.map((e) => e.id)), [_]),
    y = (0, k.useMemo)(() => {
      let e = new Map();
      for (let t of g) {
        if (v.has(t.id)) continue;
        let n = t.subject?.id ?? `unassigned`,
          r = e.get(n) ?? {
            name: t.subject?.name ?? `Unassigned`,
            glyph: lemmaSubjectGlyph(t.subject),
            position: t.subject?.position ?? 2 ** 53 - 1,
            items: [],
          };
        (r.items.push(t), e.set(n, r));
      }
      return [...e.entries()]
        .map(([e, t]) => ({ id: e, ...t }))
        .sort(
          (e, t) => e.position - t.position || e.name.localeCompare(t.name),
        );
    }, [g, v]),
    b = 20,
    ee = g.length - _.length;
  (0, k.useEffect)(
    () => f((e) => Math.min(e, Math.max(0, Math.ceil(ee / b) - 1))),
    [ee, b],
  );
  let te = (0, k.useMemo)(() => {
      let e = 0,
        t = (u+1)*b;
      return y.flatMap((n) => {
        if (!t) return [];
        if (e >= n.items.length) return ((e -= n.items.length), []);
        let r = n.items.slice(e, e + t);
        return (
          (e = 0),
          (t -= r.length),
          r.length ? [{ ...n, items: r, total: n.items.length }] : []
        );
      });
    }, [y, u, b]),
    ne = [
      ...(_.length
        ? [
            {
              id: `pinned`,
              name: `Pinned`,
              glyph: `★`,
              items: _,
              total: _.length,
            },
          ]
        : []),
      ...te,
    ],
    re = [];
  for (let e of ne)
    if (e.total === 1) {
      let t = re[re.length - 1];
      t?.kind === `single`
        ? t.groups.push(e)
        : re.push({ kind: `single`, groups: [e] });
    } else re.push({ kind: `multi`, group: e });
  let x = Math.min(ee, (u + 1) * b),
    ae = (e) =>
      l((t) => (t.includes(e) ? t.filter((t) => t !== e) : [...t, e])),
    oe = (e) => {
      f(0);
      let t = new URLSearchParams(i);
      (e === `active` ? t.delete(`status`) : t.set(`status`, e), a(t));
    };
  return (0, A.jsxs)(Fr, {
    tabBar: !0,
    className: `gap-4`,
    title: `Paths`,
    children: [
      (0, A.jsxs)(`label`, {
        className: `flex min-h-11 items-center gap-2 rounded-ctl border border-edge bg-[var(--card)] px-3`,
        children: [
          (0, A.jsx)(Pt, {
            size: 17,
            "aria-hidden": `true`,
            className: `text-ink-3`,
          }),
          (0, A.jsx)(`span`, {
            className: `sr-only`,
            children: `Search paths`,
          }),
          (0, A.jsx)(`input`, {
            type: `search`,
            "aria-label": `Search paths`,
            placeholder: `Find a project or subject`,
            value: o,
            onChange: (e) => {
              (s(e.target.value), f(0));
            },
            className: `min-w-0 flex-1 bg-transparent py-3 text-body text-ink outline-none`,
          }),
          o &&
            (0, A.jsx)(`button`, {
              type: `button`,
              "aria-label": `Clear search`,
              onClick: () => {
                (s(``), f(0));
              },
              className: `flex size-11 items-center justify-center`,
              children: (0, A.jsx)(Bt, { size: 17 }),
            }),
        ],
      }),
      (0,A.jsxs)(_e,{to:`/atlas`,onPointerEnter:t,onPointerDown:t,onFocus:t,className:`notebook-concept-entry`,children:[(0,A.jsx)(Rt,{size:18,"aria-hidden":true}),(0,A.jsx)(`span`,{children:`Concept map`}),(0,A.jsx)(ut,{size:18,"aria-hidden":true})]}),
      p === `archived`
        ? (0, A.jsxs)(`div`, {
            "aria-label": `Archived projects navigation`,"data-style":"role-projects",
            className: `flex min-h-11 items-center justify-between gap-3`,
            children: [
              (0, A.jsxs)(`button`, {
                type: `button`,
                onClick: () => oe(`active`),
                className: `inline-flex min-h-11 items-center gap-2 rounded-ctl px-2 text-label text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]`,
                children: [
                  (0, A.jsx)(`span`, {
                    "aria-hidden": `true`,
                    className: `text-xl leading-none`,
                    children: `‹`,
                  }),
                  `Active paths`,
                ],
              }),
              (0, A.jsx)(`span`, {
                className: `text-caption text-ink-3`,
                children: `Archive`,
              }),
            ],
          })
        : (0, A.jsx)(`div`, {
            role: `group`,
            "aria-label": `Project status`,
            "data-status-segments": ``,
            className: `flex w-full min-w-0 items-stretch rounded-full border border-edge bg-[var(--paper-2)] p-1`,
            children: zi.map((e) =>
              (0, A.jsx)(
                `button`,
                {
                  type: `button`,
                  "aria-pressed": p === e,
                  onClick: () => oe(e),
                  className:
                    `min-h-11 min-w-0 flex-1 rounded-full px-2 text-label capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)] ` +
                    (p === e
                      ? `bg-[var(--paper)] font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.15)]`
                      : `text-ink-2 hover:text-ink`),
                  children: e,
                },
                e,
              ),
            ),
          }),
      n.isPending
        ? (0, A.jsxs)(A.Fragment, {
            children: [
              (0, A.jsx)(Vr, { h: 80 }),
              (0, A.jsx)(Vr, { h: 140 }),
              (0, A.jsx)(Vr, { h: 140 }),
            ],
          })
        : n.error
          ? (0, A.jsx)(Kr, {
              art: `plug`,
              title: `Paths unavailable`,
              body: `Try again when you're connected.`,
              action: {
                label: `Try again`,
                onClick: () => {
                  n.refetch();
                },
              },
            })
          : m.length
            ? g.length
              ? (0, A.jsxs)(`div`, {
                  className: `space-y-5`,
                  children: [
                    re.map((e, t) =>
                      e.kind === `single`
                        ? (0,A.jsx)(`div`,{
                            "aria-label":`Single-project subject groups`,
                            className:`flex flex-col gap-3`,
                            children:e.groups.map(group=>(0,A.jsx)(Ki,{
                              name:group.name,glyph:group.glyph,items:group.items,total:group.total,
                              collapsed:c.includes(group.id),onToggle:()=>ae(group.id),pinnedCount:h,
                            },group.id)),
                          },`single-${t}`)
                        : (0, A.jsx)(
                            Ki,
                            {
                              name: e.group.name,
                              glyph: e.group.glyph,
                              items: e.group.items,
                              total: e.group.total,
                              collapsed: c.includes(e.group.id),
                              onToggle: () => ae(e.group.id),
                              pinnedCount: h,
                            },
                            e.group.id,
                          ),
                    ),
                    ee > b &&
                      (0, A.jsxs)(`nav`, {
                        "aria-label": `Project pages`,
                        className: `flex flex-wrap items-center justify-between gap-2`,
                        children: [
                          false &&
                            (0, A.jsx)(`button`, {
                              type: `button`,
                              onClick: () => f((e) => Math.max(0, e - 1)),
                              className: `min-h-11 rounded-ctl border border-edge bg-fill-1 px-4 text-label text-amber`,
                              children: `Previous page`,
                            }),
                          (0, A.jsxs)(`span`, {
                            className: `text-caption text-ink-2`,
                            children: [
                              `Showing `,Math.min(ee,(u+1)*b),` of `,ee,` unpinned paths`,
                              _.length?` · ${_.length} pinned`:`` ,
                            ],
                          }),
                          x < ee &&
                            (0, A.jsxs)(`button`, {
                              type: `button`,
                              onClick: () => f((e) => e + 1),
                              className: `min-h-11 rounded-ctl border border-edge bg-fill-1 px-4 text-label text-amber`,
                              children: [
                                `Load 20 more paths`,
                              ],
                            }),
                        ],
                      }),
                  ],
                })
              : (0, A.jsxs)(`div`, {
                  className: `mx-auto flex w-full max-w-sm flex-col items-center gap-3 rounded-slab border border-edge bg-[var(--paper)] px-6 py-8 text-center`,
                  children: [
                    (0, A.jsx)(`p`, {
                      className: `text-body font-medium text-ink-2`,
                      children: o
                        ? `No projects match`
                        : p === `archived`
                          ? `No archived projects`
                          : `No projects in this status`,
                    }),
                    p === `archived` &&
                      !o &&
                      (0, A.jsx)(`p`, {
                        className: `text-caption leading-relaxed text-ink-3`,
                        children: `Archived projects will appear here until you restore them.`,
                      }),
                    o &&
                      (0, A.jsx)(`button`, {
                        type: `button`,
                        className: `min-h-11 rounded-ctl border border-edge px-4 text-label`,
                        onClick: () => s(``),
                        children: `Clear`,
                      }),
                  ],
                })
            : (0, A.jsx)(Kr, {
                art: `compass`,
                title: `Every proof starts somewhere`,
                body: `Start one with + and let your tutor make a study plan.`,
                action: { label: `New project`, to: `/projects/new` },
              }),
      p !== `archived` &&
        (0, A.jsxs)(`button`, {
          type: `button`,
          onClick: () => oe(`archived`),
          "aria-label": `View archived projects`,"data-style":"role-projects",
          className: `inline-flex min-h-11 items-center gap-2 self-start rounded-ctl px-2 text-label text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--link)]`,
          children: [`Archived projects`, (0, A.jsx)(ut, { size: 16 })],
        }),
    ],
  });
}
function Ji({ name: e }) {
  return (0, A.jsx)(`span`, {
    className: `block min-w-0 max-w-full overflow-x-auto`,
    children: (0, A.jsx)(Pe, { source: e }),
  });
}
function Yi({ names: e, onSelect: t }) {
  return (0, A.jsx)(`p`, {
    "aria-label": `Idea path`,
    className: `-mt-3 mb-2 flex min-w-0 max-w-full flex-wrap items-center gap-x-1 text-body text-ink-3`,
    children: e.map((e, n) =>
      (0, A.jsxs)(
        `span`,
        {
          className: `inline-flex min-w-0 max-w-full items-center gap-1`,
          children: [
            n > 0 &&
              (0, A.jsx)(`span`, { "aria-hidden": `true`, children: `›` }),
            t
              ? (0, A.jsx)(`button`, {
                  type: `button`,
                  "aria-label": `Open ` + Ar(e),
                  onClick: () => t(n),
                  className: `flex min-h-11 min-w-11 max-w-full items-center overflow-x-auto rounded-ctl px-2 text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--link)]`,
                  children: (0, A.jsx)(Pe, { source: e }),
                })
              : (0, A.jsx)(`span`, {
                  className: `min-w-0 max-w-full overflow-x-auto`,
                  children: (0, A.jsx)(Pe, { source: e }),
                }),
          ],
        },
        n,
      ),
    ),
  });
}
var Xi = Re();
function Zi({open,onClose,title,children}){
  const ref=(0,k.useRef)(null),closing=(0,k.useRef)(false),titleId=(0,k.useId)();
  (0,k.useEffect)(()=>{
    if(!open)return;const node=ref.current;if(!node)return;
    const previous=document.activeElement,before=document.body.style.overflow;closing.current=false;
    const routeClose=()=>onClose();window.addEventListener('hashchange',routeClose);window.addEventListener('popstate',routeClose);
    document.body.style.overflow='hidden';if(!node.open)node.showModal();
    const id=requestAnimationFrame(()=>node.querySelector('h2')?.focus({preventScroll:true}));
    return()=>{window.removeEventListener('hashchange',routeClose);window.removeEventListener('popstate',routeClose);cancelAnimationFrame(id);closing.current=true;if(node.open)node.close();document.body.style.overflow=before;if(previous?.isConnected)previous.focus({preventScroll:true})};
  },[open]);
  if(!open)return null;
  return Xi.createPortal((0,A.jsxs)('dialog',{ref,className:'ui-sheet lemma-native-sheet','aria-modal':true,'aria-labelledby':titleId,
    onCancel:event=>{event.preventDefault();onClose()},onClose:()=>{if(!closing.current)onClose()},
    onClick:event=>{if(event.target!==event.currentTarget)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose()},
    children:[(0,A.jsxs)('header',{className:'ui-sheet-header',children:[(0,A.jsx)('h2',{id:titleId,tabIndex:-1,className:'ui-sheet-title',children:title||'Details'}),(0,A.jsx)('button',{type:'button',onClick:onClose,'aria-label':'Close dialog',className:'ui-icon-button',children:(0,A.jsx)(Bt,{size:20,'aria-hidden':true})})]}),(0,A.jsx)('div',{className:'ui-sheet-body',children})]}),document.body);
}
var Qi = [`cluster`, `galaxy`, `system`, `planet`, `moon`],
  $i = new Intl.Collator().compare,
  ea = new WeakMap(),
  ta = (e) => /zz[-_ ]?selftest|^self[-_ ]test$|^system[-_]test/i.test(e);
function na(e) {
  return (
    !/(?:^|[\s(])(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?=$|[\s),.!?;:])/i.test(
      e,
    ) && /^[A-Za-z0-9][A-Za-z0-9 ,.:;!?()'+-]*$/.test(e)
  );
}
function ra(e, t, n, r, i, a) {
  return {
    id: e,
    slug: e,
    name: t,
    subjectId: n,
    level: r,
    parentId: i,
    children: [],
    depth: 0,
    synthetic: !0,
    glyph: a,
    total: 0,
    done: 0,
    revisit: 0,
    due: 0,
    rank: 0,
    status: `not_started`,
    blurb: null,
    pinX: null,
    pinY: null,
    checkpointRefs: [],
    dueCards: 0,
  };
}
function ia(e, t) {
  let n = new Map();
  for (let e of t)
    if (e.kind === `prereq`) {
      let t = n.get(e.toId);
      t ? t.push(e.fromId) : n.set(e.toId, [e.fromId]);
    }
  let r = [...e],
    i = new Map(),
    a = !0;
  for (let e of r) {
    let t = -1;
    for (let r of n.get(e) ?? []) {
      let e = i.get(r);
      if (e === void 0) {
        a = !1;
        break;
      }
      e > t && (t = e);
    }
    if (!a) break;
    i.set(e, t + 1);
  }
  if (a) return i;
  i.clear();
  let o = new Set(),
    s = [];
  for (let e of r)
    if (!i.has(e))
      for (
        o.add(e),
          s.push({ id: e, dependencies: n.get(e) ?? [], next: 0, max: -1 });
        s.length;
      ) {
        let e = s[s.length - 1];
        if (e.next < e.dependencies.length) {
          let t = e.dependencies[e.next++],
            r = i.get(t);
          r === void 0
            ? o.has(t)
              ? (e.max = Math.max(e.max, 0))
              : (o.add(t),
                s.push({
                  id: t,
                  dependencies: n.get(t) ?? [],
                  next: 0,
                  max: -1,
                }))
            : (e.max = Math.max(e.max, r));
        } else {
          let t = e.max + 1;
          if ((i.set(e.id, t), o.delete(e.id), s.pop(), s.length)) {
            let e = s[s.length - 1];
            e.max = Math.max(e.max, t);
          }
        }
      }
  return i;
}
function aa(e) {
  let t = e.checkpointRefs
    .map((e) => Number(e.code.match(/\d+/)?.[0]))
    .filter(Number.isFinite);
  return t.length ? Math.min(...t) : 2 ** 53 - 1;
}
function oa(e) {
  if (!e.synthetic) return null;
  let t = /^Taught in CP(\d+)$/i.exec(e.name);
  return t ? Number(t[1]) : null;
}
function sa(e) {
  let t = ea.get(e);
  if (t) return t;
  let n = [...e.subjects]
      .filter((e) => !ta(e.name) && !ta(e.id))
      .sort((e, t) => e.position - t.position || $i(e.name, t.name)),
    r = new Set(n.map((e) => e.id)),
    i = new Map(),
    a = new Map();
  for (let t of e.concepts) {
    if (!r.has(t.subjectId) || ta(t.id) || ta(t.name)) continue;
    let e = Qi.includes(t.level) ? t.level : `planet`,
      n = {
        ...t,
        level: e,
        parentId: t.parentId ?? null,
        children: [],
        depth: 0,
        synthetic: !1,
        glyph: null,
        total: 0,
        done: 0,
        revisit: 0,
        due: 0,
        rank: 0,
      };
    if ((i.set(t.id, n), e === `cluster`)) {
      let e = a.get(t.subjectId) ?? [];
      (e.push(n), a.set(t.subjectId, e));
    }
  }
  let o = [],
    s = new Map();
  for (let e of n) {
    let t = (a.get(e.id) ?? []).sort((e, t) => $i(e.name, t.name));
    for (let n of t) ((n.glyph = e.glyph), o.push(n.id));
    let n = t[0]?.id ?? `atlas:root:` + e.id;
    (t.length ||
      (i.set(n, ra(n, e.name, e.id, `cluster`, null, e.glyph)), o.push(n)),
      s.set(e.id, n));
  }
  for (let e of [...i.values()]) {
    if (e.level === `cluster`) {
      e.parentId = null;
      continue;
    }
    let t = e.parentId ? i.get(e.parentId) : void 0;
    if (
      t &&
      t.id !== e.id &&
      t.subjectId === e.subjectId &&
      Qi.indexOf(t.level) < Qi.indexOf(e.level)
    )
      continue;
    let n = e.topic?.trim();
    if ((e.level === `planet` || e.level === `moon`) && n) {
      let t = `atlas:topic:` + e.subjectId + `:` + n.toLocaleLowerCase();
      (i.has(t) ||
        i.set(t, ra(t, n, e.subjectId, `system`, s.get(e.subjectId), null)),
        (e.parentId = t));
    } else e.parentId = s.get(e.subjectId);
  }
  for (let e of i.values())
    e.parentId && i.get(e.parentId)?.children.push(e.id);
  let c = e.links.filter(
      (e) => e.fromId !== e.toId && i.has(e.fromId) && i.has(e.toId),
    ),
    l = ia(i.keys(), c),
    u = new Map(),
    d = new Map();
  for (let [e, t] of i) (u.set(e, aa(t)), d.set(e, oa(t)));
  let f = (e, t) => {
    let n = i.get(e);
    n.depth = t;
    let r = n.children.map((e) => f(e, t + 1)),
      a =
        !n.synthetic &&
        (n.level === `planet` || n.level === `moon` || n.children.length === 0);
    ((n.total = +!!a + r.reduce((e, t) => e + t.total, 0)),
      (n.done =
        (a && n.status === `demonstrated` ? 1 : 0) +
        r.reduce((e, t) => e + t.done, 0)),
      (n.revisit =
        (a && n.status === `revisit` ? 1 : 0) +
        r.reduce((e, t) => e + t.revisit, 0)),
      (n.due = n.dueCards + r.reduce((e, t) => e + t.due, 0)));
    let o = l.get(e) ?? 2 ** 53 - 1;
    for (let e of r) e.rank < o && (o = e.rank);
    ((n.rank = o),
      (n.synthetic || !a) &&
        (n.status = n.revisit
          ? `revisit`
          : n.total && n.done === n.total
            ? `demonstrated`
            : n.done > 0 || r.some((e) => e.status === `in_progress`)
              ? `in_progress`
              : n.status));
    let s = (e, t) => {
        let n = i.get(e),
          r = i.get(t),
          a = d.get(e) ?? null,
          o = d.get(t) ?? null;
        return a !== null && o !== null && a !== o
          ? a - o
          : n.rank - r.rank ||
              (u.get(e) ?? 2 ** 53 - 1) - (u.get(t) ?? 2 ** 53 - 1) ||
              $i(n.name, r.name) ||
              $i(n.id, r.id);
      },
      c = !0;
    for (let e = 1; e < n.children.length; e++)
      if (s(n.children[e - 1], n.children[e]) > 0) {
        c = !1;
        break;
      }
    return (c || n.children.sort(s), n);
  };
  for (let e of o) f(e, 0);
  let p = { roots: o, nodes: i, links: c };
  return (ea.set(e, p), p);
}
function F(e, t) {
  let n = [],
    r = new Set(),
    i = e.nodes.get(t)?.parentId ?? null;
  for (; i && !r.has(i);)
    (r.add(i), n.unshift(i), (i = e.nodes.get(i)?.parentId ?? null));
  return n;
}
function I(e, t) {
  let n = [],
    r = [...(e.nodes.get(t)?.children ?? [])];
  for (; r.length;) {
    let t = r.pop();
    (n.push(t), r.push(...(e.nodes.get(t)?.children ?? [])));
  }
  return n;
}
function L(e, t) {
  return new Set(
    [...e.nodes.values()]
      .filter((e) => e.children.length && e.depth < t - 1)
      .map((e) => e.id),
  );
}
function ca(e, t) {
  let n = t?.filter((t) => e.nodes.has(t));
  return n?.length ? new Set(n) : la(e);
}
function la(e) {
  let t = new Set(e.roots);
  for (let n of e.nodes.values())
    if (!n.synthetic && (n.status === `in_progress` || n.status === `revisit`))
      for (let r of F(e, n.id)) t.add(r);
  return t;
}
function ua(e, t) {
  let n = t.trim().toLocaleLowerCase();
  return (
    !!n &&
    (Ar(e.name).toLocaleLowerCase().includes(n) ||
      e.name.toLocaleLowerCase().includes(n))
  );
}
function da(e, t, n) {
  let r = [],
    i = null;
  if (n) {
    i = new Set();
    for (let t of e.nodes.values())
      if (n(t)) {
        i.add(t.id);
        for (let n of F(e, t.id)) i.add(n);
      }
  }
  let a = (o) => {
    if (i && !i.has(o)) return;
    let s = e.nodes.get(o);
    if ((r.push({ id: o, depth: s.depth, match: !!n && n(s) }), i || t.has(o)))
      for (let e of s.children) a(e);
  };
  for (let t of e.roots) a(t);
  return r;
}
function fa(e, t, n) {
  let r = new Map(t.map((e, t) => [e.id, t])),
    i = new Map(),
    a = (t) => {
      if (i.has(t)) return i.get(t);
      let n = [],
        a = new Set(),
        o = t,
        s = null;
      for (; o && !a.has(o);) {
        if (i.has(o)) {
          s = i.get(o);
          break;
        }
        (a.add(o), n.push(o));
        let t = r.get(o);
        if (t !== void 0) {
          s = t;
          break;
        }
        o = e.nodes.get(o)?.parentId ?? null;
      }
      for (let e of n) i.set(e, s);
      return s;
    },
    o = new Map();
  for (let t of e.links) {
    if (!n.has(t.kind)) continue;
    let e = a(t.fromId),
      r = a(t.toId);
    if (e === null || r === null || e === r) continue;
    let [i, s] = t.kind === `related` && e > r ? [r, e] : [e, r],
      c = t.kind + `:` + i + `:` + s,
      l = o.get(c) ?? {
        key: c,
        from: i,
        to: s,
        kind: t.kind,
        count: 0,
        links: [],
      };
    (l.count++, l.links.push(t), o.set(c, l));
  }
  return [...o.values()];
}
function pa(e, t, n) {
  let r = new Map(t.map((e, t) => [e.id, t])),
    i = new Map(),
    a = (t) => {
      if (i.has(t)) return i.get(t);
      let n = [],
        a = t,
        o = null;
      for (; a && !n.includes(a);) {
        if (i.has(a)) {
          o = i.get(a);
          break;
        }
        n.push(a);
        let t = r.get(a);
        if (t !== void 0) {
          o = t;
          break;
        }
        a = e.nodes.get(a)?.parentId ?? null;
      }
      for (let e of n) i.set(e, o);
      return o;
    },
    o = t.length,
    s = o < 2 ** 26,
    c = new Set();
  for (let t of e.links) {
    if (!n.has(t.kind)) continue;
    let e = a(t.fromId),
      r = a(t.toId);
    if (e === null || r === null || e === r) continue;
    let [i, l] = t.kind === `related` && e > r ? [r, e] : [e, r];
    c.add(
      s
        ? (i * o + l) * 2 + +(t.kind === `related`)
        : t.kind + `:` + i + `:` + l,
    );
  }
  return c.size;
}
function ma(e, t, n, r, i, a = 60) {
  let o = (e, t) => Math.abs(t.to - t.from) - Math.abs(e.to - e.from);
  if (r.length <= a) return { visible: [...r].sort(o), hidden: 0 };
  if (
    !i &&
    !t.some((t) => {
      let r = e.nodes.get(t.id);
      return !!r?.children.length && !n.has(r.id);
    })
  )
    return { visible: [], hidden: r.length };
  let s = r
      .map((r, a) => {
        let o = !!i && ga(r, i) !== `none`,
          s = [r.from, r.to].some((r) => {
            let i = e.nodes.get(t[r]?.id ?? ``);
            return !!i?.children.length && !n.has(i.id);
          });
        return { arc: r, index: a, score: o ? 2 : +!!s };
      })
      .filter((e) => e.score > 0)
      .sort(
        (e, t) => t.score - e.score || o(e.arc, t.arc) || e.index - t.index,
      ),
    c = new Set(s.slice(0, a).map((e) => e.arc.key)),
    l = r.filter((e) => c.has(e.key)).sort(o);
  return { visible: l, hidden: r.length - l.length };
}
function ha(e, t) {
  let n = new Set([t, ...I(e, t)]),
    r = new Map(),
    i = new Map(),
    a = new Set();
  for (let t of e.links)
    t.kind === `prereq`
      ? (r.set(t.toId, [...(r.get(t.toId) ?? []), t.fromId]),
        i.set(t.fromId, [...(i.get(t.fromId) ?? []), t.toId]))
      : n.has(t.fromId) && !n.has(t.toId)
        ? a.add(t.toId)
        : n.has(t.toId) && !n.has(t.fromId) && a.add(t.fromId);
  let o = (e) => {
    let t = new Set(),
      r = [...n];
    for (; r.length;) {
      let i = r.pop();
      for (let a of e.get(i) ?? [])
        !t.has(a) && !n.has(a) && (t.add(a), r.push(a));
    }
    return t;
  };
  return { start: n, up: o(r), down: o(i), related: a };
}
function ga(e, t) {
  if (!t) return `none`;
  let n = (e) => t.up.has(e) || t.start.has(e),
    r = (e) => t.down.has(e) || t.start.has(e);
  return e.kind === `related`
    ? e.links.some((e) => t.start.has(e.fromId) !== t.start.has(e.toId))
      ? `related`
      : `none`
    : e.links.some((e) => t.up.has(e.fromId) && n(e.toId))
      ? `up`
      : e.links.some((e) => r(e.fromId) && t.down.has(e.toId))
        ? `down`
        : `none`;
}
function _a(e, t, n, r, i = !0) {
  if (!n) return `none`;
  if (t === r) return `self`;
  if (n.start.has(t)) return `none`;
  let a = i ? [t, ...I(e, t)] : [t];
  return a.some((e) => n.up.has(e))
    ? `up`
    : a.some((e) => n.down.has(e))
      ? `down`
      : a.some((e) => n.related.has(e))
        ? `related`
        : `none`;
}
function va(e, t) {
  let n = new Set([t, ...I(e, t)]),
    r = (t) =>
      [...new Set(t)]
        .map((t) => e.nodes.get(t))
        .filter(Boolean)
        .sort((e, t) => e.rank - t.rank || $i(e.name, t.name));
  return {
    needs: r(
      e.links
        .filter((e) => e.kind === `prereq` && n.has(e.toId) && !n.has(e.fromId))
        .map((e) => e.fromId),
    ),
    unlocks: r(
      e.links
        .filter((e) => e.kind === `prereq` && n.has(e.fromId) && !n.has(e.toId))
        .map((e) => e.toId),
    ),
    related: r(
      e.links
        .filter(
          (e) => e.kind === `related` && n.has(e.fromId) !== n.has(e.toId),
        )
        .map((e) => (n.has(e.fromId) ? e.toId : e.fromId)),
    ),
  };
}
var ya = (e) => (e === `cluster` ? 56 : 44),
  ba = (e) => (e === `cluster` || e === `galaxy` ? 8 : 0);
function xa(e) {
  let t = [0],
    n = [];
  for (let r of e) {
    let e = ya(r),
      i = ba(r);
    (n.push(t[t.length - 1] + i + e / 2), t.push(t[t.length - 1] + i + e));
  }
  return { offsets: t, centers: n, totalHeight: t[t.length - 1] };
}
function Sa(e, t) {
  let n = Math.max(0, e.length - 1);
  if (n === 0) return 0;
  let r = 0,
    i = n,
    a = Number.isFinite(t) ? t : 0;
  for (; r < i;) {
    let t = (r + i + 1) >>> 1;
    e[t] <= a ? (r = t) : (i = t - 1);
  }
  return Math.min(n - 1, r);
}
var Ca = 8,
  wa = [83, 74, 65, 56, 47, 38, 29, 20],
  Ta = 44;
function Ea(e, t, n) {
  let r = n >= t ? 1 : -1,
    i = Math.min(5, Math.abs(n - t) / 2);
  return i === 0
    ? `M ${Ca} ${t} H ${e}`
    : `M ${Ca} ${t} H ${e - i} Q ${e} ${t} ${e} ${t + r * i} V ${n - r * i} Q ${e} ${n} ${e - i} ${n} H ${Ca}`;
}
function Da(e, t, n) {
  let r = (e) =>
      Math.abs(
        (t?.[e.to] ?? e.to * Ta + Ta / 2) -
          (t?.[e.from] ?? e.from * Ta + Ta / 2),
      ),
    i = [...e].sort(
      (e, t) =>
        Number(n?.has(t.key) ?? !1) - Number(n?.has(e.key) ?? !1) ||
        r(t) - r(e) ||
        e.key.localeCompare(t.key),
    ),
    a = [],
    o = new Map();
  for (let e of i) {
    let n = t?.[e.from] ?? e.from * Ta + Ta / 2,
      r = t?.[e.to] ?? e.to * Ta + Ta / 2,
      i = Math.min(n, r),
      s = Math.max(n, r),
      c = (t) => t.arc.from === e.from || t.arc.to === e.to,
      l = (e) => a.every((t) => t.x !== e || s < t.low || i > t.high || c(t)),
      u = a.find((e) => c(e) && l(e.x))?.x ?? wa.find(l);
    u !== void 0 &&
      (a.push({ arc: e, x: u, low: i, high: s }),
      o.set(e.key, { x: u, fromY: n, toY: r, d: Ea(u, n, r) }));
  }
  return o;
}
var R = { overflow: `hidden`, textOverflow: `ellipsis`, whiteSpace: `nowrap` },
  Oa = `lemma.atlas.v2`,
  ka = {
    demonstrated: `Demonstrated`,
    revisit: `Re-check due`,
    in_progress: `In progress`,
    not_started: `Not started`,
  },
  Aa = {
    up: `var(--link)`,
    down: `var(--accent)`,
    related: `var(--ink-3)`,
    self: `var(--accent)`,
    none: `var(--ink-3)`,
  };
function ja({ node: e }) {
  let t = e.status;
  return (0, A.jsxs)(`svg`, {
    width: `14`,
    height: `14`,
    viewBox: `0 0 14 14`,
    "aria-hidden": `true`,
    className: `shrink-0`,
    children: [
      t === `demonstrated` &&
        (0, A.jsx)(`circle`, {
          cx: `7`,
          cy: `7`,
          r: `6`,
          fill: `var(--ink-2)`,
        }),
      t === `in_progress` &&
        (0, A.jsxs)(A.Fragment, {
          children: [
            (0, A.jsx)(`circle`, {
              cx: `7`,
              cy: `7`,
              r: `5.4`,
              fill: `none`,
              stroke: `var(--ink-2)`,
              strokeWidth: `1.6`,
            }),
            (0, A.jsx)(`path`, {
              d: `M7 1.6a5.4 5.4 0 0 1 0 10.8z`,
              fill: `var(--ink-2)`,
            }),
          ],
        }),
      t === `revisit` &&
        (0, A.jsx)(`circle`, {
          cx: `7`,
          cy: `7`,
          r: `5.4`,
          fill: `none`,
          stroke: `var(--late)`,
          strokeWidth: `1.8`,
          strokeDasharray: `2.4 1.8`,
        }),
      t === `not_started` &&
        (0, A.jsx)(`circle`, {
          cx: `7`,
          cy: `7`,
          r: `4.6`,
          fill: `none`,
          stroke: `var(--ink-3)`,
          strokeWidth: `1.2`,
        }),
    ],
  });
}
var Ma = `atlas:overflow-bundles`;
function z(e) {
  return Math.max(22, 12 + String(e).length * 8);
}
function Na(e, t, n, r) {
  let i = (e) =>
      Math.abs(
        (n?.[e.to] ?? e.to * 44 + 22) - (n?.[e.from] ?? e.from * 44 + 22),
      ),
    a = Math.max(1, ...e.map(i)),
    o = r ?? t * 44,
    s = e
      .filter((e) => e.count > 1)
      .map((e) => {
        let t = n?.[e.from] ?? e.from * 44 + 22,
          r = n?.[e.to] ?? e.to * 44 + 22,
          o = i(e);
        return {
          arc: e,
          anchorX: (18 + 54 * Math.sqrt(o / a)) * 0.75 + 2,
          anchorY: (t + r) / 2,
          radius: Math.hypot((z(e.count) + 1) / 2, 8),
        };
      })
      .sort(
        (e, t) =>
          t.radius - e.radius ||
          e.anchorY - t.anchorY ||
          e.arc.key.localeCompare(t.arc.key),
      ),
    c = [],
    l = new Map(),
    u = (e, t, n) => {
      let r = e >= 22 ? 0 : 2,
        i = e + r,
        a = 84 - e - r,
        l = e + r,
        u = o - e - r;
      if (a < i || u < l) return null;
      let d = [t, i, a, 42, (i + 42) / 2, (a + 42) / 2]
          .map((e) => Math.max(i, Math.min(a, e)))
          .filter((e, t, n) => n.findIndex((t) => Math.abs(e - t) < 0.1) === t),
        f = Math.min(Math.ceil(o / 4) + 2, s.length * 20 + 20);
      for (let r = 0; r <= f; r++) {
        let i = n + (r === 0 ? 0 : Math.ceil(r / 2) * 4 * (r % 2 ? 1 : -1));
        if (!(i < l || i > u)) {
          for (let r of d)
            if (
              c.every((t) => Math.hypot(r - t.x, i - t.y) >= e + t.radius + 9)
            )
              return { x: r, y: i, radius: e, anchorX: t, anchorY: n };
        }
      }
      return null;
    },
    d = [];
  for (let e of s) {
    let t = u(e.radius, e.anchorX, e.anchorY);
    t ? (c.push(t), l.set(e.arc.key, t)) : d.push(e.arc.key);
  }
  if (d.length) {
    let e = u(22, 42, o / 2);
    for (; !e && c.length;) {
      let t = c.pop(),
        n = [...l].find(([, e]) => e === t)?.[0];
      (n && (l.delete(n), d.push(n)), (e = u(22, 42, o / 2)));
    }
    e && ((e.hiddenKeys = d.sort()), l.set(Ma, e));
  }
  return l;
}
function Pa({ arcs: e, rows: t, focus: n, centers: r, heightPx: i }) {
  if (typeof window < `u`) {
    let a = new URLSearchParams(window.location.search);
    if (
      a.get(`demo`) === `stress` &&
      a.get(`atlasDenseFixture`) === `1` &&
      window.location.hash.startsWith(`#/atlas`)
    ) {
      let a = [];
      for (let e = 0; e < 20; e++) {
        let t = e % 2 ? `related` : `prereq`;
        a.push({
          key: t + `:` + e,
          from: 0,
          to: 1 + (e % 4),
          kind: t,
          count: 2,
          links: [],
        });
      }
      ((e = a), (t = 5), (n = null), (r = void 0), (i = void 0));
    } else
      [`stress`, `extreme`].includes(a.get(`demo`) ?? ``) &&
        a.get(`atlasDenseLanes`) === `1` &&
        window.location.hash.startsWith(`#/atlas`) &&
        ((e = Array.from({ length: 9 }, (e, t) => ({
          key: `dense-lane:` + t,
          from: t,
          to: t + 9,
          kind: `prereq`,
          count: 1,
          links: [],
        }))),
        (t = 18),
        (n = null),
        (r = void 0),
        (i = void 0),
        a.get(`atlasDenseLanesFocus`) === `1` &&
          ((e[8].links = [
            { fromId: `supplier`, toId: `selected`, kind: `prereq` },
          ]),
          (n = {
            start: new Set([`selected`]),
            up: new Set([`supplier`]),
            down: new Set(),
            related: new Set(),
          })));
  }
  let a = n
      ? [...e].sort(
          (e, t) => Number(ga(e, n) !== `none`) - Number(ga(t, n) !== `none`),
        )
      : e,
    o = n
      ? new Set(e.filter((e) => ga(e, n) !== `none`).map((e) => e.key))
      : void 0,
    s = Da(e, r, o),
    c = a.filter((e) => !s.has(e.key)),
    l = c.reduce((e, t) => e + t.count, 0),
    u = new Map();
  for (let e of c)
    for (let [t, n] of [
      [e.from, `out`],
      [e.to, `in`],
    ]) {
      let e = t + `:` + n;
      u.has(e) ||
        u.set(e, {
          row: t,
          direction: n,
          y: (r?.[t] ?? t * 44 + 22) + (n === `in` ? 5 : -5),
        });
    }
  let d = Na(
      e.filter((e) => s.has(e.key)),
      t,
      r,
      i,
    ),
    f = d.get(Ma);
  return (0, A.jsxs)(A.Fragment, {
    children: [
      (0, A.jsxs)(`svg`, {
        "aria-hidden": `true`,
        "data-atlas-wires": `true`,
        width: 84,
        height: i ?? t * 44,
        className: `pointer-events-none absolute right-0 top-0 overflow-visible`,
        children: [
          (0, A.jsx)(`defs`, {
            children: [`none`, `up`, `down`].map((e) =>
              (0, A.jsx)(
                `marker`,
                {
                  id: `atlas-arrow-` + e,
                  viewBox: `0 0 6 6`,
                  refX: `5.5`,
                  refY: `3`,
                  markerWidth: `6`,
                  markerHeight: `6`,
                  orient: `auto`,
                  markerUnits: `userSpaceOnUse`,
                  children: (0, A.jsx)(`path`, {
                    d: `M0 0L6 3L0 6Z`,
                    fill: Aa[e],
                  }),
                },
                e,
              ),
            ),
          }),
          [...u.values()].map((e) =>
            (0, A.jsx)(
              `path`,
              {
                "data-atlas-hidden-port": e.direction,
                "data-atlas-row": e.row,
                d: `M2 ` + e.y + ` H8`,
                fill: `none`,
                stroke: `var(--ink-3)`,
                strokeWidth: `2`,
                strokeLinecap: `round`,
              },
              `port:` + e.row + `:` + e.direction,
            ),
          ),
          a.map((e) => {
            let t = s.get(e.key);
            if (!t) return null;
            let r = ga(e, n),
              i = n ? (r === `none` ? 0.12 : 1) : 0.35;
            return (0, A.jsxs)(
              `g`,
              {
                "data-arc-kind": e.kind,
                "data-arc-tone": r,
                "data-atlas-lane": t.x,
                style: { transition: `opacity 160ms ease` },
                opacity: i,
                children: [
                  (0, A.jsx)(`path`, {
                    d: t.d,
                    fill: `none`,
                    stroke: Aa[r],
                    strokeWidth: 1,
                    strokeDasharray: e.kind === `related` ? `2 4` : void 0,
                    strokeLinecap: `round`,
                    markerEnd:
                      e.kind === `prereq`
                        ? `url(#atlas-arrow-` +
                          (r === `related` || r === `self` ? `none` : r) +
                          `)`
                        : void 0,
                  }),
                  e.kind === `prereq` &&
                    (0, A.jsx)(`circle`, {
                      "data-atlas-supplier-dot": `true`,
                      cx: `8`,
                      cy: t.fromY,
                      r: `1.2`,
                      fill: Aa[r],
                    }),
                ],
              },
              e.key,
            );
          }),
          a
            .filter((e) => e.count > 1 && s.has(e.key))
            .map((e) => {
              let t = d.get(e.key);
              if (!t) return null;
              let r = ga(e, n),
                i = n
                  ? r === `none`
                    ? 0.12
                    : 1
                  : e.kind === `related`
                    ? 0.45
                    : 0.62,
                a = z(e.count);
              return (0, A.jsxs)(
                `g`,
                {
                  opacity: i,
                  "data-atlas-bundle": e.key,
                  children: [
                    Math.hypot(t.x - t.anchorX, t.y - t.anchorY) > 3 &&
                      (0, A.jsx)(`path`, {
                        d:
                          `M` +
                          t.anchorX +
                          ` ` +
                          t.anchorY +
                          ` L` +
                          t.x +
                          ` ` +
                          t.y,
                        stroke: Aa[r],
                        strokeWidth: `1`,
                        strokeDasharray: `2 2`,
                        fill: `none`,
                      }),
                    (0, A.jsxs)(`g`, {
                      transform: `translate(` + t.x + ` ` + t.y + `)`,
                      children: [
                        (0, A.jsxs)(`g`, {
                          "data-atlas-bundle-pill": `true`,
                          "data-atlas-bundle-circle": `true`,
                          children: [
                            (0, A.jsx)(`rect`, {
                              x: -a / 2,
                              y: `-8`,
                              width: a,
                              height: `16`,
                              rx: `8`,
                              fill: Aa[r],
                            }),
                            (0, A.jsx)(`rect`, {
                              x: 1 - a / 2,
                              y: `-7`,
                              width: a - 2,
                              height: `14`,
                              rx: `7`,
                              fill: `var(--paper)`,
                            }),
                          ],
                        }),
                        (0, A.jsx)(`text`, {
                          "data-atlas-bundle-count": `true`,
                          textAnchor: `middle`,
                          dominantBaseline: `central`,
                          fontSize: `12`,
                          fontWeight: `600`,
                          fill: Aa[r],
                          children: e.count,
                        }),
                      ],
                    }),
                  ],
                },
                `badge:` + e.key,
              );
            }),
        ],
      }),
      c.length > 0 &&
        (0, A.jsxs)(`details`, {
          "data-atlas-lane-overflow": `true`,
          className: `absolute right-0 top-0 z-20`,
          children: [
            (0, A.jsxs)(`summary`, {
              "aria-label": `Show ${l} hidden Atlas links`,
              className: `flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-ctl border border-edge-2 bg-[var(--paper)] px-1 text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden`,
              children: [`+`, l],
            }),
            (0, A.jsxs)(`div`, {
              className: `absolute right-0 top-11 max-h-60 w-[min(280px,calc(100vw-24px))] overflow-y-auto rounded-ctl border border-edge-2 bg-[var(--paper)] p-3 shadow-[var(--e-float)]`,
              children: [
                (0, A.jsx)(`p`, {
                  className: `mb-2 text-[12px] font-semibold`,
                  children: `Connections hidden by the 9px lane spacing`,
                }),
                (0, A.jsx)(`ul`, {
                  className: `space-y-1 text-[12px]`,
                  children: c.map((e) =>
                    (0, A.jsxs)(
                      `li`,
                      {
                        children: [
                          `Rows `,
                          e.from + 1,
                          `–`,
                          e.to + 1,
                          `: `,
                          e.count,
                          ` link`,
                          e.count === 1 ? `` : `s`,
                        ],
                      },
                      e.key,
                    ),
                  ),
                }),
              ],
            }),
          ],
        }),
      f &&
        (0, A.jsxs)(`details`, {
          "data-atlas-hidden-bundles": `true`,
          className: `absolute z-20`,
          style: { right: 84 - f.x - 22, top: f.y - 22 },
          children: [
            (0, A.jsxs)(`summary`, {
              "data-atlas-overflow-count": `true`,
              "aria-label": `Show ${f.hiddenKeys?.length ?? 0} hidden Atlas link bundles`,
              style: { outlineOffset: -3 },
              className: `flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-edge-2 bg-raised text-body font-semibold text-ink [&::-webkit-details-marker]:hidden`,
              children: [`+`, f.hiddenKeys?.length ?? 0],
            }),
            (0, A.jsxs)(`div`, {
              className: `absolute right-0 top-11 max-h-60 w-[min(280px,calc(100vw-24px))] overflow-y-auto rounded-ctl border border-edge-2 bg-raised p-3 shadow-[var(--e-float)]`,
              children: [
                (0, A.jsx)(`p`, {
                  className: `mb-2 text-body font-semibold`,
                  children: `Other bundled connections`,
                }),
                (0, A.jsx)(`ul`, {
                  className: `space-y-1 text-body text-ink-2`,
                  children: (f.hiddenKeys ?? []).map((t) => {
                    let n = e.find((e) => e.key === t);
                    return n
                      ? (0, A.jsxs)(
                          `li`,
                          {
                            children: [
                              n.kind === `prereq` ? `Prerequisite` : `Related`,
                              ` rows `,
                              n.from + 1,
                              `–`,
                              n.to + 1,
                              `: `,
                              n.count,
                              ` links`,
                            ],
                          },
                          t,
                        )
                      : null;
                  }),
                }),
              ],
            }),
          ],
        }),
    ],
  });
}
function Fa({
  node: e,
  open: t,
  tone: n,
  match: r,
  focused: i = !1,
  sticky: a = !0,
  onToggle: o,
  onSelect: s,
}) {
  let c = e.children.length > 0,
    l = e.level === `cluster`,
    u = e.level === `galaxy`,
    d = n === `self`,
    f = ya(e.level),
    p = (e) => Math.min(e, 3) * 16 + Math.max(0, e - 3) * 8,
    m = 12 + p(e.depth),
    h =
      e.level === `cluster`
        ? `font-serif italic text-[21px] leading-[24px] font-medium`
        : u
          ? `text-[12px] leading-[18px] font-semibold tracking-[0.05em] [font-variant:small-caps]`
          : e.level === `system`
            ? `text-[15px] leading-5 font-semibold`
            : e.level === `moon`
              ? `text-[13px] leading-[18px] text-ink-2`
              : `text-[15px] leading-[22px]`,
    g = l || u;
  return (0, A.jsxs)(`div`, {
    role: `treeitem`,
    "aria-level": e.depth + 1,
    "aria-expanded": c ? t : void 0,
    "aria-selected": d,
    "data-atlas-row": e.id,
    "data-level": e.level,
    "data-tone": n,
    className:
      `group relative flex items-center bg-[var(--paper)] ` +
      (l && a ? `sticky top-0 z-10 ` : ``) +
      (r ? `bg-fill-1` : ``),
    style: {
      height: f,
      marginTop: ba(e.level),
      paddingLeft: m,
      paddingRight: 88,
      boxShadow: l || u ? `inset 0 1px var(--hair)` : void 0,
      backgroundColor: d
        ? `color-mix(in srgb, var(--accent) 12%, var(--paper))`
        : void 0,
      opacity: i && n === `none` ? 0.42 : 1,
    },
    children: [
      Array.from({ length: e.depth }, (e, t) =>
        (0, A.jsx)(
          `span`,
          {
            "aria-hidden": `true`,
            className: `absolute inset-y-0 w-px`,
            style: {
              left: 12 + p(t) + 6,
              background: `color-mix(in srgb,var(--ink) 6%,transparent)`,
            },
          },
          t,
        ),
      ),
      n !== `none` &&
        (0, A.jsx)(`span`, {
          "aria-hidden": `true`,
          className: `absolute inset-y-1 left-1 w-[3px] rounded-r`,
          style: { background: Aa[n] },
        }),
      c
        ? (0, A.jsx)(`button`, {
            type: `button`,
            "aria-label": (t ? `Fold ` : `Unfold `) + Ar(e.name),
            onClick: o,
            className: `-ml-3 flex size-11 shrink-0 items-center justify-center rounded-ctl text-ink-2`,
            children: (0, A.jsx)(ut, {
              size: 16,
              style: {
                transform: t ? `rotate(90deg)` : `none`,
                transition: `transform 140ms ease`,
              },
            }),
          })
        : (0, A.jsx)(`span`, {
            className: `flex size-7 shrink-0 items-center justify-center`,
            children: (0, A.jsx)(ja, { node: e }),
          }),
      (0, A.jsxs)(`button`, {
        type: `button`,
        onClick: s,
        "aria-label":
          Ar(e.name) +
          (c
            ? `, ` + e.done + ` of ` + e.total + ` ideas`
            : `, ` + ka[e.status]),
        className: `flex h-full min-w-0 flex-1 items-center gap-2 text-left`,
        children: [
          l &&
            e.glyph &&
            (0, A.jsx)(`span`, {
              "aria-hidden": `true`,
              className: `shrink-0 font-math text-[22px] text-[var(--accent)]`,
              children: e.glyph,
            }),
          (0, A.jsx)(`span`, {
            title: Ar(e.name),
            "data-atlas-title-scroll": !0,
            style: {
              ...R,
              overflowX: `auto`,
              textOverflow: `clip`,
              scrollbarWidth: `none`,
            },
            className:
              `atlas-row-title-scroll min-w-0 flex-1 [&_*]:whitespace-nowrap ` +
              h,
            children: na(e.name) ? e.name : (0, A.jsx)(Pe, { source: e.name }),
          }),
          g &&
            (0, A.jsxs)(`span`, {
              className: `flex shrink-0 items-center gap-1.5 pl-1 text-[12px] tabular-nums text-ink-3`,
              children: [
                (0, A.jsx)(`span`, {
                  "aria-hidden": `true`,
                  className: `h-1.5 w-11 overflow-hidden rounded-full bg-[var(--paper-2)]`,
                  children: (0, A.jsx)(`span`, {
                    className: `block h-full rounded-full bg-[var(--ink-2)]`,
                    style: {
                      width: (e.total ? (100 * e.done) / e.total : 0) + `%`,
                    },
                  }),
                }),
                (0, A.jsxs)(`span`, { children: [e.done, `/`, e.total] }),
              ],
            }),
          !g &&
            c &&
            (0, A.jsx)(`span`, {
              className: `ml-auto shrink-0 text-[12px] tabular-nums text-ink-3`,
              children: e.total,
            }),
          e.revisit > 0 &&
            c &&
            (0, A.jsx)(`span`, {
              "aria-label": e.revisit + ` to re-check`,
              className: `size-3 shrink-0 rounded-full bg-[var(--late)]`,
            }),
        ],
      }),
    ],
  });
}
function Ia(e, t) {
  let n = [...e].filter((e) => !e.synthetic);
  if (t.id) {
    let e = n.find((e) => e.id === t.id);
    return e ? { kind: `found`, id: e.id } : { kind: `missing` };
  }
  if (t.name) {
    let e = n.filter((e) => e.name === t.name);
    return e.length === 1
      ? { kind: `found`, id: e[0].id }
      : e.length > 1
        ? { kind: `ambiguous`, ids: e.map((e) => e.id) }
        : { kind: `missing` };
  }
  let r = t.slug ? n.filter((e) => e.slug === t.slug) : [];
  return r.length === 1
    ? { kind: `found`, id: r[0].id }
    : r.length > 1
      ? { kind: `ambiguous`, ids: r.map((e) => e.id) }
      : { kind: `missing` };
}
function La(e, t) {
  let n = [0, 0, 0],
    r = [0, 0, 0],
    i = !0;
  for (let a of e.nodes.values()) {
    if (!a.children.length) continue;
    let e = t.has(a.id);
    e || (i = !1);
    for (let t = 0; t < 3; t++) a.depth < t && (n[t]++, e && r[t]++);
  }
  for (let e = 0; e < 3; e++)
    if (n[e] === t.size && r[e] === n[e]) return e + 1;
  return i ? 99 : null;
}
var Ra = t({ default: () => Ua });
function za() {
  try {
    let e = localStorage.getItem(Oa);
    return e ? JSON.parse(e) : null;
  } catch {
    return null;
  }
}
function Ba(e) {
  try {
    localStorage.setItem(Oa, JSON.stringify(e));
  } catch {}
}
function Va({ label: e, items: t, tone: n, onTrace: r, tree: i }) {
  let [a, o] = (0, k.useState)(!1);
  if (!t.length) return null;
  let s = a ? t : t.slice(0, 8),
    c = new Map();
  for (let t of s) {
    let n =
      e === `Opens up`
        ? (F(i, t.id)
            .map((e) => i.nodes.get(e))
            .find((e) => e?.level === `galaxy`)?.name ?? `Other ideas`)
        : ``;
    c.set(n, [...(c.get(n) ?? []), t]);
  }
  return (0, A.jsxs)(`div`, {
    className: `mt-4`,
    children: [
      (0, A.jsxs)(`h3`, {
        className: `mb-1 flex items-center gap-2 text-label font-semibold text-ink-2`,
        children: [
          (0, A.jsx)(`span`, {
            className: `h-[2px] w-4`,
            style: { background: Aa[n] },
          }),
          e,
          ` · `,
          t.length,
        ],
      }),
      [...c].map(([e, t]) =>
        (0, A.jsxs)(
          `div`,
          {
            children: [
              e &&
                (0, A.jsx)(`p`, {
                  "data-atlas-area-heading": `true`,
                  className: `mt-2 min-w-0 max-w-full overflow-x-auto text-[13.5px] font-semibold text-ink-3`,
                  children: (0, A.jsx)(Pe, {
                    source: e,
                    className: `text-[16px] leading-6`,
                  }),
                }),
              t.map((e) =>
                (0, A.jsxs)(
                  `button`,
                  {
                    type: `button`,
                    onClick: () => r(e.id),
                    className: `flex min-h-11 w-full items-center gap-2 border-b border-edge text-left text-body`,
                    children: [
                      (0, A.jsx)(ja, { node: e }),
                      (0, A.jsx)(`span`, {
                        style: R,
                        className: `min-w-0 flex-1`,
                        children: (0, A.jsx)(Pe, { source: e.name }),
                      }),
                      (0, A.jsx)(ut, {
                        size: 14,
                        className: `shrink-0 text-ink-3`,
                      }),
                    ],
                  },
                  e.id,
                ),
              ),
            ],
          },
          e,
        ),
      ),
      t.length > 8 &&
        (0, A.jsx)(`button`, {
          type: `button`,
          "aria-expanded": a,
          onClick: () => o((e) => !e),
          className: `min-h-11 w-full rounded-ctl border border-edge px-3 text-left text-label text-amber`,
          children: a ? `Show fewer` : `Show all ${t.length}`,
        }),
    ],
  });
}
function Ha({ tree: e, node: t, onClose: n, onTrace: r }) {
  let i = fr(),
    a = va(e, t.id),
    o = F(e, t.id).map((t) => e.nodes.get(t));
  return (0, A.jsx)(Zi, {
    open: !0,
    onClose: n,
    title: (0, A.jsx)(Ji, { name: t.name }),
    children: (0, A.jsxs)(`div`, {
      "data-atlas-details": `true`,
      children: [
        o.length > 0 &&
          (0, A.jsx)(Yi, {
            names: o.map((e) => e.name),
            onSelect: (e) => r(o[e].id),
          }),
        (0, A.jsxs)(`div`, {
          className: `mt-3 flex items-center justify-between gap-3 text-label text-ink-2`,
          children: [
            (0, A.jsx)(`span`, { children: ka[t.status] }),
            (0, A.jsxs)(`span`, {
              className: `tabular-nums`,
              children: [t.done, ` of `, t.total, ` demonstrated`],
            }),
          ],
        }),
        (0, A.jsx)(`div`, {
          "aria-label": `Demonstrated ideas`,
          role: `progressbar`,
          "aria-valuemin": 0,
          "aria-valuemax": Math.max(1, t.total),
          "aria-valuenow": t.done,
          className: `mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--paper-2)]`,
          children: (0, A.jsx)(`div`, {
            className: `h-full rounded-full bg-[var(--ink-2)]`,
            style: { width: (t.total ? (100 * t.done) / t.total : 0) + `%` },
          }),
        }),
        t.blurb &&
          (0, A.jsx)(Pe, {
            source: t.blurb,
            className: `mt-3 block text-body text-ink-soft`,
          }),
        (0, A.jsx)(Va, {
          label: `Builds on`,
          items: a.needs,
          tone: `up`,
          onTrace: r,
          tree: e,
        }),
        (0, A.jsx)(Va, {
          label: `Opens up`,
          items: a.unlocks,
          tone: `down`,
          onTrace: r,
          tree: e,
        }),
        (0, A.jsx)(Va, {
          label: `Related`,
          items: a.related,
          tone: `related`,
          onTrace: r,
          tree: e,
        }),
        t.children.length > 0 &&
          (0, A.jsx)(Va, {
            label: `Inside`,
            items: t.children.map((t) => e.nodes.get(t)),
            tone: `none`,
            onTrace: r,
            tree: e,
          }),
        t.checkpointRefs.length > 0 &&
          (0, A.jsx)(`div`, {
            className: `mt-4 flex flex-wrap gap-2`,
            children: t.checkpointRefs.map((e) =>
              (0, A.jsxs)(
                _e,
                {
                  to: `/p/` + e.projectSlug + `/cp/` + e.code,
                  className: `inline-flex min-h-11 min-w-11 items-center text-label text-ink-2 underline decoration-[var(--ink-3)] underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2`,
                  children: [`Checkpoint `, e.code],
                },
                e.projectSlug + e.code,
              ),
            ),
          }),
        (0, A.jsxs)(`div`, {
          className: `mt-5 grid grid-cols-2 gap-2`,
          children: [
            (0, A.jsxs)(`button`, {
              type: `button`,
              className: `flex min-h-11 items-center justify-center gap-2 rounded-btn bg-[var(--accent)] px-3 text-body font-semibold text-[var(--paper)]`,
              onClick: () => {
                navigator.clipboard
                  .writeText(`Quiz me in chat on ` + t.name)
                  .then(() => i(`Quiz prompt copied`))
                  .catch(() => i(`Could not copy prompt`));
              },
              children: [(0, A.jsx)(Ot, { size: 16 }), `Quiz me`],
            }),
            (0, A.jsxs)(_e, {
              to: `/review/run?concept=` + encodeURIComponent(t.slug),
              className: `flex min-h-11 items-center justify-center rounded-btn border border-edge-2 px-3 text-body`,
              children: [`Review `, t.due],
            }),
          ],
        }),
      ],
    }),
  });
} /* Atlas — collapsible radial concept graph, using Lemma's existing Atlas query and links. */
function Ua() {
  const H = k.createElement,
    nav = ge(),
    query = $t(),
    data = query.data;
  const tree = (0, k.useMemo)(() => (data ? sa(data) : null), [data]);
  const [open, setOpen] = (0, k.useState)(new Set());
  const [selected, setSelected] = (0, k.useState)(null);
  const [inspectorOpen,setInspectorOpen]=(0,k.useState)(false);
  // Page of directly visible siblings in the bounded phone overview. This does not
  // modify the concept graph, its relationships, or the full-screen exploration.
  const [atlasPages,setAtlasPages]=(0,k.useState)(new Map());
  const inspectorRef=(0,k.useRef)(null),keyboardSelectRef=(0,k.useRef)(false);
  // Keyboard selection may move reading focus to the details; pointer selection
  // must not scroll the whole browsing page out from under the map.
  (0,k.useEffect)(()=>{if(!selected||!keyboardSelectRef.current)return;
    const id=requestAnimationFrame(()=>{const el=inspectorRef.current;
      if(el&&keyboardSelectRef.current){el.scrollIntoView({block:'nearest'});el.focus({preventScroll:true})}
      keyboardSelectRef.current=false;
    });return()=>cancelAnimationFrame(id)
  },[selected]);
  const [atlasView,setAtlasView]=(0,k.useState)(()=>sessionStorage.getItem(`lemma.atlas.view`)||(innerWidth<600?`list`:`map`));
  (0,k.useEffect)(()=>sessionStorage.setItem(`lemma.atlas.view`,atlasView),[atlasView]);
  const [isFullscreen,setIsFullscreen] = (0,k.useState)(false);
  const exploreButtonRef=(0,k.useRef)(null);
  (0,k.useEffect)(()=>{
    if(!isFullscreen)return;
    const before=document.body.style.overflow;
    document.body.style.overflow=`hidden`;
    const key=e=>{if(e.key===`Escape`){e.preventDefault();setIsFullscreen(false)}};
    window.addEventListener(`keydown`,key);
    return()=>{document.body.style.overflow=before;window.removeEventListener(`keydown`,key);requestAnimationFrame(()=>exploreButtonRef.current?.focus({preventScroll:true}))};
  },[isFullscreen]);
  const [edgeMode, setEdgeMode] = (0, k.useState)("structure");
  const [search, setSearch] = (0, k.useState)("");
  const [searchOpen, setSearchOpen] = (0, k.useState)(false);
  const [zoom, setZoom] = (0, k.useState)(0.78);
  const [pan, setPan] = (0, k.useState)({ x: 0, y: 0 });
  const [size, setSize] = (0, k.useState)({ w: 390, h: 570 });
  const canvasRef = (0, k.useRef)(null),
    gesture = (0, k.useRef)({ points: new Map(), drag: null, pinch: null }),
    focusRequest = (0, k.useRef)(null);
  (0, k.useEffect)(() => {
    if (!tree) return;
    const roots = tree.roots.filter((id) => tree.nodes.has(id));
    setOpen(new Set(tree.nodes.size > 180 ? [] : roots));
    const qs = new URLSearchParams(window.location.search);
    const id = qs.get("id"),
      slug = qs.get("focus");
    const node = id
      ? tree.nodes.get(id)
      : [...tree.nodes.values()].find((n) => !n.synthetic && n.slug === slug);
    if (node) {
      let p = node.parentId;
      const expand = new Set(roots);
      let hops = 0;
      while (p && hops++ < 15) {
        expand.add(p);
        p = tree.nodes.get(p)?.parentId;
      }
      setOpen(expand);
      setSelected(node.id);
      focusRequest.current = node.id;
    }
  }, [tree]);
  (0, k.useEffect)(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () =>
      setSize({
        w: Math.max(280, el.clientWidth),
        h: Math.max(390, el.clientHeight),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!tree]);
  const stats = (0, k.useMemo)(() => {
    if (!tree) return { ideas: 0, links: 0 };
    return {
      ideas: [...tree.nodes.values()].filter((n) => !n.synthetic).length,
      links: tree.links.length,
    };
  }, [tree]);
  const graph = (0, k.useMemo)(() => {
    if (!tree) return { nodes: [], edges: [] };
    const nodes = [],
      byId = new Map(),
      roots = tree.roots.filter((id) => tree.nodes.has(id));
    // Bounded mobile browse overview: a named parent plus legible child cells.
    // The original radial graph is retained unchanged for Explore map / desktop.
    if(size.w<1000 || tree.nodes.size>180){
      const picked=selected?tree.nodes.get(selected):null;
      const parentId=picked?(picked.children?.length?picked.id:picked.parentId):null;
      const parent=parentId?tree.nodes.get(parentId):null;
      const ids=(parent?parent.children:roots).filter(id=>tree.nodes.has(id));
      const cols=Math.max(1,Math.floor((size.w-16)/152));
      const rows=Math.max(1,Math.floor((size.h-158)/72));
      const capacity=Math.min(12,cols*rows);
      const key=parentId||'__subjects';
      const pageSize=Math.max(1,capacity-1),totalPages=Math.max(1,Math.ceil(ids.length/pageSize));
      const page=Math.max(0,(atlasPages.get(key)||0)%totalPages);
      const startIndex=page*pageSize;
      const hasContinuation=ids.length>capacity;
      const moreAtEnd=hasContinuation&&startIndex+pageSize<ids.length;
      const showCount=hasContinuation?pageSize:capacity;
      const visibleIds=ids.slice(startIndex,startIndex+showCount);
      const cellWidth=(size.w-32)/cols;
      const invZoom=1/Math.max(.3,zoom);
      const place=(id,node,col,row,depth,cluster=false)=>{
        const px=16+(col+.5)*cellWidth-size.w/2;
        const py=134+row*72-size.h/2;
        const pt={id,node,x:px*invZoom,y:py*invZoom,depth,parentId,compact:true,
          cellWidth:(cellWidth-8)*invZoom,cellHeight:64*invZoom,cluster};
        nodes.push(pt);byId.set(id,pt);
      };
      if(parent){
        const py=62-size.h/2;
        const pt={id:parentId,node:parent,x:0,y:py*invZoom,depth:0,parentId:parent.parentId,
          compact:true,cellWidth:Math.min(size.w-32,280)*invZoom,cellHeight:68*invZoom};
        nodes.push(pt);byId.set(parentId,pt);
      }
      visibleIds.forEach((id,i)=>place(id,tree.nodes.get(id),i%cols,Math.floor(i/cols),parent?1:0));
      if(hasContinuation){
        const count=ids.length-(startIndex+showCount);
        const id='__atlas-more-'+key;
        const label=moreAtEnd?count+' more '+(parent?'concepts':'subjects'):'Back to first '+(parent?'concepts':'subjects');
        place(id,{name:label,children:[],status:'unseen'},
          visibleIds.length%cols,Math.floor(visibleIds.length/cols),parent?1:0,true);
      }
      const edges=[];
      if(parent)visibleIds.forEach(id=>edges.push({a:parentId,b:id,kind:'structure',count:1}));
      if(edgeMode!=='structure')for(const link of tree.links){
        const kind=link.kind==='related'?'related':'prereq';
        if((edgeMode==='all'||edgeMode===kind)&&byId.has(link.fromId)&&byId.has(link.toId)&&link.fromId!==link.toId)
          edges.push({a:link.fromId,b:link.toId,kind,count:1});
      }
      return {nodes,edges,compact:true,remaining:Math.max(0,ids.length-visibleIds.length),branchId:parentId};
    }
    const weights = new Map();
    const weight = (id, depth = 0) => {
      if (weights.has(id)) return weights.get(id);
      const node = tree.nodes.get(id);
      if (!node || !open.has(id) || depth > 8 || !node.children?.length) {
        weights.set(id, 1);
        return 1;
      }
      let total = 0;
      for (const c of node.children) total += weight(c, depth + 1);
      const w = Math.max(1, total);
      weights.set(id, w);
      return w;
    };
    roots.forEach((id) => weight(id));
    const allocate = (ids, left, right, depth, parentId = null) => {
      if (!ids.length || depth > 8) return;
      const total = ids.reduce((s, id) => s + (weights.get(id) ?? 1), 0) || 1;
      let cursor = left;
      for (const id of ids) {
        const node = tree.nodes.get(id);
        if (!node) continue;
        const range = ((right - left) * (weights.get(id) ?? 1)) / total;
        const angle = cursor + range / 2;
        const radius =
          depth === 0 ? 120 : depth === 1 ? 270 : 270 + (depth - 1) * 156;
        const pt = {
          id,
          node,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          angle,
          depth,
          parentId,
        };
        nodes.push(pt);
        byId.set(id, pt);
        if (open.has(id) && node.children?.length) {
          // A small gap between sibling angular wedges prevents branches merging visually.
          const gap = Math.min(0.032, range * 0.09);
          allocate(
            node.children,
            cursor + gap,
            cursor + range - gap,
            depth + 1,
            id,
          );
        }
        cursor += range;
      }
    };
    allocate(roots, -Math.PI / 2 - Math.PI, -Math.PI / 2 + Math.PI, 0);
    const edges = [];
    for (const n of nodes) {
      if (n.parentId && byId.has(n.parentId))
        edges.push({ a: n.parentId, b: n.id, kind: "structure", count: 1 });
    }
    if (edgeMode !== "structure") {
      const resolve = (id) => {
        let p = id,
          steps = 0;
        while (p && steps++ < 14) {
          if (byId.has(p)) return p;
          p = tree.nodes.get(p)?.parentId;
        }
        return null;
      };
      const aggregate = new Map();
      for (const link of tree.links) {
        const kind = link.kind === "related" ? "related" : "prereq";
        if (edgeMode !== "all" && edgeMode !== kind) continue;
        const a = resolve(link.fromId),
          b = resolve(link.toId);
        if (!a || !b || a === b) continue;
        const key = kind + ":" + a + ":" + b;
        if (aggregate.has(key)) aggregate.get(key).count++;
        else aggregate.set(key, { a, b, kind, count: 1 });
      }
      edges.push(...aggregate.values());
    }
    return { nodes, edges };
  }, [tree, open, edgeMode, isFullscreen, size.w, size.h, zoom, selected, atlasPages]);
  (0, k.useEffect)(() => {
    if (!focusRequest.current) return;
    if(graph.compact){focusRequest.current=null;setPan({x:0,y:0});return}
    const pt = graph.nodes.find((n) => n.id === focusRequest.current);
    if (pt) {
      setZoom((z) => Math.max(z, 1.15));
      setPan({ x: -pt.x * 1.15, y: -pt.y * 1.15 });
      focusRequest.current = null;
    }
  }, [graph]);
  const labels = (0, k.useMemo)(() => {
    // Zoom-responsive label typography: text shrinks in the overview and
    // grows as users zoom in. Keep collision, edge and viewport avoidance.
    const chosen = new Map(),
      occupied = [];
    if (!graph.nodes.length) return chosen;
    const cx = size.w / 2 + pan.x,
      cy = size.h / 2 + pan.y;
    const visible = graph.nodes
      .map((n) => ({ n, x: cx + n.x * zoom, y: cy + n.y * zoom }))
      .filter(
        (v) =>
          v.x >= 10 && v.x <= size.w - 10 && v.y >= 12 && v.y <= size.h - 12,
      );
    const boxes = [];
    const order = [...visible].sort(
      (a, b) =>
        (a.n.id === selected ? -1 : b.n.id === selected ? 1 : 0) ||
        a.n.depth - b.n.depth,
    );
    const overlaps = (a, b, pad = 3) =>
      a.x < b.x + b.w + pad &&
      a.x + a.w + pad > b.x &&
      a.y < b.y + b.h + pad &&
      a.y + a.h + pad > b.y;
    for (const item of visible) {
      const r =
        (item.n.depth === 0
          ? 13
          : item.n.depth === 1
            ? 10
            : item.n.depth === 2
              ? 8
              : 6.5) * zoom;
      boxes.push({
        id: item.n.id,
        x: item.x - r - 4,
        y: item.y - r - 4,
        w: 2 * r + 8,
        h: 2 * r + 8,
      });
    }
    for (const { n, x, y } of order) {
      const selectedNode = n.id === selected;
      // Deep labels become eligible as the graph is magnified, but actual
      // availability of room -- not depth alone -- decides what is displayed.
      const minZoom =
        n.depth === 0
          ? 0.3
          : n.depth === 1
            ? 0.43
            : n.depth === 2
              ? 0.53
              : n.depth === 3
                ? 0.64
                : 0.83;
      if (!selectedNode && zoom < minZoom) continue;
      // Font sizes are measured in screen pixels, but deliberately follow
      // zoom instead of canceling it out. Small overview labels reveal the
      // hierarchy, while zooming makes concept titles progressively larger.
      const scale = Math.max(0.56, Math.min(1.48, Math.pow(zoom / 0.82, 0.67)));
      const base =
        n.depth === 0 ? 15 : n.depth === 1 ? 13 : n.depth === 2 ? 12 : 11;
      const fontPx = Math.max(
        n.depth === 0 ? 9.5 : 8,
        Math.min(n.depth === 0 ? 21 : 18, base * scale),
      );
      const full = n.node.name || "";
      // Available label width grows smoothly with zoom, so titles can be
      // abbreviated in overview without wasting map space or clipping.
      const widthFraction = Math.max(
        0.36,
        Math.min(0.62, 0.36 + (0.2 * (zoom - 0.35)) / 0.95),
      );
      const maxWidth = Math.min(245, Math.max(96, size.w * widthFraction));
      const maxChars = Math.max(9, Math.floor(maxWidth / (fontPx * 0.53)));
      const name =
        full.length > maxChars
          ? full.slice(0, maxChars - 1).trimEnd() + "…"
          : full;
      const width = Math.min(
        maxWidth,
        Math.max(16, name.length * fontPx * 0.53 + 6),
      );
      const height = fontPx + 6;
      const r =
        (n.depth === 0 ? 13 : n.depth === 1 ? 10 : n.depth === 2 ? 8 : 6.5) *
        zoom;
      const gap = 9;
      const candidates = [
        { x: x + r + gap, y: y - height / 2 },
        { x: x - r - gap - width, y: y - height / 2 },
        { x: x - width / 2, y: y - r - gap - height },
        { x: x - width / 2, y: y + r + gap },
      ];
      // Prefer labels facing the free half of the viewport, not the
      // angular outward direction, which frequently clips labels on phones.
      if (x > size.w * 0.52) {
        [candidates[0], candidates[1]] = [candidates[1], candidates[0]];
      }
      let best = null;
      for (const c of candidates) {
        const box = { ...c, w: width, h: height };
        if (
          box.x < 9 ||
          box.y < 8 ||
          box.x + box.w > size.w - 9 ||
          box.y + box.h > size.h - 8
        )
          continue;
        if (occupied.some((o) => overlaps(box, o, 5))) continue;
        if (boxes.some((o) => o.id !== n.id && overlaps(box, o, 3))) continue;
        best = box;
        break;
      }
      if (!best && selectedNode) {
        // A selected node must always keep a visible title; the inspector
        // below contains the unabridged title if a label was shortened.
        const box =
          candidates.find((c) => c.y >= 8 && c.y + height <= size.h - 8) ||
          candidates[0];
        best = {
          x: Math.max(9, Math.min(size.w - 9 - width, box.x)),
          y: Math.max(8, Math.min(size.h - 8 - height, box.y)),
          w: width,
          h: height,
        };
      }
      if (!best) continue;
      occupied.push(best);
      chosen.set(n.id, {
        name,
        font: fontPx / zoom,
        x: (best.x - x) / zoom,
        y: (best.y + height - 5 - y) / zoom,
      });
    }
    return chosen;
  }, [graph, selected, zoom, pan, size]);
  const [outlineOpen, setOutlineOpen] = (0, k.useState)(true);
  const [outlineQuery, setOutlineQuery] = (0, k.useState)("");
  const [outlineLimit, setOutlineLimit] = (0, k.useState)(20);
  const outlineMatches = (0, k.useMemo)(
    () =>
      tree
        ? [...tree.nodes.values()].filter(node=>!node.synthetic)
            .filter((n) =>
              n.name
                .toLocaleLowerCase()
                .includes(outlineQuery.trim().toLocaleLowerCase()),
            )
            .sort((a, b) => a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}))
        : [],
    [tree, outlineQuery],
  );
  const active = selected ? tree?.nodes.get(selected) : null;
  const connections = (0, k.useMemo)(
    () =>
      active && tree
        ? va(tree, active.id)
        : { needs: [], unlocks: [], related: [] },
    [active, tree],
  );
  const results = (0, k.useMemo)(
    () =>
      !tree || !search.trim()
        ? []
        : [...tree.nodes.values()]
            .filter(
              (n) =>
                n.name
                  .toLocaleLowerCase()
                  .includes(search.trim().toLocaleLowerCase()),
            )
            .slice(0, 7),
    [tree, search],
  );
  const reset = () => {
    setZoom(0.78);
    setPan({ x: 0, y: 0 });
    setSelected(null);
  };
  const fit = () => {
    if(graph.compact){setZoom(1);setPan({x:0,y:0});return;}
    if (!graph.nodes.length) {
      reset();
      return;
    }
    const maxX = Math.max(100, ...graph.nodes.map((n) => Math.abs(n.x) + 24)),
      maxY = Math.max(100, ...graph.nodes.map((n) => Math.abs(n.y) + 24));
    const scale = Math.max(
      0.3,
      Math.min(1.3, (size.w - 44) / (2 * maxX), (size.h - 66) / (2 * maxY)),
    );
    setZoom(Math.round(scale * 100) / 100);
    setPan({ x: 0, y: 0 });
  };
  const fold = (id) => {
    const node = tree.nodes.get(id);
    setSelected(id);setInspectorOpen(!node?.synthetic);
    if (!node?.children?.length) return;
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const reveal = (id) => {
    const node = tree?.nodes.get(id);
    if (!node) return;
    setSelected(id);setInspectorOpen(!node.synthetic);
    setSearchOpen(false);
    setOpen((prev) => {
      const next = new Set(prev);
      let p = node.parentId,
        hops = 0;
      while (p && hops++ < 15) {
        next.add(p);
        p = tree.nodes.get(p)?.parentId;
      }
      return next;
    });
    focusRequest.current = id;
  };
  const zoomBy = (mult) =>
    setZoom((z) =>
      Math.max(0.3, Math.min(3.1, Math.round(z * mult * 100) / 100)),
    );
  const pointerDown = (e) => {
    if (e.target.closest("[data-lx-node]")) return;
    const g = gesture.current;
    g.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.points.size === 1)
      g.drag = { x: e.clientX, y: e.clientY, start: { ...pan } };
    if (g.points.size === 2) {
      const [a, b] = [...g.points.values()];
      g.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      g.drag = null;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };
  const pointerMove = (e) => {
    const g = gesture.current;
    if (!g.points.has(e.pointerId)) return;
    g.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.points.size === 2 && g.pinch) {
      const [a, b] = [...g.points.values()];
      setZoom(
        Math.max(
          0.3,
          Math.min(
            3.1,
            (g.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              Math.max(1, g.pinch.dist),
          ),
        ),
      );
    } else if (g.drag)
      setPan({
        x: g.drag.start.x + e.clientX - g.drag.x,
        y: g.drag.start.y + e.clientY - g.drag.y,
      });
  };
  const pointerUp = (e) => {
    const g = gesture.current;
    g.points.delete(e.pointerId);
    if (g.points.size < 2) g.pinch = null;
    if (g.points.size === 0) g.drag = null;
  };
  const color = { structure: "var(--atlas-structure)", prereq: "var(--atlas-prereq)", related: "var(--atlas-related)" };
  const edgeLookup = new Map(graph.nodes.map((n) => [n.id, n]));
  const renderEdge = (e) => {
    const a = edgeLookup.get(e.a),
      b = edgeLookup.get(e.b);
    if (!a || !b) return null;
    const isHierarchy = e.kind === "structure",
      faded = selected && e.a !== selected && e.b !== selected;
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    const bend = isHierarchy ? 0 : e.kind === "related" ? 18 : -18;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      d = Math.max(1, Math.hypot(dx, dy));
    return H("path", {
      key: "edge:" + e.kind + ":" + e.a + ":" + e.b,
      "data-edge-kind": e.kind,
      d: `M${a.x} ${a.y} Q${mx - (dy / d) * bend} ${my + (dx / d) * bend} ${b.x} ${b.y}`,
      stroke: color[e.kind],
      strokeWidth: isHierarchy ? 1.3 : e.count > 1 ? 2.5 : 2,
      strokeDasharray: e.kind === "related" ? "3 6" : undefined,
      opacity: faded
        ? 0.1
        : isHierarchy && edgeMode !== "structure"
          ? 0.15
          : isHierarchy
            ? 0.9
            : 0.9,
      fill: "none",
      strokeLinecap: "round",
      style: { transition: "opacity .2s ease" },
    });
  };
  // Spatial keyboard movement is a convenience alongside the full searchable outline.
  // Focus moves between *visible* nodes; selection and expansion still require Enter/Space.
  const moveAtlasKeyboardFocus = (e) => {
    const order = [...(canvasRef.current?.querySelectorAll('[data-lx-node][tabindex="0"]') || [])];
    if (order.length < 2) return false;
    const index = order.indexOf(e.currentTarget);
    if (index < 0) return false;
    const key = e.key;
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(key)) return false;
    e.preventDefault();
    let next;
    if (key === 'Home') next = 0;
    else if (key === 'End') next = order.length - 1;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (index + order.length - 1) % order.length;
    else next = (index + 1) % order.length;
    order[next]?.focus();
    return true;
  };
  const renderNode = (n) => {
    const node = n.node,
      isParent = !!node.children?.length,
      expanded = open.has(n.id);
    const isActive = selected === n.id;
    const r = n.depth === 0 ? 13 : n.depth === 1 ? 10 : n.depth === 2 ? 8 : 6.5;
    const label = labels.get(n.id);
    const nodeFill =
      node.status === "demonstrated"
        ? "#86D39C"
        : node.status === "revisit"
          ? "#EAAF64"
          : node.status === "in_progress"
            ? "#FF7B6B"
            : "#263441";
    if(n.compact){
      const labelText=String(node.name||'Unnamed concept');
      const textWidth=Math.max(10,Math.floor((n.cellWidth*zoom-20)/7));
      const words=labelText.split(/\s+/);let lines=[''];
      for(const word of words){
        const i=lines.length-1,joined=(lines[i]?lines[i]+' ':'')+word;
        if(joined.length<=textWidth){lines[i]=joined;continue}
        if(lines[i]&&lines.length<2){lines.push(word);continue}
        if(!lines[i])lines[i]=word;
        else lines[i]+=' '+word;
      }
      if(lines.length>2)lines=lines.slice(0,2);
      if(lines[lines.length-1].length>textWidth)lines[lines.length-1]=lines[lines.length-1].slice(0,Math.max(4,textWidth-1)).trimEnd()+'…';
      const action=()=>{
        if(n.cluster){
          const key=n.parentId||'__subjects',page=atlasPages.get(key)||0;
          setAtlasPages(prev=>new Map(prev).set(key,page+1));
          return;
        }
        fold(n.id);
      };
      const lineHeight=17/Math.max(.3,zoom),font=14/Math.max(.3,zoom);
      return H('g',{
        key:n.id,'data-lx-node':n.id,'data-ui':'atlas-compact-cell',
        'data-cluster':n.cluster?'true':undefined,
        role:'button',tabIndex:0,
        'aria-label':labelText+(n.cluster?', show next group':isParent?(expanded?', collapse children':', expand children'):', inspect idea'),
        'aria-pressed':isActive,'aria-expanded':isParent?expanded:undefined,
        onClick:()=>{keyboardSelectRef.current=false;action()},onKeyDown:e=>{if(moveAtlasKeyboardFocus(e))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();keyboardSelectRef.current=!n.cluster;action()}},
        transform:`translate(${n.x},${n.y})`,style:{cursor:'pointer'},
      },
      H('rect',{x:-n.cellWidth/2,y:-n.cellHeight/2,width:n.cellWidth,height:n.cellHeight,
         rx:5,fill:'var(--paper)',stroke:isActive?'var(--accent)':'var(--ink-3)',
         strokeWidth:isActive?2.5:1.3,strokeDasharray:n.cluster?'5 4':undefined}),
      H('rect',{className:'lg-node-focus',x:-n.cellWidth/2+2/zoom,y:-n.cellHeight/2+2/zoom,
         width:n.cellWidth-4/zoom,height:n.cellHeight-4/zoom,rx:5/zoom,
         fill:'none',stroke:'var(--accent)',strokeWidth:3/zoom,opacity:0,pointerEvents:'none'}),
      H('circle',{cx:-n.cellWidth/2+12/zoom,cy:0,r:5/zoom,fill:n.cluster?'var(--ink-3)':nodeFill}),
      H('text',{x:-n.cellWidth/2+23/zoom,y:lines.length===1?4/zoom:-4/zoom,
        fontSize:font,fontFamily:'Instrument Sans, sans-serif',fill:'var(--ink)',fontWeight:isActive?700:500,
        pointerEvents:'none'},...lines.map((line,i)=>H('tspan',{key:i,x:-n.cellWidth/2+23/zoom,dy:i===0?0:lineHeight},line)))
      );
    }
    return H(
      "g",
      {
        key: n.id,
        "data-lx-node": n.id,
        "data-depth": n.depth,
        "data-expanded": isParent ? String(expanded) : undefined,
        "data-selected": isActive ? "true" : undefined,
        "aria-pressed": isActive,
        role: "button",
        tabIndex: 0,
        "aria-expanded": isParent ? expanded : undefined,
        "aria-label":
          node.name +
          (isParent
            ? expanded
              ? ", collapse children"
              : ", expand children"
            : ", inspect idea"),
        onClick: () => {keyboardSelectRef.current=false;fold(n.id)},
        onKeyDown: (e) => {
          if (moveAtlasKeyboardFocus(e)) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();keyboardSelectRef.current=true;
            fold(n.id);
          }
        },
        transform: `translate(${n.x},${n.y})`,
        style: {
          cursor: "pointer",
          transition: "transform .33s cubic-bezier(.22,.8,.25,1)",
        },
      },
      // Selection and keyboard focus stay circular; no boxed SVG focus outline.
      H("circle", {
        className: "lg-node-focus",
        r: r + 6,
        fill: "none",
        stroke: "#DCE9F2",
        strokeWidth: 1.4,
        opacity: 0,
        pointerEvents: "none",
      }),
      isActive &&
        H("circle", {
          r: r + 4.5,
          fill: "none",
          stroke: "var(--accent)",
          strokeWidth: 1.25,
          opacity: 0.86,
          pointerEvents: "none",
        }),
      H("circle", {
        r,
        fill: nodeFill,
        stroke: nodeFill === "#263441" ? "#93AABD" : "#344653",
        strokeWidth: 1.15,
      }),
      isParent &&
        H(
          "text",
          {
            y: 3.6,
            textAnchor: "middle",
            fontSize: 11,
            fontWeight: 600,
            fill: nodeFill === "#263441" ? "#DDE6EE" : "#17202A",
            pointerEvents: "none",
          },
          expanded ? "−" : "+",
        ),
      label &&
        H(
          "text",
          {
            className: "lg-node-label",
            x: label.x,
            y: label.y,
            fontSize: label.font,
            fontFamily:
              n.depth === 0
                ? "Newsreader, Georgia, serif"
                : "Instrument Sans, sans-serif",
            fontWeight: n.depth === 0 ? 600 : 500,
            paintOrder: "stroke",
            stroke: "#151D26",
            strokeWidth: Math.max(1.4, 2.2 / zoom),
            strokeLinejoin: "round",
            fill: isActive ? "#FFFFFF" : "#D4E0EC",
          },
          label.name,
        ),
    );
  };
  const linkGroup = (label, items) =>
    items.length
      ? H(
          "div",
          { className: "lg-rel" },
          H("span", null, label),
          H(
            "div",
            null,
            ...items
              .slice(0, 5)
              .map((n) =>
                H(
                  "button",
                  { type: "button", key: n.id, onClick: () => reveal(n.id) },
                  n.name,
                ),
              ),
          ),
        )
      : null;
  if (query.isPending)
    return H(
      "main",
      { className: "lg-page" },
      H("div", { className: "lg-loading" }, "Opening Atlas…"),
    );
  if (query.error || !tree)
    return H(
      "main",
      { className: "lg-page" },
      H("button", { onClick: () => nav(-1) }, "← Back"),
      H("p", null, "Could not load Atlas data."),
      H("button", { onClick: () => query.refetch() }, "Try again"),
    );
  return H(
    "main",
    { className: isFullscreen?"lg-page lg-explore-fullscreen":"lg-page", "aria-label": "Concept map" ,"data-style":"role-atlas", "data-atlas-view":atlasView},
    H(
      "div",
      { className: "lg-header" },
      H(
        "button",
        { className: "lg-back", onClick: () => nav(-1), "aria-label": "Back" },
        "←",
      ),
      H(
        "div",
        { className: "lg-heading" },
        H("h1", null, "Concept map"),
        H("p", null, stats.ideas, " concepts · ", stats.links, " connections"),
      ),
      H(
        "button",
        {
          type: "button",
          className: "lg-fit-top",
          onClick: fit,
          "aria-label": "Fit graph",
        },
        "⤢",
      ),
      H(NotebookMenu,{}),
    ),
    H(`div`,{className:`notebook-atlas-picker`,role:`group`,"aria-label":`Concept map view`},
      ...[[`list`,`List`],[`map`,`Map`]].map(([value,label])=>H(`button`,{key:value,type:`button`,"aria-pressed":atlasView===value,onClick:()=>{setAtlasView(value);if(value===`map`&&innerWidth<600)setIsFullscreen(true)}},label))),
    H(
      "div",
      { className: "lg-search" },
      H("span", null, "⌕"),
      H("input", {
        placeholder: "Find an idea",
        value: search,
        onChange: (e) => {
          setSearch(e.target.value);
          setSearchOpen(true);
        },
        onFocus: () => setSearchOpen(true),
        "aria-label": "Search Atlas ideas",
      }),
      search &&
        H(
          "button",
          {
            onClick: () => {
              setSearch("");
              setSearchOpen(false);
            },
            "aria-label": "Clear search",
          },
          "×",
        ),
      searchOpen &&
        search &&
        H(
          "div",
          { className: "lg-results" },
          results.length
            ? results.map((n) =>
                H(
                  "button",
                  {
                    key: n.id,
                    onClick: () => {
                      reveal(n.id);
                      setSearch(n.name);
                    },
                  },
                  n.name,
                ),
              )
            : H("span", null, "No matching ideas"),
        ),
    ),
    H(`details`,{className:`notebook-map-filters`},H(`summary`,null,`Map filters`),
    H(
      "div",
      {
        className: "lg-connection-filter",
        role: "group",
        "aria-label": "Connection type",
      },
      ...[
        ["structure", "Structure"],
        ["prereq", "Prerequisites"],
        ["related", "Related"],
        ["all", "All edges"],
      ].map(([mode, label]) =>
        H(
          "button",
          {
            key: mode,
            type: "button",
            "aria-pressed": edgeMode === mode,
            className: edgeMode === mode ? "is-active" : "",
            onClick: () => setEdgeMode(mode),
          },
          H("i", {
            style: {
              background:
                mode === "all"
                  ? "conic-gradient(#86D39C 0 33%,#C5A4E6 33% 66%,#748DA2 66%)"
                  : color[mode],
            },
          }),
          label,
        ),
      ),
    ),
    ),
    H("div",{className:"lemma-atlas-start"},H("span",null,"Choose a subject or node. Explore map for dragging and pinch-zoom."),H("button",{type:"button",ref:exploreButtonRef,"data-ui":"atlas-explore",className:"lg-explore-action",onClick:()=>setIsFullscreen(v=>!v),children:isFullscreen?"Back to concept map":"Explore map"}), ...tree.roots.slice(0,3).map(id=>H("button",{key:id,type:"button",onClick:()=>fold(id)}, tree.nodes.get(id)?.name || "Subject"))),
    selected&&tree&&H('nav',{'aria-label':'Atlas ancestors',className:'lg-atlas-ancestors'},
      H('button',{type:'button',onClick:()=>{setSelected(null);setPan({x:0,y:0})}},'All subjects'),
      ...(()=>{const result=[];let id=selected,guard=0;
        while(id&&guard++<15){const node=tree.nodes.get(id);if(!node)break;result.unshift(node);id=node.parentId}
        return result.map(n=>H('button',{key:n.id,type:'button',onClick:()=>reveal(n.id)},n.name));
      })()),
    H("section",{className:"lg-map"},
      H(
        "div",
        { className: "lg-zoom", "aria-label": "Map zoom controls" },
        H("button", {type:"button", onClick:()=>zoomBy(1/1.23),"aria-label":"Zoom out"}, "−"),
        H("button", {type:"button", onClick:fit,"aria-label":"Fit map"}, "Fit"),
        H("button", {type:"button", onClick:()=>zoomBy(1.23),"aria-label":"Zoom in"}, "+"),
        H("span", {"aria-label":"Current zoom"}, Math.round(zoom*100)+"%"),
      ),
    H(
      "div",
      { className: "lg-map-canvas", "data-atlas-graph": "true", ref: canvasRef },
      H(
        "svg",
        {
          viewBox: `0 0 ${size.w} ${size.h}`,
          width: "100%",
          height: "100%",
          style: { touchAction: isFullscreen?"none":"pan-y pinch-zoom" },
          "aria-label": "Collapsible knowledge graph",
          onPointerDown: isFullscreen?pointerDown:void 0,
          onPointerMove: isFullscreen?pointerMove:void 0,
          onPointerUp: isFullscreen?pointerUp:void 0,
          onPointerCancel: isFullscreen?pointerUp:void 0,
          onWheel: (e) => {
            if (isFullscreen && e.ctrlKey) {
              e.preventDefault();
              zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
            }
          },
        },
        H(
          "defs",
          null,
          H(
            "pattern",
            {
              id: "lg-grid",
              width: 42,
              height: 42,
              patternUnits: "userSpaceOnUse",
            },
            H("path", {
              d: "M42 0H0V42",
              fill: "none",
              stroke: "#273340",
              strokeWidth: 0.65,
            }),
          ),
        ),
        H("rect", { width: size.w, height: size.h, fill: "url(#lg-grid)" }),
        H(
          "g",
          {
            transform: `translate(${size.w / 2 + pan.x} ${size.h / 2 + pan.y}) scale(${zoom})`,
          },
          !graph.compact&&H("circle", {
            r: 70,
            stroke: "#334354",
            strokeWidth: 0.7,
            fill: "none",
            strokeDasharray: "2 7",
          }),
          !graph.compact&&H("circle", {
            r: 180,
            stroke: "#2C3947",
            strokeWidth: 0.7,
            fill: "none",
            strokeDasharray: "2 9",
          }),
          !graph.compact&&H("circle", {
            r: 335,
            stroke: "#2C3947",
            strokeWidth: 0.6,
            fill: "none",
            strokeDasharray: "2 10",
          }),
          ...graph.edges.map(renderEdge),
          !graph.compact&&H("circle", {
            r: 21,
            fill: "#212E3B",
            stroke: "#637B8F",
            strokeWidth: 1.2,
          }),
          !graph.compact&&H(
            "text",
            {
              textAnchor: "middle",
              y: 3.8,
              fontFamily: "Newsreader,Georgia,serif",
              fontSize: 13,
              fill: "#E7EEF4",
            },
            "A",
          ),
          ...graph.nodes.map(renderNode),
        ),
      ),
    ),
      H(
        "div",
        { className: "lg-help" },
        graph.compact?graph.nodes.filter(n=>!n.cluster).length:graph.nodes.length,
        graph.compact?" labeled concepts shown · ":" nodes · Tap a parent to ",
        open.size ? "fold / unfold" : "unfold",
        isFullscreen?" · drag to pan":" · use Explore map to pan",
      ),
    ),
    H('details',{className:'lg-map-key', 'data-ui':'atlas-map-key'},
      H('summary',null,'Map key and keyboard help'),
      H('div',{className:'lg-map-key-content'},
        H('p',null,'Focus a visible concept; use arrow keys or Home/End to move, then Enter or Space to inspect or expand. Browse the outline below to search every concept.'),
        H('ul',null,
          H('li',null,H('span',{className:'lg-map-key-mark',style:{background:'#86D39C'},'aria-hidden':'true'}),'Demonstrated'),
          H('li',null,H('span',{className:'lg-map-key-mark',style:{background:'#EAAF64'},'aria-hidden':'true'}),'Re-check due'),
          H('li',null,H('span',{className:'lg-map-key-mark',style:{background:'#FF7B6B'},'aria-hidden':'true'}),'In progress'),
          H('li',null,H('span',{className:'lg-map-key-mark',style:{background:'#263441',border:'1px solid var(--ink-3)'},'aria-hidden':'true'}),'Not started')
        ),
        H('p',null,'Structure links connect parent and child concepts. Prerequisites show required ideas; Related shows other linked concepts. The All edges filter combines them.')
      )
    ),
    H(
      "details",
      {
        className: "lg-outline",
        open:atlasView===`list`?true:undefined,
        onToggle: (e) => setOutlineOpen(e.currentTarget.open),
      },
      H(
        "summary",
        { className: "lg-outline-toggle" },
        "Browse ", stats.ideas, " concepts and ", tree.nodes.size-stats.ideas, " groups",
      ),
      outlineOpen &&
        H(
          "div",
          { className: "lg-outline-content" },
          H(
            "p",
            { className: "lg-outline-guide" },
            "Browse an idea to see its connections and linked checkpoints.",
          ),
          H(
            "label",
            { className: "lg-outline-search" },
            "Find a concept",
            H("input", {
              type: "search",
              value: outlineQuery,
              onChange: (e) => {
                setOutlineQuery(e.target.value);
                setOutlineLimit(80);
              },
              placeholder: "Search all concepts",
            }),
          ),
          H(
            "p",
            { className: "lg-outline-count", "aria-live": "polite" },
            outlineMatches.length,
            " matching concepts",
          ),
          H(
            "div",
            {
              className: "lg-outline-list",
              role: "list",
              "aria-label": "Atlas concepts",
            },
            ...outlineMatches
              .slice(0, outlineLimit)
              .map((node) =>
                H(
                  "div",
                  { key: node.id, role: "listitem" },
                  H(
                    "button",
                    {
                      type: "button",
                      className: active?.id === node.id ? "is-selected" : "",
                      onClick: () => {keyboardSelectRef.current=true;reveal(node.id)},
                      "aria-current":
                        active?.id === node.id ? "true" : undefined,
                    },
                    H("span", { className: "lg-outline-name" }, node.name),
                    null,
                  ),
                ),
              ),
          ),
          outlineLimit < outlineMatches.length &&
            H(
              "button",
              {
                type: "button",
                className: "lg-outline-more",
                onClick: () => setOutlineLimit((n) => n + 20),
              },
              "Load 20 more · ",
              outlineMatches.length - outlineLimit,
              " remaining",
            ),
        ),
    ),
    active&&inspectorOpen
      ? H(Zi,{open:true,title:active.name,onClose:()=>setInspectorOpen(false)},H(
          "section",
          { className: "lg-inspector", "aria-label": "Selected concept", tabIndex:-1, ref:inspectorRef },
          H(
            "div",
            { className: "lg-inspector-title" },
            H(
              "div",
              null,
              H(
                "small",
                null,
                ({cluster:"Subject group",galaxy:"Subject",system:"Topic group",planet:"Concept",star:"Subject",moon:"Idea"}[active.level]||"Concept") + " · " + (ka[active.status] ?? "Not started"),
              ),
              null,
            ),

          ),
          active.blurb && H("p", { className: "lg-blurb" }, active.blurb),
          H(
            "div",
            { className: "lg-actions" },
            active.children?.length > 0 &&
              H(
                "button",
                { onClick: () => fold(active.id) },
                open.has(active.id)
                  ? "Collapse " + active.children.length + (active.children.length===1?" child":" children")
                  : "Expand " + active.children.length + (active.children.length===1?" child":" children"),
              ),
            ...(active.checkpointRefs ?? [])
              .slice(0, 3)
              .map((ref) =>
                H(
                  "button",
                  {
                    key: ref.projectSlug + ref.code,
                    onClick: () =>
                      nav("/p/" + ref.projectSlug + "/cp/" + ref.code),
                  },
                  "Study " + ref.code + " ↗",
                ),
              ),
          ),
          linkGroup("Prerequisites", connections.needs),
          linkGroup("Unlocks", connections.unlocks),
          linkGroup("Related", connections.related),
        ))
      : H(
          "p",
          { className: "lg-guidance" },
          "Select a concept to explore its connections and linked checkpoints.",
        ),
    H(
      "div",
      { className: "lg-bottom" },
      H("span", null, "Search by concept name or expand a subject to explore its ideas."),
      H(
        "button",
        {
          onClick: () => {
            setOpen(new Set(tree.nodes.size > 180 ? [] : tree.roots));
            reset();
          },
        },
        "Reset branches ↺",
      ),
    ),
  );
}

var Wa = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-CQY07xEs.js`),
      __vite__mapDeps([
        24, 2, 25, 3, 26, 7, 8, 9, 13, 27, 22, 28, 29, 30, 31, 17, 21, 32, 33,
      ]),
    ),
  ),
  Ga = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-DfokWqaX.js`),
      __vite__mapDeps([
        34, 2, 6, 3, 7, 8, 9, 13, 22, 35, 36, 28, 37, 38, 16, 17, 18, 5, 4, 11,
        21, 23, 39, 40, 14, 25, 26, 29, 30, 41, 42, 31, 32, 33,
      ]),
    ),
  ),
  Ka = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-DhF27__B.js`),
      __vite__mapDeps([
        43, 6, 2, 3, 7, 8, 9, 13, 36, 22, 28, 44, 45, 46, 34, 35, 37, 38, 16,
        17, 18, 5, 4, 11, 21, 23, 39, 40, 14, 25, 26, 29, 30, 41, 42, 31, 32,
        33,
      ]),
    ),
  ),
  qa = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-BEFT4dQw.js`),
      __vite__mapDeps([
        47, 2, 6, 3, 7, 8, 9, 13, 36, 22, 48, 46, 27, 49, 50, 51, 28, 52, 23,
        21, 26,
      ]),
    ),
  ),
  Ja = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-RJ1UO7Rb.js`),
      __vite__mapDeps([
        53, 2, 3, 13, 22, 54, 28, 55, 50, 52, 21, 56, 26, 7, 8, 9, 6, 39,
      ]),
    ),
  ),
  Ya = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-C3pah2fZ.js`),
      __vite__mapDeps([
        57, 2, 25, 3, 26, 7, 8, 9, 13, 51, 22, 36, 58, 41, 50, 46, 6, 21,
      ]),
    ),
  ),
  Xa = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-Bd_8EoE4.js`),
      __vite__mapDeps([
        59, 2, 3, 16, 17, 18, 5, 4, 11, 13, 44, 22, 38, 60, 21, 61, 28, 62, 33,
        23, 1,
      ]),
    ),
  ),
  Za = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-Cajg06h3.js`),
      __vite__mapDeps([
        63, 2, 3, 13, 22, 36, 54, 45, 28, 44, 16, 17, 18, 5, 4, 11, 1, 21, 26,
        7, 8, 9, 56, 23, 33, 64,
      ]),
    ),
  ),
  Qa = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-CjBxbate.js`),
      __vite__mapDeps([
        65, 2, 3, 13, 58, 22, 44, 46, 16, 17, 18, 5, 4, 11, 60, 33, 1, 21,
      ]),
    ),
  ),
  $a = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-DbdYWJ80.js`),
      __vite__mapDeps([
        20, 2, 3, 13, 16, 17, 18, 5, 4, 11, 21, 22, 23, 6, 7, 8, 9,
      ]),
    ),
  ),
  eo = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-Dls177B2.js`),
      __vite__mapDeps([
        66, 2, 25, 3, 26, 7, 8, 9, 16, 17, 18, 5, 4, 11, 13, 52, 22, 36, 28, 37,
        55, 38, 30, 67, 21, 23, 68, 69,
      ]),
    ),
  ),
  to = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-Dw2lC2HF.js`),
      __vite__mapDeps([
        70, 2, 3, 48, 22, 46, 60, 5, 16, 17, 18, 4, 11, 39, 69, 13, 6, 7, 8, 9,
        71,
      ]),
    ),
  ),
  no = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page--IE2f0uU.js`),
      __vite__mapDeps([
        72, 2, 3, 51, 22, 36, 45, 55, 28, 42, 62, 50, 16, 17, 18, 5, 4, 11, 7,
        8, 21, 23, 73, 33, 13,
      ]),
    ),
  ),
  ro = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-UgnmwSGH.js`),
      __vite__mapDeps([74, 13, 2, 3, 16, 17, 18, 5, 4, 11, 21, 22]),
    ),
  ),
  io = (0, k.lazy)(() =>
    D(
      () => import(`@lemma/Page-DHYqy7PW.js`),
      __vite__mapDeps([
        75, 2, 73, 22, 3, 33, 69, 71, 68, 52, 36, 28, 49, 38, 50, 56, 21, 61,
        62, 23, 39, 32, 40, 26, 7, 8, 9,
      ]),
    ),
  ),
  ao = [
    {
      path: `/`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Ii, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/projects`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(qi, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/projects/new`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Wa, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/p/:slug`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Ga, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/p/:slug/cp/:code`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Ka, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/s/:slug/:n`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(qa, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/proposals`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Ja, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/proposals/:id`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Ya, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/review`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Xa, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/review/run`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Za, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/review/done`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Qa, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/cards`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)($a, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/cards/:no`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(eo, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/atlas`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(Ua, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/insights`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(to, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/settings`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(no, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/sign-in`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(ro, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
    {
      path: `/kit`,
      element: (0, A.jsx)(k.Suspense, {
        fallback: (0, A.jsx)(Zn, {}),
        children: (0, A.jsx)(io, {}),
      }),
      errorElement: (0, A.jsx)(P, {}),
    },
  ],
  oo = new qe({
    defaultOptions: {
      queries: {
        staleTime: 3e4,
        refetchOnWindowFocus: !0,
        retry: (e, t) =>
          !(
            t instanceof ve &&
            [`auth`, `not_found`, `invalid`, `not_implemented`].includes(t.code)
          ) && e < 2,
        retryDelay: (e) => Math.min(2e3, 250 * 2 ** e),
      },
      mutations: { retry: !1 },
    },
  }),
  so = ce([
    {
      element: (0, A.jsx)(Jn, { children: (0, A.jsx)(Wn, {}) }),
      errorElement: (0, A.jsx)(P, {}),
      children: [
        ...ao,
        {
          path: `/calendar`,
          element: (0, A.jsx)(CrCalendarPage, {}),
          errorElement: (0, A.jsx)(P, {}),
        },
        { path: `*`, element: (0, A.jsx)(he, { to: `/`, replace: !0 }) },
      ],
    },
  ]);
function co() {
  (0,k.useEffect)(()=>{window.__lemmaNotebook.configure({api:S()})},[]);
  return (0, A.jsx)(Yn, {
    children: (0, A.jsxs)(u, {
      client: oo,
      children: [
        (0, A.jsx)(C, { router: so }),
        (0, A.jsx)(mr, {}),
        (0, A.jsx)(hr, {}),
        (0, A.jsx)(vr, {}),
        (0, A.jsx)(LemmaFocusDialog, {}), (0,A.jsx)(LemmaQuickTask,{}), (0,A.jsx)(LemmaTodayTime,{}),
      ],
    }),
  });
}
(0, Vt.createRoot)(document.getElementById(`root`)).render(
  (0, A.jsx)(k.StrictMode, { children: (0, A.jsx)(co, {}) }),
);
export {
  LemmaGoalForecast,
  M as $,
  Kr as A,
  rn as At,
  Fr as B,
  Mt as Bt,
  li as C,
  tn as Ct,
  ui as D,
  An as Dt,
  fi as E,
  kn as Et,
  Br as F,
  jn as Ft,
  br as G,
  mt as Gt,
  Ar as H,
  Ot as Ht,
  zr as I,
  dn as It,
  yr as J,
  Re as Jt,
  Cr as K,
  ut as Kt,
  Rr as L,
  Bt as Lt,
  Ur as M,
  Cn as Mt,
  Hr as N,
  ln as Nt,
  ti as O,
  On as Ot,
  Vr as P,
  mn as Pt,
  vn as Q,
  Lr as R,
  Rt,
  _i as S,
  wn as St,
  di as T,
  cn as Tt,
  wr as U,
  Et as Ut,
  jr as V,
  At as Vt,
  Sr as W,
  gt as Wt,
  Tn as X,
  fr as Y,
  gn as Z,
  qi as _,
  Qt as _t,
  xa as a,
  En as at,
  hi as b,
  Jt as bt,
  ma as c,
  fn as ct,
  ha as d,
  Ut as dt,
  Kt as et,
  na as f,
  Xt as ft,
  Zi as g,
  Dn as gt,
  da as h,
  yn as ht,
  Aa as i,
  _n as it,
  Wr as j,
  xn as jt,
  Xr as k,
  nn as kt,
  sa as l,
  Wt as lt,
  _a as m,
  bn as mt,
  ja as n,
  pn as nt,
  F as o,
  Ht as ot,
  va as p,
  Yt as pt,
  xr as q,
  ct as qt,
  Pa as r,
  Zt as rt,
  fa as s,
  en as st,
  Fa as t,
  Sn as tt,
  L as u,
  Gt as ut,
  gi as v,
  on as vt,
  mi as w,
  sn as wt,
  bi as x,
  qt as xt,
  yi as y,
  un as yt,
  Ir as z,
  Pt as zt,
};

function DeskAction({icon:Icon,label,to}){
  const text=to===`/atlas`?`Concept map`:to===`/proposals`?`Inbox`:`Settings`;
  return (0,A.jsxs)(_e,{to,"aria-label":text,className:`desk-action`,children:[
    (0,A.jsx)(Icon,{"aria-hidden":true,size:20}),
    (0,A.jsx)(`span`,{children:text}),
  ]});
}
