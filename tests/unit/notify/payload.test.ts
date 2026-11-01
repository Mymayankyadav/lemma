import {describe,expect,it} from 'vitest';
import {buildPushPayload,type PushPayloadInput} from '../../../supabase/functions/notify/payload';

const base:PushPayloadInput={
 id:42,kind:'due',tag:'due',title:'23 cards due',body:'About 9 min. Start with five?',
 url:'#/review?start=5',actions:[
  {action:'review_5',title:'Review 5',url:'#/review?start=5'},
  {action:'later',title:'Later',token:'abc.def'},
 ],ts:1793527200000,
};
describe('NOTIF-4b5 safe service-worker push payload',()=>{
 it('produces only the v1 contract with sanitized math and bounded copy',()=>{
  const encoded=buildPushPayload({...base,title:'Why $\\mathbb R$?',body:'Review $x^2$ now'});
  const payload=JSON.parse(encoded);
  expect(Object.keys(payload).sort()).toEqual(['actions','body','id','kind','tag','title','ts','url','v']);
  expect(payload).toMatchObject({
   v:1,id:42,kind:'due',tag:'due',title:'Why ℝ?',body:'Review x² now',
   url:'#/review?start=5',ts:base.ts,
  });
  expect(payload.actions).toEqual(base.actions);
  expect(encoded).not.toMatch(/\\mathbb|\\frac/);
  expect(new TextEncoder().encode(encoded).length).toBeLessThanOrEqual(3072);
 });
 it('accepts owner app links and the two approved tutor-chat origins',()=>{
  for(const url of [
   '#/review','#/p/algebra-1/cp/CP4','/lemma/#/proposals',
   'https://mymayankyadav.github.io/lemma/#/review',
   'https://claude.ai/new','https://chatgpt.com/c/abc',
   'http://localhost:5173/lemma/#/review',
  ]){
   expect(JSON.parse(buildPushPayload({...base,url})).url).toBe(url);
  }
 });
 it('rejects unsafe navigation and action destinations',()=>{
  for(const url of [
   'javascript:alert(1)','data:text/html,hi','https://evil.example/phish',
   'http://mymayankyadav.github.io/lemma/#/review','//evil.example/path',
   'https://mymayankyadav.github.io.evil.test/lemma/',
  ]){
   expect(()=>buildPushPayload({...base,url})).toThrow();
   expect(()=>buildPushPayload({...base,actions:[{action:'open',title:'Open',url}]})).toThrow();
  }
 });
 it('rejects malformed identifiers, tags, actions and excessive payloads',()=>{
  for(const change of [
   {id:0},{id:Number.MAX_SAFE_INTEGER+1},{kind:'unknown' as PushPayloadInput['kind']},
   {tag:'bad topic'},{actions:Array(4).fill({action:'later',title:'Later'})},
   {actions:[{action:'not valid',title:'Later'}]},
   {actions:[{action:'later',title:'Later',token:'bad token'}]},
   {body:'x'.repeat(5000)},
  ]){
   expect(()=>buildPushPayload({...base,...change})).toThrow();
  }
 });
 it('clamps notification titles and bodies but preserves a valid 19-digit DB id string',()=>{
  const payload=JSON.parse(buildPushPayload({
   ...base,id:'9223372036854775807',title:'a '.repeat(60),body:'b '.repeat(150),
  }));
  expect(payload.id).toBe('9223372036854775807');
  expect(payload.title.length).toBeLessThanOrEqual(48);
  expect(payload.body.length).toBeLessThanOrEqual(140);
 });
});
