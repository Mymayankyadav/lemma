import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/lib/lemma-push-worker.js'), 'utf8');
const valid = JSON.stringify({v:1,id:'123',kind:'due',tag:'due_123',title:'Review',body:'Cards due',
 url:'/lemma/#/review',actions:[{action:'open',title:'Review',url:'#/review/run'}],ts:1790000000});
function boot(enabled: boolean, windows: unknown[] = []) {
 const listeners = new Map<string, (event: any) => void>();
 const showNotification = vi.fn().mockResolvedValue(undefined);
 const openWindow = vi.fn().mockResolvedValue(undefined);
 const matchAll = vi.fn().mockResolvedValue(windows);
 const scope = {location:{origin:'https://mymayankyadav.github.io'},
  registration:{showNotification},clients:{openWindow,matchAll},
  addEventListener:vi.fn((name:string, handler:(event:any)=>void)=>listeners.set(name,handler))};
 if (enabled) runInNewContext(source, {self:scope, URL, TextEncoder, Set, BigInt});
 return {listeners,scope,showNotification,openWindow,matchAll};
}
async function dispatch(handler:(event:any)=>void, event:Record<string,unknown>) {
 let pending:Promise<unknown>|undefined;
 handler({...event,waitUntil:(promise:Promise<unknown>)=>{pending=promise;}});
 await pending;
}
describe('N5 real service worker event listeners',()=>{
 it('registers no push or click handlers when flag is off',()=>{
  const worker=boot(false);
  expect(worker.scope.addEventListener).not.toHaveBeenCalled();
  expect(worker.listeners.size).toBe(0);
 });
 it('registers handlers and displays a valid payload; rejects malformed payloads',async()=>{
  const worker=boot(true);
  expect([...worker.listeners.keys()]).toEqual(['push','notificationclick']);
  await dispatch(worker.listeners.get('push')!,{data:{text:()=>valid}});
  expect(worker.showNotification).toHaveBeenCalledWith('Review',expect.objectContaining({
   body:'Cards due',tag:'due_123',data:expect.objectContaining({url:'/lemma/#/review'}),
  }));
  await dispatch(worker.listeners.get('push')!,{data:{text:()=>'{broken'}});
  expect(worker.showNotification).toHaveBeenCalledTimes(1);
 });
 it('displays server-allowed external links and opens their actions separately', async () => {
  const worker=boot(true);
  const external=JSON.stringify({...JSON.parse(valid),url:'https://chatgpt.com/',
   actions:[{action:'open',title:'Open',url:'https://claude.ai/new'}]});
  await dispatch(worker.listeners.get('push')!,{data:{text:()=>external}});
  expect(worker.showNotification).toHaveBeenCalledTimes(1);
  const options=worker.showNotification.mock.calls[0][1];
  expect(options.data.url).toBe('https://chatgpt.com/');
  expect(options.data.actions[0].url).toBe('https://claude.ai/new');
  await dispatch(worker.listeners.get('notificationclick')!,
   {action:'open',notification:{data:options.data,close:vi.fn()}});
  expect(worker.openWindow).toHaveBeenCalledWith('https://claude.ai/new');
  expect(worker.matchAll).not.toHaveBeenCalled();
 });
 it('routes click to an existing window, then opens a new one when none exists',async()=>{
  const navigate=vi.fn().mockResolvedValue(undefined);
  const focus=vi.fn().mockResolvedValue(undefined);
  const existing=boot(true,[{url:'https://mymayankyadav.github.io/lemma/#/',navigate,focus}]);
  const notification={data:{url:'/lemma/#/review',actions:[{action:'open',url:'/lemma/#/review/run'}]},close:vi.fn()};
  await dispatch(existing.listeners.get('notificationclick')!,{notification,action:'open'});
  expect(navigate).toHaveBeenCalledWith('/lemma/#/review/run');
  expect(focus).toHaveBeenCalledOnce();
  expect(existing.openWindow).not.toHaveBeenCalled();
  const fresh=boot(true);
  await dispatch(fresh.listeners.get('notificationclick')!,{notification,action:''});
  expect(fresh.openWindow).toHaveBeenCalledWith('/lemma/#/review');
 });
});

import {mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {shouldBundlePushWorker} from '../../../src/lib/push-build-flag';

describe('N5 generated Workbox build integration', () => {
 it('bundles push worker when the reviewed default is enabled without env overrides', () => {
  expect(shouldBundlePushWorker(true, false, '')).toBe(true);
  expect(shouldBundlePushWorker(false, false, 'notificationsPush')).toBe(false);
  expect(shouldBundlePushWorker(false, true, 'ciSelfTest, notificationsPush')).toBe(true);
 });
 it('emits and imports push handlers only in opt-in builds', () => {
  const root = mkdtempSync(join(tmpdir(), 'lemma-push-build-'));
  try {
   for (const enabled of [false, true]) {
    const out = join(root, enabled ? 'enabled' : 'disabled');
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', out, '--emptyOutDir'], {
     cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
     env: {...process.env, VITE_ALLOW_FLAG_OVERRIDES: enabled ? '1' : '0', VITE_FLAGS: enabled ? 'notificationsPush' : ''},
     stdio: 'pipe',
     timeout: 120000,
    });
    const sw = readFileSync(join(out, 'sw.js'), 'utf8');
    expect(sw.includes('lemma-push-worker.js')).toBe(enabled);
    expect(existsSync(join(out, 'lemma-push-worker.js'))).toBe(enabled);
    if (enabled) {
     const companion = readFileSync(join(out, 'lemma-push-worker.js'), 'utf8');
     expect(companion).toContain("addEventListener('push'");
     expect(companion).toContain("addEventListener('notificationclick'");
    }
   }
  } finally {
   rmSync(root, {recursive:true, force:true});
  }
 }, 240000);
});
