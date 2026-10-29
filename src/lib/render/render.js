/* Lemma · Markdown + LaTeX renderer with theorem environments, math-aware cloze, links, media. */
const Render = (() => {
  'use strict';
  const CZA_O = '', CZA_C = '', CZQ_O = '', CZQ_C = '';
  const MI_O = '', MI_C = '', MD_O = '', MD_C = '';
  const MATH_ENVS = new Set(['equation', 'equation*', 'align', 'align*', 'aligned', 'gather', 'gather*',
    'gathered', 'multline', 'multline*', 'alignat', 'alignat*', 'alignedat', 'flalign', 'flalign*',
    'eqnarray', 'eqnarray*', 'CD', 'split', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix', 'smallmatrix', 'array', 'darray', 'subarray']);

  const ENV = {
    theorem: ['Theorem', 'plain'], lemma: ['Lemma', 'plain'], proposition: ['Proposition', 'plain'],
    corollary: ['Corollary', 'plain'], conjecture: ['Conjecture', 'plain'], claim: ['Claim', 'plain'],
    fact: ['Fact', 'plain'], axiom: ['Axiom', 'plain'], law: ['Law', 'plain'], principle: ['Principle', 'plain'],
    definition: ['Definition', 'def'], example: ['Example', 'def'], exercise: ['Exercise', 'def'],
    problem: ['Problem', 'def'], question: ['Question', 'def'], notation: ['Notation', 'def'],
    algorithm: ['Algorithm', 'def'], counterexample: ['Counterexample', 'def'], formula: ['Formula', 'def'],
    remark: ['Remark', 'remark'], note: ['Note', 'remark'], intuition: ['Intuition', 'remark'],
    observation: ['Observation', 'remark'], warning: ['Warning', 'remark'], idea: ['Idea', 'remark'],
    proof: ['Proof', 'proof'], solution: ['Solution', 'proof'], sketch: ['Proof sketch', 'proof'],
    steps: ['Steps', 'proof'], hint: ['Hint', 'hint'],
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escTexText = (s) => String(s).replace(/[\\{}$&#^_%~]/g, (c) => (c === '\\' ? '\\textbackslash{}' : '\\' + c));

  // ---------- cloze ----------
  const CLOZE_HEAD = /^\{\{c(\d+)::/;
  /** Find a cloze starting at i. Returns {n, cs, ce, hs, he, end} or null. Braces in TeX are balanced. */
  function findCloze(src, i) {
    const m = CLOZE_HEAD.exec(src.slice(i, i + 12));
    if (!m) return null;
    const n = +m[1];
    const cs = i + m[0].length;
    let depth = 0, k = cs, hintAt = -1;
    while (k < src.length) {
      const ch = src[k];
      if (ch === '\\') { k += 2; continue; }
      if (ch === '{' && src[k + 1] === '{' && src[k + 2] === 'c') {
        const inner = findCloze(src, k);
        if (inner) { k = inner.end; continue; }
      }
      if (ch === '{') { depth++; k++; continue; }
      if (ch === '}') {
        if (depth === 0 && src[k + 1] === '}') {
          const ce = hintAt >= 0 ? hintAt : k;
          return { n, cs, ce, hs: hintAt >= 0 ? hintAt + 2 : -1, he: k, end: k + 2 };
        }
        depth = Math.max(0, depth - 1); k++; continue;
      }
      if (ch === ':' && src[k + 1] === ':' && depth === 0 && hintAt < 0) { hintAt = k; k += 2; continue; }
      k++;
    }
    return null;
  }
  /** mode: {ord, side:'front'|'back'} | 'all' | null */
  function transformCloze(src, mode, from = 0, to = src.length) {
    let out = '', i = from;
    while (i < to) {
      const j = src.indexOf('{{c', i);
      if (j < 0 || j >= to) { out += src.slice(i, to); break; }
      const c = findCloze(src, j);
      if (!c || c.end > to) { out += src.slice(i, j + 3); i = j + 3; continue; }
      out += src.slice(i, j);
      const inner = transformCloze(src, mode, c.cs, c.ce);
      if (mode && mode !== 'all' && c.n === mode.ord) {
        if (mode.side === 'front') out += CZQ_O + (c.hs >= 0 ? src.slice(c.hs, c.he) : '') + CZQ_C;
        else out += CZA_O + inner + CZA_C;
      } else if (mode === 'all') out += CZA_O + inner + CZA_C;
      else out += inner;
      i = c.end;
    }
    return out;
  }
  function clozeOrds(src) {
    const set = new Set();
    const re = /\{\{c(\d+)::/g;
    let m;
    while ((m = re.exec(src || ''))) set.add(+m[1]);
    return [...set].sort((a, b) => a - b);
  }

  // ---------- math extraction ----------
  function findClosing(src, from, token) {
    let k = from;
    while (k < src.length) {
      const idx = src.indexOf(token, k);
      if (idx < 0) return -1;
      let bs = 0, b = idx - 1;
      while (b >= from && src[b] === '\\') { bs++; b--; }
      if (bs % 2 === 0) return idx;
      k = idx + 1;
    }
    return -1;
  }
  function extractMath(src) {
    const maths = [];
    let out = '', i = 0, lineStart = true;
    const n = src.length;
    const push = (tex, display) => {
      maths.push({ tex, display });
      out += (display ? MD_O : MI_O) + (maths.length - 1) + (display ? MD_C : MI_C);
    };
    while (i < n) {
      const ch = src[i];
      if (lineStart) {
        const fm = /^ {0,3}(`{3,}|~{3,})[^\n]*/.exec(src.slice(i, i + 200));
        if (fm) {
          const fence = fm[1];
          const re = new RegExp('\\n {0,3}' + fence[0] + '{' + fence.length + ',}[ \\t]*(?=\\n|$)', 'g');
          re.lastIndex = i + fm[0].length;
          const close = re.exec(src);
          const end = close ? close.index + close[0].length : n;
          out += src.slice(i, end); i = end; lineStart = false; continue;
        }
      }
      if (ch === '`') {
        let k = i; while (src[k] === '`') k++;
        const run = src.slice(i, k);
        const re = new RegExp('(?<!`)' + run + '(?!`)', 'g');
        re.lastIndex = k;
        const close = re.exec(src);
        if (close) { out += src.slice(i, close.index + run.length); i = close.index + run.length; }
        else { out += run; i = k; }
        lineStart = false; continue;
      }
      if (ch === '\\') {
        const nx = src[i + 1];
        if (nx === '$') { out += '\\$'; i += 2; lineStart = false; continue; }
        if (nx === '[' || nx === '(') {
          const close = findClosing(src, i + 2, nx === '[' ? '\\]' : '\\)');
          if (close > 0) { push(src.slice(i + 2, close), nx === '['); i = close + 2; lineStart = false; continue; }
        }
        if (src.startsWith('\\begin{', i)) {
          const em = /^\\begin\{([A-Za-z]+\*?)\}/.exec(src.slice(i, i + 40));
          if (em && MATH_ENVS.has(em[1])) {
            const name = em[1].replace('*', '\\*');
            const re = new RegExp('\\\\(begin|end)\\{' + name + '\\}', 'g');
            re.lastIndex = i + em[0].length;
            let depth = 1, m2, end = -1;
            while ((m2 = re.exec(src))) {
              depth += m2[1] === 'begin' ? 1 : -1;
              if (depth === 0) { end = m2.index + m2[0].length; break; }
            }
            if (end > 0) { push(src.slice(i, end), true); i = end; lineStart = false; continue; }
          }
        }
        out += ch + (nx === undefined ? '' : nx); i += 2; lineStart = nx === '\n'; continue;
      }
      if (ch === '$') {
        if (src[i + 1] === '$') {
          const close = findClosing(src, i + 2, '$$');
          if (close > i + 2) { push(src.slice(i + 2, close), true); i = close + 2; lineStart = false; continue; }
        } else if (src[i + 1] && !/\s/.test(src[i + 1])) {
          let k = i + 1, found = -1;
          while (k < n) {
            const c2 = src[k];
            if (c2 === '\\') { k += 2; continue; }
            if (c2 === '\n' && src[k + 1] === '\n') break;
            if (c2 === '$') {
              if (!/\s/.test(src[k - 1]) && !/\d/.test(src[k + 1] || '')) found = k;
              break;
            }
            k++;
          }
          if (found > 0) { push(src.slice(i + 1, found), false); i = found + 1; lineStart = false; continue; }
        }
      }
      if (ch === '<' && /[A-Za-z/!]/.test(src[i + 1] || '')) {
        const j = src.indexOf('>', i);
        const nl = src.indexOf('\n\n', i);
        if (j > 0 && (nl < 0 || j < nl)) { out += src.slice(i, j + 1); i = j + 1; lineStart = false; continue; }
      }
      out += ch; lineStart = ch === '\n'; i++;
    }
    return { text: out, maths };
  }

  // ---------- KaTeX ----------
  let baseMacros = {};
  let macroVersion = 0;
  const mathCache = new Map();
  const trust = (c) => c.command === '\\htmlClass' || (c.command === '\\href' && /^https?:/i.test(c.url || ''));
  function mathCloze(tex) {
    return tex
      .replace(/([^]*)/g, (_, hint) => '\\htmlClass{czq}{' + (hint ? '\\text{[' + escTexText(hint) + ']}' : '[\\,\\cdots\\,]') + '}')
      .replace(//g, '\\htmlClass{cza}{')
      .replace(//g, '}');
  }
  function renderMath(tex, display) {
    const key = (display ? 'D' : 'I') + macroVersion + ':' + tex;
    const hit = mathCache.get(key);
    if (hit) return hit;
    let html;
    if (typeof katex === 'undefined') {
      html = `<code class="tex-raw">${esc(display ? '$$' + tex + '$$' : '$' + tex + '$')}</code>`;
    } else {
      try {
        html = katex.renderToString(mathCloze(tex), {
          displayMode: display, throwOnError: false, errorColor: '#c8372d', strict: 'ignore',
          trust, macros: Object.assign({}, baseMacros), maxExpand: 2000, maxSize: 50,
        });
      } catch (e) {
        html = `<span class="tex-err" title="${esc(e.message || 'LaTeX error')}">${esc(tex)}</span>`;
      }
    }
    if (mathCache.size > 3000) mathCache.clear();
    mathCache.set(key, html);
    return html;
  }

  /** Load a LaTeX preamble of \newcommand / \def / \DeclareMathOperator lines. */
  function setPreamble(text) {
    let src = String(text || '').replace(/(^|[^\\])%.*$/gm, '$1');
    src = src.replace(/\\DeclareMathOperator(\*?)\s*\{\s*(\\[A-Za-z]+)\s*\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
      (m, star, cmd, body) => `\\newcommand{${cmd}}{\\operatorname${star}{${body}}}`);
    const macros = {};
    const errors = [];
    if (typeof katex !== 'undefined') {
      const lines = src.split('\n');
      lines.forEach((line, idx) => {
        if (!line.trim()) return;
        const run = (s) => katex.renderToString(s, { macros, globalGroup: true, throwOnError: true, strict: 'ignore', trust });
        try { run(line); }
        catch (e) {
          if (/redefine|renewcommand/i.test(e.message || '')) {
            try { run(line.replace(/\\newcommand/g, '\\renewcommand')); return; } catch (e2) { errors.push({ line: idx + 1, message: e2.message }); return; }
          }
          errors.push({ line: idx + 1, message: (e.message || '').replace(/^KaTeX parse error: /, '') });
        }
      });
    }
    baseMacros = macros;
    macroVersion++;
    mathCache.clear();
    htmlCache.clear();
    return { ok: !errors.length, errors, count: Object.keys(macros).length };
  }

  // ---------- Markdown ----------
  let md = null;
  function buildMarked() {
    if (typeof marked === 'undefined') return null;
    const M = marked.Marked ? new marked.Marked() : marked;
    const container = {
      name: 'container', level: 'block',
      start(src) { const m = /(^|\n):{3,}[ \t]*[A-Za-z]/.exec(src); return m ? m.index + m[1].length : undefined; },
      tokenizer(src) {
        const open = /^(:{3,})[ \t]*([A-Za-z][\w-]*)(\*?)[ \t]*(?:\[([^\]\n]*)\])?[^\n]*(?:\n|$)/.exec(src);
        if (!open) return undefined;
        let pos = open[0].length, depth = 1, bodyEnd = -1, endPos = -1;
        while (pos < src.length) {
          const nl = src.indexOf('\n', pos);
          const line = src.slice(pos, nl < 0 ? src.length : nl);
          if (/^:{3,}[ \t]*[A-Za-z]/.test(line)) depth++;
          else if (/^:{3,}[ \t]*$/.test(line)) {
            depth--;
            if (depth === 0) { bodyEnd = pos; endPos = nl < 0 ? src.length : nl + 1; break; }
          }
          if (nl < 0) break;
          pos = nl + 1;
        }
        if (bodyEnd < 0) { bodyEnd = src.length; endPos = src.length; }
        const body = src.slice(open[0].length, bodyEnd);
        const token = { type: 'container', raw: src.slice(0, endPos), kind: open[2].toLowerCase(), star: !!open[3], title: (open[4] || '').trim(), tokens: [], titleTokens: [] };
        this.lexer.blockTokens(body, token.tokens);
        if (token.title) token.titleTokens = this.lexer.inlineTokens(token.title);
        return token;
      },
      renderer(t) {
        const [label, style] = ENV[t.kind] || [t.kind.charAt(0).toUpperCase() + t.kind.slice(1), 'def'];
        const title = t.title ? this.parser.parseInline(t.titleTokens) : '';
        let body = this.parser.parse(t.tokens);
        if (t.kind === 'hint') {
          return `<details class="env env-hint"><summary>${title || 'Hint'}</summary><div class="env-body">${body}</div></details>\n`;
        }
        const steps = t.star || t.kind === 'steps';
        const headLabel = t.kind === 'steps' && title ? title : label;
        const head = `<span class="env-h">${headLabel}${title && t.kind !== 'steps' ? ` <span class="env-t">(${title})</span>` : ''}.</span>`;
        if (steps) {
          return `<div class="env env-${style} env-${t.kind}" data-steps>${head}<div class="env-body">${body}</div>${style === 'proof' && t.kind !== 'steps' ? '<div class="qed-line"><span class="qed" aria-label="end of proof">∎</span></div>' : ''}</div>\n`;
        }
        if (/^<p>/.test(body)) body = body.replace(/^<p>/, '<p>' + head + ' ');
        else body = `<p class="env-solo">${head}</p>` + body;
        if (style === 'proof' && t.kind !== 'solution') {
          if (/<\/p>\s*$/.test(body)) body = body.replace(/<\/p>\s*$/, '<span class="qed" aria-label="end of proof">∎</span></p>');
          else body += '<div class="qed-line"><span class="qed" aria-label="end of proof">∎</span></div>';
        }
        return `<div class="env env-${style} env-${t.kind}">${body}</div>\n`;
      },
    };
    const wikilink = {
      name: 'wikilink', level: 'inline',
      start(src) { const i = src.indexOf('[['); return i < 0 ? undefined : i; },
      tokenizer(src) {
        const m = /^\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/.exec(src);
        if (!m) return undefined;
        const label = (m[2] || m[1]).trim();
        return { type: 'wikilink', raw: m[0], target: m[1].trim(), tokens: this.lexer.inlineTokens(label) };
      },
      renderer(t) { return `<a class="ref" role="button" tabindex="0" data-ref="${esc(t.target)}">${this.parser.parseInline(t.tokens)}</a>`; },
    };
    const highlight = {
      name: 'highlight', level: 'inline',
      start(src) { const i = src.indexOf('=='); return i < 0 ? undefined : i; },
      tokenizer(src) {
        const m = /^==(?=\S)([^\n]*?\S)==(?!=)/.exec(src);
        if (!m) return undefined;
        return { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(t) { return `<mark>${this.parser.parseInline(t.tokens)}</mark>`; },
    };
    M.use({ gfm: true, breaks: true, silent: true, extensions: [container, wikilink, highlight] });
    return M;
  }

  // ---------- pipeline ----------
  const htmlCache = new Map();
  function sanitize(html) {
    if (typeof DOMPurify === 'undefined') return html;
    return DOMPurify.sanitize(html, { ADD_ATTR: ['data-ref', 'data-steps', 'role', 'tabindex'], FORBID_TAGS: ['style', 'form', 'textarea', 'select', 'button'] });
  }
  function substitute(html, maths) {
    // display math eats the <br> line breaks around it
    html = html.replace(/(?:<br>\s*)?(\d+)(?:\s*<br>)?/g, (_, k) => renderMath(maths[+k].tex, true));
    html = html.replace(/(\d+)/g, (_, k) => renderMath(maths[+k].tex, false));
    html = html.replace(//g, '<span class="cz czq">[…]</span>')
      .replace(//g, '<span class="cz czq">[').replace(//g, ']</span>')
      .replace(//g, '<span class="cz cza">').replace(//g, '</span>');
    return html;
  }
  /**
   * Render card Markdown to safe HTML.
   * opts.cloze: {ord, side} | 'all' | null; opts.media: {id: dataURL}; opts.inline: no block wrapper.
   */
  function render(src, opts = {}) {
    src = String(src || '').replace(/\r\n?/g, '\n');
    const mode = opts.cloze || null;
    const key = macroVersion + '|' + (mode === 'all' ? 'all' : mode ? mode.ord + mode.side : '') + '|' + (opts.inline ? 1 : 0) + '|' + (opts.mediaKey || '') + '|' + src;
    const hit = htmlCache.get(key);
    if (hit !== undefined) return hit;
    const withCloze = src.indexOf('{{c') >= 0 ? transformCloze(src, mode) : src;
    const { text, maths } = extractMath(withCloze);
    if (!md) md = buildMarked();
    let html;
    if (md) {
      try { html = opts.inline ? md.parseInline(text) : md.parse(text); }
      catch (e) { html = '<p>' + esc(text) + '</p>'; }
    } else html = '<p>' + esc(text).replace(/\n/g, '<br>') + '</p>';
    if (opts.media) {
      html = html.replace(/(<img[^>]*?\ssrc=")media:([\w-]+)"/g, (m, pre, id) => (opts.media[id] ? pre + opts.media[id] + '"' : pre + '"'));
    }
    html = substitute(sanitize(html), maths);
    if (htmlCache.size > 1500) htmlCache.clear();
    htmlCache.set(key, html);
    return html;
  }
  const renderInline = (src, opts = {}) => render(src, Object.assign({}, opts, { inline: true }));

  /** Rough plain text for labels and search. */
  function plainText(src, max = 140) {
    let s = String(src || '');
    s = transformCloze(s, null);
    s = s.replace(/^:{3,}[ \t]*([A-Za-z]+)\*?(?:\[([^\]\n]*)\])?.*$/gm, (m, k, t) => (t ? t + ':' : ''))
      .replace(/^:{3,}\s*$/gm, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`#>]+/g, '')
      .replace(/\$\$?/g, '')
      .replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  return { render, renderInline, setPreamble, clozeOrds, plainText, transformCloze, extractMath, esc, ENV };
})();
export default Render;
