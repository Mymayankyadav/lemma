// JSON-lines bridge to the *production* contextual ranker for the Python replay.
import {createInterface} from 'node:readline';
import {createWritingAidModel, scoreWritingAidFeatures, updateWritingAidModel, recordWritingAidVocabulary} from '../src/features/tutor/writingAid/learning';
import type {WritingAidModel, WritingAidFeatures, WritingAidFeedback} from '../src/features/tutor/writingAid/learning';

const models = new Map<string, WritingAidModel>();
const modelFor = (id: string) => {
  let model = models.get(id);
  if (!model) { model = createWritingAidModel(); models.set(id, model); }
  return model;
};
for await (const line of createInterface({input: process.stdin, crlfDelay: Infinity})) {
  try {
    const event = JSON.parse(line) as {id: string; now: number; features?: WritingAidFeatures[];
      strategy?: 'frequency' | 'contextual';
      updates?: Array<{signal: WritingAidFeedback; features: WritingAidFeatures}>; typed?: string; sizes?: boolean};
    const model = modelFor(event.id);
    const start = performance.now();
    for (const update of event.updates ?? []) updateWritingAidModel(model, update.signal, update.features, event.now);
    if (event.typed) recordWritingAidVocabulary(model, event.typed, event.now);
    const scores = (event.features ?? []).map(features => event.strategy ?
      scoreWritingAidFeatures(model, features, event.now, event.strategy) : scoreWritingAidFeatures(model, features, event.now));
    const computeMs = performance.now() - start;
    process.stdout.write(JSON.stringify({scores, computeMs, ...(event.sizes ? {bytes: Buffer.byteLength(JSON.stringify(model))} : {})}) + '\n');
  } catch (error) {
    process.stderr.write(String(error) + '\n');
    process.exitCode = 1;
    break;
  }
}
