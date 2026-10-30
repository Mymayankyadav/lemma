// Temporary: phone screenshots of every screen for design review (review/** branches only).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const base = 'http://localhost:4173/lemma/';
const themes = ['graph', 'graph-night', 'euclid'];
const routes = [['01-today','/'],['02-projects','/projects'],['03-new-project','/projects/new'],['04-path','/p/real-analysis'],['05-checkpoint','/p/real-analysis/cp/CP5'],['06-session','/s/real-analysis/7'],['07-approve','/proposals'],['08-review','/review'],['09-card','/review/run'],['10-cards','/cards'],['11-card','/cards/7'],['12-atlas','/atlas'],['13-insights','/insights'],['14-settings','/settings']];
const b = await chromium.launch();
for (const t of themes) {
  mkdirSync('review-shots/' + t, { recursive: true });
  const ctx = await b.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:2, colorScheme: t.endsWith('night') ? 'dark' : 'light' });
  await ctx.addInitScript(th => { try { localStorage.setItem('lemma.ui', JSON.stringify({ theme: th, density:'compact', effects:'calm' })); } catch (e) {} }, t);
  const p = await ctx.newPage();
  for (const [n, r] of routes) {
    try { await p.goto(base + '?demo=1#' + r, { waitUntil:'networkidle' }); await p.waitForTimeout(1200);
      await p.screenshot({ path:`review-shots/${t}/${n}.png` }); await p.screenshot({ path:`review-shots/${t}/${n}-full.png`, fullPage:true }); console.log('shot', t, n); }
    catch (e) { console.log('fail', t, n, e.message.slice(0, 80)); }
  }
  await ctx.close();
}
await b.close();
