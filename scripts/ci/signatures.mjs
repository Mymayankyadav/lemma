// Failure signatures from JUnit XML (vitest, Playwright, SQL scripts).
// Format: `<job>/<test file>::<test name> :: <first error line, numbers/hashes/timestamps/paths normalized>`
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const ENT = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
export const unescapeXml = (s) => String(s || '').replace(/&(lt|gt|amp|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, n, d, h) => ENT[m] ?? String.fromCodePoint(d ? +d : parseInt(h, 16)));

/** Normalize one error line so the same failure on two PRs yields the same string. */
export function normalizeError(line) {
  return String(line || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g, '<time>')
    .replace(/(?:[A-Za-z]:)?(?:\/[\w.@+~-]+){2,}(?::\d+(?::\d+)?)?/g, '<path>')
    .replace(/\b[0-9a-f]{7,40}\b/gi, '<hash>')
    .replace(/\d+(?:\.\d+)?/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = unescapeXml(m[2]);
  return out;
}

/** Parse the testcases of a JUnit document: [{file, name, time, failed, message}]. */
export function parseJUnit(xml) {
  const cases = [];
  const suiteRe = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g;
  let sm;
  while ((sm = suiteRe.exec(xml))) {
    const suite = attrs(sm[1]);
    const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let cm;
    while ((cm = caseRe.exec(sm[2]))) {
      const a = attrs(cm[1]);
      const inner = cm[2] || '';
      const fm = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(inner);
      let message = '';
      if (fm) {
        const fa = attrs(fm[2]);
        const text = unescapeXml((fm[3] || '').replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
        const first = (s) => String(s || '').split('\n').map((l) => l.trim()).find((l) => l && !/^[─—-]+$/.test(l));
        message = first(fa.message) || first(text) || fa.type || 'failed';
      }
      const fileRaw = a.classname || suite.name || '';
      const file = (/[\w./@-]+\.(?:spec|test)\.[cm]?[jt]sx?|[\w./@-]+\.mjs/.exec(fileRaw) || [basename(fileRaw)])[0];
      cases.push({ file, name: a.name || '', time: Number(a.time) || 0, failed: !!fm, skipped: /<skipped\b/.test(inner), message });
    }
  }
  return cases;
}

/** Same test in the PR gate and in main's full run must give the same job: unit | e2e | sql. */
export function jobKind(file, fallback) {
  if (/\.spec\.[cm]?[jt]sx?$/.test(file)) return 'e2e';
  if (/(^|\/)tests\/unit\//.test(file) || /\.test\.[cm]?[jt]sx?$/.test(file)) return 'unit';
  if (/tests\/mcp\/|\.mjs$/.test(file)) return 'sql';
  return String(fallback || 'job').replace(/-\d+-of-\d+$/, '').replace(/-\d+$/, '');
}

export const signatureOf = (job, c) => `${jobKind(c.file, job)}/${c.file}::${c.name} :: ${normalizeError(c.message)}`;

/** Read every *.xml under dir (one artifact dir per job: `junit-<job>/...`). */
export function signaturesFromDir(dir) {
  const out = [];
  const walk = (d, job) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p, job === '' ? name.replace(/^junit-/, '') : job);
      else if (name.endsWith('.xml')) {
        const j = job || basename(d).replace(/^junit-/, '');
        for (const c of parseJUnit(readFileSync(p, 'utf8'))) if (c.failed) out.push({ sig: signatureOf(j, c), job: jobKind(c.file, j), file: c.file, name: c.name, line: normalizeError(c.message) });
      }
    }
  };
  walk(dir, '');
  const seen = new Set();
  return out.filter((s) => !seen.has(s.sig) && seen.add(s.sig)).sort((a, b) => a.sig.localeCompare(b.sig));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, outFile] = process.argv.slice(2);
  const sigs = signaturesFromDir(dir || 'junit');
  if (outFile) writeFileSync(outFile, JSON.stringify(sigs, null, 1));
  else console.log(JSON.stringify(sigs, null, 1));
  console.error(`${sigs.length} failing signature(s)`);
}
