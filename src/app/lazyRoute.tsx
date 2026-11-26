import {useState,type ComponentType} from 'react';
import type {RouteObject} from 'react-router';
import RouteError,{RouteErrorScreen} from './RouteError';

type RouteModule={default:ComponentType};
type RouteChunk={read:()=>Promise<RouteModule>};

/** React Router keeps the committed outlet visible until this import resolves. */
export function lazyRoute(path:string,chunk:RouteChunk,prepare?:()=>Promise<unknown>):RouteObject{
 async function load(){
  const [module]=await Promise.all([chunk.read(),prepare?.()]);
  return module.default;
 }
 function RetryRoute(){
  const [Screen,setScreen]=useState<ComponentType|null>(null),[busy,setBusy]=useState(false);
  async function retry(){
   if(busy)return;
   setBusy(true);
   try{const Loaded=await load();setScreen(()=>Loaded);}
   catch{/* Keep the recovery action available for another attempt. */}
   finally{setBusy(false);}
  }
  return Screen?<Screen/>:<RouteErrorScreen onRetry={()=>{void retry();}} busy={busy}/>;
 }
 return {path,errorElement:<RouteError/>,lazy:async()=>{
  try{return {Component:await load()};}
  // React Router caches its route-level lazy promise, including rejection.
  catch{return {Component:RetryRoute};}
 }};
}

export function eagerRoute(path:string,Component:ComponentType):RouteObject{
 return {path,Component,errorElement:<RouteError/>};
}
