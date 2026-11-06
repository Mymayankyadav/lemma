// PR scope check (job `scope`). Enforces the mechanical rules of AGENTS.md.
// Runs from the BASE branch via pull_request_target / workflow_dispatch and reads the PR only
// through the API, so a PR can never edit the checker that judges it.
import { readFileSync } from 'node:fs';
import { appendSummary, api, paginate, repoPath, parseLine1, GhError } from './gh.mjs';
import { matchesAny, readJson, parseNext, diffNext, needsOf, isNeedsRewrite, patchLines, isTestFile, addsSkipOnly, countExpects, validAgentName, agentKey, NAME_FORMATS, chatParts } from './lib.mjs';
import { checkSession, lockMessage, loadSessions, saveSessions, touchSession } from './sessions.mjs';
import { renderFeedback, upsertFeedback, setCheckOutput } from './feedback.mjs';
import { migrationFindings, existingFunctionNames } from './migrations.mjs';
import { checkConflict } from './conflicts.mjs';

const MAX_OPEN_PRS = 12;
const MAX_PRS_PER_AGENT = 2; // v2.0: start the next item while CI checks the first
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

  // A dispatched run attaches its check to the commit it runs on: it must be the PR's own head commit,
  // so a run can never vouch for a different PR.
  if (ctx.dispatchSha && ctx.headSha && ctx.dispatchSha !== ctx.headSha) {
    failures.push(fail('DISPATCH-HEAD', `This run was dispatched on ${String(ctx.dispatchSha).slice(0, 7)} but the PR head is ${String(ctx.headSha).slice(0, 7)}.`,
      "dispatch scope.yml on the PR's own head branch, with that PR's number."));
  }

  // R1 title
  if (!kind) {
    failures.push(fail('TITLE', `The title "${ctx.title}" does not start with N<id>, bug #<n>, incident #<n>, revert #<n> or rules:.`,
      'rename the PR, e.g. "N2 <summary>", "bug #12 <summary>", "incident #7 <summary>" or "rules: <summary>".'));
  }

  // R3 body line 1 (the claim is the open PR: no lease; the older "· Lease until …" form is still accepted and ignored)
  if (!line1) {
    failures.push(fail('BODY-LINE-1', 'Line 1 of the PR body must be exactly "Agent: <name> · Item: <id>".',
      'make the very first line of the body e.g. "Agent: lemma-1 · Item: N1" (no lease needed; the older "· Lease until <ISO-8601>" form of PRs opened before v1.3 is still accepted).'));
  } else if (!validAgentName(line1.agent)) {
    failures.push(fail('AGENT-NAME', `The Agent name "${line1.agent}" is not valid.`,
      `sign with one of: ${NAME_FORMATS}. Chat agents choose a 4-character tag at their first run and keep it for the whole conversation (e.g. chat-2#k7q3).`));
  } else {
    const lock = checkSession(ctx.sessions || {}, line1.agent, now.getTime());
    if (!lock.ok) failures.push(fail('SESSION-LOCK', `${lockMessage(lock)}.`, `sign as chat-<another number>#${chatParts(line1.agent)?.tag ?? '<tag>'} and keep that name for the whole conversation, or wait until ${lock.until}.`));
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
    const me = agentKey(line1.agent);
    const same = others.filter((p) => { const l = parseLine1(p.body); return l && agentKey(l.agent) === me; });
    if (same.length >= MAX_PRS_PER_AGENT) failures.push(fail('ONE-PR-PER-AGENT', `Agent "${line1.agent}" already has ${same.length} open PRs: ${same.map((p) => '#' + p.number).join(', ')}.`,
      `finish one of them first (limit: ${MAX_PRS_PER_AGENT} open PRs per agent).`));
    const nonCi = others.filter((p) => parseLine1(p.body)?.agent?.toLowerCase() !== 'ci').length + 1;
    const max = ctx.maxOpenPrs ?? MAX_OPEN_PRS;
    if (nonCi > max) failures.push(fail('MAX-OPEN-PRS', `${nonCi} non-CI PRs are open (limit ${max}).`, 'wait until another PR is merged or closed.'));
    // one PR per item: a second PR for the same Item is never allowed (the Owner's `rules` item is exempt)
    if (line1.item.toLowerCase() !== 'rules') {
      const dup = others.filter((p) => { const l = parseLine1(p.body); return l && l.agent.toLowerCase() !== 'ci' && l.item.toLowerCase() === line1.item.toLowerCase(); });
      if (dup.length) failures.push(fail('ONE-PR-PER-ITEM', `Item ${line1.item} already has open PR(s): ${dup.map((p) => '#' + p.number).join(', ')}.`,
        `do not open a second PR for an item: close this one and push commits to the existing PR's branch; if the existing PR has the lease-expired label, change its line 1 to your name.`));
    }
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

  // R5a additive-only migrations: agent PRs merge straight to production (AGENTS.md "Safety")
  if (kind === 'item' || kind === 'bug' || kind === 'incident') {
    const found = migrationFindings(files, { existing: ctx.existingFunctions || new Set(), body: ctx.body });
    if (found.length) failures.push(fail('MIGRATION-ADDITIVE', `Agent migrations deploy to production on merge and may only add objects, but: ${found.join('; ')}.`,
      'never edit, rename or delete an existing migration; in a NEW migration only create things (tables, columns, indexes, policies, new functions, grants). To change an existing function, keep its signature and behaviour compatible and add the PR body line "Replaces function: <name> (reviewer verified signature and behaviour)". Anything that drops, renames, retypes, deletes, revokes or rewrites existing data needs an Owner `rules:` PR.'));
  }

  // R5b a split PR must also implement sub-item .1: code (or the CURRENT.md record the sub-item asks for) plus a test
  if (kind === 'item' && cls.split) {
    const live = files.filter((f) => f.filename !== NEXT && f.status !== 'removed');
    const hasTest = live.some((f) => isTestFile(f.filename));
    const hasCode = live.some((f) => !isTestFile(f.filename));
    if (!hasTest || !hasCode) {
      failures.push(fail('SPLIT-IMPLEMENTS', `An "N${cls.id} split" PR must also implement sub-item N${cls.id}.1 in the same PR, but it changes ${live.length ? live.map((f) => f.filename).join(', ') : 'only ' + NEXT}${hasTest ? ' (no code or CURRENT.md change)' : ' (no test file)'}.`,
        `in this same PR add the code for N${cls.id}.1 (or, if its test passes on main, the CURRENT.md note its Done asks for) and its test; ${NEXT} alone is not enough.`));
    }
  }

  // R6a v1.7: an item PR removes its own item from NEXT.md, so the item leaves main exactly when CI merges the PR.
  // (Before v1.7 merged items stayed listed as open, and agents could pick done work again.) Owner-task PRs that add
  // their item and splits (handled below) are exempt.
  if (kind === 'item' && !cls.split && !ownerTask) {
    const stillListed = parseNext(ctx.baseNext).blocks.has(cls.id) && parseNext(ctx.headNext).blocks.has(cls.id);
    if (stillListed) failures.push(fail('NEXT-MD-DONE', `N${cls.id} is still listed in ${NEXT}.`,
      `delete the whole "## N${cls.id} …" block from ${NEXT} in this PR (from your first push is fine): the item is done when CI merges the PR, and an open PR is already the claim.`));
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
      // v1.6: the only edit allowed to another item is rewriting its `Needs: N<id>` to sub-item(s) of this split,
      // and no item may be left needing the removed N<id> (it would read as done while its sub-items are open)
      const rewrites = d.changed.every((id) => isNeedsRewrite(d.base.blocks.get(id), d.head.blocks.get(id), cls.id, subs));
      const dangling = [...d.head.blocks.keys()].filter((id) => needsOf(d.head.blocks.get(id)).includes(cls.id));
      ok = !d.otherChanged && rewrites && !dangling.length && only(d.removed, [cls.id]) && okSubs;
      how = `an "N${cls.id} split" PR must remove N${cls.id} from ${NEXT} and add its remaining sub-items N${cls.id}.2, N${cls.id}.3 … each with Done =, Scope: and Not: lines (N${cls.id}.1 is implemented in the same PR and is not listed). In every other item, the only allowed edit is replacing N${cls.id} in its Needs: line with the sub-item(s) that finish the work (usually the last one)${dangling.length ? `; still needing N${cls.id}: ${dangling.map((id) => 'N' + id).join(', ')}` : ''}.`;
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
    existingFunctions: existingFunctionNames(), // from the checked-out BASE branch
    headSha: pr.head.sha,
    maxOpenPrs: Number(process.env.MAX_OPEN_PRS) || undefined,
    dispatchSha: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? process.env.GITHUB_SHA : undefined,
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
  const author = parseLine1(pr.body || '')?.agent;
  let reg = null;
  if (author && chatParts(author)) { reg = await loadSessions(); ctx.sessions = reg.map; }
  const res = evaluateScope(ctx);
  const lines = [`## scope: ${res.failures.length ? 'FAILED' : 'passed'}`, '', `PR #${number} "${pr.title}" (type: ${res.kind ?? 'unknown'})`, ''];
  for (const f of res.failures) { lines.push(`- ❌ ${f.msg}`); console.log(`::error title=scope ${f.rule}::${f.msg.replace(/\n/g, ' ')}`); }
  for (const w of res.warnings) { lines.push(`- ⚠️ ${w}`); console.log(`::warning title=scope review hint::${w}`); }
  if (!res.failures.length && !res.warnings.length) lines.push('- ✅ all scope rules satisfied');
  appendSummary(lines.join('\n'));
  // Session lock: remember the chat session that is allowed to use this chat number.
  if (reg && !res.failures.some((f) => f.rule === 'SESSION-LOCK' || f.rule === 'AGENT-NAME') && touchSession(reg.map, author, Date.now())) await saveSessions(reg.issue, reg.map);
  // Agents cannot read logs: put the exact rule(s) into one PR comment (edited in place) and the check output.
  try {
    const ok = res.failures.length === 0;
    const text = renderFeedback({ gate: 'scope', sha: pr.head.sha, ok, items: res.failures.map((f) => f.msg), note: res.warnings.length ? `Reviewer hints: ${res.warnings.join(' ')}` : 'Nothing to do.' });
    await upsertFeedback({ pr: number, gate: 'scope', text, createIfMissing: !ok });
    if (process.env.GITHUB_RUN_ID) await setCheckOutput({ runId: process.env.GITHUB_RUN_ID, jobName: 'scope', title: ok ? 'scope passed' : `scope failed: ${res.failures.map((f) => f.rule).join(', ')}`, text });
  } catch (e) { console.log(`feedback not written: ${e.message}`); }
  // Conflicted PRs get no fast-gate run at all: tell the agent why, in one comment (never fails scope).
  await checkConflict(number, { pr });
  if (res.failures.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
