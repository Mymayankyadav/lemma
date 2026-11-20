import {createContext,useCallback,useContext,useEffect,useMemo,useState,useSyncExternalStore,type ReactNode} from 'react';
import {authGeneration,onAccountChange} from './authBoundary';
import {usePlanRelease} from './usePlanRelease';

const StudyRelease=createContext<{released:boolean; observe?:()=>()=>void}>({released:false});

/** Share one release decision with the mounted study surfaces, including portals. */
export function StudyUiRelease({children}:{children:ReactNode}){
 useSyncExternalStore(onAccountChange,authGeneration,authGeneration);
 const [observers,setObservers]=useState(0);
 const observe=useCallback(()=>{
  setObservers(count=>count+1);
  return ()=>setObservers(count=>count-1);
 },[]);
 const released=usePlanRelease('uiRepairV1',observers>0);
 const value=useMemo(()=>({released,observe}),[released,observe]);
 return <StudyRelease.Provider value={value}>{children}</StudyRelease.Provider>;
}

export function useStudyUi():boolean{
 const {released,observe}=useContext(StudyRelease);
 useEffect(()=>observe?.(),[observe]);
 return released;
}
