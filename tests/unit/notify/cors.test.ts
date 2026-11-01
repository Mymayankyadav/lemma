import {describe,expect,it} from 'vitest';
import {notifyCorsHeaders,notifyPreflight} from '../../../supabase/functions/notify/cors';

describe('NOTIF-4b6a Edge CORS origin allowlist',()=>{
 it('permits only the deployed GitHub Pages origin',()=>{
  const h=notifyCorsHeaders('https://mymayankyadav.github.io');
  expect(h['Access-Control-Allow-Origin']).toBe('https://mymayankyadav.github.io');
  expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
  expect(h.Vary).toBe('Origin');
 });
 it('permits local development with a real localhost port',()=>{
  for(const port of [5173,4173,80,65535]){
   expect(notifyCorsHeaders('http://localhost:'+port)['Access-Control-Allow-Origin']).toBe('http://localhost:'+port);
  }
 });
 it('never reflects deceptive, wildcard, cross-site or malformed origins',()=>{
  for(const origin of [
   null,'','null','*','https://example.com','http://localhost',
   'http://localhost:0','http://localhost:65536',
   'http://localhost:5173.evil.test','http://localhost:5173/path',
   'http://localhost:5173?x=1','http://localhost:5173@evil.test',
   'https://localhost:5173','http://127.0.0.1:5173',
   'https://mymayankyadav.github.io.evil.test',
   'https://mymayankyadav.github.io/lemma/',
   'http://mymayankyadav.github.io',
  ]){
   const h=notifyCorsHeaders(origin);
   expect(h['Access-Control-Allow-Origin'],String(origin)).toBeUndefined();
   expect(h.Vary).toBe('Origin');
  }
 });
 it('allows only the required methods and headers without wildcard credentials',()=>{
  const h=notifyCorsHeaders('http://localhost:5173');
  expect(h['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
  expect(h['Access-Control-Allow-Headers']).toBe('authorization, content-type');
  expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
 });
 it('returns a no-body preflight only for an allowed origin; disallowed origins fail closed',()=>{
  for(const origin of ['https://mymayankyadav.github.io','http://localhost:5173']){
   const response=notifyPreflight(origin);
   expect(response.status).toBe(204);
   expect(response.headers['Access-Control-Allow-Origin']).toBe(origin);
   expect(response.headers['Access-Control-Allow-Headers']).not.toMatch(/cron/i);
   expect(response).not.toHaveProperty('body');
  }
  for(const origin of [null,'null','https://evil.example','http://localhost:0']){
   const response=notifyPreflight(origin);
   expect(response).toEqual({status:403,headers:{Vary:'Origin'}});
  }
 });

 it('rejects unsupported preflight methods and privileged or malformed requested headers',()=>{
  const origin='https://mymayankyadav.github.io';
  for(const method of ['DELETE','PUT','PATCH','TRACE','POST,GET','']){
   expect(notifyPreflight(origin,method,'authorization').status,method).toBe(403);
  }
  for(const headers of ['x-lemma-cron','authorization,x-lemma-cron','x-api-key','authorization,','authorization,,content-type']){
   expect(notifyPreflight(origin,'POST',headers).status,headers).toBe(403);
  }
  for(const method of ['GET','POST','OPTIONS']){
   expect(notifyPreflight(origin,method,'Authorization, Content-Type').status).toBe(204);
  }
  expect(notifyPreflight(origin,'POST','')).toEqual({
   status:204,headers:notifyCorsHeaders(origin),
  });
 });

});
