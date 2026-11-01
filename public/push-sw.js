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
  try{
   const candidate=new URL(client.url),scope=new URL(self.registration.scope);
   return candidate.origin===scope.origin&&candidate.pathname.startsWith(scope.pathname);
  }catch{return false;}
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

async function confirmation(reply,data,action){
 const result=reply&&typeof reply==='object'?reply:{};
 const undoToken=typeof result.undoToken==='string'?result.undoToken:'';
 const actions=undoToken?[{action:'undo',title:'Undo',token:undoToken,url:'#/proposals'}]:[];
 const approved=Array.isArray(result.approved)?result.approved.length:null;
 const skipped=Array.isArray(result.skipped)?result.skipped.length:0;
 const isCardApproval=action==='approve_cards'&&approved!==null;
 const title=isCardApproval?
  'Approved '+approved+(skipped?' of '+(approved+skipped):'')+' cards':'Lemma';
 const body=isCardApproval?
  (undoToken?'Undo is in the app, or here for 48 hours.':'Undo is in the app.'):
  (typeof result.message==='string'?result.message:'Done');
 const confirmId=(typeof result.confirmId==='number'&&Number.isSafeInteger(result.confirmId)&&result.confirmId>0)||
  (typeof result.confirmId==='string'&&/^\\d{1,16}$/.test(result.confirmId))?
  String(result.confirmId):data.id;
 // Reuse the original tag to replace the actionable K5 notification, while
 // binding Undo to the new server-created confirmation row.
 const tag=typeof data.tag==='string'&&data.tag?data.tag:'confirm:'+data.id;
 await self.registration.showNotification(title,core.notificationOptions({
  id:confirmId,kind:'confirm',tag,title,body,
  url:'#/proposals',ts:Date.now(),actions,openToken:'',dismissToken:'',
 }));
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
  const passiveReceipt=!event.action||decision.action==='open';
  if(decision.token){
   try{
    const reply=await act(decision.token);
    // Open is a passive receipt, not a user action confirmation. Do not
    // interrupt the owner's navigation with a redundant "Done" notification.
    if(!passiveReceipt){
     if(decision.action==='undo')await navigate('#/proposals');
     else await confirmation(reply,data,decision.action);
    }
   }catch{
    // A failed receipt must never strand the user or create a false action
    // failure warning. Visible action failures still receive their warning.
    if(!passiveReceipt){
     const undo=decision.action==='undo';
     const recovery=undo?'#/proposals':decision.url;
     await self.registration.showNotification('Lemma',{
      body:undo?'Open Lemma to undo':'Open Lemma to finish',
      tag:'action-failed:'+data.id,icon:'/lemma/icons/lemma-192.png',
      badge:'/lemma/icons/badge-96.png',data:{id:data.id,url:recovery,actions:[]},
     });
    }
    await navigate(decision.action==='undo'?'#/proposals':decision.url);
    return;
   }
  }
  // Passive clicks and actions without a server token open the deep link.
  if(decision.chat||passiveReceipt||!decision.token)await navigate(decision.url);
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
