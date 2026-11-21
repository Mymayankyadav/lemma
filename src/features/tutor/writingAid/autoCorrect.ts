import {padEdit, type PadEdit} from '../../pad/padEdit';
import {tutorMathContext} from '../input/symbolEdit';
import type {EditTarget} from '../input/types';
import {WRITING_AID_LIMIT, type WritingAidAnchor, type WritingAidMode} from './policy';
import {writingAutoTrustQualified, type WritingAutoTrust} from './learning';

export interface WritingAutoCorrectionRequest {
  readonly before: PadEdit;
  readonly after: PadEdit;
  readonly anchor: WritingAidAnchor | null;
  readonly target: EditTarget;
  readonly mode: WritingAidMode;
  readonly enabled: boolean;
  readonly composing: boolean;
  readonly readOnly: boolean;
  /** The caller must establish direct native insertText or a custom typed key. */
  readonly inputType: string;
  readonly trust?: WritingAutoTrust;
}

export interface WritingAutoCalibration {
  readonly ruleId: string;
  readonly sampleSize: number;
  readonly correct: number;
  readonly artifact: string;
  readonly population: 'synthetic' | 'human';
  readonly heldoutSampleSize?: number;
  readonly heldoutCorrect?: number;
  readonly artifactSha256?: string;
  readonly protocolSha256?: string;
}
export interface WritingAutoCorrection {
  readonly source: string;
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
  readonly typed: PadEdit;
  readonly corrected: PadEdit;
  readonly target: EditTarget;
  readonly mode: WritingAidMode;
  readonly ruleId: string;
  readonly calibration: WritingAutoCalibration & {readonly precisionLowerBound: number; readonly confidence: .95};
}

/** Fixed surface-typo classes only; learned scores do not authorize edits. */
const RULES: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  teh: ['teh-to-the', 'the'],
  recieve: ['recieve-to-receive', 'receive'],
  recieved: ['recieved-to-received', 'received'],
  seperate: ['seperate-to-separate', 'separate'],
});

// Preregistered synthetic k=2 personal-history sensitivity. These are not
// estimates of human precision. Production requires both independent bounds
// and a locally established, revocable history for this exact pair.
const ARTIFACT = 'docs/implementation/2026-11-21/writing-aid-tutor/personal-results.json';
const ARTIFACT_SHA = 'af910d36de137e74fe81809506c6655bd82144cb23202d982de0a90db8baf905';
const PROTOCOL_SHA = '22fc0327026ad64561b41ac34ea8f1cebabdb054336266baf6b3ed943494079d';
export const WRITING_AUTO_CALIBRATION: readonly WritingAutoCalibration[] = Object.freeze([
  {ruleId: 'teh-to-the', sampleSize: 730, correct: 727, heldoutSampleSize: 755, heldoutCorrect: 754},
  {ruleId: 'recieve-to-receive', sampleSize: 745, correct: 745, heldoutSampleSize: 725, heldoutCorrect: 724},
  {ruleId: 'recieved-to-received', sampleSize: 732, correct: 730, heldoutSampleSize: 758, heldoutCorrect: 755},
  {ruleId: 'seperate-to-separate', sampleSize: 764, correct: 762, heldoutSampleSize: 757, heldoutCorrect: 756},
].map(row => ({...row, artifact: ARTIFACT, population: 'synthetic' as const,
  artifactSha256: ARTIFACT_SHA, protocolSha256: PROTOCOL_SHA})));
export const WRITING_AUTO_MIN_SAMPLES = 200;
export const WRITING_AUTO_MIN_PRECISION_LOWER_BOUND = .98;

/** Two-sided 95% Wilson score lower bound on the class's measured precision. */
export function writingAutoPrecisionLowerBound(correct: number, total: number): number {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0 || correct < 0 || correct > total) return 0;
  const z = 1.959963984540054, p = correct / total, z2 = z * z;
  return (p + z2 / (2 * total) - z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / (1 + z2 / total);
}

export function writingAutoRuleIdForPair(source: string, replacement: string): string | null {
  const rule = RULES[source];
  return rule && rule[1] === replacement ? rule[0] : null;
}

const AT_END = (edit: PadEdit) => edit.start === edit.end && edit.end === edit.text.length;
const LITERAL_OR_MATH = /[`"“”‘’$\\_{}\[\]<>≤≥≠∈∉⊆⊂∀∃⇒⇔¬=+*/^|~\d]|\b(?:literal|verbatim|identifier|username|password|code|search|named|called|label|symbol|variable|denote|define|let|take|choose|assume|suppose|proof|theorem|lemma|equation|formula|not|never|unless|every|all|only)\b/iu;

/** Evaluation can inject measured rows; production calls only the installed rows below. */
export function evaluateWritingAutoCorrection(
  input: WritingAutoCorrectionRequest, evidence: readonly WritingAutoCalibration[],
): WritingAutoCorrection | null {
  const {before, after, anchor, target, mode, enabled, composing, readOnly, inputType} = input;
  if (!enabled || mode === 'off' || composing || readOnly || inputType !== 'insertText' ||
      !anchor || anchor.continuation || anchor.text !== before.text || !AT_END(before) || !AT_END(after) ||
      after.text.length !== before.text.length + 1 || !after.text.startsWith(before.text) ||
      !/^[ \t.,;!?]$/u.test(after.text.slice(before.text.length)) || after.text.length > WRITING_AID_LIMIT) return null;
  const token = before.text.match(/[a-z]+$/u)?.[0], rule = token && RULES[token];
  if (!token || !rule) return null;
  const start = before.text.length - token.length, end = before.text.length;
  if (start < anchor.start || !Number.isInteger(anchor.start) || anchor.start < 0 ||
      /[\p{L}\p{M}\p{N}_]/u.test(before.text.slice(start - 1, start)) ||
      tutorMathContext(padEdit(before.text, start, end)) !== 'prose') return null;
  const line = before.text.slice(before.text.lastIndexOf('\n') + 1);
  const left = line.slice(0, line.length - token.length);
  // Require a prose lead-in. A bare token may be a learner's variable or label.
  if (!/[\p{L}\p{M}]/u.test(left) || LITERAL_OR_MATH.test(line) ||
      /(?:^|\s)'[^']*$/u.test(line) || /(?:^|\s)(?:tutor|assistant|solution|prompt)\s*:/iu.test(line) ||
      /(?:^|\s)[b-hj-z](?:\s+)$/u.test(left)) return null;
  const calibration = evidence.find(item => item.ruleId === rule[0]);
  if (!calibration || !calibration.artifact || !['synthetic', 'human'].includes(calibration.population) ||
      !Number.isInteger(calibration.sampleSize) || calibration.sampleSize < WRITING_AUTO_MIN_SAMPLES) return null;
  let precisionLowerBound = writingAutoPrecisionLowerBound(calibration.correct, calibration.sampleSize);
  if (calibration.heldoutSampleSize !== undefined || calibration.heldoutCorrect !== undefined) {
    if (!Number.isInteger(calibration.heldoutSampleSize) || calibration.heldoutSampleSize! < WRITING_AUTO_MIN_SAMPLES ||
        !Number.isInteger(calibration.heldoutCorrect)) return null;
    precisionLowerBound = Math.min(precisionLowerBound,
      writingAutoPrecisionLowerBound(calibration.heldoutCorrect!, calibration.heldoutSampleSize!));
  }
  if (precisionLowerBound < WRITING_AUTO_MIN_PRECISION_LOWER_BOUND) return null;
  const corrected = padEdit(before.text.slice(0, start) + rule[1] + after.text.slice(end));
  if (corrected.text.length > WRITING_AID_LIMIT) return null;
  return {source: token, start, end, replacement: rule[1], typed: after, corrected, target: {...target}, mode,
    ruleId: rule[0], calibration: {...calibration, precisionLowerBound, confidence: .95}};
}

export function detectWritingAutoCorrection(input: WritingAutoCorrectionRequest): WritingAutoCorrection | null {
  const candidate = evaluateWritingAutoCorrection(input, WRITING_AUTO_CALIBRATION);
  if (!candidate || !candidate.calibration.heldoutSampleSize || !candidate.calibration.artifactSha256 ||
      !writingAutoTrustQualified(input.trust, candidate.ruleId)) return null;
  return candidate;
}
