/* Imported by the existing Workbox-generated /lemma/sw.js. Do not replace
 * Workbox: its update prompt and offline precache must continue to work. */
(()=>{
'use strict';
importScripts('push-sw-core.js');
const core=globalThis.LemmaPushCore;

async function navigate(url){
 const target=core.destination(url,self.registration.scope);
 if(!target)return;
 if(target.chat){await self.clients.openWindow(target.url);return;}
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const existing=windows.find(client=>{
  try{return new URL(client.url).origin===new URL(target.url).origin;}catch{return false;}
 });
 if(existing){
  try{
   await existing.focus();
   if(typeof existing.navigate==='function'){
    const navigated=await existing.navigate(target.url);
    if(navigated)return;
   }
  }catch{/* A closed or stale client can reject navigate. */}
  existing.postMessage({type:'lemma:navigate',url:target.url});
  return;
 }
 await self.clients.openWindow(target.url);
}

async function act(token){
 const response=await fetch(core.ACT_URL,{method:'POST',mode:'cors',credentials:'omit',
  headers:{'content-type':'application/json'},body:JSON.stringify({token})});
 if(!response.ok)throw Error('Notification action unavailable');
 return response.json();
}

async function confirmation(reply,data){
 const result=reply&&typeof reply==='object'?reply:{};
 const undoToken=typeof result.undoToken==='string'?result.undoToken:'';
 const actions=undoToken?[{action:'undo',title:'Undo',token:undoToken,url:data.url}]:[];
 await self.registration.showNotification('Lemma',{
  ...core.notificationOptions({id:data.id,kind:'confirm',tag:'confirm:'+data.id,
   title:'Lemma',body:typeof result.message==='string'?result.message:
    Array.isArray(result.approved)&&result.approved.length?result.approved.length+' cards approved':'Done',
   url:data.url,ts:Date.now(),actions,openToken:'',dismissToken:''}),
  tag:'confirm:'+data.id,
 });
}

self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let raw;
  try{raw=event.data?.json();}catch{return;}
  const payload=core.parsePayload(raw,self.registration.scope);
  if(!payload)return;
  await self.registration.showNotification(payload.title,core.notificationOptions(payload));
 })());
});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const data=event.notification.data;
  const decision=core.clickDecision(data,event.action||'',self.registration.scope);
  if(!decision)return;
  if(decision.token){
   try{const reply=await act(decision.token);await confirmation(reply,data);}
   catch{
    await self.registration.showNotification('Lemma',{body:'Open Lemma to finish',
     tag:'action-failed:'+data.id,icon:'/lemma/icons/lemma-192.png',
     badge:'/lemma/icons/badge-96.png',data:{id:data.id,url:decision.url,actions:[]}});
    await navigate(decision.url);
    return;
   }
  }
  // Passive clicks and actions without a server token open the deep link.
  if(decision.chat||!event.action||!decision.token||decision.action==='open')await navigate(decision.url);
 })());
});

self.addEventListener('notificationclose',event=>{
 const token=core.dismissToken(event.notification.data);
 if(token)event.waitUntil(act(token).catch(()=>{}));
});

self.addEventListener('message',event=>{
 if(event.data?.type==='lemma:navigate'&&typeof event.data.url==='string')
  event.waitUntil(navigate(event.data.url));
});
})();
