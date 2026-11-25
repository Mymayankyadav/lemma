import {createHash} from 'node:crypto';
import {appendFileSync, readFileSync, writeFileSync} from 'node:fs';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {liveTutorFixtureResponse, prepareLiveTutor} from './helpers/live-tutor';
import type {AnswerAidDraft} from '../../supabase/functions/_shared/tutor-answer-aids';

type ReplayEvent = {eventId: string; answerId: string; prefix: string; draft?: string; target?: string; route?: string};
type ReplayAnswer = {answerId: string; answer: string; route?: string; question?: string; subject?: string; aid?: AnswerAidDraft;
  documentGroup?: string};
type GoldEvent = {eventId: string; exactInsertion: string; exactGhost?: string; kind: 'word' | 'symbol'};
type RuntimeAsset = {ngram?: string; subject?: string; subjectPack?: string; latex?: string; neural?: string;
  graphTrial?: string; ghostEligible: boolean; neuralEligible: boolean; ngramAbsence?: 'empty' | 'ineligible' | 'no-current-model'};
type Displayed = {text: string; family: string; start: number; end: number; caret?: number; selectionEnd?: number};
type ComponentSample = {id: string; subject?: string; probability?: Record<string, number>; assetSha256?: string; subjectAssetSha256?: string};
type GhostSample = {id: string; modelFingerprint?: string;
  candidates?: {text: string; logProbability: number; context: 'prefix' | 'boundary'; elapsedMs: number}[]};
const fixture: ReplayEvent[] = [
  {eventId: 'word', answerId: 'draft-a', prefix: 'Could you clarify the nota', target: 'notation '},
  {eventId: 'equation', answerId: 'draft-b', prefix: 'Let x1+x2=4', target: '$x_{1}+x_{2}=4$'},
  {eventId: 'blocked', answerId: 'draft-c', prefix: 'Therefore f is '},
];
const fixtureAnswers: ReplayAnswer[] = [
  {answerId: 'draft-a', answer: 'Could you clarify the notation here?'},
  {answerId: 'draft-b', answer: 'The function has an inverse.'},
  {answerId: 'draft-c', answer: 'Therefore f is injective.'},
];
const defaultRoute = '/p/real-analysis/cp/CP4/tutor';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const lines = (rows: readonly unknown[]) => rows.length ? rows.map(row => JSON.stringify(row)).join('\n') + '\n' : '';
function input<T>(path: string | undefined, fallback: T[]): T[] {
  return path ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : fallback;
}

async function exactDraft(answer: Locator) {
  return answer.evaluate(root => {
    if (root instanceof HTMLTextAreaElement) return root.value;
    const read = (node: Node): string => node.nodeType === Node.TEXT_NODE ? node.textContent ?? '' :
      node instanceof HTMLElement && node.dataset.math ? node.dataset.math : [...node.childNodes].map(read).join('');
    return read(root);
  });
}

async function slate(page: Page, trace = true) {
  const slots = page.getByRole('group', {name: /^(?:Answer|Word|Equation|LaTeX|Symbol) suggestions$/u})
    .locator('button:enabled[data-typeahead-insert]:visible');
  const {items, diagnostics} = await page.evaluate(captureTrace => {
    const groups = ['Answer', 'Word', 'Equation', 'LaTeX', 'Symbol'].map(name => '[role="group"][aria-label="'+name+' suggestions"]');
    const nodes = Array.from(document.querySelectorAll<HTMLButtonElement>(groups.map(group => group+' button:enabled[data-typeahead-insert]').join(',')))
      .filter(button => button.checkVisibility());
    let diagnostics: unknown;
    if (captureTrace) window.dispatchEvent(new CustomEvent('lemma-typeahead-read-menu', {detail: (value: unknown) => {diagnostics = value;}}));
    return {diagnostics, items: nodes.map(node => {
      const button = node as HTMLButtonElement;
      const text = button.dataset.typeaheadInsert!;
      return {text, family: button.dataset.typeaheadFamily ?? text.trim(), start: Number(button.dataset.typeaheadStart),
        end: Number(button.dataset.typeaheadEnd), caret: button.dataset.typeaheadCaret === undefined ? undefined : Number(button.dataset.typeaheadCaret),
        selectionEnd: button.dataset.typeaheadSelectionEnd === undefined ? undefined : Number(button.dataset.typeaheadSelectionEnd)};
    })};
  }, trace);
  expect(items.length).toBeLessThanOrEqual(3);
  return {slots, items, diagnostics};
}

async function painted(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

function apply(draft: string, offer: Displayed) {
  return draft.slice(0, offer.start) + offer.text + draft.slice(offer.end);
}

test('replays visible typeahead quality and an actual full-answer typing trajectory', async ({page}, info) => {
  page.setDefaultTimeout(15_000);
  const eventInput = process.env.LEMMA_TYPEAHEAD_REPLAY_INPUT;
  const answerInput = process.env.LEMMA_TYPEAHEAD_REPLAY_ANSWERS;
  const events = input(eventInput, fixture);
  const answers = input(answerInput, eventInput ? [] : fixtureAnswers);
  test.setTimeout(eventInput || answerInput ? 1_800_000 : 60_000);
  const output = process.env.LEMMA_TYPEAHEAD_REPLAY_OUTPUT;
  const expectedNgram = process.env.LEMMA_TYPEAHEAD_REPLAY_EXPECTED_NGRAM_SHA;
  const expectedSubjectPacks = JSON.parse(process.env.LEMMA_TYPEAHEAD_REPLAY_EXPECTED_SUBJECT_SHA_JSON ?? '{}') as Record<string, string>;
  const expectedLatex = process.env.LEMMA_TYPEAHEAD_REPLAY_EXPECTED_LATEX_SHA;
  const captureOnly = process.env.LEMMA_TYPEAHEAD_REPLAY_CAPTURE_ONLY === '1';
  const ghostCalibration = process.env.LEMMA_TYPEAHEAD_REPLAY_GHOST_CALIBRATION === '1';
  const retainPartial = (sink: string, row: unknown) => {
    if (output) appendFileSync(output + '.partial.' + sink + '.jsonl', lines([row]));
  };
  if (output) for (const kind of ['impressions', 'keys', 'components', 'ghost-calibration', 'ghost-opportunities']) {
    writeFileSync(output + '.partial.' + kind + '.jsonl', '');
  }
  const flags = process.env.LEMMA_TYPEAHEAD_REPLAY_FLAGS ?? 'typeaheadV2,tutorAnswerAids,proofAssistGhost';
  const arm = process.env.LEMMA_TYPEAHEAD_REPLAY_ARM;
  const graphTrial = process.env.LEMMA_TYPEAHEAD_REPLAY_GRAPH_TRIAL === '1';
  const strictGraphTrial = process.env.LEMMA_TYPEAHEAD_REPLAY_STRICT_GRAPH_TRIAL === '1';
  const expectedNeural = process.env.LEMMA_TYPEAHEAD_REPLAY_EXPECTED_NEURAL_FINGERPRINT;
  if (strictGraphTrial && (!graphTrial || !expectedNeural)) {
    throw new Error('Strict graph trial requires a pinned candidate bundle fingerprint');
  }
  await page.addInitScript(() => {
    window.addEventListener('lemma-typeahead-applied', event => {
      (window as Window & {lastTypeaheadAcceptance?: unknown}).lastTypeaheadAcceptance = (event as CustomEvent).detail;
    });
  });
  const modelAssets = new Set<string>();
  const assetCounts = {ngram: 0, subject: 0, latex: 0, neural: 0, empty: 0, ineligible: 0, 'no-current-model': 0};
  const subjectAssets = new Map<string, Set<string>>();
  const blind = process.env.LEMMA_TYPEAHEAD_REPLAY_BLIND === '1';
  if (blind && (!captureOnly || process.env.LEMMA_TYPEAHEAD_REPLAY_GOLD || answers.some(row => 'answer' in row) || events.some(row => 'target' in row || 'exactGhost' in row || 'exactInsertion' in row))) {
    throw new Error('Blind fixed capture requires question-only contexts and no gold file');
  }
  const gold = new Map(input<GoldEvent>(process.env.LEMMA_TYPEAHEAD_REPLAY_GOLD, []).map(event => [event.eventId, event]));
  const components = [];
  const ghostCandidates = [];
  const ghostOpportunities = [];
  const neuralCoverage: Array<Record<string, unknown>> = [];
  const impressions = [];
  const keys = [];
  let opened: string | undefined;
  let editor: Locator | undefined;
  const contexts = new Map(answers.map(value => [value.answerId, value]));
  if (ghostCalibration && (!captureOnly || !graphTrial || !expectedNeural || !expectedNgram || !events.length ||
      events.some(event => !contexts.get(event.answerId)?.documentGroup || typeof gold.get(event.eventId)?.exactGhost !== 'string'))) {
    throw new Error('Ghost calibration needs capture-only graph trial, verified fingerprints, and disjoint grouped replay outcomes');
  }
  const optionalPack = process.env.LEMMA_TYPEAHEAD_REPLAY_FP16_PACK;
  if (optionalPack) {
    if (arm !== 'neural' || !strictGraphTrial) throw new Error('The optional package replay requires a pinned strict neural arm');
    await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch,typeaheadV2,writingAidSettings#' + defaultRoute);
    const write = page.getByRole('button', {name: 'Write a question', exact: true});
    const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
    await expect(write.or(answer).filter({visible: true}).first()).toBeVisible();
    if (!await answer.isVisible()) {
      try {await write.click({timeout: 2000});} catch (error) {if (!await answer.isVisible()) throw error;}
    }
    await answer.focus();
    const menu = page.getByRole('button',{name:'Session actions',exact:true});
    await menu.click();
    await page.getByRole('button',{name:'Writing assistance',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Writing assistance',exact:true});
    await dialog.locator('input[type=file]').setInputFiles(optionalPack);
    await expect(dialog.getByRole('button',{name:'Remove model'})).toBeVisible({timeout:90000});
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
  let active: ReplayAnswer | undefined;
  if (answers.some(sample => sample.question)) {
    const {threadId, payload} = await prepareLiveTutor(page);
    const id = '77777777-7777-4777-8777-777777777777';
    await page.route('**/rest/v1/**', route => {
      const digest = hash(active?.answerId ?? 'fixture');
      const turnId = [digest.slice(0,8), digest.slice(8,12), '4'+digest.slice(13,16), '8'+digest.slice(17,20), digest.slice(20,32)].join('-');
      const request = route.request(), endpoint = new URL(request.url()).pathname.split('/rest/v1/')[1];
      if (endpoint === 'rpc/tutor_thread_state') return route.fulfill({json: {
        head: {threadId, pendingTurnId: null, lastSequence: 1},
        turns: [{id: turnId, threadId, sequence: 1, version: 1, status: 'completed',
          snapshot: {question: 'Show the exercise.', selectedContext: []},
          finalReply: {body: active?.question || 'Give an explanation.', turnId, messageId: 'replay-context',
            provenance: {kind: 'connector', reportedHost: null, hostVerified: false}, citations: [], suggestions: []}}],
        recoveredDrafts: [], canSubmit: true, canConnect: false,
      }});
      if (endpoint === 'rpc/tutor_answer_aid_state') return route.fulfill({json: active?.aid ? [
        {id, turnId, version: 1, level: 'scaffold', withhold: [], wording: [], terms: [], symbols: [], ...active.aid},
      ] : []});
      if (endpoint === 'subjects' && active?.subject) {
        const subjects = payload.subjects as Array<Record<string, unknown>>;
        const response = subjects.map(subject => ({...subject, name: active?.subject}));
        return route.fulfill({json: request.headers().accept?.includes('vnd.pgrst.object') ? response[0] : response});
      }
      return route.fulfill({json: liveTutorFixtureResponse(payload, endpoint, request.headers().accept)});
    });
  }

  async function observeAssets(answerId: string, text: string): Promise<RuntimeAsset> {
    const model = await page.locator('form.composer').evaluate(form => {
      const data = (form as HTMLElement).dataset;
      return {ngram: data.typeaheadNgramSha, subject: data.typeaheadSubject, subjectPack: data.typeaheadSubjectSha,
        latex: data.typeaheadLatexSha, neural: data.typeaheadNeuralSha, graphTrial: data.typeaheadGraphTrial,
        ngramEligible: data.typeaheadNgramEligible === '1', neuralEligible: data.typeaheadNeuralEligible === '1', ghostEligible: data.typeaheadGhostEligible === '1'};
    });
    const sample = contexts.get(answerId);
    if (sample?.question && sample.subject) {
      const expectedSubject = sample.subject.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
      expect(model.subject, 'active Tutor subject for the frozen answer').toBe(expectedSubject);
    }
    if (expectedNgram && model.ngram) expect(model.ngram, 'active n-gram fingerprint during replay').toBe(expectedNgram);
    if (expectedLatex && model.latex) expect(model.latex, 'active LaTeX fingerprint during replay').toBe(expectedLatex);
    if (expectedNeural && model.neural) expect(model.neural, 'active neural prefill fingerprint during replay').toBe(expectedNeural.split(':')[0]);
    if (arm === 'corrected-v1') expect(model.subjectPack, 'corrected baseline must not use a subject pack').toBeUndefined();
    if (model.ngram && model.subject && Object.hasOwn(expectedSubjectPacks, model.subject)) {
      expect(model.subjectPack, 'active subject model fingerprint during replay').toBe(expectedSubjectPacks[model.subject]);
    }
    if (model.subject && model.subjectPack) {
      const observed = subjectAssets.get(model.subject) ?? new Set<string>();
      observed.add(model.subjectPack);
      subjectAssets.set(model.subject, observed);
    }
    for (const [kind, hash] of [['ngram', model.ngram], ['subject', model.subjectPack], ['latex', model.latex], ['neural', model.neural]] as const) {
      if (!hash) continue;
      modelAssets.add(hash);
      assetCounts[kind]++;
    }
    const {ngramEligible, ...assets} = model;
    const ngramAbsence = model.ngram ? undefined : !text ? 'empty' : ngramEligible ? 'no-current-model' : 'ineligible';
    if (ngramAbsence) assetCounts[ngramAbsence]++;
    return {...assets, ngramAbsence};
  }

  async function measureComponents(id: string, target: string) {
    return page.evaluate(({id, target}) => new Promise<ComponentSample | null>(resolve => {
      function receive(event: Event) {
        const detail = (event as CustomEvent<ComponentSample>).detail;
        if (detail?.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener('lemma-typeahead-components-result', receive);
        resolve(detail);
      }
      const timer = setTimeout(() => {
        window.removeEventListener('lemma-typeahead-components-result', receive);
        resolve(null);
      }, 330);
      window.addEventListener('lemma-typeahead-components-result', receive);
      window.dispatchEvent(new CustomEvent('lemma-typeahead-components-request', {detail: {id, target}}));
    }), {id, target});
  }

  async function measureGhost(id: string) {
    return page.evaluate(id => new Promise<GhostSample | null>(resolve => {
      const until = performance.now() + 80;
      let sample: GhostSample | null = null;
      function receive(event: Event) {
        const detail = (event as CustomEvent<GhostSample>).detail;
        if (detail?.id === id) sample = detail;
      }
      function read() {
        window.dispatchEvent(new CustomEvent('lemma-typeahead-ghost-probe-request', {detail: {id}}));
        if (sample || performance.now() >= until) {
          window.removeEventListener('lemma-typeahead-ghost-probe-result', receive);
          resolve(sample);
        } else requestAnimationFrame(read);
      }
      window.addEventListener('lemma-typeahead-ghost-probe-result', receive);
      read();
    }), id);
  }

  async function drainCoverage() {
    const marks = await page.evaluate(() => {
      const out = performance.getEntriesByName('lemma.typeahead.neural.coverage', 'mark').map(mark => (mark as PerformanceMark).detail);
      performance.clearMarks('lemma.typeahead.neural.coverage');
      return out as Array<Record<string, unknown>>;
    });
    neuralCoverage.push(...marks);
  }

  async function start(route: string, answerId: string, frozen: boolean, retainDraft = false) {
    const open = page.getByRole('button', {name: 'Write a question', exact: true});
    async function reveal(answer: Locator) {
      if (await answer.isVisible()) return;
      try {await open.click({timeout: 2000});}
      catch (error) {if (!await answer.isVisible()) throw error;}
    }
    async function resetDraft(answer: Locator) {
      await reveal(answer);
      if (await exactDraft(answer)) await answer.fill('');
      await reveal(answer);
      await expect(answer).toBeVisible({timeout: 5_000});
      await expect.poll(() => exactDraft(answer)).toBe('');
      await answer.focus();
    }
    const context = contexts.get(answerId);
    const hasQuestion = Boolean(context?.question);
    const destination = hasQuestion ? '/p/logic/cp/CP1/tutor' : route;
    const key = [destination, hasQuestion ? answerId : '', frozen].join('|');
    if (retainDraft && editor && key === opened) return editor;
    if (!editor || key !== opened) {
      if (editor) await drainCoverage();
      active = context;
      const query = '/lemma/?typeahead-answer='+encodeURIComponent(answerId)+'&typeahead-replay=1&demo=' + (hasQuestion ? '0' : '1') + '&flags=v7Shell,v6Shell,tutorScratch,' + encodeURIComponent(flags)
        + (arm ? '&typeahead-arm=' + encodeURIComponent(arm) : '') + (frozen ? '&typeahead-frozen-profile=1' : '')
        + (captureOnly ? '' : '&typeahead-trace=0') + (graphTrial ? '&typeahead-graph-trial=1' : '') + (strictGraphTrial ? '&typeahead-strict-trial=1' : '')
        + (ghostCalibration ? '&typeahead-ghost-probe=1' : '');
      await page.goto(query + '#' + destination);
      editor = page.getByRole('textbox', {name: 'Your answer', exact: true});
      await expect(open.or(editor).filter({visible: true}).first()).toBeVisible({timeout: eventInput || answerInput ? 15000 : 5000});
      await reveal(editor);
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      // All arms wait for the same asset-loading conditions, independent of the target.
      await page.waitForLoadState('domcontentloaded');
      if (expectedNgram) {
        // Verify the configured arm before timing or recording a gold event.
        // This non-answer warm-up completes no learned word or transition.
        await resetDraft(editor);
        await page.keyboard.type('Use th');
        await expect(page.locator('form.composer')).toHaveAttribute('data-typeahead-ngram-sha', expectedNgram, {timeout: 20_000});
      }
      opened = key;
    }
    await resetDraft(editor);
    return editor;
  }

  // Freeze eligibility opportunities before applying any gold decisions.
  let priorPrefix = '', priorId = '';
  for (const event of events) {
    const retain = blind && event.draft === undefined && event.answerId === priorId && event.prefix.startsWith(priorPrefix);
    const answer = await start(event.route ?? defaultRoute, event.answerId, true, retain);
    const delta = retain ? event.prefix.slice(priorPrefix.length) : event.prefix;
    // Restore intervening independently typed context, then deliver the measured edit through the native input path.
    if (event.draft !== undefined) {
      if (!blind || !event.draft.startsWith(event.prefix) || !event.prefix.length) throw new Error('Invalid interior fixture');
      const suffix = event.draft.slice(event.prefix.length);
      const leading = [...event.prefix], last = leading.pop()!;
      const left = leading.join('');
      await answer.fill(left + suffix);
      await answer.evaluate((root, offset) => {
        const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const length = node.textContent?.length ?? 0;
          if (offset <= length) {window.getSelection()!.setPosition(node,offset); return;}
          offset -= length;
        }
        throw new Error('Frozen plain-text cursor is outside the editor');
      }, left.length);
      await page.keyboard.insertText(last);
    } else if (blind) {
      const points = [...delta], last = points.pop();
      if (points.length) await page.keyboard.insertText(points.join(''));
      if (last) await page.keyboard.insertText(last);
      if (await exactDraft(answer) !== event.prefix) {
        // Re-establish the known cursor if the rich editor remounted or replaced its native selection.
        // Only the scheduled prefix is available here. No menu or outcome has been observed.
        const restore = [...event.prefix], final = restore.pop();
        await answer.fill(restore.join(''));
        await answer.press('Control+End');
        if (final) await page.keyboard.insertText(final);
      }
    } else await page.keyboard.type(delta);
    priorId = event.answerId;
    priorPrefix = event.prefix;
    expect(await exactDraft(answer), 'Frozen draft at '+event.eventId).toBe(event.draft ?? event.prefix);
    await painted(page);
    const functionalTarget = !eventInput && process.env.LEMMA_TYPEAHEAD_REPLAY_FLAGS === undefined ? event.target : undefined;
    if (functionalTarget) {
      // The built-in fixture is a functional check. Let its cold worker publish
      // the exact offer before asserting acceptance. Frozen input replay keeps
      // the same frame-bounded observation window for every arm.
      await expect.poll(async () => (await slate(page)).items.map(item => item.text),
        {message: 'Expected exact offer for the synthetic ' + event.eventId + ' fixture'}).toContain(functionalTarget);
    }
    const {slots, items, diagnostics} = await slate(page);
    const assets = await observeAssets(event.answerId, event.prefix);
    if (!eventInput && event.eventId === 'blocked') {
      expect(items.some(item => /^(?:injective|surjective|bijective)\s*$/iu.test(item.text))).toBe(false);
    }
    const ghostButton = page.locator('[data-writing-aid-ghost][data-typeahead-insert]:visible');
    const ghost = await ghostButton.count() ? await ghostButton.getAttribute('data-typeahead-insert') : undefined;
    const impression = {trace: diagnostics, eventId: event.eventId, prefixSha256: hash(event.prefix),
      ...(event.draft === undefined ? {} : {draftSha256: hash(event.draft)}), slate: items,
      ghostEligible: assets.ghostEligible, neuralEligible: assets.neuralEligible, assets,
      ...(ghost ? {ghost: {text: ghost, source: assets.neural ? 'neural' : 'visible-ui'}} : {})};
    impressions.push(impression);
    retainPartial('impressions', impression);
    const target = gold.get(event.eventId);
    // Query the observed outcome only after the slate is captured. This does
    // not change context, cache contents, scores, or visible suggestions.
    if (arm && target?.kind === 'word') {
      const sampled = await measureComponents(event.eventId, target.exactInsertion);
      const context = contexts.get(event.answerId);
      const component = {eventId: event.eventId, answerId: event.answerId, documentGroup: context?.documentGroup,
        captureVersion: 'n238-mixture-v1', subjectAssetSha256: sampled?.subjectAssetSha256,
        subject: sampled?.subject ?? context?.subject ?? 'other',
        probability: sampled?.assetSha256 === assets.ngram && sampled?.subjectAssetSha256 === assets.subjectPack
          ? sampled?.probability ?? null : null, assetSha256: assets.ngram, expectedAssetSha256: expectedNgram};
      components.push(component);
      retainPartial('components', component);
    }
    if (ghostCalibration) {
      const sample = assets.ghostEligible ? await measureGhost(event.eventId) : null;
      if (sample) expect(sample.modelFingerprint, 'neural bundle fingerprint during ghost capture').toBe(expectedNeural);
      const documentGroup = contexts.get(event.answerId)!.documentGroup;
      const opportunity = {eventId: event.eventId, answerId: event.answerId, documentGroup, eligible: assets.ghostEligible,
        measured: sample !== null, candidates: sample?.candidates?.length ?? 0, modelFingerprint: sample?.modelFingerprint};
      ghostOpportunities.push(opportunity);
      retainPartial('ghost-opportunities', opportunity);
      for (const candidate of sample?.candidates ?? []) {
        const row = {eventId: event.eventId, answerId: event.answerId, documentGroup, source: 'neural',
          modelFingerprint: sample?.modelFingerprint, measure: 'offline-exact', context: candidate.context, length: candidate.text.length,
          elapsedMs: candidate.elapsedMs, score: candidate.logProbability, exact: target!.exactGhost!.startsWith(candidate.text)};
        ghostCandidates.push(row);
        retainPartial('ghost-calibration', row);
      }
    }
    const chosen = items.findIndex(item => item.text === event.target);
    if (functionalTarget) expect(chosen).toBeGreaterThanOrEqual(0);
    if (chosen >= 0) {
      await slots.nth(chosen).click();
      await expect.poll(() => exactDraft(answer)).toBe(apply(event.prefix, items[chosen]));
    }
    if (graphTrial) await drainCoverage();
  }

  // Start each answer empty. Count every key or accepted exact offer once.
  // The greedy reader is idealized. The actions and resulting draft are real.
  for (const sample of captureOnly ? [] : answers) {
    const answer = await start(sample.route ?? defaultRoute, sample.answerId, false);
    let draft = '', assistedKeys = 0;
    const activeAssets = new Set<string>();
    const actions: {at: number; edit: Displayed}[] = [];
    while (draft.length < sample.answer.length) {
      if (draft) await painted(page);
      const {slots, items} = await slate(page, false);
      const assets = await observeAssets(sample.answerId, draft);
      if (assets.ngram) activeAssets.add(assets.ngram);
      if (assets.subjectPack) activeAssets.add(assets.subjectPack);
      if (assets.latex) activeAssets.add(assets.latex);
      if (assets.neural) activeAssets.add(assets.neural);
      let best = -1, next = draft;
      for (const [index, offer] of items.entries()) {
        if (!Number.isInteger(offer.start) || !Number.isInteger(offer.end) || offer.start < 0 ||
            offer.start > offer.end || offer.end > draft.length) continue;
        const candidate = apply(draft, offer);
        if ((offer.caret === undefined || offer.caret === candidate.length) && candidate.length > next.length && sample.answer.startsWith(candidate)) {best = index; next = candidate;}
      }
      const ghostButton = page.locator('[data-writing-aid-ghost][data-typeahead-insert]:visible');
      const ghost = await ghostButton.count() ? (await ghostButton.getAttribute('data-typeahead-insert') ?? '') : '';
      const ghostNext = draft + ghost;
      if (ghostNext.length > next.length && sample.answer.startsWith(ghostNext)) {
        await ghostButton.click();
        next = ghostNext;
      } else if (best >= 0) {
        const offered = items[best];
        actions.push({at: draft.length, edit: offered});
        await slots.nth(best).click();
        if (offered.caret !== undefined) {
          const applied = await page.evaluate(() => (window as Window & {lastTypeaheadAcceptance?: {
            after: string; selection: number[]; edit: {start: number; end: number; insert: string}}}).lastTypeaheadAcceptance);
          expect(applied?.after).toBe(next);
          expect(applied?.selection).toEqual([offered.caret, offered.selectionEnd ?? offered.caret]);
          expect(applied?.edit).toMatchObject({start: offered.start, end: offered.end, insert: offered.text});
        }
      } else {
        const codePoint = sample.answer.codePointAt(draft.length)!;
        const char = String.fromCodePoint(codePoint);
        await page.keyboard.insertText(char);
        next = draft + char;
      }
      assistedKeys++;
      await expect.poll(() => exactDraft(answer)).toBe(next);
      draft = next;
    }
    const counted = {answerId: sample.answerId, actions, manualKeys: [...sample.answer].length, assistedKeys,
      costDefinition: 'full-answer-v1', assetSha256: [...activeAssets].sort()};
    keys.push(counted);
    retainPartial('keys', counted);
  }
  await info.attach('typeahead-impressions.jsonl', {body: Buffer.from(lines(impressions)), contentType: 'application/x-ndjson'});
  await info.attach('typeahead-keys.jsonl', {body: Buffer.from(lines(keys)), contentType: 'application/x-ndjson'});
  if (editor) await drainCoverage();
  if (expectedNgram) expect(modelAssets.has(expectedNgram), 'n-gram model was observed on at least one replay edit').toBe(true);
  if (expectedLatex) expect(modelAssets.has(expectedLatex), 'LaTeX model was observed on at least one replay edit').toBe(true);
  for (const [subject, fingerprint] of Object.entries(expectedSubjectPacks)) {
    expect(subjectAssets.get(subject)?.has(fingerprint), 'subject pack was observed on a replay edit in ' + subject).toBe(true);
  }
  const observedNeuralFingerprints = [...new Set(neuralCoverage.map(event => event.modelFingerprint)
    .filter((value): value is string => typeof value === 'string'))].sort();
  if (expectedNeural) for (const fingerprint of observedNeuralFingerprints) {
    expect(fingerprint, 'observed neural bundle fingerprint during replay').toBe(expectedNeural);
  }
  const neuralResults = {
    observedFingerprints: observedNeuralFingerprints,
    deliveredOnTimeScoredReplies: neuralCoverage.filter(event => event.modelFingerprint && event.matchedPending &&
      event.arrivedBeforeDeadline && !event.late && Number(event.scored) > 0).length,
    deliveredOnTimeContinuationReplies: neuralCoverage.filter(event => event.modelFingerprint && event.matchedPending &&
      event.arrivedBeforeDeadline && !event.late && event.hasContinuation).length,
    lateReplies: neuralCoverage.filter(event => event.late).length,
    admissions: [...new Map(neuralCoverage.filter(event => event.admission)
      .map(event => [JSON.stringify(event.admission), event.admission])).values()],
  };
  if (strictGraphTrial) for (const detail of neuralResults.admissions) {
    const admission = detail as {result: string; totalBytes: number; limitBytes: number};
    if (admission.result === 'selected') expect(admission.totalBytes).toBeLessThanOrEqual(admission.limitBytes);
  }
  const totalObservations = assetCounts.ngram + assetCounts.empty + assetCounts.ineligible + assetCounts['no-current-model'];
  const audit = {arm: arm ?? 'personal', graphTrial, strictGraphTrial, expectedNeuralFingerprint: expectedNeural,
    neuralResults, captureOnly, ghostCalibration, assetSha256: [...modelAssets].sort(),
    subjectAssetSha256: Object.fromEntries([...subjectAssets].map(([subject, fingerprints]) => [subject, [...fingerprints].sort()])),
    assetCounts, withoutCurrentFingerprint: {subject: totalObservations - assetCounts.subject, latex: totalObservations - assetCounts.latex,
      neural: totalObservations - assetCounts.neural}, events: impressions.length, answers: keys.length};
  await info.attach('typeahead-models.json', {body: Buffer.from(JSON.stringify(audit)), contentType: 'application/json'});
  if (output) {
    writeFileSync(output + '.components.jsonl', lines(components));
    if (ghostCalibration) {
      writeFileSync(output + '.ghost-calibration.jsonl', lines(ghostCandidates));
      writeFileSync(output + '.ghost-opportunities.jsonl', lines(ghostOpportunities));
    }
    writeFileSync(output + '.neural-coverage.jsonl', lines(neuralCoverage));
    writeFileSync(output + '.assets.json', JSON.stringify(audit, null, 2) + '\n');
    writeFileSync(output + '.impressions.jsonl', lines(impressions));
    writeFileSync(output + '.keys.jsonl', lines(keys));
  }
});

test('reloads an accepted span with the draft and preserves a full provenance record', async ({page}) => {
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch,typeaheadV2,tutorAnswerAids#' + defaultRoute);
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await answer.focus();
  await page.keyboard.type('Could you clarify the nota');
  const word = page.getByRole('button', {name: 'Insert notation', exact: true});
  await expect(word).toBeVisible();
  await word.click();
  const readSaved = () => page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(value => value.endsWith(':question'));
    const raw = key ? sessionStorage.getItem(key) ?? '' : '';
    return raw.startsWith('\u0000lemma-accepted-v1\n') ? JSON.parse(raw.slice(raw.indexOf('\n') + 1)) : null;
  });
  await expect.poll(readSaved).toMatchObject({text: 'Could you clarify the notation ', spans: [{text: 'tion'}]});
  await page.reload();
  await expect.poll(() => exactDraft(answer)).toBe('Could you clarify the notation ');
  await answer.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('here');
  await expect.poll(() => exactDraft(answer)).toBe('Could you clarify the notation here');
  await expect.poll(readSaved).toMatchObject({text: 'Could you clarify the notation here', spans: [{text: 'tion'}]});

  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(value => value.endsWith(':question'))!;
    const spans = Array.from({length: 32}, (_, index) =>
      ({start: 2 * index, end: 2 * index + 1, text: 'x', source: 'word'}));
    sessionStorage.setItem(key, '\u0000lemma-accepted-v1\n' + JSON.stringify({text: 'x '.repeat(32) + 'Could you clarify the ', spans}));
  });
  await page.reload();
  await answer.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('nota');
  await expect.poll(() => exactDraft(answer)).toBe('x '.repeat(32) + 'Could you clarify the nota');
  await painted(page);
  await expect(word).toHaveCount(0);
  await expect.poll(async () => (await readSaved())?.spans.length).toBe(32);
});
