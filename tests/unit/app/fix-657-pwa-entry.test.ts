import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// FIX #657: registration must not evaluate the PWA virtual module on the
// cold Today entry path. The service worker still registers in production.
describe('FIX #657 cold entry PWA module boundary',()=>{
 it('loads the registration module after the initial app mount',()=>{
  const source=readFileSync('src/app/PwaStatus.tsx','utf8');
  expect(source).not.toMatch(/^import\s+\{registerSW\}\s+from\s+['"]virtual:pwa-register['"]/m);
  expect(source).toMatch(/import\(['"]virtual:pwa-register['"]\)/);
  expect(source).toContain('onNeedRefresh');
  expect(source).toContain('onOfflineReady');
  expect(source).toContain('onRegisterError');
 });

});
