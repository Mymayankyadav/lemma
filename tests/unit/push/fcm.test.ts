import {describe,expect,it} from 'vitest';
import {generateKeyPairSync,createVerify,type KeyObject} from 'node:crypto';
import {createSender,parseServiceAccount,type Fetch} from '../../../supabase/functions/push/fcm';

// N163: FCM HTTP v1 from the Edge function. No network: the fetch is a recording fake and the key is generated here.
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
const account=(extra:Record<string,unknown>={})=>JSON.stringify({client_email:'push@lemma-test.iam.gserviceaccount.com',project_id:'lemma-test',private_key:pem,...extra});
const decode=(part:string)=>JSON.parse(Buffer.from(part,'base64url').toString());
type Call={url:string;headers:Record<string,string>;body:string};
function fake(replies:{status:number;json?:unknown}[]){
 const calls:Call[]=[];
 const fetcher:Fetch=async(url,init)=>{calls.push({url,headers:init.headers,body:init.body});const reply=replies.shift()??{status:200,json:{}};if(reply.status===-1)throw new Error('network');return {status:reply.status,json:async()=>reply.json??{}};};
 return {fetcher,calls};
}
const tokenReply={status:200,json:{access_token:'ya29.test',expires_in:3600}};
const data={type:'timer',op:'show',entryId:'e1',version:'7',state:'{"x":1}'};

describe('N163 service account',()=>{
 it('accepts a Firebase service account and nothing else',()=>{
  expect(parseServiceAccount(account()).project_id).toBe('lemma-test');
  expect(()=>parseServiceAccount(undefined)).toThrow(/not JSON/);
  expect(()=>parseServiceAccount('nope')).toThrow(/not JSON/);
  expect(()=>parseServiceAccount(account({private_key:'x'}))).toThrow(/missing/);
  expect(()=>parseServiceAccount(account({project_id:''}))).toThrow(/missing/);
  expect(()=>parseServiceAccount(account({token_uri:'https://evil.example/token'}))).toThrow(/token_uri/);
 });
});
describe('N163 FCM sender',()=>{
 it('exchanges a signed JWT for an access token once, then sends a high-priority data message',async()=>{
  const {fetcher,calls}=fake([tokenReply,{status:200},{status:200}]);
  const sender=createSender(parseServiceAccount(account()),fetcher,()=>Date.UTC(2026,10,14,10,0,0));
  expect(await sender.send('tok-1',data,{collapseKey:'timer',ttlSeconds:60})).toBe('sent');
  expect(await sender.send('tok-2',data)).toBe('sent');
  expect(calls.map(call=>call.url)).toEqual(['https://oauth2.googleapis.com/token','https://fcm.googleapis.com/v1/projects/lemma-test/messages:send','https://fcm.googleapis.com/v1/projects/lemma-test/messages:send']);
  const form=new URLSearchParams(calls[0].body);
  expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
  const [head,body,signature]=form.get('assertion')!.split('.');
  expect(decode(head)).toEqual({alg:'RS256',typ:'JWT'});
  expect(decode(body)).toMatchObject({iss:'push@lemma-test.iam.gserviceaccount.com',scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:Date.UTC(2026,10,14,10,0,0)/1000});
  expect(createVerify('RSA-SHA256').update(head+'.'+body).verify(publicKey as KeyObject,Buffer.from(signature,'base64url'))).toBe(true);
  expect(calls[1].headers.Authorization).toBe('Bearer ya29.test');
  expect(JSON.parse(calls[1].body)).toEqual({message:{token:'tok-1',data,android:{priority:'HIGH',ttl:'60s',collapse_key:'timer'}}});
  expect(JSON.parse(calls[2].body).message.android).toEqual({priority:'HIGH',ttl:'60s'});
 });
 it('asks for a new access token when the old one is about to expire',async()=>{
  let now=Date.UTC(2026,10,14,10,0,0);
  const {fetcher,calls}=fake([tokenReply,{status:200},tokenReply,{status:200}]);
  const sender=createSender(parseServiceAccount(account()),fetcher,()=>now);
  await sender.send('t',data);now+=3_550_000;await sender.send('t',data);
  expect(calls.filter(call=>call.url.includes('oauth2')).length).toBe(2);
 });
 it('maps FCM answers: gone, retry or failed',async()=>{
  const cases:[{status:number;json?:unknown},string][]=[
   [{status:404,json:{error:{status:'NOT_FOUND'}}},'gone'],
   [{status:400,json:{error:{status:'INVALID_ARGUMENT',details:[{errorCode:'UNREGISTERED'}]}}},'gone'],
   [{status:429},'retry'],[{status:503},'retry'],[{status:500},'retry'],
   [{status:400,json:{error:{status:'INVALID_ARGUMENT'}}},'failed'],[{status:403},'failed'],
  ];
  for(const [reply,expected] of cases){
   const {fetcher}=fake([tokenReply,reply]);
   expect(await createSender(parseServiceAccount(account()),fetcher).send('t',data),JSON.stringify(reply)).toBe(expected);
  }
 });
 it('retries after a network error, a failed token exchange or a rejected token, and refreshes the token',async()=>{
  expect(await createSender(parseServiceAccount(account()),fake([tokenReply,{status:-1}]).fetcher).send('t',data)).toBe('retry');
  expect(await createSender(parseServiceAccount(account()),fake([{status:500}]).fetcher).send('t',data)).toBe('retry');
  const {fetcher,calls}=fake([tokenReply,{status:401},tokenReply,{status:200}]);
  const sender=createSender(parseServiceAccount(account()),fetcher);
  expect(await sender.send('t',data)).toBe('retry');
  expect(await sender.send('t',data)).toBe('sent');
  expect(calls.filter(call=>call.url.includes('oauth2')).length).toBe(2);
 });
 it('refuses a payload that is not strings or is too large, before any request',async()=>{
  const {fetcher,calls}=fake([]);
  const sender=createSender(parseServiceAccount(account()),fetcher);
  expect(await sender.send('t',{a:1 as unknown as string})).toBe('failed');
  expect(await sender.send('t',{a:'x'.repeat(4000)})).toBe('failed');
  expect(calls.length).toBe(0);
 });
});
