import {describe,it,expect} from 'vitest';
import {parsePushNotice,pushDeepLink} from '../../../src/lib/push-notice';

const valid={v:1,id:'123',kind:'due',tag:'due_123',title:'Review',body:'Cards due',
 url:'/lemma/#/review',actions:[{action:'open',title:'Review'}],ts:1790000000};
describe('bounded Web Push payloads',()=>{
 it('accepts the server v1 shape',()=>{
  expect(parsePushNotice(JSON.stringify(valid))?.id).toBe('123');
 });
 it('rejects truncated and oversized payloads',()=>{
  expect(parsePushNotice(JSON.stringify(valid).slice(0,-3))).toBeNull();
  expect(parsePushNotice(JSON.stringify({...valid,body:'x'.repeat(4000)}))).toBeNull();
 });
 it('ignores unknown fields without trusting them',()=>{
  const parsed=parsePushNotice(JSON.stringify({...valid,unexpected:'ignored'}));
  expect(parsed?.title).toBe('Review');
 });
 it('accepts the same allowed assistant and local URLs as the server',()=>{
  for (const url of ['https://chatgpt.com/', 'https://claude.ai/new', 'http://localhost:4173/lemma/']) {
   expect(parsePushNotice(JSON.stringify({...valid,url}))?.url).toBe(url);
   expect(pushDeepLink(url)).toBe(url);
  }
  expect(parsePushNotice(JSON.stringify({...valid,actions:[{action:'open',title:'Open',url:'https://claude.ai/'}]}))).not.toBeNull();
  expect(pushDeepLink('https://chatgpt.com.evil.example/')).toBeNull();
 });
 it('rejects malformed fields and unsafe navigation',()=>{
  expect(parsePushNotice(JSON.stringify({...valid,id:0}))).toBeNull();
  expect(parsePushNotice(JSON.stringify({...valid,url:'https://evil.example/lemma/#/review'}))).toBeNull();
  expect(pushDeepLink('javascript:alert(1)')).toBeNull();
  expect(pushDeepLink('#/review')).toBe('/lemma/#/review');
 });
});
