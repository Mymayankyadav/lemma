import {layoutAtlas,type LayoutInput} from './layout';

/** Off-main-thread Atlas layout: one request in, one result out. The project
 * compiles against the DOM library, so the worker scope is typed narrowly here. */
const scope=self as unknown as {
 onmessage:((event:MessageEvent<{id:number;input:LayoutInput}>)=>void)|null;
 postMessage:(message:unknown)=>void;
};
scope.onmessage=event=>{
 const {id,input}=event.data;
 try{scope.postMessage({id,result:layoutAtlas(input)});}
 catch(error){scope.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
