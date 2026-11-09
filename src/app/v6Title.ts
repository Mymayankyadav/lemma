import {useEffect} from 'react';
import {useLocation} from 'react-router';
import {create} from 'zustand';

/** N110: a detail screen may name the shell header (mockup: the path, session or checkpoint
 * title replaces the generic route title). The override is tied to the route that set it. */
interface HeaderTitle {
 path:string|null;title:string|null;subtitle:string|null;
 set:(path:string|null,title:string|null,subtitle?:string|null)=>void;
}
export const useV6HeaderTitleStore=create<HeaderTitle>(set=>({path:null,title:null,subtitle:null,
 set:(path,title,subtitle=null)=>set({path,title,subtitle})}));

/** #1325: an optional subtitle under the title (mockup Concept map: "2500 concepts · 8000 connections"). */
export function useV6HeaderTitle(title:string|null|undefined,subtitle?:string|null){
 const pathname=useLocation().pathname;
 useEffect(()=>{
  const value=title?.trim()?title:null;
  useV6HeaderTitleStore.getState().set(value?pathname:null,value,value?subtitle?.trim()||null:null);
  return()=>{if(useV6HeaderTitleStore.getState().path===pathname)useV6HeaderTitleStore.getState().set(null,null,null);};
 },[pathname,title,subtitle]);
}

/** The header title for a route: a screen's own title when it set one for this route. */
export function useV6RouteTitle(pathname:string,fallback:string){
 const {path,title}=useV6HeaderTitleStore();
 return path===pathname&&title?title:fallback;
}
export function useV6RouteSubtitle(pathname:string){
 const {path,subtitle}=useV6HeaderTitleStore();
 return path===pathname?subtitle:null;
}
