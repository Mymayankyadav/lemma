import {describe,expect,it} from 'vitest';
import {enabledNotificationReviewLink,parseNotificationReviewLink} from '../../../src/data/notify';

const NOW=Date.UTC(2026,10,5,12,0,0);
const USER='11111111-1111-4111-8111-111111111111';
function token(exp:number):string{
 const payload={u:USER,n:42,a:'open',exp};
 const body=btoa(JSON.stringify(payload)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 // A syntactically valid signature is deliberately not a verified one.
 return body+'.'+'A'.repeat(43);
}
describe('N6.1 bounded reminder Review links',()=>{
 it('accepts canonical local and installed-app hash routes',()=>{
  expect(parseNotificationReviewLink('#/review?start=5',NOW)).toEqual({count:5,token:null});
  expect(parseNotificationReviewLink('/lemma/#/review?start=1',NOW)).toEqual({count:1,token:null});
  expect(parseNotificationReviewLink('https://mymayankyadav.github.io/lemma/#/review?start=50',NOW))
   .toEqual({count:50,token:null});
  expect(parseNotificationReviewLink('http://localhost:4173/lemma/#/review?start=3',NOW))
   .toEqual({count:3,token:null});
 });
 it('does not follow malicious, off-route or unbounded links',()=>{
  for(const href of [
   'https://evil.example/lemma/#/review?start=5',
   'https://mymayankyadav.github.io.evil.example/lemma/#/review?start=5',
   'https://mymayankyadav.github.io/other/#/review?start=5',
   '#/reviews?start=5','#/review/run?start=5','#/review?start=0',
   '#/review?start=51','#/review?start=-1','#/review?start=1.5',
   '#/review?start=01','#/review?start=5&start=6',
   '#/review?start=5&foo=bar','#/review?start=5&token=x&token=y',
   '#/review?start=5#other',
   '/lemma/#/review?start=5\u0000',
   '#/review?start='+('1'.repeat(6150)),
  ]){
   expect(parseNotificationReviewLink(href,NOW),href).toBeNull();
  }
 });
 it('rejects expired, far-future and malformed optional action tokens',()=>{
  const nowSeconds=Math.floor(NOW/1000);
  const valid=token(nowSeconds+60);
  expect(parseNotificationReviewLink('#/review?start=5&token='+valid,NOW))
   .toEqual({count:5,token:valid});
  for(const bad of [
   token(nowSeconds-1),token(nowSeconds),token(nowSeconds+48*3600+1),
   'bad.token', 'x'.repeat(4097), '!', token(nowSeconds+60)+'.extra'
  ]){
   expect(parseNotificationReviewLink('#/review?start=5&token='+encodeURIComponent(bad),NOW))
    .toBeNull();
  }
 });
 it('never interprets a parsed token as verified authorization',()=>{
  // Even a made-up HMAC is accepted for navigation only. The server must
  // authenticate the owner and verify the actual signature for any action.
  const fakeSignature=token(Math.floor(NOW/1000)+60);
  expect(parseNotificationReviewLink('#/review?start=2&token='+fakeSignature,NOW)?.token)
   .toBe(fakeSignature);
 });
 it('leaves Review unchanged unless notificationsPush is on',()=>{
  const link='#/review?start=5';
  expect(enabledNotificationReviewLink(link,false,NOW)).toBeNull();
  expect(enabledNotificationReviewLink(link,true,NOW)).toEqual({count:5,token:null});
  expect(enabledNotificationReviewLink('#/review?start=75',true,NOW)).toBeNull();
 });
});
