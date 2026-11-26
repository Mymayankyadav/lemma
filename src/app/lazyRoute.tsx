import {lazy,Suspense,useState,type ComponentType} from 'react';
import {useLoaderData,useRevalidator,type RouteObject} from 'react-router';
import RouteError,{RouteErrorScreen,RouteFallback} from './RouteError';
import {surfaceBetaEnabled} from './surfaceBeta';

type RouteModule={default:ComponentType};
type RouteChunk={read:()=>Promise<RouteModule>};
const failed={routeChunkFailed:true} as const;
type LoadResult=typeof failed|null;
export const isRouteChunkFailure=(data:unknown)=>Boolean(data&&typeof data==='object'&&'routeChunkFailed' in data);

/** Share evaluation between the browser's loader and the instant-navigation fallback. */
export function lazyRoute(path:string,chunk:RouteChunk,prepare?:()=>Promise<unknown>):RouteObject{
 let loaded:ComponentType|undefined;
 async function load(){
  if(loaded)return loaded;
  const [module]=await Promise.all([chunk.read(),prepare?.()]);
  loaded=module.default;
  return loaded;
 }
 function RetryRoute(){
  const revalidator=useRevalidator();
  const [Screen,setScreen]=useState<ComponentType|null>(null),[busy,setBusy]=useState(false);
  async function retry(){
   if(busy)return;
   setBusy(true);
   try{const Loaded=await load();setScreen(()=>Loaded);void revalidator.revalidate();}
   catch{/* Leave the local recovery action available. */}
   finally{setBusy(false);}
  }
  return Screen?<Screen/>:<RouteErrorScreen onRetry={()=>{void retry();}} busy={busy}/>;
 }
 const LazyBody=lazy(async()=>{
  try{return {default:await load()};}
  catch{return {default:RetryRoute};}
 });
 function Screen(){
  const result=useLoaderData<LoadResult>();
  // The current component stays mounted when Settings toggles Beta testing.
  const [Body]=useState<ComponentType>(()=>loaded??LazyBody);
  if(result?.routeChunkFailed&&!loaded)return <RetryRoute/>;
  return <Suspense fallback={<RouteFallback/>}><Body/></Suspense>;
 }
 return {path,errorElement:<RouteError/>,Component:Screen,
  loader:():LoadResult|Promise<LoadResult>=>surfaceBetaEnabled()
   ?load().then(()=>null,()=>failed)
   :null};
}

export function eagerRoute(path:string,Component:ComponentType):RouteObject{
 return {path,Component,errorElement:<RouteError/>};
}
