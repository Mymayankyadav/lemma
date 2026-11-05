// Merge-conflict feedback (v1.5). GitHub does not run `pull_request` workflows on a PR that conflicts with its
// base, so fast-gate is simply absent and agents cannot tell why. scope (on PR events) and the sweep (after
// pushes to main) call checkConflict() and keep ONE "merge-conflict" comment per PR, edited in place.
import { api, paginate, repoPath } from './gh.mjs';
import { renderFeedback, upsertFeedback } from './feedback.mjs';

export const GATE = 'merge-conflict';

/** Pure: comment text for a conflict (files = paths changed by both the PR and the base since the merge base). */
export function conflictText({ sha, files = [], conflict, base = 'main' }) {
  if (!conflict) return renderFeedback({ gate: GATE, sha, ok: true, note: 'No merge conflict with the base branch any more; fast-gate can run.' });
  const list = files.length ? files.map((f) => `\`${f}\``).join(', ') : `(GitHub did not say which files; compare your branch with ${base})`;
  return renderFeedback({ gate: GATE, sha, ok: false, items: [
    `This PR conflicts with \`${base}\` in: ${list}. fast-gate cannot run until this is resolved. To comply: on your branch, rewrite each listed file so it contains both ${base}'s and your changes, then push.`,
  ] });
}

/** Pure: files changed by both sides. */
export const overlap = (prFiles, baseFiles) => { const b = new Set(baseFiles); return [...new Set(prFiles)].filter((f) => b.has(f)).sort(); };

/** Pure: conflict state from a pulls/{n} response: 'conflict' | 'clean' | 'unknown'. */
export function stateOf(pr) {
  if (pr?.mergeable === false || pr?.mergeable_state === 'dirty') return 'conflict';
  if (pr?.mergeable === true) return 'clean';
  return 'unknown';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read the PR (retrying while GitHub is still computing mergeability) and write or flip the comment.
 *  Returns the state. Never throws: feedback problems must not fail the caller. */
export async function checkConflict(number, { pr = null, tries = 3, waitMs = 4000 } = {}) {
  try {
    let p = pr;
    for (let i = 0; i < tries && stateOf(p) === 'unknown'; i++) {
      if (i) await sleep(waitMs);
      p = await api('GET', repoPath(`/pulls/${number}`));
    }
    const state = stateOf(p);
    if (state === 'unknown') return state;
    if (state === 'clean') { await upsertFeedback({ pr: number, gate: GATE, text: conflictText({ sha: p.head.sha, conflict: false }), createIfMissing: false }); return state; }
    const prFiles = (await paginate(repoPath(`/pulls/${number}/files`))).map((f) => f.filename);
    let baseFiles = [];
    try { baseFiles = ((await api('GET', repoPath(`/compare/${p.head.sha}...${encodeURIComponent(p.base.ref)}`))).files || []).map((f) => f.filename); } catch { /* list stays empty */ }
    await upsertFeedback({ pr: number, gate: GATE, text: conflictText({ sha: p.head.sha, files: overlap(prFiles, baseFiles), conflict: true, base: p.base.ref }) });
    return state;
  } catch (e) { console.log(`merge-conflict feedback skipped for #${number}: ${e.message}`); return 'unknown'; }
}
