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
let worker:Worker|null=null,nextId=1;
const pending=new Map<number,{resolve:(result:LayoutResult)=>void;reject:(error:Error)=>void}>();

export function layoutInput(model:AtlasModel,seed='lemma-atlas'):LayoutInput{
 return {ids:model.stars.map(star=>star.id),clusters:model.stars.map(star=>star.cluster),clusterCount:Math.max(...model.stars.map(star=>star.cluster+1),0),
  radii:model.stars.map(star=>star.radius),edges:model.edges.map(edge=>[edge.from,edge.to,edge.kind==='prereq'?1:0]),
  pins:model.stars.map(star=>star.pin?[star.pin[0],star.pin[1]]:null),seed};
}
function remember(result:LayoutResult):LayoutResult{
 cache.delete(result.key);cache.set(result.key,result);
 while(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value as string);
 return result;
}
function ensureWorker():Worker|null{
 if(worker||typeof Worker==='undefined')return worker;
 try{
  worker=new Worker(new URL('./layout.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<{id:number;result?:LayoutResult;error?:string}>)=>{
   const job=pending.get(event.data.id);if(!job)return;pending.delete(event.data.id);
   if(event.data.result)job.resolve(event.data.result);else job.reject(new Error(event.data.error??'layout failed'));
  };
  worker.onerror=()=>{for(const job of pending.values())job.reject(new Error('layout worker failed'));pending.clear();worker?.terminate();worker=null;};
 }catch{worker=null;}
 return worker;
}
export async function computeLayout(input:LayoutInput):Promise<{result:LayoutResult;source:LayoutSource}>{
 const key=layoutKey(input),hit=cache.get(key);
 if(hit)return {result:remember(hit),source:'cache'};
 const thread=ensureWorker();
 if(thread){
  try{
   const result=await new Promise<LayoutResult>((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});thread.postMessage({id,input});});
   return {result:remember(result),source:'worker'};
  }catch{/* fall through to the main thread */}
 }
 await new Promise(resolve=>setTimeout(resolve,0));
 return {result:remember(layoutAtlas(input)),source:'main'};
}
/** Test hook: forget cached layouts. */
export function clearLayoutCache():void{cache.clear();}
