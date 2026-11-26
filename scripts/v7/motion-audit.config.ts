import {resolve} from 'node:path';
import {defineConfig} from '@playwright/test';
import base from '../../playwright.config';
const external=process.env.LEMMA_AUDIT_BASE_URL;
export default defineConfig({
  ...base,
  testDir:resolve('tests/e2e'),
  testMatch:['audit-motion-catalog', 'editor-surface-contracts', 'navigation-motion', 'surface-motion-audit',
    'v7-focus-desk-clock-menu', 'v7-study-surface-motion'].map(name=>'**/'+name+'.spec.ts'),
  outputDir:resolve('test-results/motion-audit'),
  reporter:[['list'],['html',{open:'never',outputFolder:resolve('playwright-report/motion-audit')}]],
  use:{...base.use,baseURL:external??base.use?.baseURL,video:'on',trace:'on'},
  webServer:external?undefined:{...(base.webServer as {command:string;url:string}),cwd:resolve('.')},
  projects:['chromium','firefox','webkit'].map(browserName=>({name:browserName,use:{browserName:browserName as 'chromium'|'firefox'|'webkit'}})),
});
