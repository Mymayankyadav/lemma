import {useStudyUi} from '../../../data/StudyUiRelease';
import {useLayoutEffect,useRef} from 'react';

/** These forms keep their existing cancel/save handlers while the browser manages modal focus and inert siblings. */
export function useAtlasDialog(){
 const studyRepair=useStudyUi();
 const ref=useRef<HTMLDialogElement>(null),managed=studyRepair;
 useLayoutEffect(()=>{
  const dialog=ref.current;
  if(!managed||!dialog)return;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  return ()=>{
   if(typeof dialog.close==='function'&&dialog.open)dialog.close();
   if(opener?.isConnected)opener.focus({preventScroll:true});
  };
 },[managed]);
 return {ref,open:managed?undefined:true};
}
