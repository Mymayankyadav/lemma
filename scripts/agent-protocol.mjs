/** Pure evidence checks: no GitHub calls, scheduler assumptions or transactional locks. */
export const ROLES = ['lead-dispatcher','intake-steward','product-planner','ui-designer','architect','migration-planner','builder','backend-engineer','fixer','integration-engineer','independent-auditor','visual-qa','security-reviewer','performance-reviewer','release-steward','post-merge-verifier'];
const MODES=['legacy','shadow','cutover','active','rollback'];
const KINDS=['scheduled','interactive','ci','external'];
const FALLBACKS=['none','ready-release','eligible-audit','main-incident','approved-intake-assessment','independent-task-next-up'];
const text=v=>typeof v==='string'&&v.trim().length>0;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const runId=v=>typeof v==='string'&&/^run:[1-9]\d*$/.test(v);
const commentId=v=>Number.isSafeInteger(v)&&v>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const refs=v=>Array.isArray(v)&&v.length>0&&v.every(text);
const strings=v=>Array.isArray(v)&&v.every(text);
const unique=v=>new Set(v).size===v.length;
const positive=v=>Number.isFinite(v)&&v>0;
export const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const yes=reason=>({ok:true,reason}),no=reason=>({ok:false,reason});
export function validateRegistry(r){
  if(!object(r)||!text(r.revision)||!Array.isArray(r.agents))return no('Invalid registry');
  const ids=[];
  for(const a of r.agents){
    if(!object(a)||!text(a.id)||!KINDS.includes(a.kind)||!['active','paused','draining','retired'].includes(a.state)||!text(a.authorization_ref)||!text(a.source_ref)||!text(a.lineage_ref)||!text(a.startup_ref)||!text(a.capability_ref)||!text(a.runtime_policy_ref)||!strings(a.roles)||!unique(a.roles)||a.roles.some(x=>!ROLES.includes(x)))return no('Invalid enrollment/capability record');
    ids.push(a.id);
  }
  return unique(ids)?yes('Registry shape valid; actual authorization must be verified'):no('Duplicate agent identity');
}
const member=(r,id)=>r.agents.find(a=>a.id===id&&a.state==='active');
const verifiedRegistry=e=>e.registry_verified===true&&validateRegistry(e.registry).ok;
export function validateRun(r){
  if(!object(r)||!runId(r.run_id)||!text(r.agent_id)||!text(r.invocation_id)||!KINDS.includes(r.kind)||!text(r.nonce)||!commentId(r.generation)||!text(r.runtime_policy_ref))return no('Invalid run identity');
  if(![r.started_at,r.finish_by,r.deadline_ceiling].every(instant)||!positive(r.runtime_minutes)||r.runtime_verified!==true||!Number.isFinite(r.handoff_minutes)||r.handoff_minutes<0||r.handoff_minutes>=r.runtime_minutes)return no('Unknown runtime or invalid time policy');
  if((r.kind==='scheduled'&&!instant(r.nominal_at))||(r.nominal_at!=null&&!instant(r.nominal_at)))return no('Invalid scheduled nominal instance');
  const s=Date.parse(r.started_at),f=Date.parse(r.finish_by);
  if((r.nominal_at!=null&&s<Date.parse(r.nominal_at))||f<=s||f>Date.parse(r.deadline_ceiling)||f>s+r.runtime_minutes*60000||f-s<=r.handoff_minutes*60000)return no('Run exceeds actual invocation/runtime ceiling');
  return yes('Run bounded by its actual verified policy');
}
export function validateControl(e,previous,a){
  if(!object(e)||!object(a)||e.event_type!=='PROTOCOL_CONTROL'||!commentId(e.id)||!commentId(e.generation)||!MODES.includes(e.mode)||!instant(e.effective_at)||!digest(e.protocol_digest))return no('Invalid control envelope');
  if(a.authorized!==true||a.reads_complete!==true||a.chain_unambiguous!==true||e.authorization_reference!==a.authorization_reference||e.controller_run_id!==a.controller_run_id||e.protocol_digest!==a.protocol_digest||!sha(e.repository_commit)||!refs(e.applies_to)||!text(e.rollback_reference)||!text(e.claim_reference))return no('Unverified control authority');
  if(!verifiedRegistry(a)||!refs(a.agent_ids)||!unique(a.agent_ids)||!unique(e.applies_to)||[...e.applies_to].sort().join('\n')!==[...a.agent_ids].sort().join('\n')||e.applies_to.some(id=>!a.registry.agents.some(x=>x.id===id&&x.state!=='retired')))return no('Control target set differs from verified transition membership');
  if(previous){
    const allowed={legacy:['legacy','shadow','rollback'],shadow:['shadow','cutover','rollback'],cutover:['cutover','active','rollback'],active:['active','cutover','rollback'],rollback:['rollback','legacy']};
    if(!allowed[previous.mode]?.includes(e.mode)||e.supersedes!==previous.id||e.id<=previous.id||e.generation<previous.generation||(e.protocol_digest!==previous.protocol_digest&&e.generation<=previous.generation)||Date.parse(e.effective_at)<Date.parse(previous.effective_at))return no('Broken/forked control chain');
  }else if(e.supersedes!==null||e.mode!=='legacy'||a.genesis_authorized!==true)return no('Only authorized legacy genesis starts chain');
  if((e.mode==='active'||(e.mode==='legacy'&&previous?.mode==='rollback'))&&a.transition_gates_verified!==true)return no('Transition/readback/drain gates incomplete');
  return yes('Control targets the actual authorized cohort, without a fixed count');
}
export function validatePacket(p,c){
  if(!object(p)||!object(c)||p.protocol!=='lemma.agent.v3'||p.generation!==c.generation||p.mode!==c.mode||!MODES.includes(p.mode)||!text(p.epoch)||!runId(p.publisher_run_id)||!text(p.publisher_claim)||!text(p.control_reference)||p.control_reference!==c.control_reference||p.protocol_digest!==c.protocol_digest||!digest(p.protocol_digest)||c.control_verified!==true)return no('Packet/control mismatch');
  if(!verifiedRegistry(c)||p.registry_revision!==c.registry.revision||p.registry_digest!==c.registry_digest||!digest(p.registry_digest)||!member(c.registry,p.publisher_agent_id)?.roles.includes('lead-dispatcher'))return no('Unverified registry or dispatcher');
  if(![p.published_at,p.admission_start,p.admission_end].every(instant)||Date.parse(p.published_at)>Date.parse(p.admission_start)||Date.parse(p.admission_end)<=Date.parse(p.admission_start)||!positive(c.max_packet_minutes)||Date.parse(p.admission_end)-Date.parse(p.admission_start)>c.max_packet_minutes*60000)return no('Invalid configured packet window');
  if(!sha(p.repository_commit)||!sha(p.plan_blob)||!text(p.intake_watermark)||!Array.isArray(p.tickets)||(!p.tickets.length&&!text(p.idle_reason)))return no('Incomplete sources or unexplained idle packet');
  const ids=new Set(),instances=new Set();
  for(const t of p.tickets){
    if(!object(t)||!text(t.id)||ids.has(t.id)||!text(t.agent_id)||!text(t.invocation_id)||!ROLES.includes(t.role)||!text(t.playbook)||!text(t.scope)||!text(t.next_action)||!text(t.accepted_revision)||!text(t.task_or_queue)||!refs(t.authority_refs)||!text(t.capability_ref)||!text(t.review_path_ref)||!text(t.continuity_ref)||!FALLBACKS.includes(t.fallback))return no('Invalid/incomplete ticket');
    const key=JSON.stringify([t.agent_id,t.invocation_id]),a=member(c.registry,t.agent_id);
    if(instances.has(key)||!a||!a.roles.includes(t.role)||t.capability_ref!==a.capability_ref)return no('Duplicate invocation or unenrolled/ineligible agent');
    ids.add(t.id);instances.add(key);
    if(![t.admission_start,t.latest_admission].every(instant)||Date.parse(t.admission_start)<Date.parse(p.admission_start)||Date.parse(t.latest_admission)<Date.parse(t.admission_start)||Date.parse(t.latest_admission)>Date.parse(p.admission_end))return no('Invalid invocation admission window');
    if(typeof t.writable!=='boolean'||!strings(t.paths)||(t.writable&&(!t.paths.length||!text(t.branch_or_pr)))||(!t.writable&&!text(t.read_only_reason)))return no('Unspecified write/read-only scope');
  }
  return yes('Variable-capacity advisory packet; no lease or count assumption');
}
export function admitTicket(p,r,c,now){
  const packet=validatePacket(p,c),run=validateRun(r);if(!packet.ok)return packet;if(!run.ok)return run;
  if(!instant(now)||c.mode!=='active'||r.generation!==c.generation||(member(c.registry,r.agent_id)?.kind!==r.kind||member(c.registry,r.agent_id)?.runtime_policy_ref!==r.runtime_policy_ref))return no('Run/mode/enrollment mismatch');
  const t=p.tickets.find(t=>t.agent_id===r.agent_id&&t.invocation_id===r.invocation_id),n=Date.parse(now);
  if(!t||n<Math.max(Date.parse(t.admission_start),Date.parse(r.started_at))||n>Date.parse(t.latest_admission)||n>=Date.parse(p.admission_end)||n>=Date.parse(r.finish_by)-r.handoff_minutes*60000)return no('Wrong invocation or outside admission/new-work boundary');
  return yes('Admitted; own dated claim governs continuation');
}
/** Caller supplies every relevant overlapping claim/release, regardless of agent pool. */
export function resolveClaim({candidate,claims,releases,pr_holder,now,reads_complete,active_generation}){
  if(!reads_complete||!instant(now)||!object(candidate)||!Array.isArray(claims)||!Array.isArray(releases))return no('Incomplete ownership evidence');
  for(const c of [candidate,...claims])if(!object(c)||!commentId(c.id)||!runId(c.run_id)||!text(c.agent_id)||!text(c.scope)||!text(c.accepted_revision)||!commentId(c.generation)||![c.starts_at,c.expires_at,c.run_finish_by].every(instant)||Date.parse(c.expires_at)<=Date.parse(c.starts_at)||Date.parse(c.expires_at)>Date.parse(c.run_finish_by))return no('Malformed claim or actual run ceiling missing');
  if(candidate.generation!==active_generation||Date.parse(now)<Date.parse(candidate.starts_at)||Date.parse(now)>=Date.parse(candidate.expires_at))return no('Candidate generation/time invalid');
  for(const x of releases)if(!object(x)||!commentId(x.claim_id)||!runId(x.run_id)||!instant(x.at))return no('Malformed release');
  const live=claims.filter(c=>Date.parse(c.starts_at)<=Date.parse(now)&&Date.parse(now)<Date.parse(c.expires_at)&&!releases.some(x=>x.claim_id===c.id&&x.run_id===c.run_id&&Date.parse(x.at)>=Date.parse(c.starts_at)&&Date.parse(x.at)<=Date.parse(now)));
  if(live.some(c=>c.generation!==active_generation))return no('Incompatible live writer');
  if(pr_holder&&(!runId(pr_holder.run_id)||!instant(pr_holder.expires_at)))return no('Ambiguous PR holder');
  if(pr_holder&&Date.parse(now)<Date.parse(pr_holder.expires_at))return pr_holder.run_id===candidate.run_id?yes('Existing valid PR holder retained'):no('Existing valid PR holder wins');
  const winner=[candidate,...live].sort((a,b)=>a.id-b.id)[0];return winner.id===candidate.id&&winner.run_id===candidate.run_id?yes('Earliest eligible cooperative claim; recheck before write'):no('Earlier conflicting claim wins');
}
export function mayContinue(e){
  if(!object(e))return no('Missing continuation evidence');const {run,claim,now,generation}=e,valid=validateRun(run);if(!valid.ok)return valid;
  if(!verifiedRegistry(e)||(!member(e.registry,run.agent_id)||member(e.registry,run.agent_id)?.kind!==run.kind||member(e.registry,run.agent_id)?.runtime_policy_ref!==run.runtime_policy_ref)||!object(claim)||claim.agent_id!==run.agent_id||!instant(now)||!instant(claim.starts_at)||!instant(claim.expires_at)||Date.parse(now)<Math.max(Date.parse(run.started_at),Date.parse(claim.starts_at))||claim.run_id!==run.run_id||claim.generation!==generation||run.generation!==generation||Date.parse(claim.expires_at)>Date.parse(run.finish_by)||Date.parse(now)>=Math.min(Date.parse(run.finish_by),Date.parse(claim.expires_at))||!e.holds_clear||!e.revision_current||!e.ownership_verified||e.control_mode!=='active')return no('Continuation authority/hold/revision/deadline invalid');
  return yes('Own claim continues across packet expiry; actual membership/holds still apply');
}
export function evaluateRelease(e){
  if(!object(e)||!sha(e.head_sha)||!sha(e.base_sha)||!text(e.accepted_revision)||e.reads_complete!==true||e.generic_gate_ok!==true)return no('Generic gate or exact evidence missing');
  for(const k of ['ci_identity_verified','attempt_policy_met','acceptance_met','owner_permission_verified','holds_clear','lease_verified','mergeable','dependencies_met','integration_current','verification_assigned'])if(e[k]!==true)return no(`Release prerequisite missing: ${k}`);
  if(!verifiedRegistry(e)||!member(e.registry,e.agent_id)?.roles.includes('release-steward')||e.draft!==false||e.ready!==true||!runId(e.run_id)||!refs(e.evidence_refs)||!strings(e.contributor_runs)||!strings(e.contributor_agents)||!strings(e.merger_runs)||!strings(e.merger_agents)||!Array.isArray(e.verdicts))return no('Missing release/enrollment/provenance evidence');
  const sorted=[...e.verdicts];if(sorted.some(v=>!object(v)||!commentId(v.id)||!instant(v.at)||!['CLEAR','BLOCK'].includes(v.verdict)))return no('Invalid audit chronology');
  sorted.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id-b.id);const v=sorted.at(-1);
  if(!v||v.verdict!=='CLEAR'||v.head_sha!==e.head_sha||v.accepted_revision!==e.accepted_revision)return no('Missing full-head/current-requirement CLEAR or unresolved BLOCK');
  if(!runId(v.run_id)||!member(e.registry,v.agent_id)?.roles.includes('independent-auditor')||v.provenance_verified!==true||!text(v.provenance_ref)||!refs(v.evidence_refs)||e.contributor_runs.includes(v.run_id)||e.contributor_agents.includes(v.agent_id)||e.merger_runs.includes(v.run_id)||e.merger_agents.includes(v.agent_id))return no('Independent reviewer lineage not established');
  return yes('Autonomous supplement passed; refresh exact head before REST squash');
}
