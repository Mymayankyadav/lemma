// Rebuild the synthetic *intent* dataset. No network or user text is used.
// Usage: node scripts/adaptive-writing-dataset.mjs
import {readFile, writeFile} from 'node:fs/promises';
import {makeStudyInput} from '../src/features/tutor/writingAid/vendor/study_input.mjs';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const [phrases, veto, policy, wordAssets, ranks, speedPolicy, wordFile, proofFile] = await Promise.all([
  read('src/features/tutor/writingAid/vendor/legacy/runtime-phrases.json'),
  read('src/features/tutor/writingAid/vendor/legacy/runtime-veto.json'),
  read('src/features/tutor/writingAid/vendor/legacy/policy.json'),
  read('src/features/tutor/writingAid/vendor/word-assets.json'),
  read('src/features/tutor/writingAid/vendor/compact-ranks.json'),
  read('src/features/tutor/writingAid/vendor/speed-policy.json'),
  readFile(new URL('src/features/tutor/writingAid/vendor/wordlist.txt', root), 'utf8'),
  readFile(new URL('docs/implementation/2026-11-21/writing-aid/replay-drafts.jsonl', root), 'utf8'),
]);
const words = [...wordFile.trimEnd().split('\n'), 'preimage', 'preimages'].sort();
const aid = makeStudyInput({phrases, veto, policy, words,
  wordAssets: {...wordAssets, next: Object.assign(Object.create(null), wordAssets.next)},
  ranks: {...ranks, unigram: Object.assign(Object.create(null), ranks.unigram)}, speedPolicy},
{seed: 0, researchPool: true, maxCandidates: 6});

// The contexts, not proof correctness, determine the intended completion. All
// drafts are authored for this experiment. The held-out topic sets are disjoint.
const topics = [
  'the finite set', 'the sample space', 'this matrix', 'the graph', 'the first equation',
  'the sequence', 'the open interval', 'the diagram', 'the original question', 'this mapping',
  'the quotient set', 'the second paragraph', 'the closed ball', 'the final expression', 'the topology',
  'the probability measure', 'the boundary point', 'the induction step', 'the polynomial', 'the integral',
];
const templates = [
  ['explain', 'Could you ', t => ` ${t} once more?`],
  ['explained', 'The notes ', t => ` ${t} in words.`],
  ['explaining', 'I am ', t => ` ${t} in my own words.`],
  ['explanation', 'I need an ', t => ` of ${t}.`],
  ['expression', 'I am checking the ', t => ` for ${t}.`],
  ['example', 'Please give one ', t => ` concerning ${t}.`],
  ['compare', 'I will ', t => ` ${t} with my notes.`],
  ['comparing', 'I am ', t => ` ${t} with my notes.`],
  ['comment', 'Please add a ', t => ` about ${t}.`],
  ['correctly', 'I want to write ', t => ` about ${t}.`],
  ['describe', 'I will ', t => ` ${t} before proving it.`],
  ['described', 'The notes ', t => ` ${t} in detail.`],
  ['describing', 'I am ', t => ` ${t} in my own words.`],
  ['description', 'I need a ', t => ` of ${t}.`],
  ['writing', 'My ', t => ` about ${t} is unfinished.`],
  ['written', 'What I have ', t => ` about ${t} is unfinished.`],
  ['writer', 'The ', t => ` mentions ${t} in the notes.`],
  ['notation', 'Please check the ', t => ` used for ${t}.`],
  ['question', 'I have a ', t => ` about ${t}.`],
  ['questions', 'I have some ', t => ` about ${t}.`],
  ['reading', 'I am ', t => ` the notes on ${t}.`],
  ['statement', 'Please check my ', t => ` about ${t}.`],
  ['statements', 'Please check these ', t => ` about ${t}.`],
  ['numbered', 'I have ', t => ` the steps for ${t}.`],
  ['numbering', 'I am ', t => ` the steps for ${t}.`],
];
// Evaluation uses a different preceding phrase as well as a different topic.
// The completed vocabulary can transfer, but the exact feature rows cannot.
const heldoutBefore = [
  'Please ', 'The book ', 'We are ', 'We need one ', 'I am checking this ',
  'Could you give an ', 'We can ', 'We are ', 'I welcome one ', 'I stated my reasoning ',
  'We can ', 'The book ', 'We are ', 'We need one ', 'The ',
  'This was ', 'Another ', 'Can you check this ', 'We have one ', 'We have several ',
  'We are ', 'Can you check this ', 'Can you check my ', 'I already ', 'We are ',
];
const complete = new Set([...wordAssets.common, 'a', 'an', 'the', 'i', 'we', 'of', 'to', 'in', 'for',
  'with', 'at', 'as', 'on', 'from', 'never', 'none', 'unless', 'nor', 'implied', 'imply', 'then',
  'there', 'therefore', 'conversely', 'greater', 'less', 'zero', 'even', 'odd', 'nonzero', 'rational',
  'integer', 'real', 'preimage', 'preimages']);
const gap = /(?:\b(?:by|because|since|if|then|not|or|and|only|all|for every|witness|choose|let|take|assume|suppose|given|denote|define|equals?|implies|therefore|hence|thus|consequently|belongs to|is a subset of)|[=<>≤≥∈∉⊆⊂≠∀∃⇒⇔¬])\s*$/iu;
const letters = /^[\p{L}\p{M}]+$/u;

// Mirrors the lexical engine's outside-the-vendor checks. This fixture is
// prefiltered; the experiment never introduces candidates after this gate.
function candidates(before, target, initial, mode) {
  if (mode === 'off') return null;
  let last = null;
  for (let n = 1; n < target.length; n++) {
    const prefix = target.slice(0, n);
    const cursor = initial + before + prefix;
    if (complete.has(prefix.toLowerCase()) || (gap.test(initial + before) && n < 5) ||
        (mode === 'strict' && n < 4)) continue;
    const result = aid.predict(before + prefix, {mode, surface: 'keys', origin: 'learner', authoredText: before + prefix});
    const allowed = [];
    for (const {word, kind} of result.keys) {
      if (word.length > 32 || !letters.test(word) || kind === 'transcription' ||
          !word.startsWith(prefix) || word === prefix || allowed.includes(word)) continue;
      if (gap.test(initial + before) && prefix.length / word.length < .6) continue;
      allowed.push(word);
    }
    if (allowed.length > 0) {
      last = {prefix, learnerDraft: cursor, anchor: {text: cursor, start: initial.length},
        candidates: allowed, previous: before.trimEnd().match(/[\p{L}\p{M}]+$/u)?.[0]?.toLowerCase() ?? ''};
      // The simulated learner continues typing until the first offer of their
      // intended word. An unavailable target remains a miss, never an edit.
      if (allowed.includes(target)) return last;
    }
  }
  return last;
}
const cases = [];
for (const [i, [target, before, suffix]] of templates.entries()) {
  for (const [j, topic] of topics.entries()) {
    const initial = '';
    const authoredBefore = j < 10 ? before : heldoutBefore[i];
    const intent = authoredBefore + target + suffix(topic);
    cases.push({id: `t${i}-${j}`, scenario: i, topic: j, split: j < 10 ? 'early' : 'heldout',
      truth: null, initial, intent, intendedWord: target,
      modes: Object.fromEntries(['balanced', 'fast', 'strict', 'off'].map(mode => [mode, candidates(authoredBefore, target, initial, mode)]))});
  }
}
const logicCases = [
  ['Let x be minus one. ', 'The number x is ', 'positive', ' because minus one exceeds zero.', false],
  ['A constant map sends every integer to zero. ', 'The map is ', 'injective', ' because its outputs are equal.', false],
  ['The sequence is constantly one. ', 'The sequence is ', 'convergent', ' with limit zero.', false],
  ['Let f be the identity on the reals. ', 'The function is ', 'continuous', ' at every point.', true],
  ['Let S be the empty set. ', 'The set is ', 'nonempty', ' because it has no elements.', false],
  ['Let n be two. ', 'The value is ', 'negative', ' because two is larger than zero.', false],
];
for (const [i, [initial, before, word, after, truth]] of logicCases.entries()) {
  cases.push({id: `logic-${i}`, scenario: 'proof-logic', split: 'safety', truth, initial,
    intent: initial + before + word + after, intendedWord: word,
    modes: Object.fromEntries(['balanced','fast','strict','off'].map(mode => [mode, candidates(before, word, initial, mode)]))});
}
for (const row of proofFile.trim().split('\n').map(JSON.parse)) {
  const matches = [...row.target.matchAll(/[A-Za-z]{4,}/gu)];
  // One pre-specified opportunity per proof, found in order; correctness is never repaired.
  const modes = Object.fromEntries(['balanced', 'fast', 'strict', 'off'].map(mode => {
    for (const match of matches) {
      const result = candidates(row.target.slice(0, match.index), match[0], row.initial, mode);
      if (result) return [mode, {...result, intendedWord: match[0]}];
    }
    return [mode, null];
  }));
  cases.push({id: row.id, scenario: 'proof', split: 'safety', truth: row.truth,
    initial: row.initial, intent: row.initial + row.target, modes});
}
const fixture = {version: 1, generatedBy: 'scripts/adaptive-writing-dataset.mjs',
  stage: 'provisional: run adaptive-writing-engine-pool.mjs before evaluation',
  provenance: 'Synthetic templates authored for this experiment and the existing synthetic replay-drafts.jsonl; no user data.',
  taskSplit: 'Topics 0–9 occur only before evaluation; topics 10–19 only in evaluation. Proofs are safety-only.', cases};
await writeFile(new URL('docs/implementation/2026-11-21/writing-aid-adaptive/dataset.json', root), JSON.stringify(fixture, null, 2) + '\n');
console.log(JSON.stringify({cases: cases.length, modes: Object.fromEntries(['balanced','fast','strict','off'].map(mode => [mode,
  cases.filter(row => row.modes[mode]).length])), proofs: cases.filter(row => row.split === 'safety').length}));
