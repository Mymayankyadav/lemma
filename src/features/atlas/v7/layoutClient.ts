import {layoutAtlas,layoutKey,type LayoutInput,type LayoutResult} from './layout';
import type {AtlasModel} from './model';

/**
 * Computes the Atlas layout off the main thread and caches it until the data changes
 * (the key covers ids, clusters, sizes, links, pins and the seed). Falls back to the
 * main thread when Worker is unavailable or fails.
 */
export type LayoutSource='worker'|'main'|'cache';
const cache=new Map<string,LayoutResult>();
const CACHE_LIMIT=4;
export function layoutInput(model:AtlasModel,seed='lemma-atlas',aspect?:number):LayoutInput{
 return {ids:model.stars.map(star=>star.id),clusters:model.stars.map(star=>star.cluster),clusterCount:Math.max(...model.stars.map(star=>star.cluster+1),0),
  radii:model.stars.map(star=>star.radius),edges:model.edges.map(edge=>[edge.from,edge.to,edge.kind==='prereq'?1:0]),
  pins:model.stars.map(star=>star.pin?[star.pin[0],star.pin[1]]:null),seed,...(aspect&&Math.abs(aspect-1)>.05?{aspect:Math.round(aspect*4)/4}:{})};
}
function remember(result:LayoutResult):LayoutResult{
 cache.delete(result.key);cache.set(result.key,result);
 while(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value as string);
 return result;
}
async function layoutOnWorker(input:LayoutInput,signal?:AbortSignal):Promise<LayoutResult>{
 const worker=new Worker(new URL('./layout.worker.ts',import.meta.url),{type:'module'});
 let abort:()=>void=()=>{};
 try{
  return await new Promise<LayoutResult>((resolve,reject)=>{
   abort=()=>reject(signal?.reason);
   signal?.addEventListener('abort',abort,{once:true});
   worker.onmessage=(event:MessageEvent<{result?:LayoutResult;error?:string}>)=>{
    if(event.data.result)resolve(event.data.result);else reject(new Error(event.data.error??'layout failed'));
   };
   worker.onerror=()=>reject(new Error('layout worker failed'));
   worker.postMessage({id:1,input});
  });
 }finally{
  signal?.removeEventListener('abort',abort);
  worker.terminate();
 }
}

export async function computeLayout(input:LayoutInput,signal?:AbortSignal):Promise<{result:LayoutResult;source:LayoutSource}>{
 signal?.throwIfAborted();
 const key=layoutKey(input),hit=cache.get(key);
 if(hit)return {result:remember(hit),source:'cache'};
 if(typeof Worker!=='undefined'){
  try{
   const result=await layoutOnWorker(input,signal);
   signal?.throwIfAborted();
   return {result:remember(result),source:'worker'};
  }catch{signal?.throwIfAborted();}
 }
 await new Promise(resolve=>setTimeout(resolve,0));
 signal?.throwIfAborted();
 return {result:remember(layoutAtlas(input)),source:'main'};
}
/** Test hook: forget cached layouts. */
export function clearLayoutCache():void{cache.clear();}
