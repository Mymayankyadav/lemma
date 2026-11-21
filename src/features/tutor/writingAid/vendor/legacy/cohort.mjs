import {complete, completionCertificate, observation, countOutputTokens} from './complete.mjs';
import {editCertificate, proposeEdit} from './edits.mjs';
import {guardLogit} from './linear_guard.mjs';

const empty = () => ({keys: [], ghost: null});
const files = ['runtime-phrases.json', 'runtime-veto.json', 'policy.json'];

function permitted(row) {
  return (row.origin ?? 'learner') === 'learner' && !row.composing && !row.kept &&
    !row.selection?.multiple && row.selection?.isCollapsed !== false;
}

function editable(row) {
  if (!permitted(row) || !['blue', 'red'].includes(row.surface) ||
      typeof row.before !== 'string' || typeof row.after !== 'string' || typeof row.span !== 'string' ||
      row.before.length + row.after.length > 16000 || row.span.length > 48) return false;
  // A substring of another operator, a code escape or an inflected word has no
  // independent editing authority. Keep signed decimal and LaTeX boundaries.
  if (/^[<=>!\-]+$/.test(row.span) && (/[<=>!\-]$/.test(row.before) || /^[<=>!\-]/.test(row.after))) return false;
  if (row.before.endsWith('\\') && row.span.startsWith('\\')) return false;
  return true;
}

export function makeCohort(phrases, veto, config) {
  veto = {...veto, phrases:phrases.phrases};
  function certificate(row) {
    if (!permitted(row)) return false;
    if (['keys','ghost'].includes(row.surface)) return completionCertificate(row, phrases, config);
    const input = {...row, span: row.source};
    return editable(input) && countOutputTokens(row.proposal.trim()) === 1 &&
      editCertificate(input, row.proposal, config);
  }

  function judge(row) {
    // Both computations are deliberately observable separately in the offline evaluator.
    const certified = certificate(row);
    const logit = guardLogit({...row, scope:config.scope}, veto);
    const passed = Number.isFinite(logit) && logit >= veto.cutoff;
    return {certified, logit, passed, accepted: certified && (passed || config.studyAblation === 'certificate-only')};
  }

  function edit(row) {
    if (!editable(row)) return null;
    const item = proposeEdit(row, config);
    if (!item) return null;
    const decision = judge({...row, source:item.source, proposal:item.proposal});
    return decision.accepted ? item : null;
  }

  function predict(text, options={}) {
    const opts = {origin:'learner', surface:'keys', ...options};
    if (typeof text !== 'string' || !permitted(opts) || opts.after ||
        !['keys', 'ghost'].includes(opts.surface)) return empty();
    const offer = complete(text, opts, phrases, config);
    if (!(offer.keys?.length || offer.ghost)) return empty();
    const observed = observation(text, opts.surface, phrases, config);
    const row = {...opts, ...observed, after:''};
    if (opts.surface==='keys') {
      const keys=offer.keys.filter(({word})=>countOutputTokens(word)===1 &&
        judge({...row,proposal:word}).accepted);
      return {keys, ghost:null};
    }
    return {keys:[], ghost:offer.ghost && judge({...row,proposal:offer.ghost.suffix}).accepted ? offer.ghost : null};
  }

  return {predict, edit, judge, config};
}

export async function createCohort() {
  const assets = await Promise.all(files.map(async file => {
    const response = await fetch(new URL(file, import.meta.url));
    if (!response.ok) throw new Error('Could not load ' + file);
    return response.json();
  }));
  return makeCohort(...assets);
}
