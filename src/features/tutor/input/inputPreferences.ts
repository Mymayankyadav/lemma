import {useSyncExternalStore} from 'react';
import {authGeneration,authOwner,onAccountChange} from '../../../data/authBoundary';
import {getDemoProfile,getMode} from '../../../data/mode';
import {subscribeTutorLocalCleanup,tutorLocalScopeActive,writeTutorLocal} from '../../../data/tutor/local-storage';

const preferenceChange='lemma:tutor-input-preferences';
const recognition=1, automatic=2;

function key() {
 const owner=authOwner();
 if(getMode()!=='live')return 'lemma.demo-tutor.input.v1:'+getDemoProfile();
 return owner?'lemma.tutor.draft:'+JSON.stringify([owner,'input','preferences'])+':input-assist':null;
}
function snapshot() {
 const storageKey=key(),owner=authOwner(),generation=authGeneration();
 if(!storageKey||getMode()==='live'&&(!owner||!tutorLocalScopeActive({ownerId:owner,generation})))return 0;
 try {
  const stored=localStorage.getItem(storageKey);
  return stored==='1'||stored==='2'||stored==='3'?Number(stored):0;
 }catch{return 0;}
}
function subscribe(update:()=>void) {
 const releaseAuth=onAccountChange(update),releaseCleanup=subscribeTutorLocalCleanup(update);
 window.addEventListener(preferenceChange,update);
 window.addEventListener('storage',update);
 return ()=>{
  releaseAuth();releaseCleanup();
  window.removeEventListener(preferenceChange,update);
  window.removeEventListener('storage',update);
 };
}
function change(bit:number, enabled:boolean) {
 const storageKey=key(),owner=authOwner(),generation=authGeneration();
 if(!storageKey)return false;
 const previous=snapshot(),next=enabled?previous|bit:previous&~bit;
 try {
  if(getMode()==='live'&&owner)writeTutorLocal({ownerId:owner,generation},storageKey,String(next));
  else localStorage.setItem(storageKey,String(next));
  window.dispatchEvent(new Event(preferenceChange));
  return true;
 }catch{return false;}
}
export function useTutorInputPreferences() {
 const bits=useSyncExternalStore(subscribe,snapshot,()=>0);
 return {recognition:Boolean(bits&recognition),automatic:Boolean(bits&automatic)};
}
export const setTutorRecognition=(enabled:boolean)=>change(recognition,enabled);
export const setTutorAutomatic=(enabled:boolean)=>change(automatic,enabled);
