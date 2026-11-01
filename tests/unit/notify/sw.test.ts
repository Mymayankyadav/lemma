import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const coreSource=readFileSync('src/lib/push-sw-core.js','utf8');
const workerSource=readFileSync('public/push-sw.js','utf8');
const scope='https://mymayankyadav.github.io/lemma/';
function harness(){
 const handlers:Record<string,(event:any)=>void>={};
 const shown:Array<{title:string;options:any}>=[];
 const navigated:string[]=[];
 const posted:any[]=[];
 const fetchMock=vi.fn(async(_url:string,options:any)=>{
  posted.push(JSON.parse(options.body));
  return {ok:true,json:async()=>({message:'Saved',undoToken:'signed-undo'})};
 });
 const client={url:scope+'#/review',focus:vi.fn(async()=>{}),navigate:vi.fn(async(url:string)=>{
  navigated.push(url);return client;
 }),postMessage:vi.fn()};
 const self={registration:{scope,showNotification:vi.fn(async(title:string,options:any)=>{shown.push({title,options})})},
  clients:{matchAll:vi.fn(async()=>[client]),openWindow:vi.fn(async(url:string)=>{navigated.push(url)})},
  addEventListener:(type:string,handler:(event:any)=>void)=>{handlers[type]=handler}};
 const context={URL,Date,Set,Number,self,fetch:fetchMock,importScripts:()=>{}};
 runInNewContext(coreSource,context);
 runInNewContext(workerSource,context);
 const core=(context as any).LemmaPushCore;
 async function emit(type:string,event:any){let work:Promise<unknown>|undefined;
  handlers[type]({...event,waitUntil:(promise:Promise<unknown>)=>{work=promise}});
  await work;
 }
 return {core,shown,navigated,posted,client,self,fetchMock,emit};
}
const payload={v:1,id:42,kind:'due',tag:'due-cards',title:'23 cards due',body:'Start with 5?',
 url:'#/review',ts:1793527200000,actions:[
  {action:'review_5',title:'Review 5',url:'#/review?start=5'},
  {action:'later',title:'Later',token:'signed-later'},
 ]};

describe('NOTIF-5 Workbox push handling',()=>{
 it('converts bounded payload to accessible monochrome notification options',async()=>{
  const h=harness();
  await h.emit('push',{data:{json:()=>payload}});
  expect(h.shown).toHaveLength(1);
  expect(h.shown[0].title).toBe('23 cards due');
  expect(h.shown[0].options).toMatchObject({tag:'due-cards',renotify:false,
   icon:'/lemma/icons/lemma-192.png',badge:'/lemma/icons/badge-96.png',lang:'en-GB',dir:'ltr'});
  expect(h.shown[0].options.actions).toHaveLength(2);
  expect(h.shown[0].options.data.id).toBe('42');
 });
 it('focuses and navigates an existing Lemma window for a body click',async()=>{
  const h=harness(),data=h.core.notificationOptions(h.core.parsePayload(payload,scope)).data;
  await h.emit('notificationclick',{notification:{data,close:vi.fn()},action:''});
  expect(h.navigated).toEqual([scope+'#/review']);
 });
 it('navigates Review 5 without a server action token',async()=>{
  const h=harness(),data=h.core.notificationOptions(h.core.parsePayload(payload,scope)).data;
  await h.emit('notificationclick',{notification:{data,close:vi.fn()},action:'review_5'});
  expect(h.navigated).toEqual([scope+'#/review?start=5']);
  expect(h.posted).toHaveLength(0);
 });
 it('posts signed actions and shows undo confirmation',async()=>{
  const h=harness(),data=h.core.notificationOptions(h.core.parsePayload(payload,scope)).data;
  await h.emit('notificationclick',{notification:{data,close:vi.fn()},action:'later'});
  expect(h.posted).toEqual([{token:'signed-later'}]);
  expect(h.shown.at(-1)?.options.actions).toEqual([{action:'undo',title:'Undo'}]);
  expect(h.shown.at(-1)?.options.data.actions[0].token).toBe('signed-undo');
 });
 it('posts signed dismissal and opens tutor chat in a new window',async()=>{
  const h=harness(),data={id:'42',url:'https://claude.ai/new',actions:[{action:'dismiss',token:'signed-dismiss'}]};
  await h.emit('notificationclose',{notification:{data}});
  expect(h.posted).toEqual([{token:'signed-dismiss'}]);
  await h.emit('notificationclick',{notification:{data,close:vi.fn()},action:''});
  expect(h.self.clients.openWindow).toHaveBeenCalledWith('https://claude.ai/new');
 });
 it('rejects executable and foreign URLs',()=>{
  const h=harness();
  expect(h.core.destination('javascript:alert(1)',scope)).toBeNull();
  expect(h.core.destination('https://evil.example/lemma/',scope)).toBeNull();
  expect(h.core.parsePayload({...payload,url:'//evil.example/'},scope)).toBeNull();
 });
 it('navigates via worker message and recovers from failed action',async()=>{
  const h=harness();
  await h.emit('message',{data:{type:'lemma:navigate',url:'#/proposals'}});
  expect(h.navigated).toContain(scope+'#/proposals');
  h.fetchMock.mockResolvedValueOnce({ok:false,json:async()=>({})} as any);
  const data=h.core.notificationOptions(h.core.parsePayload(payload,scope)).data;
  await h.emit('notificationclick',{notification:{data,close:vi.fn()},action:'later'});
  expect(h.shown.at(-1)?.options.body).toBe('Open Lemma to finish');
 });
});
