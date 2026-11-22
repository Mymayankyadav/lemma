// Tokenizer + constrained beam search, shared by the browser worker and the
// Node parity test.  Mirrors autoeq/tokenizer.py and autoeq/decode.py exactly.
// No DOM dependencies; `ort` (onnxruntime-web or onnxruntime-node) is injected.

export function normalizeInput(text, vocab) {
  let s = text.normalize("NFD");
  let out = "";
  for (const ch of s) {
    const o = ch.codePointAt(0);
    let c = ch;
    if (o >= 0xff01 && o <= 0xff5e) c = String.fromCodePoint(o - 0xff01 + 0x21);
    if (Object.prototype.hasOwnProperty.call(vocab.input_map, c)) c = vocab.input_map[c];
    out += c;
  }
  out = out.replace(/ {2,}/g, " ");
  return out.trim();
}

export function encodeInput(text, vocab) {
  const idx = vocab._inputIdx || (vocab._inputIdx = new Map(vocab.input_chars.map((c, i) => [c, i])));
  const unk = idx.get("<unk>");
  const ids = [];
  for (const ch of normalizeInput(text, vocab)) ids.push(idx.has(ch) ? idx.get(ch) : unk);
  return ids;
}

const SPACED = new Set(["&", "\\\\", "\\,"]);
const ALPHA_MACRO = /^\\[A-Za-z]+$/;

function needsSpace(t, u) {
  if (SPACED.has(t) || SPACED.has(u)) return true;
  if (t.startsWith("\\begin{") || u.startsWith("\\end{")) return true;
  if (ALPHA_MACRO.test(t) && /[A-Za-z]/.test(u[0])) return true;
  return false;
}

export function detokenize(ids, vocab) {
  const toks = vocab.output_tokens;
  let out = "";
  let prev = null;
  for (const id of ids) {
    const t = toks[id];
    if (id === vocab.pad_id || id === vocab.bos_id || id === vocab.eos_id) continue;
    if (prev !== null && needsSpace(prev, t)) out += " ";
    out += t;
    prev = t;
  }
  return out;
}

// mirrors autoeq/normalize.py::normalize_latex (used for de-duplicating beams)
export function normalizeLatex(s) {
  s = s.replace(/\\(?:left|right)(?![A-Za-z])/g, "");
  s = s.split("\\dfrac").join("\\frac").split("\\tfrac").join("\\frac");
  s = s.split("\\varepsilon").join("\\epsilon").split("\\varphi").join("\\phi");
  s = s.split("\\vartheta").join("\\theta").split("\\varrho").join("\\rho");
  s = s.split("\\rightarrow").join("\\to").split("\\Longrightarrow").join("\\Rightarrow");
  s = s.split("\\Leftrightarrow").join("\\iff").split("\\le ").join("\\leq ").split("\\ge ").join("\\geq ");
  s = s.split("\\ne ").join("\\neq ").split("\\wedge").join("\\land").split("\\vee").join("\\lor");
  s = s.split("\\lnot").join("\\neg").split("\\subset ").join("\\subseteq ");
  s = s.split("\\,").join("").split("\\;").join("").split("\\!").join("").split("~").join("");
  s = s.replace(/\s+/g, "");
  const re = /([\^_])\{([A-Za-z0-9])\}/g;
  s = s.replace(re, "$1$2");
  s = s.replace(re, "$1$2");
  return s;
}

// ---------------------------------------------------------------------------
// constraints (mirrors decode.py::ConState)
// ---------------------------------------------------------------------------

const MAX_DEPTH = 8, MAX_ENV = 2;

export function buildConstraintTables(vocab) {
  const toks = vocab.output_tokens;
  const flags = vocab.flags;
  const t = { openIds: [], closeId: toks.indexOf("}"), envOpen: new Map(), envClose: new Map(),
              envOnly: [], nonLetterIds: [] };
  toks.forEach((tok, i) => {
    const f = flags[tok];
    if (!f || !f.letter) t.nonLetterIds.push(i);
    if (!f) return;
    if (f.open) t.openIds.push(i);
    if (f.env_open) t.envOpen.set(i, f.env_open);
    if (f.env_close) t.envClose.set(i, f.env_close);
    if (f.env_only) t.envOnly.push(i);
  });
  t.flagsById = toks.map((tok) => flags[tok] || {});
  return t;
}

class ConState {
  // `esc`: the previous token was `\`, so a macro name is being spelled out.
  constructor(depth = 0, stack = [], esc = false) { this.depth = depth; this.stack = stack; this.esc = esc; }
  copy() { return new ConState(this.depth, this.stack.slice(), this.esc); }
  push(tok, T) {
    const f = T.flagsById[tok];
    this.esc = !!f.esc;
    if (f.open) this.depth += 1;
    else if (f.close) this.depth -= 1;
    else if (f.env_open) this.stack.push(f.env_open);
    else if (f.env_close) this.stack.pop();
  }
  forbidden(T, vocab) {
    if (this.esc) return T.nonLetterIds;  // `\` must be followed by the macro's letters
    const out = [];
    if (this.depth === 0) out.push(T.closeId);
    if (this.depth > 0 || this.stack.length) out.push(vocab.eos_id);
    if (this.depth >= MAX_DEPTH) out.push(...T.openIds);
    if (!this.stack.length) {
      out.push(...T.envOnly);
      out.push(...T.envClose.keys());
    } else {
      const top = this.stack[this.stack.length - 1];
      for (const [i, name] of T.envClose) if (name !== top) out.push(i);
    }
    if (this.stack.length >= MAX_ENV) out.push(...T.envOpen.keys());
    out.push(vocab.pad_id, vocab.bos_id);
    return out;
  }
}

export function lengthPenalty(n, alpha = 0.6) { return Math.pow((5 + n) / 6, alpha); }

// ---------------------------------------------------------------------------
// ORT stepper (encoder.onnx + decoder.onnx as exported by export_onnx.py)
// ---------------------------------------------------------------------------

export class OrtStepper {
  constructor(ort, encSession, decSession) {
    this.ort = ort; this.enc = encSession; this.dec = decSession;
  }
  async encode(srcIds) {
    const S = srcIds.length;
    const feeds = {
      src_ids: new this.ort.Tensor("int32", Int32Array.from(srcIds), [1, S]),
      src_len: new this.ort.Tensor("int32", Int32Array.from([S]), [1]),
    };
    const r = await this.enc.run(feeds);
    const ck = r.cross_k, cv = r.cross_v, bias = r.src_bias;
    [this.L, , this.H, , this.dh] = ck.dims;
    this.S = S;
    return { ck, cv, bias, B: 1 };
  }
  expand(enc, k) {
    // repeat along the batch axis (axis 1 for [L,B,H,S,dh]; axis 0 for bias [B,1,1,S])
    const rep5 = (t) => {
      const [L, B, H, S, dh] = t.dims;
      const block = H * S * dh;
      const out = new Float32Array(L * k * block);
      for (let l = 0; l < L; l++) {
        const src = t.data.subarray(l * B * block, l * B * block + block);
        for (let b = 0; b < k; b++) out.set(src, (l * k + b) * block);
      }
      return new this.ort.Tensor("float32", out, [L, k, H, S, dh]);
    };
    const S = enc.bias.dims[3];
    const bias = new Float32Array(k * S);
    for (let b = 0; b < k; b++) bias.set(enc.bias.data.subarray(0, S), b * S);
    return { ck: rep5(enc.ck), cv: rep5(enc.cv), bias: new this.ort.Tensor("float32", bias, [k, 1, 1, S]), B: k };
  }
  async step(tokens, pos, past, enc) {
    const B = tokens.length;
    let sk, sv;
    if (past === null) {
      sk = new this.ort.Tensor("float32", new Float32Array(0), [this.L, B, this.H, 0, this.dh]);
      sv = new this.ort.Tensor("float32", new Float32Array(0), [this.L, B, this.H, 0, this.dh]);
    } else { [sk, sv] = past; }
    const feeds = {
      tgt_ids: new this.ort.Tensor("int32", Int32Array.from(tokens), [B, 1]),
      pos_offset: new this.ort.Tensor("int32", Int32Array.from([pos]), [1]),
      self_k: sk, self_v: sv, cross_k: enc.ck, cross_v: enc.cv, src_bias: enc.bias,
    };
    const r = await this.dec.run(feeds);
    const lp = r.logprobs; // [B,1,V]
    const V = lp.dims[2];
    const rows = [];
    for (let b = 0; b < B; b++) rows.push(lp.data.subarray(b * V, (b + 1) * V));
    return { rows, past: [r.new_self_k, r.new_self_v], V };
  }
  // run T_new = tokens.length new tokens at once from an empty cache (speculative verification)
  async stepSeq(tokens, enc) {
    const T = tokens.length;
    const sk = new this.ort.Tensor("float32", new Float32Array(0), [this.L, 1, this.H, 0, this.dh]);
    const feeds = {
      tgt_ids: new this.ort.Tensor("int32", Int32Array.from(tokens), [1, T]),
      pos_offset: new this.ort.Tensor("int32", Int32Array.from([0]), [1]),
      self_k: sk, self_v: sk, cross_k: enc.ck, cross_v: enc.cv, src_bias: enc.bias,
    };
    const r = await this.dec.run(feeds);
    const V = r.logprobs.dims[2];
    const rows = [];
    for (let t = 0; t < T; t++) rows.push(r.logprobs.data.subarray(t * V, (t + 1) * V));
    return { rows, past: [r.new_self_k, r.new_self_v], V };
  }
  // keep only the first m cache positions (B must be 1)
  slicePast(past, m) {
    const g = (t) => {
      const [L, B, H, T, dh] = t.dims;
      const out = new Float32Array(L * B * H * m * dh);
      for (let l = 0; l < L; l++)
        for (let b = 0; b < B; b++)
          for (let h = 0; h < H; h++) {
            const src = ((l * B + b) * H + h) * T * dh;
            out.set(t.data.subarray(src, src + m * dh), ((l * B + b) * H + h) * m * dh);
          }
      return new this.ort.Tensor("float32", out, [L, B, H, m, dh]);
    };
    return [g(past[0]), g(past[1])];
  }
  reorder(past, idx) {
    const g = (t) => {
      const [L, B, H, T, dh] = t.dims;
      const block = H * T * dh;
      const k = idx.length;
      const out = new Float32Array(L * k * block);
      for (let l = 0; l < L; l++)
        for (let b = 0; b < k; b++)
          out.set(t.data.subarray((l * B + idx[b]) * block, (l * B + idx[b]) * block + block), (l * k + b) * block);
      return new this.ort.Tensor("float32", out, [L, k, H, T, dh]);
    };
    return [g(past[0]), g(past[1])];
  }
}

// ---------------------------------------------------------------------------
// beam search (mirrors decode.py::beam_search)
// ---------------------------------------------------------------------------

export async function beamSearch(stepper, srcIds, vocab, opts = {}) {
  const k = opts.k ?? 3, maxLen = opts.maxLen ?? 128, alpha = opts.alpha ?? 0.6;
  const nReturn = opts.nReturn ?? 3, constrained = opts.constrained ?? true;
  const shouldAbort = opts.shouldAbort || (() => false);
  const T = vocab._con || (vocab._con = buildConstraintTables(vocab));
  const enc1 = await stepper.encode(srcIds);
  let enc = enc1;
  let live = [{ tokens: [], score: 0.0, con: new ConState() }];
  const finished = [];
  let past = null;
  let tokens = [vocab.bos_id];
  let pos0 = 0;
  const draft = opts.draft || null;
  if (draft && draft.length && stepper.stepSeq) {
    // Speculative draft (the previous keystroke's output): verify all of it in ONE decoder
    // pass, keep the longest prefix the model still agrees with, resume beam search there.
    const st = await stepper.stepSeq([vocab.bos_id, ...draft], enc1);
    let m = 0, score = 0.0;
    const con = new ConState();
    for (; m < draft.length; m++) {
      const row = Float64Array.from(st.rows[m]);
      if (constrained) for (const f of con.forbidden(T, vocab)) row[f] = -Infinity;
      let best = -1, bv = -Infinity;
      for (let t = 0; t < row.length; t++) if (row[t] > bv) { bv = row[t]; best = t; }
      if (best !== draft[m] || !isFinite(row[draft[m]])) break;
      score += row[draft[m]];
      con.push(draft[m], T);
    }
    if (m > 0) {
      live = [{ tokens: draft.slice(0, m), score, con }];
      past = stepper.slicePast(st.past, m);
      tokens = [draft[m - 1]];
      pos0 = m;
    }
  }
  const finalScore = (h) => h.score / lengthPenalty(h.tokens.length, alpha);
  for (let pos = pos0; pos < maxLen; pos++) {
    if (shouldAbort()) return null;
    const st = await stepper.step(tokens, pos, past, enc);
    past = st.past;
    const V = st.V;
    const cands = [];
    for (let bi = 0; bi < live.length; bi++) {
      const h = live[bi];
      const row = Float64Array.from(st.rows[bi]);
      if (constrained) for (const f of h.con.forbidden(T, vocab)) row[f] = -Infinity;
      // top k+1 by (score desc, id asc) — same selection as numpy stable argsort on -row,
      // but O(V*k) with no comparator calls: scanning t ascending and shifting only on a
      // strict improvement leaves equal scores ordered by ascending id.  Sorting all V
      // entries just to take k+1 made the vocabulary size dominate per-step cost.
      const need = k + 1;
      const order = [];
      let n = 0;
      for (let t = 0; t < V; t++) {
        const v = row[t];
        if (!isFinite(v)) continue;
        if (n < need) {
          let i = n++;
          while (i > 0 && row[order[i - 1]] < v) { order[i] = order[i - 1]; i--; }
          order[i] = t;
        } else if (v > row[order[need - 1]]) {
          let i = need - 1;
          while (i > 0 && row[order[i - 1]] < v) { order[i] = order[i - 1]; i--; }
          order[i] = t;
        }
      }
      for (let i = 0; i < n; i++) cands.push([h.score + row[order[i]], bi, order[i]]);
    }
    cands.sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]) || (a[2] - b[2]));
    const newLive = [], idx = [];
    tokens = [];
    for (const [sc, bi, t] of cands) {
      const h = live[bi];
      if (t === vocab.eos_id) { finished.push({ tokens: h.tokens, score: sc, con: h.con }); continue; }
      const con = h.con.copy();
      con.push(t, T);
      newLive.push({ tokens: h.tokens.concat([t]), score: sc, con });
      idx.push(bi);
      tokens.push(t);
      if (newLive.length === k) break;
    }
    if (!newLive.length) break;
    if (finished.length >= k) {
      const fs = finished.map(finalScore).sort((a, b) => b - a);
      const worstTop = fs[k - 1];
      const bestLive = Math.max(...newLive.map((h) => h.score));
      if (bestLive / lengthPenalty(newLive[0].tokens.length + 1, alpha) < worstTop) break;
    }
    live = newLive;
    past = stepper.reorder(past, idx);
    if (enc === enc1 && live.length > 1) enc = stepper.expand(enc1, live.length);
    else if (enc !== enc1 && enc.B !== live.length) enc = stepper.expand(enc1, live.length);
  }
  let fin = finished.length ? finished : live;
  // stable sort by final score desc
  fin = fin.map((h, i) => [h, i]).sort((a, b) => (finalScore(b[0]) - finalScore(a[0])) || (a[1] - b[1])).map((x) => x[0]);
  const out = [], seen = new Set();
  for (const h of fin) {
    const latex = detokenize(h.tokens, vocab);
    const key = normalizeLatex(latex);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ latex, score: finalScore(h), tokens: h.tokens });
    if (out.length === nReturn) break;
  }
  return out;
}
