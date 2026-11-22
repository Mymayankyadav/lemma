import {readFileSync} from 'node:fs';
import {expect, test, type Locator, type Page} from '@playwright/test';

const lexiconUrl = '**/models/writing-decoder/unigram-v1/lexicon.json';
const lexiconFile = new URL('../../public/models/writing-decoder/unigram-v1/lexicon.json', import.meta.url);
const wordStrip = (page: Page) => page.getByRole('group', {name: 'Word suggestions', exact: true});
const enabledWords = (page: Page) => wordStrip(page).locator('button:enabled');
const word = (page: Page, value: string) => wordStrip(page).getByRole('button', {name: `Insert ${value}`, exact: true});
const undo = (page: Page) => page.getByRole('button', {name: 'Undo suggestion', exact: true});
const labels = (page: Page) => enabledWords(page).evaluateAll(nodes =>
  nodes.map(node => node.getAttribute('aria-label')!.replace(/^Insert /u, '')));

async function openAnswer(page: Page, decoder = true) {
  await page.goto(`/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch,${decoder ? '' : '-'}writingDecoder#/p/real-analysis/cp/CP4/tutor`);
  await page.getByRole('button', {name: 'Write a question', exact: true}).click();
  const answer = page.getByRole('textbox', {name: 'Your answer', exact: true});
  await expect(answer).toHaveAttribute('contenteditable', 'true');
  return answer;
}

async function typeDraft(page: Page, answer: Locator, text: string) {
  await answer.fill('');
  await answer.focus();
  await page.keyboard.type(text);
  await expect(answer).toHaveJSProperty('textContent', text);
}

async function setMode(page: Page, mode: 'Off' | 'Faster typing') {
  await page.getByRole('button', {name: 'Edit answer', exact: true}).click();
  await page.getByRole('dialog', {name: 'Answer actions', exact: true})
    .getByRole('button', {name: 'Writing assistance', exact: true}).click();
  await page.getByRole('dialog', {name: 'Writing assistance', exact: true})
    .getByRole('radio', {name: new RegExp(`^${mode}\\b`, 'u')}).check();
  await page.keyboard.press('Escape');
}

interface DecoderProbe {
  created: number;
  results: number;
  unavailable: number;
  prefixes: string[];
  held: number;
  release: () => void;
}
type ProbedWindow = Window & {__writingDecoderProbe: DecoderProbe};

/** Hold real worker replies without replacing decoding or the hash-verified asset. */
async function probeWorker(page: Page, hold = false) {
  await page.addInitScript(({hold}) => {
    const NativeWorker = window.Worker;
    let holding = hold;
    const pending: Array<() => void> = [];
    const state: DecoderProbe = {created: 0, results: 0, unavailable: 0, prefixes: [], held: 0,
      release: () => {
        holding = false;
        // Deliver the oldest request last: cancellation cannot rely on reply order.
        for (const deliver of pending.splice(0).reverse()) deliver();
        state.held = 0;
      },
    };
    (window as ProbedWindow).__writingDecoderProbe = state;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('writingDecoder')) return;
        state.created++;
        this.addEventListener('message', event => {
          if (event.data?.type === 'unavailable') state.unavailable++;
          if (event.data?.type !== 'result') return;
          state.results++;
          state.prefixes.push(String(event.data.prefix));
          if (holding) {
            event.stopImmediatePropagation();
            const data: unknown = event.data;
            pending.push(() => this.dispatchEvent(new MessageEvent('message', {data})));
            state.held = pending.length;
          }
        });
      }
    };
  }, {hold});
}

const probe = (page: Page) => page.evaluate(() => {
  const {created, results, unavailable, prefixes, held} = (window as ProbedWindow).__writingDecoderProbe;
  return {created, results, unavailable, prefixes, held};
});
async function releaseReplies(page: Page) {
  await page.evaluate(() => (window as ProbedWindow).__writingDecoderProbe.release());
  // Let promise continuations and React paint before asserting that nothing stale appeared.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('flag-off keeps baseline suggestions and never starts or fetches the decoder', async ({page, context}) => {
  await probeWorker(page);
  const assets: string[] = [];
  context.on('request', request => {if (request.url().includes('/models/writing-decoder/')) assets.push(request.url());});
  const answer = await openAnswer(page, false);
  await typeDraft(page, answer, 'nota');
  await expect(word(page, 'notation')).toBeEnabled();
  await word(page, 'notation').click();
  await expect(answer).toHaveJSProperty('textContent', 'notation ');
  await undo(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'nota');
  expect(assets).toEqual([]);
  expect((await probe(page)).created).toBe(0);
});

test('loading the lexicon keeps safe fallback offers and typing responsive', async ({page, context}) => {
  await probeWorker(page);
  let release!: () => void;
  let requested = 0;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await context.route(lexiconUrl, async route => {
    requested++;
    await gate;
    await route.continue();
  });
  const answer = await openAnswer(page);
  await setMode(page, 'Faster typing');
  try {
    await typeDraft(page, answer, 'The function is cont');
    await expect.poll(() => requested).toBe(1);
    await expect(word(page, 'contain')).toBeEnabled();
    for (const blocked of ['continuous', 'continuity', 'continuously']) {
      await expect(word(page, blocked)).toHaveCount(0);
    }
    await expect(answer).toHaveJSProperty('textContent', 'The function is cont');
    await typeDraft(page, answer, 'nota');
    await expect(word(page, 'notation')).toBeEnabled();
    await page.keyboard.type('t');
    await expect(answer).toHaveJSProperty('textContent', 'notat');
    await expect(word(page, 'notation')).toBeEnabled();
    expect((await probe(page)).results).toBe(0);
    release();
    await expect.poll(async () => (await probe(page)).prefixes.includes('notat')).toBe(true);
    await expect(answer).toHaveJSProperty('textContent', 'notat');
    await expect(word(page, 'notation')).toBeEnabled();
    expect(requested).toBe(1);
  } finally {
    release();
  }
});

test('a same-size corrupt asset fails closed and preserves fallback acceptance and Undo', async ({page, context}) => {
  await probeWorker(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const original = readFileSync(lexiconFile, 'utf8');
  const corrupted = original.replace(/("word"\s*:\s*")([a-z])/u,
    (_, start: string, first: string) => start + (first === 'a' ? 'b' : 'a'));
  expect(corrupted).not.toBe(original);
  expect(Buffer.byteLength(corrupted)).toBe(Buffer.byteLength(original));
  let requests = 0;
  await context.route(lexiconUrl, route => {
    requests++;
    return route.fulfill({contentType: 'application/json', body: corrupted});
  });
  const answer = await openAnswer(page);
  await setMode(page, 'Faster typing');
  await typeDraft(page, answer, 'nota');
  await expect.poll(async () => (await probe(page)).unavailable).toBeGreaterThan(0);
  await expect(word(page, 'notation')).toBeEnabled();
  expect((await probe(page)).results).toBe(0);
  await word(page, 'notation').click();
  await expect(answer).toHaveJSProperty('textContent', 'notation ');
  await undo(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'nota');
  await page.keyboard.type('t');
  await expect(word(page, 'notation')).toBeEnabled();
  await typeDraft(page, answer, 'The function is cont');
  await expect(word(page, 'contain')).toBeEnabled();
  for (const blocked of ['continuous', 'continuity', 'continuously']) {
    await expect(word(page, blocked)).toHaveCount(0);
  }
  await expect(answer).toHaveJSProperty('textContent', 'The function is cont');
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
});

for (const failure of ['constructor', 'runtime'] as const) {
  test(`worker ${failure} failure keeps the ordinary word strip usable`, async ({page}) => {
    await page.addInitScript(({failure}) => {
      const NativeWorker = window.Worker;
      (window as Window & {__decoderFailures: number}).__decoderFailures = 0;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          const decoder = String(url).includes('writingDecoder');
          if (decoder && failure === 'constructor') {
            (window as Window & {__decoderFailures: number}).__decoderFailures++;
            throw new DOMException('Test worker construction failure', 'SecurityError');
          }
          super(url, options);
          if (decoder) queueMicrotask(() => {
            (window as Window & {__decoderFailures: number}).__decoderFailures++;
            this.dispatchEvent(new ErrorEvent('error', {message: 'Test worker runtime failure', cancelable: true}));
            this.terminate();
          });
        }
      };
    }, {failure});
    const answer = await openAnswer(page);
    await typeDraft(page, answer, 'nota');
    await expect.poll(() => page.evaluate(() => (window as Window & {__decoderFailures: number}).__decoderFailures)).toBe(1);
    await expect(word(page, 'notation')).toBeEnabled();
    await page.keyboard.type('t');
    await expect(answer).toHaveJSProperty('textContent', 'notat');
    await word(page, 'notation').click();
    await expect(answer).toHaveJSProperty('textContent', 'notation ');
    await undo(page).click();
    await expect(answer).toHaveJSProperty('textContent', 'notat');
    expect(await page.evaluate(() => (window as Window & {__decoderFailures: number}).__decoderFailures)).toBe(1);
  });
}

test('a failed worker module download preserves fallback without retrying on each key', async ({page, context}) => {
  await probeWorker(page);
  let blocked = 0;
  await context.route(/\/writingDecoder\.worker[^/]*\.(?:js|ts)(?:\?.*)?$/u, route => {
    // PWA precaching fetches the entry too; fail the editor's actual worker module request.
    if (route.request().serviceWorker()) return route.continue();
    blocked++;
    return route.abort('failed');
  });
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'nota');
  await expect.poll(() => blocked).toBe(1);
  await expect(word(page, 'notation')).toBeEnabled();
  await page.keyboard.type('t');
  await expect(answer).toHaveJSProperty('textContent', 'notat');
  await word(page, 'notation').click();
  await expect(answer).toHaveJSProperty('textContent', 'notation ');
  await undo(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'notat');
  expect(blocked).toBe(1);
  expect((await probe(page)).created).toBe(1);
});

test('out-of-order worker replies cannot restore candidates for an older draft', async ({page}) => {
  await probeWorker(page, true);
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'nota');
  await expect.poll(async () => (await probe(page)).held).toBeGreaterThan(0);
  await typeDraft(page, answer, 'denomina');
  await expect.poll(async () => (await probe(page)).prefixes.includes('denomina')).toBe(true);
  await releaseReplies(page);
  await expect(word(page, 'denominator')).toBeEnabled();
  expect((await labels(page)).every(label => label.startsWith('denomina'))).toBe(true);
  await expect(word(page, 'notation')).toHaveCount(0);
  await expect(answer).toHaveJSProperty('textContent', 'denomina');
  await expect(undo(page)).toHaveCount(0);
});

test('a worker reply after a selection change cannot become actionable', async ({page}) => {
  await probeWorker(page, true);
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'nota');
  await expect.poll(async () => (await probe(page)).held).toBeGreaterThan(0);
  await answer.press('Shift+ArrowLeft');
  await expect(enabledWords(page)).toHaveCount(0);
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected).toBe('a');
  await releaseReplies(page);
  await expect(enabledWords(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(selected);
  await expect(answer).toHaveJSProperty('textContent', 'nota');
  await expect(undo(page)).toHaveCount(0);
});

test('turning assistance off retires a pending worker reply', async ({page}) => {
  await probeWorker(page, true);
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'nota');
  await expect.poll(async () => (await probe(page)).held).toBeGreaterThan(0);
  await setMode(page, 'Off');
  await releaseReplies(page);
  await expect(enabledWords(page)).toHaveCount(0);
  await expect(answer).toHaveJSProperty('textContent', 'nota');
  await answer.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('tion');
  await expect(answer).toHaveJSProperty('textContent', 'notation');
  await expect(enabledWords(page)).toHaveCount(0);
  await expect(undo(page)).toHaveCount(0);
});

test('decoder suggestions remain explicit and preserve tap, Tab continuation and Undo', async ({page}) => {
  await probeWorker(page);
  const answer = await openAnswer(page);
  await typeDraft(page, answer, 'I am reco');
  await expect.poll(async () => (await probe(page)).prefixes.includes('reco')).toBe(true);
  // Record is a neutral writing word absent from the baseline's reco suggestions.
  await expect(word(page, 'record')).toBeEnabled();
  await expect(answer).toHaveJSProperty('textContent', 'I am reco');
  await word(page, 'record').click();
  await expect(answer).toHaveJSProperty('textContent', 'I am record ');
  await expect(answer).toBeFocused();
  await undo(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'I am reco');

  // Tab accepts the existing ghost surface; word-strip acceptance remains a tap.
  await typeDraft(page, answer, 'could you restate');
  await expect(answer).toHaveAttribute('data-completion', ' the question');
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
  await answer.press('Tab');
  await expect(answer).toHaveJSProperty('textContent', 'could you restate the question');
  await expect(answer).toBeFocused();
  await undo(page).click();
  await expect(answer).toHaveJSProperty('textContent', 'could you restate');
});

test('the expanded vocabulary does not fill proof choices, quoted text or code', async ({page}) => {
  await probeWorker(page);
  const answer = await openAnswer(page);
  await setMode(page, 'Faster typing');
  await typeDraft(page, answer, 'nota');
  await expect.poll(async () => (await probe(page)).results).toBeGreaterThan(0);
  for (const text of ['We prove this by ind', 'Let X and Y be sets. Take a in ', 'if',
    'Tutor: denomi', 'identifier denomi', '`denomi', '$denomi']) {
    await typeDraft(page, answer, text);
    await expect(enabledWords(page), text).toHaveCount(0);
    await expect(page.locator('[data-writing-aid-ghost]'), text).toHaveCount(0);
    await expect(answer).toHaveJSProperty('textContent', text);
  }
  await typeDraft(page, answer, 'I used contra');
  await expect.poll(async () => (await probe(page)).prefixes.includes('contra')).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const offered = await labels(page);
  for (const forbidden of ['contradiction', 'contrapositive', 'contradictory', 'contradicted', 'contradict', 'contradictions']) {
    expect(offered).not.toContain(forbidden);
  }
  await expect(answer).toHaveJSProperty('textContent', 'I used contra');
  await expect(undo(page)).toHaveCount(0);
});
