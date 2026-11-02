/** Pure, fail-closed evidence checks; never calls GitHub or creates a lock. */
export const SLOTS = [':00', ':15', ':30', ':45', ':50'];
export const ROLES = ['lead-dispatcher', 'intake-steward', 'product-planner', 'ui-designer', 'architect', 'migration-planner', 'builder', 'backend-engineer', 'fixer', 'integration-engineer', 'independent-auditor', 'visual-qa', 'security-reviewer', 'performance-reviewer', 'release-steward', 'post-merge-verifier'];
const MODES = ['legacy', 'shadow', 'cutover', 'active', 'rollback'];
const FALLBACKS = ['none', 'ready-release', 'eligible-audit', 'main-incident', 'approved-intake-assessment', 'independent-task-next-up'];
const sha = v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const runId = v => typeof v === 'string' && /^run:[1-9]\d*$/.test(v);
const commentId = v => Number.isSafeInteger(v) && v > 0;
export const instant = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const yes = reason => ({ok:true, reason});
const no = reason => ({ok:false, reason});
const refList = a => Array.isArray(a) && a.length > 0 && a.every(text);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateRun(r) {
  if (!object(r) || !runId(r.run_id) || !SLOTS.includes(r.slot) || !text(r.nonce) || !commentId(r.generation)) return no('Invalid run identity');
  if (![r.nominal_at,r.started_at,r.finish_by].every(instant) || !Number.isFinite(r.runtime_minutes) || r.runtime_minutes <= 0 || r.runtime_verified !== true) return no('Unverified runtime or invalid dated time');
  const n=Date.parse(r.nominal_at), s=Date.parse(r.started_at), f=Date.parse(r.finish_by);
  if (s<n || f<=s || f>n+50*60000 || f>s+r.runtime_minutes*60000) return no('Run exceeds nominal/runtime boundary');
  // Slot identity is defined in IST, independent of host time zone.
  const local=new Date(n+330*60000);
  if (local.getUTCMinutes()!==Number(r.slot.slice(1)) || local.getUTCSeconds()!==0 || local.getUTCMilliseconds()!==0) return no('Nominal instance differs from IST slot');
  return yes('Valid run ceiling (not capability for other actions)');
}

export function validateControl(e, previous, authority) {
  if (!object(e) || !object(authority) || e.event_type!=='PROTOCOL_CONTROL' || !commentId(e.id) || !commentId(e.generation) || !MODES.includes(e.mode) || !instant(e.effective_at) || !digest(e.protocol_digest)) return no('Invalid control envelope');
  if (authority.authorized!==true || authority.reads_complete!==true || authority.chain_unambiguous!==true || e.authorization_reference!==authority.authorization_reference || e.controller_run_id!==authority.controller_run_id || e.protocol_digest!==authority.protocol_digest || !sha(e.repository_commit) || !refList(e.applies_to) || !text(e.rollback_reference) || !text(e.claim_reference)) return no('Unverified control authority/digest/chain');
  if (new Set(e.applies_to).size!==5 || !Array.isArray(authority.task_ids) || [...e.applies_to].sort().join('\n')!==[...authority.task_ids].sort().join('\n')) return no('Control must name actual five installed identities');
  if (previous) {
    const allowed={legacy:['legacy','shadow','rollback'],shadow:['shadow','cutover','rollback'],cutover:['cutover','active','rollback'],active:['active','cutover','rollback'],rollback:['rollback','legacy']};
    if (!allowed[previous.mode]?.includes(e.mode) || e.supersedes!==previous.id || e.id<=previous.id || e.generation<previous.generation || (e.protocol_digest!==previous.protocol_digest && e.generation<=previous.generation) || Date.parse(e.effective_at)<Date.parse(previous.effective_at)) return no('Broken/forked predecessor or transition');
  } else if (e.supersedes!==null || e.mode!=='legacy' || authority.genesis_authorized!==true) return no('Only explicitly authorized legacy genesis may start chain');
  if ((e.mode==='active' || (e.mode==='legacy' && previous?.mode==='rollback')) && authority.transition_gates_verified!==true) return no('Transition/drain/readback gates incomplete');
  return yes('Control evidence coherent; refresh actual authority before mutation');
}

export function validatePacket(p, context) {
  if (!object(p) || !object(context) || p.protocol!=='lemma.agent.v3' || p.generation!==context.generation || p.mode!==context.mode || !MODES.includes(p.mode) || !text(p.epoch) || !runId(p.publisher_run_id) || !text(p.publisher_claim) || !text(p.control_reference) || p.control_reference!==context.control_reference || p.protocol_digest!==context.protocol_digest || !digest(p.protocol_digest) || context.control_verified!==true) return no('Packet/control mismatch');
  if (![p.published_at,p.admission_start,p.admission_end].every(instant) || Date.parse(p.published_at)>Date.parse(p.admission_start) || Date.parse(p.admission_end)<=Date.parse(p.admission_start) || Date.parse(p.admission_end)-Date.parse(p.admission_start)>60*60000) return no('Invalid packet window');
  if (!sha(p.repository_commit) || !sha(p.plan_blob) || !text(p.intake_watermark) || !Array.isArray(p.tickets) || p.tickets.length!==5) return no('Incomplete packet sources/tickets');
  const seen=new Set();
  for (const t of p.tickets) {
    if (!object(t) || !SLOTS.includes(t.slot) || seen.has(t.slot) || !text(t.id) || !ROLES.includes(t.role) || !text(t.playbook) || !text(t.scope) || !text(t.next_action) || !text(t.accepted_revision) || !text(t.task_or_queue) || !refList(t.authority_refs) || !text(t.capability_ref) || !text(t.review_path_ref) || !text(t.continuity_ref) || !FALLBACKS.includes(t.fallback)) return no('Invalid/incomplete ticket');
    seen.add(t.slot);
    if (![t.nominal_at,t.latest_admission].every(instant)) return no('Invalid ticket instants');
    const n=Date.parse(t.nominal_at), start=Date.parse(p.admission_start), end=Date.parse(p.admission_end), latest=Date.parse(t.latest_admission), local=new Date(n+330*60000);
    if (n<start || n>=end || local.getUTCMinutes()!==Number(t.slot.slice(1)) || local.getUTCSeconds()!==0 || local.getUTCMilliseconds()!==0 || latest<n || latest>Math.min(n+5*60000,end)) return no('Ticket nominal/admission boundary invalid');
    if (typeof t.writable!=='boolean' || !Array.isArray(t.paths) || !t.paths.every(text) || (t.writable && (!t.paths.length || !text(t.branch_or_pr))) || (!t.writable && !text(t.read_only_reason))) return no('Unspecified write/read-only scope');
  }
  return yes('Complete advisory packet; not a lease');
}

export function admitTicket(p, r, context, now) {
  const packet=validatePacket(p,context), run=validateRun(r);
  if (!packet.ok) return packet; if (!run.ok) return run;
  if (!instant(now) || context.mode!=='active') return no('Mode cannot admit v3 work');
  const t=p.tickets.find(t=>t.slot===r.slot && t.nominal_at===r.nominal_at);
  if (!t || Date.parse(now)<Math.max(Date.parse(p.admission_start),Date.parse(t.nominal_at),Date.parse(r.started_at)) || Date.parse(now)>Date.parse(t.latest_admission) || Date.parse(now)>=Date.parse(p.admission_end) || Date.parse(now)>=Date.parse(r.finish_by)-10*60000) return no('Wrong nominal invocation or outside admission/new-work boundary');
  return yes('Admitted; continuation governed by own claim and deadline');
}

/** Relevant claims must be fully paginated and include overlapping path scopes. */
export function resolveClaim({candidate, claims, releases, pr_holder, now, reads_complete, active_generation}) {
  if (!reads_complete || !instant(now) || !object(candidate) || !Array.isArray(claims) || !Array.isArray(releases)) return no('Incomplete ownership evidence');
  for (const c of [candidate,...claims]) {
    if (!object(c) || !commentId(c.id) || !runId(c.run_id) || !text(c.scope) || !text(c.accepted_revision) || !commentId(c.generation) || !instant(c.starts_at) || !instant(c.expires_at) || Date.parse(c.expires_at)<=Date.parse(c.starts_at) || Date.parse(c.expires_at)-Date.parse(c.starts_at)>50*60000) return no('Malformed claim or unreconciled legacy lifetime');
  }
  if (candidate.generation!==active_generation || Date.parse(now)<Date.parse(candidate.starts_at) || Date.parse(now)>=Date.parse(candidate.expires_at)) return no('Candidate generation/time invalid');
  for (const x of releases) if (!object(x) || !commentId(x.claim_id) || !runId(x.run_id) || !instant(x.at)) return no('Malformed release');
  const live=claims.filter(c=>Date.parse(c.starts_at)<=Date.parse(now) && Date.parse(now)<Date.parse(c.expires_at) && !releases.some(x=>x.claim_id===c.id && x.run_id===c.run_id && Date.parse(x.at)>=Date.parse(c.starts_at) && Date.parse(x.at)<=Date.parse(now)));
  // Active foreign generations/unknown scope overlap are hazards, never discarded.
  if (live.some(c=>c.generation!==active_generation)) return no('Incompatible live writer');
  if (pr_holder && (!runId(pr_holder.run_id) || !instant(pr_holder.expires_at))) return no('Ambiguous PR holder');
  if (pr_holder && Date.parse(now)<Date.parse(pr_holder.expires_at)) return pr_holder.run_id===candidate.run_id ? yes('Existing valid PR holder retained; refresh claim binding before write') : no('Existing valid PR holder wins');
  const winner=[candidate,...live].sort((a,b)=>a.id-b.id)[0];
  return winner.id===candidate.id && winner.run_id===candidate.run_id ? yes('Earliest eligible cooperative claim; recheck before write') : no('Earlier conflicting claim wins');
}

export function mayContinue({run, claim, now, generation, holds_clear, revision_current, ownership_verified, control_mode}) {
  const valid=validateRun(run); if (!valid.ok) return valid;
  if (!object(claim) || !instant(now) || !instant(claim.starts_at) || !instant(claim.expires_at) || Date.parse(now)<Date.parse(run.started_at) || Date.parse(now)<Date.parse(claim.starts_at) || claim.run_id!==run.run_id || claim.generation!==generation || run.generation!==generation || Date.parse(claim.expires_at)>Date.parse(run.finish_by) || Date.parse(now)>=Math.min(Date.parse(run.finish_by),Date.parse(claim.expires_at)) || !holds_clear || !revision_current || !ownership_verified || control_mode!=='active') return no('Continuation authority/hold/revision/deadline invalid');
  return yes('Existing claim may continue; packet expiry does not extend/revoke it');
}

/**
 * Pre-activation review may come from a different interactive execution when
 * no saved scheduled slot is available. This does not authenticate GitHub
 * authorship: the release actor MUST inspect the linked RUN, nonce, authoring
 * lineage and explicit owner authorization before asserting the flags below.
 * A synthetic slot or an interactive self-review can never satisfy this path.
 */
function bootstrapReviewerVerified(v, e) {
  if (v.review_channel !== 'interactive_bootstrap' || v.slot !== 'interactive' ||
      !['legacy', 'shadow'].includes(e.protocol_mode) ||
      e.bootstrap_review_authorized !== true ||
      e.bootstrap_authorization_verified !== true ||
      !text(e.bootstrap_authorization_ref) ||
      v.separate_execution_verified !== true ||
      !text(v.invocation_nonce) || !instant(v.started_at) ||
      Date.parse(v.started_at) > Date.parse(v.at) ||
      !text(v.run_record_url)) return false;
  const match = /^https:\/\/github\.com\/Mymayankyadav\/lemma\/issues\/455#issuecomment-([1-9]\\d*)$/.exec(v.run_record_url);
  return match !== null && v.run_id === 'run:' + match[1];
}

export function evaluateRelease(e) {
  if (!object(e) || !sha(e.head_sha) || !sha(e.base_sha) || !text(e.accepted_revision) || e.reads_complete!==true || e.generic_gate_ok!==true) return no('Generic gate or exact evidence missing');
  for (const k of ['ci_identity_verified','attempt_policy_met','acceptance_met','owner_permission_verified','holds_clear','lease_verified','mergeable','dependencies_met','integration_current','verification_assigned']) if (e[k]!==true) return no(`Release prerequisite missing: ${k}`);
  if (e.draft!==false || e.ready!==true || !runId(e.run_id) || !SLOTS.includes(e.slot) || !refList(e.evidence_refs) || !Array.isArray(e.contributor_runs) || !Array.isArray(e.contributor_slots) || !Array.isArray(e.merger_runs) || !Array.isArray(e.merger_slots) || !Array.isArray(e.verdicts)) return no('Missing release/provenance evidence');
  const sorted=[...e.verdicts];
  if (sorted.some(v=>!object(v) || !commentId(v.id) || !instant(v.at) || !['CLEAR','BLOCK'].includes(v.verdict))) return no('Invalid audit chronology');
  sorted.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at) || a.id-b.id);
  const v=sorted.at(-1);
  if (!v || v.verdict!=='CLEAR' || v.head_sha!==e.head_sha || v.accepted_revision!==e.accepted_revision) return no('Missing full-head/current-requirement CLEAR or unresolved BLOCK');
  const scheduledReviewer = SLOTS.includes(v.slot) && v.review_channel !== 'interactive_bootstrap';
  const eligibleReviewer = scheduledReviewer || bootstrapReviewerVerified(v, e);
  if (!runId(v.run_id) || !eligibleReviewer || v.provenance_verified!==true || !text(v.provenance_ref) || !refList(v.evidence_refs) || e.contributor_runs.includes(v.run_id) || e.contributor_slots.includes(v.slot) || e.merger_runs.includes(v.run_id) || e.merger_slots.includes(v.slot)) return no('Independent reviewer lineage not established');
  return yes('Supplement passed; refresh exact head and remote state before REST squash');
}
