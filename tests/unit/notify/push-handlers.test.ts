import {describe, expect, it, vi} from 'vitest';
import {noticeFromPush, routeNotificationClick} from '../../../src/lib/push-handlers';

const payload = JSON.stringify({
 v:1,id:'123',kind:'due',tag:'due_123',title:'Review',body:'Cards due',
 url:'/lemma/#/review',actions:[{action:'open',title:'Review',url:'#/review/run'}],ts:1790000000,
});
describe('push notification handlers', () => {
 it('maps a validated payload into display options', () => {
  expect(noticeFromPush(payload)).toEqual({
   title:'Review',body:'Cards due',tag:'due_123',
   data:{url:'/lemma/#/review',actions:[{action:'open',url:'/lemma/#/review/run'}]},
  });
  expect(noticeFromPush('{broken')).toBeNull();
 });
 it('navigates and focuses an existing app window', async () => {
  const focus=vi.fn().mockResolvedValue(undefined);
  const navigate=vi.fn().mockResolvedValue(undefined);
  const openWindow=vi.fn();
  const matchAll=vi.fn().mockResolvedValue([{url:'https://mymayankyadav.github.io/lemma/#/',focus,navigate}]);
  await routeNotificationClick({matchAll,openWindow},
   {url:'/lemma/#/review',actions:[{action:'open',url:'/lemma/#/review/run'}]},'open');
  expect(navigate).toHaveBeenCalledWith('/lemma/#/review/run');
  expect(focus).toHaveBeenCalledOnce();
  expect(openWindow).not.toHaveBeenCalled();
 });
 it('opens a new app window if none exists', async () => {
  const openWindow=vi.fn().mockResolvedValue(undefined);
  await routeNotificationClick({matchAll:vi.fn().mockResolvedValue([]),openWindow},
   {url:'/lemma/#/review',actions:[]});
  expect(openWindow).toHaveBeenCalledWith('/lemma/#/review');
 });
 it('opens server-allowed external destinations without redirecting the app tab', async () => {
  const navigate = vi.fn();
  const focus = vi.fn();
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([{url:'https://mymayankyadav.github.io/lemma/#/',navigate,focus}]);
  await routeNotificationClick({matchAll,openWindow},
   {url:'/lemma/#/review',actions:[{action:'open',url:'https://claude.ai/new'}]}, 'open');
  expect(openWindow).toHaveBeenCalledWith('https://claude.ai/new');
  expect(matchAll).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
 });
 it('does not navigate for an unsafe link', async () => {
  const openWindow=vi.fn();
  const matchAll=vi.fn();
  await routeNotificationClick({matchAll,openWindow},{url:'https://evil.example/',actions:[]});
  expect(matchAll).not.toHaveBeenCalled();
  expect(openWindow).not.toHaveBeenCalled();
 });
});
