import {proposeEdit} from './edits.mjs';
import {complete, completionCertificate} from './complete.mjs';
/** Sparse candidate guard. Scores are raw logits; higher is safer. */
const words = s => (String(s ?? '').toLowerCase().match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || []);
export function guardFeatures(row, window = 8, model = {}) {
  const out = Object.create(null);
  const add = k => { out[k] = (out[k] || 0) + 1; };
  const surface = String(row.surface || '');
  add('surface=' + surface);
  function field(name, tokens) {
    add(name + ':len=' + Math.min(tokens.length, 12));
    for (let i = 0; i < tokens.length; i++) {
      add(name + ':w=' + tokens[i]);
      add(surface + '|' + name + ':w=' + tokens[i]);
      if (i) add(name + ':bi=' + tokens[i-1] + ' ' + tokens[i]);
    }
  }
  const src = words(row.source), prop = words(row.proposal);
  const before = words(row.before), after = words(row.after);
  field('source', src); field('proposal', prop);
  field('before', window ? before.slice(-window) : []);
  field('after', window ? after.slice(0, window) : []);
  add('source:raw=' + String(row.source || '').toLowerCase().slice(0, 160));
  add('proposal:raw=' + String(row.proposal || '').toLowerCase().slice(0, 160));
  add(surface + '|pair=' + String(row.source || '').toLowerCase().slice(0, 80) + '→' + String(row.proposal || '').toLowerCase().slice(0, 80));
  if (src.length && prop.length && src.join(' ') === prop.join(' ')) add('same_tokens');
  const a = String(row.source || '').toLowerCase(), b = String(row.proposal || '').toLowerCase();
  if (a && b) {
    if (a === b) add('transform=identity');
    if (b.startsWith(a)) add('transform=prefix_completion');
    if (a.startsWith(b)) add('transform=deletion');
    const aa = [...a], bb = [...b];
    if (aa.length <= 80 && bb.length <= 80) {
      let prev = Array.from({length: bb.length + 1}, (_, i) => i);
      for (let i = 1; i <= aa.length; i++) {
        const next = [i];
        for (let j = 1; j <= bb.length; j++) next[j] = Math.min(next[j-1]+1, prev[j]+1, prev[j-1]+(aa[i-1] === bb[j-1] ? 0 : 1));
        prev = next;
      }
      const d = prev[bb.length];
      add('edit_distance=' + Math.min(d, 5));
      add(surface + '|edit_distance=' + Math.min(d, 5));
      add('edit_ratio=' + Math.min(4, Math.floor(5*d/Math.max(1, aa.length, bb.length))));
    }
  }
  const neg = /(?:\b(?:not|no|never|false|cannot|neither)\b|[≠∉])/u;
  const rel = /(?:[=<>≤≥≠∈∉⊆⊂∧∨→↔+−×/]|\b(?:equals?|less|greater|implies|and|or|union|intersection)\b)/u;
  const relationAliases = new Map([
    ['<=','le'], ['≤','le'], ['>=','ge'], ['≥','ge'], ['!=','ne'], ['≠','ne'],
    ['=','eq'], ['equals','eq'], ['<','lt'], ['>','gt'], ['∈','in'], ['∉','notin'],
    ['⊆','subseteq'], ['∪','union'], ['∩','intersection'], ['→','implies'],
    ['↔','iff'], ['and','and'], ['∧','and'], ['or','or'], ['∨','or'],
    ['+','plus'], ['plus','plus'], ['−','minus'], ['minus','minus']
  ]);
  const ar = relationAliases.get(a.trim()), br = relationAliases.get(b.trim());
  if (ar && br) add('transform=relation_' + (ar === br ? 'alias' : 'change'));
  if (ar && br) add(surface + '|relation_' + (ar === br ? 'alias' : 'change'));
  if (src.length && prop.length && src[0] === prop.at(-1) && src.at(-1) === prop[0] && src.length > 1) add('transform=reversed_endpoints');
  if (surface === 'ghost' && /^(?:i (?:will|want to|should)|next i (?:will|can))\b/i.test(a)) add('ghost=student_plan_prefix');
  if (surface === 'ghost' && /^(?:therefore|thus|we conclude|i conclude|it follows|the (?:claim|function|set))\b/i.test(a)) add('ghost=claim_prefix');
  if (neg.test(a) !== neg.test(b)) add('transform=negation_difference');
  if (rel.test(a) || rel.test(b)) add('transform=relation_present');
  if (rel.test(a) !== rel.test(b)) add('transform=relation_form_change');
  if (/\b(?:injective|surjective|continuous|bounded|compact|converges?|witness|induction|contradiction)\b/u.test(b)) add('proposal=math_claim_term');

  // Evidence features verify only exact transcription against the current
  // learner prefix; the classifier still decides whether to veto the candidate.
  if (surface === 'blue' || surface === 'red') {
    const edit = proposeEdit({surface, before:String(row.before || ''), span:String(row.source || ''), after:String(row.after || '')}, {blueMode:'review', redMode:'extended'});
    if (edit) {
      add('evidence=edit_source_eligible');
      if (edit.proposal === row.proposal) add('evidence=exact_edit');
      else add('evidence=edit_candidate_mismatch');
    }
  } else if (surface === 'keys' || surface === 'ghost') {
    const text = String(row.before || '') + String(row.source || '');
    const cfg = {keysMinChars:0, ghostMinWords:0, ghostMargin:0, scope:row.scope ?? model.scope ?? 'line'};
    const opts = {surface, origin:row.origin ?? 'learner', pinned:row.pinned ?? null, authoredText:row.authoredText};
    const result = complete(text, opts, model, cfg);
    const eligible = surface === 'keys' ? result.keys.length > 0 : !!result.ghost;
    if (eligible) {
      add('evidence=completion_source_eligible');
      if (completionCertificate({...row, origin:opts.origin}, model, cfg)) add('evidence=exact_completion');
      else add('evidence=completion_candidate_mismatch');
    }
  }
  if (window && before.length) add(surface + '|before_last=' + before.at(-1));
  if (window && after.length) add(surface + '|after_first=' + after[0]);
  return out;
}
// Use the pooled cutoff by default; surface thresholds require independent
// validation in the caller's gated population.
export function guardCutoff(row, model, perSurface = false) {
  return perSurface ? (model.surface_cutoffs?.[row.surface] ?? model.cutoff) : model.cutoff;
}
export function guardLogit(row, model, window = model.window) {
  const features = guardFeatures(row, window, model), weights = model.weights || {};
  let score = Number(model.intercept || 0);
  for (const [key, value] of Object.entries(features)) score += (weights[key] || 0) * value;
  return score;
}
