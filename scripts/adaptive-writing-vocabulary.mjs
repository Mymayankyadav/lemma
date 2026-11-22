// Exercise actual personal-vocabulary eligibility and decay through the engine.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const directory = 'docs/implementation/2026-11-21/writing-aid-adaptive';
const data = JSON.parse(await readFile(`${directory}/dataset.json`, 'utf8'));
for (const [source, expected] of Object.entries(data.sourceSha256)) {
  if (createHash('sha256').update(await readFile(source)).digest('hex') !== expected) {
    throw new Error(`${source} changed; regenerate dataset and rerun the experiment`);
  }
}
const server = await createServer({server: {host: '127.0.0.1', port: 0}, logLevel: 'error', clearScreen: false});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}${server.config.base}`;
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox']});
try {
  const page = await browser.newPage();
  await page.goto(base);
  const result = await page.evaluate(async ({base}) => {
    const {predictWritingAidPool} = await import(new URL('src/features/tutor/writingAid/engine.ts', base).href);
    const {createWritingAidModel, recordWritingAidVocabulary, updateWritingAidModel} = await import(new URL('src/features/tutor/writingAid/learning.ts', base).href);
    const {padEdit} = await import(new URL('src/features/pad/padEdit.ts', base).href);
    const epoch = 1_710_000_000_000, day = 86400000, realNow = Date.now;
    let clock = epoch;
    Date.now = () => clock;
    try {
      const model = createWritingAidModel();
      function offers(prefix) {
        const text = `My ${prefix}`;
        const snapshot = {cursor: padEdit(text), anchor: {text, start: 0}, mode: 'balanced', composing: false, readOnly: false,
          target: {scopeKey: 'vocabulary-synthetic', mountId: 'test', editorRevision: 0, selectionRevision: 0, modeRevision: 0},
          surfaces: {words: true, ghost: false, replace: false, correction: false}};
        return predictWritingAidPool(snapshot, model).words.map(proposal => proposal.label.toLowerCase());
      }
      const candidate = 'lemmascope', prefix = 'lemmascop';
      const before = offers(prefix).includes(candidate);
      // An acceptance signal alone is not direct learner-authored vocabulary.
      updateWritingAidModel(model, 'accept', {kind: 'word', candidate, previous: 'my', prefix, mode: 'balanced'}, clock);
      const afterAcceptanceOnly = offers(prefix).includes(candidate);
      recordWritingAidVocabulary(model, candidate, clock);
      const afterOneTypedUse = offers(prefix).includes(candidate);
      recordWritingAidVocabulary(model, candidate, clock);
      const afterTwoTypedUses = offers(prefix).includes(candidate);
      clock = epoch + 365 * day;
      const afterOneYear = offers(prefix).includes(candidate);
      clock = epoch + 3 * 365 * day;
      const afterThreeYears = offers(prefix).includes(candidate);
      clock = epoch;
      for (let i = 0; i < 5; i++) recordWritingAidVocabulary(model, 'commutative', clock);
      const weakProofTerm = offers('commuta').includes('commutative');
      const ok = !before && !afterAcceptanceOnly && !afterOneTypedUse && afterTwoTypedUses && afterOneYear &&
        !afterThreeYears && !weakProofTerm;
      if (!ok) throw new Error(JSON.stringify({before, afterAcceptanceOnly, afterOneTypedUse, afterTwoTypedUses,
        afterOneYear, afterThreeYears, weakProofTerm}));
      return {scope: 'Actual engine and local vocabulary policy; deterministic synthetic word and virtual clock.',
        candidate, prefix, before, afterAcceptanceOnly, afterOneTypedUse, afterTwoTypedUses, afterOneYear,
        afterThreeYears, weakProofTerm, observations: 2, virtualDay: day};
    } finally {Date.now = realNow;}
  }, {base});
  await writeFile(`${directory}/vocabulary.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await server.close();
}
