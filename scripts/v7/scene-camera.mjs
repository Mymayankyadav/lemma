#!/usr/bin/env node
/**
 * N157 · G1 "scene camera" (v7 UX audit r3, `04_ASSETS_AND_MOTION_PLAN.md` §3.4): opens a scene of the real app at fixed
 * data (the example workspace) and a fixed clock, optionally frames it (a device outline and a serif caption on paper),
 * and writes the image. One command regenerates every product picture made from the app:
 *
 *   VITE_ALLOW_FLAG_OVERRIDES=1 npm run build && npm run preview -- --port 4173
 *   node scripts/v7/scene-camera.mjs [scene …] [--base=http://localhost:4173/lemma/]
 *
 * Scenes: the install dialog's two screenshots (G0, N133) and the Android release page's image (A5′). The share images
 * are drawn by the app itself (`src/ui/v7/shareImage.ts`) and the site preview by `scripts/brand/og-image.mjs`.
 */
import {chromium} from '@playwright/test';

import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLOCK = '2026-11-12T10:20:00+05:30';
export const SCENES = {
  'install-day': {hash: '/', scheme: 'light', phone: [360, 640], scale: 3, out: 'public/screenshots/today-day-1080x1920.png'},
  'install-night': {hash: '/', scheme: 'dark', phone: [360, 640], scale: 3, out: 'public/screenshots/today-night-1080x1920.png'},
  'release': {hash: '/', scheme: 'light', phone: [360, 720], scale: 2, out: 'docs/release/android-release.png',
    frame: {size: [1200, 630], title: 'Lemma for Android', line: 'Your notebook, on your phone: today, review and focus.'}},
};

/** The framing page: the shot in a phone outline on the left, a serif caption on paper on the right. Pure. */
export function frameHtml({shot, size: [width, height], title, line}) {
  return `<main style="position:fixed;inset:0;width:${width}px;height:${height}px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;background:var(--v7-role-surface-page);color:var(--v7-role-text-primary);z-index:2147483647">
  <img src="${shot}" alt="" style="height:${height - 72}px;border-radius:36px;border:10px solid var(--v7-role-text-primary);box-shadow:0 18px 40px rgba(18,27,49,.18)">
  <div><h1 style="margin:0 0 16px;font:500 64px/1.05 var(--v7-serif,Georgia,serif);letter-spacing:-.01em">${title}</h1>
  <p style="margin:0;font:400 28px/1.35 var(--v7-sans,system-ui,sans-serif);color:var(--v7-role-text-secondary)">${line}</p></div></main>`;
}

export async function shoot(names, base = 'http://localhost:4173/lemma/') {
  const browser = await chromium.launch();
  try {
    for (const name of names) {
      const scene = SCENES[name];
      if (!scene) throw new Error('unknown scene ' + name + ' (known: ' + Object.keys(SCENES).join(', ') + ')');
      const [width, height] = scene.phone;
      const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: scene.scale, locale: 'en-IN', timezoneId: 'Asia/Kolkata', colorScheme: scene.scheme, reducedMotion: 'reduce'});
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(CLOCK));
      await page.goto(base + '?demo=1&flags=v7Shell,v6Shell#' + scene.hash);
      await page.waitForSelector('html[data-v7]');
      await page.waitForLoadState('networkidle');
      // The example workspace's chip and any toast are not part of the product picture.
      await page.addStyleTag({content: '.v7-demo-chip,.v7-toast-host{display:none!important}'});
      await page.waitForTimeout(500);
      const file = resolve(root, scene.out);
      if (!scene.frame) {
        await page.screenshot({path: file, animations: 'disabled'});
      } else {
        const shot = 'data:image/png;base64,' + (await page.screenshot({animations: 'disabled'})).toString('base64');
        await page.setViewportSize({width: scene.frame.size[0], height: scene.frame.size[1]});
        await page.evaluate(html => {document.body.insertAdjacentHTML('beforeend', html);}, frameHtml({shot, ...scene.frame}));
        await page.waitForTimeout(300);
        await page.screenshot({path: file, animations: 'disabled', clip: {x: 0, y: 0, width: scene.frame.size[0], height: scene.frame.size[1]}});
      }
      console.log('wrote', scene.out);
      await context.close();
    }
  } finally {await browser.close();}
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), base = args.find(arg => arg.startsWith('--base='))?.slice(7);
  const names = args.filter(arg => !arg.startsWith('--'));
  await shoot(names.length ? names : Object.keys(SCENES), base);
}
