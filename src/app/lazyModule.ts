import {createElement, lazy, type ComponentProps, type ComponentType} from 'react';

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
 let pending:Promise<T>|undefined, resolved:T|undefined;
 let failedUrl:URL|null=null;
 const read=()=>pending??=retry().then(module=>{resolved=module;return module;}).catch(error=>{pending=undefined;throw error;});
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
 return {read,peek:()=>resolved,warm:()=>{void read().catch(()=>undefined);}};
}

const failedComponents=new Set<()=>void>();

/** React.lazy keeps a rejected promise even when the module loader can read again. */
export function resetFailedLazyComponents(){
 for(const reset of failedComponents)reset();
 failedComponents.clear();
}

type ImportableComponent=ComponentType<any>;

export function lazyFromModule<C extends ImportableComponent>(read:()=>Promise<{default:C}>){
 const load=()=>read().catch(error=>{
  failedComponents.add(reset);
  throw error;
 });
 let Body=lazy(load);
 function reset(){Body=lazy(load);}
 return function RetryableComponent(props:ComponentProps<typeof Body>){return createElement(Body,props);};
}

export function retryLazy<C extends ImportableComponent>(load:()=>Promise<{default:C}>){
 return lazyFromModule(createLazyModule(load).read);
}

export function retryNamed<T,C extends ImportableComponent>(load:()=>Promise<T>,select:(module:T)=>C){
 const chunk=createLazyModule(load);
 return lazyFromModule<C>(()=>chunk.read().then(module=>({default:select(module)})));
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
