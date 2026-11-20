import {useEffect,useRef,useState,type ReactNode} from 'react';

export function FirstUseHint({name,children,active=true}: {name:string;children:ReactNode;active?:boolean}) {
  const storageKey='lemma.v7.hint.'+name;
  const uses=()=>{
    try{return Number(localStorage.getItem(storageKey)??0);}
    catch{return 0;}
  };
  const [visible]=useState(()=>uses()<3),counted=useRef(false);
  useEffect(()=>{
    if(!active||!visible||counted.current)return;
    counted.current=true;
    try{localStorage.setItem(storageKey,String(uses()+1));}catch{/* The hint remains usable with storage disabled. */}
  },[storageKey,visible,active]);
  return visible&&active ? <>{children}</> : null;
}
