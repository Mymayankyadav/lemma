import {lazy, type ComponentType} from 'react';

const delays=[500,1500];
let attemptNumber=0;

function moduleUrl(error:unknown):URL|null {
 const message=error instanceof Error?error.message:'';
 if(!/failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i.test(message))return null;
 const source=message.match(/(?:https?|capacitor):\/\/[^\s)]+/)?.[0];
 if(!source)return null;
 try{
  const url=new URL(source);
  return url.protocol===window.location.protocol&&url.host===window.location.host&&/\.[cm]?[jt]sx?$/.test(url.pathname)?url:null;
 }catch{return null;}
}

/** Cache a successful import and share the same retry budget across intent and rendering. */
export function createLazyModule<T>(load:()=>Promise<T>){
 let pending:Promise<T>|undefined;
 let failedUrl:URL|null=null;
 const read=()=>pending??=retry().catch(error=>{pending=undefined;throw error;});
 async function retry():Promise<T>{
  for(let attempt=0;;attempt++){
   try{
    if(failedUrl){
     // A browser may remember the rejected module fetch for this document.
     const url=new URL(failedUrl);
     url.searchParams.set('lemma-retry',String(++attemptNumber));
     return await import(/* @vite-ignore */ url.href) as T;
    }
    return await load();
   }catch(error){
    if(typeof window!=='undefined')failedUrl=moduleUrl(error)??failedUrl;
    if(attempt===delays.length)throw error;
    await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
   }
  }
 }
 return {read,warm:()=>{void read().catch(()=>undefined);}};
}

export function retryLazy<P>(load:()=>Promise<{default:ComponentType<P>}>){
 return lazy(createLazyModule(load).read);
}

export function retryNamed<T,P>(load:()=>Promise<T>,select:(module:T)=>ComponentType<P>){
 const chunk=createLazyModule(load);
 return lazy(()=>chunk.read().then(module=>({default:select(module)})));
}

/** Warm after paint so speculative downloads never hold up the initial render. */
export function afterPaintOnIdle(run:()=>void){
 const supportsIdle=typeof window.requestIdleCallback==='function';
 let task:number|undefined;
 const frame=requestAnimationFrame(()=>{
  task=supportsIdle?window.requestIdleCallback(run,{timeout:2000}):window.setTimeout(run,300);
 });
 return ()=>{
  cancelAnimationFrame(frame);
  if(task!==undefined){if(supportsIdle)window.cancelIdleCallback(task);else window.clearTimeout(task);}
 };
}
