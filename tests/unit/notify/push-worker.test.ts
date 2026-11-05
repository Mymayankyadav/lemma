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
