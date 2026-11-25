import {authGeneration,authOwner,onAccountChange} from '../../data/authBoundary';
import {getDemoProfile,getMode} from '../../data/mode';

/** A render/write belongs to one account session, including sign-out and demo transitions. */
export function recentSession():string {
 return JSON.stringify(getMode()==='demo'?['demo',getDemoProfile()]:['live',authOwner(),authGeneration()]);
}
export function subscribeRecentSession(update:()=>void):()=>void {
 const release=onAccountChange(update);
 window.addEventListener('storage',update);window.addEventListener('popstate',update);
 return ()=>{release();window.removeEventListener('storage',update);window.removeEventListener('popstate',update);};
}
/** Old keys have no owner provenance, so never migrate their private titles to a signed-in user. */
export function recentStorageKey(base:string,expectedSession=recentSession()):string|null {
 try {localStorage.removeItem(base);}catch{/* Unowned history is never read, even if removal is unavailable. */}
 if(expectedSession!==recentSession())return null;
 const owner=authOwner();
 if(getMode()==='live'&&!owner)return null;
 return base+':v2:'+JSON.stringify(getMode()==='demo'?['demo',getDemoProfile()]:['live',owner]);
}
