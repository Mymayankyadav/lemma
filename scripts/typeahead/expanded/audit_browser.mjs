import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const entry = fileURLToPath(import.meta.url);
assert(process.argv[2], 'Usage: node scripts/typeahead/expanded/audit_browser.mjs <config.json>');
const configPath = resolve(process.argv[2]);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const relativeToConfig = path => resolve(dirname(configPath), path);
assert(['diagnostic', 'final'].includes(config.mode));
assert(typeof config.general === 'string' && typeof config.latex === 'string');
assert(config.subjects && typeof config.subjects === 'object' && !Array.isArray(config.subjects));
for (const path of ['general', 'latex', 'groupAudit', 'corpusManifest', 'mixture', 'output', 'chromiumExecutable']) {
  if (config[path]) config[path] = relativeToConfig(config[path]);
}
for (const [subject, path] of Object.entries(config.subjects)) {
  assert(/^[a-z0-9][a-z0-9_-]{0,79}$/u.test(subject), 'invalid subject slug');
  config.subjects[subject] = relativeToConfig(path);
}
const sha = contents => createHash('sha256').update(contents).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
async function treeHash(root, roots) {
  const tree = createHash('sha256');
  let files = 0;
  async function visit(relative) {
    const entries = await readdir(join(root, relative), {withFileTypes: true});
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : Number(a.name !== b.name))) {
      const path = relative + '/' + entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        tree.update(path + '\0' + sha(await readFile(join(root, path))) + '\n');
        files++;
      } else throw new Error('unexpected non-file snapshot entry: ' + path);
    }
  }
  for (const root of roots) await visit(root);
  return {sha256: tree.digest('hex'), files, roots};
}
const tolerance = 1e-5;
const seed = 0x2385;
const specifications = [
  ['ngram-v2', config.general, 'ngram', null, 20],
  ...Object.entries(config.subjects).map(([subject, path]) => ['subject-' + subject, path, 'ngram', subject, 4]),
  ['latex-v2', config.latex, 'latex', null, 2],
];
const manifests = {};
for (const [name, path, kind, subject, budget] of specifications) {
  const manifestBytes = await readFile(join(path, 'manifest.json'));
  const file = JSON.parse(manifestBytes);
  assert.equal(file.version, 2, name);
  assert.equal(file.kind, kind, name);
  assert.equal(file.subject, subject, name);
  assert.equal(file.file, 'model.bin', name);
  assert((kind === 'latex' ? file.order === 4 : [4, 5].includes(file.order)), name);
  const bytes = await readFile(join(path, file.file));
  assert.equal(bytes.length, file.bytes, name);
  assert(bytes.length <= budget * 1024 * 1024, name + ' over budget');
  assert.equal(sha(bytes), file.sha256, name);
  assert.match(file.vocabSha256, /^[a-f0-9]{64}$/u, name);
  assert.match(file.corpusSha256, /^[a-f0-9]{64}$/u, name);
  assert(file.metrics.trainTokens > 0, name);
  manifests[name] = {sha256: file.sha256, manifestSha256: sha(manifestBytes), bytes: file.bytes, budgetMiB: budget,
    corpusSha256: file.corpusSha256, vocabSha256: file.vocabSha256,
    vocabSize: file.vocabSize, order: file.order, trainTokens: file.metrics.trainTokens, subject};
}
const general = manifests['ngram-v2'];
let provenance = null;
if (config.mode === 'final') {
  assert(config.corpusManifest && config.groupAudit, 'final audit needs its corpus and publisher-group audit');
  const corpusBytes = await readFile(config.corpusManifest);
  const corpus = JSON.parse(corpusBytes);
  const audit = await readJson(config.groupAudit);
  const corpusSha256 = sha(corpusBytes);
  assert.equal(audit.passed, true);
  assert.equal(audit.corpusSha256, corpusSha256);
  for (const [name, asset] of Object.entries(manifests)) assert.equal(asset.corpusSha256, corpusSha256, name);
  assert(corpus.counts.train.words >= 500_000_000, 'corpus short of 500M training words');
  assert(general.trainTokens >= 500_000_000, 'general count model short of 500M tokens');
  assert(manifests['latex-v2'].trainTokens >= 50_000_000, 'LaTeX model short of 50M formula tokens');
  assert(Array.isArray(corpus.sources) && corpus.sources.length && corpus.sources.every(row =>
    row.id && row.revision && row.license && /^https?:\/\//u.test(row.url) && /^[a-f0-9]{64}$/u.test(row.sha256)),
  'source manifest lacks pinned identities, licensing or file digests');
  const sources = Object.fromEntries(Object.entries(audit.counts).filter(([key]) => key.startsWith('publisherIdentityVerified:')));
  for (const source of ['HuggingFaceTB/finemath', 'EleutherAI/proof-pile-2', 'hoskinson-center/proof-pile']) {
    assert(sources['publisherIdentityVerified:' + source] > 0 && corpus.sources.some(row => row.id === source),
      source + ' missing audited contribution');
  }
  for (const split of ['train', 'validation', 'calibration', 'test']) {
    assert(audit.counts['documents:' + split] > 0 && audit.counts['groups:' + split] > 0 &&
      corpus.shards.some(row => row.split === split && /^[a-f0-9]{64}$/u.test(row.sha256)), split + ' membership missing');
  }
  provenance = {corpusSha256, groupAuditSha256: sha(await readFile(config.groupAudit)),
    trainingWords: corpus.counts.train.words, pinnedInputShards: corpus.sources.length, publisherIdentityCounts: sources};
}
const inputFiles = ['kn.ts', 'ngramSpatial.ts', 'mixture.ts'].map(name => 'src/features/tutor/writingAid/decoder/' + name)
  .concat('src/features/tutor/writingAid/latexGrammar.ts');
const sourceFingerprints = Object.fromEntries(await Promise.all(inputFiles.map(async name => [name, sha(await readFile(join(repo, name)))])));
const verifierSha256 = sha(await readFile(entry));
const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
const target = await mkdtemp(join(tmpdir(), 'lemma-typeahead-browser-audit-'));
let server, browser;
try {
  for (const part of ['src', 'supabase/functions/_shared', 'public/models/typeahead', 'public/models/writing-decoder']) {
    await cp(join(repo, part), join(target, part), {recursive: true});
  }
  for (const [name, fingerprint] of Object.entries(sourceFingerprints)) {
    assert.equal(sha(await readFile(join(target, name))), fingerprint, 'source changed during snapshot: ' + name);
  }
  for (const [name, path] of specifications) {
    const subdir = join(target, 'public/models/typeahead', name);
    await mkdir(subdir, {recursive: true});
    for (const file of ['manifest.json', 'model.bin']) await cp(join(path, file), join(subdir, file));
  }
  const fitPath = join(target, 'public/models/typeahead/ngram-v2/mixture.json');
  await rm(fitPath, {force: true});
  if (config.mixture) await cp(config.mixture, fitPath);
  const snapshot = await treeHash(target, ['src', 'supabase/functions/_shared', 'public/models/typeahead', 'public/models/writing-decoder']);
  await symlink(join(repo, 'node_modules'), join(target, 'node_modules'), 'dir');
  await writeFile(join(target, 'index.html'), '<!doctype html><title>Local model audit</title>');
  server = await createServer({root: target, base: '/lemma/', configFile: false, publicDir: false, cacheDir: join(target, '.vite'), logLevel: 'error',
    plugins: [{name: 'model-audit-local-assets', configureServer(dev) {
      dev.middlewares.use('/lemma/models/', async (request, response, next) => {
        const relative = request.url?.split('?')[0]?.replace(/^\//u, '');
        if (!relative || !/^(?:typeahead|writing-decoder)\/[a-z0-9_-]+\/[a-z0-9_.-]+$/u.test(relative)) return next();
        try {
          const data = await readFile(join(target, 'public/models', relative));
          response.writeHead(200, {'Content-Length': data.length}); response.end(data);
        } catch {next();}
      });
    }}], server: {host: '127.0.0.1', port: 0, fs: {allow: [target, repo]}}});
  await server.listen();
  browser = await chromium.launch({executablePath: config.chromiumExecutable, headless: true});
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('browser:', error.message));
  page.on('response', response => {if (!response.ok() && response.status() >= 400) console.error(response.status(), new URL(response.url()).pathname);});
  await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(async ({manifests, tolerance, seed, useFit}) => {
    const base = '/lemma/src/features/tutor/writingAid/';
    const kn = await import(base + 'decoder/kn.ts');
    const spatial = await import(base + 'decoder/ngramSpatial.ts');
    const lexical = await import(base + 'decoder/completeLexicon.ts');
    const mixture = await import(base + 'decoder/mixture.ts');
    const grammar = await import(base + 'latexGrammar.ts');
    const check = (condition, message) => {if (!condition) throw new Error(message);};
    const nearOne = (mass, name) => check(Number.isFinite(mass) && Math.abs(mass - 1) <= tolerance, name + ' sum ' + mass);
    const vocabularyHash = async model => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(model.words.join('\n')))), byte => byte.toString(16).padStart(2, '0')).join('');
    let state = seed;
    const rand = max => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return Math.floor(state / 0x100000000 * max);
    };
    const asHistory = (table, width, index) => Array.from(table.history.subarray(index * width, (index + 1) * width));
    function rowAt(table, width, history) {
      let lo = 0, hi = table.backoff.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        let cmp = 0;
        for (let index = 0; index < width && !cmp; index++) cmp = table.history[mid * width + index] - history[history.length - width + index];
        if (!cmp) return mid;
        if (cmp < 0) lo = mid + 1; else hi = mid;
      }
      return -1;
    }
    function sparseMassAudit(name, model) {
      const started = performance.now();
      const unigram = model.extended.unigram.reduce((sum, p) => {
        check(Number.isFinite(p) && p >= 0, name + ' invalid unigram');
        return sum + p;
      }, 0);
      nearOne(unigram, name + ' sparse unigram');
      const tables = model.extended.rows, cache = [];
      function mass(history) {
        for (let width = Math.min(history.length, cache.length); width > 0; width--) {
          const index = rowAt(tables[width - 1], width, history);
          if (index >= 0) return cache[width - 1][index];
        }
        return unigram;
      }
      const remainingRoundoff = 1e-10;
      let minimumRemaining = 1, negativeRemaining = 0, worst = Math.abs(unigram - 1), worstHistory = [], worstTotal = unigram;
      const coverage = [];
      for (let width = 1; width <= tables.length; width++) {
        const table = tables[width - 1], rowCount = table.backoff.length;
        const totalByRow = new Float64Array(rowCount);
        let edges = 0;
        for (let row = 0; row < rowCount; row++) {
          const history = table.history.subarray(row * width, (row + 1) * width);
          const suffix = history.subarray(1);
          const lowerMass = mass(suffix);
          let explicit = 0, replaced = 0;
          for (let edge = table.start[row]; edge < table.start[row + 1]; edge++) {
            const p = table.probability[edge];
            const lower = Math.exp(kn.historyLog(model, table.next[edge], suffix));
            check(Number.isFinite(p) && p >= 0 && Number.isFinite(lower) && lower >= 0, name + ' invalid sparse edge');
            explicit += p;
            replaced += lower;
            edges++;
          }
          const backoff = table.backoff[row];
          check(Number.isFinite(backoff) && backoff >= 0, name + ' invalid backoff');
          const remaining = lowerMass - replaced;
          minimumRemaining = Math.min(minimumRemaining, remaining);
          if (remaining < -remainingRoundoff) negativeRemaining++;
          const total = explicit + backoff * remaining;
          totalByRow[row] = total;
          check(Number.isFinite(total), name + ' invalid sparse row');
          if (Math.abs(total - 1) > worst) {
            worst = Math.abs(total - 1); worstHistory = Array.from(history); worstTotal = total;
          }
        }
        check(edges === table.next.length, name + ' incomplete edge coverage');
        coverage.push({width, rows: rowCount, edges});
        cache.push(totalByRow);
      }
      return {mass, coverage, maxMassError: worst, worstHistory, worstTotal, minimumRemaining,
        negativeRemaining, remainingRoundoff, elapsedMs: performance.now() - started};
    }
    async function massCheck(name, model) {
      check(model?.extended, name + ' did not load extended format');
      const spec = manifests[name];
      check(model.words.length === spec.vocabSize && await vocabularyHash(model) === spec.vocabSha256, name + ' vocab mismatch');
      check(kn.historyWidth(model) === spec.order - 1, name + ' order mismatch');
      const {mass: sparseMass, ...allRows} = sparseMassAudit(name, model);
      let worstAgreement = 0;
      let worst = 0, worstHistory = [], worstTotal = 1, classWorst = 0;
      const rows = [];
      function measure(history) {
        let total = 0;
        for (let id = 0; id < model.words.length; id++) {
          const p = Math.exp(kn.historyLog(model, id, history));
          check(Number.isFinite(p) && p >= 0, name + ' bad probability');
          total += p;
        }
        nearOne(total, name + ' history ' + history.join(','));
        const difference = Math.abs(total - sparseMass(history));
        check(difference <= 1e-10, name + ' sparse/brute mismatch ' + difference);
        worstAgreement = Math.max(worstAgreement, difference);
        if (Math.abs(total - 1) > worst) {
          worst = Math.abs(total - 1); worstHistory = history; worstTotal = total;
        }
        if (name === 'latex-v2') {
          const id = model.id.get('<latin>');
          check(id !== undefined, 'LaTeX has no identifier class');
          const classMass = Math.exp(kn.historyLog(model, id, history));
          for (const n of [1, 2, 3, 8, 12]) {
            const weights = grammar.latexIdentifierWeights(n);
            nearOne(weights.reduce((a,b) => a+b, 0), 'LaTeX identifier allocation weights');
            classWorst = Math.max(classWorst, Math.abs(classMass - weights.reduce((sum, weight) => sum + weight * classMass, 0)));
          }
        }
      }
      measure([]);
      for (let width = 1; width <= model.extended.rows.length; width++) {
        const table = model.extended.rows[width - 1], count = table.backoff.length;
        const indexes = new Set(count ? [0, count - 1] : []);
        while (indexes.size < Math.min(12, count)) indexes.add(rand(count));
        for (const index of indexes) measure(asHistory(table, width, index));
        const unseen = new Map();
        const singleStart = rand(model.words.length);
        for (let attempt = 0; unseen.size < 12 && attempt < (width === 1 ? model.words.length : 100_000); attempt++) {
          const history = width === 1 ? [(singleStart + attempt) % model.words.length]
            : Array.from({length: width}, () => rand(model.words.length));
          if (rowAt(table, width, history) < 0) unseen.set(history.join(','), history);
        }
        for (const history of unseen.values()) measure(history);
        rows.push({width, storedRows: count, observedSample: indexes.size, unobservedSample: unseen.size,
          ...(unseen.size < 12 ? {unobservedShortfall: 'dense level or fewer than 12 sampled absent histories'} : {})});
      }
      check(allRows.negativeRemaining === 0, name + ' negative remaining lower mass in ' + allRows.negativeRemaining + ' rows');
      nearOne(allRows.worstTotal, name + ' sparse worst row ' + allRows.worstHistory.join(','));
      return {maxMassError: worst, worstHistory, worstTotal, allRows: {...allRows, maxBruteForceAgreementError: worstAgreement}, sampledUnigram: true, histories: rows, ...(name === 'latex-v2' ? {maxIdentifierClassAllocationError: classWorst} : {})};
    }

    await spatial.prepareWorkerTypeahead('expanded-kn');
    await kn.loadLatexModel(true);
    check(spatial.typeaheadActive() && kn.typeaheadNgramFingerprint() === manifests['ngram-v2'].sha256,
      'unexpected general decoder fallback');
    check(kn.typeaheadLatexFingerprint() === manifests['latex-v2'].sha256, 'unexpected LaTeX decoder fallback');
    const general = kn.generalNgram();
    const models = {'ngram-v2': await massCheck('ngram-v2', general), 'latex-v2': await massCheck('latex-v2', kn.latexModel())};
    const lexicon = await lexical.loadCompleteLexicon();
    const dictionary = new Set([...general.words, ...lexicon.entries.map(row => row.word)]);
    const mixtureChecks = [];
    const variants = [
      {name: 'bare', before: '', question: [], authored: ''},
      {name: 'question', before: 'A bounded map ', question: ['Given a bivariant frobnication'], authored: ''},
      {name: 'draft', before: 'Every finite cover ', question: [], authored: 'Consider the xyzdraftword'},
      {name: 'all', before: 'The linear map ', question: ['Given a bivariant frobnication'], authored: 'Consider the xyzdraftword',
        personal: {cache: {counts: new Map([['xyzpersonalword', 2], ['map', 1]]), total: 3}, weight: .2},
        extraLexical: ['xyzexplicitword']},
    ];
    for (const subject of [undefined, ...Object.values(manifests).map(x => x.subject).filter(Boolean)]) {
      await kn.selectSubjectNgram(subject);
      const active = kn.activeSubjectNgram(subject);
      if (subject) {
        const key = 'subject-' + subject;
        check(active?.fingerprint === manifests[key].sha256, key + ' did not activate expected shard');
        check(active.model.words.length === general.words.length && active.model.words.every((word, index) => word === general.words[index]),
          key + ' ordered vocabulary differs');
        models[key] = await massCheck(key, active.model);
      }
      const fitted = mixture.subjectWeights(kn.typeaheadNgramFingerprint(), subject, active?.fingerprint);
      if (!useFit) check(!fitted, (subject ?? 'general') + ' unexpectedly loaded a fit');
      for (const options of variants) {
        const distribution = spatial.prepareLanguage(options.before, {...options, subject});
        const support = new Set([...dictionary, ...distribution.next]);
        const sums = {};
        for (const word of support) {
          const components = distribution.components(word);
          for (const [name, p] of Object.entries(components)) {
            if (p === undefined) continue;
            check(Number.isFinite(p) && p >= 0, (subject ?? 'general') + ' invalid ' + name);
            sums[name] = (sums[name] ?? 0) + p;
          }
        }
        for (const [name, value] of Object.entries(sums)) nearOne(value, (subject ?? 'general') + '/' + options.name + '/' + name);
        check(Math.exp(distribution.mathLog) === distribution.components('<m>').activeMixture, 'math event differs from active mixture');
        mixtureChecks.push({subject: subject ?? null, context: options.name, fitted: Boolean(fitted), support: support.size, sums});
      }
    }
    return {models, mixtureChecks};
  }, {manifests, tolerance, seed, useFit: Boolean(config.mixture)});
  const fitStatus = !config.mixture ? 'not supplied; runtime fallback'
    : result.mixtureChecks.every(row => row.fitted) ? 'supplied fit activated in every scope'
    : 'supplied fit did not activate in every scope; see per-scope fallback results';
  const evidence = {mode: config.mode, fitStatus, head, verifierSha256, snapshot, sourceFingerprints, chromium: browser.version(), seed, tolerance,
    manifests, provenance, fitSha256: config.mixture ? sha(await readFile(config.mixture)) : null, ...result};
  if (config.output) await writeFile(config.output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser?.close();
  await server?.close();
  await rm(target, {recursive: true, force: true});
}
