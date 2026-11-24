import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {liveTutorFixtureResponse, prepareLiveTutor} from './helpers/live-tutor';
import type {AnswerAidDraft} from '../../supabase/functions/_shared/tutor-answer-aids';

type ReplayEvent = {eventId: string; answerId: string; prefix: string; target?: string; route?: string};
type ReplayAnswer = {answerId: string; answer: string; route?: string; question?: string; subject?: string; aid?: AnswerAidDraft};
type GoldEvent = {eventId: string; exactInsertion: string; kind: 'word' | 'symbol'};
type RuntimeAsset = {ngram?: string; neural?: string; graphTrial?: string; ghostEligible: boolean};
type Displayed = {text: string; family: string; start: number; end: number};
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

async function slate(page: Page) {
  const slots = page.getByRole('group', {name: /^(?:Answer|Word|Equation|LaTeX|Symbol) suggestions$/u})
    .locator('button:enabled[data-typeahead-insert]');
  const items = await slots.evaluateAll(nodes => nodes.map(node => {
    const button = node as HTMLButtonElement;
    const text = button.dataset.typeaheadInsert!;
    const family = button.dataset.typeaheadFamily ?? text.trim().toLowerCase().replace(/(?:ing|ers?|ed|es|s|ly|ment|ions?|al)$/u, '').slice(0, 5);
    return {text, family, start: Number(button.dataset.typeaheadStart), end: Number(button.dataset.typeaheadEnd)};
  }));
  expect(items.length).toBeLessThanOrEqual(3);
  return {slots, items};
}

async function painted(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

function apply(draft: string, offer: Displayed) {
  return draft.slice(0, offer.start) + offer.text + draft.slice(offer.end);
}

test('replays visible typeahead quality and an actual full-answer typing trajectory', async ({page}, info) => {
  const eventInput = process.env.LEMMA_TYPEAHEAD_REPLAY_INPUT;
  const answerInput = process.env.LEMMA_TYPEAHEAD_REPLAY_ANSWERS;
  const events = input(eventInput, fixture);
  const answers = input(answerInput, eventInput ? [] : fixtureAnswers);
  test.setTimeout(eventInput || answerInput ? 1_800_000 : 60_000);
  const output = process.env.LEMMA_TYPEAHEAD_REPLAY_OUTPUT;
  const flags = process.env.LEMMA_TYPEAHEAD_REPLAY_FLAGS ?? 'typeaheadV2,tutorAnswerAids,proofAssistGhost';
  const arm = process.env.LEMMA_TYPEAHEAD_REPLAY_ARM;
  const graphTrial = process.env.LEMMA_TYPEAHEAD_REPLAY_GRAPH_TRIAL === '1';
  const modelAssets = new Set<string>();
  const gold = new Map(input<GoldEvent>(process.env.LEMMA_TYPEAHEAD_REPLAY_GOLD, []).map(event => [event.eventId, event]));
  const components = [];
  const neuralCoverage: Array<Record<string, unknown>> = [];
  const impressions = [];
  const keys = [];
  let opened: string | undefined;
  let editor: Locator | undefined;
  const contexts = new Map(answers.map(value => [value.answerId, value]));
  let active: ReplayAnswer | undefined;
  if (answers.some(sample => sample.question)) {
    const {threadId, payload} = await prepareLiveTutor(page);
    const turnId = '99999999-9999-4999-8999-999999999999';
    const id = '77777777-7777-4777-8777-777777777777';
    await page.route('**/rest/v1/**', route => {
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

  async function observeAssets(): Promise<RuntimeAsset> {
    const model = await page.locator('form.composer').evaluate(form => {
      const data = (form as HTMLElement).dataset;
      return {ngram: data.typeaheadNgramSha, neural: data.typeaheadNeuralSha, graphTrial: data.typeaheadGraphTrial,
        ghostEligible: data.typeaheadGhostEligible === '1'};
    });
    if (model.ngram) modelAssets.add(model.ngram);
    if (model.neural) modelAssets.add(model.neural);
    return model;
  }

  async function measureComponents(id: string, target: string) {
    return page.evaluate(({id, target}) => new Promise<{subject?: string; probability?: Record<string, number>} | null>(resolve => {
      function receive(event: Event) {
        const detail = (event as CustomEvent<{id: string; subject?: string; probability?: Record<string, number>}>).detail;
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

  async function drainCoverage() {
    const marks = await page.evaluate(() => {
      const out = performance.getEntriesByName('lemma.typeahead.neural.coverage', 'mark').map(mark => (mark as PerformanceMark).detail);
      performance.clearMarks('lemma.typeahead.neural.coverage');
      return out as Array<Record<string, unknown>>;
    });
    neuralCoverage.push(...marks);
  }

  async function start(route: string, answerId: string, frozen: boolean) {
    const context = contexts.get(answerId);
    const hasQuestion = Boolean(context?.question);
    const destination = hasQuestion ? '/p/logic/cp/CP1/tutor' : route;
    const key = [destination, hasQuestion ? answerId : '', frozen].join('|');
    if (!editor || key !== opened) {
      if (editor) await drainCoverage();
      active = context;
      const query = '/lemma/?typeahead-replay=1&demo=' + (hasQuestion ? '0' : '1') + '&flags=v7Shell,v6Shell,tutorScratch,' + encodeURIComponent(flags)
        + (arm ? '&typeahead-arm=' + encodeURIComponent(arm) : '') + (frozen ? '&typeahead-frozen-profile=1' : '') + (graphTrial ? '&typeahead-graph-trial=1' : '');
      await page.goto(query + '#' + destination);
      const open = page.getByRole('button', {name: 'Write a question', exact: true});
      editor = page.getByRole('textbox', {name: 'Your answer', exact: true});
      await expect(open.or(editor).first()).toBeVisible();
      if (await open.isVisible()) await open.click();
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      // All arms wait for the same asset-loading conditions, independent of the target.
      await page.waitForLoadState('networkidle');
      opened = key;
    }
    await editor.fill('');
    await editor.focus();
    return editor;
  }

  // Freeze eligibility opportunities before applying any gold decisions.
  for (const event of events) {
    const answer = await start(event.route ?? defaultRoute, event.answerId, true);
    await page.keyboard.type(event.prefix);
    await expect.poll(() => exactDraft(answer)).toBe(event.prefix);
    await painted(page);
    const {slots, items} = await slate(page);
    const assets = await observeAssets();
    if (!eventInput && event.eventId === 'blocked') {
      expect(items.some(item => /^(?:injective|surjective|bijective)\s*$/iu.test(item.text))).toBe(false);
    }
    const ghostButton = page.locator('[data-writing-aid-ghost][data-typeahead-insert]:visible');
    const ghost = await ghostButton.count() ? await ghostButton.getAttribute('data-typeahead-insert') : undefined;
    impressions.push({eventId: event.eventId, prefixSha256: hash(event.prefix), slate: items.map(({text, family}) => ({text, family})),
      ghostEligible: assets.ghostEligible, assets,
      ...(ghost ? {ghost: {text: ghost, source: assets.neural ? 'neural' : 'visible-ui'}} : {})});
    const target = gold.get(event.eventId);
    // Query the observed outcome only after the slate is captured. This does
    // not change context, cache contents, scores, or visible suggestions.
    if (arm && target?.kind === 'word') {
      const sampled = await measureComponents(event.eventId, target.exactInsertion);
      if (sampled?.probability && assets.ngram) components.push({eventId: event.eventId, subject: sampled.subject ?? 'other',
        probability: sampled.probability, assetSha256: assets.ngram});
    }
    const chosen = items.findIndex(item => item.text === event.target);
    if (!eventInput && process.env.LEMMA_TYPEAHEAD_REPLAY_FLAGS === undefined && event.target) expect(chosen).toBeGreaterThanOrEqual(0);
    if (chosen >= 0) {
      await slots.nth(chosen).click();
      await expect.poll(() => exactDraft(answer)).toBe(apply(event.prefix, items[chosen]));
    }
  }

  // Start each answer empty. Count every key or accepted exact offer once.
  // The greedy reader is idealized. The actions and resulting draft are real.
  for (const sample of answers) {
    const answer = await start(sample.route ?? defaultRoute, sample.answerId, false);
    let draft = '', assistedKeys = 0;
    const activeAssets = new Set<string>();
    while (draft.length < sample.answer.length) {
      if (draft) await painted(page);
      const {slots, items} = await slate(page);
      const assets = await observeAssets();
      if (assets.ngram) activeAssets.add(assets.ngram);
      if (assets.neural) activeAssets.add(assets.neural);
      let best = -1, next = draft;
      for (const [index, offer] of items.entries()) {
        if (!Number.isInteger(offer.start) || !Number.isInteger(offer.end) || offer.start < 0 ||
            offer.start > offer.end || offer.end > draft.length) continue;
        const candidate = apply(draft, offer);
        if (candidate.length > next.length && sample.answer.startsWith(candidate)) {best = index; next = candidate;}
      }
      const ghostButton = page.locator('[data-writing-aid-ghost][data-typeahead-insert]:visible');
      const ghost = await ghostButton.count() ? (await ghostButton.getAttribute('data-typeahead-insert') ?? '') : '';
      const ghostNext = draft + ghost;
      if (ghostNext.length > next.length && sample.answer.startsWith(ghostNext)) {
        await ghostButton.click();
        next = ghostNext;
      } else if (best >= 0) {
        await slots.nth(best).click();
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
    await observeAssets();
    keys.push({answerId: sample.answerId, manualKeys: [...sample.answer].length, assistedKeys, costDefinition: 'full-answer-v1', assetSha256: [...activeAssets].sort()});
  }
  await info.attach('typeahead-impressions.jsonl', {body: Buffer.from(lines(impressions)), contentType: 'application/x-ndjson'});
  await info.attach('typeahead-keys.jsonl', {body: Buffer.from(lines(keys)), contentType: 'application/x-ndjson'});
  if (editor) await drainCoverage();
  const audit = {arm: arm ?? 'personal', graphTrial, assetSha256: [...modelAssets].sort(), events: impressions.length, answers: keys.length};
  await info.attach('typeahead-models.json', {body: Buffer.from(JSON.stringify(audit)), contentType: 'application/json'});
  if (output) {
    writeFileSync(output + '.components.jsonl', lines(components));
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
