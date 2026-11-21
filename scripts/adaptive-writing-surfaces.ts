// Smoke checks for full proposal identity and signed feedback on four surfaces.
// This does not simulate user behavior or establish surface-level accuracy.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createWritingAidModel, recordWritingAidVocabulary, scoreWritingAidFeatures,
  updateWritingAidModel, writingAidFeatures, type WritingAidFeatures, type WritingAidFeedback} from '../src/features/tutor/writingAid/learning';
import type {WritingAidProposal} from '../src/features/tutor/writingAid/policy';

const now = 1_700_000_000_000;
const feature = (kind: WritingAidFeatures['kind'], candidate: string): WritingAidFeatures =>
  ({kind, candidate, previous: 'please', prefix: 'th', mode: 'balanced'});
const pairs: Array<[WritingAidFeatures['kind'], string, string]> = [
  ['word', 'compare', 'comment'],
  ['ghost', 'of the set', 'of the group'],
  ['correction', 'the sequence', 'the sequences'],
  ['replace', '≤', '≥'],
];
const checked: string[] = [];
for (const [kind, accepted, other] of pairs) {
  const model = createWritingAidModel();
  const a = feature(kind, accepted), b = feature(kind, other);
  updateWritingAidModel(model, 'accept', a, now);
  assert(scoreWritingAidFeatures(model, a, now) > 0, `${kind} did not learn acceptance`);
  // Context and shape can be shared; item identity itself must stay distinct.
  assert.equal(scoreWritingAidFeatures(model, b, now, 'frequency'), 0, `${kind} confused item identities`);
  assert(scoreWritingAidFeatures(model, a, now) > scoreWritingAidFeatures(model, b, now),
    `${kind} did not prefer the accepted alternative`);
  assert.equal(scoreWritingAidFeatures(model, feature(kind === 'word' ? 'ghost' : 'word', accepted), now), 0,
    `${kind} leaked credit to a different surface`);
  updateWritingAidModel(model, 'undo', a, now + 1000);
  assert(scoreWritingAidFeatures(model, a, now + 1000) < 0, `${kind} did not learn undo`);
  assert(scoreWritingAidFeatures(model, a, now + 1000) < scoreWritingAidFeatures(model, b, now + 1000),
    `${kind} did not down-rank the undone alternative`);
  checked.push(kind);
}
const rewards: Record<WritingAidFeedback, number> = {
  refresh: -1, accept: 1, kept: 1, undo: -1, 'partial-edit': -1,
  'continued-match': 1, divergent: -1, alternate: -1, dismiss: -1, 'personal-use': 1,
};
for (const [signal, sign] of Object.entries(rewards) as Array<[WritingAidFeedback, number]>) {
  const model = createWritingAidModel(), f = feature('word', 'compare');
  updateWritingAidModel(model, signal, f, now);
  assert.equal(Math.sign(scoreWritingAidFeatures(model, f, now)), sign, `wrong sign: ${signal}`);
}
const model = createWritingAidModel();
updateWritingAidModel(model, 'accept', feature('word', 'compare'), now);
assert.equal(Object.keys(model.vocabulary).length, 0, 'accepted completion was treated as typed vocabulary');
recordWritingAidVocabulary(model, 'compare', now + 3000);
assert.equal(model.vocabulary.compare.uses, 1);
const proposal = {
  kind: 'ghost', start: 25, before: '', label: 'of the group', insert: 'of the group',
  snapshot: {mode: 'balanced', anchor: {text: 'I typed this', start: 0,
    continuation: 'I typed this generated words'}},
} as unknown as WritingAidProposal;
const derived = writingAidFeatures(proposal);
assert.equal(derived.previous, 'this', 'generated continuation became authored context');
assert.equal(derived.candidate, 'of the group');
const result = {scope: 'Production scorer/feature identity smoke checks; not a behavioral accuracy trial.',
  surfaces: checked, feedbackSignsChecked: Object.keys(rewards), separateSurfaceIdentity: true,
  acceptedCompletionNotVocabulary: true, generatedContinuationNotAuthoredContext: true};
await writeFile('docs/implementation/2026-11-21/writing-aid-adaptive/surfaces.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
