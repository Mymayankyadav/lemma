// PR scope check (job `scope`). Enforces the mechanical rules of AGENTS.md.
// Runs from the BASE branch via pull_request_target / workflow_dispatch and reads the PR only
// through the API, so a PR can never edit the checker that judges it.
import { readFileSync } from 'node:fs';
import { appendSummary, api, paginate, repoPath, parseLine1, GhError } from './gh.mjs';
import { matchesAny, readJson, parseNext, diffNext, patchLines, isTestFile, addsSkipOnly, countExpects } from './lib.mjs';

const MAX_OPEN_PRS = 6;
const NEXT = 'NEXT.md';
const CALIBRATION = 'ci/perf-calibration.md';

export function classifyTitle(title) {
  const t = String(title || '').trim();
  let m = /^revert\s+#(\d+)((?:[\s,]+#?\d+)*)(?=\s|$|:)/i.exec(t);
  if (m) {
    const nums = [m[1], ...(m[2].match(/\d+/g) || [])].map(Number);
    return { kind: 'revert', numbers: nums };
  }
  if (/^rules:\s*\S/.test(t)) return { kind: 'rules' };
  if (/^ci: perf calibration\b/.test(t)) return { kind: 'calibration' };
  m = /^N(\d+(?:\.\d+)*)\s+(\S.*)$/.exec(t);
  if (m) return { kind: 'item', id: m[1], split: /^split\b/i.test(m[2]) };
  m = /^bug #(\d+)\s+\S/.exec(t);
  if (m) return { kind: 'bug', number: Number(m[1]) };
  m = /^incident #(\d+)\s+\S/.exec(t);
  if (m) return { kind: 'incident', number: Number(m[1]) };
  return { kind: null };
}

const fail = (rule, what, how) => ({ rule, msg: `[${rule}] ${what} To comply: ${how}` });

/** Pure evaluation. ctx is described in main(); returns { failures, warnings, kind }. */
export function evaluateScope(ctx) {
  const failures = [];
  const warnings = [];
  const cls = classifyTitle(ctx.title);
  const line1 = parseLine1(ctx.body);
  const now = ctx.now || new Date();
  const files = ctx.files || [];
  const paths = files.map((f) => f.filename);
  const isCi = line1?.agent?.toLowerCase() === 'ci';
  const kind = cls.kind;

  // R1 title
  if (!kind) {
    failures.push(fail('TITLE', `The title "${ctx.title}" does not start with N<id>, bug #<n>, incident #<n>, revert #<n> or rules:.`,
      'rename the PR, e.g. "N2 <summary>", "bug #12 <summary>", "incident #7 <summary>" or "rules: <summary>".'));
  }

  // R3 body line 1
  if (!line1) {
    failures.push(fail('BODY-LINE-1', 'Line 1 of the PR body must be exactly "Agent: <name> · Item: <id> · Lease until <ISO-8601>".',
      'make the very first line of the body e.g. "Agent: codex-1 · Item: N1 · Lease until 2026-11-04T09:30:00Z" (lease at most 3 hours ahead).'));
  } else if (line1.lease.getTime() > now.getTime() + 3 * 3600e3 + 10 * 60e3) {
    failures.push(fail('LEASE', `The lease (${line1.lease.toISOString()}) is more than 3 hours ahead.`, 'set "Lease until" to at most 3 hours from now and renew it on every push.'));
  }

  // R2 ids
  const nextBase = parseNext(ctx.baseNext);
  const ownerTask = /^Owner task:\s*"(.+)"\s*$/m.test(String(ctx.body || ''));
  if (kind === 'item') {
    const onMain = nextBase.blocks.has(cls.id);
    const ownerNew = ownerTask && !cls.split && !onMain;
    if (!onMain && !ownerNew) {
      failures.push(fail('ITEM-ID', `N${cls.id} is not an item in NEXT.md on the base branch.`,
        ownerTask ? 'an Owner task may add exactly one new item with this id in NEXT.md; split PRs need an existing id.'
          : `use an id that exists in NEXT.md (see the "## N<id>" headings), or, for a task the Owner gave you directly, add the item and put a line Owner task: "<exact words>" after line 1.`));
    }
  }
  if (kind === 'bug' || kind === 'incident') {
    const need = kind === 'bug' ? ['bug', 'confirmed'] : ['incident'];
    const issue = ctx.issue;
    if (!issue || issue.isPr) failures.push(fail('ISSUE', `#${cls.number} is not an issue in this repository.`, `use the number of the open ${kind} issue.`));
    else {
      if (issue.state !== 'open') failures.push(fail('ISSUE-STATE', `Issue #${cls.number} is not open.`, 'work only on open issues.'));
      const missing = need.filter((l) => !issue.labels.includes(l));
      if (missing.length) failures.push(fail('ISSUE-LABELS', `Issue #${cls.number} is missing label(s): ${missing.join(', ')}.`,
        kind === 'bug' ? 'a bug fix needs an issue labelled bug + confirmed (a different agent reproduces it first).' : 'use an issue labelled incident.'));
    }
  }
  if (kind === 'revert') {
    for (const n of cls.numbers) {
      if (!ctx.revertTargets?.[n]) failures.push(fail('REVERT-TARGET', `revert #${n} does not name a merged pull request.`, 'use the number of the merged PR being reverted.'));
    }
  }
  if ((kind === 'revert' || kind === 'calibration') && !isCi) {
    if (kind === 'calibration') failures.push(fail('CALIBRATION', 'Only "Agent: ci" may open a "ci: perf calibration" PR.', 'leave ci/perf-calibration.md to the calibrate workflow.'));
  }

  // R4 limits (CI itself is exempt so revert PRs can always open)
  if (line1 && !isCi) {
    const others = ctx.openPrs || [];
    const same = others.filter((p) => parseLine1(p.body)?.agent?.toLowerCase() === line1.agent.toLowerCase());
    if (same.length) failures.push(fail('ONE-PR-PER-AGENT', `Agent "${line1.agent}" already has open PR(s): ${same.map((p) => '#' + p.number).join(', ')}.`,
      'finish or close your other PR first (limit: 1 open PR per agent).'));
    const nonCi = others.filter((p) => parseLine1(p.body)?.agent?.toLowerCase() !== 'ci').length + 1;
    if (nonCi > MAX_OPEN_PRS) failures.push(fail('MAX-OPEN-PRS', `${nonCi} non-CI PRs are open (limit ${MAX_OPEN_PRS}).`, 'wait until another PR is merged or closed.'));
  }

  // R5 protected paths / tests
  const prot = ctx.protectedCfg;
  if (kind === 'calibration') {
    const bad = paths.filter((p) => p !== CALIBRATION);
    if (isCi && (bad.length || !paths.length)) failures.push(fail('CALIBRATION', `A calibration PR may change only ${CALIBRATION}; it also changes: ${bad.join(', ') || '(nothing)'}.`, `change only ${CALIBRATION}.`));
  } else if (kind === 'revert' && isCi) {
    const allowed = new Set([NEXT]);
    for (const n of cls.numbers) for (const f of ctx.revertTargets?.[n]?.files || []) allowed.add(f);
    const extra = paths.filter((p) => !allowed.has(p));
    if (extra.length) failures.push(fail('REVERT-SCOPE', `A revert PR may touch only files changed by the reverted PR(s) plus ${NEXT}; also changed: ${extra.join(', ')}.`, 'revert only the named PR(s).'));
  } else if (kind !== 'rules') {
    const hit = files.filter((f) => matchesAny(f.filename, prot.paths) || (f.previous_filename && matchesAny(f.previous_filename, prot.paths)));
    if (hit.length) failures.push(fail('PROTECTED-PATH', `This PR changes protected path(s): ${hit.map((f) => f.filename).join(', ')}.`,
      'only a PR titled "rules:" may change AGENTS.md, .github/**, ci/**, scripts/ci/**, budget/threshold files or the test-runner configs (see ci/protected.json). Remove those changes, or ask the Owner for a rules PR.'));
    const deleted = files.filter((f) => f.status === 'removed' && isTestFile(f.filename));
    if (deleted.length) failures.push(fail('TEST-DELETED', `This PR deletes test file(s): ${deleted.map((f) => f.filename).join(', ')}.`,
      'never delete a test; fix the code, or file the failing test as a bug.'));
    for (const f of files) {
      if (!isTestFile(f.filename) || f.status === 'removed') continue;
      if (f.patch === undefined) { if (f.status === 'modified') warnings.push(`${f.filename}: diff too large to inspect for skipped tests or removed assertions.`); continue; }
      const { added, removed } = patchLines(f.patch);
      const skips = addsSkipOnly(added);
      if (skips.length) failures.push(fail('TEST-SKIPPED', `${f.filename} adds .skip/.only/fixme/todo: ${skips[0].trim().slice(0, 80)}`, 'never skip, focus or park a test; fix it or file a bug.'));
      if (f.status === 'modified' && countExpects(removed) > countExpects(added)) {
        warnings.push(`${f.filename}: removes ${countExpects(removed)} assertion(s) and adds ${countExpects(added)}. Reviewer: check the test was not weakened.`);
      }
    }
  }

  // R6 NEXT.md
  const nextFile = files.find((f) => f.filename === NEXT);
  if (nextFile && kind !== 'rules' && kind !== 'calibration') {
    const d = diffNext(ctx.baseNext, ctx.headNext);
    const only = (ids, want) => ids.length === want.length && want.every((w) => ids.includes(w));
    const clean = !d.changed.length && !d.otherChanged;
    let ok = false;
    let how = 'a PR may only remove its own item from NEXT.md when Done.';
    if (kind === 'item' && !cls.split) {
      const own = cls.id;
      ok = clean && ((only(d.removed, [own]) && !d.added.length) || (ownerTask && only(d.added, [own]) && !d.removed.length));
      how = `an N${own} PR may only remove its own item when Done, or (with a line Owner task: "<exact words>") add exactly one new item N${own}.`;
    } else if (kind === 'item' && cls.split) {
      const subs = d.added;
      const okSubs = subs.length >= 1 && subs.every((id) => id.startsWith(cls.id + '.') && /Done\s*=/.test(d.head.blocks.get(id)) && /Scope:/.test(d.head.blocks.get(id)) && /Not:/.test(d.head.blocks.get(id)));
      ok = clean && only(d.removed, [cls.id]) && okSubs && paths.length === 1;
      how = `an "N${cls.id} split" PR must change only ${NEXT}: remove N${cls.id} and add sub-items N${cls.id}.1, N${cls.id}.2 … each with Done =, Scope: and Not: lines.`;
    } else if (kind === 'revert' && isCi) {
      const mine = patchLines(nextFile.patch);
      const tAdded = new Set();
      const tRemoved = new Set();
      for (const n of cls.numbers) {
        const tn = ctx.revertTargets?.[n]?.nextPatch;
        if (tn) { const p = patchLines(tn); p.added.forEach((l) => tAdded.add(l)); p.removed.forEach((l) => tRemoved.add(l)); }
      }
      ok = mine.added.every((l) => l.trim() === '' || l.startsWith('Reverted: ') || tRemoved.has(l)) && mine.removed.every((l) => tAdded.has(l));
      how = 'a CI revert may only add "Reverted: …" lines or restore what the reverted PR changed in NEXT.md.';
    }
    if (!ok) failures.push(fail('NEXT-MD', `This PR changes ${NEXT} in a way its type does not allow (removed: ${d.removed.join(', ') || '-'}; added: ${d.added.join(', ') || '-'}; edited: ${d.changed.join(', ') || '-'}).`, how));
  }
  return { failures, warnings, kind };
}

async function getText(path, ref) {
  try {
    const f = await api('GET', repoPath(`/contents/${path}?ref=${encodeURIComponent(ref)}`));
    return Buffer.from(f.content, 'base64').toString('utf8');
  } catch (e) { if (e instanceof GhError && e.status === 404) return ''; throw e; }
}

async function main() {
  const number = Number(process.env.PR_NUMBER || JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request?.number);
  if (!number) throw new Error('PR_NUMBER missing');
  const pr = await api('GET', repoPath(`/pulls/${number}`));
  const files = await paginate(repoPath(`/pulls/${number}/files`));
  const cls = classifyTitle(pr.title);
  const ctx = {
    title: pr.title, body: pr.body || '', files,
    baseNext: await getText(NEXT, pr.base.sha), headNext: await getText(NEXT, pr.head.sha),
    openPrs: (await paginate(repoPath('/pulls?state=open'))).filter((p) => p.number !== number).map((p) => ({ number: p.number, body: p.body || '' })),
    protectedCfg: readJson('ci/protected.json'),
  };
  if (cls.kind === 'bug' || cls.kind === 'incident') {
    try {
      const i = await api('GET', repoPath(`/issues/${cls.number}`));
      ctx.issue = { state: i.state, isPr: !!i.pull_request, labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)) };
    } catch { ctx.issue = null; }
  }
  if (cls.kind === 'revert') {
    ctx.revertTargets = {};
    for (const n of cls.numbers) {
      try {
        const t = await api('GET', repoPath(`/pulls/${n}`));
        if (!t.merged_at) continue;
        const tf = await paginate(repoPath(`/pulls/${n}/files`));
        ctx.revertTargets[n] = { files: tf.map((f) => f.filename), nextPatch: tf.find((f) => f.filename === NEXT)?.patch };
      } catch { /* leave undefined -> rule failure */ }
    }
  }
  const res = evaluateScope(ctx);
  const lines = [`## scope: ${res.failures.length ? 'FAILED' : 'passed'}`, '', `PR #${number} "${pr.title}" (type: ${res.kind ?? 'unknown'})`, ''];
  for (const f of res.failures) { lines.push(`- ❌ ${f.msg}`); console.log(`::error title=scope ${f.rule}::${f.msg.replace(/\n/g, ' ')}`); }
  for (const w of res.warnings) { lines.push(`- ⚠️ ${w}`); console.log(`::warning title=scope review hint::${w}`); }
  if (!res.failures.length && !res.warnings.length) lines.push('- ✅ all scope rules satisfied');
  appendSummary(lines.join('\n'));
  if (res.failures.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
