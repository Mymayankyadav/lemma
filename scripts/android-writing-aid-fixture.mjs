import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {packTutorWritingReply} from '../supabase/functions/_shared/tutor-writing.ts';

// This fixture exists only in the separately identified writing-aid test APK.
// The visible wording is intentionally neutral; the keyboard still applies
// its normal source, role and learner-prefix checks before offering anything.
export const demoStartPath = '/lemma/?demo=1#/p/real-analysis/cp/CP4/tutor';
const key = ['default', 'real-analysis', 'project-analysis-cp-4'];
const turnId = 'writing-aid-test-turn', messageId = 'writing-aid-test-reply';
const wording = 'The question asks about the original wording of the previous sentence';
const given = 'In this sample, x and ε are named symbols.';
const packet = packTutorWritingReply({
  body: `Demo tutor sample for testing writing assistance.\n\n${wording}.\n\n${given}`,
  writingAid: {version: 1, revision: 'writing-aid-test-sample', signals: [
    {id: 'sample-wording', sourceId: messageId, role: 'suggested-wording', text: wording},
    {id: 'sample-given', sourceId: messageId, role: 'given', text: given, variables: ['x'], symbols: ['ε']},
  ]},
});
if (typeof packet.body !== 'string' || !packet.body.includes('```lemma-writing-v1')) {
  throw new Error('The sample writing metadata did not pass the shared packer');
}
const threadId = JSON.stringify(key);
const thread = {
  head: {threadId, lastSequence: 1, pendingTurnId: null},
  turns: [{id: turnId, threadId, sequence: 1, version: 2, status: 'completed',
    snapshot: {question: 'Show me a sample writing suggestion.', selectedContext: []},
    finalReply: {turnId, messageId, body: packet.body,
      provenance: {kind: 'connector', reportedHost: null, hostVerified: false}, citations: [], suggestions: []}}],
  recoveredDrafts: [],
};

export function installDemoWritingAidFixture(webRoot) {
  const page = readFileSync(join(webRoot, 'index.html'), 'utf8');
  if (readFileSync(join(webRoot, 'lemma/index.html'), 'utf8') !== page) {
    throw new Error('The Android launch pages differ before fixture staging');
  }
  const entries = [...page.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)];
  if (entries.length !== 1) throw new Error('Expected exactly one Android app entry module');
  const entry = entries[0][1];
  const stagedPage = page.replace(entries[0][0], '<script type="module" src="/lemma/writing-aid-test-bootstrap.js"></script>');
  writeFileSync(join(webRoot, 'index.html'), stagedPage);
  writeFileSync(join(webRoot, 'lemma/index.html'), stagedPage);
  const bootstrap = `// Test APK only: seed one local demo thread before starting the real app.\n` +
    `const key = ${JSON.stringify(key)}, thread = ${JSON.stringify(thread)};\n` +
    `async function seed() {\n` +
    `  if (new URLSearchParams(location.search).get('demo') !== '1') return;\n` +
    `  const db = await new Promise((resolve, reject) => {\n` +
    `    const request = indexedDB.open('lemma-demo-tutor', 1);\n` +
    `    request.onupgradeneeded = () => request.result.createObjectStore('checkpoint-threads');\n` +
    `    request.onerror = () => reject(request.error);\n` +
    `    request.onblocked = () => reject(new Error('Demo thread database is blocked'));\n` +
    `    request.onsuccess = () => resolve(request.result);\n` +
    `  });\n` +
    `  try { await new Promise((resolve, reject) => {\n` +
    `    const tx = db.transaction('checkpoint-threads', 'readwrite'), store = tx.objectStore('checkpoint-threads');\n` +
    `    const request = store.get(key);\n` +
    `    request.onsuccess = () => { if (request.result === undefined) store.add(thread, key); };\n` +
    `    tx.oncomplete = resolve;\n` +
    `    tx.onabort = tx.onerror = () => reject(tx.error);\n` +
    `  }); } finally { db.close(); }\n` +
    `}\n` +
    `seed().catch(error => console.warn('Could not prepare the sample demo thread', error))\n` +
    `  .then(() => import(${JSON.stringify(entry)}));\n`;
  writeFileSync(join(webRoot, 'lemma/writing-aid-test-bootstrap.js'), bootstrap);
}
