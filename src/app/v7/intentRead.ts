import {surfaceBetaEnabled} from '../surfaceBeta';
import {authGeneration} from '../../data/authBoundary';
import {getDemoProfile,getMode} from '../../data/mode';

/** Reuse a recent intent read once. Later screen reloads still ask the API for fresh data. */
export function createIntentRead<T,P>(load:(params:P)=>Promise<T>,key:(params:P)=>string){
 let pending:{identity:string;key:string;expires:number;result:Promise<T>;timer:number}|undefined;
 const identity=()=>getMode()==='demo'?'demo:'+getDemoProfile():'live:'+authGeneration();
 const fresh=(params:P)=>pending?.identity===identity()&&pending.key===key(params)&&pending.expires>Date.now()?pending:undefined;
 const clear=()=>{if(pending){window.clearTimeout(pending.timer);pending=undefined;}};
 return {
  warm(params:P){
   if(!surfaceBetaEnabled()||navigator.onLine===false||fresh(params))return;
   clear();
   const result=load(params),timer=window.setTimeout(clear,5000);
   pending={identity:identity(),key:key(params),expires:Date.now()+5000,result,timer};
   void result.catch(()=>{if(pending?.result===result)clear();});
  },
  read(params:P){
   const result=surfaceBetaEnabled()?fresh(params)?.result:undefined;
   clear();
   return result??load(params);
  },
  invalidate:clear,
 };
}
