import {createAdaptation, learnedRank, localCalibrationEstimate, parseAdaptation, type WritingAdaptation} from './adaptation';
import type {WritingAidMode, WritingAidProposal} from './policy';

/** Only short lexical features are retained; the draft itself is never stored. */
export interface WritingAidFeatures {
  readonly kind: WritingAidProposal['kind'];
  readonly candidate: string;
  readonly previous: string;
  readonly prefix: string;
  readonly mode: WritingAidMode;
}

export type WritingAidFeedback = 'refresh' | 'accept' | 'kept' | 'undo' | 'partial-edit' |
  'continued-match' | 'divergent' | 'alternate' | 'dismiss' | 'personal-use';

type Weight = {value: number; at: number};
type Vocabulary = {uses: number; at: number; observations: number};
export interface WritingAidModel {
  version: 1;
  weights: Record<string, Weight>;
  vocabulary: Record<string, Vocabulary>;
  adaptation: WritingAdaptation;
}

const DAY = 24 * 60 * 60 * 1000;
const HALF_LIFE = 30 * DAY;
const VOCABULARY_HALF_LIFE = 180 * DAY;
const MAX_WEIGHTS = 512;
const MAX_VOCABULARY = 128;
const MAX_VALUE = 3;
const REWARD: Readonly<Record<WritingAidFeedback, number>> = {
  refresh: -.7, accept: 1, kept: .35, undo: -1.5, 'partial-edit': -.6,
  'continued-match': .16, divergent: -.08, alternate: -.2, dismiss: -.45, 'personal-use': .14,
};

const lexical = (value: string) => (value.toLocaleLowerCase().match(/[\p{L}\p{M}]+/u)?.[0] ?? '').slice(0, 32);
// Preserve the full short phrase or symbol's identity without retaining it as text.
function candidateIdentity(features: WritingAidFeatures): string {
  if (features.kind === 'word') return lexical(features.candidate);
  const text = features.candidate.trim().toLocaleLowerCase().slice(0, 64);
  if (!text) return '';
  let a = 2166136261, b = 2246822519;
  for (let index = 0; index < text.length; index++) {
    a = Math.imul(a ^ text.charCodeAt(index), 16777619);
    b = Math.imul(b ^ text.charCodeAt(index), 3266489917);
  }
  return 'h' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
const bucket = (length: number) => length === 0 ? '0' : length <= 3 ? '1' : length <= 6 ? '2' : '3';
const decay = (value: number, at: number, now: number, halfLife = HALF_LIFE) =>
  value * Math.pow(.5, Math.max(0, now - at) / halfLife);
const clamp = (value: number, max: number) => Math.max(-max, Math.min(max, value));

export function createWritingAidModel(): WritingAidModel {
  return {version: 1, weights: Object.create(null) as Record<string, Weight>,
    vocabulary: Object.create(null) as Record<string, Vocabulary>, adaptation: createAdaptation()};
}

/** Features derive only from the learner-authored portion of the current draft. */
export function writingAidFeatures(proposal: WritingAidProposal): WritingAidFeatures {
  const {anchor, mode} = proposal.snapshot;
  const typed = anchor ? anchor.text.slice(anchor.start, Math.min(anchor.text.length, proposal.start)) : '';
  return {kind: proposal.kind, candidate: proposal.label, prefix: proposal.before,
    previous: typed.match(/[\p{L}\p{M}]+(?=\s*[^\p{L}\p{M}]*$)/u)?.[0] ?? '', mode};
}

function featureKeys(features: WritingAidFeatures): readonly (readonly [string, number])[] {
  const candidate = candidateIdentity(features), previous = lexical(features.previous);
  const kind = features.kind;
  const keys: Array<readonly [string, number]> = [
    ['kind:' + kind, .1],
    ['shape:' + kind + ':' + bucket(lexical(features.prefix).length) + ':' + bucket(candidate.length), .25],
  ];
  if (candidate) keys.push(['item:' + kind + ':' + candidate, 1]);
  if (previous) keys.push(['context:' + kind + ':' + previous, .2]);
  if (previous && candidate) keys.push(['pair:' + kind + ':' + previous + ':' + candidate, 1.2]);
  return keys;
}

/** Incremental contextual scorer; it cannot make an ineligible candidate eligible. */
export function scoreWritingAidFeatures(
  model: WritingAidModel, features: WritingAidFeatures, now = Date.now(), strategy: 'frequency' | 'contextual' = 'contextual',
): number {
  let result = 0;
  for (const [key, factor] of featureKeys(features)) {
    if (strategy === 'frequency' && !key.startsWith('item:')) continue;
    const weight = model.weights[key];
    if (weight) result += factor * decay(weight.value, weight.at, now);
  }
  return result;
}

export function scoreWritingAidProposal(model: WritingAidModel, proposal: WritingAidProposal, now = Date.now()): number {
  return proposal.score === undefined ? scoreWritingAidFeatures(model, writingAidFeatures(proposal), now) :
    .15 * scoreWritingAidFeatures(model, writingAidFeatures(proposal), now) + learnedRank(model.adaptation, proposal) +
    .3 * (localCalibrationEstimate(model.adaptation, proposal, 'retain', .5) - .5);
}

/** Bounded, decayed online updates let recent explicit choices outweigh old habits. */
export function updateWritingAidModel(
  model: WritingAidModel, signal: WritingAidFeedback, features: WritingAidFeatures, now = Date.now(),
): void {
  const reward = REWARD[signal];
  if (!Number.isFinite(reward) || !Number.isFinite(now)) return;
  for (const [key, factor] of featureKeys(features)) {
    const previous = model.weights[key];
    const value = previous ? decay(previous.value, previous.at, now) : 0;
    model.weights[key] = {value: clamp(value + .35 * reward * factor, MAX_VALUE), at: now};
  }
  const keys = Object.keys(model.weights);
  if (keys.length > MAX_WEIGHTS) {
    keys.sort((a, b) => Math.abs(decay(model.weights[a].value, model.weights[a].at, now)) -
      Math.abs(decay(model.weights[b].value, model.weights[b].at, now)) || model.weights[a].at - model.weights[b].at);
    for (const key of keys.slice(0, keys.length - MAX_WEIGHTS)) delete model.weights[key];
  }
}

/** Count completed, directly typed words only. Accepted completions are not evidence. */
export function recordWritingAidVocabulary(model: WritingAidModel, word: string, now = Date.now()): void {
  if (!/^[\p{L}\p{M}]{4,32}$/u.test(word) || !Number.isFinite(now)) return;
  const key = lexical(word);
  const prior = model.vocabulary[key];
  const uses = prior ? decay(prior.uses, prior.at, now, VOCABULARY_HALF_LIFE) : 0;
  model.vocabulary[key] = {uses: Math.min(30, uses + 1), at: now, observations: Math.min(30, (prior?.observations ?? 0) + 1)};
  const keys = Object.keys(model.vocabulary);
  if (keys.length > MAX_VOCABULARY) {
    keys.sort((a, b) => decay(model.vocabulary[a].uses, model.vocabulary[a].at, now, VOCABULARY_HALF_LIFE) -
      decay(model.vocabulary[b].uses, model.vocabulary[b].at, now, VOCABULARY_HALF_LIFE));
    for (const stale of keys.slice(0, keys.length - MAX_VOCABULARY)) delete model.vocabulary[stale];
  }
}

export function writingAidVocabularyStrength(entry: Vocabulary, now = Date.now()): number {
  return decay(entry.uses, entry.at, now, VOCABULARY_HALF_LIFE);
}

/** Ignore malformed, oversized or stale storage rather than trusting it as a model. */
export function parseWritingAidModel(value: unknown): WritingAidModel {
  const model = createWritingAidModel();
  if (!value || typeof value !== 'object') return model;
  const stored = value as Record<string, unknown>;
  if (stored.version !== 1 || !stored.weights || typeof stored.weights !== 'object' ||
      !stored.vocabulary || typeof stored.vocabulary !== 'object') return model;
  for (const [key, raw] of Object.entries(stored.weights).slice(0, MAX_WEIGHTS)) {
    if (!/^(?:kind|shape|item|context|pair):[\p{L}\p{M}\d:]+$/u.test(key) || key.length > 100 ||
        !raw || typeof raw !== 'object') continue;
    const {value: weight, at} = raw as Record<string, unknown>;
    if (typeof weight === 'number' && Number.isFinite(weight) && typeof at === 'number' && Number.isFinite(at)) {
      model.weights[key] = {value: clamp(weight, MAX_VALUE), at: Math.min(at, Date.now())};
    }
  }
  for (const [key, raw] of Object.entries(stored.vocabulary).slice(0, MAX_VOCABULARY)) {
    if (!/^[\p{L}\p{M}]{4,32}$/u.test(key) || !raw || typeof raw !== 'object') continue;
    const {uses, at, observations} = raw as Record<string, unknown>;
    if (typeof uses === 'number' && Number.isFinite(uses) && uses > 0 && typeof at === 'number' && Number.isFinite(at)) {
      const count = typeof observations === 'number' && Number.isFinite(observations) ? observations : Math.ceil(uses);
      model.vocabulary[key] = {uses: Math.min(30, uses), at: Math.min(at, Date.now()), observations: Math.min(30, Math.max(0, count))};
    }
  }
  model.adaptation = parseAdaptation(stored.adaptation);
  return model;
}
