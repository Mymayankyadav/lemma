// Create any label from ci/labels.json that is missing. Idempotent.
import { ensureLabels } from './gh.mjs';
import { readJson } from './lib.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureLabels(readJson('ci/labels.json')).then(() => console.log('labels ok')).catch((e) => { console.error(e); process.exit(1); });
}
