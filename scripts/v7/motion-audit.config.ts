import {resolve} from 'node:path';
import {defineConfig} from '@playwright/test';
import base from '../../playwright.config';
const external=process.env.LEMMA_AUDIT_BASE_URL;
const profile=process.env.LEMMA_MOTION_PROFILE==='1';
const browserNames=profile?['chromium']:['chromium','firefox','webkit'];
export default defineConfig({
  ...base,
  testDir:resolve(profile?'scripts/v7':'tests/e2e'),
  testMatch:profile?'**/motion-performance.spec.ts':['audit-motion-catalog', 'editor-surface-contracts', 'navigation-motion', 'surface-motion-audit',
    'v7-focus-desk-clock-menu', 'v7-study-surface-motion'].map(name=>'**/'+name+'.spec.ts'),
  outputDir:resolve('test-results/motion-audit'),
  reporter:[['list'],['html',{open:'never',outputFolder:resolve('playwright-report/motion-audit')}]],
  use:{...base.use,baseURL:external??base.use?.baseURL,video:profile?'off':'on',trace:profile?'off':'on'},
  ...(profile?{workers:1,retries:0}:{}),
  webServer:external?undefined:{...(base.webServer as {command:string;url:string}),cwd:resolve('.')},
  projects:browserNames.map(browserName=>({name:browserName,use:{browserName:browserName as 'chromium'|'firefox'|'webkit'}})),
});
