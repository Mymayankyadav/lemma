// Incident deduplication. Modes (first CLI arg):
//   pr         called by the PR gate `report` job on failure: record this PR's signatures, and when the same
//              signature is seen on 2+ open PRs (or a PR and main) open/update ONE `incident: <signature>`
//              issue (labels incident + S1).
//   main       called by ci.yml after a red main: open/update ONE S0 incident (title = primary signature).
//   main-green called by ci.yml after a green main: close the main incident, forget main's signatures.
// State lives in one CLOSED issue labelled `ci-registry` whose body CI edits (agents never see it as work).
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { api, paginate, repoPath, ensureLabels, addLabels, GhError } from './gh.mjs';
import { readJson } from './lib.mjs';

const MAX_AGE_MS = 7 * 24 * 3600e3;
const REG_TITLE = 'ci-registry (maintained by CI, not work)';
const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
const repoUrl = `${server}/${process.env.GITHUB_REPOSITORY}`;
const runUrl = (id) => `${repoUrl}/actions/runs/${id}`;
const hashOf = (sig) => createHash('sha1').update(sig).digest('hex').slice(0, 12);
const titleOf = (sig) => `incident: ${sig.length > 200 ? sig.slice(0, 200) + '…' : sig}`;

export async function loadRegistry() {
  const found = await api('GET', repoPath('/issues?labels=ci-registry&state=all&per_page=5'));
  let issue = found.find((i) => !i.pull_request);
  if (!issue) {
    issue = await api('POST', repoPath('/issues'), { title: REG_TITLE, body: renderRegistry({ version: 1, signatures: {} }), labels: ['ci-registry'] });
    issue = await api('PATCH', repoPath(`/issues/${issue.number}`), { state: 'closed', state_reason: 'not_planned' });
  }
  const m = /```json\n([\s\S]*?)\n```/.exec(issue.body || '');
  let data = { version: 1, signatures: {} };
  try { if (m) data = JSON.parse(m[1]); } catch { /* start fresh */ }
  data.signatures ||= {};
  return { issue, data };
}
export const renderRegistry = (data) => `CI-maintained state. **Not work; do not edit.** Closed on purpose.\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n`;

async function saveRegistry(issue, data, mustContain) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await api('PATCH', repoPath(`/issues/${issue.number}`), { body: renderRegistry(data) });
    const back = await api('GET', repoPath(`/issues/${issue.number}`));
    const m = /```json\n([\s\S]*?)\n```/.exec(back.body || '');
    const now = m ? JSON.parse(m[1]) : { signatures: {} };
    if (!mustContain || mustContain.every(([sig, ctx]) => now.signatures?.[sig]?.contexts?.[ctx])) return;
    // a concurrent job overwrote us: merge what it wrote and try again
    for (const [sig, v] of Object.entries(now.signatures || {})) {
      data.signatures[sig] ||= v;
      data.signatures[sig].contexts = { ...v.contexts, ...data.signatures[sig].contexts };
    }
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500));
  }
}

/** Drop stale contexts, closed PRs, and empty signatures. */
export function prune(data, openPrNumbers, now = Date.now()) {
  for (const [sig, v] of Object.entries(data.signatures)) {
    for (const [ctx, info] of Object.entries(v.contexts || {})) {
      const stale = now - new Date(info.at).getTime() > MAX_AGE_MS;
      const closed = ctx.startsWith('pr:') && !openPrNumbers.has(Number(ctx.slice(3)));
      if (stale || closed) delete v.contexts[ctx];
    }
    if (!Object.keys(v.contexts || {}).length) delete data.signatures[sig];
  }
}

async function findIncident(hash) {
  const open = await paginate(repoPath('/issues?labels=incident&state=open'));
  return open.find((i) => !i.pull_request && (i.body || '').includes(`<!-- sig:${hash} -->`));
}

function incidentBody(sig, v, extra = '') {
  const lines = Object.entries(v.contexts).map(([ctx, i]) => `- ${ctx === 'main' ? '`main`' : `PR #${ctx.slice(3)}`} — [run](${runUrl(i.run)}) (${i.at})`);
  return `<!-- sig:${hashOf(sig)} -->\n${extra}**Signature:** \`${sig}\`\n\n**Seen on**\n${lines.join('\n')}\n\nMaintained by CI. It closes when main is green, or when a fix lands and the signature stops appearing.\n`;
}

async function upsertIncident(sig, v, labels, extra = '') {
  const found = await findIncident(hashOf(sig));
  if (found) {
    const body = incidentBody(sig, v, extra);
    if (body !== found.body) await api('PATCH', repoPath(`/issues/${found.number}`), { body });
    const have = new Set(found.labels.map((l) => l.name));
    await addLabels(found.number, labels.filter((l) => !have.has(l)));
    return found.number;
  }
  const issue = await api('POST', repoPath('/issues'), { title: titleOf(sig), body: incidentBody(sig, v, extra), labels });
  console.log(`opened incident #${issue.number}`);
  return issue.number;
}

function loadSigs(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

async function main() {
  const mode = process.argv[2];
  const sigsFile = process.env.SIGNATURES || 'signatures.json';
  const run = process.env.GITHUB_RUN_ID;
  const at = new Date().toISOString();
  await ensureLabels(readJson('ci/labels.json'));
  const { issue, data } = await loadRegistry();
  const open = await paginate(repoPath('/pulls?state=open'));
  const openNums = new Set(open.map((p) => p.number));
  prune(data, openNums);

  if (mode === 'main-green') {
    for (const v of Object.values(data.signatures)) delete v.contexts.main;
    prune(data, openNums);
    await saveRegistry(issue, data);
    const incidents = await paginate(repoPath('/issues?labels=incident&state=open'));
    for (const i of incidents.filter((x) => !x.pull_request && (x.body || '').includes('<!-- main-incident -->'))) {
      await api('POST', repoPath(`/issues/${i.number}/comments`), { body: `main is green again at ${process.env.GITHUB_SHA}. Closing automatically.` });
      await api('PATCH', repoPath(`/issues/${i.number}`), { state: 'closed', state_reason: 'completed' });
      console.log(`closed incident #${i.number}`);
    }
    return;
  }

  const sigs = loadSigs(sigsFile);
  const ctx = mode === 'main' ? 'main' : `pr:${process.env.PR_NUMBER}`;
  if (mode === 'pr' && !process.env.PR_NUMBER) { console.log('no PR number; nothing to record'); return; }
  const mustContain = [];
  for (const s of sigs) {
    data.signatures[s.sig] ||= { first: at, contexts: {} };
    data.signatures[s.sig].contexts[ctx] = { run, at, sha: process.env.GITHUB_SHA };
    mustContain.push([s.sig, ctx]);
  }
  await saveRegistry(issue, data, mustContain);

  if (mode === 'pr') {
    for (const s of sigs) {
      const v = data.signatures[s.sig];
      if (Object.keys(v.contexts).length >= 2) {
        const n = await upsertIncident(s.sig, v, ['incident', 'S1']);
        console.log(`signature seen in ${Object.keys(v.contexts).join(', ')} -> incident #${n}`);
      }
    }
    return;
  }
  // main: ONE S0 incident, titled with the primary signature, listing all of them.
  const primary = sigs[0]?.sig || `ci/${process.env.FAILED_JOBS || 'main'}:: job failed with no test report`;
  const v = data.signatures[primary] || { contexts: { main: { run, at, sha: process.env.GITHUB_SHA } } };
  const all = sigs.length > 1 ? `**All failing signatures (${sigs.length}):**\n${sigs.slice(0, 20).map((s) => `- \`${s.sig}\``).join('\n')}\n\n` : '';
  const revert = process.env.REVERT_NOTE ? `**Revert:** ${process.env.REVERT_NOTE}\n\n` : '';
  const n = await upsertIncident(primary, v, ['incident', 'S0'], `<!-- main-incident -->\n${revert}${all}`);
  console.log(`main incident #${n}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e instanceof GhError ? e.message : e); process.exit(1); });
