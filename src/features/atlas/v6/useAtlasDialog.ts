import {useStudyUi} from '../../../data/StudyUiRelease';
import {useLayoutEffect,useRef} from 'react';

/** These forms keep their existing cancel/save handlers while the browser manages inert siblings. */
export function useAtlasDialog(){
 const studyRepair=useStudyUi();
 const ref=useRef<HTMLDialogElement>(null),managed=studyRepair;
 useLayoutEffect(()=>{
  const dialog=ref.current;
  if(!managed||!dialog)return;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  // Native modal dialogs can still send Tab from the last control to browser
  // chrome. Keep both keyboard directions in the active form until it closes.
  const containTab=(event:KeyboardEvent)=>{
   if(event.key!=='Tab'||event.defaultPrevented)return;
   const controls=Array.from(dialog.querySelectorAll<HTMLElement>('button,a[href],input,textarea,select,[tabindex]'))
    .filter(control=>control.tabIndex>=0&&!control.matches(':disabled')&&control.getClientRects().length>0);
   const first=controls[0],last=controls[controls.length-1];
   if(!first){event.preventDefault();dialog.focus();return;}
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){
    event.preventDefault();last.focus();
   }else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  dialog.addEventListener('keydown',containTab);
  return ()=>{
   dialog.removeEventListener('keydown',containTab);
   if(typeof dialog.close==='function'&&dialog.open)dialog.close();
   if(opener?.isConnected)opener.focus({preventScroll:true});
  };
 },[managed]);
 return {ref,open:managed?undefined:true};
}
