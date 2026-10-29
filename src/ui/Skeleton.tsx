import {useEffect,useState} from 'react';
export interface SkeletonProps{w?:number|string;h?:number|string;radius?:number|string;className?:string}
export function Skeleton({w='100%',h=20,radius='var(--r-s)',className=''}:SkeletonProps){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{const t=window.setTimeout(()=>setVisible(true),300);return()=>window.clearTimeout(t)},[]);
 return visible?<div aria-hidden="true" className={`animate-pulse bg-fill-2 ${className}`} style={{width:w,height:h,borderRadius:radius}}/>:null;
}
export default Skeleton;
