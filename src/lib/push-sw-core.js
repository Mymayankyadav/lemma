/* Pure notification parsing and navigation decisions. Classic script so it can
 * be imported by Workbox's service worker and exercised in Node tests. */
(function(root){
 'use strict';
 const APP_SCOPE='https://mymayankyadav.github.io/lemma/';
 const ACT_URL='https://yemqnhnztlbyxmjxidis.supabase.co/functions/v1/notify/act';
 const CHAT_ORIGINS=new Set(['https://claude.ai','https://chatgpt.com']);
 const clean=(value,limit)=>typeof value==='string'?value.slice(0,limit):'';
 function destination(value,scope=APP_SCOPE){
  if(typeof value!=='string'||!value||value.length>2048||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value))return null;
  try{
   const url=new URL(value,scope),base=new URL(scope);
   if(url.username||url.password)return null;
   if(CHAT_ORIGINS.has(url.origin)&&url.protocol==='https:')return {url:url.href,chat:true};
   if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
   return {url:url.href,chat:false};
  }catch{return null;}
 }
 function parsePayload(value,scope=APP_SCOPE){
  if(!value||typeof value!=='object'||value.v!==1)return null;
  const target=destination(value.url,scope);
  const id=typeof value.id==='number'&&Number.isSafeInteger(value.id)&&value.id>0?String(value.id):clean(value.id,128);
  if(!target||!id||!clean(value.title,140))return null;
  const actions=Array.isArray(value.actions)?value.actions.slice(0,2).filter(action=>
   action&&typeof action==='object'&&typeof action.action==='string'&&typeof action.title==='string'
  ).map(action=>({
   action:clean(action.action,64),title:clean(action.title,48),
   url:destination(action.url||value.url,scope)?.url||target.url,
   token:clean(action.token,4096),
  })):[];
  const timestamp=Number.isFinite(Number(value.ts))?Number(value.ts):Date.parse(value.ts);
  return {id,kind:clean(value.kind,64),tag:clean(value.tag,128)||id,
   title:clean(value.title,140),body:clean(value.body,280),url:target.url,
   actions,ts:Number.isFinite(timestamp)?timestamp:Date.now(),
   openToken:clean(value.openToken,4096),dismissToken:clean(value.dismissToken,4096)};
 }
 function notificationOptions(payload){
  return {body:payload.body,tag:payload.tag,renotify:false,
   icon:'/lemma/icons/lemma-192.png',badge:'/lemma/icons/badge-96.png',
   lang:'en-GB',dir:'ltr',timestamp:payload.ts,
   actions:payload.actions.slice(0,2).map(({action,title})=>({action,title})),
   data:{id:payload.id,kind:payload.kind,url:payload.url,ts:payload.ts,
    actions:payload.actions.slice(0,2),openToken:payload.openToken,dismissToken:payload.dismissToken}};
 }
 function clickDecision(data,action='',scope=APP_SCOPE){
  const chosen=Array.isArray(data?.actions)?data.actions.find(item=>item.action===action):null;
  const passive=Array.isArray(data?.actions)?data.actions.find(item=>item.action==='open'):null;
  const target=destination(chosen?.url||data?.url,scope);
  if(!target)return null;
  return {url:target.url,chat:target.chat,token:clean(chosen?.token||(action?'':data?.openToken||passive?.token),4096),
   action:clean(action,64)};
 }
 function dismissToken(data){
  const action=Array.isArray(data?.actions)?data.actions.find(item=>item.action==='dismiss'):null;
  return clean(data?.dismissToken||action?.token,4096);
 }
 root.LemmaPushCore=Object.freeze({APP_SCOPE,ACT_URL,destination,parsePayload,notificationOptions,clickDecision,dismissToken});
})(globalThis);
