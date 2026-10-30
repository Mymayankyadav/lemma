// Takes phone screenshots of every main screen in demo mode (used by the review/screens workflow).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE_URL || 'http://localhost:4173/lemma/';
const routes = [
  ['01-home', '#/'], ['02-projects', '#/projects'], ['03-new-project', '#/projects/new'], ['04-project', '#/p/real-analysis'],
  ['05-checkpoint', '#/p/real-analysis/cp/CP5'], ['06-session', '#/s/real-analysis/7'], ['07-approve', '#/proposals'],
  ['08-plan', '#/proposals'], ['09-review', '#/review'], ['10-card', '#/review/run'], ['11-cards', '#/cards'],
  ['12-card-detail', '#/cards/7'], ['13-atlas', '#/atlas'], ['14-insights', '#/insights'], ['15-settings', '#/settings'],
];
mkdirSync('review-shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
for (const [name, hash] of routes) {
  await page.goto(base + '?demo=1' + hash, { waitUntil: 'networkidle' });
  if (name === '08-plan') { const t = page.getByRole('tab', { name: /plan/i }); if (await t.count()) await t.first().click(); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `review-shots/${name}.png` });
  await page.screenshot({ path: `review-shots/${name}-full.png`, fullPage: true });
  console.log('shot', name);
}
await browser.close();
