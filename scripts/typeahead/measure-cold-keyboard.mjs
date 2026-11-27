// Compare two local, flag-enabled production previews. No user profile, remote tutor or hosted weights.
import {chromium, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const bases = process.argv.slice(2, 4).map(value => new URL(value));
if (bases.length !== 2 || bases.some(url => !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:')) {
  throw new Error('Usage: node scripts/typeahead/measure-cold-keyboard.mjs http://localhost:4173 http://localhost:4174');
}
const expected = JSON.parse(readFileSync(new URL('../../public/models/typeahead/ngram-v2/manifest.json', import.meta.url))).sha256;
const route = '/lemma/?demo=1&flags=v7Shell,v6Shell,tutorScratch,tutorAnswerAids,typeaheadV2#/p/real-analysis/cp/CP4/tutor';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE});
try {
  const samples = [];
  for (let i = 0; i < 24; ++i) {
    const arm = [0, 1, 1, 0][i % 4];
    const context = await browser.newContext({viewport: {width:393, height:873}, reducedMotion:'reduce', serviceWorkers:'block'});
    try {
      await context.addInitScript(() => {
        const Native = window.Worker;
        window.Worker = class extends Native {
          constructor(url, options) {
            super(url, options);
            if (!String(url).includes('ngram.worker')) return;
            const at = performance.now();
            this.addEventListener('message', ({data}) => {
              if (data.preloaded) performance.mark('bench-dictionary-ready', {detail: performance.now() - at});
            });
          }
        };
      });
      const page = await context.newPage();
      await page.goto(new URL(route, bases[arm]).href);
      const answer = page.getByRole('textbox', {name:'Your answer', exact:true});
      const open = page.getByRole('button', {name:'Write a question', exact:true});
      await expect(open.or(answer).filter({visible:true}).first()).toBeVisible();
      if (!await answer.isVisible()) await open.click();
      await answer.focus();
      await page.keyboard.type('def');
      await expect(answer).toHaveText('def');
      await page.waitForFunction(() => performance.getEntriesByName('bench-dictionary-ready').length &&
        performance.getEntriesByName('lemma.typeahead.ngram').at(-1)?.detail.editorRevision === 3, undefined, {timeout:20_000});
      const row = await page.evaluate(() => {
        const get = name => performance.getEntriesByName(name).at(-1).detail;
        const {elapsedMs, computeMs, assetSha256, failures, timeouts, requests, dropped} = get('lemma.typeahead.ngram');
        return {readyMs:get('bench-dictionary-ready'), elapsedMs, computeMs, assetSha256, failures, timeouts, requests, dropped};
      });
      if (row.assetSha256 !== expected || row.failures || row.timeouts) throw new Error('Unexpected or failed decoder');
      samples.push({arm, ...row});
    } finally {await context.close();}
  }
  console.log(JSON.stringify({chromium:browser.version(), order:'ABBA × 6', samples}, null, 2));
} finally {await browser.close();}
