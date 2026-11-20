import {createContext,useContext,useSyncExternalStore,type ReactNode} from 'react';
import {authGeneration,onAccountChange} from './authBoundary';
import {usePlanRelease} from './usePlanRelease';

const StudyRelease=createContext(false);

/** All study surfaces switch together, including those rendered through portals. */
export function StudyUiRelease({children}:{children:ReactNode}){
 useSyncExternalStore(onAccountChange,authGeneration,authGeneration);
 const released=usePlanRelease('uiRepairV1');
 return <StudyRelease.Provider value={released}>{children}</StudyRelease.Provider>;
}
export const useStudyUi=()=>useContext(StudyRelease);
