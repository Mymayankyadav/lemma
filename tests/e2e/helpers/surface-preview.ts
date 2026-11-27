import type {Page} from '@playwright/test';
import {SURFACE_BETA_KEY} from '../../../src/app/surfaceBeta.ts';

/** Set the same device preference as Settings before the application boots. */
export async function enableSurfaceBeta(page: Page) {
  await page.addInitScript(key => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, '1');
  }, SURFACE_BETA_KEY);
}
