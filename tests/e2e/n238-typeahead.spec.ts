import {writeFile} from 'node:fs/promises';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {writingAidWeek} from '../../src/features/tutor/writingAid/adaptation';
import {createWritingAidModel} from '../../src/features/tutor/writingAid/learning';
import {decodeAuthoredDraft, encodeAuthoredDraft} from '../../src/features/tutor/writingAid/authorship';
import type {TutorThreadView} from '../../src/data/tutor/manual-api';
import type {TutorAnswerAid} from '../../supabase/functions/_shared/tutor-answer-aids';
import type {TutorAcceptedSpan} from '../../supabase/functions/_shared/tutor-answer';
import {liveTutorFixtureResponse, prepareLiveTutor} from './helpers/live-tutor';

const demo = '/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch,tutorAnswerAids,typeaheadV2#/p/real-analysis/cp/CP4/tutor';
const route = '/lemma/?demo=0&flags=v7Shell,tutorThreads,tutorScratch,tutorAnswerAids,typeaheadV2#/p/logic/cp/CP1/tutor';
const turnId = '99999999-9999-4999-8999-999999999999';
const aidId = '77777777-7777-4777-8777-777777777777';

async function answerField(page: Page, url: string) {
  await page.setViewportSize({width: 393, height: 873});
  await page.goto(url);
  const open = page.getByRole('button', {name: 'Write a question', exact: true});
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await expect(open.or(answer).filter({visible: true}).first()).toBeVisible({timeout: 15_000});
  if (!await answer.isVisible()) {
    try {await open.click({timeout: 5000});}
    catch (error) {if (!await answer.isVisible()) throw error;}
  }
  await expect(answer).toBeVisible();
  await answer.focus();
  return answer;
}

async function write(page: Page, answer: Locator, text: string) {
  await answer.fill('');
  await answer.focus();
  await page.keyboard.type(text);
  await expect(answer).toHaveJSProperty('textContent', text);
}

async function fixture(page: Page, released = true) {
  const {owner, cpId, threadId, payload} = await prepareLiveTutor(page, released);
  const old = {
    id: turnId, threadId, sequence: 1, version: 3, status: 'completed' as const,
    snapshot: {question: 'I can restate the given facts.', selectedContext: []},
    finalReply: {body: 'Try the notation. Do you mean injective or surjective?', turnId, messageId: 'reply-one',
      provenance: {kind: 'connector' as const, reportedHost: null, hostVerified: false as const}, citations: [], suggestions: []},
  };
  let thread: TutorThreadView = {head: {threadId, pendingTurnId: null, lastSequence: 1},
    turns: [old], recoveredDrafts: [], canSubmit: released, canConnect: false};
  let aid: TutorAnswerAid = {id: aidId, turnId, level: 'scaffold', version: 1, wording: ['With this notation', 'With this notion'],
    terms: ['injective', 'surjective'], symbols: [], withhold: ['not all', 'complement']};
  let turnReads = 0;
  let aidReads = 0;
  const submissions: {endpoint: string; args: Record<string, unknown>}[] = [];
  await page.route('**/rest/v1/**', request => {
    const req = request.request();
    const endpoint = new URL(req.url()).pathname.split('/rest/v1/')[1];
    if (endpoint === 'rpc/tutor_thread_state') {
      turnReads++;
      return request.fulfill({json: {...thread, readAt: new Date(Date.now() + turnReads).toISOString()}});
    }
    if (endpoint === 'rpc/tutor_answer_aid_state') {
      aidReads++;
      return request.fulfill({json: [aid]});
    }
    if (/^rpc\/tutor_owner_(?:assisted_start|command)$/.test(endpoint)) {
      const args = req.postDataJSON();
      submissions.push({endpoint, args});
      return request.fulfill({json: {status: 'submitted', operationId: args.p_command.operationId,
        turnId: args.p_command.operationId, version: 1}});
    }
    return request.fulfill({json: liveTutorFixtureResponse(payload, endpoint, req.headers().accept)});
  });
  return {
    submissions, owner, cpId,
    aidReads: () => aidReads,
    changeAid: (next: Partial<TutorAnswerAid>) => {aid = {...aid, ...next};},
    advance: () => {
      const id = '88888888-8888-4888-8888-888888888888';
      thread = {...thread, head: {...thread.head, lastSequence: 2}, turns: [...thread.turns, {
        ...old, id, sequence: 2, finalReply: {...old.finalReply, turnId: id, messageId: 'reply-two',
          body: 'This is the next question, with its own wording.'},
      }]};
    },
  };
}

const strip = (page: Page) => page.getByRole('group', {name: 'Answer suggestions', exact: true});
const best = (page: Page) => strip(page).locator('button.preferred');
const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

test('the Equation sheet completes a nested root argument, supports Undo, and preserves the caret', async ({page}, info) => {
  const answer = await answerField(page, demo);
  await page.keyboard.type('Given $x=1$.');
  const body = page.locator('body');
  const overflow = await body.evaluate(element => element.style.overflow);
  const equation = answer.getByRole('button', {name: 'Edit equation x=1', exact: true});
  await equation.click();
  const sheet = page.getByRole('dialog', {name: 'Equation', exact: true});
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(answer).toBeFocused();
  await expect.poll(() => body.evaluate(element => element.style.overflow)).toBe(overflow);
  await equation.click();
  const latex = sheet.getByRole('textbox', {name: 'LaTeX', exact: true});
  await latex.fill('\\begin{pmatrix}\\frac{1}{2}&\\sqrt{3}\\\\x&y\\end{pmatrix}');
  await expect(sheet.locator('.tutor-equation-preview .katex')).toBeVisible();
  await page.screenshot({path: info.outputPath('phone-nested-matrix.png')});
  const root = '\\sqrt[3]{\\frac{1}';
  await latex.fill(root);
  const nextArg = sheet.getByRole('button', {name: 'Insert {', exact: true});
  await nextArg.click();
  await expect(latex).toHaveValue(root + '{}');
  expect(await latex.evaluate((field: HTMLTextAreaElement) => field.selectionStart)).toBe(root.length + 1);
  await sheet.getByRole('button', {name: 'Undo LaTeX suggestion', exact: true}).click();
  await expect(latex).toHaveValue(root);
  await nextArg.click();
  await page.keyboard.type('2');
  await page.keyboard.press('End');
  await page.keyboard.type('}');
  await expect(latex).toHaveValue(root + '{2}}');
  await sheet.getByRole('button', {name: 'Done', exact: true}).click();
  await expect(answer.getByRole('button', {name: 'Edit equation ' + root + '{2}}', exact: true})).toBeVisible();
});

test('scoped tutor priority reranks the same prefix and a held tap cannot accept across aid versions', async ({page}, info) => {
  const setup = await fixture(page);
  setup.changeAid({wording: ['With this zzmoa', 'With this zzmob'], ranking: {version: 1, hints: [
    {id: 'zzmoa', entry: 'zzmoa', kind: 'word', priority: 'prefer', role: 'neutral', scope: {prefixes: ['zzmo']}},
    {id: 'zzmob', entry: 'zzmob', kind: 'word', priority: 'deemphasize', role: 'neutral', scope: {prefixes: ['zzmo']}},
  ]}});
  const answer = await answerField(page, route);
  await expect.poll(setup.aidReads).toBeGreaterThan(0);
  await write(page, answer, 'With this zzmo');
  await expect(best(page)).toHaveAccessibleName('Insert zzmoa');
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('lemma.typeahead.ngram').length)).toBeGreaterThan(0);
  const box = (await best(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const oldReads = setup.aidReads();
  setup.changeAid({version: 2, ranking: {version: 1, hints: [
    {id: 'zzmoa', entry: 'zzmoa', kind: 'word', priority: 'deemphasize', role: 'neutral', scope: {prefixes: ['zzmo']}},
    {id: 'zzmob', entry: 'zzmob', kind: 'word', priority: 'prefer', role: 'neutral', scope: {prefixes: ['zzmo']}},
  ]}});
  await refresh(page);
  await expect.poll(setup.aidReads).toBeGreaterThan(oldReads);
  await expect(strip(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(answer).toHaveJSProperty('textContent', 'With this zzmo');
  await write(page, answer, 'With this zzmo');
  await expect(best(page)).toHaveAccessibleName('Insert zzmob');
  await expect(strip(page).getByRole('button')).toHaveCount(3);
  await page.screenshot({path: info.outputPath('phone-contextual-rerank.png')});
  await best(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'With this zzmob ');
  await page.getByRole('button', {name: 'Undo suggestion', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', 'With this zzmo');
  await page.getByRole('button', {name: 'Send', exact: true}).click();
  await expect.poll(() => setup.submissions.map(item => item.endpoint)).toEqual(['rpc/tutor_owner_command']);
});

function stubEquationChoices(page: Page) {
  return page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {construct(Worker, args) {
      if (!String(args[0]).includes('latex.worker')) return Reflect.construct(Worker, args);
      const model = {
        onmessage: undefined as ((event: MessageEvent) => void) | undefined,
        postMessage({id}: {id: number}) {
          const results = [{insert: 'x', caret: 1, label: 'x', score: 0}, {insert: 'z', caret: 1, label: 'z', score: -1}];
          queueMicrotask(() => model.onmessage?.(new MessageEvent('message', {data: {id, results}})));
        },
        terminate() {},
      };
      return model;
    }});
  });
}

test('Equation suggestions guard the adjacent answer and retire held taps when the aid changes', async ({page}) => {
  await stubEquationChoices(page);
  const setup = await fixture(page);
  setup.changeAid({withhold: []});
  const answer = await answerField(page, route);
  const sheet = page.getByRole('dialog', {name: 'Equation', exact: true});
  const latex = sheet.getByRole('textbox', {name: 'LaTeX', exact: true});
  const x = sheet.getByRole('button', {name: 'Insert x', exact: true});
  const z = sheet.getByRole('button', {name: 'Insert z', exact: true});
  await answer.fill('𝒰 is not $y$.');
  await answer.getByRole('button', {name: 'Edit equation y', exact: true}).click();
  await latex.fill('');
  await expect(x).toBeVisible();
  await expect(z).toBeVisible();
  const box = (await x.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  setup.changeAid({version: 2, withhold: ['not z']});
  await refresh(page);
  await expect(z).toHaveCount(0);
  await expect(x).toBeVisible();
  await page.mouse.up();
  await expect(latex).toHaveValue('');

  setup.changeAid({version: 3, withhold: ['not x']});
  await refresh(page);
  await expect(z).toBeVisible();
  await expect(x).toHaveCount(0);
  await latex.fill('x');
  await sheet.getByRole('button', {name: 'Done', exact: true}).click();
  await expect(answer.getByRole('button', {name: 'Edit equation x', exact: true})).toBeVisible();

  setup.changeAid({version: 4, withhold: ['x holds']});
  await refresh(page);
  await answer.fill('𝒰 says $$y$$ holds.');
  await answer.getByRole('button', {name: 'Edit equation y', exact: true}).click();
  await latex.fill('');
  await expect(z).toBeVisible();
  await expect(x).toHaveCount(0);
  await z.click();
  await expect(latex).toHaveValue('z');
  await sheet.getByRole('button', {name: 'Undo LaTeX suggestion', exact: true}).click();
  await expect(latex).toHaveValue('');
});

test('Equation suggestions respect the exact retained span budget and allow manual edits at capacity', async ({page}) => {
  await stubEquationChoices(page);
  const {owner, cpId} = await fixture(page);
  const key = 'lemma.tutor.draft:' + JSON.stringify([owner, 'logic', cpId]) + ':question';
  const prefix = 'a '.repeat(30) + '$';
  const text = prefix + 'xy$';
  const spans: TutorAcceptedSpan[] = Array.from({length: 30}, (_, index) =>
    ({start: index * 2, end: index * 2 + 1, text: 'a', source: 'word'}));
  spans.push({start: prefix.length, end: prefix.length + 2, text: 'xy', source: 'symbol'});
  await page.addInitScript(({key, draft}) => localStorage.setItem(key, draft), {key, draft: encodeAuthoredDraft(text, spans)});
  const answer = await answerField(page, route);
  await answer.getByRole('button', {name: 'Edit equation xy', exact: true}).click();
  const sheet = page.getByRole('dialog', {name: 'Equation', exact: true});
  const latex = sheet.getByRole('textbox', {name: 'LaTeX', exact: true});
  const z = sheet.getByRole('button', {name: 'Insert z', exact: true});
  await expect(z).toBeVisible();
  await latex.press('Home');
  await latex.press('ArrowRight');
  await expect(z).toHaveCount(0);
  await latex.press('z');
  await expect(latex).toHaveValue('xzy');
  await sheet.getByRole('button', {name: 'Done', exact: true}).click();
  await expect(answer.getByRole('button', {name: 'Edit equation xzy', exact: true})).toBeVisible();
  await expect.poll(async () => decodeAuthoredDraft(await page.evaluate(key => localStorage.getItem(key) ?? '', key))).toEqual({
    text: prefix + 'xzy$', spans: [...spans.slice(0, -1),
      {start: prefix.length, end: prefix.length + 1, text: 'x', source: 'symbol'},
      {start: prefix.length + 2, end: prefix.length + 3, text: 'y', source: 'symbol'},
    ],
  });
});

test('a retained completion reaches the tutor with exact accepted UTF-16 offsets', async ({page}) => {
  const setup = await fixture(page);
  setup.changeAid({wording: ['With this zzmoa']});
  const answer = await answerField(page, route);
  await expect.poll(setup.aidReads).toBeGreaterThan(0);
  await page.keyboard.insertText('𝒰. ');
  await page.keyboard.type('With this zzmo');
  await strip(page).getByRole('button', {name: 'Insert zzmoa', exact: true}).click();
  await expect(answer).toHaveJSProperty('textContent', '𝒰. With this zzmoa ');
  await page.getByRole('button', {name: 'Send', exact: true}).click();
  await expect.poll(() => setup.submissions.length).toBe(1);
  expect(setup.submissions[0]).toMatchObject({endpoint: 'rpc/tutor_owner_assisted_start', args: {
    p_command: {question: '𝒰. With this zzmoa '},
    p_spans: [{start: '𝒰. With this zzmo'.length, end: '𝒰. With this zzmoa'.length, text: 'a'}],
  }});
});

test('reopening and editing an assisted equation retains its surviving origins', async ({page}) => {
  const setup = await fixture(page);
  await page.addInitScript(({owner, cpId}) => {
    const text = '𝒰. Given $x+y$.';
    const start = text.indexOf('$');
    const question = {text, spans: [{start, end: start + 5, text: '$x+y$', source: 'equation'}]};
    localStorage.setItem('lemma.tutor.draft:' + JSON.stringify([owner, 'logic', cpId]) + ':question',
      '\u0000lemma-accepted-v1\n' + JSON.stringify(question));
  }, {owner: setup.owner, cpId: setup.cpId});
  const answer = await answerField(page, route);
  await answer.getByRole('button', {name: 'Edit equation x+y', exact: true}).click();
  const sheet = page.getByRole('dialog', {name: 'Equation', exact: true});
  await sheet.getByRole('textbox', {name: 'LaTeX', exact: true}).fill('x+z');
  await sheet.getByRole('button', {name: 'Done', exact: true}).click();
  const edited = answer.getByRole('button', {name: 'Edit equation x+z', exact: true});
  await edited.click();
  await expect(sheet.getByRole('textbox', {name: 'LaTeX', exact: true})).toHaveValue('x+z');
  await sheet.getByRole('button', {name: 'Done', exact: true}).click();
  await page.getByRole('button', {name: 'Send', exact: true}).click();
  await expect.poll(() => setup.submissions.length).toBe(1);
  const start = '𝒰. Given '.length;
  expect(setup.submissions[0]).toMatchObject({endpoint: 'rpc/tutor_owner_assisted_start', args: {
    p_command: {question: '𝒰. Given $x+z$.'},
    p_spans: [
      {start, end: start + 3, text: '$x+', source: 'equation'},
      {start: start + 4, end: start + 5, text: '$', source: 'equation'},
    ],
  }});
});

test('withholding applies to the complete replacement and the next reply clears an old aid', async ({page}) => {
  const setup = await fixture(page);
  setup.changeAid({withhold: ['notation', 'not all'], ranking: {version: 1, hints: [
    {id: 'notation', entry: 'notation', kind: 'word', priority: 'prefer', role: 'given'},
  ]}, wording: ['With this notion']});
  const answer = await answerField(page, route);
  await expect.poll(setup.aidReads).toBeGreaterThan(0);
  await write(page, answer, 'With this notat');
  await expect(strip(page).getByRole('button', {name: 'Insert notation', exact: true})).toHaveCount(0);
  await write(page, answer, 'not al');
  await expect(strip(page).getByRole('button', {name: 'Insert all', exact: true})).toHaveCount(0);
  await write(page, answer, 'in');
  await expect(strip(page).getByRole('button', {name: 'Insert injective', exact: true})).toHaveCount(0);
  setup.advance();
  await refresh(page);
  await expect(page.getByRole('log', {name: 'Conversation'}).getByText('This is the next question, with its own wording.')).toBeVisible();
  await write(page, answer, 'With this notat');
  await expect(strip(page).getByRole('button', {name: 'Insert notation', exact: true})).toBeVisible();
});

test('read-only tutor history offers no actionable answer edits', async ({page}) => {
  const setup = await fixture(page, false);
  const answer = await answerField(page, route);
  await expect(answer).toHaveAttribute('aria-readonly', 'true');
  await expect(strip(page).getByRole('button', {name: /^Insert /u})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Send', exact: true})).toBeDisabled();
  expect(setup.submissions).toEqual([]);
});

test('signing out in another tab retires an open suggestion menu', async ({page, context}) => {
  const setup = await fixture(page);
  const answer = await answerField(page, route);
  await expect.poll(setup.aidReads).toBeGreaterThan(0);
  await write(page, answer, 'With this noti');
  await expect(best(page)).toBeEnabled();
  const settings = await context.newPage();
  await fixture(settings);
  await settings.goto('/lemma/?demo=0&flags=v7Shell,tutorThreads#/settings?section=data');
  await settings.getByRole('button', {name: 'Sign out', exact: true}).click();
  await expect(answer).toHaveCount(0);
  await expect(strip(page)).toHaveCount(0);
  expect(setup.submissions).toEqual([]);
});

test('photo actions track answer capacity while the scratch pad stays closed', async ({page}) => {
  const answer = await answerField(page, demo);
  const upload = page.getByRole('button', {name: 'Upload image', exact: true});
  await expect(upload).toBeEnabled();
  await answer.fill('a'.repeat(2000));
  await expect(upload).toBeDisabled();
  await answer.fill('My answer');
  await expect(upload).toBeEnabled();
});

test('writing assistance shows local weekly evidence and a reset control', async ({page}, info) => {
  const model = createWritingAidModel();
  Object.assign(writingAidWeek(model.adaptation), {impressions: 12, accepts: 4, retained: 3, undos: 1, keysSaved: 18});
  await page.addInitScript(value => localStorage.setItem('lemma.demo-tutor.writing-aid-model.v1:default', value),
    JSON.stringify({version: 1, enabled: true, model}));
  await page.setViewportSize({width: 393, height: 873});
  await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,typeaheadV2,writingAidSettings#/settings?section=tutor');
  const settings = page.getByRole('main');
  await settings.getByText('This week on this device', {exact: true}).click();
  const reset = settings.getByRole('button', {name: 'Forget learned writing preferences', exact: true});
  await expect(reset).toBeEnabled();
  await reset.scrollIntoViewIfNeeded();
  await expect(settings.getByText(/4 accepted of 12 displayed suggestions/)).toBeVisible();
  await page.screenshot({path: info.outputPath('phone-writing-assistance.png')});
  await reset.click();
  await expect(settings.getByText('This week on this device', {exact: true})).toHaveCount(0);
});

test('reports tap-to-paint for an empty and eight-equation draft at 4× CPU', async ({page}, info) => {
  const extended = process.env.LEMMA_TYPEAHEAD_PERF_EXTENDED === '1';
  const expectedAsset = process.env.LEMMA_TYPEAHEAD_EXPECTED_ASSET;
  test.setTimeout(extended ? 900_000 : 120_000);
  const answer = await answerField(page, demo);
  const keyboard = page.getByRole('group', {name: 'Answer keyboard', exact: true});
  await expect(keyboard).toHaveAttribute('data-decoder', 'ready', {timeout: 20_000});
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', {rate: 4});
  type Sample = {frameMs: number; domMs: number; clickDelayMs: number; physicalMs: number; presentationMs?: number;
    worker?: {computeMs: number; elapsedMs: number; assetSha256?: string; requests: number; dropped: number; failures: number; timeouts: number}};
  const measurement: Record<string, {samples: Sample[]; p95: number; p99: number; max: number; domP95: number; workerP95: number; roundTripP95: number; presentationP95?: number; presentationSamples: number}> = {};
  const quantile = (sorted: number[], value: number) => sorted[Math.ceil(value * sorted.length) - 1] ?? 0;
  const sorted = (values: number[]) => values.sort((a, b) => a - b);

  async function tap(button: Locator, target: string, expected: string) {
    await button.evaluate((node, state) => {
      const sink = window as typeof window & {typeaheadTap?: Sample};
      delete sink.typeaheadTap;
      performance.clearMarks('lemma.typeahead.ngram');
      let physicalStart = 0, start = 0, clickAt = 0, presentationMs: number | undefined;
      const timing = new PerformanceObserver(list => {
        const actual = list.getEntries().find(entry => entry.name === 'click' && Math.abs(entry.startTime - start) < 20);
        if (actual) presentationMs = actual.duration;
      });
      timing.observe({type: 'event', durationThreshold: 16} as PerformanceObserverInit);
      node.addEventListener('pointerdown', event => {physicalStart = event.timeStamp;}, {once: true, capture: true});
      node.addEventListener('click', () => {clickAt = performance.now();}, {once: true, capture: true});
      node.addEventListener('pointerup', event => {
        start = event.timeStamp;
        const field = document.querySelector(state.target);
        const finish = () => {
          const domMs = performance.now() - start;
          requestAnimationFrame(() => {
            const at = performance.now();
            requestAnimationFrame(() => {
              timing.disconnect();
              sink.typeaheadTap = {frameMs: at - start, domMs, clickDelayMs: clickAt - start,
                physicalMs: at - physicalStart, presentationMs};
            });
          });
        };
        const observer = new MutationObserver(() => {
          if (field?.textContent === state.expected) {observer.disconnect(); finish();}
        });
        if (field) observer.observe(field, {subtree: true, childList: true, characterData: true});
      }, {once: true, capture: true});
    }, {target, expected});
    const box = (await button.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const sample = await page.waitForFunction(() => (window as typeof window & {typeaheadTap?: Sample}).typeaheadTap, undefined, {timeout: 2500});
    return sample.jsonValue();
  }

  function record(name: string, samples: Sample[]) {
    const warm = samples.slice(1);
    const frame = sorted(warm.map(sample => sample.frameMs));
    const presented = sorted(warm.flatMap(sample => sample.presentationMs === undefined ? [] : [sample.presentationMs]));
    measurement[name] = {samples, p95: quantile(frame, .95), p99: quantile(frame, .99), max: frame.at(-1) ?? 0,
      domP95: quantile(sorted(warm.map(sample => sample.domMs)), .95),
      workerP95: quantile(sorted(warm.flatMap(sample => sample.worker ? [sample.worker.computeMs] : [])), .95),
      roundTripP95: quantile(sorted(warm.flatMap(sample => sample.worker ? [sample.worker.elapsedMs] : [])), .95),
      presentationP95: presented.length ? quantile(presented,.95) : undefined, presentationSamples: presented.length};
  }

  const equations = Array.from({length: 8}, (_, at) => '$x_' + at + '=1$').join(' ') + ' ';
  const scenarios = [
    {name:'empty', draft:'', key:'q', suffix:0, add:'q', remove:0},
    {name:'eightEquations', draft:equations, key:'q', suffix:0, add:'q', remove:0},
    {name:'sentenceBoundary', draft:'We finished.', key:'Space', suffix:0, add:' ', remove:0},
    {name:'deletePrefix', draft:'We use the lengt', key:'Delete', suffix:0, add:'', remove:1},
    {name:'interiorPrefix', draft:'We use the no here.', key:'t', suffix:6, add:'t', remove:0},
  ];
  for (const scenario of scenarios) {
    const samples: Sample[] = [];
    const key = keyboard.getByRole('button', {name:scenario.key, exact:true});
    for (let sample = 0; sample < (extended ? 101 : 10); sample++) {
      await answer.fill(scenario.draft);
      await answer.press('End');
      for (let i=0; i<scenario.suffix; i++) await answer.press('ArrowLeft');
      const before = await answer.evaluate(node => node.textContent ?? '');
      const caret = before.length - scenario.suffix;
      const expected = before.slice(0,caret-scenario.remove) + scenario.add + before.slice(caret);
      const timing = await tap(key, '[aria-label="Your answer"]', expected);
      const diagnostic = await page.waitForFunction(() => (performance.getEntriesByName('lemma.typeahead.ngram').at(-1) as PerformanceMark | undefined)?.detail,
        undefined, {timeout: sample ? 2500 : 12_000});
      const worker = await diagnostic.jsonValue() as NonNullable<Sample['worker']>;
      if (expectedAsset) expect(worker.assetSha256, 'verified n-gram asset used by timing worker').toBe(expectedAsset);
      samples.push({...timing, worker});
    }
    record(scenario.name, samples);
  }

  await page.evaluate(() => {
    const button = document.createElement('button');
    const text = document.createElement('span');
    button.type = 'button';
    button.textContent = 'Paint control';
    button.style.cssText = 'position:fixed;top:4px;right:4px;z-index:100000';
    text.id = 'typeahead-paint-control';
    button.append(text);
    document.body.append(button);
    button.onclick = () => {text.textContent = 'q';};
  });
  const control = page.getByRole('button', {name: 'Paint control', exact: true});
  const controlSamples: Sample[] = [];
  for (let index = 0; index < (extended ? 101 : 12); index++) {
    await page.locator('#typeahead-paint-control').evaluate(element => {element.textContent = '';});
    controlSamples.push(await tap(control, '#typeahead-paint-control', 'q'));
  }
  record('control', controlSamples);
  const path = info.outputPath('tap-to-paint-4x.json');
  await writeFile(path, JSON.stringify(measurement, null, 2));
  await info.attach('tap-to-paint-4x', {contentType: 'application/json', path});
  console.log('Typeahead tap-to-paint (4× CPU):', Object.fromEntries(Object.entries(measurement).map(([name, {samples, p95, p99, max, domP95, workerP95, roundTripP95, presentationP95, presentationSamples}]) =>
    [name, {warmSamples: samples.length - 1, tapP95Ms: p95, tapP99Ms: p99, tapMaxMs: max, domP95Ms: domP95,
      workerP95Ms: workerP95, roundTripP95Ms: roundTripP95, presentationP95Ms: presentationP95, presentationSamples, asset: samples.at(-1)?.worker?.assetSha256}])));
});
